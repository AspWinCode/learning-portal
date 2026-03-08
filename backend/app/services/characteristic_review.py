"""
Use case: отправка на согласование, одобрение и отклонение характеристики.

Домен: Education.
Источник: BACKEND_REFACTOR_USE_CASES.md.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.models import Characteristic, CharacteristicStatus, CharacteristicTemplate


def submit_characteristic_for_review(
    db: Session,
    characteristic_id: int,
    trainer_id: int,
) -> Characteristic:
    """
    Отправляет характеристику на согласование (draft/rejected -> pending).
    Проверяет принадлежность тренеру и заполнение обязательных полей по шаблону.

    Raises:
        ValueError: характеристика не найдена; не принадлежит тренеру; статус не допускает отправку; не заполнено обязательное поле.
    """
    characteristic = db.query(Characteristic).filter(Characteristic.id == characteristic_id).first()
    if not characteristic:
        raise ValueError("Characteristic not found")
    if characteristic.trainer_id != trainer_id:
        raise ValueError("Characteristic not found")
    if characteristic.status not in (CharacteristicStatus.DRAFT, CharacteristicStatus.REJECTED):
        raise ValueError("Characteristic cannot be submitted from this status")

    active_template = (
        db.query(CharacteristicTemplate)
        .filter(CharacteristicTemplate.is_active == True)
        .first()
    )
    if active_template and isinstance(active_template.fields, list):
        for f in active_template.fields:
            if not f.get("required"):
                continue
            key = f.get("name")
            if not key:
                continue
            value = (characteristic.data or {}).get(key)
            if value is None or (isinstance(value, str) and value.strip() == ""):
                raise ValueError(f"Required field '{key}' is missing")

    characteristic.status = CharacteristicStatus.PENDING
    db.commit()
    db.refresh(characteristic)
    return characteristic


def approve_characteristic(
    db: Session,
    characteristic_id: int,
    comment: Optional[str] = None,
) -> Characteristic:
    """
    Одобряет и публикует характеристику (pending -> approved).

    Raises:
        ValueError: характеристика не найдена; статус не pending.
    """
    characteristic = db.query(Characteristic).filter(Characteristic.id == characteristic_id).first()
    if not characteristic:
        raise ValueError("Characteristic not found")
    if characteristic.status != CharacteristicStatus.PENDING:
        raise ValueError("Characteristic is not pending")

    characteristic.status = CharacteristicStatus.APPROVED
    characteristic.admin_comment = comment
    characteristic.published_at = datetime.utcnow()
    db.commit()
    db.refresh(characteristic)
    return characteristic


def reject_characteristic(
    db: Session,
    characteristic_id: int,
    comment: Optional[str] = None,
) -> Characteristic:
    """
    Отклоняет характеристику (pending -> rejected).

    Raises:
        ValueError: характеристика не найдена; статус не pending.
    """
    characteristic = db.query(Characteristic).filter(Characteristic.id == characteristic_id).first()
    if not characteristic:
        raise ValueError("Characteristic not found")
    if characteristic.status != CharacteristicStatus.PENDING:
        raise ValueError("Characteristic is not pending")

    characteristic.status = CharacteristicStatus.REJECTED
    characteristic.admin_comment = comment
    db.commit()
    db.refresh(characteristic)
    return characteristic
