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
from datetime import datetime, timezone

router = APIRouter()


@router.get("/characteristics-compliance")
async def characteristics_compliance_report(
    month: int,
    year: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin"]))
):
    """
    Контроль сдачи характеристик по месяцам для админа.

    Логика:
    - "успешно" = характеристика имеет status=approved и published_at попадает в окно 1..5 числа выбранного месяца (включительно).
    - иначе = красный (нет / поздно / не опубликовано).

    Отчёт строится по связке "тренер группы -> ученик в группе" для активных групп/учеников.
    """
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="month must be 1..12")
    if year < 2000 or year > 2100:
        raise HTTPException(status_code=400, detail="year must be reasonable")

    # Окно в UTC, чтобы сравнивать с published_at (timezone-aware из БД)
    window_start = datetime(year, month, 1, 0, 0, 0, tzinfo=timezone.utc)
    window_end = datetime(year, month, 5, 23, 59, 59, tzinfo=timezone.utc)

    # Все пары (trainer_id, student_id), за которых тренер отвечает в этом месяце (по активным группам)
    pairs: List[Tuple[int, int]] = [
        (tid, sid) for (tid, sid) in db.query(Group.trainer_id, GroupStudent.student_id)
        .join(GroupStudent, GroupStudent.group_id == Group.id)
        .join(Student, Student.id == GroupStudent.student_id)
        .filter(
            Group.status == GroupStatus.ACTIVE,
            Student.status == StudentStatus.ACTIVE,
        )
        .distinct()
        .all()
    ]

    if not pairs:
        return {
            "month": month,
            "year": year,
            "window_start": window_start.isoformat(),
            "window_end": window_end.isoformat(),
            "rows": [],
        }

    trainer_ids = sorted({t for (t, _) in pairs})
    student_ids = sorted({s for (_, s) in pairs})

    trainers = {u.id: u for u in db.query(User).filter(User.id.in_(trainer_ids)).all()}
    students = {s.id: s for s in db.query(Student).filter(Student.id.in_(student_ids)).all()}

    # Характеристики за период по этим парам (берём все и выбираем "лучшую" по приоритету статуса)
    chars = db.query(Characteristic).filter(
        Characteristic.month == month,
        Characteristic.year == year,
        Characteristic.trainer_id.in_(trainer_ids),
        Characteristic.student_id.in_(student_ids),
    ).all()

    # status priority: approved > pending > draft > rejected (fallback)
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
        if not prev:
            best[k] = c
            continue
        if priority.get(c.status, 0) > priority.get(prev.status, 0):
            best[k] = c
        elif priority.get(c.status, 0) == priority.get(prev.status, 0):
            # tie-breaker: later updated/created
            prev_ts = prev.updated_at or prev.created_at
            cur_ts = c.updated_at or c.created_at
            if cur_ts and prev_ts and cur_ts > prev_ts:
                best[k] = c

    rows: List[Dict[str, Any]] = []
    for trainer_id, student_id in sorted(pairs, key=lambda x: (x[0], x[1])):
        trainer = trainers.get(trainer_id)
        student = students.get(student_id)
        c = best.get((trainer_id, student_id))

        published_at = getattr(c, "published_at", None) if c else None
        is_approved = bool(c and c.status == CharacteristicStatus.APPROVED)
        is_on_time = bool(is_approved and published_at and window_start <= published_at <= window_end)

        rows.append({
            "trainer": {"id": trainer_id, "full_name": trainer.full_name if trainer else f"#{trainer_id}"},
            "student": {"id": student_id, "full_name": student.full_name if student else f"#{student_id}"},
            "characteristic": None if not c else {
                "id": c.id,
                "status": c.status.value if hasattr(c.status, "value") else str(c.status),
                "published_at": published_at.isoformat() if published_at else None,
            },
            "ok": is_on_time,
            "window_start": window_start.isoformat(),
            "window_end": window_end.isoformat(),
        })

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
    current_user: User = Depends(auth.require_role(["admin"]))
):
    """Отчет по ученикам"""
    students = db.query(Student).offset(skip).limit(limit).all()
    return {
        "total": db.query(Student).count(),
        "students": students
    }


@router.get("/trainers")
async def get_trainers_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin"]))
):
    """Расширенная отчетность по тренерам"""
    from app.models import User as UserModel, UserRole, Group, Grade
    
    trainers = db.query(UserModel).filter(UserModel.role == UserRole.TRAINER).all()
    
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
    current_user: User = Depends(auth.require_role(["admin"]))
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
    current_user: User = Depends(auth.require_role(["admin"]))
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
    if current_user.role == UserRole.PARENT:
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

