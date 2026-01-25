from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app import auth
from app.models import User, Grade, Student, Characteristic, ActionLog, UserRole
from app.schemas import ReportRequest
import io
import csv
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment

router = APIRouter()


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

