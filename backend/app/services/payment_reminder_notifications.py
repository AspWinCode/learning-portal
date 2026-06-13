from datetime import date, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.models import Student, StudentCard, StudentStatus
from app.services.communication_hub import CommunicationService
from app.student_display import get_student_display_name
from app.utils.datetime import utcnow


REMINDER_DAYS_BEFORE_PAYMENT = 3


def enqueue_upcoming_payment_reminders(db: Session, today: Optional[date] = None) -> int:
    if today is None:
        today = date.today()

    target_date = today + timedelta(days=REMINDER_DAYS_BEFORE_PAYMENT)
    cards = (
        db.query(StudentCard)
        .filter(
            StudentCard.archived.is_(False),
            StudentCard.student_id.isnot(None),
            StudentCard.next_payment_date == target_date,
        )
        .all()
    )

    created = 0
    for card in cards:
        student = db.query(Student).filter(Student.id == card.student_id).first()
        if not student or student.status == StudentStatus.ARCHIVED:
            continue

        amount = None
        abonement = getattr(card, "abonement", None)
        if not abonement and getattr(card, "abonement_id", None):
            from app.models import Abonement

            abonement = db.query(Abonement).filter(Abonement.id == card.abonement_id).first()
        if abonement and getattr(abonement, "price", None) is not None:
            amount = f"{float(abonement.price):.0f}"

        queue_item = CommunicationService.send(
            db,
            channel="email",
            recipient_type="student",
            recipient_id=student.id,
            event_key="payment_reminder",
            context={
                "student_name": get_student_display_name(db, student),
                "amount": amount or "—",
                "lesson_date": target_date.isoformat(),
            },
            dedupe_key=f"payment_reminder:{student.id}:{target_date.isoformat()}",
        )
        if queue_item.created_at and queue_item.created_at.date() == utcnow().date():
            created += 1

    return created
