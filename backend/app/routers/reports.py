from typing import List, Dict, Tuple, Any
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app import auth
from app.models import (
    User, Grade, Student, Characteristic, ActionLog, UserRole,
    GroupStudent, Group, StudentStatus, GroupStatus, CharacteristicStatus
)
from app.schemas import ReportRequest
import io
import csv
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment
from datetime import datetime, timezone, date
from calendar import monthrange

router = APIRouter()

# Окно сдачи: с 1 по 6 число в UTC (для таймзоны проекта можно заменить на Europe/Moscow и конвертировать)


@router.get("/characteristics-compliance")
async def characteristics_compliance_report(
    month: int,
    year: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("reports.access"))
):
    """
    Контроль сдачи характеристик по месяцам для админа.

    - Окно сдачи: с 1 по 6 число выбранного месяца включительно (в таймзоне проекта).
    - Период характеристик: предыдущий месяц.
    - Ответственный тренер: тот, у кого ученик числится на конец отчётного месяца (по left_at).
    - Одна строка = один ученик + один ответственный тренер.
    """
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="month must be 1..12")
    if year < 2000 or year > 2100:
        raise HTTPException(status_code=400, detail="year must be reasonable")

    # Окно сдачи: с 1 по 6 число включительно (UTC; при необходимости заменить на таймзону проекта)
    window_start = datetime(year, month, 1, 0, 0, 0, tzinfo=timezone.utc)
    window_end = datetime(year, month, 6, 23, 59, 59, tzinfo=timezone.utc)

    # Период характеристик = предыдущий месяц
    report_month = month - 1 if month > 1 else 12
    report_year = year if month > 1 else year - 1
    if report_month == 12:
        report_last = date(report_year, 12, 31)
    else:
        report_last = date(report_year, report_month, monthrange(report_year, report_month)[1])
    report_last_end = datetime(report_year, report_month, report_last.day, 23, 59, 59, tzinfo=timezone.utc)

    # Ответственный тренер на конец отчётного месяца: ученик в группе на report_last
    # (created_at <= report_last_end AND (left_at IS NULL OR left_at > report_last_end))
    raw_links = (
        db.query(Group.trainer_id, GroupStudent.student_id, GroupStudent.created_at)
        .join(GroupStudent, GroupStudent.group_id == Group.id)
        .join(Student, Student.id == GroupStudent.student_id)
        .filter(GroupStudent.created_at <= report_last_end)
        .filter(
            (GroupStudent.left_at.is_(None)) | (GroupStudent.left_at > report_last_end)
        )
        .all()
    )
    # Один ответственный тренер на ученика: при нескольких группах — с максимальным created_at
    by_student: Dict[int, List[Tuple[int, Any]]] = {}
    for tid, sid, gs_created in raw_links:
        by_student.setdefault(sid, []).append((tid, gs_created))
    responsible: Dict[int, int] = {}
    _min_dt = datetime.min.replace(tzinfo=timezone.utc)
    for sid, lst in by_student.items():
        best_tid = max(lst, key=lambda x: x[1] if x[1] else _min_dt)[0]
        responsible[sid] = best_tid

    trainer_ids = sorted(set(responsible.values()))
    # В отчёте только активные ученики (архивные не показываем)
    all_students = {s.id: s for s in db.query(Student).filter(Student.status == StudentStatus.ACTIVE).all()}
    trainers = {u.id: u for u in db.query(User).filter(User.id.in_(trainer_ids)).all()} if trainer_ids else {}

    # Характеристики за период по ответственным парам
    chars = []
    if trainer_ids and responsible:
        chars = db.query(Characteristic).filter(
            Characteristic.month == report_month,
            Characteristic.year == report_year,
            Characteristic.trainer_id.in_(trainer_ids),
            Characteristic.student_id.in_(responsible.keys()),
        ).all()

    priority = {
        CharacteristicStatus.APPROVED: 4,
        CharacteristicStatus.PENDING: 3,
        CharacteristicStatus.DRAFT: 2,
        CharacteristicStatus.REJECTED: 1,
    }
    best: Dict[Tuple[int, int], Characteristic] = {}
    for c in chars:
        k = (c.trainer_id, c.student_id)
        prev = best.get(k)
        if not prev or priority.get(c.status, 0) > priority.get(prev.status, 0):
            best[k] = c
        elif priority.get(c.status, 0) == priority.get(prev.status, 0):
            prev_ts = prev.updated_at or prev.created_at
            cur_ts = c.updated_at or c.created_at
            if cur_ts and prev_ts and cur_ts > prev_ts:
                best[k] = c

    rows: List[Dict[str, Any]] = []

    # Строки: ученик + ответственный тренер (одна пара на ученика)
    for student_id in sorted(all_students.keys()):
        student = all_students.get(student_id)
        trainer_id = responsible.get(student_id)
        if trainer_id is None:
            rows.append({
                "trainer": {"id": None, "full_name": "— Не закреплён на конец месяца"},
                "student": {"id": student_id, "full_name": student.full_name if student else f"#{student_id}"},
                "characteristic": {"status": "missing", "published_at": None},
                "published_at_aggregate": None,
                "ok": False,
                "reason": "student_not_assigned_on_report_last",
                "window_start": window_start.isoformat(),
                "window_end": window_end.isoformat(),
            })
            continue

        trainer = trainers.get(trainer_id)
        c = best.get((trainer_id, student_id))
        published_at = getattr(c, "published_at", None) if c else None
        is_approved = bool(c and c.status == CharacteristicStatus.APPROVED)
        in_window = bool(published_at and window_start <= published_at <= window_end)

        if is_approved and in_window:
            reason = "submitted_on_time"
            ok = True
        elif not c:
            reason = "missing"
            ok = False
        elif c.status != CharacteristicStatus.APPROVED:
            reason = "not_approved"
            ok = False
        elif not in_window and published_at:
            reason = "published_late"
            ok = False
        else:
            reason = "missing"
            ok = False

        status_str = c.status.value if (c and hasattr(c.status, "value")) else "missing"
        published_agg = published_at.strftime("%d.%m.%Y %H:%M") if (published_at and hasattr(published_at, "strftime")) else None

        rows.append({
            "trainer": {"id": trainer_id, "full_name": trainer.full_name if trainer else f"#{trainer_id}"},
            "student": {"id": student_id, "full_name": student.full_name if student else f"#{student_id}"},
            "characteristic": {"status": status_str, "published_at": published_at.isoformat() if published_at else None},
            "published_at_aggregate": published_agg,
            "ok": ok,
            "reason": reason,
            "window_start": window_start.isoformat(),
            "window_end": window_end.isoformat(),
        })

    rows.sort(key=lambda r: ((r["student"].get("full_name") or "").replace("—", "я")))

    return {
        "month": month,
        "year": year,
        "window_start": window_start.isoformat(),
        "window_end": window_end.isoformat(),
        "rows": rows,
    }


