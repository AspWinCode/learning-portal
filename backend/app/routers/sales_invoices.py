from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app import auth
from app.database import get_db
from app.models import Abonement, Invoice, InvoiceStatus, Lead, LeadStatus, User, UserRole
from app.routers.action_log import log_action
from app.schemas.sales import InvoiceCreate, InvoiceResponse
from app.utils.datetime import utcnow

router = APIRouter()


def _require_owner_or_admin(lead: Lead, user: User) -> None:
    if auth.resolve_effective_role(user) in (UserRole.ADMIN, UserRole.OWNER, UserRole.SALES):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")


def _add_activity(
    db: Session,
    lead_id: int,
    actor_id: int,
    type: str,
    title: str,
    description: Optional[str] = None,
    channel: Optional[str] = None,
    status_effect_from: Optional[str] = None,
    status_effect_to: Optional[str] = None,
    related_task_id: Optional[int] = None,
    related_invoice_id: Optional[int] = None,
    payload_json: Optional[dict] = None,
):
    from app.models import LeadActivity

    activity = LeadActivity(
        lead_id=lead_id,
        type=type,
        title=title,
        description=description,
        channel=channel,
        created_by=actor_id,
        status_effect_from=status_effect_from,
        status_effect_to=status_effect_to,
        related_task_id=related_task_id,
        related_invoice_id=related_invoice_id,
        payload_json=payload_json,
    )
    db.add(activity)
    return activity


def _compute_price(abonement: Abonement) -> float:
    return round(abonement.price or 0.0, 2)


@router.post("/leads/{lead_id}/invoices", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
async def create_invoice_for_lead(
    lead_id: int,
    payload: InvoiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.manage_invoices")),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)

    abonement = db.query(Abonement).filter(Abonement.id == payload.abonement_id).first()
    if not abonement:
        raise HTTPException(status_code=404, detail="Abonement not found")

    amount = _compute_price(abonement)
    invoice = Invoice(
        lead_id=lead_id,
        abonement_id=abonement.id,
        amount=amount,
        currency=payload.currency or "RUB",
        status=InvoiceStatus.DRAFT,
        email_to=payload.email_to or lead.email,
        link=None,
    )
    db.add(invoice)
    old_status = lead.status.value
    if lead.status not in (LeadStatus.WON, LeadStatus.LOST):
        lead.status = LeadStatus.INVOICE_SENT
    db.flush()
    _add_activity(
        db,
        lead_id,
        current_user.id,
        type="invoice_created",
        title=f"Выставлен счёт на {amount} {payload.currency or 'RUB'}",
        status_effect_from=old_status if old_status != lead.status.value else None,
        status_effect_to=lead.status.value if old_status != lead.status.value else None,
        related_invoice_id=invoice.id,
    )
    db.commit()
    db.refresh(invoice)
    log_action(db, current_user.id, "create", "invoice", invoice.id, {"lead_id": lead_id, "amount": amount})
    return invoice


@router.get("/leads/{lead_id}/invoices", response_model=List[InvoiceResponse])
async def list_invoices_for_lead(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.access")),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)
    return db.query(Invoice).filter(Invoice.lead_id == lead_id).order_by(Invoice.created_at.desc()).all()


@router.post("/leads/{lead_id}/invoices/{invoice_id}/mark-paid", response_model=InvoiceResponse)
async def mark_invoice_paid(
    lead_id: int,
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.manage_invoices")),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)

    invoice = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.lead_id == lead_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if invoice.status == InvoiceStatus.PAID:
        return invoice

    invoice.status = InvoiceStatus.PAID
    _add_activity(
        db,
        lead_id,
        current_user.id,
        type="invoice_paid",
        title=f"Счёт оплачен: {invoice.amount} {invoice.currency}",
        related_invoice_id=invoice.id,
    )
    db.commit()
    db.refresh(invoice)
    log_action(db, current_user.id, "mark_paid", "invoice", invoice.id, {"lead_id": lead_id})
    return invoice


@router.post("/invoices/{invoice_id}/send-email", response_model=InvoiceResponse)
async def send_invoice_email(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.manage_invoices")),
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    lead = db.query(Lead).filter(Lead.id == invoice.lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)

    if not invoice.email_to and not lead.email:
        raise HTTPException(status_code=400, detail="No email to send invoice")

    invoice.status = InvoiceStatus.SENT
    invoice.sent_at = utcnow()
    if lead.status not in (LeadStatus.WON, LeadStatus.LOST):
        lead.status = LeadStatus.INVOICE_SENT
    db.commit()
    db.refresh(invoice)
    log_action(db, current_user.id, "send_email", "invoice", invoice.id, {"lead_id": lead.id})
    return invoice


@router.get("/invoices", response_model=List[InvoiceResponse])
async def list_invoices(
    status_filter: Optional[InvoiceStatus] = None,
    lead_id: Optional[int] = None,
    created_from: Optional[datetime] = Query(default=None),
    created_to: Optional[datetime] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.access")),
):
    query = (
        db.query(Invoice)
        .join(Lead, Lead.id == Invoice.lead_id)
        .options(joinedload(Invoice.lead))
        .order_by(Invoice.created_at.desc())
    )

    if status_filter:
        query = query.filter(Invoice.status == status_filter)
    if lead_id:
        query = query.filter(Invoice.lead_id == lead_id)
    if created_from:
        query = query.filter(Invoice.created_at >= created_from)
    if created_to:
        query = query.filter(Invoice.created_at <= created_to)

    return query.all()
