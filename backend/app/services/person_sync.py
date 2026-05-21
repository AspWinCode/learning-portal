from __future__ import annotations

from typing import Literal, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import Lead, Person, StudentCard, User, UserRole


def _normalize_email(value: Optional[str]) -> Optional[str]:
    email = (value or "").strip().lower()
    return email or None


def _best_person_match(
    db: Session,
    *,
    email: Optional[str],
    phone_normalized: Optional[str],
    full_name: Optional[str],
) -> Optional[Person]:
    if email:
        person = db.query(Person).filter(Person.email == email).order_by(Person.id.asc()).first()
        if person:
            return person
    if phone_normalized:
        person = (
            db.query(Person)
            .filter(Person.phone_normalized == phone_normalized)
            .order_by(Person.id.asc())
            .first()
        )
        if person:
            return person
    if full_name and email is None and phone_normalized is None:
        return (
            db.query(Person)
            .filter(Person.full_name == full_name)
            .order_by(Person.id.asc())
            .first()
        )
    return None


def _merge_person_fields(
    person: Person,
    *,
    full_name: Optional[str],
    email: Optional[str],
    phone_normalized: Optional[str],
    role_hint: Optional[str],
) -> Person:
    if full_name and not (person.full_name or "").strip():
        person.full_name = full_name
    if email and not person.email:
        person.email = email
    if phone_normalized and not person.phone_normalized:
        person.phone_normalized = phone_normalized
    if role_hint and not person.role_hint:
        person.role_hint = role_hint
    return person


def get_or_create_person(
    db: Session,
    *,
    full_name: Optional[str],
    email: Optional[str] = None,
    phone_normalized: Optional[str] = None,
    role_hint: Optional[str] = None,
) -> Optional[Person]:
    normalized_name = (full_name or "").strip()
    normalized_email = _normalize_email(email)
    normalized_phone = (phone_normalized or "").strip() or None
    if not normalized_name and not normalized_email and not normalized_phone:
        return None

    person = _best_person_match(
        db,
        email=normalized_email,
        phone_normalized=normalized_phone,
        full_name=normalized_name or None,
    )
    if person:
        return _merge_person_fields(
            person,
            full_name=normalized_name or None,
            email=normalized_email,
            phone_normalized=normalized_phone,
            role_hint=role_hint,
        )

    person = Person(
        full_name=normalized_name or normalized_email or normalized_phone or "Unknown",
        email=normalized_email,
        phone_normalized=normalized_phone,
        role_hint=role_hint,
    )
    db.add(person)
    db.flush()
    return person


def sync_user_person(db: Session, user: User) -> Optional[Person]:
    role_value = user.role.value if isinstance(user.role, UserRole) else str(user.role or "")
    person = get_or_create_person(
        db,
        full_name=user.full_name,
        email=user.email,
        phone_normalized=user.phone_normalized,
        role_hint=role_value or "user",
    )
    if person:
        user.person_id = person.id
    return person


def sync_lead_person(db: Session, lead: Lead) -> Optional[Person]:
    full_name = (
        (lead.parent_full_name or "").strip()
        or (lead.contact_name or "").strip()
        or (lead.child_full_name or "").strip()
    )
    person = get_or_create_person(
        db,
        full_name=full_name,
        email=lead.email,
        phone_normalized=lead.phone_normalized,
        role_hint="lead",
    )
    if person:
        lead.person_id = person.id
    return person


def sync_student_card_person(db: Session, card: StudentCard) -> Optional[Person]:
    full_name = (
        (card.parent_full_name or "").strip()
        or (card.student_full_name or "").strip()
    )
    person = get_or_create_person(
        db,
        full_name=full_name,
        email=card.parent_email,
        phone_normalized=card.phone_normalized,
        role_hint="student_card",
    )
    if person:
        card.person_id = person.id
    return person


def search_persons(db: Session, query: str) -> list[Person]:
    raw = (query or "").strip()
    if not raw:
        return []
    search_term = f"%{raw.lower()}%"
    return (
        db.query(Person)
        .filter(
            or_(
                Person.full_name.ilike(search_term),
                Person.email.ilike(search_term),
                Person.phone_normalized.ilike(search_term),
            )
        )
        .order_by(Person.full_name.asc(), Person.id.asc())
        .limit(100)
        .all()
    )


def merge_persons(db: Session, *, source_person: Person, target_person: Person) -> Person:
    if source_person.id == target_person.id:
        return target_person

    _merge_person_fields(
        target_person,
        full_name=source_person.full_name,
        email=source_person.email,
        phone_normalized=source_person.phone_normalized,
        role_hint=source_person.role_hint,
    )

    for user in list(source_person.users or []):
        user.person_id = target_person.id
    for lead in list(source_person.leads or []):
        lead.person_id = target_person.id
    for card in list(source_person.student_cards or []):
        card.person_id = target_person.id

    db.delete(source_person)
    db.flush()
    return target_person


def attach_record_to_person(
    db: Session,
    *,
    person: Person,
    entity_type: Literal["user", "lead", "student_card"],
    entity_id: int,
):
    if entity_type == "user":
        record = db.query(User).filter(User.id == entity_id).first()
    elif entity_type == "lead":
        record = db.query(Lead).filter(Lead.id == entity_id).first()
    else:
        record = db.query(StudentCard).filter(StudentCard.id == entity_id).first()

    if record is None:
        return None

    record.person_id = person.id
    _merge_person_fields(
        person,
        full_name=getattr(record, "full_name", None)
        or getattr(record, "parent_full_name", None)
        or getattr(record, "contact_name", None)
        or getattr(record, "student_full_name", None),
        email=getattr(record, "email", None) or getattr(record, "parent_email", None),
        phone_normalized=getattr(record, "phone_normalized", None),
        role_hint=str(getattr(getattr(record, "role", None), "value", getattr(record, "role", None)) or person.role_hint or ""),
    )
    db.flush()
    return record