@router.get("/students")
async def get_students_report(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("reports.access"))
):
    """Отчет по ученикам"""
    students = db.query(Student).offset(skip).limit(limit).all()
    return {
        "total": db.query(Student).count(),
        "students": students
    }


@router.get("/trainers")
async def get_trainers_report(
    include_archived: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("reports.access"))
):
    """Расширенная отчетность по тренерам. По умолчанию архивные (is_active=False) исключены."""
    from app.models import User as UserModel, UserRole, Group, Grade
    
    q = db.query(UserModel).filter(UserModel.role == UserRole.TRAINER)
    if not include_archived:
        q = q.filter(UserModel.is_active.is_(True))
    trainers = q.all()
    
    result = []
    for trainer in trainers:
        groups_count = db.query(Group).filter(Group.trainer_id == trainer.id).count()
        grades_count = db.query(Grade).filter(Grade.trainer_id == trainer.id).count()
        
        # Средняя оценка
        avg_grade = db.query(func.avg(Grade.grade)).filter(
            Grade.trainer_id == trainer.id
        ).scalar() or 0
        
        result.append({
            "trainer": {
                "id": trainer.id,
                "full_name": trainer.full_name,
                "email": trainer.email
            },
            "groups_count": groups_count,
            "grades_count": grades_count,
            "average_grade": round(float(avg_grade), 2)
        })
    
    return result


@router.get("/action-logs")
async def get_action_logs(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("reports.access"))
):
    """Журнал действий"""
    logs = db.query(ActionLog).order_by(ActionLog.created_at.desc()).offset(skip).limit(limit).all()
    return {
        "total": db.query(ActionLog).count(),
        "logs": logs
    }


@router.post("/export")
async def export_report(
    report_request: ReportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("reports.export"))
):
    """Экспорт отчетов (XLSX/CSV)"""
    # Получаем данные
    query = db.query(Grade)
    
    if report_request.student_ids:
        query = query.filter(Grade.student_id.in_(report_request.student_ids))
    if report_request.trainer_ids:
        query = query.filter(Grade.trainer_id.in_(report_request.trainer_ids))
    if report_request.start_date:
        query = query.filter(Grade.created_at >= report_request.start_date)
    if report_request.end_date:
        query = query.filter(Grade.created_at <= report_request.end_date)
    
    grades = query.all()
    
    if report_request.format == "csv":
        # CSV экспорт
        output = io.StringIO()
        writer = csv.writer(output)
        
        writer.writerow(["Student", "Topic", "Grade", "Comment", "Date", "Trainer"])
        for grade in grades:
            writer.writerow([
                grade.student.full_name,
                grade.topic.name,
                grade.grade,
                grade.comment or "",
                grade.date.isoformat(),
                grade.trainer.full_name
            ])
        
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=grades_report.csv"}
        )
    
    else:
        # XLSX экспорт
        wb = Workbook()
        ws = wb.active
        ws.title = "Grades Report"
        
        # Заголовки
        headers = ["Student", "Topic", "Grade", "Comment", "Date", "Trainer"]
        ws.append(headers)
        
        # Стиль заголовков
        for cell in ws[1]:
            cell.font = Font(bold=True)
            cell.alignment = Alignment(horizontal="center")
        
        # Данные
        for grade in grades:
            ws.append([
                grade.student.full_name,
                grade.topic.name,
                grade.grade,
                grade.comment or "",
                grade.date.isoformat(),
                grade.trainer.full_name
            ])
        
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=grades_report.xlsx"}
        )


@router.get("/analytics/grade-dynamics/{student_id}")
async def get_grade_dynamics(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Динамика средней оценки для ученика"""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Проверка прав доступа
    if auth.resolve_effective_role(current_user) == UserRole.PARENT:
        if student.parent_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not enough permissions")
    
    # Группировка по месяцам
    grades = db.query(
        func.date_trunc('month', Grade.date).label('month'),
        func.avg(Grade.grade).label('avg_grade')
    ).filter(
        Grade.student_id == student_id
    ).group_by(
        func.date_trunc('month', Grade.date)
    ).order_by('month').all()
    
    return {
        "student_id": student_id,
        "dynamics": [
            {
                "month": str(month),
                "average_grade": round(float(avg_grade), 2)
            }
            for month, avg_grade in grades
        ]
    }

