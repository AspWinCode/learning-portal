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

    # Период характеристик = предыдущий месяц относительно окна сдачи (окно 1–5 числа month/year)
    report_month = month - 1 if month > 1 else 12
    report_year = year if month > 1 else year - 1
    report_first = date(report_year, report_month, 1)
    # Последний день отчётного месяца — включаем всех, кто был в группе в этом месяце
    if report_month == 12:
        report_last = date(report_year, 12, 31)
    else:
        report_last = date(report_year, report_month, monthrange(report_year, report_month)[1])

    # Пары (trainer_id, student_id): тренер — ученик в группе (все группы, все ученики).
    # Включаем всех, кто был в группе в отчётном месяце: добавлен в группу не позднее последнего дня месяца.
    # Не фильтруем по Group.status и Student.status, чтобы видеть полный список (в т.ч. архивные группы/ученики).
    raw_pairs: List[Tuple[int, int, int, Any]] = [
        (tid, sid, gs_id, gs_created)
        for (tid, sid, gs_id, gs_created) in db.query(
            Group.trainer_id,
            GroupStudent.student_id,
            GroupStudent.id,
            GroupStudent.created_at,
        )
        .join(GroupStudent, GroupStudent.group_id == Group.id)
        .join(Student, Student.id == GroupStudent.student_id)
        .all()
    ]
    pairs: List[Tuple[int, int]] = []
    for tid, sid, _gs_id, gs_created in raw_pairs:
        gs_date = gs_created.date() if gs_created else report_first
        if gs_date > report_last:
            continue  # пришёл в группу уже после отчётного месяца
        pairs.append((tid, sid))
    pairs = list({(t, s) for (t, s) in pairs})  # distinct

    trainer_ids = sorted({t for (t, _) in pairs})
    student_ids_from_pairs = {s for (_, s) in pairs}

    # Загружаем всех учеников системы, чтобы в отчёте всегда было по одной строке на каждого (ожидаемо ~79)
    all_students = {s.id: s for s in db.query(Student).all()}
    # Тренеры только по парам (для строк «в группе» и «нет учеников в группах»)
    trainers = {u.id: u for u in db.query(User).filter(User.id.in_(trainer_ids)).all()} if trainer_ids else {}
    students = all_students

    # Характеристики за отчётный период (report_month/report_year)
    if trainer_ids and student_ids_from_pairs:
        chars = db.query(Characteristic).filter(
            Characteristic.month == report_month,
            Characteristic.year == report_year,
            Characteristic.trainer_id.in_(trainer_ids),
            Characteristic.student_id.in_(student_ids_from_pairs),
        ).all()
    else:
        chars = []

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

    # Группируем по student_id: одна строка на ученика (не дублируем при нескольких группах/тренерах)
    student_pairs: Dict[int, List[Tuple[int, Any]]] = {}  # student_id -> [(trainer_id, characteristic_or_none), ...]
    for trainer_id, student_id in pairs:
        student_pairs.setdefault(student_id, []).append((trainer_id, best.get((trainer_id, student_id))))

    rows: List[Dict[str, Any]] = []
    # Сначала строки по ученикам, которые были в группе в отчётном месяце
    for student_id in sorted(student_pairs.keys()):
        student = students.get(student_id)
        pair_list = student_pairs[student_id]
        trainer_names = []
        all_ok = True
        any_characteristic = False
        published_parts = []
        for trainer_id, c in pair_list:
            trainer = trainers.get(trainer_id)
            trainer_names.append(trainer.full_name if trainer else f"#{trainer_id}")
            published_at = getattr(c, "published_at", None) if c else None
            is_approved = bool(c and c.status == CharacteristicStatus.APPROVED)
            is_on_time = bool(is_approved and published_at and window_start <= published_at <= window_end)
            if c:
                any_characteristic = True
            if not is_on_time:
                all_ok = False
            if published_at:
                published_parts.append(published_at.strftime("%d.%m.%Y %H:%M") if hasattr(published_at, "strftime") else str(published_at))

        # Для фронта: один статус по ученику; даты через published_at_aggregate
        first_c = next((c for _, c in pair_list if c is not None), None)
        status_str = first_c.status.value if (first_c and hasattr(first_c.status, "value")) else ("approved" if all_ok and any_characteristic else "missing")
        rows.append({
            "trainer": {"id": None, "full_name": ", ".join(trainer_names)},
            "student": {"id": student_id, "full_name": student.full_name if student else f"#{student_id}"},
            "characteristic": {"status": status_str, "published_at": first_c.published_at.isoformat() if (first_c and getattr(first_c, "published_at", None)) else None},
            "published_at_aggregate": "; ".join(published_parts) if published_parts else None,
            "ok": all_ok and (len(pair_list) == 0 or any_characteristic),
            "window_start": window_start.isoformat(),
            "window_end": window_end.isoformat(),
        })

    # Тренеры без учеников в группах за период — одна строка на тренера
    trainers_with_students = {tid for (tid, _) in pairs}
    for trainer_id in trainer_ids:
        if trainer_id not in trainers_with_students:
            trainer = trainers.get(trainer_id)
            rows.append({
                "trainer": {"id": trainer_id, "full_name": trainer.full_name if trainer else f"#{trainer_id}"},
                "student": {"id": None, "full_name": "— Нет учеников в группах"},
                "characteristic": {"status": "missing", "published_at": None},
                "published_at_aggregate": None,
                "ok": False,
                "window_start": window_start.isoformat(),
                "window_end": window_end.isoformat(),
            })

    # Ученики, которые не были ни в одной группе в отчётном месяце — одна строка на ученика (чтобы в отчёте всегда все 79)
    for student_id in sorted(all_students.keys()):
        if student_id in student_pairs:
            continue
        student = all_students.get(student_id)
        rows.append({
            "trainer": {"id": None, "full_name": "— Не в группе в этом месяце"},
            "student": {"id": student_id, "full_name": student.full_name if student else f"#{student_id}"},
            "characteristic": {"status": "not_in_group", "published_at": None},
            "published_at_aggregate": None,
            "ok": False,
            "window_start": window_start.isoformat(),
            "window_end": window_end.isoformat(),
        })

    # Сортируем: сначала ученики (по имени), потом строки «нет учеников» (по тренеру)
    def row_sort_key(r: Dict[str, Any]) -> tuple:
        student_name = (r["student"].get("full_name") or "").replace("—", "я")
        if r["student"].get("id") is None:
            return ("я", r["trainer"].get("full_name") or "")
        return ("", student_name)
    rows.sort(key=row_sort_key)

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
    include_archived: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin"]))
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

