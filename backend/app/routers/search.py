from typing import List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.database import get_db
from app import auth
from app.schemas import SearchResponse, StudentResponse, GroupResponse, UserResponse
from app.models import Student, Group, User, UserRole, StudentStatus, GroupStudent, GroupStatus

router = APIRouter()


@router.get("/", response_model=SearchResponse)
async def global_search(
    q: str = Query(..., description="Search query"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Глобальный поиск по ФИО Ученика, ФИО Родителя, Названию Группы и ФИО Тренера"""
    search_term = f"%{q}%"

    # ADMIN: полный поиск
    if current_user.role == UserRole.ADMIN:
        students = db.query(Student).filter(Student.full_name.ilike(search_term)).all()
        groups = db.query(Group).filter(Group.name.ilike(search_term)).all()
        trainers = db.query(User).filter(User.full_name.ilike(search_term), User.role == UserRole.TRAINER).all()

        # Родители (по совпадению ФИО ученика или ФИО родителя)
        parent_ids = db.query(Student.parent_id).filter(Student.full_name.ilike(search_term)).distinct().all()
        parents_by_name = db.query(User).filter(User.full_name.ilike(search_term), User.role == UserRole.PARENT).all()
        parents = parents_by_name
        if parent_ids:
            parent_user_ids = [p[0] for p in parent_ids if p and p[0] is not None]
            if parent_user_ids:
                parents = db.query(User).filter(User.id.in_(parent_user_ids)).all() + parents_by_name

        # В поле trainers исторически отдаём "люди" (тренеры + родители)
        return {"students": students, "groups": groups, "trainers": trainers + parents}

    # TRAINER: только свои группы/ученики и родителей этих учеников (+ себя)
    if current_user.role == UserRole.TRAINER:
        students = (
            db.query(Student)
            .join(GroupStudent)
            .join(Group)
            .filter(
                Group.trainer_id == current_user.id,
                Student.status == StudentStatus.ACTIVE,
                Student.full_name.ilike(search_term),
            )
            .distinct()
            .all()
        )
        groups = db.query(Group).filter(Group.trainer_id == current_user.id, Group.name.ilike(search_term)).all()

        # Родители учеников тренера (по совпадению ФИО родителя или ФИО ученика)
        parent_users = (
            db.query(User)
            .join(Student, Student.parent_id == User.id)
            .join(GroupStudent, GroupStudent.student_id == Student.id)
            .join(Group, Group.id == GroupStudent.group_id)
            .filter(
                User.role == UserRole.PARENT,
                Group.trainer_id == current_user.id,
                Student.status == StudentStatus.ACTIVE,
                or_(User.full_name.ilike(search_term), Student.full_name.ilike(search_term)),
            )
            .distinct()
            .all()
        )
        me = [current_user] if current_user.full_name and current_user.full_name.lower().find(q.lower()) >= 0 else []
        return {"students": students, "groups": groups, "trainers": me + parent_users}

    # PARENT: только свои активные ученики и их группы/тренер
    if current_user.role == UserRole.PARENT:
        students = db.query(Student).filter(
            Student.parent_id == current_user.id,
            Student.status == StudentStatus.ACTIVE,
            Student.full_name.ilike(search_term),
        ).all()

        groups = (
            db.query(Group)
            .join(GroupStudent)
            .join(Student)
            .filter(
                Student.parent_id == current_user.id,
                Student.status == StudentStatus.ACTIVE,
                Group.status == GroupStatus.ACTIVE,
                Group.name.ilike(search_term),
            )
            .distinct()
            .all()
        )
        # не раскрываем всех учеников группы родителю
        for g in groups:
            try:
                g.students = [s for s in (g.students or []) if s.parent_id == current_user.id and s.status == StudentStatus.ACTIVE]
            except Exception:
                g.students = []

        trainers = (
            db.query(User)
            .join(Group, Group.trainer_id == User.id)
            .join(GroupStudent, GroupStudent.group_id == Group.id)
            .join(Student, Student.id == GroupStudent.student_id)
            .filter(
                User.role == UserRole.TRAINER,
                Student.parent_id == current_user.id,
                Student.status == StudentStatus.ACTIVE,
                or_(User.full_name.ilike(search_term), Student.full_name.ilike(search_term)),
            )
            .distinct()
            .all()
        )

        return {"students": students, "groups": groups, "trainers": trainers}

    # Fallback: ничего не отдаём
    return {"students": [], "groups": [], "trainers": []}

