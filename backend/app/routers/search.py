from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.database import get_db
from app import auth
from app.schemas.search import (
    SearchResponse,
    PhoneSearchResponse,
    PersonSearchResponse,
    PersonSearchItemResponse,
    PersonLinkedRecordResponse,
    PersonMergeRequest,
    PersonAttachRecordRequest,
)
from app.models import Student, Group, User, UserRole, StudentStatus, GroupStudent, GroupStatus, Lead, StudentCard, Person
from app.utils.phone import normalize_phone
from app.services.person_sync import search_persons, merge_persons, attach_record_to_person

router = APIRouter()


def _require_phone_search_access(current_user: User) -> None:
    auth.ensure_permission(current_user, "persons.access")


def _build_person_search_item(person: Person) -> PersonSearchItemResponse:
    linked_records = []
    for user in person.users or []:
        linked_records.append(
            PersonLinkedRecordResponse(
                entity_type="user",
                entity_id=user.id,
                label=user.full_name,
            )
        )
    for lead in person.leads or []:
        linked_records.append(
            PersonLinkedRecordResponse(
                entity_type="lead",
                entity_id=lead.id,
                label=lead.contact_name,
            )
        )
    for card in person.student_cards or []:
        linked_records.append(
            PersonLinkedRecordResponse(
                entity_type="student_card",
                entity_id=card.id,
                label=card.student_full_name,
            )
        )
    return PersonSearchItemResponse(
        id=person.id,
        full_name=person.full_name,
        email=person.email,
        phone_normalized=person.phone_normalized,
        role_hint=person.role_hint,
        linked_records=linked_records,
    )


@router.get("/", response_model=SearchResponse)
async def global_search(
    q: str = Query(..., description="Search query"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Глобальный поиск по ФИО Ученика, ФИО Родителя, Названию Группы и ФИО Тренера"""
    search_term = f"%{q}%"
    effective_role = auth.resolve_effective_role(current_user)

    # ADMIN/OWNER: полный поиск
    if effective_role in (UserRole.ADMIN, UserRole.OWNER):
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
    if effective_role == UserRole.TRAINER:
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
    if effective_role == UserRole.PARENT:
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


@router.get("/phone", response_model=PhoneSearchResponse)
async def search_by_phone(
    q: str = Query(..., description="Phone for deduplication search"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_phone_search_access(current_user)
    normalized_phone = normalize_phone(q)
    if not normalized_phone:
        return {"normalized_phone": "", "users": [], "leads": [], "student_cards": []}

    users = (
        db.query(User)
        .filter(User.phone_normalized == normalized_phone)
        .order_by(User.id.desc())
        .all()
    )
    leads = (
        db.query(Lead)
        .filter(Lead.phone_normalized == normalized_phone)
        .order_by(Lead.id.desc())
        .all()
    )
    student_cards = (
        db.query(StudentCard)
        .filter(StudentCard.phone_normalized == normalized_phone)
        .order_by(StudentCard.id.desc())
        .all()
    )
    return {
        "normalized_phone": normalized_phone,
        "users": users,
        "leads": leads,
        "student_cards": student_cards,
    }


@router.get("/persons", response_model=PersonSearchResponse)
async def search_person_registry(
    q: str = Query(..., description="Person registry search query"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_phone_search_access(current_user)
    persons = search_persons(db, q)
    return {
        "query": q,
        "items": [_build_person_search_item(person) for person in persons],
    }


@router.get("/persons/{person_id}", response_model=PersonSearchItemResponse)
async def get_person_registry_item(
    person_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_phone_search_access(current_user)
    person = db.query(Person).filter(Person.id == person_id).first()
    if person is None:
        raise HTTPException(status_code=404, detail="Person not found")
    return _build_person_search_item(person)


@router.post("/persons/merge", response_model=PersonSearchItemResponse)
async def merge_person_registry_items(
    payload: PersonMergeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    auth.ensure_permission(current_user, "persons.manage")
    source_person = db.query(Person).filter(Person.id == payload.source_person_id).first()
    target_person = db.query(Person).filter(Person.id == payload.target_person_id).first()
    if source_person is None or target_person is None:
        raise HTTPException(status_code=404, detail="Person not found")
    merged_person = merge_persons(db, source_person=source_person, target_person=target_person)
    db.commit()
    db.refresh(merged_person)
    return _build_person_search_item(merged_person)


@router.post("/persons/attach-record", response_model=PersonSearchItemResponse)
async def attach_record_to_person_registry(
    payload: PersonAttachRecordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    auth.ensure_permission(current_user, "persons.manage")
    person = db.query(Person).filter(Person.id == payload.person_id).first()
    if person is None:
        raise HTTPException(status_code=404, detail="Person not found")
    record = attach_record_to_person(
        db,
        person=person,
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
    )
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    db.commit()
    db.refresh(person)
    return _build_person_search_item(person)

