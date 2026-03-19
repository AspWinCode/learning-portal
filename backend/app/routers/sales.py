import hashlib
import os
import re
from datetime import date, datetime, timedelta, time as dt_time
from io import BytesIO
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy import and_, case, cast, func, Text, or_, update as sa_update
from openpyxl import Workbook, load_workbook

from app import auth
from app.database import get_db
from app.student_display import get_student_display_name, get_students_display_names
from app.services.parent_invite import create_parent_with_invite, create_parent_user_no_invite
from app.services.finance_ledger import ensure_finance_transaction_for_bank_transaction
from app.services.student_card_conversion import (
    convert_student_card_to_student as student_card_convert,
    StudentCardConvertConflict,
)
from app.services.absence_makeup import assign_makeup_for_absence as absence_makeup_assign
from app.services.manual_lesson import create_manual_lesson as manual_lesson_create
from app.services.bank_operation import apply_bank_operation_to_student as bank_operation_apply
from app.services.payment_status import get_payment_status_list as payment_status_list_svc, get_payment_status_summary as payment_status_summary_svc
from app.services.lead_post_visit import update_lead_post_visit_stage as lead_post_visit_update_stage
from app.models import (
    Lead,
    LeadStatus,
    StudentStatus,
    LeadTask,
    LeadTaskStatus,
    LeadSource,
    LeadTaskTemplate,
    LeadTaskStatusOption as LeadTaskStatusOptionModel,
    LeadInfoTemplate,
    LeadStatusOption,
    LeadCommunication,
    LeadActivity,
    Invoice,
    InvoiceStatus,
    Event,
    EventStatus,
    EventRegistration,
    EventRegistrationStatus,
    Abonement,
    User,
    UserRole,
    AccountTemplate,
    SalesCity,
    SalesSchool,
    SalesClass,
    SalesInstruction,
    SalesInstructionImage,
    StudentCard,
    DiscountType,
    AbsenceFollowUp,
    Student,
    Group,
    GroupSchedule,
    GroupStudent,
    LessonAttendance,
    StudentAccount,
    StudentAccountTransaction,
    StudentAccountTransactionKind,
    TochkaAppliedPayment,
    BankTransaction,
    BankTransactionStatus,
    PhonePaymentBinding,
    Program,
    GroupProgram,
    StudentProgram,
    ProgramMakeupCompatibility,
    StudentFreeze,
    CustomLesson,
    CustomLessonStudent,
    CustomLessonType,
    Task,
    TaskStatus,
)
from app.utils.phone import normalize_phone, validate_phone_for_lead
from app.schemas import (
    LeadCreate,
    LeadUpdate,
    LeadResponse,
    LeadsPaginatedResponse,
    LeadTaskCreate,
    LeadTaskResponse,
    LeadTaskUpdate,
    InvoiceCreate,
    InvoiceResponse,
    EventCreate,
    EventUpdate,
    EventResponse,
    EventRegistrationCreate,
    EventRegistrationResponse,
    LeadSourceCreate,
    LeadSourceResponse,
    LeadSourceUpdate,
    LeadTaskTemplateCreate,
    LeadTaskTemplateResponse,
    LeadTaskTemplateUpdate,
    LeadTaskStatusOptionCreate,
    LeadTaskStatusOptionResponse,
    LeadTaskStatusOptionUpdate,
    LeadImportResponse,
    LeadInfoTemplateCreate,
    LeadInfoTemplateResponse,
    LeadInfoTemplateUpdate,
    LeadStatusOptionCreate,
    LeadStatusOptionResponse,
    LeadStatusOptionUpdate,
    LeadSendInfoRequest,
    SalesCityCreate,
    SalesCityResponse,
    SalesCityUpdate,
    SalesSchoolCreate,
    SalesSchoolResponse,
    SalesSchoolUpdate,
    SalesClassCreate,
    SalesClassResponse,
    SalesClassUpdate,
    AccountTemplateCreate,
    AccountTemplateResponse,
    LeadQuickCommunicationCreate,
    LeadContactResultRequest,
    LeadCommunicationResponse,
    SalesDashboardResponse,
    SalesSchoolConversionItem,
    SalesQueueTaskItem,
    SalesQueueRegistrationItem,
    FollowUpItemResponse,
    LeadPushStatsResponse,
    SalesInstructionCreate,
    SalesInstructionUpdate,
    SalesInstructionResponse,
    StudentCardCreate,
    StudentCardUpdate,
    StudentCardResponse,
    StudentCardImportResponse,
    AbonementResponse,
    AbsenceFollowUpResponse,
    AbsenceFollowUpStageUpdate,
    OpenParentCabinetResponse,
    AnketaConvertRequest,
    AnketaConvertResponse,
    AnketaConvertConflictResponse,
    LeadConvertToStudentResponse,
    LessonCallResultUpdate,
    TochkaImportRequest,
    BankPaymentImportResponse,
    PhonePaymentBindingCreate,
    BankTransactionResponse,
    BankTransactionApplyRequest,
    BankTransactionExpenseCategoryUpdate,
    AbsenceMakeupAssign,
    MakeupSuggestionItem,
    ProgramMakeupCompatibilityResponse,
    ProgramMakeupCompatibilityCreate,
    PaymentStatusItem,
    PaymentStatusSummary,
    StudentFreezeCreate,
    StudentFreezeResponse,
    CloseByFactPreview,
    CloseByFactConfirm,
    LeadPostVisitStageUpdate,
    CustomLessonCreate,
    CustomLessonUpdate,
    CustomLessonResponse,
    SpecialistQuestionnaireRequest,
    SpecialistQuestionnaireResponse,
    TildaLeadRequest,
    TildaLeadResponse,
    LeadActivityResponse,
    LeadTimelineResponse,
    LeadCardResponse,
    LeadNextAction,
    LeadSidebarSummary,
    QuickActionRequest,
    QuickActionResponse,
)
from app.routers.action_log import log_action
from app.services.lead_conversion import convert_lead_to_student as lead_conversion_convert
from app.dependencies import require_sales_admin_owner

router = APIRouter()

# Compatibility layer /api/sales (ТЗ этап 4): CRM + Operations + Finance.
# Бизнес-логика в app.services.*; здесь — проверка прав, вызов сервисов, маппинг ответов.


def _fix_mojibake(s: Optional[str]) -> Optional[str]:
    """
    Восстанавливает строку из битой кодировки (UTF-8, прочитанный как Latin-1/CP1252).
    Для уже нормальных строк остаётся без изменений.
    """
    if not s or not isinstance(s, str):
        return s
    for enc in ("latin1", "cp1252"):
        try:
            fixed = s.encode(enc).decode("utf-8")
            if fixed != s:
                return fixed
        except (UnicodeEncodeError, UnicodeDecodeError):
            continue
    return s


def _fix_lead_strings(lead: Lead) -> Lead:
    """
    Починить самые заметные текстовые поля лида, если они были сохранены кракозябрами.
    Возвращает тот же ORM‑объект (мутабельно), чтобы Pydantic увидел уже исправленные значения.
    """
    for field in [
        "contact_name",
        "phone",
        "parent_full_name",
        "child_full_name",
        "parent_phone",
        "child_phone",
        "email",
        "city",
        "school_name",
        "school_class",
        "source",
        "referral_name",
        "comment",
        "pause_reason",
        "lost_reason",
    ]:
        value = getattr(lead, field, None)
        fixed = _fix_mojibake(value)
        if fixed is not None and fixed != value:
            setattr(lead, field, fixed)
    return lead


def _serialize_time_for_api(t: Optional[dt_time]) -> Optional[str]:
    return t.strftime("%H:%M") if t else None


def _lesson_task_status(lesson_start: datetime, lesson_end: datetime, now: datetime, call_window_min: int = 25) -> str:
    """Статус карточки урока: waiting | soon | in_progress | call_round | completed."""
    if now < lesson_start - timedelta(minutes=15):
        return "waiting"
    if now < lesson_start:
        return "soon"
    if now < lesson_start + timedelta(minutes=10):
        return "in_progress"
    call_end = min(lesson_start + timedelta(minutes=call_window_min), lesson_end)
    if now < call_end:
        return "call_round"
    return "completed"


def _lesson_tasks_for_date(
    db: Session,
    target_date: date,
    now: Optional[datetime] = None,
) -> List[dict]:
    """Список уроков на одну дату (для сегодня/завтра/недели)."""
    if now is None:
        now = datetime.now()
    weekday = target_date.weekday()
    schedules = (
        db.query(GroupSchedule)
        .join(Group, Group.id == GroupSchedule.group_id)
        .filter(GroupSchedule.day_of_week == weekday, Group.status == "active")
        .order_by(GroupSchedule.start_time)
        .all()
    )
    out: List[dict] = []
    seen_keys = set()
    for sched in schedules:
        group = db.query(Group).options(
            joinedload(Group.trainer),
            joinedload(Group.group_students),
        ).filter(Group.id == sched.group_id).first()
        if not group:
            continue
        key = (group.id, sched.start_time, sched.end_time)
        if key in seen_keys:
            # Защита от случайных дублей расписания: один слот в день показываем один раз
            continue
        seen_keys.add(key)
        trainer = group.trainer
        lesson_start = datetime.combine(target_date, sched.start_time)
        lesson_end = datetime.combine(target_date, sched.end_time)
        status = _lesson_task_status(lesson_start, lesson_end, now) if target_date == date.today() else "waiting"

        student_ids = [gs.student_id for gs in group.group_students]
        attendance_rows = {}
        if student_ids:
            atts = (
                db.query(LessonAttendance)
                .filter(
                    LessonAttendance.group_id == group.id,
                    LessonAttendance.lesson_date == target_date,
                    LessonAttendance.student_id.in_(student_ids),
                )
                .all()
            )
            for a in atts:
                attendance_rows[a.student_id] = a

        cards = {}
        if student_ids:
            card_list = (
                db.query(StudentCard)
                .filter(
                    StudentCard.student_id.in_(student_ids),
                    StudentCard.archived.is_(False),
                )
                .all()
            )
            for c in card_list:
                if c.student_id:
                    cards[c.student_id] = c

        students_out = []
        students = db.query(Student).filter(Student.id.in_(student_ids)).all() if student_ids else []
        display_names = get_students_display_names(db, student_ids)
        for st in students:
            card = cards.get(st.id)
            att_row = attendance_rows.get(st.id)
            attended = att_row.attended if att_row else None
            late = getattr(att_row, "late", False) if att_row else False
            call_result = getattr(att_row, "call_result", None) if att_row else None
            students_out.append({
                "student_id": st.id,
                "full_name": display_names.get(st.id, st.full_name or "—"),
                "attended": attended,
                "late": late,
                "call_result": call_result,
                "parent_full_name": (card.parent_full_name if card else None) or None,
                "parent_phone": (card.parent_phone if card else None) or None,
                "parent_phone_2": (card.parent_phone_2 if card else None) or None,
                "parent_telegram": (card.parent_telegram if card else None) or None,
            })

        call_contacted_count = sum(1 for u in students_out if u.get("call_result"))
        out.append({
            "group_id": group.id,
            "group_name": group.name,
            "direction": group.direction,
            "schedule_id": sched.id,
            "lesson_date": target_date.isoformat(),
            "start_time": sched.start_time.strftime("%H:%M") if hasattr(sched.start_time, "strftime") else str(sched.start_time),
            "end_time": sched.end_time.strftime("%H:%M") if hasattr(sched.end_time, "strftime") else str(sched.end_time),
            "status": status,
            "trainer_id": trainer.id if trainer else None,
            "trainer_name": trainer.full_name if trainer else "—",
            "students": students_out,
            "total": len(students_out),
            "present_count": sum(1 for u in students_out if u.get("attended") is True),
            "absent_count": sum(1 for u in students_out if u.get("attended") is False),
            "unknown_count": sum(1 for u in students_out if u.get("attended") is None),
            "call_contacted_count": call_contacted_count,
        })
    return out


@router.get("/lesson-tasks/today")
async def list_lesson_tasks_today(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    """Уроки на сегодня для раздела «Позвать детей на занятие»."""
    today = date.today()
    out = _lesson_tasks_for_date(db, today)
    # Для вкладки «Сегодня» менеджеру показываем только актуальные уроки:
    # ожидаются / скоро / идут / идёт дозвон. Завершённые убираем.
    out = [item for item in out if item.get("status") != "completed"]
    return {"items": out}


@router.get("/lesson-tasks/tomorrow")
async def list_lesson_tasks_tomorrow(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    """Уроки на завтра."""
    tomorrow = date.today() + timedelta(days=1)
    out = _lesson_tasks_for_date(db, tomorrow)
    return {"items": out}


@router.get("/lesson-tasks/week")
async def list_lesson_tasks_week(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    """Уроки на неделю (сегодня + 6 дней)."""
    today = date.today()
    out = []
    for day_offset in range(7):
        target = today + timedelta(days=day_offset)
        out.extend(_lesson_tasks_for_date(db, target))
    return {"items": out}


VALID_CALL_RESULTS = {"contacted", "no_answer", "cancelled", "technical", "messenger"}


@router.post("/lesson-tasks/call-result")
async def set_lesson_call_result(
    payload: LessonCallResultUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    """Установить результат дозвона по ученику (менеджер): contacted | no_answer | cancelled | technical | messenger."""
    if payload.call_result not in VALID_CALL_RESULTS:
        raise HTTPException(status_code=400, detail=f"call_result must be one of: {sorted(VALID_CALL_RESULTS)}")
    lesson_date = payload.lesson_date if isinstance(payload.lesson_date, date) else date.fromisoformat(str(payload.lesson_date))
    att = (
        db.query(LessonAttendance)
        .filter(
            LessonAttendance.group_id == payload.group_id,
            LessonAttendance.lesson_date == lesson_date,
            LessonAttendance.student_id == payload.student_id,
        )
        .first()
    )
    if not att:
        att = LessonAttendance(
            group_id=payload.group_id,
            lesson_date=lesson_date,
            student_id=payload.student_id,
            attended=False,
        )
        db.add(att)
        db.commit()
        db.refresh(att)
    att.call_result = payload.call_result
    att.call_result_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.get("/sales-instructions", response_model=List[SalesInstructionResponse])
async def list_sales_instructions(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    if current_user.role not in (UserRole.ADMIN, UserRole.OWNER, UserRole.SALES):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    items = db.query(SalesInstruction).order_by(SalesInstruction.created_at.asc()).all()
    return items


@router.post("/sales-instructions", response_model=SalesInstructionResponse, status_code=status.HTTP_201_CREATED)
async def create_sales_instruction(
    payload: SalesInstructionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    title = (payload.title or "").strip()
    body = (payload.body or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    if not body:
        raise HTTPException(status_code=400, detail="Body is required")
    item = SalesInstruction(
        title=title,
        body=body,
        created_by_id=current_user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    log_action(db, current_user.id, "create", "sales_instruction", item.id, {"title": title})
    return item


@router.put("/sales-instructions/{instruction_id}", response_model=SalesInstructionResponse)
async def update_sales_instruction(
    instruction_id: int,
    payload: SalesInstructionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    item = db.query(SalesInstruction).filter(SalesInstruction.id == instruction_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Instruction not found")
    data = payload.dict(exclude_unset=True)
    if "title" in data:
        title = (data["title"] or "").strip()
        if not title:
            raise HTTPException(status_code=400, detail="Title is required")
        item.title = title
    if "body" in data:
        body = (data["body"] or "").strip()
        if not body:
            raise HTTPException(status_code=400, detail="Body is required")
        item.body = body
    db.commit()
    db.refresh(item)
    log_action(db, current_user.id, "update", "sales_instruction", item.id, data)
    return item


@router.delete("/sales-instructions/{instruction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sales_instruction(
    instruction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    item = db.query(SalesInstruction).filter(SalesInstruction.id == instruction_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Instruction not found")
    db.delete(item)
    db.commit()
    log_action(db, current_user.id, "delete", "sales_instruction", instruction_id, {})
    return None


@router.post("/instruction-images")
async def upload_sales_instruction_image(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    filename = file.filename or ""
    content_type = file.content_type or "application/octet-stream"
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Можно загружать только изображения")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Файл пустой")
    if len(data) > 400 * 1024:
        raise HTTPException(status_code=400, detail="Картинка слишком большая (лимит ~400KB)")
    img = SalesInstructionImage(data=data, content_type=content_type)
    db.add(img)
    db.commit()
    db.refresh(img)
    url = f"/api/sales/instruction-images/{img.id}"
    return {"id": img.id, "url": url}


@router.get("/instruction-images/{image_id}")
async def get_sales_instruction_image(
    image_id: int,
    db: Session = Depends(get_db),
):
    img = db.query(SalesInstructionImage).filter(SalesInstructionImage.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    return StreamingResponse(BytesIO(img.data), media_type=img.content_type or "application/octet-stream")


def _student_card_response(card: StudentCard, user: User, db: Session) -> StudentCardResponse:
    """Собирает ответ по карточке; поля абонемента/скидки только для owner."""
    parent_cabinet_open = False
    if getattr(card, "student_id", None):
        st = db.query(Student).filter(Student.id == card.student_id).first()
        if st and st.parent_id:
            parent_cabinet_open = True
    data = {
        "id": card.id,
        "student_id": getattr(card, "student_id", None),
        "student_full_name": card.student_full_name,
        "parent_cabinet_open": parent_cabinet_open,
        "birth_date": card.birth_date,
        "student_phone": card.student_phone,
        "telegram": card.telegram,
        "gender": card.gender,
        "on_grant": card.on_grant,
        "format_type": card.format_type,
        "city": card.city,
        "school": card.school,
        "grade": card.grade,
        "parent_full_name": card.parent_full_name,
        "parent_phone": card.parent_phone,
        "parent_phone_2": card.parent_phone_2,
        "parent_telegram": getattr(card, "parent_telegram", None),
        "parent_email": getattr(card, "parent_email", None),
        "student_email": getattr(card, "student_email", None),
        "preferred_messenger": getattr(card, "preferred_messenger", None),
        "comment": getattr(card, "comment", None),
        "source": getattr(card, "source", None),
        "payment_link": getattr(card, "payment_link", None),
        "archived": card.archived,
        "anketa_status": getattr(card, "anketa_status", "converted"),
        "primary_for_bank_payments": getattr(card, "primary_for_bank_payments", False),
        "created_at": card.created_at,
        "updated_at": card.updated_at,
    }
    if user.role == UserRole.OWNER:
        data["abonement_id"] = card.abonement_id
        data["discount_type"] = card.discount_type
        data["discount_value"] = card.discount_value
        data["abonement"] = AbonementResponse.model_validate(card.abonement) if card.abonement else None
    else:
        data["abonement_id"] = None
        data["discount_type"] = DiscountType.NONE
        data["discount_value"] = 0.0
        data["abonement"] = None
    return StudentCardResponse(**data)


def _require_sales_admin_owner(user: User) -> None:
    if user.role not in (UserRole.SALES, UserRole.ADMIN, UserRole.OWNER):
        raise HTTPException(status_code=403, detail="Not enough permissions")


def _normalize_name(s: str) -> str:
    """Нормализация ФИО для сравнения: нижний регистр, одна пробельная строка."""
    if not s or not isinstance(s, str):
        return ""
    return " ".join((s or "").lower().strip().split())


def _payer_matches_parent(payer_name: str, parent_full_name: Optional[str]) -> bool:
    """
    Совпадает ли плательщик с ФИО родителя.
    В Точка Банк часто пишут «Имя Отчество Ф.» (например «Наталья Георгиевна М.»),
    в карточке — «Фамилия Имя Отчество» (например «Медведева Наталья Георгиевна»).
    Инициал (одна буква или «Х.») сопоставляется с первой буквой любого слова у родителя (обычно фамилии).
    """
    if not parent_full_name or not payer_name:
        return False
    p = _normalize_name(payer_name)
    parent = _normalize_name(parent_full_name)
    if not p or not parent:
        return False
    if p == parent:
        return True
    if p in parent or parent in p:
        return True
    p_words = p.split()
    parent_words = parent.split()
    parent_word_set = set(parent_words)
    # Слова-инициалы: одна буква или буква с точкой («м», «м.»)
    initials = []
    full_words = []
    for w in p_words:
        w_clean = w.rstrip(".")
        if len(w_clean) == 1 and w_clean.isalpha():
            initials.append(w_clean)
        else:
            full_words.append(w)
    # Все не-инициалы из плательщика должны быть в ФИО родителя
    if not all(w in parent_word_set for w in full_words):
        return False
    # Каждый инициал должен совпадать с первой буквой какого-то слова у родителя (фамилия «Медведева» → «м»)
    for letter in initials:
        if not any(pw.startswith(letter) for pw in parent_words):
            return False
    return True


def _tochka_payment_already_applied(
    db: Session, account_id: str, payment_date: str, amount: float, payer_name: str
) -> bool:
    """Проверяет, был ли этот платёж из Точка Банк уже зачислен (идемпотентность)."""
    payer_trunc = (payer_name or "")[:512]
    return (
        db.query(TochkaAppliedPayment.id)
        .filter(
            TochkaAppliedPayment.tochka_account_id == account_id,
            TochkaAppliedPayment.payment_date == payment_date,
            TochkaAppliedPayment.amount == amount,
            TochkaAppliedPayment.payer_name == payer_trunc,
        )
        .first()
        is not None
    )


def _resolve_student_for_bank_payment(
    db: Session,
    student_ids: List[int],
    account_id: str,
    tx_date: str,
    amount: float,
    payer_name: str,
) -> Optional[int]:
    """
    Из нескольких учеников (один родитель) выбираем одного: primary_for_bank_payments, затем активный абонемент, затем отрицательный баланс.
    """
    if not student_ids:
        return None
    if len(student_ids) == 1:
        return student_ids[0]
    cards = (
        db.query(StudentCard)
        .filter(
            StudentCard.student_id.in_(student_ids),
            StudentCard.archived.is_(False),
        )
        .options(joinedload(StudentCard.student).joinedload(Student.accounts))
        .all()
    )
    by_primary = [c for c in cards if getattr(c, "primary_for_bank_payments", False)]
    if len(by_primary) == 1:
        return by_primary[0].student_id
    by_abonement = [c for c in cards if c.student_id and c.abonement_id]
    if len(by_abonement) == 1:
        return by_abonement[0].student_id
    students_with_negative = []
    for sid in student_ids:
        acc = db.query(StudentAccount).filter(StudentAccount.student_id == sid).first()
        if acc and acc.balance is not None and acc.balance < 0:
            students_with_negative.append(sid)
    if len(students_with_negative) == 1:
        return students_with_negative[0]
    return None


def do_tochka_import_and_apply(
    db: Session,
    account_id: str,
    date_from: date,
    date_to: date,
    actor_user_id: Optional[int] = None,
) -> BankPaymentImportResponse:
    """
    Загружает выписку Точка Банк за период. Дедупликация по operation_id (bank_transactions).
    Матчинг по нормализованному телефону плательщика: привязки (phone_payment_bindings) или родитель в карточке.
    При одном родителе и нескольких учениках: primary_for_bank_payments → активный абонемент → отрицательный баланс → иначе ambiguous.
    """
    from app.services.tochka_client import (
        fetch_statement_ready,
        extract_incoming_transactions,
    )

    statement = fetch_statement_ready(account_id, date_from, date_to)
    transactions = extract_incoming_transactions(statement)
    cards = (
        db.query(StudentCard)
        .filter(StudentCard.archived.is_(False), StudentCard.student_id.isnot(None))
        .options(joinedload(StudentCard.student).joinedload(Student.parent))
        .all()
    )
    bindings = {b.payer_phone_normalized: b.parent_id for b in db.query(PhonePaymentBinding).all()}

    applied: List[dict] = []
    no_match: List[dict] = []
    ambiguous: List[dict] = []

    for idx, tx in enumerate(transactions):
        payer_name = (tx.get("payer_name") or "").strip()
        amount = tx.get("amount") or 0
        tx_date = tx.get("date") or ""
        payer_phone = normalize_phone(tx.get("payer_phone_raw") or "")

        operation_id = (tx.get("operation_id") or "").strip()
        if not operation_id:
            operation_id = hashlib.sha256(
                f"{account_id}|{tx_date}|{amount}|{payer_name}|{payer_phone}|{idx}".encode()
            ).hexdigest()

        existing_bt = db.query(BankTransaction).filter(BankTransaction.operation_id == operation_id).first()
        if existing_bt:
            bt = existing_bt
        else:
            bt = BankTransaction(
                operation_id=operation_id,
                tochka_account_id=account_id,
                amount=amount,
                payer_phone=payer_phone or None,
                payer_name=payer_name[:512] if payer_name else None,
                payment_date=tx_date,
                status=BankTransactionStatus.NEW.value,
            )
            db.add(bt)
            db.flush()

        # Отразим операцию в едином финансовом журнале.
        ensure_finance_transaction_for_bank_transaction(db, bt, bank_source="tochka")

        student_ids: List[int] = []
        if payer_phone:
            parent_id = bindings.get(payer_phone)
            if parent_id is not None:
                student_ids = [
                    row[0]
                    for row in db.query(Student.id).filter(Student.parent_id == parent_id).all()
                ]
            if not student_ids:
                for c in cards:
                    if normalize_phone(c.parent_phone or "") == payer_phone or normalize_phone(
                        getattr(c, "parent_phone_2", None) or ""
                    ) == payer_phone:
                        if c.student_id:
                            student_ids.append(c.student_id)
                student_ids = list(dict.fromkeys(student_ids))

        # Если телефон в выписке не пришёл или по телефону не нашли — пробуем матч по ФИО (fallback)
        if not student_ids and payer_name:
            for c in cards:
                if _payer_matches_parent(payer_name, c.parent_full_name):
                    if c.student_id:
                        student_ids.append(c.student_id)
                elif c.student and c.student.parent and c.student.parent.full_name:
                    if _payer_matches_parent(payer_name, c.student.parent.full_name):
                        if c.student_id:
                            student_ids.append(c.student_id)
            student_ids = list(dict.fromkeys(student_ids))

        if not student_ids:
            bt.status = BankTransactionStatus.NO_MATCH.value
            no_match.append({
                "payer_name": payer_name,
                "amount": amount,
                "date": tx_date,
                "payer_phone": payer_phone or None,
            })
            continue

        chosen_student_id = _resolve_student_for_bank_payment(
            db, student_ids, account_id, tx_date, amount, payer_name
        )
        if chosen_student_id is None:
            bt.status = BankTransactionStatus.AMBIGUOUS.value
            ambiguous.append({
                "payer_name": payer_name,
                "amount": amount,
                "date": tx_date,
                "payer_phone": payer_phone or None,
                "candidates": [
                    {
                        "student_id": sid,
                        "student_name": get_student_display_name(
                            db, db.query(Student).filter(Student.id == sid).first()
                        ),
                        "parent_full_name": next(
                            (c.parent_full_name or "" for c in cards if c.student_id == sid),
                            "",
                        ),
                    }
                    for sid in student_ids
                ],
            })
            continue

        student = db.query(Student).filter(Student.id == chosen_student_id).first()
        if not student:
            bt.status = BankTransactionStatus.NO_MATCH.value
            no_match.append({"payer_name": payer_name, "amount": amount, "date": tx_date, "payer_phone": payer_phone or None})
            continue

        account = (
            db.query(StudentAccount)
            .filter(StudentAccount.student_id == chosen_student_id)
            .order_by(StudentAccount.id)
            .first()
        )
        if not account:
            account = StudentAccount(student_id=chosen_student_id, name="Основной", balance=0.0)
            db.add(account)
            db.flush()

        note = f"Точка Банк, плательщик: {payer_name}, дата: {tx_date}"
        db.add(
            StudentAccountTransaction(
                account_id=account.id,
                amount=amount,
                kind=StudentAccountTransactionKind.PAYMENT,
                note=note,
            )
        )
        account.balance += amount
        payer_trunc = (payer_name or "")[:512]
        db.add(
            TochkaAppliedPayment(
                tochka_account_id=account_id,
                payment_date=tx_date,
                amount=amount,
                payer_name=payer_trunc,
                student_id=chosen_student_id,
                student_account_id=account.id,
            )
        )
        try:
            pay_date = date.fromisoformat(tx_date[:10]) if tx_date else date.today()
        except (ValueError, TypeError):
            pay_date = date.today()
        from app.services.student_card_period import update_card_payment_dates
        update_card_payment_dates(db, chosen_student_id, pay_date)

        bt.status = BankTransactionStatus.APPLIED.value
        bt.student_id = chosen_student_id
        bt.student_account_id = account.id

        student_name = get_student_display_name(db, student)
        applied.append({
            "payer_name": payer_name,
            "amount": amount,
            "date": tx_date,
            "student_id": chosen_student_id,
            "account_id": account.id,
            "student_name": student_name,
        })

    db.commit()
    if actor_user_id is not None:
        log_action(
            db, actor_user_id, "tochka_import_apply", "sales", None,
            {"applied": len(applied), "no_match": len(no_match), "ambiguous": len(ambiguous)},
        )
    return BankPaymentImportResponse(applied=applied, no_match=no_match, ambiguous=ambiguous)


@router.get("/tochka/status")
async def tochka_bank_status(current_user: User = Depends(auth.get_current_active_user)):
    """Проверка: заданы ли учётные данные Точка Банк и включено ли автозачисление."""
    _require_sales_admin_owner(current_user)
    from app.services.tochka_client import is_configured, is_auto_import_configured
    return {
        "configured": is_configured(),
        "auto_import_configured": is_auto_import_configured(),
    }


@router.get("/tochka/status/public")
async def tochka_bank_status_public():
    """Проверка без авторизации (только configured/auto_import_configured). Для мониторинга и curl с сервера."""
    from app.services.tochka_client import is_configured, is_auto_import_configured
    return {
        "configured": is_configured(),
        "auto_import_configured": is_auto_import_configured(),
    }


@router.post("/tochka/import-and-apply", response_model=BankPaymentImportResponse)
async def tochka_import_and_apply(
    payload: TochkaImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """
    Загрузить выписку из Точка Банк за период. Матчинг по телефону плательщика (привязки или карточка).
    Дедупликация по operation_id. Уже обработанные операции пропускаются.
    """
    _require_sales_admin_owner(current_user)
    from app.services.tochka_client import is_configured

    if not is_configured():
        raise HTTPException(status_code=400, detail="Точка Банк не настроен: задайте TOCHKA_CLIENT_ID и TOCHKA_CLIENT_SECRET в .env")

    account_id = (payload.account_id or "").strip() or (os.getenv("TOCHKA_ACCOUNT_ID") or "").strip()
    if not account_id:
        raise HTTPException(
            status_code=400,
            detail="Укажите account_id (ID счёта в Точка Банк) в теле запроса или задайте TOCHKA_ACCOUNT_ID в .env",
        )

    try:
        date_from = date.fromisoformat(payload.date_from)
        date_to = date.fromisoformat(payload.date_to)
    except ValueError:
        raise HTTPException(status_code=400, detail="date_from и date_to должны быть в формате YYYY-MM-DD")

    if date_from > date_to:
        raise HTTPException(status_code=400, detail="date_from не может быть больше date_to")

    try:
        return do_tochka_import_and_apply(db, account_id, date_from, date_to, actor_user_id=current_user.id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ошибка выписки Точка Банк: {e!s}")


@router.get("/bank-transactions", response_model=List[BankTransactionResponse])
async def list_bank_transactions(
    status: Optional[List[str]] = Query(None, description="Фильтр: new, no_match, ambiguous, applied, expense; без параметра — все операции"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Очередь операций из банка для ручного разбора (no_match, ambiguous)."""
    _require_sales_admin_owner(current_user)
    q = db.query(BankTransaction).order_by(BankTransaction.created_at.desc())
    if status:
        q = q.filter(BankTransaction.status.in_(status))
    items = q.limit(500).all()
    return [BankTransactionResponse.model_validate(b) for b in items]


@router.post("/phone-payment-bindings")
async def create_phone_payment_binding(
    payload: PhonePaymentBindingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Привязать телефон плательщика к родителю: следующие платежи с этого номера зачислятся автоматически."""
    _require_sales_admin_owner(current_user)
    normalized = normalize_phone(payload.payer_phone)
    if not normalized:
        raise HTTPException(status_code=400, detail="Некорректный номер телефона")
    parent = db.query(User).filter(User.id == payload.parent_id, User.role == UserRole.PARENT).first()
    if not parent:
        raise HTTPException(status_code=404, detail="Родитель не найден")
    existing = db.query(PhonePaymentBinding).filter(PhonePaymentBinding.payer_phone_normalized == normalized).first()
    if existing:
        existing.parent_id = payload.parent_id
        db.commit()
        return {"ok": True, "updated": True}
    db.add(PhonePaymentBinding(payer_phone_normalized=normalized, parent_id=payload.parent_id))
    db.commit()
    return {"ok": True}


@router.post("/bank-transactions/{transaction_id}/apply", response_model=BankTransactionResponse)
async def apply_bank_transaction(
    transaction_id: int,
    payload: BankTransactionApplyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_sales_admin_owner),
):
    """Зачислить спорную операцию (no_match / ambiguous) на выбранного ученика. При no_match создаётся привязка телефона к родителю."""
    try:
        result = bank_operation_apply(db, transaction_id, payload.student_id)
    except ValueError as e:
        msg = str(e)
        if "не найден" in msg.lower():
            raise HTTPException(status_code=404, detail=msg)
        raise HTTPException(status_code=400, detail=msg)
    return BankTransactionResponse.model_validate(result.transaction)


@router.patch("/bank-transactions/{transaction_id}/expense-category", response_model=BankTransactionResponse)
async def update_bank_transaction_expense_category(
    transaction_id: int,
    payload: BankTransactionExpenseCategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Установить категорию расхода (комиссия, типография, аренда и т.д.). Только для операций со статусом expense."""
    _require_sales_admin_owner(current_user)
    bt = db.query(BankTransaction).filter(BankTransaction.id == transaction_id).first()
    if not bt:
        raise HTTPException(status_code=404, detail="Операция не найдена")
    if bt.status != BankTransactionStatus.EXPENSE.value:
        raise HTTPException(status_code=400, detail="Категорию можно задать только для расхода (списание)")
    if payload.expense_category is not None:
        bt.expense_category = (payload.expense_category or "").strip() or None
    db.commit()
    db.refresh(bt)
    return BankTransactionResponse.model_validate(bt)


@router.delete("/bank-transactions/{transaction_id}")
async def delete_bank_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> Dict[str, bool]:
    """Удалить операцию банка (BankTransaction).

    Используется для ручной очистки очереди операций в интерфейсе «Долги и оплаты» → «Операции банка».
    Предполагается, что перед удалением администрация при необходимости откатила связанные действия по счетам учеников.
    """
    _require_sales_admin_owner(current_user)
    bt = db.query(BankTransaction).filter(BankTransaction.id == transaction_id).first()
    if not bt:
        raise HTTPException(status_code=404, detail="Операция не найдена")
    db.delete(bt)
    db.commit()
    return {"ok": True}


@router.get("/student-cards", response_model=List[StudentCardResponse])
async def list_student_cards(
    archived: Optional[bool] = Query(None, description="Фильтр по архиву: true/false или не передавать — все"),
    anketa_status: Optional[List[str]] = Query(None, description="Фильтр по статусу анкеты: draft, filled, converted, cancelled"),
    student_id: Optional[int] = Query(None, description="Фильтр по привязанному ученику"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_sales_admin_owner(current_user)
    query = db.query(StudentCard)
    if archived is not None:
        query = query.filter(StudentCard.archived == archived)
    if anketa_status:
        query = query.filter(StudentCard.anketa_status.in_(anketa_status))
    if student_id is not None:
        query = query.filter(StudentCard.student_id == student_id)
    items = query.order_by(StudentCard.created_at.desc()).all()
    return [_student_card_response(c, current_user, db) for c in items]


@router.post("/student-cards", response_model=StudentCardResponse, status_code=status.HTTP_201_CREATED)
async def create_student_card(
    payload: StudentCardCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_sales_admin_owner(current_user)
    name = (payload.student_full_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="ФИО ученика обязательно")
    data = payload.model_dump()
    if data.get("student_id") is None and not data.get("anketa_status"):
        data["anketa_status"] = "draft"
    # Абонемент и скидка может менять только owner
    if current_user.role != UserRole.OWNER:
        data["abonement_id"] = None
        data["discount_type"] = DiscountType.NONE
        data["discount_value"] = 0.0
    # Ссылку оплаты могут задавать owner и admin; для остальных (sales) очищаем
    if current_user.role not in (UserRole.OWNER, UserRole.ADMIN):
        data["payment_link"] = None
    if data.get("abonement_id"):
        ab = db.query(Abonement).filter(Abonement.id == data["abonement_id"]).first()
        if not ab:
            raise HTTPException(status_code=404, detail="Абонемент не найден")
    if data.get("student_id") is not None:
        st = db.query(Student).filter(Student.id == data["student_id"]).first()
        if not st:
            raise HTTPException(status_code=404, detail="Ученик не найден")
    card = StudentCard(**data)
    db.add(card)
    db.commit()
    db.refresh(card)
    return _student_card_response(card, current_user, db)


@router.get("/student-cards/import-template")
async def download_student_cards_import_template(
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_sales_admin_owner(current_user)
    wb = Workbook()
    ws = wb.active
    ws.title = "Карточки учеников"
    headers = [
        "ФИО ученика",
        "Дата рождения",
        "Телефон ученика",
        "Телеграм ученика",
        "Пол",
        "На гранте",
        "Формат",
        "Город",
        "Образовательное учреждение",
        "Класс",
        "Email ученика",
        "ФИО родителя",
        "Телефон родителя",
        "Второй телефон родителя",
        "Телеграм родителя",
        "Email родителя",
        "Удобный мессенджер",
        "Комментарий",
        "Откуда пришел",
    ]
    ws.append(headers)
    ws.append(
        [
            "Иванов Петр Сергеевич",
            "2015-03-15",
            "+7 999 111-22-33",
            "@petr_ivanov",
            "м",
            "нет",
            "группа",
            "Москва",
            "Школа №12",
            "3",
            "petr@example.com",
            "Иванова Анна Петровна",
            "+7 999 111-22-34",
            "+7 900 111-22-44",
            "@anna_ivanova",
            "anna@example.com",
            "Telegram",
            "Записан на пробное занятие",
            "рекомендация",
        ]
    )
    ws.freeze_panes = "A2"
    stream = BytesIO()
    wb.save(stream)
    stream.seek(0)
    filename = "student_cards_import_template.xlsx"
    headers_resp = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers_resp,
    )


@router.post("/student-cards/import-xlsx", response_model=StudentCardImportResponse)
async def import_student_cards_from_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_sales_admin_owner(current_user)
    filename = (file.filename or "").lower()
    if not filename.endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Поддерживается только формат .xlsx")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Файл пустой")
    wb = load_workbook(filename=BytesIO(data), data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return StudentCardImportResponse(created=0, skipped=0, errors=["Пустой лист"])
    headers = [str(h).strip().lower() if h is not None else "" for h in rows[0]]
    header_map = {name: idx for idx, name in enumerate(headers)}

    def val(row, key_variants: List[str]) -> Optional[str]:
        for key in key_variants:
            idx = header_map.get(key)
            if idx is None or idx >= len(row):
                continue
            raw = row[idx]
            if raw is None:
                continue
            txt = str(raw).strip()
            if txt:
                return txt
        return None

    def parse_date(raw_value) -> Optional[datetime]:
        if raw_value is None:
            return None
        if isinstance(raw_value, datetime):
            return raw_value.date() if hasattr(raw_value, "date") else raw_value
        text = str(raw_value).strip()
        if not text:
            return None
        for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y"):
            try:
                return datetime.strptime(text, fmt).date()
            except ValueError:
                continue
        try:
            return datetime.fromisoformat(text[:10]).date()
        except (ValueError, TypeError):
            return None

    created = 0
    skipped = 0
    errors: List[str] = []
    for i, row in enumerate(rows[1:], start=2):
        row = list(row) if row else []
        student_full_name = val(row, ["фио ученика", "ученик", "student_full_name"])
        if not student_full_name:
            skipped += 1
            continue
        birth_date_raw = val(row, ["дата рождения", "birth_date"])
        birth_date = parse_date(birth_date_raw) if birth_date_raw else None
        student_phone = val(row, ["телефон ученика", "student_phone"])
        telegram = val(row, ["телеграм ученика", "telegram"])
        gender_raw = val(row, ["пол", "gender"])
        gender = gender_raw.lower() if gender_raw and gender_raw.lower() in ("м", "ж", "m", "f", "male", "female") else (gender_raw or None)
        on_grant_raw = val(row, ["на гранте", "on_grant"])
        on_grant = str(on_grant_raw).strip().lower() in ("да", "yes", "1", "true", "+")
        format_raw = val(row, ["формат", "format_type"])
        format_type = None
        if format_raw:
            f = format_raw.lower()
            if "групп" in f or f == "group":
                format_type = "group"
            elif "индивид" in f or f == "individual":
                format_type = "individual"
            else:
                format_type = format_raw
        city = val(row, ["город", "city"])
        school = val(row, ["образовательное учреждение", "школа", "school"])
        grade = val(row, ["класс", "grade"])
        student_email = val(row, ["email ученика", "student_email"])
        parent_full_name = val(row, ["фио родителя", "родитель", "parent_full_name"])
        parent_phone = val(row, ["телефон родителя", "parent_phone"])
        parent_phone_2 = val(row, ["второй телефон родителя", "parent_phone_2"])
        parent_telegram = val(row, ["телеграм родителя", "parent_telegram"])
        parent_email = val(row, ["email родителя", "parent_email"])
        preferred_raw = val(row, ["удобный мессенджер", "preferred_messenger"])
        preferred_messenger = None
        if preferred_raw:
            p = preferred_raw.lower()
            if "max" in p or p == "max":
                preferred_messenger = "max"
            elif "telegram" in p or "телеграм" in p or p == "tg":
                preferred_messenger = "telegram"
            elif "sms" in p:
                preferred_messenger = "sms"
            else:
                preferred_messenger = preferred_raw
        comment = val(row, ["комментарий", "comment"])
        source = val(row, ["откуда пришел", "источник", "source"])
        abonement_id = None
        discount_type = DiscountType.NONE
        discount_value = 0.0
        if current_user.role == UserRole.OWNER:
            ab_id_raw = val(row, ["абонемент", "abonement_id"])
            if ab_id_raw:
                try:
                    abonement_id = int(float(ab_id_raw))
                except (ValueError, TypeError):
                    pass
        card = StudentCard(
            student_full_name=student_full_name,
            birth_date=birth_date,
            student_phone=student_phone or None,
            telegram=telegram or None,
            gender=gender,
            on_grant=on_grant,
            format_type=format_type,
            city=city or None,
            school=school or None,
            grade=grade or None,
            parent_full_name=parent_full_name or None,
            parent_phone=parent_phone or None,
            parent_phone_2=parent_phone_2 or None,
            parent_telegram=parent_telegram or None,
            parent_email=parent_email or None,
            student_email=student_email or None,
            preferred_messenger=preferred_messenger,
            comment=comment or None,
            source=source or None,
            abonement_id=abonement_id,
            discount_type=discount_type,
            discount_value=discount_value,
            archived=False,
        )
        db.add(card)
        created += 1
    db.commit()
    log_action(db, current_user.id, "import", "student_card", None, {"created": created, "skipped": skipped})
    return StudentCardImportResponse(created=created, skipped=skipped, errors=errors)


def _parse_vertical_date(text: str, today: date) -> Optional[str]:
    """Парсит дату из строки вида 'Сегодня, 26 февраля', 'Вчера, 25 февраля', '25 февраля, 19:51', '24 февраля'."""
    if not text or not str(text).strip():
        return None
    s = str(text).strip()
    year = today.year
    months_ru = {
        "января": 1, "февраля": 2, "марта": 3, "апреля": 4, "мая": 5, "июня": 6,
        "июля": 7, "августа": 8, "сентября": 9, "октября": 10, "ноября": 11, "декабря": 12,
    }
    if "сегодня" in s.lower():
        return today.isoformat()
    if "вчера" in s.lower():
        from datetime import timedelta
        return (today - timedelta(days=1)).isoformat()
    for month_name, month_num in months_ru.items():
        if month_name in s.lower():
            parts = re.findall(r"\d+", s)
            if parts:
                day = int(parts[0])
                try:
                    return date(year, month_num, day).isoformat()
                except ValueError:
                    return None
            return None
    return None


def _import_bank_transactions_vertical(rows: list, db: Session) -> dict:
    """Импорт выписки в вертикальном формате (одна колонка, блоки: дата, сумма, статус, контрагент, описание)."""
    lines = []
    for row in rows:
        val = row[0] if row and len(row) > 0 else None
        lines.append(str(val).strip() if val is not None else "")
    today = date.today()
    amount_re = re.compile(r"^[+\-–]\s*([\d\s,]+)\s*[₽р]", re.IGNORECASE)
    imported = 0
    skipped = 0
    last_date_str = None
    for i, line in enumerate(lines):
        if not line:
            continue
        line_norm = line.replace("\xa0", " ")
        if "₽" not in line_norm and " р" not in line_norm.lower():
            maybe_date = _parse_vertical_date(line, today)
            if maybe_date:
                last_date_str = maybe_date
            continue
        m = amount_re.match(line_norm)
        if not m:
            continue
        amount_str = m.group(1).replace(" ", "").replace(",", ".")
        try:
            amount_val = float(amount_str)
        except ValueError:
            skipped += 1
            continue
        if amount_val <= 0:
            amount_val = -abs(amount_val)
        else:
            amount_val = abs(amount_val)
        if line.strip().startswith(("-", "–")):
            amount_val = -abs(amount_val)
        date_str = last_date_str
        counterparty = ""
        description = ""
        if i + 1 < len(lines):
            counterparty = (lines[i + 2] or "").strip() if i + 2 < len(lines) else ""
            description = (lines[i + 3] or "").strip() if i + 3 < len(lines) else ""
            time_line = (lines[i + 4] or "").strip() if i + 4 < len(lines) else ""
            if time_line:
                parsed = _parse_vertical_date(time_line, today)
                if parsed:
                    date_str = parsed
        if not date_str:
            date_str = today.isoformat()
        payer_name = counterparty or "Списание" if amount_val < 0 else "Из выписки (без ФИО)"
        payer_phone = None
        if amount_val > 0 and counterparty:
            phone_m = re.search(r"\+7\s*\(?\d{3}\)?\s*\d{3}[- ]?\d{2}[- ]?\d{2}", counterparty)
            if phone_m:
                payer_phone = normalize_phone(re.sub(r"\D", "", phone_m.group(0)))
            if "," in counterparty:
                rest = counterparty.split(",", 1)[1].strip()
                if rest and len(rest) >= 2:
                    payer_name = rest[:512]
        if amount_val > 0 and not payer_name:
            payer_name = counterparty or "Из выписки (без ФИО)"
        op_id_source = f"vertical_xlsx|{date_str}|{amount_val}|{payer_name}|{payer_phone or ''}|{i}"
        operation_id = hashlib.sha256(op_id_source.encode("utf-8")).hexdigest()
        if db.query(BankTransaction.id).filter(BankTransaction.operation_id == operation_id).first():
            skipped += 1
            continue
        status = BankTransactionStatus.EXPENSE.value if amount_val < 0 else BankTransactionStatus.NEW.value
        bt = BankTransaction(
            operation_id=operation_id,
            tochka_account_id=None,
            amount=amount_val,
            payer_phone=payer_phone,
            payer_name=(payer_name or "")[:512] or None,
            payment_date=date_str,
            status=status,
            expense_category=None,
        )
        db.add(bt)
        ensure_finance_transaction_for_bank_transaction(db, bt, bank_source="import_xlsx")
        imported += 1
    db.commit()
    errors = []
    if imported == 0 and skipped == 0 and len(lines) > 1:
        errors.append("В файле не найдено строк с суммой вида «+ 3 200 ₽» или «– 102 ₽».")
    return {"imported": imported, "skipped": skipped, "errors": errors}


@router.post("/bank-transactions/import-xlsx")
async def import_bank_transactions_from_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """
    Импорт банковской выписки из .xlsx, когда файл скачан вручную (Точка или другой банк).
    Создаёт записи в bank_transactions со статусом new; дальше менеджер распределяет их по ученикам во вкладке «Операции банка».
    Поддерживаются два формата:
    1) Универсальный: колонки Дата, Сумма, ФИО плательщика, Телефон (регистр не важен).
    2) Выписка Точка Банк: Дата операции/Дата документа, Зачисление (приход) или Сумма, Назначение платежа (из него извлекаются телефон и «Получатель …»/«Плательщик …»); при отсутствии ФИО/телефона в колонках используется разбор назначения.
    """
    _require_sales_admin_owner(current_user)
    filename = (file.filename or "").lower()
    if not filename.endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Поддерживается только формат .xlsx")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Файл пустой")
    wb = load_workbook(filename=BytesIO(data), data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return {"imported": 0, "skipped": 0, "errors": ["Пустой лист"]}
    first_row = rows[0]
    is_vertical = (
        len(first_row) == 1
        and first_row[0] is not None
        and not any(
            k in str(first_row[0]).strip().lower()
            for k in ("дата", "сумма", "зачисление", "списание", "кредит", "дебет", "назначение")
        )
    )
    if is_vertical:
        return _import_bank_transactions_vertical(rows, db)
    headers = [str(h).strip().lower() if h is not None else "" for h in rows[0]]
    header_map = {name: idx for idx, name in enumerate(headers)}

    def col(row, keys: List[str], allow_number: bool = True):
        for key in keys:
            for name, idx in header_map.items():
                if key in name and idx < len(row):
                    raw = row[idx] if idx < len(row) else None
                    if raw is None:
                        continue
                    if allow_number and isinstance(raw, (int, float)):
                        return str(raw).strip() if raw != 0 else None
                    txt = str(raw).strip()
                    if txt:
                        return txt
        return None

    def parse_date_any(raw_value) -> Optional[str]:
        if raw_value is None:
            return None
        if isinstance(raw_value, datetime):
            try:
                d = raw_value.date() if hasattr(raw_value, "date") else raw_value
                return d.isoformat()
            except Exception:
                pass
        if isinstance(raw_value, (int, float)):
            try:
                from datetime import timedelta
                base = date(1899, 12, 30)
                d = base + timedelta(days=int(float(raw_value)))
                return d.isoformat()
            except (ValueError, TypeError, OverflowError):
                pass
        text = str(raw_value).strip()
        try:
            serial = float(text)
            if 1000 < serial < 100000:
                from datetime import timedelta
                base = date(1899, 12, 30)
                d = base + timedelta(days=int(serial))
                return d.isoformat()
        except (ValueError, TypeError):
            pass
        if not text:
            return None
        for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y"):
            try:
                return datetime.strptime(text, fmt).date().isoformat()
            except ValueError:
                continue
        try:
            return datetime.fromisoformat(text[:10]).date().isoformat()
        except (ValueError, TypeError):
            return text  # сохраняем как есть

    def parse_amount(raw_value) -> Optional[float]:
        if raw_value is None:
            return None
        if isinstance(raw_value, (int, float)):
            return float(raw_value)
        text = str(raw_value).strip().replace(" ", "").replace("\u00a0", "")
        if not text:
            return None
        text = text.replace(",", ".")
        try:
            return float(text)
        except ValueError:
            return None

    def parse_payment_purpose(purpose: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
        """Из «Назначение платежа» извлечь телефон и ФИО. Поддерживает:
        - «Получатель X» / «Плательщик X»;
        - формат Точка/СБП: «+7 (950) 112-78-38 Дмитрий Андреевич П. Заказ 767: …» (ФИО сразу после телефона).
        Возвращает (payer_name, payer_phone_raw)."""
        if not purpose or not str(purpose).strip():
            return None, None
        text = str(purpose).strip()
        phone_raw = None
        phone_end = 0
        for pattern in (
            r"\+7\s*\(?\d{3}\)?\s*\d{3}[- ]?\d{2}[- ]?\d{2}",
            r"8\s*\(?\d{3}\)?\s*\d{3}[- ]?\d{2}[- ]?\d{2}",
            r"\+7\d{10}",
            r"8\d{10}",
        ):
            m = re.search(pattern, text)
            if m:
                phone_raw = re.sub(r"\D", "", m.group(0))
                if phone_raw.startswith("8") and len(phone_raw) == 11:
                    phone_raw = "7" + phone_raw[1:]
                elif phone_raw.startswith("7") and len(phone_raw) == 11:
                    pass
                elif len(phone_raw) == 10:
                    phone_raw = "7" + phone_raw
                else:
                    phone_raw = None
                if phone_raw:
                    phone_end = m.end()
                    break
        name = None
        for prefix in ("Получатель ", "Плательщик "):
            if prefix in text:
                start = text.find(prefix) + len(prefix)
                end = text.find(" через", start)
                if end == -1:
                    end = text.find(".", start)
                if end == -1:
                    end = len(text)
                name = text[start:end].strip()
                if name:
                    break
        if not name and phone_end > 0:
            rest = text[phone_end:].strip()
            for stop in ("Заказ ", "Order ", " заказ ", " №", " N "):
                if stop in rest:
                    idx = rest.find(stop)
                    candidate = rest[:idx].strip()
                    if candidate and len(candidate) >= 3 and re.search(r"[\u0400-\u04FF]", candidate):
                        name = candidate
                        break
            if not name and rest and re.search(r"[\u0400-\u04FF]", rest):
                name = rest[:80].strip()
        return name or None, phone_raw

    imported = 0
    skipped = 0
    for idx, row in enumerate(rows[1:], start=2):
        row = list(row) if row else []
        date_str = parse_date_any(col(row, ["дата", "date"]))
        if not date_str:
            for name, idx in header_map.items():
                if "дата" in name and idx < len(row) and row[idx] is not None:
                    date_str = parse_date_any(row[idx])
                    if date_str:
                        break
        amount_raw = col(row, ["сумма", "amount", "зачисление", "кредит"])
        amount = parse_amount(amount_raw)
        if amount is None or amount <= 0:
            amount = parse_amount(col(row, ["списание", "дебет"]))
            if amount is not None and amount > 0:
                amount = -amount
        payer_name = col(row, ["фио", "плательщик", "payer"])
        payer_phone_raw = col(row, ["телефон", "phone"])
        purpose = col(row, ["назначение", "payment purpose", "назначение платежа"])
        if (not payer_name or not payer_phone_raw) and purpose:
            name_from_purpose, phone_from_purpose = parse_payment_purpose(purpose)
            if not payer_name and name_from_purpose:
                payer_name = name_from_purpose
            if not payer_phone_raw and phone_from_purpose:
                payer_phone_raw = phone_from_purpose
        if not payer_name and amount and amount > 0 and date_str:
            payer_name = "Из выписки (без ФИО)"
        if amount is None or not date_str:
            skipped += 1
            continue
        is_expense = amount < 0
        if is_expense:
            payer_name = payer_name or col(row, ["контрагент", "counterparty"]) or (purpose[:512] if purpose else "Списание")
        else:
            if not payer_name:
                skipped += 1
                continue

        payer_phone = (normalize_phone(payer_phone_raw or "") or None) if not is_expense else None
        op_id_source = f"manual_xlsx|{date_str}|{amount}|{payer_name}|{payer_phone}|{idx}"
        operation_id = hashlib.sha256(op_id_source.encode("utf-8")).hexdigest()

        exists = db.query(BankTransaction.id).filter(BankTransaction.operation_id == operation_id).first()
        if exists:
            skipped += 1
            continue

        bt = BankTransaction(
            operation_id=operation_id,
            tochka_account_id=None,
            amount=amount,
            payer_phone=payer_phone or None if not is_expense else None,
            payer_name=(payer_name or "")[:512] or None,
            payment_date=date_str,
            status=BankTransactionStatus.EXPENSE.value if is_expense else BankTransactionStatus.NEW.value,
            expense_category=None,
        )
        db.add(bt)
        imported += 1

    db.commit()
    errors: List[str] = []
    if imported == 0 and skipped > 0:
        errors.append(
            "Ни одна строка не подошла. Проверьте: в первой строке — заголовки (Дата, Зачисление/Списание или Кредит/Дебет, Назначение/Контрагент); даты в формате ДД.ММ.ГГГГ или число Excel; суммы — числа с запятой или точкой."
        )
    return {"imported": imported, "skipped": skipped, "errors": errors}

@router.get("/student-cards/{card_id}", response_model=StudentCardResponse)
async def get_student_card(
    card_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_sales_admin_owner(current_user)
    card = db.query(StudentCard).filter(StudentCard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Карточка не найдена")
    return _student_card_response(card, current_user, db)


@router.put("/student-cards/{card_id}", response_model=StudentCardResponse)
async def update_student_card(
    card_id: int,
    payload: StudentCardUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_sales_admin_owner(current_user)
    card = db.query(StudentCard).filter(StudentCard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Карточка не найдена")
    data = payload.model_dump(exclude_unset=True)
    # Абонемент и скидку может менять только owner
    if current_user.role != UserRole.OWNER:
        data.pop("abonement_id", None)
        data.pop("discount_type", None)
        data.pop("discount_value", None)
    # payment_link может менять только owner и admin (sales не может)
    if current_user.role not in (UserRole.OWNER, UserRole.ADMIN):
        data.pop("payment_link", None)
    if data.get("abonement_id"):
        ab = db.query(Abonement).filter(Abonement.id == data["abonement_id"]).first()
        if not ab:
            raise HTTPException(status_code=404, detail="Абонемент не найден")
    if "student_id" in data and data["student_id"] is not None:
        st = db.query(Student).filter(Student.id == data["student_id"]).first()
        if not st:
            raise HTTPException(status_code=404, detail="Ученик не найден")
    for k, v in data.items():
        setattr(card, k, v)
    db.commit()
    db.refresh(card)
    return _student_card_response(card, current_user, db)


@router.post("/student-cards/{card_id}/convert", response_model=AnketaConvertResponse)
async def convert_anketa_to_student(
    card_id: int,
    payload: Optional[AnketaConvertRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """
    Конверсия анкеты в ученика: создаёт/привязывает Student, не создаёт кабинет родителя.
    При дублях по email родителя или ФИО ученика возвращает 409 с выбором привязки к существующему.
    """
    _require_sales_admin_owner(current_user)
    body = payload or AnketaConvertRequest()
    try:
        result = student_card_convert(
            db,
            card_id,
            use_existing_parent_id=body.use_existing_parent_id,
            use_existing_student_id=body.use_existing_student_id,
        )
    except StudentCardConvertConflict as e:
        code = e.detail.get("code", "existing_parent")
        raise HTTPException(
            status_code=409,
            detail=e.detail,
            headers={"X-Conflict-Code": code},
        )
    except ValueError as e:
        msg = str(e)
        if "не найден" in msg.lower():
            raise HTTPException(status_code=404, detail=msg)
        raise HTTPException(status_code=400, detail=msg)
    return AnketaConvertResponse(
        card=_student_card_response(result.card, current_user, db),
        student_id=result.student_id,
    )


@router.post("/student-cards/{card_id}/archive")
async def archive_student_card(
    card_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_sales_admin_owner(current_user)
    card = db.query(StudentCard).filter(StudentCard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Карточка не найдена")
    card.archived = True
    db.commit()
    return {"archived": True}


@router.post("/student-cards/{card_id}/unarchive")
async def unarchive_student_card(
    card_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_sales_admin_owner(current_user)
    card = db.query(StudentCard).filter(StudentCard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Карточка не найдена")
    card.archived = False
    db.commit()
    return {"archived": False}


@router.post("/student-cards/{card_id}/open-parent-cabinet", response_model=OpenParentCabinetResponse)
async def open_parent_cabinet_from_card(
    card_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """
    Карточка во главе: по карточке создаём/привязываем ученика и родителя, открываем кабинет.
    Если у карточки нет student_id — создаётся Student из ФИО карточки.
    Если у ученика нет parent_id — создаётся или находится родитель по email карточки, при необходимости отправляется приглашение.
    База (оценки, характеристики) не меняется.
    """
    _require_sales_admin_owner(current_user)
    card = db.query(StudentCard).filter(StudentCard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Карточка не найдена")
    parent_email = (getattr(card, "parent_email", None) or "").strip().lower()
    if not parent_email:
        raise HTTPException(
            status_code=400,
            detail="Укажите email родителя в карточке (поле «Email родителя»), чтобы открыть кабинет.",
        )
    parent_full_name = (getattr(card, "parent_full_name", None) or "").strip() or "Родитель"

    if not getattr(card, "student_id", None):
        student = Student(
            full_name=(card.student_full_name or "").strip() or "Ученик",
            status=StudentStatus.ACTIVE,
        )
        db.add(student)
        db.flush()
        card.student_id = student.id
        db.add(card)
        db.flush()
    else:
        student = db.query(Student).filter(Student.id == card.student_id).first()
        if not student:
            raise HTTPException(status_code=404, detail="Ученик по карточке не найден")

    if student.parent_id:
        db.commit()
        return OpenParentCabinetResponse(
            already_open=True,
            student_id=student.id,
            parent_id=student.parent_id,
        )

    parent_user = db.query(User).filter(
        User.email == parent_email,
        User.role == UserRole.PARENT,
    ).first()
    if parent_user:
        student.parent_id = parent_user.id
        db.add(student)
        db.commit()
        return OpenParentCabinetResponse(
            already_open=False,
            student_id=student.id,
            parent_id=parent_user.id,
        )

    try:
        parent_user, invite_link = create_parent_with_invite(db, parent_email, parent_full_name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    student.parent_id = parent_user.id
    db.add(student)
    db.commit()
    log_action(db, current_user.id, "open_parent_cabinet", "student_card", card_id, {"student_id": student.id, "parent_id": parent_user.id})
    return OpenParentCabinetResponse(
        already_open=False,
        student_id=student.id,
        parent_id=parent_user.id,
        invite_link=invite_link,
    )


@router.get("/students-for-cards", response_model=List[Dict])
async def list_students_for_cards(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Список учеников (id, full_name) для привязки к карточке. ФИО из карточки, если привязана."""
    _require_sales_admin_owner(current_user)
    students = db.query(Student).filter(Student.status == StudentStatus.ACTIVE).order_by(Student.full_name).all()
    if not students:
        return []
    display_names = get_students_display_names(db, [s.id for s in students])
    return [{"id": s.id, "full_name": display_names.get(s.id, s.full_name)} for s in students]


def _get_student_program_name(db: Session, student_id: int, fallback_group_id: Optional[int] = None) -> Optional[str]:
    """Программа ученика (источник правды для отработок). Сначала student_programs, иначе программа группы."""
    sp = db.query(StudentProgram).filter(
        StudentProgram.student_id == student_id,
        StudentProgram.status == "active",
    ).first()
    if sp and sp.program:
        return sp.program.name
    if fallback_group_id:
        gp = db.query(GroupProgram).filter(GroupProgram.group_id == fallback_group_id).first()
        if gp and gp.program:
            return gp.program.name
    return None


def _absence_to_response(db: Session, a: AbsenceFollowUp) -> AbsenceFollowUpResponse:
    student = db.query(Student).filter(Student.id == a.student_id).first()
    group = db.query(Group).filter(Group.id == a.group_id).first()
    makeup_group = db.query(Group).filter(Group.id == a.makeup_group_id).first() if a.makeup_group_id else None
    makeup_custom_lesson = None
    if getattr(a, "makeup_custom_lesson_id", None):
        makeup_custom_lesson = db.query(CustomLesson).filter(CustomLesson.id == a.makeup_custom_lesson_id).first()
    return AbsenceFollowUpResponse(
        id=a.id,
        lesson_attendance_id=a.lesson_attendance_id,
        student_id=a.student_id,
        group_id=a.group_id,
        lesson_date=a.lesson_date,
        stage=a.stage,
        absence_reason=getattr(a, "absence_reason", None),
        absence_comment=getattr(a, "absence_comment", None),
        makeup_group_id=getattr(a, "makeup_group_id", None),
        makeup_lesson_date=getattr(a, "makeup_lesson_date", None),
        makeup_custom_lesson_id=getattr(a, "makeup_custom_lesson_id", None),
        makeup_custom_lesson_title=makeup_custom_lesson.title if makeup_custom_lesson else None,
        created_at=a.created_at,
        updated_at=a.updated_at,
        student_name=get_student_display_name(db, student) if student else None,
        group_name=group.name if group else None,
        program_name=_get_student_program_name(db, a.student_id, a.group_id),
        makeup_group_name=makeup_group.name if makeup_group else None,
    )


@router.get("/absences", response_model=List[AbsenceFollowUpResponse])
async def list_absences(
    stage: Optional[str] = Query(None, description="Фильтр по этапу: missed, assigned, made_up, missed_makeup"),
    student_id: Optional[int] = Query(None, description="Фильтр по ученику"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_sales_admin_owner(current_user)
    query = db.query(AbsenceFollowUp).order_by(AbsenceFollowUp.lesson_date.desc(), AbsenceFollowUp.id.desc())
    if stage:
        query = query.filter(AbsenceFollowUp.stage == stage)
    if student_id is not None:
        query = query.filter(AbsenceFollowUp.student_id == student_id)
    items = query.all()
    if not items:
        return []

    # Bulk-загрузка всех связанных сущностей вместо N+1 запросов в _absence_to_response
    _student_ids = list({a.student_id for a in items if a.student_id})
    _group_ids = list({g for a in items for g in (a.group_id, getattr(a, "makeup_group_id", None)) if g})
    _lesson_ids = [a.makeup_custom_lesson_id for a in items if getattr(a, "makeup_custom_lesson_id", None)]

    _students_map = {s.id: s for s in db.query(Student).filter(Student.id.in_(_student_ids)).all()} if _student_ids else {}
    _display_names = get_students_display_names(db, _student_ids)
    _groups_map = {g.id: g for g in db.query(Group).filter(Group.id.in_(_group_ids)).all()} if _group_ids else {}
    _lessons_map = {l.id: l for l in db.query(CustomLesson).filter(CustomLesson.id.in_(_lesson_ids)).all()} if _lesson_ids else {}

    # Программы: StudentProgram → fallback GroupProgram
    _sp_rows = (
        db.query(StudentProgram)
        .options(joinedload(StudentProgram.program))
        .filter(StudentProgram.student_id.in_(_student_ids), StudentProgram.status == "active")
        .all()
    ) if _student_ids else []
    _sp_by_student = {sp.student_id: sp for sp in _sp_rows}
    _no_prog_group_ids = list({a.group_id for a in items if a.group_id and a.student_id not in _sp_by_student})
    _gp_rows = (
        db.query(GroupProgram)
        .options(joinedload(GroupProgram.program))
        .filter(GroupProgram.group_id.in_(_no_prog_group_ids))
        .all()
    ) if _no_prog_group_ids else []
    _gp_by_group = {gp.group_id: gp for gp in _gp_rows}

    def _prog_name(sid: int, gid: Optional[int]) -> Optional[str]:
        sp = _sp_by_student.get(sid)
        if sp and sp.program:
            return sp.program.name
        if gid:
            gp = _gp_by_group.get(gid)
            if gp and gp.program:
                return gp.program.name
        return None

    return [
        AbsenceFollowUpResponse(
            id=a.id,
            lesson_attendance_id=a.lesson_attendance_id,
            student_id=a.student_id,
            group_id=a.group_id,
            lesson_date=a.lesson_date,
            stage=a.stage,
            absence_reason=getattr(a, "absence_reason", None),
            absence_comment=getattr(a, "absence_comment", None),
            makeup_group_id=getattr(a, "makeup_group_id", None),
            makeup_lesson_date=getattr(a, "makeup_lesson_date", None),
            makeup_custom_lesson_id=getattr(a, "makeup_custom_lesson_id", None),
            makeup_custom_lesson_title=_lessons_map[a.makeup_custom_lesson_id].title if getattr(a, "makeup_custom_lesson_id", None) and a.makeup_custom_lesson_id in _lessons_map else None,
            created_at=a.created_at,
            updated_at=a.updated_at,
            student_name=_display_names.get(a.student_id) if a.student_id else None,
            group_name=_groups_map[a.group_id].name if a.group_id and a.group_id in _groups_map else None,
            program_name=_prog_name(a.student_id, a.group_id) if a.student_id else None,
            makeup_group_name=_groups_map[a.makeup_group_id].name if getattr(a, "makeup_group_id", None) and a.makeup_group_id in _groups_map else None,
        )
        for a in items
    ]


@router.patch("/absences/{absence_id}", response_model=AbsenceFollowUpResponse)
async def update_absence_stage(
    absence_id: int,
    payload: AbsenceFollowUpStageUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_sales_admin_owner(current_user)
    valid_stages = ("missed", "assigned", "link_sent", "made_up", "missed_makeup")
    if payload.stage not in valid_stages:
        raise HTTPException(status_code=400, detail=f"stage должен быть один из: {valid_stages}")
    absence = db.query(AbsenceFollowUp).filter(AbsenceFollowUp.id == absence_id).first()
    if not absence:
        raise HTTPException(status_code=404, detail="Пропуск не найден")
    absence.stage = payload.stage
    if payload.stage == "missed_makeup":
        absence.makeup_group_id = None
        absence.makeup_lesson_date = None
    db.commit()
    db.refresh(absence)
    return _absence_to_response(db, absence)


@router.post("/absences/{absence_id}/assign-makeup", response_model=AbsenceFollowUpResponse)
async def assign_makeup(
    absence_id: int,
    payload: AbsenceMakeupAssign,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Назначить отработку на группу и дату занятия (ТЗ п.5.5)."""
    _require_sales_admin_owner(current_user)
    try:
        result = absence_makeup_assign(
            db,
            absence_id,
            makeup_group_id=payload.makeup_group_id,
            makeup_lesson_date=payload.makeup_lesson_date,
        )
    except ValueError as e:
        msg = str(e)
        if "не найден" in msg.lower():
            raise HTTPException(status_code=404, detail=msg)
        raise HTTPException(status_code=400, detail=msg)
    return _absence_to_response(db, result.absence)


@router.get("/absences/{absence_id}/suggest-makeups", response_model=List[MakeupSuggestionItem])
async def suggest_makeups(
    absence_id: int,
    days_ahead: int = Query(30, ge=7, le=60),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Подбор вариантов отработки по совместимости программ (ТЗ п.5). Окно 14–30 дней по умолчанию 30."""
    _require_sales_admin_owner(current_user)
    absence = db.query(AbsenceFollowUp).filter(AbsenceFollowUp.id == absence_id).first()
    if not absence:
        raise HTTPException(status_code=404, detail="Пропуск не найден")
    student_id = absence.student_id
    today = date.today()
    end_date = today + timedelta(days=days_ahead)
    student_programs = db.query(StudentProgram).filter(
        StudentProgram.student_id == student_id,
        StudentProgram.status == "active",
    ).all()
    source_program_ids = [sp.program_id for sp in student_programs if sp.program_id]
    if not source_program_ids:
        group_prog = db.query(GroupProgram).filter(GroupProgram.group_id == absence.group_id).first()
        if group_prog:
            source_program_ids = [group_prog.program_id]
    allowed_target_ids = set()
    for pid in source_program_ids:
        compats = db.query(ProgramMakeupCompatibility).filter(
            ProgramMakeupCompatibility.source_program_id == pid,
        ).all()
        for c in compats:
            allowed_target_ids.add(c.target_program_id)
    if not allowed_target_ids and source_program_ids:
        allowed_target_ids = set(source_program_ids)
    group_ids = list({
        row[0] for row in db.query(GroupProgram.group_id).filter(
            GroupProgram.program_id.in_(allowed_target_ids),
        ).distinct().all()
    }) if allowed_target_ids else []
    groups_active = db.query(Group).filter(Group.id.in_(group_ids), Group.status == "active").all() if group_ids else []
    # Исключаем индивидуальные группы из вариантов отработки (ТЗ)
    groups_active = [g for g in groups_active if "индивид" not in (g.name or "").lower()]
    group_ids = [g.id for g in groups_active]
    slots = []
    for sched in db.query(GroupSchedule).filter(GroupSchedule.group_id.in_(group_ids)).all():
        for d in range((end_date - today).days + 1):
            lesson_date = today + timedelta(days=d)
            if lesson_date.weekday() == sched.day_of_week:
                slots.append((sched.group_id, lesson_date, sched.start_time))
    result = []
    seen = set()
    for group_id, lesson_date, start_time in sorted(slots, key=lambda x: (x[1], x[2] or dt_time(0, 0))):
        if (group_id, lesson_date) in seen:
            continue
        seen.add((group_id, lesson_date))
        group = next((g for g in groups_active if g.id == group_id), None) or db.query(Group).filter(Group.id == group_id).first()
        if not group:
            continue
        gp = db.query(GroupProgram).filter(GroupProgram.group_id == group_id).first()
        program_name = gp.program.name if gp and gp.program else None
        result.append(MakeupSuggestionItem(
            group_id=group_id,
            group_name=group.name,
            program_name=program_name,
            lesson_date=lesson_date,
            day_of_week=lesson_date.weekday(),
            start_time=start_time.strftime("%H:%M") if start_time else None,
        ))
    return result[:50]


def _require_owner(user: User) -> None:
    """Только owner (ТЗ: заморозка, закрытие по факту)."""
    if user.role != UserRole.OWNER:
        raise HTTPException(status_code=403, detail="Только owner")


def _require_owner_or_admin_settings(user: User) -> None:
    """Owner или admin (настройки отработок, без lead)."""
    if user.role not in (UserRole.OWNER, UserRole.ADMIN):
        raise HTTPException(status_code=403, detail="Только owner или admin")


@router.get("/payment-status", response_model=List[PaymentStatusItem])
async def list_payment_status(
    status_filter: Optional[str] = Query(None, description="overdue | due_soon | ok | все"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_sales_admin_owner),
):
    """Раздел «Долги» для менеджера (п.8.2, 12.2): ученики с датой следующей оплаты и статусом."""
    items = payment_status_list_svc(db, status_filter=status_filter)
    return [PaymentStatusItem(**item) for item in items]


@router.get("/payment-status-summary", response_model=PaymentStatusSummary)
async def get_payment_status_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_sales_admin_owner),
):
    """Сводка по просрочкам: число учеников с долгом 3+ и 10+ дней (для KPI на странице «Долги»)."""
    data = payment_status_summary_svc(db)
    return PaymentStatusSummary(**data)


# --- Custom (manual) lessons for sales/admin/owner ---


def _custom_lesson_to_response(db: Session, lesson: CustomLesson) -> CustomLessonResponse:
    trainer = db.query(User).filter(User.id == lesson.trainer_id).first()
    students_rows = (
        db.query(CustomLessonStudent, Student)
        .join(Student, Student.id == CustomLessonStudent.student_id)
        .filter(CustomLessonStudent.lesson_id == lesson.id)
        .all()
    )
    students = []
    for cls, s in students_rows:
        students.append(
            {
                "id": cls.id,
                "student_id": cls.student_id,
                "student_name": get_student_display_name(db, s) if s else None,
                "planned_absence_id": cls.planned_absence_id,
                "attended": bool(getattr(cls, "attended", False)),
                "absence_reason": getattr(cls, "absence_reason", None),
                "absence_comment": getattr(cls, "absence_comment", None),
            }
        )
    return CustomLessonResponse(
        id=lesson.id,
        title=lesson.title,
        lesson_date=lesson.lesson_date,
        start_time=_serialize_time_for_api(lesson.start_time) or "",
        end_time=_serialize_time_for_api(lesson.end_time),
        trainer_id=lesson.trainer_id,
        trainer_name=trainer.full_name if trainer else None,
        lesson_type=lesson.lesson_type.value if isinstance(lesson.lesson_type, CustomLessonType) else str(lesson.lesson_type),
        comment=lesson.comment,
        students=students,
    )


@router.post("/custom-lessons", response_model=CustomLessonResponse, status_code=status.HTTP_201_CREATED)
async def create_custom_lesson(
    payload: CustomLessonCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    """Создать ручной урок без группы (отработка / доп.урок / пробное). Только admin/owner/sales."""
    _require_sales_admin_owner(current_user)

    try:
        start_t = datetime.strptime(payload.start_time.strip(), "%H:%M").time()
        end_t = None
        if payload.end_time:
            end_t = datetime.strptime(payload.end_time.strip(), "%H:%M").time()
    except ValueError:
        raise HTTPException(status_code=400, detail="Время укажите в формате HH:MM")

    lesson_type_value = payload.lesson_type or "makeup"
    if lesson_type_value not in {t.value for t in CustomLessonType}:
        raise HTTPException(status_code=400, detail=f"lesson_type должен быть одним из: {[t.value for t in CustomLessonType]}")

    students_tuples = [
        (item.student_id, item.planned_absence_id)
        for item in (payload.students or [])
    ]
    try:
        result = manual_lesson_create(
            db,
            title=payload.title,
            lesson_date=payload.lesson_date,
            start_time=start_t,
            end_time=end_t,
            trainer_id=payload.trainer_id,
            lesson_type=lesson_type_value,
            comment=payload.comment,
            students=students_tuples,
            created_by_id=current_user.id,
        )
    except ValueError as e:
        msg = str(e)
        if "не найден" in msg.lower():
            raise HTTPException(status_code=404, detail=msg)
        raise HTTPException(status_code=400, detail=msg)
    return _custom_lesson_to_response(db, result.lesson)


@router.get("/custom-lessons", response_model=List[CustomLessonResponse])
async def list_custom_lessons(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    trainer_id: Optional[int] = Query(None),
    student_id: Optional[int] = Query(None),
    lesson_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    """Список ручных уроков для менеджера (admin/owner/sales)."""
    _require_sales_admin_owner(current_user)
    query = db.query(CustomLesson)
    if date_from:
        query = query.filter(CustomLesson.lesson_date >= date_from)
    if date_to:
        query = query.filter(CustomLesson.lesson_date <= date_to)
    if trainer_id:
        query = query.filter(CustomLesson.trainer_id == trainer_id)
    if lesson_type:
        query = query.filter(CustomLesson.lesson_type == lesson_type)
    lessons = query.order_by(CustomLesson.lesson_date.desc(), CustomLesson.start_time.asc()).all()

    # Фильтр по ученику через связку
    if student_id is not None:
        lesson_ids = {
            ls.lesson_id
            for ls in db.query(CustomLessonStudent).filter(CustomLessonStudent.student_id == student_id).all()
        }
        lessons = [l for l in lessons if l.id in lesson_ids]

    if not lessons:
        return []

    # Bulk-загрузка тренеров, учеников и имён — вместо N+1 на каждый урок
    trainer_ids = {l.trainer_id for l in lessons if l.trainer_id}
    trainer_map = (
        {u.id: u for u in db.query(User).filter(User.id.in_(trainer_ids)).all()}
        if trainer_ids else {}
    )
    all_lesson_ids = [l.id for l in lessons]
    cls_rows = (
        db.query(CustomLessonStudent, Student)
        .join(Student, Student.id == CustomLessonStudent.student_id)
        .filter(CustomLessonStudent.lesson_id.in_(all_lesson_ids))
        .all()
    )
    all_student_ids = [s.id for _, s in cls_rows if s]
    display_names = get_students_display_names(db, all_student_ids)
    students_by_lesson: Dict[int, list] = {l.id: [] for l in lessons}
    for cls, s in cls_rows:
        students_by_lesson[cls.lesson_id].append({
            "id": cls.id,
            "student_id": cls.student_id,
            "student_name": display_names.get(s.id) if s else None,
            "planned_absence_id": cls.planned_absence_id,
            "attended": bool(getattr(cls, "attended", False)),
            "absence_reason": getattr(cls, "absence_reason", None),
            "absence_comment": getattr(cls, "absence_comment", None),
        })
    return [
        CustomLessonResponse(
            id=l.id,
            title=l.title,
            lesson_date=l.lesson_date,
            start_time=_serialize_time_for_api(l.start_time) or "",
            end_time=_serialize_time_for_api(l.end_time),
            trainer_id=l.trainer_id,
            trainer_name=trainer_map[l.trainer_id].full_name if l.trainer_id and l.trainer_id in trainer_map else None,
            lesson_type=l.lesson_type.value if isinstance(l.lesson_type, CustomLessonType) else str(l.lesson_type),
            comment=l.comment,
            students=students_by_lesson.get(l.id, []),
        )
        for l in lessons
    ]


@router.get("/custom-lessons/{lesson_id}", response_model=CustomLessonResponse)
async def get_custom_lesson(
    lesson_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    _require_sales_admin_owner(current_user)
    lesson = db.query(CustomLesson).filter(CustomLesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Ручной урок не найден")
    return _custom_lesson_to_response(db, lesson)


@router.put("/custom-lessons/{lesson_id}", response_model=CustomLessonResponse)
async def update_custom_lesson(
    lesson_id: int,
    payload: CustomLessonUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    """Редактирование ручного урока. Только admin/owner/sales."""
    _require_sales_admin_owner(current_user)
    lesson = db.query(CustomLesson).filter(CustomLesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Ручной урок не найден")

    if payload.title is not None:
        lesson.title = payload.title.strip()
    if payload.lesson_date is not None:
        lesson.lesson_date = payload.lesson_date
    if payload.start_time is not None:
        try:
            lesson.start_time = datetime.strptime(payload.start_time.strip(), "%H:%M").time()
        except ValueError:
            raise HTTPException(status_code=400, detail="start_time: формат HH:MM")
    if payload.end_time is not None:
        if payload.end_time == "":
            lesson.end_time = None
        else:
            try:
                lesson.end_time = datetime.strptime(payload.end_time.strip(), "%H:%M").time()
            except ValueError:
                raise HTTPException(status_code=400, detail="end_time: формат HH:MM")
    if payload.trainer_id is not None:
        trainer = db.query(User).filter(User.id == payload.trainer_id).first()
        if not trainer:
            raise HTTPException(status_code=404, detail="Тренер не найден")
        lesson.trainer_id = payload.trainer_id
    if payload.lesson_type is not None:
        if payload.lesson_type not in {t.value for t in CustomLessonType}:
            raise HTTPException(status_code=400, detail=f"lesson_type должен быть одним из: {[t.value for t in CustomLessonType]}")
        lesson.lesson_type = CustomLessonType(payload.lesson_type)
    if payload.comment is not None:
        lesson.comment = payload.comment.strip() or None

    # Обновление списка учеников: если передан payload.students — пересобираем список
    if payload.students is not None:
        existing = db.query(CustomLessonStudent).filter(CustomLessonStudent.lesson_id == lesson.id).all()
        existing_by_student = {(e.student_id, e.planned_absence_id): e for e in existing}
        db.query(CustomLessonStudent).filter(CustomLessonStudent.lesson_id == lesson.id).delete(synchronize_session=False)

        for item in payload.students:
            student = db.query(Student).filter(Student.id == item.student_id).first()
            if not student:
                raise HTTPException(status_code=404, detail=f"Ученик {item.student_id} не найден")
            planned_absence_id = item.planned_absence_id
            if planned_absence_id is not None:
                absence = db.query(AbsenceFollowUp).filter(AbsenceFollowUp.id == planned_absence_id).first()
                if not absence or absence.student_id != item.student_id:
                    raise HTTPException(status_code=400, detail=f"Пропуск {planned_absence_id} не найден для этого ученика")
            # Сбрасываем посещаемость при полном пересборе списка
            cls = CustomLessonStudent(
                lesson_id=lesson.id,
                student_id=item.student_id,
                planned_absence_id=planned_absence_id,
                attended=False,
            )
            db.add(cls)

    db.commit()
    db.refresh(lesson)
    return _custom_lesson_to_response(db, lesson)


@router.delete("/custom-lessons/{lesson_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_custom_lesson(
    lesson_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    """Удалить ручной урок. Только admin/owner/sales."""
    _require_sales_admin_owner(current_user)
    lesson = db.query(CustomLesson).filter(CustomLesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Ручной урок не найден")
    db.query(CustomLessonStudent).filter(CustomLessonStudent.lesson_id == lesson.id).delete(synchronize_session=False)
    db.delete(lesson)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/program-makeup-compatibility", response_model=List[ProgramMakeupCompatibilityResponse])
async def list_program_makeup_compatibility(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Список правил совместимости программ для отработок (ТЗ п.5.3). Owner/admin."""
    _require_owner_or_admin_settings(current_user)
    items = db.query(ProgramMakeupCompatibility).order_by(
        ProgramMakeupCompatibility.source_program_id,
        ProgramMakeupCompatibility.target_program_id,
    ).all()
    result = []
    for c in items:
        src = db.query(Program).filter(Program.id == c.source_program_id).first()
        tgt = db.query(Program).filter(Program.id == c.target_program_id).first()
        result.append(ProgramMakeupCompatibilityResponse(
            id=c.id,
            source_program_id=c.source_program_id,
            target_program_id=c.target_program_id,
            source_program_name=src.name if src else None,
            target_program_name=tgt.name if tgt else None,
        ))
    return result


@router.post("/program-makeup-compatibility", response_model=ProgramMakeupCompatibilityResponse, status_code=status.HTTP_201_CREATED)
async def create_program_makeup_compatibility(
    payload: ProgramMakeupCompatibilityCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Добавить правило: программа source может отрабатывать в программе target. Owner/admin."""
    _require_owner_or_admin_settings(current_user)
    for pid in (payload.source_program_id, payload.target_program_id):
        if not db.query(Program).filter(Program.id == pid).first():
            raise HTTPException(status_code=404, detail=f"Программа {pid} не найдена")
    compat = ProgramMakeupCompatibility(
        source_program_id=payload.source_program_id,
        target_program_id=payload.target_program_id,
    )
    db.add(compat)
    db.commit()
    db.refresh(compat)
    src = db.query(Program).filter(Program.id == compat.source_program_id).first()
    tgt = db.query(Program).filter(Program.id == compat.target_program_id).first()
    return ProgramMakeupCompatibilityResponse(
        id=compat.id,
        source_program_id=compat.source_program_id,
        target_program_id=compat.target_program_id,
        source_program_name=src.name if src else None,
        target_program_name=tgt.name if tgt else None,
    )


@router.delete("/program-makeup-compatibility/{compat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_program_makeup_compatibility(
    compat_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Удалить правило совместимости. Owner/admin."""
    _require_owner_or_admin_settings(current_user)
    compat = db.query(ProgramMakeupCompatibility).filter(ProgramMakeupCompatibility.id == compat_id).first()
    if not compat:
        raise HTTPException(status_code=404, detail="Правило не найдено")
    db.delete(compat)
    db.commit()


@router.get("/students/{student_id}/freezes", response_model=List[StudentFreezeResponse])
async def list_student_freezes(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Список заморозок ученика. Sales/admin/owner."""
    _require_sales_admin_owner(current_user)
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")
    freezes = db.query(StudentFreeze).filter(StudentFreeze.student_id == student_id).order_by(StudentFreeze.freeze_start.desc()).all()
    return [StudentFreezeResponse(id=f.id, student_id=f.student_id, freeze_start=f.freeze_start, freeze_end=f.freeze_end, created_at=f.created_at) for f in freezes]


@router.post("/students/{student_id}/freezes", response_model=StudentFreezeResponse, status_code=status.HTTP_201_CREATED)
async def create_student_freeze(
    student_id: int,
    payload: StudentFreezeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Поставить заморозку (ТЗ п.7). Только owner. Сдвиг периода — при необходимости обновить next_payment_date вручную или отдельным правилом."""
    _require_owner(current_user)
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")
    if payload.freeze_end <= payload.freeze_start:
        raise HTTPException(status_code=400, detail="freeze_end должна быть больше freeze_start")
    freeze = StudentFreeze(student_id=student_id, freeze_start=payload.freeze_start, freeze_end=payload.freeze_end)
    db.add(freeze)
    card = db.query(StudentCard).filter(StudentCard.student_id == student_id).first()
    if card and getattr(card, "next_payment_date", None):
        delta = (payload.freeze_end - payload.freeze_start).days
        card.next_payment_date = card.next_payment_date + timedelta(days=delta)
    db.commit()
    db.refresh(freeze)
    return StudentFreezeResponse(id=freeze.id, student_id=freeze.student_id, freeze_start=freeze.freeze_start, freeze_end=freeze.freeze_end, created_at=freeze.created_at)


@router.delete("/students/{student_id}/freezes/{freeze_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_student_freeze(
    student_id: int,
    freeze_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Снять заморозку. Только owner."""
    _require_owner(current_user)
    freeze = db.query(StudentFreeze).filter(StudentFreeze.id == freeze_id, StudentFreeze.student_id == student_id).first()
    if not freeze:
        raise HTTPException(status_code=404, detail="Заморозка не найдена")
    db.delete(freeze)
    db.commit()


@router.get("/students/{student_id}/close-by-fact-preview", response_model=CloseByFactPreview)
async def close_by_fact_preview(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Предпросмотр: сколько занятий посещено в текущем периоде и сумма к оплате (ТЗ п.9). Только owner."""
    _require_owner(current_user)
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")
    card = db.query(StudentCard).filter(StudentCard.student_id == student_id).first()
    period_start = getattr(card, "learning_period_start", None) if card else None
    if not period_start:
        period_start = date.today() - timedelta(days=30)
    period_end = date.today()
    attended = db.query(LessonAttendance).filter(
        LessonAttendance.student_id == student_id,
        LessonAttendance.attended.is_(True),
        LessonAttendance.lesson_date >= period_start,
        LessonAttendance.lesson_date <= period_end,
    ).count()
    abonement = student.abonement or (db.query(Abonement).filter(Abonement.id == student.abonement_id).first() if student.abonement_id else None)
    if not card and student.abonement_id:
        abonement = db.query(Abonement).filter(Abonement.id == student.abonement_id).first()
    if card and getattr(card, "abonement_id", None):
        abonement = db.query(Abonement).filter(Abonement.id == card.abonement_id).first() or abonement
    price_per_lesson = 0.0
    if abonement and (abonement.lessons_count or 8) > 0:
        price_per_lesson = float(abonement.price or 0) / (abonement.lessons_count or 8)
    amount = round(price_per_lesson * attended, 2)
    return CloseByFactPreview(
        lessons_attended_in_period=attended,
        amount=amount,
        period_start=period_start,
        period_end=period_end,
    )


@router.post("/students/{student_id}/close-by-fact")
async def close_by_fact_confirm(
    student_id: int,
    payload: CloseByFactConfirm,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Закрыть ученика с оплатой по факту (ТЗ п.9). Только owner. Фиксирует оплату, архивирует, снимает пропуски с очереди."""
    _require_owner(current_user)
    if not payload.confirm:
        raise HTTPException(status_code=400, detail="Подтвердите закрытие")
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")
    card = db.query(StudentCard).filter(StudentCard.student_id == student_id).first()
    period_start = getattr(card, "learning_period_start", None) if card else None
    if not period_start:
        period_start = date.today() - timedelta(days=30)
    period_end = date.today()
    attended = db.query(LessonAttendance).filter(
        LessonAttendance.student_id == student_id,
        LessonAttendance.attended.is_(True),
        LessonAttendance.lesson_date >= period_start,
        LessonAttendance.lesson_date <= period_end,
    ).count()
    abonement = student.abonement or (db.query(Abonement).filter(Abonement.id == student.abonement_id).first() if student.abonement_id else None)
    if card and getattr(card, "abonement_id", None):
        abonement = db.query(Abonement).filter(Abonement.id == card.abonement_id).first() or abonement
    price_per_lesson = float(abonement.price or 0) / (abonement.lessons_count or 8) if abonement and (abonement.lessons_count or 8) > 0 else 0.0
    amount = round(price_per_lesson * attended, 2)
    account = db.query(StudentAccount).filter(StudentAccount.student_id == student_id).order_by(StudentAccount.id).first()
    if account and amount > 0:
        db.add(StudentAccountTransaction(
            account_id=account.id,
            amount=amount,
            kind=StudentAccountTransactionKind.PAYMENT,
            note=f"Закрытие по факту: {attended} занятий за период {period_start}–{period_end}",
        ))
        account.balance += amount
    for a in db.query(AbsenceFollowUp).filter(AbsenceFollowUp.student_id == student_id).all():
        a.stage = "made_up"
    if card:
        card.archived = True
    student.status = StudentStatus.ARCHIVED
    db.commit()
    return {"ok": True, "student_id": student_id, "amount": amount, "lessons_attended": attended}


def _require_owner_or_admin(lead: Lead, user: User) -> None:
    if user.role in (UserRole.ADMIN, UserRole.OWNER, UserRole.SALES):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")


def _filter_query_by_role(query, user: User):
    if user.role in (UserRole.ADMIN, UserRole.OWNER, UserRole.SALES):
        return query
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")


def _compute_price(abonement: Abonement) -> float:
    price = abonement.price or 0.0
    if abonement.discount_type is None:
        return price
    if hasattr(abonement, "discount_type"):
        dt = getattr(abonement.discount_type, "value", abonement.discount_type)
        if dt == "amount":
            price = max(price - (abonement.discount_value or 0.0), 0.0)
        elif dt == "percent":
            price = price * (1 - (abonement.discount_value or 0.0) / 100)
    return round(price, 2)


def _normalize_source_name(name: Optional[str]) -> Optional[str]:
    if not name:
        return None
    return " ".join(name.strip().split())


def _is_referral_source(name: Optional[str]) -> bool:
    return (name or "").strip().lower() == "рекомендация"


def _resolve_source(
    db: Session,
    source_id: Optional[int] = None,
    source_name: Optional[str] = None,
) -> Tuple[Optional[int], Optional[str]]:
    normalized = _normalize_source_name(source_name)
    if source_id:
        source_obj = db.query(LeadSource).filter(LeadSource.id == source_id).first()
        if not source_obj:
            raise HTTPException(status_code=404, detail="Lead source not found")
        return source_obj.id, source_obj.name
    if normalized:
        source_obj = db.query(LeadSource).filter(cast(LeadSource.name, Text).ilike(normalized)).first()
        if source_obj:
            return source_obj.id, source_obj.name
        return None, normalized
    return None, None


def _append_note_tag(note: Optional[str], tag: str) -> str:
    source = (note or "").strip()
    if tag in source:
        return source
    return f"{tag} {source}".strip()


def _remove_note_tag(note: Optional[str], tag: str) -> str:
    """Удалить тег из заметки (без учёта регистра), сохранив остальной текст."""
    if not note:
        return ""
    lower_tag = tag.lower()
    parts = [p for p in note.split() if p.lower() != lower_tag]
    return " ".join(parts).strip()


def _get_default_open_status_option_id(db: Session) -> Optional[int]:
    default_open = (
        db.query(LeadTaskStatusOptionModel)
        .filter(
            LeadTaskStatusOptionModel.is_active.is_(True),
            LeadTaskStatusOptionModel.is_closed.is_(False),
        )
        .order_by(LeadTaskStatusOptionModel.id.asc())
        .first()
    )
    return default_open.id if default_open else None


def _get_default_lead_status_option_id(db: Session, base_status: LeadStatus) -> Optional[int]:
    """Возвращает id первой активной опции статуса лида для данного base_status."""
    status_str = base_status.value if hasattr(base_status, "value") else str(base_status)
    opt = (
        db.query(LeadStatusOption)
        .filter(
            LeadStatusOption.base_status == status_str,
            LeadStatusOption.is_active.is_(True),
        )
        .order_by(LeadStatusOption.id.asc())
        .first()
    )
    return opt.id if opt else None


def _create_auto_event_task(
    db: Session,
    *,
    lead: Lead,
    owner_id: int,
    note: str,
    due_at: datetime,
    preferred_template_keywords: List[str],
) -> LeadTask:
    template = None
    templates = (
        db.query(LeadTaskTemplate)
        .filter(LeadTaskTemplate.is_active.is_(True))
        .order_by(LeadTaskTemplate.id.asc())
        .all()
    )
    for tpl in templates:
        name = (tpl.name or "").lower()
        if any(keyword in name for keyword in preferred_template_keywords):
            template = tpl
            break
    task = LeadTask(
        lead_id=lead.id,
        owner_id=owner_id,
        template_id=template.id if template else None,
        status_option_id=_get_default_open_status_option_id(db),
        note=note,
        channel="call",
        due_at=due_at,
        status=LeadTaskStatus.OPEN,
    )
    db.add(task)
    return task


def _has_open_task_like(db: Session, lead_id: int, marker: str) -> bool:
    return (
        db.query(LeadTask)
        .filter(
            LeadTask.lead_id == lead_id,
            LeadTask.status == LeadTaskStatus.OPEN,
            LeadTask.note.isnot(None),
            cast(LeadTask.note, Text).ilike(f"%{marker}%"),
        )
        .first()
        is not None
    )


ALLOWED_PAUSE_REASONS = {"ждём ответ", "подумать", "нет времени"}


@router.get("/dashboard", response_model=SalesDashboardResponse)
async def get_sales_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    now = datetime.utcnow()
    start_month = datetime(now.year, now.month, 1)
    end_month = datetime(now.year + (1 if now.month == 12 else 0), 1 if now.month == 12 else now.month + 1, 1)
    start_today = datetime(now.year, now.month, now.day)
    end_today = start_today + timedelta(days=1)
    next_two_hours = now + timedelta(hours=2)
    next_day = now + timedelta(hours=24)
    week_ago = now - timedelta(days=7)

    leads_q = _filter_query_by_role(db.query(Lead), current_user)
    tasks_q = (
        db.query(LeadTask)
        .options(joinedload(LeadTask.lead))
    )
    regs_q = db.query(EventRegistration).join(Lead, Lead.id == EventRegistration.lead_id)

    active_lead_statuses = [LeadStatus.NEW, LeadStatus.CONTACTED, LeadStatus.DEMO, LeadStatus.INVOICE_SENT]
    connected_statuses = [LeadStatus.CONTACTED, LeadStatus.DEMO, LeadStatus.INVOICE_SENT, LeadStatus.WON]

    # Все 7 KPI по лидам — одним запросом через условные агрегаты
    leads_kpi = leads_q.with_entities(
        func.count(case((and_(Lead.created_at >= start_today, Lead.created_at < end_today), 1))).label("new_leads"),
        func.count(case((Lead.created_at >= week_ago, 1))).label("week_total"),
        func.count(case((and_(Lead.created_at >= week_ago, Lead.status.in_(connected_statuses)), 1))).label("week_connected"),
        func.count(case((Lead.status.in_([LeadStatus.INVOICE_SENT, LeadStatus.WON]), 1))).label("info_sent"),
        func.count(case((and_(
            Lead.status.in_(active_lead_statuses),
            Lead.next_contact_at.isnot(None),
            Lead.next_contact_at >= now,
            Lead.next_contact_at < next_two_hours,
        ), 1))).label("push_urgent"),
        func.count(case((and_(
            Lead.status.in_(active_lead_statuses),
            Lead.next_contact_at.isnot(None),
            Lead.next_contact_at >= start_today,
            Lead.next_contact_at < end_today,
        ), 1))).label("push_today"),
        func.count(case((and_(
            Lead.status.in_(active_lead_statuses),
            Lead.next_contact_at.isnot(None),
            Lead.next_contact_at < now,
        ), 1))).label("push_overdue"),
    ).one()
    kpi_new_leads = leads_kpi.new_leads
    leads_week_total = leads_kpi.week_total
    leads_week_connected = leads_kpi.week_connected
    kpi_dozvon_percent = round((leads_week_connected / leads_week_total) * 100, 1) if leads_week_total else 0.0
    kpi_info_sent = leads_kpi.info_sent
    kpi_need_push_urgent = leads_kpi.push_urgent
    kpi_need_push_today = leads_kpi.push_today
    kpi_need_push_overdue = leads_kpi.push_overdue

    # Все 3 KPI по регистрациям — одним запросом
    regs_kpi = db.query(
        func.count(case((EventRegistration.status == EventRegistrationStatus.REGISTERED, 1))).label("registered"),
        func.count(case((cast(EventRegistration.note, Text).ilike("%[came]%"), 1))).label("came"),
        func.count(case((or_(
            cast(EventRegistration.note, Text).ilike("%[no-show]%"),
            cast(EventRegistration.note, Text).ilike("%no-show%"),
        ), 1))).label("no_show"),
    ).one()
    kpi_registered_event = regs_kpi.registered
    kpi_came_count = regs_kpi.came
    kpi_no_show_count = regs_kpi.no_show

    overdue_items = (
        tasks_q.filter(
            LeadTask.status == LeadTaskStatus.OPEN,
            LeadTask.due_at.isnot(None),
            LeadTask.due_at < now,
        )
        .order_by(LeadTask.due_at.asc())
        .limit(30)
        .all()
    )
    call_today_items = (
        tasks_q.filter(
            LeadTask.status == LeadTaskStatus.OPEN,
            LeadTask.due_at.isnot(None),
            LeadTask.due_at >= start_today,
            LeadTask.due_at < end_today,
        )
        .order_by(LeadTask.due_at.asc())
        .limit(30)
        .all()
    )
    messenger_items = (
        tasks_q.filter(
            LeadTask.status == LeadTaskStatus.OPEN,
            or_(
                cast(LeadTask.channel, Text).ilike("%messenger%"),
                cast(LeadTask.channel, Text).ilike("%telegram%"),
                cast(LeadTask.note, Text).ilike("%ответ%"),
            ),
        )
        .order_by(LeadTask.created_at.desc())
        .limit(30)
        .all()
    )
    confirm_items = (
        regs_q.join(Event, Event.id == EventRegistration.event_id)
        .filter(
            EventRegistration.status == EventRegistrationStatus.REGISTERED,
            Event.starts_at >= now,
            Event.starts_at < next_day,
        )
        .order_by(Event.starts_at.asc())
        .limit(30)
        .all()
    )
    # Предзагружаем события и лидов для confirm_items одним запросом (избегаем N+1)
    _confirm_event_ids = {item.event_id for item in confirm_items}
    _confirm_lead_ids = {item.lead_id for item in confirm_items}
    _events_map = {e.id: e for e in db.query(Event).filter(Event.id.in_(_confirm_event_ids)).all()} if _confirm_event_ids else {}
    _leads_map = {l.id: l for l in db.query(Lead).filter(Lead.id.in_(_confirm_lead_ids)).all()} if _confirm_lead_ids else {}

    # Загружаем только 4 нужных колонки, без полного ORM-объекта
    month_outreach_rows = (
        leads_q.filter(
            Lead.outreach_at.isnot(None),
            Lead.outreach_at >= start_month,
            Lead.outreach_at < end_month,
        )
        .with_entities(Lead.school_name, Lead.school_class, Lead.outreach_minutes, Lead.status)
        .all()
    )
    schools_seen = set()
    classes_seen = set()
    outreach_minutes_month = 0
    school_stats: Dict[str, Dict[str, object]] = {}
    for school_name, school_class, outreach_minutes, status in month_outreach_rows:
        school = (school_name or "").strip()
        class_name = (school_class or "").strip()
        if school:
            schools_seen.add(school)
        if school and class_name:
            classes_seen.add(f"{school}::{class_name}")
        if outreach_minutes and outreach_minutes > 0:
            outreach_minutes_month += outreach_minutes
        if not school:
            continue
        if school not in school_stats:
            school_stats[school] = {"leads": 0, "won": 0, "classes": set(), "minutes": 0}
        school_stats[school]["leads"] = int(school_stats[school]["leads"]) + 1
        if status == LeadStatus.WON:
            school_stats[school]["won"] = int(school_stats[school]["won"]) + 1
        if class_name:
            school_stats[school]["classes"].add(class_name)
        if outreach_minutes and outreach_minutes > 0:
            school_stats[school]["minutes"] = int(school_stats[school]["minutes"]) + outreach_minutes

    top_schools_conversion_month = sorted(
        [
            SalesSchoolConversionItem(
                school_name=school,
                leads_count=int(stats["leads"]),
                won_count=int(stats["won"]),
                conversion_percent=round((int(stats["won"]) / int(stats["leads"])) * 100) if int(stats["leads"]) else 0,
                classes_count=len(stats["classes"]),
                outreach_minutes_total=int(stats["minutes"]),
            )
            for school, stats in school_stats.items()
        ],
        key=lambda item: (item.conversion_percent, item.leads_count),
        reverse=True,
    )[:3]

    def map_task(item: LeadTask) -> SalesQueueTaskItem:
        lead = item.lead
        return SalesQueueTaskItem(
            task_id=item.id,
            lead_id=lead.id,
            lead_name=lead.contact_name,
            lead_phone=lead.phone,
            due_at=item.due_at,
            note=item.note,
        )

    def map_reg(item: EventRegistration) -> SalesQueueRegistrationItem:
        event = _events_map.get(item.event_id)
        lead = _leads_map.get(item.lead_id)
        return SalesQueueRegistrationItem(
            registration_id=item.id,
            event_id=item.event_id,
            event_title=event.title if event else f"Event #{item.event_id}",
            lead_id=item.lead_id,
            lead_name=lead.contact_name if lead else f"Lead #{item.lead_id}",
            starts_at=event.starts_at if event else now,
            note=item.note,
        )

    return SalesDashboardResponse(
        kpi_new_leads=kpi_new_leads,
        kpi_dozvon_percent=kpi_dozvon_percent,
        kpi_info_sent=kpi_info_sent,
        kpi_need_push_urgent=kpi_need_push_urgent,
        kpi_need_push_today=kpi_need_push_today,
        kpi_need_push_overdue=kpi_need_push_overdue,
        kpi_registered_event=kpi_registered_event,
        kpi_came_count=kpi_came_count,
        kpi_no_show_count=kpi_no_show_count,
        overdue_followups=[map_task(i) for i in overdue_items],
        call_today=[map_task(i) for i in call_today_items],
        messenger_replies=[map_task(i) for i in messenger_items],
        confirm_participation=[map_reg(i) for i in confirm_items],
        outreach_schools_month=len(schools_seen),
        outreach_classes_month=len(classes_seen),
        outreach_minutes_month=outreach_minutes_month,
        top_schools_conversion_month=top_schools_conversion_month,
    )


@router.get("/follow-ups", response_model=List[FollowUpItemResponse])
async def list_follow_ups(
    period: str = Query(default="today"),
    source: Optional[str] = None,
    event_id: Optional[int] = None,
    reason: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    now = datetime.utcnow()
    start_today = datetime(now.year, now.month, now.day)
    end_today = start_today + timedelta(days=1)
    start_tomorrow = end_today
    end_tomorrow = start_tomorrow + timedelta(days=1)
    end_week = end_today + timedelta(days=7)

    query = db.query(LeadTask, Lead).join(Lead, Lead.id == LeadTask.lead_id)
    query = query.filter(LeadTask.status == LeadTaskStatus.OPEN)

    if period == "overdue":
        query = query.filter(LeadTask.due_at.isnot(None), LeadTask.due_at < now)
    elif period == "tomorrow":
        query = query.filter(LeadTask.due_at.isnot(None), LeadTask.due_at >= start_tomorrow, LeadTask.due_at < end_tomorrow)
    elif period == "week":
        query = query.filter(LeadTask.due_at.isnot(None), LeadTask.due_at >= start_today, LeadTask.due_at < end_week)
    else:
        query = query.filter(LeadTask.due_at.isnot(None), LeadTask.due_at >= start_today, LeadTask.due_at < end_today)

    if source:
        query = query.filter(Lead.source.isnot(None), cast(Lead.source, Text).ilike(f"%{source.strip()}%"))
    if reason:
        query = query.filter(LeadTask.note.isnot(None), cast(LeadTask.note, Text).ilike(f"%{reason.strip()}%"))
    if event_id:
        query = query.join(EventRegistration, EventRegistration.lead_id == Lead.id).filter(
            EventRegistration.event_id == event_id,
            EventRegistration.status == EventRegistrationStatus.REGISTERED,
        )

    rows = query.order_by(LeadTask.due_at.asc()).limit(200).all()
    return [
        FollowUpItemResponse(
            task_id=task.id,
            lead_id=lead.id,
            lead_name=lead.contact_name,
            lead_phone=lead.phone,
            lead_source=lead.source,
            due_at=task.due_at,
            status=task.status,
            channel=task.channel,
            note=task.note,
        )
        for task, lead in rows
    ]


@router.get("/leads/push-stats", response_model=List[LeadPushStatsResponse])
async def get_leads_push_stats(
    lead_ids: List[int] = Query(default=[]),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    lead_query = _filter_query_by_role(db.query(Lead), current_user)
    if lead_ids:
        lead_query = lead_query.filter(Lead.id.in_(lead_ids))
    allowed_id_rows = lead_query.with_entities(Lead.id).all()
    if not allowed_id_rows:
        return []

    allowed_ids = [row[0] for row in allowed_id_rows]
    # Фильтруем «дожимные» задачи прямо в SQL — не тянем все задачи в Python
    tasks = (
        db.query(LeadTask)
        .outerjoin(LeadTaskTemplate, LeadTask.template_id == LeadTaskTemplate.id)
        .filter(
            LeadTask.lead_id.in_(allowed_ids),
            or_(
                cast(LeadTask.note, Text).ilike("%дожим%"),
                cast(LeadTask.note, Text).ilike("%push%"),
                cast(LeadTaskTemplate.name, Text).ilike("%дожим%"),
            ),
        )
        .all()
    )

    by_lead: Dict[int, Dict[str, int]] = {lead_id: {"total": 0, "done": 0} for lead_id in allowed_ids}
    for task in tasks:
        by_lead[task.lead_id]["total"] += 1
        if task.status == LeadTaskStatus.DONE:
            by_lead[task.lead_id]["done"] += 1

    response: List[LeadPushStatsResponse] = []
    for lead_id in allowed_ids:
        total = by_lead[lead_id]["total"]
        done = by_lead[lead_id]["done"]
        pct = round((done / total) * 100) if total else 0
        response.append(
            LeadPushStatsResponse(
                lead_id=lead_id,
                total_steps=total,
                done_steps=done,
                progress_percent=pct,
            )
        )
    return response


@router.get("/lead-sources", response_model=List[LeadSourceResponse])
async def list_lead_sources(
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    query = db.query(LeadSource).order_by(LeadSource.name.asc())
    if active_only:
        query = query.filter(LeadSource.is_active.is_(True))
    return query.all()


@router.post("/lead-sources", response_model=LeadSourceResponse, status_code=status.HTTP_201_CREATED)
async def create_lead_source(
    payload: LeadSourceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    name = _normalize_source_name(payload.name)
    if not name:
        raise HTTPException(status_code=400, detail="Source name is required")
    exists = db.query(LeadSource).filter(cast(LeadSource.name, Text).ilike(name)).first()
    if exists:
        raise HTTPException(status_code=400, detail="Source already exists")
    source = LeadSource(name=name, is_active=True)
    db.add(source)
    db.commit()
    db.refresh(source)
    log_action(db, current_user.id, "create", "lead_source", source.id, {"name": name})
    return source


@router.put("/lead-sources/{source_id}", response_model=LeadSourceResponse)
async def update_lead_source(
    source_id: int,
    payload: LeadSourceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    source = db.query(LeadSource).filter(LeadSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    data = payload.dict(exclude_unset=True)
    if "name" in data:
        name = _normalize_source_name(data["name"])
        if not name:
            raise HTTPException(status_code=400, detail="Source name is required")
        source.name = name
    if "is_active" in data:
        source.is_active = data["is_active"]
    db.commit()
    db.refresh(source)
    log_action(db, current_user.id, "update", "lead_source", source.id, data)
    return source


@router.get("/lead-task-templates", response_model=List[LeadTaskTemplateResponse])
async def list_lead_task_templates(
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    query = db.query(LeadTaskTemplate).order_by(LeadTaskTemplate.name.asc())
    if active_only:
        query = query.filter(LeadTaskTemplate.is_active.is_(True))
    return query.all()


@router.post("/lead-task-templates", response_model=LeadTaskTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_lead_task_template(
    payload: LeadTaskTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    name = _normalize_source_name(payload.name)
    if not name:
        raise HTTPException(status_code=400, detail="Task template name is required")
    exists = db.query(LeadTaskTemplate).filter(cast(LeadTaskTemplate.name, Text).ilike(name)).first()
    if exists:
        raise HTTPException(status_code=400, detail="Task template already exists")
    item = LeadTaskTemplate(name=name, is_active=True)
    db.add(item)
    db.commit()
    db.refresh(item)
    log_action(db, current_user.id, "create", "lead_task_template", item.id, {"name": name})
    return item


@router.put("/lead-task-templates/{template_id}", response_model=LeadTaskTemplateResponse)
async def update_lead_task_template(
    template_id: int,
    payload: LeadTaskTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    item = db.query(LeadTaskTemplate).filter(LeadTaskTemplate.id == template_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Task template not found")
    data = payload.dict(exclude_unset=True)
    if "name" in data:
        name = _normalize_source_name(data["name"])
        if not name:
            raise HTTPException(status_code=400, detail="Task template name is required")
        item.name = name
    if "is_active" in data:
        item.is_active = data["is_active"]
    db.commit()
    db.refresh(item)
    log_action(db, current_user.id, "update", "lead_task_template", item.id, data)
    return item


@router.get("/lead-task-statuses", response_model=List[LeadTaskStatusOptionResponse])
async def list_lead_task_statuses(
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    query = db.query(LeadTaskStatusOptionModel).order_by(LeadTaskStatusOptionModel.id.asc())
    if active_only:
        query = query.filter(LeadTaskStatusOptionModel.is_active.is_(True))
    return query.all()


@router.post("/lead-task-statuses", response_model=LeadTaskStatusOptionResponse, status_code=status.HTTP_201_CREATED)
async def create_lead_task_status(
    payload: LeadTaskStatusOptionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    name = _normalize_source_name(payload.name)
    if not name:
        raise HTTPException(status_code=400, detail="Task status name is required")
    exists = db.query(LeadTaskStatusOptionModel).filter(cast(LeadTaskStatusOptionModel.name, Text).ilike(name)).first()
    if exists:
        raise HTTPException(status_code=400, detail="Task status already exists")
    item = LeadTaskStatusOptionModel(name=name, is_active=True, is_closed=payload.is_closed)
    db.add(item)
    db.commit()
    db.refresh(item)
    log_action(db, current_user.id, "create", "lead_task_status", item.id, {"name": name, "is_closed": payload.is_closed})
    return item


@router.put("/lead-task-statuses/{status_id}", response_model=LeadTaskStatusOptionResponse)
async def update_lead_task_status(
    status_id: int,
    payload: LeadTaskStatusOptionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    item = db.query(LeadTaskStatusOptionModel).filter(LeadTaskStatusOptionModel.id == status_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Task status not found")
    data = payload.dict(exclude_unset=True)
    if "name" in data:
        name = _normalize_source_name(data["name"])
        if not name:
            raise HTTPException(status_code=400, detail="Task status name is required")
        item.name = name
    if "is_closed" in data:
        item.is_closed = data["is_closed"]
    if "is_active" in data:
        item.is_active = data["is_active"]
    db.commit()
    db.refresh(item)
    log_action(db, current_user.id, "update", "lead_task_status", item.id, data)
    return item


@router.get("/lead-info-templates", response_model=List[LeadInfoTemplateResponse])
async def list_lead_info_templates(
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    query = db.query(LeadInfoTemplate).order_by(LeadInfoTemplate.name.asc())
    if active_only:
        query = query.filter(LeadInfoTemplate.is_active.is_(True))
    return query.all()


@router.post("/lead-info-templates", response_model=LeadInfoTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_lead_info_template(
    payload: LeadInfoTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    name = _normalize_source_name(payload.name)
    if not name:
        raise HTTPException(status_code=400, detail="Template name is required")
    if not (payload.body or "").strip():
        raise HTTPException(status_code=400, detail="Template body is required")
    exists = db.query(LeadInfoTemplate).filter(cast(LeadInfoTemplate.name, Text).ilike(name)).first()
    if exists:
        raise HTTPException(status_code=400, detail="Template already exists")
    item = LeadInfoTemplate(name=name, body=payload.body.strip(), is_active=True)
    db.add(item)
    db.commit()
    db.refresh(item)
    log_action(db, current_user.id, "create", "lead_info_template", item.id, {"name": name})
    return item


@router.put("/lead-info-templates/{template_id}", response_model=LeadInfoTemplateResponse)
async def update_lead_info_template(
    template_id: int,
    payload: LeadInfoTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    item = db.query(LeadInfoTemplate).filter(LeadInfoTemplate.id == template_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Template not found")
    data = payload.dict(exclude_unset=True)
    if "name" in data:
        name = _normalize_source_name(data["name"])
        if not name:
            raise HTTPException(status_code=400, detail="Template name is required")
        item.name = name
    if "body" in data:
        body = (data["body"] or "").strip()
        if not body:
            raise HTTPException(status_code=400, detail="Template body is required")
        item.body = body
    if "is_active" in data:
        item.is_active = data["is_active"]
    db.commit()
    db.refresh(item)
    log_action(db, current_user.id, "update", "lead_info_template", item.id, data)
    return item


# --- Sales cities (справочник городов для Sales) ---
@router.get("/cities", response_model=List[SalesCityResponse])
async def list_sales_cities(
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    query = db.query(SalesCity).order_by(SalesCity.name.asc())
    if active_only:
        query = query.filter(SalesCity.is_active.is_(True))
    return query.all()


@router.post("/cities", response_model=SalesCityResponse, status_code=status.HTTP_201_CREATED)
async def create_sales_city(
    payload: SalesCityCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    name = _normalize_source_name(payload.name)
    if not name:
        raise HTTPException(status_code=400, detail="City name is required")
    exists = db.query(SalesCity).filter(cast(SalesCity.name, Text).ilike(name)).first()
    if exists:
        raise HTTPException(status_code=400, detail="City already exists")
    item = SalesCity(name=name, is_active=True)
    db.add(item)
    db.commit()
    db.refresh(item)
    log_action(db, current_user.id, "create", "sales_city", item.id, {"name": name})
    return item


@router.put("/cities/{city_id}", response_model=SalesCityResponse)
async def update_sales_city(
    city_id: int,
    payload: SalesCityUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    item = db.query(SalesCity).filter(SalesCity.id == city_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="City not found")
    data = payload.dict(exclude_unset=True)
    if "name" in data:
        name = _normalize_source_name(data["name"])
        if not name:
            raise HTTPException(status_code=400, detail="City name is required")
        item.name = name
    if "is_active" in data:
        item.is_active = data["is_active"]
    db.commit()
    db.refresh(item)
    log_action(db, current_user.id, "update", "sales_city", item.id, data)
    return item


# --- Sales schools (справочник школ для Sales) ---
@router.get("/schools", response_model=List[SalesSchoolResponse])
async def list_sales_schools(
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    query = db.query(SalesSchool).order_by(SalesSchool.name.asc())
    if active_only:
        query = query.filter(SalesSchool.is_active.is_(True))
    return query.all()


@router.post("/schools", response_model=SalesSchoolResponse, status_code=status.HTTP_201_CREATED)
async def create_sales_school(
    payload: SalesSchoolCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    name = _normalize_source_name(payload.name)
    if not name:
        raise HTTPException(status_code=400, detail="School name is required")
    exists = db.query(SalesSchool).filter(cast(SalesSchool.name, Text).ilike(name)).first()
    if exists:
        raise HTTPException(status_code=400, detail="School already exists")
    item = SalesSchool(name=name, is_active=True)
    db.add(item)
    db.commit()
    db.refresh(item)
    log_action(db, current_user.id, "create", "sales_school", item.id, {"name": name})
    return item


@router.put("/schools/{school_id}", response_model=SalesSchoolResponse)
async def update_sales_school(
    school_id: int,
    payload: SalesSchoolUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    item = db.query(SalesSchool).filter(SalesSchool.id == school_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="School not found")
    data = payload.dict(exclude_unset=True)
    if "name" in data:
        name = _normalize_source_name(data["name"])
        if not name:
            raise HTTPException(status_code=400, detail="School name is required")
        item.name = name
    if "is_active" in data:
        item.is_active = data["is_active"]
    db.commit()
    db.refresh(item)
    log_action(db, current_user.id, "update", "sales_school", item.id, data)
    return item


# --- Sales classes (справочник классов для лидов) ---
@router.get("/classes", response_model=List[SalesClassResponse])
async def list_sales_classes(
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    query = db.query(SalesClass).order_by(SalesClass.name.asc())
    if active_only:
        query = query.filter(SalesClass.is_active.is_(True))
    return query.all()


@router.post("/classes", response_model=SalesClassResponse, status_code=status.HTTP_201_CREATED)
async def create_sales_class(
    payload: SalesClassCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Название класса обязательно")
    exists = db.query(SalesClass).filter(cast(SalesClass.name, Text).ilike(name)).first()
    if exists:
        raise HTTPException(status_code=400, detail="Такой класс уже есть")
    item = SalesClass(name=name, is_active=True)
    db.add(item)
    db.commit()
    db.refresh(item)
    log_action(db, current_user.id, "create", "sales_class", item.id, {"name": name})
    return item


@router.put("/classes/{class_id}", response_model=SalesClassResponse)
async def update_sales_class(
    class_id: int,
    payload: SalesClassUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    item = db.query(SalesClass).filter(SalesClass.id == class_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Класс не найден")
    data = payload.dict(exclude_unset=True)
    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Название класса обязательно")
        item.name = name
    if "is_active" in data:
        item.is_active = data["is_active"]
    db.commit()
    db.refresh(item)
    log_action(db, current_user.id, "update", "sales_class", item.id, data)
    return item


# --- Шаблоны счетов (название + формат: групповой/индивидуальный) ---
@router.get("/account-templates", response_model=List[AccountTemplateResponse])
async def list_account_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    return db.query(AccountTemplate).order_by(AccountTemplate.id.asc()).all()


@router.post("/account-templates", response_model=AccountTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_account_template(
    payload: AccountTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Название счёта обязательно")
    if payload.format not in ("group", "individual"):
        raise HTTPException(status_code=400, detail="Формат должен быть group или individual")
    item = AccountTemplate(name=name, format=payload.format)
    db.add(item)
    db.commit()
    db.refresh(item)
    log_action(db, current_user.id, "create", "account_template", item.id, {"name": name, "format": payload.format})
    return item


@router.delete("/account-templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    item = db.query(AccountTemplate).filter(AccountTemplate.id == template_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Шаблон счёта не найден")
    db.delete(item)
    db.commit()
    log_action(db, current_user.id, "delete", "account_template", template_id, {})
    return None


# --- Lead status options (кастомные статусы лида) ---
@router.get("/lead-statuses", response_model=List[LeadStatusOptionResponse])
async def list_lead_statuses(
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    query = db.query(LeadStatusOption).order_by(LeadStatusOption.id.asc())
    if active_only:
        query = query.filter(LeadStatusOption.is_active.is_(True))
    return query.all()


@router.post("/lead-statuses", response_model=LeadStatusOptionResponse, status_code=status.HTTP_201_CREATED)
async def create_lead_status(
    payload: LeadStatusOptionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    name = _normalize_source_name(payload.name)
    if not name:
        raise HTTPException(status_code=400, detail="Status name is required")
    exists = db.query(LeadStatusOption).filter(cast(LeadStatusOption.name, Text).ilike(name)).first()
    if exists:
        raise HTTPException(status_code=400, detail="Lead status already exists")
    base = getattr(payload.base_status, "value", payload.base_status) if hasattr(payload.base_status, "value") else payload.base_status
    item = LeadStatusOption(name=name, base_status=base, is_active=True)
    db.add(item)
    db.commit()
    db.refresh(item)
    log_action(db, current_user.id, "create", "lead_status_option", item.id, {"name": name, "base_status": base})
    return item


@router.put("/lead-statuses/{status_id}", response_model=LeadStatusOptionResponse)
async def update_lead_status(
    status_id: int,
    payload: LeadStatusOptionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    item = db.query(LeadStatusOption).filter(LeadStatusOption.id == status_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Lead status not found")
    data = payload.dict(exclude_unset=True)
    if "name" in data:
        name = _normalize_source_name(data["name"])
        if not name:
            raise HTTPException(status_code=400, detail="Status name is required")
        item.name = name
    if "base_status" in data:
        base = data["base_status"]
        item.base_status = getattr(base, "value", base) if base is not None else item.base_status
    if "is_active" in data:
        item.is_active = data["is_active"]
    db.commit()
    db.refresh(item)
    log_action(db, current_user.id, "update", "lead_status_option", item.id, data)
    return item


# Маппинг "колонка пайплайна" → DB-статусы (один пайплайн-столбец может включать несколько статусов)
_PIPELINE_COLUMN_TO_STATUSES: Dict[str, List[LeadStatus]] = {
    "thinking": [LeadStatus.THINKING, LeadStatus.CONTACTED],
    "trial_scheduled": [LeadStatus.TRIAL_SCHEDULED, LeadStatus.DEMO, LeadStatus.INVOICE_SENT],
    "decided_immediately": [LeadStatus.DECIDED_IMMEDIATELY, LeadStatus.WON],
    "refused": [LeadStatus.REFUSED, LeadStatus.LOST],
}

# --- List leads (must be before /leads/{lead_id} to avoid 404 "Not Found") ---
@router.get("/leads", response_model=LeadsPaginatedResponse)
async def list_leads(
    status_filter: Optional[LeadStatus] = None,
    questionnaire_filled: Optional[bool] = None,
    q: Optional[str] = None,
    source: Optional[str] = None,
    tag: Optional[str] = None,
    overdue_only: bool = False,
    created_from: Optional[datetime] = Query(default=None),
    created_to: Optional[datetime] = Query(default=None),
    next_contact_from: Optional[datetime] = Query(default=None),
    next_contact_to: Optional[datetime] = Query(default=None),
    # Фильтры таблицы (перенесены на сервер)
    city: Optional[str] = None,
    school_name: Optional[str] = None,
    school_class: Optional[str] = None,
    pipeline_column: Optional[str] = None,
    exclude_lost: bool = False,
    # Сортировка
    sort_by: Optional[str] = Query(default=None),
    sort_order: str = Query(default="desc"),
    # Пагинация
    limit: int = Query(default=50, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    if current_user.role not in (UserRole.ADMIN, UserRole.OWNER, UserRole.SALES):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    query = _filter_query_by_role(db.query(Lead), current_user)
    if status_filter:
        query = query.filter(Lead.status == status_filter)
    elif pipeline_column:
        statuses = _PIPELINE_COLUMN_TO_STATUSES.get(pipeline_column)
        if statuses:
            query = query.filter(Lead.status.in_(statuses))
        else:
            # колонка 1:1 с DB-статусом (new, no_answer, event_registered и т.д.)
            query = query.filter(cast(Lead.status, Text) == pipeline_column)
    if questionnaire_filled is not None:
        query = query.filter(Lead.questionnaire_filled == questionnaire_filled)
    if q:
        search = f"%{q.strip()}%"
        query = query.filter(
            or_(
                cast(Lead.contact_name, Text).ilike(search),
                cast(Lead.phone, Text).ilike(search),
                cast(Lead.parent_full_name, Text).ilike(search),
                cast(Lead.child_full_name, Text).ilike(search),
                cast(Lead.parent_phone, Text).ilike(search),
                cast(Lead.child_phone, Text).ilike(search),
                cast(Lead.school_name, Text).ilike(search),
                cast(Lead.school_class, Text).ilike(search),
            )
        )
    if source:
        query = query.filter(Lead.source.ilike(f"%{source.strip()}%"))
    if tag:
        # tags are stored as JSON array; text-search keeps compatibility across DB backends.
        query = query.filter(Lead.tags.isnot(None), cast(Lead.tags, Text).ilike(f"%{tag.strip()}%"))
    if overdue_only:
        now = datetime.utcnow()
        query = query.filter(Lead.next_contact_at.isnot(None), Lead.next_contact_at < now)
    if created_from:
        query = query.filter(Lead.created_at >= created_from)
    if created_to:
        query = query.filter(Lead.created_at <= created_to)
    if next_contact_from:
        query = query.filter(Lead.next_contact_at >= next_contact_from)
    if next_contact_to:
        query = query.filter(Lead.next_contact_at <= next_contact_to)
    if city:
        query = query.filter(Lead.city == city)
    if school_name:
        query = query.filter(cast(Lead.school_name, Text).ilike(f"%{school_name.strip()}%"))
    if school_class:
        query = query.filter(Lead.school_class == school_class)
    if exclude_lost:
        query = query.filter(Lead.status != LeadStatus.LOST)

    # Сортировка
    _sort_columns = {
        "created_at": Lead.created_at,
        "school_class": Lead.school_class,
        "school_name": Lead.school_name,
        "city": Lead.city,
    }
    sort_col = _sort_columns.get(sort_by or "created_at", Lead.created_at)
    query = query.order_by(sort_col.asc() if sort_order == "asc" else sort_col.desc())

    # Считаем total ДО пагинации
    total = query.count()
    leads = (
        query
        .options(selectinload(Lead.status_option), selectinload(Lead.abonement))
        .offset(offset)
        .limit(limit)
        .all()
    )

    # One-time/gradual бэкаповка старых лидов в воронку «Дожать на обучение»:
    # если статус demo, по лиду уже есть [came] в регистрациях события, но post_visit_stage ещё не задана,
    # проставляем stage='new', чтобы такие лиды появились на странице дожима.
    if status_filter == LeadStatus.DEMO:
        candidate_ids = [lead.id for lead in leads if not getattr(lead, "post_visit_stage", None)]
        if candidate_ids:
            # Один запрос вместо N: ищем все lead_id с [came] среди кандидатов
            came_lead_ids = {
                row[0]
                for row in db.query(EventRegistration.lead_id)
                .filter(
                    EventRegistration.lead_id.in_(candidate_ids),
                    cast(EventRegistration.note, Text).ilike("%[came]%"),
                )
                .distinct()
                .all()
            }
            if came_lead_ids:
                db.execute(
                    sa_update(Lead)
                    .where(Lead.id.in_(came_lead_ids))
                    .values(post_visit_stage="new")
                    .execution_options(synchronize_session=False)
                )
                db.commit()
                # Одним запросом перезагружаем только изменённые лиды
                refreshed = {
                    r.id: r
                    for r in db.query(Lead).filter(Lead.id.in_(came_lead_ids)).all()
                }
                leads = [refreshed.get(l.id, l) for l in leads]

    return LeadsPaginatedResponse(items=[_fix_lead_strings(l) for l in leads], total=total)


@router.get("/leads/{lead_id}/communications", response_model=List[LeadCommunicationResponse])
async def list_lead_communications(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)
    return (
        db.query(LeadCommunication)
        .filter(LeadCommunication.lead_id == lead_id)
        .order_by(LeadCommunication.created_at.desc())
        .all()
    )


@router.post("/leads/{lead_id}/communications", response_model=LeadCommunicationResponse, status_code=status.HTTP_201_CREATED)
async def create_lead_communication(
    lead_id: int,
    payload: LeadQuickCommunicationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)

    channel = (payload.channel or "messenger").strip().lower()
    if channel not in {"messenger", "call", "email"}:
        raise HTTPException(status_code=400, detail="Unsupported channel")
    message = (payload.message or "").strip() or f"[quick-{channel}]"
    follow_up_at = payload.follow_up_at or datetime.utcnow()

    comm = LeadCommunication(
        lead_id=lead.id,
        sent_by=current_user.id,
        template_id=None,
        channel=channel,
        message=message,
        pause_reason=None,
        follow_up_at=follow_up_at,
    )
    db.add(comm)
    if payload.follow_up_at:
        lead.next_contact_at = payload.follow_up_at
    if lead.status == LeadStatus.NEW:
        lead.status = LeadStatus.CONTACTED
    db.commit()
    db.refresh(comm)
    log_action(
        db,
        current_user.id,
        "log_communication",
        "lead",
        lead.id,
        {
            "channel": channel,
            "follow_up_at": follow_up_at.isoformat(),
        },
    )
    return comm


@router.post("/leads/{lead_id}/send-info", response_model=LeadCommunicationResponse, status_code=status.HTTP_201_CREATED)
async def send_info_for_lead(
    lead_id: int,
    payload: LeadSendInfoRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)

    if payload.follow_up_at <= datetime.utcnow():
        raise HTTPException(status_code=400, detail="follow_up_at must be in the future")
    message = (payload.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message is required")
    if payload.pause_reason and payload.pause_reason not in ALLOWED_PAUSE_REASONS:
        raise HTTPException(status_code=400, detail="Unsupported pause reason")

    template_id = payload.template_id
    if template_id:
        template = db.query(LeadInfoTemplate).filter(LeadInfoTemplate.id == template_id).first()
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")

    comm = LeadCommunication(
        lead_id=lead.id,
        sent_by=current_user.id,
        template_id=template_id,
        channel=(payload.channel or "messenger").strip(),
        message=message,
        pause_reason=payload.pause_reason,
        follow_up_at=payload.follow_up_at,
    )
    db.add(comm)

    auto_task = LeadTask(
        lead_id=lead.id,
        owner_id=current_user.id,
        note=f"[auto-follow-up] {payload.pause_reason or 'без причины'}",
        channel=(payload.channel or "messenger").strip(),
        due_at=payload.follow_up_at,
        status=LeadTaskStatus.OPEN,
    )
    db.add(auto_task)
    lead.next_contact_at = payload.follow_up_at
    lead.pause_reason = payload.pause_reason
    if lead.status == LeadStatus.NEW:
        lead.status = LeadStatus.CONTACTED
    db.commit()
    db.refresh(comm)
    log_action(
        db,
        current_user.id,
        "send_info",
        "lead",
        lead.id,
        {
            "template_id": template_id,
            "channel": payload.channel,
            "follow_up_at": payload.follow_up_at.isoformat(),
            "pause_reason": payload.pause_reason,
        },
    )
    return comm


@router.post("/leads/{lead_id}/contact-result", response_model=LeadCommunicationResponse, status_code=status.HTTP_201_CREATED)
async def save_lead_contact_result(
    lead_id: int,
    payload: LeadContactResultRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)

    outcome = (payload.outcome or "").strip().lower()
    if outcome not in {"connected", "no_answer", "callback"}:
        raise HTTPException(status_code=400, detail="Unsupported contact outcome")

    if outcome in {"no_answer", "callback"} and payload.follow_up_at is None:
        raise HTTPException(status_code=400, detail="follow_up_at is required for this outcome")
    if payload.follow_up_at and payload.follow_up_at <= datetime.utcnow():
        raise HTTPException(status_code=400, detail="follow_up_at must be in the future")

    label_map = {
        "connected": "дозвон",
        "no_answer": "не дозвонились",
        "callback": "перезвонить",
    }
    message = f"[contact-result] {label_map[outcome]}"
    if payload.note and payload.note.strip():
        message = f"{message}: {payload.note.strip()}"

    comm = LeadCommunication(
        lead_id=lead.id,
        sent_by=current_user.id,
        template_id=None,
        channel="call",
        message=message,
        pause_reason=None,
        follow_up_at=payload.follow_up_at or datetime.utcnow(),
    )
    db.add(comm)

    if outcome in {"no_answer", "callback"} and payload.follow_up_at:
        auto_task = LeadTask(
            lead_id=lead.id,
            owner_id=current_user.id,
            note=f"[auto-follow-up] {label_map[outcome]}",
            channel="call",
            due_at=payload.follow_up_at,
            status=LeadTaskStatus.OPEN,
        )
        db.add(auto_task)
        lead.next_contact_at = payload.follow_up_at

    if outcome in {"connected", "callback"} and lead.status == LeadStatus.NEW:
        lead.status = LeadStatus.CONTACTED

    db.commit()
    db.refresh(comm)
    log_action(
        db,
        current_user.id,
        "contact_result",
        "lead",
        lead.id,
        {
            "outcome": outcome,
            "follow_up_at": payload.follow_up_at.isoformat() if payload.follow_up_at else None,
        },
    )
    return comm


@router.post("/leads/import-xlsx", response_model=LeadImportResponse)
async def import_leads_from_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    filename = (file.filename or "").lower()
    if not filename.endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Поддерживается только формат .xlsx")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Файл пустой")

    wb = load_workbook(filename=BytesIO(data), data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return LeadImportResponse(created=0, skipped=0, errors=["Пустой лист"])

    headers = [str(h).strip().lower() if h is not None else "" for h in rows[0]]
    header_map = {name: idx for idx, name in enumerate(headers)}

    def val(row, key_variants: List[str]) -> Optional[str]:
        for key in key_variants:
            idx = header_map.get(key)
            if idx is None or idx >= len(row):
                continue
            raw = row[idx]
            if raw is None:
                continue
            txt = str(raw).strip()
            if txt:
                return txt
        return None

    def parse_row_datetime(raw_value) -> Optional[datetime]:
        if raw_value is None:
            return None
        if isinstance(raw_value, datetime):
            return raw_value
        text = str(raw_value).strip()
        if not text:
            return None
        for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%Y-%m-%d %H:%M", "%d.%m.%Y %H:%M"):
            try:
                return datetime.strptime(text, fmt)
            except ValueError:
                continue
        try:
            return datetime.fromisoformat(text)
        except ValueError:
            return None

    def parse_row_minutes(raw_value) -> Optional[int]:
        if raw_value is None:
            return None
        text = str(raw_value).strip()
        if not text:
            return None
        try:
            minutes = int(float(text.replace(",", ".")))
            return minutes if minutes >= 0 else None
        except ValueError:
            return None

    created = 0
    skipped = 0
    errors: List[str] = []
    for i, row in enumerate(rows[1:], start=2):
        parent_name = val(row, ["фио родителя", "родитель", "parent_full_name"])
        child_name = val(row, ["фио ребенка", "фио ребёнка", "ребенок", "ребёнок", "child_full_name"])
        parent_phone = val(row, ["телефон родителя", "parent_phone"])
        child_phone = val(row, ["телефон школьника", "телефон ребенка", "телефон ребёнка", "child_phone"])
        source_name_raw = val(row, ["источник", "source"])
        referral_name = val(row, ["кто пригласил", "рекомендовал", "referral_name"])
        comment = val(row, ["комментарий", "comment"])
        school_name = val(row, ["школа", "school", "school_name"])
        school_class = val(row, ["класс", "class", "school_class"])
        outreach_date_raw = val(row, ["дата обхода", "outreach_date", "outreach_at"])
        outreach_minutes_raw = val(row, ["время обхода (мин)", "время обхода", "outreach_minutes"])
        outreach_at = parse_row_datetime(outreach_date_raw)
        outreach_minutes = parse_row_minutes(outreach_minutes_raw)

        if not any([parent_name, child_name, parent_phone, child_phone, source_name_raw, comment]):
            skipped += 1
            continue

        source_id, source_name = _resolve_source(db, None, source_name_raw)
        if _is_referral_source(source_name) and not (referral_name or "").strip():
            errors.append("Строка {0}: для источника 'рекомендация' не указан пригласивший".format(i))
            skipped += 1
            continue

        contact_name = parent_name or child_name or "Без имени"
        phone = parent_phone or child_phone or "не указан"
        lead = Lead(
            owner_id=current_user.id,
            contact_name=contact_name,
            phone=phone,
            parent_full_name=parent_name,
            child_full_name=child_name,
            parent_phone=parent_phone,
            child_phone=child_phone,
            source=source_name,
            source_id=source_id,
            referral_name=referral_name,
            comment=comment,
            school_name=school_name,
            school_class=school_class,
            outreach_at=outreach_at,
            outreach_minutes=outreach_minutes,
            status=LeadStatus.NEW,
        )
        db.add(lead)
        created += 1

    db.commit()
    log_action(db, current_user.id, "import", "lead", None, {"created": created, "skipped": skipped})
    return LeadImportResponse(created=created, skipped=skipped, errors=errors)


@router.get("/leads/import-template")
async def download_leads_import_template(
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    wb = Workbook()
    ws = wb.active
    ws.title = "LeadsImport"
    headers = [
        "ФИО родителя",
        "ФИО ребенка",
        "Телефон родителя",
        "Телефон школьника",
        "Школа",
        "Класс",
        "Дата обхода",
        "Время обхода (мин)",
        "Источник",
        "Кто пригласил",
        "Комментарий",
    ]
    ws.append(headers)
    ws.append(
        [
            "Иванова Анна Петровна",
            "Иванов Петр",
            "+7 999 111-22-33",
            "+7 900 111-22-44",
            "Школа №12",
            "7А",
            "2026-02-01",
            "35",
            "рекомендация",
            "Мария Сидорова",
            "Интерес к занятиям после пробного урока",
        ]
    )
    ws.freeze_panes = "A2"

    stream = BytesIO()
    wb.save(stream)
    stream.seek(0)
    filename = "leads_import_template.xlsx"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )


@router.post(
    "/public/leads/specialist-questionnaire",
    response_model=SpecialistQuestionnaireResponse,
    status_code=status.HTTP_201_CREATED,
)
async def submit_specialist_questionnaire(
    payload: SpecialistQuestionnaireRequest,
    db: Session = Depends(get_db),
):
    """
    Публичная анкета для направления «Специалист».
    Доступна без авторизации, создаёт лида с questionnaire_filled=True.
    """
    owner = (
        db.query(User)
        .filter(User.role.in_([UserRole.SALES, UserRole.OWNER, UserRole.ADMIN]))
        .order_by(User.id)
        .first()
    )
    if not owner:
        raise HTTPException(status_code=500, detail="No sales/owner/admin user configured")

    # Создаём личную анкету ученика (StudentCard) со всеми полями
    card = StudentCard(
        student_full_name=payload.child_full_name,
        birth_date=payload.birth_date,
        student_phone=payload.child_phone,
        telegram=payload.child_telegram,
        gender=payload.gender,
        on_grant=False,
        format_type=None,
        city=payload.city,
        school=payload.school_name,
        grade=payload.school_class,
        parent_full_name=payload.parent_full_name,
        parent_phone=payload.parent_phone,
        parent_phone_2=payload.parent_phone_2,
        parent_telegram=payload.parent_telegram,
        parent_email=payload.parent_email,
        student_email=payload.student_email,
        preferred_messenger=payload.preferred_messenger,
        comment=payload.comment,
        source=payload.source or "Анкета Специалист",
        discount_type=DiscountType.NONE,
        discount_value=0.0,
        anketa_status="filled",
    )

    extra_parts: List[str] = []
    if payload.birth_date:
        extra_parts.append(f"Дата рождения: {payload.birth_date.isoformat()}")
    if payload.child_phone:
        extra_parts.append(f"Телефон ученика: {payload.child_phone}")
    if payload.child_telegram:
        extra_parts.append(f"Телеграм ученика: {payload.child_telegram}")
    if payload.gender:
        extra_parts.append(f"Пол: {payload.gender}")
    if payload.parent_phone_2:
        extra_parts.append(f"Второй телефон родителя: {payload.parent_phone_2}")
    if payload.parent_telegram:
        extra_parts.append(f"Телеграм родителя: {payload.parent_telegram}")
    if payload.student_email:
        extra_parts.append(f"Email ученика: {payload.student_email}")
    if payload.preferred_messenger:
        extra_parts.append(f"Мессенджер: {payload.preferred_messenger}")

    base_comment = payload.comment or ""
    extras_str = "\n".join(extra_parts) if extra_parts else ""
    full_comment = base_comment
    if extras_str:
        full_comment = (base_comment + "\n\n" if base_comment else "") + extras_str

    questionnaire_data = payload.model_dump(mode="json")  # все поля формы для отображения в карточке лида
    lead = Lead(
        owner_id=owner.id,
        contact_name=payload.parent_full_name,
        phone=payload.parent_phone,
        parent_full_name=payload.parent_full_name,
        child_full_name=payload.child_full_name,
        parent_phone=payload.parent_phone,
        child_phone=payload.child_phone,
        email=payload.parent_email or payload.student_email,
        city=payload.city,
        school_name=payload.school_name,
        school_class=payload.school_class,
        comment=full_comment or None,
        source=payload.source or "Анкета Специалист",
        tags=["direction:specialist"],
        status=LeadStatus.NEW,
        questionnaire_filled=True,
        questionnaire_data=questionnaire_data,
    )
    db.add(card)
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return SpecialistQuestionnaireResponse(lead_id=lead.id)


TILDA_SOURCE_START = "Тильда_Первый Шаг"
TILDA_SOURCE_BASE = "Тильда_Специалист"
TILDA_SOURCE_PRO = "Тильда_Эксперт"


@router.post(
    "/public/leads/tilda-lead",
    response_model=TildaLeadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def submit_tilda_lead(
    payload: TildaLeadRequest,
    db: Session = Depends(get_db),
):
    """
    Публичная анкета лида с сайта Tilda.
    Создаёт лида в статусе «новый» с пометкой источника в зависимости от направления:
    - Тильда_Первый Шаг (kind=start)
    - Тильда_Специалист (kind=base)
    - Тильда_Эксперт (kind=pro)
    """
    parent_name = (payload.parent_full_name or "").strip()
    child_name = (payload.child_full_name or "").strip()
    if not parent_name:
        raise HTTPException(status_code=400, detail="Укажите ФИО родителя")
    if not child_name:
        raise HTTPException(status_code=400, detail="Укажите ФИО ученика")

    normalized_phone, phone_error = validate_phone_for_lead(payload.parent_phone)
    if phone_error:
        raise HTTPException(status_code=400, detail=phone_error)

    owner = (
        db.query(User)
        .filter(User.role.in_([UserRole.SALES, UserRole.OWNER, UserRole.ADMIN]))
        .order_by(User.id)
        .first()
    )
    if not owner:
        raise HTTPException(status_code=500, detail="В системе не настроен пользователь для приёма заявок")

    kind = (payload.kind or "start").strip()
    if kind == "base":
        src_label = TILDA_SOURCE_BASE
        tag = "tilda_base_lead"
    elif kind == "pro":
        src_label = TILDA_SOURCE_PRO
        tag = "tilda_pro_lead"
    else:
        src_label = TILDA_SOURCE_START
        tag = "tilda_start_lead"

    source_id, source_name = _resolve_source(db, None, src_label)
    status_option_id = _get_default_lead_status_option_id(db, LeadStatus.NEW)

    lead = Lead(
        owner_id=owner.id,
        contact_name=parent_name,
        phone=normalized_phone,
        parent_full_name=parent_name,
        parent_phone=normalized_phone,
        child_full_name=child_name,
        source=source_name or src_label,
        source_id=source_id,
        status=LeadStatus.NEW,
        status_option_id=status_option_id,
        tags=[tag],
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return TildaLeadResponse(lead_id=lead.id)


@router.post("/leads", response_model=LeadResponse, status_code=status.HTTP_201_CREATED)
async def create_lead(
    payload: LeadCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "sales"])),
):
    owner_id = payload.owner_id if (current_user.role in (UserRole.ADMIN, UserRole.OWNER) and payload.owner_id) else current_user.id
    source_id, source_name = _resolve_source(db, payload.source_id, payload.source)
    if _is_referral_source(source_name) and not (payload.referral_name or "").strip():
        raise HTTPException(status_code=400, detail="Для источника 'рекомендация' укажите, кто пригласил")

    abonement = None
    if payload.abonement_id:
        abonement = db.query(Abonement).filter(Abonement.id == payload.abonement_id).first()
        if not abonement:
            raise HTTPException(status_code=404, detail="Abonement not found")

    lead = Lead(
        owner_id=owner_id,
        contact_name=payload.contact_name,
        phone=payload.phone,
        parent_full_name=payload.parent_full_name,
        child_full_name=payload.child_full_name,
        parent_phone=payload.parent_phone,
        child_phone=payload.child_phone,
        email=payload.email,
        city=payload.city,
        school_name=payload.school_name,
        school_class=payload.school_class,
        outreach_at=payload.outreach_at,
        outreach_minutes=payload.outreach_minutes,
        source=source_name,
        source_id=source_id,
        referral_name=payload.referral_name,
        tags=payload.tags,
        abonement_id=payload.abonement_id,
        desired_slot=payload.desired_slot,
        comment=payload.comment,
        next_contact_at=payload.next_contact_at,
        status=LeadStatus.NEW,
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)

    log_action(db, current_user.id, "create", "lead", lead.id, {"owner_id": owner_id})
    return lead


_SEND_INFO_TASK_MARKER = "отправить информацию"


@router.get("/leads/send-info-status")
async def get_leads_send_info_status(
    lead_ids: str = Query(..., description="Comma-separated lead IDs"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    """Возвращает для каждого lead_id статус задачи «Отправить информацию»: open, done, none."""
    if not lead_ids.strip():
        return {}
    ids = [int(x.strip()) for x in lead_ids.split(",") if x.strip()]
    if not ids:
        return {}
    base = _filter_query_by_role(db.query(Lead), current_user)
    allowed_ids = {
        row[0]
        for row in base.filter(Lead.id.in_(ids)).with_entities(Lead.id).all()
    }
    tasks = (
        db.query(LeadTask)
        .options(joinedload(LeadTask.template))
        .outerjoin(LeadTaskTemplate, LeadTask.template_id == LeadTaskTemplate.id)
        .filter(
            LeadTask.lead_id.in_(allowed_ids),
            or_(
                cast(LeadTask.note, Text).ilike(f"%{_SEND_INFO_TASK_MARKER}%"),
                cast(LeadTaskTemplate.name, Text).ilike(f"%{_SEND_INFO_TASK_MARKER}%"),
            ),
        )
        .all()
    )
    result: Dict[str, str] = {str(i): "none" for i in ids if i in allowed_ids}

    # 1) Статусы по LeadTask (старый механизм)
    for t in tasks:
        if t.lead_id not in allowed_ids:
            continue
        key = str(t.lead_id)
        if t.status == LeadTaskStatus.OPEN:
            result[key] = "open"
        elif result.get(key) != "open":
            result[key] = "done"

    # 2) Дополнительно учитываем общие задачи Task с тегами ["send_info", f"lead:{id}"].
    #    Они ДОЛЖНЫ переопределять статус, даже если LeadTask ещё открыт:
    #    - есть хотя бы одна активная Task → open
    #    - активных нет, но есть архивные → done
    common_tasks = (
        db.query(Task)
        .filter(Task.category == "leads", Task.tags.isnot(None))
        .all()
    )
    per_lead_flags: Dict[int, Dict[str, bool]] = {}
    for ct in common_tasks:
        tags = ct.tags or []
        lead_tag = next((t for t in tags if isinstance(t, str) and t.startswith("lead:")), None)
        if not lead_tag:
            continue
        try:
            lead_id = int(lead_tag.split(":", 1)[1])
        except (ValueError, IndexError):
            continue
        if lead_id not in allowed_ids:
            continue
        flags = per_lead_flags.setdefault(lead_id, {"has_active": False, "has_any": False})
        flags["has_any"] = True
        if ct.status == TaskStatus.ACTIVE.value:
            flags["has_active"] = True

    for lead_id, flags in per_lead_flags.items():
        key = str(lead_id)
        if flags["has_active"]:
            result[key] = "open"
        else:
            result[key] = "done"

    return result


@router.get("/leads/no-show-ids", response_model=List[int])
async def list_no_show_lead_ids(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    """Return IDs of leads that have a no-show registration. Single query, replaces N+1 on frontend."""
    rows = (
        db.query(EventRegistration.lead_id)
        .filter(
            EventRegistration.status == EventRegistrationStatus.REGISTERED,
            or_(
                cast(EventRegistration.note, Text).ilike("%[no-show]%"),
                cast(EventRegistration.note, Text).ilike("%no-show%"),
            ),
        )
        .distinct()
        .all()
    )
    return [r[0] for r in rows]


@router.get("/leads/{lead_id}", response_model=LeadResponse)
async def get_lead(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)
    return _fix_lead_strings(lead)


@router.put("/leads/{lead_id}", response_model=LeadResponse)
async def update_lead(
    lead_id: int,
    payload: LeadUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "sales"])),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)

    update_data = payload.dict(exclude_unset=True)
    # Prevent sales from changing owner/status to restricted values
    if "status" in update_data and update_data["status"] is not None:
        lead.status = update_data["status"]
    if "lost_reason" in update_data:
        lead.lost_reason = update_data["lost_reason"]

    if "source_id" in update_data or "source" in update_data:
        source_id, source_name = _resolve_source(db, update_data.get("source_id"), update_data.get("source"))
        if _is_referral_source(source_name) and not (update_data.get("referral_name") or lead.referral_name or "").strip():
            raise HTTPException(status_code=400, detail="Для источника 'рекомендация' укажите, кто пригласил")
        lead.source_id = source_id
        lead.source = source_name

    for field in [
        "contact_name",
        "phone",
        "parent_full_name",
        "child_full_name",
        "parent_phone",
        "child_phone",
        "email",
        "city",
        "school_name",
        "school_class",
        "outreach_at",
        "outreach_minutes",
        "referral_name",
        "tags",
        "abonement_id",
        "desired_slot",
        "comment",
        "next_contact_at",
        "pause_reason",
        "questionnaire_filled",
        "no_answer_attempt",
        "max_user_id",
    ]:
        if field in update_data:
            setattr(lead, field, update_data[field])

    db.commit()
    db.refresh(lead)
    log_action(db, current_user.id, "update", "lead", lead.id, update_data)
    return lead


@router.delete("/leads/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lead(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "sales"])),
):
    """
    Полное удаление лида и связанных сущностей (задачи, коммуникации, счета и т.д.).
    Используется, когда лид создан по ошибке или явно не нужен в системе.
    """
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)
    log_action(db, current_user.id, "delete", "lead", lead.id, None)
    db.delete(lead)
    db.commit()
    return None


@router.post("/leads/{lead_id}/convert-to-student", response_model=LeadConvertToStudentResponse)
async def convert_lead_to_student(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """
    Переводит лида в ученика: создаёт родителя (если нет по email) и ученика с from_lead_id,
    привязывает или создаёт анкету (StudentCard) из данных лида/опроса.
    Обновляет лида (status=WON, converted_to_student_id).
    Бизнес-логика вынесена в app.services.lead_conversion.
    """
    _require_sales_admin_owner(current_user)
    try:
        result = lead_conversion_convert(db, lead_id, actor_user_id=current_user.id)
    except ValueError as e:
        msg = str(e)
        if "не найден" in msg.lower():
            raise HTTPException(status_code=404, detail=msg)
        raise HTTPException(status_code=400, detail=msg)
    return LeadConvertToStudentResponse(
        student_id=result.student_id,
        lead=_fix_lead_strings(result.lead),
    )


@router.post("/leads/{lead_id}/tasks", response_model=LeadTaskResponse, status_code=status.HTTP_201_CREATED)
async def create_lead_task(
    lead_id: int,
    payload: LeadTaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)

    template = None
    if payload.template_id:
        template = (
            db.query(LeadTaskTemplate)
            .filter(LeadTaskTemplate.id == payload.template_id, LeadTaskTemplate.is_active.is_(True))
            .first()
        )
        if not template:
            raise HTTPException(status_code=404, detail="Task template not found")

    status_option_id = payload.status_option_id
    if status_option_id:
        status_option = (
            db.query(LeadTaskStatusOptionModel)
            .filter(LeadTaskStatusOptionModel.id == status_option_id, LeadTaskStatusOptionModel.is_active.is_(True))
            .first()
        )
        if not status_option:
            raise HTTPException(status_code=404, detail="Task status not found")
    else:
        default_open = (
            db.query(LeadTaskStatusOptionModel)
            .filter(
                LeadTaskStatusOptionModel.is_active.is_(True),
                LeadTaskStatusOptionModel.is_closed.is_(False),
            )
            .order_by(LeadTaskStatusOptionModel.id.asc())
            .first()
        )
        status_option_id = default_open.id if default_open else None

    task = LeadTask(
        lead_id=lead_id,
        owner_id=current_user.id,
        template_id=payload.template_id,
        status_option_id=status_option_id,
        note=payload.note,
        channel=payload.channel,
        due_at=payload.due_at,
        status=LeadTaskStatus.OPEN,
    )
    db.add(task)

    # Если это задача «Отправить информацию» — создаём также общую задачу в /tasks
    # (категория leads), чтобы менеджер увидел её в «Плане на сегодня».
    note_lower = (payload.note or "").strip().lower() if payload.note else ""
    if _SEND_INFO_TASK_MARKER in note_lower:
        from app.models import Task, TaskStatus  # локальный импорт, чтобы не плодить зависимости наверху

        title = f"Отправить информацию: {lead.parent_full_name or lead.contact_name or lead.phone or f'Лид #{lead.id}'}"
        description = f"Отправить информацию по лиду #{lead.id}"
        assignee_id = lead.owner_id or current_user.id
        common_task = Task(
            title=title,
            description=description,
            created_by_id=current_user.id,
            assigned_to_id=assignee_id,
            category="leads",
            status=TaskStatus.ACTIVE.value,
            due_at=datetime.utcnow(),
            priority="normal",
            tags=["send_info", f"lead:{lead.id}"],
        )
        db.add(common_task)

    db.commit()
    db.refresh(task)
    log_action(db, current_user.id, "create", "lead_task", task.id, {"lead_id": lead_id})
    return task


@router.get("/leads/{lead_id}/tasks", response_model=List[LeadTaskResponse])
async def list_lead_tasks(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)
    tasks = (
        db.query(LeadTask)
        .filter(LeadTask.lead_id == lead_id)
        .order_by(LeadTask.created_at.desc())
        .all()
    )
    return tasks


@router.post("/leads/{lead_id}/tasks/{task_id}/close", response_model=LeadTaskResponse)
async def close_lead_task(
    lead_id: int,
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)

    task = (
        db.query(LeadTask)
        .options(joinedload(LeadTask.template))
        .filter(LeadTask.id == task_id, LeadTask.lead_id == lead_id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task.status = LeadTaskStatus.DONE
    closed_status = (
        db.query(LeadTaskStatusOptionModel)
        .filter(
            LeadTaskStatusOptionModel.is_active.is_(True),
            LeadTaskStatusOptionModel.is_closed.is_(True),
        )
        .order_by(LeadTaskStatusOptionModel.id.asc())
        .first()
    )
    if closed_status:
        task.status_option_id = closed_status.id
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)

    # Если закрыли задачу «Отправить информацию» — переводим лида в «Подумают» и создаём задачу «Позвонить лиду и узнать решение» через 2 дня
    _FOLLOW_UP_NOTE = "Позвонить лиду и узнать решение"
    template_name = (task.template.name if task.template else "") or ""
    note_lower = (task.note or "").lower()
    is_send_info = _SEND_INFO_TASK_MARKER in template_name.lower() or _SEND_INFO_TASK_MARKER in note_lower
    if is_send_info:
        lead.status = LeadStatus.THINKING
        default_open = (
            db.query(LeadTaskStatusOptionModel)
            .filter(
                LeadTaskStatusOptionModel.is_active.is_(True),
                LeadTaskStatusOptionModel.is_closed.is_(False),
            )
            .order_by(LeadTaskStatusOptionModel.id.asc())
            .first()
        )
        follow_up_due = datetime.utcnow() + timedelta(days=2)
        follow_up = LeadTask(
            lead_id=lead_id,
            owner_id=current_user.id,
            template_id=None,
            status_option_id=default_open.id if default_open else None,
            note=_FOLLOW_UP_NOTE,
            channel=task.channel,
            due_at=follow_up_due,
            status=LeadTaskStatus.OPEN,
        )
        db.add(follow_up)
        db.commit()

    log_action(db, current_user.id, "close", "lead_task", task.id, {"lead_id": lead_id})
    return task


@router.put("/leads/{lead_id}/tasks/{task_id}", response_model=LeadTaskResponse)
async def update_lead_task(
    lead_id: int,
    task_id: int,
    payload: LeadTaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)

    task = db.query(LeadTask).filter(LeadTask.id == task_id, LeadTask.lead_id == lead_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    update_data = payload.dict(exclude_unset=True)
    if "status" in update_data and update_data["status"] is not None:
        task.status = update_data["status"]
    if "note" in update_data:
        task.note = update_data["note"]
    if "channel" in update_data:
        task.channel = update_data["channel"]
    if "due_at" in update_data:
        task.due_at = update_data["due_at"]
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    log_action(db, current_user.id, "update", "lead_task", task.id, update_data)
    return task


@router.post("/leads/{lead_id}/invoices", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
async def create_invoice_for_lead(
    lead_id: int,
    payload: InvoiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "sales"])),
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
    if lead.status not in (LeadStatus.WON, LeadStatus.LOST):
        lead.status = LeadStatus.INVOICE_SENT
    db.commit()
    db.refresh(invoice)
    log_action(db, current_user.id, "create", "invoice", invoice.id, {"lead_id": lead_id, "amount": amount})
    return invoice


@router.get("/leads/{lead_id}/invoices", response_model=List[InvoiceResponse])
async def list_invoices_for_lead(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "sales"])),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)
    return (
        db.query(Invoice)
        .filter(Invoice.lead_id == lead_id)
        .order_by(Invoice.created_at.desc())
        .all()
    )


@router.post("/invoices/{invoice_id}/send-email", response_model=InvoiceResponse)
async def send_invoice_email(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "sales"])),
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

    # Stub: actual email sending integration should be implemented separately.
    invoice.status = InvoiceStatus.SENT
    invoice.sent_at = datetime.utcnow()
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
    current_user: User = Depends(auth.require_role(["admin", "sales"])),
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


@router.get("/events", response_model=List[EventResponse])
async def list_events(
    status_filter: Optional[EventStatus] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    query = db.query(Event).order_by(Event.starts_at.asc())
    if status_filter:
        query = query.filter(Event.status == status_filter)
    return query.all()


@router.post("/events", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
async def create_event(
    payload: EventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    event = Event(
        title=payload.title,
        description=payload.description,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        location=payload.location,
        capacity=payload.capacity,
        status=EventStatus.ACTIVE,
        created_by=current_user.id,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    log_action(db, current_user.id, "create", "event", event.id)
    return event


@router.put("/events/{event_id}", response_model=EventResponse)
async def update_event(
    event_id: int,
    payload: EventUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    update_data = payload.dict(exclude_unset=True)
    for k, v in update_data.items():
        setattr(event, k, v)
    db.commit()
    db.refresh(event)
    log_action(db, current_user.id, "update", "event", event.id, update_data)
    return event


@router.get("/events/{event_id}/registrations", response_model=List[EventRegistrationResponse])
async def list_event_registrations(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    query = db.query(EventRegistration).filter(EventRegistration.event_id == event_id).order_by(EventRegistration.created_at.desc())
    return query.all()


@router.post("/events/{event_id}/registrations", response_model=EventRegistrationResponse, status_code=status.HTTP_201_CREATED)
async def create_event_registration(
    event_id: int,
    payload: EventRegistrationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    event = db.query(Event).filter(Event.id == event_id, Event.status == EventStatus.ACTIVE).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found or inactive")
    if event.capacity is not None:
        current_registered = (
            db.query(EventRegistration)
            .filter(
                EventRegistration.event_id == event_id,
                EventRegistration.status == EventRegistrationStatus.REGISTERED,
            )
            .count()
        )
        if current_registered >= event.capacity:
            raise HTTPException(status_code=400, detail="Свободных слотов нет")

    lead = db.query(Lead).filter(Lead.id == payload.lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)

    existing = db.query(EventRegistration).filter(
        EventRegistration.event_id == event_id,
        EventRegistration.lead_id == payload.lead_id
    ).first()
    if existing and existing.status == EventRegistrationStatus.REGISTERED:
        raise HTTPException(status_code=400, detail="Lead already registered")

    if existing:
        existing.status = EventRegistrationStatus.REGISTERED
        existing.note = payload.note
        existing.owner_id = current_user.id
        db.commit()
        db.refresh(existing)
        log_action(db, current_user.id, "restore", "event_registration", existing.id, {"event_id": event_id, "lead_id": lead.id})
        return existing

    reg = EventRegistration(
        event_id=event_id,
        lead_id=lead.id,
        owner_id=current_user.id,
        status=EventRegistrationStatus.REGISTERED,
        note=payload.note,
    )
    db.add(reg)
    db.commit()
    db.refresh(reg)
    log_action(db, current_user.id, "create", "event_registration", reg.id, {"event_id": event_id, "lead_id": lead.id})
    return reg


@router.post("/events/{event_id}/registrations/{registration_id}/cancel", response_model=EventRegistrationResponse)
async def cancel_event_registration(
    event_id: int,
    registration_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    reg = db.query(EventRegistration).filter(
        EventRegistration.id == registration_id,
        EventRegistration.event_id == event_id
    ).first()
    if not reg:
        raise HTTPException(status_code=404, detail="Registration not found")

    lead = db.query(Lead).filter(Lead.id == reg.lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)

    reg.status = EventRegistrationStatus.CANCELLED
    db.commit()
    db.refresh(reg)
    log_action(db, current_user.id, "cancel", "event_registration", reg.id, {"event_id": event_id, "lead_id": reg.lead_id})
    return reg


@router.post("/events/{event_id}/registrations/{registration_id}/confirm", response_model=EventRegistrationResponse)
async def confirm_event_registration(
    event_id: int,
    registration_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    reg = db.query(EventRegistration).filter(
        EventRegistration.id == registration_id,
        EventRegistration.event_id == event_id,
    ).first()
    if not reg:
        raise HTTPException(status_code=404, detail="Registration not found")
    lead = db.query(Lead).filter(Lead.id == reg.lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)
    reg.note = _append_note_tag(reg.note, "[confirmed]")
    db.commit()
    db.refresh(reg)
    log_action(db, current_user.id, "confirm", "event_registration", reg.id, {"event_id": event_id, "lead_id": reg.lead_id})
    return reg


@router.post("/events/{event_id}/registrations/{registration_id}/mark-came", response_model=EventRegistrationResponse)
async def mark_event_registration_came(
    event_id: int,
    registration_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    reg = db.query(EventRegistration).filter(
        EventRegistration.id == registration_id,
        EventRegistration.event_id == event_id,
    ).first()
    if not reg:
        raise HTTPException(status_code=404, detail="Registration not found")
    lead = db.query(Lead).filter(Lead.id == reg.lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)
    # Если ранее пометили как no-show, убираем этот тег и ставим came
    cleaned_note = _remove_note_tag(reg.note, "[no-show]")
    reg.note = _append_note_tag(cleaned_note, "[came]")
    # Обновляем статус лида и стартовую стадию воронки «Дожать на обучение»
    lead.status = LeadStatus.DEMO
    lead.status_option_id = _get_default_lead_status_option_id(db, LeadStatus.DEMO)
    if not getattr(lead, "post_visit_stage", None):
        lead.post_visit_stage = "new"
    db.commit()
    db.refresh(reg)
    log_action(db, current_user.id, "mark_came", "event_registration", reg.id, {"event_id": event_id, "lead_id": reg.lead_id})
    # UX automation: after attendance create follow-up "offer course" (do not fail the request if this fails)
    try:
        if not _has_open_task_like(db, lead.id, "[auto_attended_offer]"):
            due_at = datetime.utcnow() + timedelta(hours=24)
            auto_task = _create_auto_event_task(
                db,
                lead=lead,
                owner_id=lead.owner_id,
                note="[auto_attended_offer] После мероприятия: предложить курс",
                due_at=due_at,
                preferred_template_keywords=["курс", "предлож", "дожим", "offer"],
            )
            db.add(auto_task)
            db.flush()
            log_action(
                db,
                current_user.id,
                "create",
                "lead_task",
                auto_task.id,
                {"lead_id": lead.id, "type": "auto_attended_offer"},
            )
            if lead.next_contact_at is None or (auto_task.due_at and lead.next_contact_at > auto_task.due_at):
                lead.next_contact_at = auto_task.due_at
            db.commit()
    except Exception:
        db.rollback()
    return reg


@router.post("/events/{event_id}/registrations/{registration_id}/mark-no-show", response_model=EventRegistrationResponse)
async def mark_event_registration_no_show(
    event_id: int,
    registration_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    reg = db.query(EventRegistration).filter(
        EventRegistration.id == registration_id,
        EventRegistration.event_id == event_id,
    ).first()
    if not reg:
        raise HTTPException(status_code=404, detail="Registration not found")
    lead = db.query(Lead).filter(Lead.id == reg.lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)
    # Если ранее пометили как пришёл, убираем этот тег и ставим no-show
    cleaned_note = _remove_note_tag(reg.note, "[came]")
    reg.note = _append_note_tag(cleaned_note, "[no-show]")
    # UX automation: after no-show create reactivation follow-up.
    if not _has_open_task_like(db, lead.id, "[auto_no_show_reactivate]"):
        due_at = datetime.utcnow() + timedelta(hours=24)
        auto_task = _create_auto_event_task(
            db,
            lead=lead,
            owner_id=lead.owner_id,
            note="[auto_no_show_reactivate] No-show: реактивация и перенос",
            due_at=due_at,
            preferred_template_keywords=["реактивац", "перезап", "no-show", "дожим"],
        )
        db.flush()
        log_action(
            db,
            current_user.id,
            "create",
            "lead_task",
            auto_task.id,
            {"lead_id": lead.id, "type": "auto_no_show_reactivate"},
        )
        if lead.next_contact_at is None or (auto_task.due_at and lead.next_contact_at > auto_task.due_at):
            lead.next_contact_at = auto_task.due_at
    db.commit()
    db.refresh(reg)
    log_action(db, current_user.id, "mark_no_show", "event_registration", reg.id, {"event_id": event_id, "lead_id": reg.lead_id})
    return reg


@router.get("/leads/{lead_id}/event-registrations", response_model=List[EventRegistrationResponse])
async def list_lead_event_registrations(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)
    return (
        db.query(EventRegistration)
        .filter(EventRegistration.lead_id == lead_id)
        .order_by(EventRegistration.created_at.desc())
        .all()
    )


@router.post("/leads/{lead_id}/post-visit-stage", response_model=LeadResponse)
async def update_lead_post_visit_stage(
    lead_id: int,
    payload: LeadPostVisitStageUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "sales"])),
):
    """Обновление стадии воронки «Дожать на обучение» после мероприятия."""
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)

    try:
        result = lead_post_visit_update_stage(
            db,
            lead_id,
            stage=payload.stage,
            review=payload.review,
            project_date=payload.project_date,
            decline_reason=payload.decline_reason,
            get_default_lead_status_option_id=_get_default_lead_status_option_id,
        )
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=404, detail=msg)
        raise HTTPException(status_code=400, detail=msg)

    lead = result.lead
    if result.need_auto_task and not _has_open_task_like(db, lead.id, "[auto_post_visit_agreed]"):
        due_at = datetime.utcnow() + timedelta(hours=48)
        auto_task = _create_auto_event_task(
            db,
            lead=lead,
            owner_id=lead.owner_id,
            note="[auto_post_visit_agreed] Контроль оплаты",
            due_at=due_at,
            preferred_template_keywords=["оплат", "контроль", "дожим"],
        )
        db.add(auto_task)
        db.flush()
        log_action(db, current_user.id, "create", "lead_task", auto_task.id, {"lead_id": lead.id, "type": "auto_post_visit_agreed"})
        if lead.next_contact_at is None or (auto_task.due_at and lead.next_contact_at > auto_task.due_at):
            lead.next_contact_at = auto_task.due_at

    db.commit()
    db.refresh(lead)
    log_action(
        db,
        current_user.id,
        "post_visit_stage",
        "lead",
        lead.id,
        {
            "stage": payload.stage,
            "review": payload.review,
            "project_date": payload.project_date.isoformat() if payload.project_date else None,
            "decline_reason": payload.decline_reason,
        },
    )
    return _fix_lead_strings(lead)


@router.get("/post-visit/leads", response_model=List[LeadResponse])
async def list_post_visit_leads(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    """
    Лиды для страницы «Дожать на обучение».

    Логика:
    - берём лидов, по которым есть регистрация на мероприятие с тегом [came] (нажали «Пришел»);
    - ограничиваем по правам (admin/owner/sales видят только свои лиды);
    - если post_visit_stage ещё не задана — проставляем 'new' (однократно).
    """
    came_lead_ids = (
        db.query(EventRegistration.lead_id)
        .filter(cast(EventRegistration.note, Text).ilike("%[came]%"))
        .distinct()
    )
    leads_q = (
        _filter_query_by_role(db.query(Lead), current_user)
        .filter(Lead.id.in_(came_lead_ids))
        .order_by(Lead.created_at.desc())
    )
    leads = leads_q.all()

    updated = False
    for lead in leads:
        if not getattr(lead, "post_visit_stage", None):
            lead.post_visit_stage = "new"
            updated = True
    if updated:
        db.commit()
        for lead in leads:
            db.refresh(lead)

    return [_fix_lead_strings(l) for l in leads]


# --- Справка для налогового вычета (форма КНД 1151158) ---
try:
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False
    mm = 2.834645669  # pt per mm, for default arg when reportlab not installed

try:
    from pypdf import PdfReader, PdfWriter
    PYPDF_AVAILABLE = True
except ImportError:
    PYPDF_AVAILABLE = False

# Путь к шаблону PDF формы (2 страницы). Если файл есть — заполняем его поверх, иначе рисуем с нуля.
def _knd_template_path() -> str:
    _base = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    return os.path.join(_base, "templates", "knd_1151158.pdf")

# Разметка под файл backend/templates/knd_1151158.pdf (координаты сняты с полей формы PDF).
# Чекбоксы: (страница, x_мм ячейки "0-нет", x_мм ячейки "1-да", y_mm, ключ, ширина_ячейки_мм). Рисуем цифру 0 или 1 по центру ячейки.
_KND_OVERLAY_CHECKBOXES = [
    (0, 80.0, 85.0, 100.3, "fulltime_study", 5.0),
    # немного сдвинули вправо, чтобы цифра была строго в своём «окошке»
    (0, 90.6, 96.0, 175.8, "taxpayer_same_as_student", 5.4),
]

# Поля посимвольно (каждый символ в своей ячейке). Шрифт 12 pt. Ширина ячейки — под бланк (не растягивать).
_KND_OVERLAY_BOXED = [
    (0, 69.5, 5.1, "org_inn", 12, 5.02, 12),
    (0, 69.5, 12.9, "org_kpp", 12, 5.04, 9),
    # номер справки: ещё немного поджали цифры друг к другу
    (0, 29.4, 46.0, "cert_number", 12, 5.4, 5),
    (0, 134.4, 45.9, "correction_number", 12, 5.17, 3),
    (0, 184.5, 45.9, "report_year", 12, 5.08, 4),
    # ИНН налогоплательщика: чуть сжали по горизонтали
    (0, 24.9, 141.8, "taxpayer_inn", 12, 5.4, 12),
    (0, 39.3, 158.0, "doc_type_code", 12, 5.3, 2),
    # серия и номер документа: немного сжали, чтобы цифры не «разъезжались»
    (0, 104.7, 158.0, "doc_series_number", 12, 6.0, 14),
    (0, 94.7, 186.0, "amount", 12, 5.2, 12),       # сумма в полях
    (0, 44.6, 247.7, "pages_count", 12, 7.6, 2),
    (1, 64.5, 5.2, "org_inn", 12, 5.02, 12),
    (1, 64.5, 12.9, "org_kpp", 12, 5.04, 9),
    (1, 129.7, 64.2, "student_inn", 12, 5.0, 12),
    (1, 39.6, 81.3, "student_doc_type_code", 12, 5.05, 2),
    (1, 104.5, 81.3, "student_doc_series_number", 12, 7.16, 14),
]

# Текстовые поля посимвольно. Шрифт 12 pt. Данные об организации и ФИО — чуть растянуты по горизонтали.
_KND_OVERLAY_TEXT_PER_CELL = [
    # данные об образовательной организации: ещё немного растянули по горизонтали
    (0, 4.8, 61.5, "org_name", 12, 4.2, 80),
    # Фамилия / Имя / Отчество: по отдельной строке, чуть шире ячейки по X
    (0, 24.9, 114.8, "taxpayer_lastname", 12, 4.2, 35),
    (0, 24.9, 123.8, "taxpayer_firstname", 12, 4.2, 30),
    (0, 24.9, 132.8, "taxpayer_patronymic", 12, 4.2, 40),
    # достоверность/полнота: немного растянули, чтобы буквы попали в свои поля
    (0, 4.9, 207.1, "confirm_fio", 12, 4.2, 55),
    (1, 24.9, 37.1, "student_lastname", 12, 4.0, 35),
    (1, 24.9, 46.2, "student_firstname", 12, 4.0, 30),
    (1, 24.9, 55.2, "student_patronymic", 12, 4.0, 40),
]

# Даты ДД.ММ.ГГГГ по ячейкам. Шрифт 12 pt.
_KND_OVERLAY_DATES_PER_CELL = [
    (0, 129.5, 141.8, 5.1, "taxpayer_dob", 12),
    (0, 39.8, 166.7, 5.1, "doc_issue_date", 12),
    (0, 56.6, 237.4, 5.1, "confirm_date", 12),
    (1, 39.7, 90.3, 5.1, "student_dob", 12),
    (1, 39.7, 90.3, 5.1, "student_doc_issue_date", 12),
    (1, 119.6, 286.3, 5.1, "confirm_date", 12),
]

# Смещение по вертикали (мм): опускаем символы в ячейках, чтобы попадали в свои поля.
_KND_Y_OFFSET_MM = 5.0

# Шрифт с кириллицей (без него русский текст отображается чёрными квадратами)
_PDF_FONT_NAME = "Helvetica"
_PDF_FONT_BOLD = "Helvetica-Bold"


def _register_cyrillic_font() -> None:
    global _PDF_FONT_NAME, _PDF_FONT_BOLD
    if _PDF_FONT_NAME != "Helvetica":
        return
    _base = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    _candidates = [
        os.path.join(_base, "fonts", "DejaVuSans.ttf"),
        os.path.join(_base, "app", "fonts", "DejaVuSans.ttf"),
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/TTF/DejaVuSans.ttf",
        os.path.join(os.environ.get("SystemRoot", "C:\\Windows"), "Fonts", "arial.ttf"),
    ]
    _font_path = None
    for p in _candidates:
        if p and os.path.isfile(p):
            _font_path = p
            break
    if not _font_path:
        return
    try:
        pdfmetrics.registerFont(TTFont("Cyrillic", _font_path))
        _PDF_FONT_NAME = "Cyrillic"
        _bold_path = _font_path.replace("DejaVuSans.ttf", "DejaVuSans-Bold.ttf").replace("arial.ttf", "arialbd.ttf")
        if os.path.isfile(_bold_path):
            pdfmetrics.registerFont(TTFont("CyrillicBold", _bold_path))
            _PDF_FONT_BOLD = "CyrillicBold"
        else:
            _PDF_FONT_BOLD = "Cyrillic"
    except Exception:
        pass


def _draw_date_cells(c, x: float, y: float, d: str, cell_w: float = 7 * mm):
    """Печатает дату в ячейках ДД.ММ.ГГГГ (три группы: ДД, ММ, ГГГГ)."""
    parts = (d or "").replace("-", ".").split(".") if d else []
    day = (parts[0] if len(parts) > 0 else "").zfill(2)[:2]
    month = (parts[1] if len(parts) > 1 else "").zfill(2)[:2]
    year = (parts[2] if len(parts) > 2 else "")[:4]
    c.drawString(x, y, day)
    c.drawString(x + cell_w + 1, y, month)
    c.drawString(x + (cell_w + 1) * 2, y, year)


def _draw_date_per_cell(c, x_pt: float, y_pt: float, date_str: str, cell_w_pt: float, font_name: str, font_size: int) -> None:
    """Рисует дату ДД.ММ.ГГГГ по одному символу в ячейку (10 ячеек), по центру ячейки."""
    parts = (date_str or "").replace("-", ".").split(".") if date_str else []
    day = (parts[0] if len(parts) > 0 else "").zfill(2)[:2]
    month = (parts[1] if len(parts) > 1 else "").zfill(2)[:2]
    year = (parts[2] if len(parts) > 2 else "")[:4]
    s = f"{day}.{month}.{year}"
    c.setFont(font_name, font_size)
    for i, ch in enumerate(s[:10]):
        try:
            w = c.stringWidth(ch, font_name, font_size)
            c.drawString(x_pt + i * cell_w_pt + (cell_w_pt - w) / 2.0, y_pt, ch)
        except Exception:
            c.drawString(x_pt + i * cell_w_pt, y_pt, ch)


def _draw_string_per_cell(c, x_pt: float, y_pt: float, value: str, cell_w_pt: float, max_chars: int, font_name: str, font_size: int) -> None:
    """Рисует строку посимвольно: каждый символ в своей ячейке, по центру ячейки по горизонтали. Пробел = пустая ячейка."""
    s = (value or "").strip()[:max_chars]
    c.setFont(font_name, font_size)
    pos = 0.0
    for ch in s:
        if ch != " ":
            try:
                w = c.stringWidth(ch, font_name, font_size)
                c.drawString(x_pt + pos + (cell_w_pt - w) / 2.0, y_pt, ch)
            except Exception:
                c.drawString(x_pt + pos, y_pt, ch)
        pos += cell_w_pt


def _format_amount_for_cells(amount_val) -> str:
    """Форматирует сумму для посимвольного вывода: XXXXX.XX (рубли.копейки)."""
    if amount_val is None or amount_val == "":
        return "0.00"
    try:
        n = float(str(amount_val).replace(",", ".").replace(" ", ""))
        return f"{n:.2f}"
    except (ValueError, TypeError):
        return "0.00"


def _build_tax_deduction_pdf_from_template(template_path: str, data: Dict) -> bytes:
    """Заполняет загруженную PDF-форму: подложка — шаблон, поверх — только данные по координатам."""
    _register_cyrillic_font()
    reader = PdfReader(template_path)
    page_w_pt = float(reader.pages[0].mediabox.width)
    page_h_pt = float(reader.pages[0].mediabox.height)
    # мм -> pt (A4: 210x297 mm = 595x842 pt)
    def x_pt(x_mm: float) -> float:
        return x_mm * (page_w_pt / 210.0)
    def y_pt(y_mm_from_top: float) -> float:
        return page_h_pt - y_mm_from_top * (page_h_pt / 297.0)
    # Опускаем символы в ячейках (базовая линия ниже), чтобы не прилипали к верхней линии
    def y_pt_adj(y_mm: float) -> float:
        return y_pt(y_mm + _KND_Y_OFFSET_MM)

    pt_per_mm = page_w_pt / 210.0
    for i, page in enumerate(reader.pages):
        w = float(page.mediabox.width)
        h = float(page.mediabox.height)
        buf = BytesIO()
        c = canvas.Canvas(buf, pagesize=(w, h))
        c.setFont(_PDF_FONT_NAME, 12)
        # Цифровые/кодовые поля: по одному символу в ячейку
        for (p, x_mm, y_mm, key, size, cell_mm, max_ch) in _KND_OVERLAY_BOXED:
            if p != i:
                continue
            if key == "amount":
                val = _format_amount_for_cells(data.get(key))
            else:
                val = (data.get(key) or "")
                if isinstance(val, (bool, int)):
                    val = str(val)
            val = (val or "").replace(" ", "")[:max_ch] if key != "doc_series_number" and key != "student_doc_series_number" else (val or "")[:max_ch]
            cell_pt = cell_mm * pt_per_mm
            _draw_string_per_cell(c, x_pt(x_mm), y_pt_adj(y_mm), val, cell_pt, max_ch, _PDF_FONT_NAME, size)
        # Текстовые поля: по одному символу (буква/пробел) в ячейку
        for (p, x_mm, y_mm, key, size, cell_mm, max_ch) in _KND_OVERLAY_TEXT_PER_CELL:
            if p != i:
                continue
            val = (data.get(key) or "")
            if isinstance(val, (bool, int)):
                val = str(val)
            val = (val or "")[:max_ch]
            cell_pt = cell_mm * pt_per_mm
            _draw_string_per_cell(c, x_pt(x_mm), y_pt_adj(y_mm), val, cell_pt, max_ch, _PDF_FONT_NAME, size)
        # Даты: ДД.ММ.ГГГГ по одному символу в ячейку
        for (p, x_mm, y_mm, cell_mm, key, size) in _KND_OVERLAY_DATES_PER_CELL:
            if p != i:
                continue
            d = data.get(key) or ""
            if not d:
                d = date.today().isoformat()
            cell_pt = cell_mm * pt_per_mm
            _draw_date_per_cell(c, x_pt(x_mm), y_pt_adj(y_mm), d, cell_pt, _PDF_FONT_NAME, size)
        for cb in _KND_OVERLAY_CHECKBOXES:
            if len(cb) == 6:
                p, x_no, x_yes, y_mm, key, cell_w_mm = cb
            else:
                p, x_no, x_yes, y_mm, key = cb
                cell_w_mm = 5.0
            if p != i:
                continue
            v = data.get(key)
            c.setFont(_PDF_FONT_NAME, 12)
            cell_w_pt = cell_w_mm * pt_per_mm
            if v is True or v == "1":
                ch = "1"
                x_center = x_pt(x_yes) + (cell_w_pt - c.stringWidth(ch, _PDF_FONT_NAME, 12)) / 2.0
                c.drawString(x_center, y_pt_adj(y_mm), ch)
            elif v is False or v == "0":
                ch = "0"
                x_center = x_pt(x_no) + (cell_w_pt - c.stringWidth(ch, _PDF_FONT_NAME, 12)) / 2.0
                c.drawString(x_center, y_pt_adj(y_mm), ch)
        c.save()
        buf.seek(0)
        overlay = PdfReader(buf)
        page.merge_page(overlay.pages[0])

    out = BytesIO()
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    writer.write(out)
    out.seek(0)
    return out.read()


def _build_tax_deduction_pdf_knd(data: Dict) -> bytes:
    """Формирует PDF по форме КНД 1151158 (2 страницы)."""
    _register_cyrillic_font()
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    left = 20 * mm
    right = w - 20 * mm
    row = 5.5 * mm

    def _y():
        nonlocal y
        y -= row
        return y + row

    # ---------- СТРАНИЦА 1 ----------
    y = h - 15 * mm
    c.setFont(_PDF_FONT_NAME, 8)
    c.drawString(right - 50 * mm, y, "ИНН")
    c.drawString(right - 50 * mm, y - 4 * mm, (data.get("org_inn") or ""))
    c.drawString(right - 20 * mm, y, "КПП")
    c.drawString(right - 20 * mm, y - 4 * mm, (data.get("org_kpp") or ""))
    c.drawString(right - 5 * mm, y, "Стр. 0:01")
    y -= 12 * mm

    c.setFont(_PDF_FONT_NAME, 9)
    c.drawCentredString(w / 2, y, "Форма по КНД 1151158")
    y -= 6 * mm
    c.setFont(_PDF_FONT_BOLD, 10)
    c.drawCentredString(w / 2, y, "Справка об оплате образовательных услуг для представления в налоговый орган")
    y -= 10 * mm

    c.setFont(_PDF_FONT_NAME, 9)
    c.drawString(left, _y(), "Номер справки")
    c.drawString(left + 45 * mm, y + row, data.get("cert_number") or "")
    c.drawString(left + 90 * mm, y + row, "Номер корректировки")
    c.drawString(left + 130 * mm, y + row, data.get("correction_number") or "")
    _y()
    c.drawString(left, _y(), "Отчетный год")
    c.drawString(left + 35 * mm, y + row, data.get("report_year") or "")
    y -= 3 * mm

    c.setFont(_PDF_FONT_NAME, 9)
    c.drawString(left, _y(), "Данные образовательной организации / индивидуального предпринимателя,")
    _y()
    c.drawString(left, _y(), "осуществляющего образовательную деятельность:")
    y -= 2 * mm
    org_name = (data.get("org_name") or "")[:120]
    for i in range(0, min(len(org_name), 80), 60):
        c.drawString(left, _y(), org_name[i : i + 60])
    c.drawString(left, _y(), "(наименование образовательной организации / фамилия, имя, отчество ИП)")
    y -= 2 * mm

    c.drawString(left, _y(), "Обучение проводилось по очной форме обучения")
    ft = data.get("fulltime_study")
    c.drawString(left + 95 * mm, y + row, "0 - нет")
    if ft is False or ft == "0":
        c.drawString(left + 105 * mm, y + row, "X")
    c.drawString(left + 115 * mm, y + row, "1 - да")
    if ft is True or ft == "1":
        c.drawString(left + 125 * mm, y + row, "X")
    _y()
    y -= 3 * mm

    c.drawString(left, _y(), "Данные физического лица (его супруга/супруги), оплатившего образовательные услуги (далее – налогоплательщик):")
    y -= 2 * mm
    c.drawString(left, _y(), "Фамилия")
    c.drawString(left + 28 * mm, y + row, (data.get("taxpayer_lastname") or "")[:35])
    c.drawString(left + 95 * mm, y + row, "Имя")
    c.drawString(left + 105 * mm, y + row, (data.get("taxpayer_firstname") or "")[:25])
    _y()
    c.drawString(left, _y(), "Отчество")
    c.drawString(left + 28 * mm, y + row, (data.get("taxpayer_patronymic") or "")[:35])
    c.drawString(left + 95 * mm, y + row, "ИНН")
    c.drawString(left + 105 * mm, y + row, (data.get("taxpayer_inn") or "")[:12])
    _y()
    c.drawString(left, _y(), "Дата рождения")
    _draw_date_cells(c, left + 38 * mm, y + row, data.get("taxpayer_dob"), 7 * mm)
    y -= 3 * mm

    c.drawString(left, _y(), "Сведения о документе, удостоверяющем личность:")
    c.drawString(left, _y(), "Код вида документа")
    c.drawString(left + 45 * mm, y + row, (data.get("doc_type_code") or "")[:5])
    c.drawString(left + 75 * mm, y + row, "Серия и номер")
    c.drawString(left + 105 * mm, y + row, (data.get("doc_series_number") or "")[:25])
    _y()
    c.drawString(left, _y(), "Дата выдачи")
    _draw_date_cells(c, left + 32 * mm, y + row, data.get("doc_issue_date"), 7 * mm)
    y -= 3 * mm

    c.drawString(left, _y(), "Налогоплательщик и обучаемый являются одним лицом")
    same = data.get("taxpayer_same_as_student")
    c.drawString(left + 95 * mm, y + row, "0 - нет")
    if same is False or same == "0":
        c.drawString(left + 105 * mm, y + row, "X")
    c.drawString(left + 115 * mm, y + row, "1 - да")
    if same is True or same == "1":
        c.drawString(left + 125 * mm, y + row, "X")
    _y()
    y -= 2 * mm

    c.drawString(left, _y(), "Сумма расходов на оказанные образовательные услуги")
    c.drawString(left + 95 * mm, y + row, (data.get("amount") or "0"))
    y -= 8 * mm

    c.drawString(left, _y(), "Достоверность и полноту сведений, указанных в настоящей справке, подтверждаю:")
    _y()
    c.drawString(left, _y(), (data.get("confirm_fio") or "")[:70])
    c.drawString(left, _y(), "(фамилия, имя, отчество)")
    c.drawString(left, _y(), "Подпись _______________________")
    c.drawString(left, _y(), "Дата")
    _draw_date_cells(c, left + 15 * mm, y + row, data.get("confirm_date") or date.today().isoformat(), 7 * mm)
    _y()
    c.drawString(left, _y(), "Справка составлена на")
    c.drawString(left + 55 * mm, y + row, data.get("pages_count") or "2")
    c.drawString(left + 65 * mm, y + row, "страницах")

    c.rect(right - 25 * mm, h - 75 * mm, 22 * mm, 45 * mm)
    c.setFont(_PDF_FONT_NAME, 8)
    c.drawString(right - 24 * mm, h - 78 * mm, "Зона QR-кода")

    c.setFont(_PDF_FONT_NAME, 7)
    c.drawString(left, 18 * mm, "1 Отчество указывается при наличии (относится ко всем листам документа).")
    c.drawString(left, 14 * mm, "2 ИНН указывается при наличии.")
    c.drawString(left, 10 * mm, "Подготовлено с использованием системы КонсультантПлюс")

    c.showPage()

    # ---------- СТРАНИЦА 2 (данные обучаемого) ----------
    y = h - 15 * mm
    c.setFont(_PDF_FONT_NAME, 8)
    c.drawString(right - 50 * mm, y, "ИНН")
    c.drawString(right - 50 * mm, y - 4 * mm, (data.get("org_inn") or ""))
    c.drawString(right - 20 * mm, y, "КПП")
    c.drawString(right - 20 * mm, y - 4 * mm, (data.get("org_kpp") or ""))
    c.drawString(right - 5 * mm, y, "Стр. 0:02")
    y -= 14 * mm

    c.setFont(_PDF_FONT_NAME, 9)
    c.drawString(left, _y(), "Данные физического лица, которому оказаны образовательные услуги:")
    c.drawString(left, _y(), "Фамилия")
    c.drawString(left + 28 * mm, y + row, (data.get("student_lastname") or "")[:35])
    c.drawString(left + 95 * mm, y + row, "Имя")
    c.drawString(left + 105 * mm, y + row, (data.get("student_firstname") or "")[:25])
    _y()
    c.drawString(left, _y(), "Отчество")
    c.drawString(left + 28 * mm, y + row, (data.get("student_patronymic") or "")[:35])
    c.drawString(left + 95 * mm, y + row, "ИНН")
    c.drawString(left + 105 * mm, y + row, (data.get("student_inn") or "")[:12])
    _y()
    c.drawString(left, _y(), "Дата рождения")
    _draw_date_cells(c, left + 38 * mm, y + row, data.get("student_dob"), 7 * mm)
    y -= 3 * mm

    c.drawString(left, _y(), "Сведения о документе, удостоверяющем личность:")
    c.drawString(left, _y(), "Код вида документа")
    c.drawString(left + 45 * mm, y + row, (data.get("student_doc_type_code") or "")[:5])
    c.drawString(left + 75 * mm, y + row, "Серия и номер")
    c.drawString(left + 105 * mm, y + row, (data.get("student_doc_series_number") or "")[:25])
    _y()
    c.drawString(left, _y(), "Дата выдачи")
    _draw_date_cells(c, left + 32 * mm, y + row, data.get("student_doc_issue_date"), 7 * mm)
    y -= 12 * mm

    c.drawString(left, _y(), "Достоверность и полноту сведений, указанных на данной странице, подтверждаю:")
    _y()
    c.drawString(left, _y(), "Подпись _______________________  Дата")
    _draw_date_cells(c, left + 95 * mm, y + row, data.get("confirm_date") or date.today().isoformat(), 7 * mm)

    c.setFont(_PDF_FONT_NAME, 7)
    c.drawString(left, 10 * mm, "Подготовлено с использованием системы КонсультантПлюс")

    c.showPage()
    c.save()
    buf.seek(0)
    return buf.read()


@router.get("/tax-deduction-certificate/status")
async def tax_deduction_certificate_status(
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    """Проверка: путь к шаблону PDF и доступен ли он (для отладки деплоя)."""
    template_path = _knd_template_path()
    return {
        "template_path": template_path,
        "template_exists": os.path.isfile(template_path),
        "pypdf_available": PYPDF_AVAILABLE,
        "will_use_template": PYPDF_AVAILABLE and os.path.isfile(template_path),
    }


@router.post("/tax-deduction-certificate")
async def generate_tax_deduction_certificate(
    body: Dict,
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    """
    Формирует PDF справки по форме КНД 1151158 (2 страницы).
    Поля: org_inn, org_kpp, cert_number, correction_number, report_year, org_name,
    fulltime_study (1/0), taxpayer_* (lastname, firstname, patronymic, inn, dob),
    doc_type_code, doc_series_number, doc_issue_date, taxpayer_same_as_student (1/0),
    amount, confirm_fio, confirm_date, pages_count,
    student_* (если не одно лицо): lastname, firstname, patronymic, inn, dob,
    student_doc_type_code, student_doc_series_number, student_doc_issue_date.
    """
    if not REPORTLAB_AVAILABLE:
        raise HTTPException(status_code=503, detail="Генерация PDF недоступна (reportlab не установлен)")
    template_path = _knd_template_path()
    use_template = PYPDF_AVAILABLE and os.path.isfile(template_path)
    if use_template:
        pdf_bytes = _build_tax_deduction_pdf_from_template(template_path, body)
    else:
        pdf_bytes = _build_tax_deduction_pdf_knd(body)
    filename = "spravka_KND_1151158.pdf"
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "X-Spravka-Source": "template" if use_template else "generated",
    }
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)


# ═══════════════════════════════════════════════════════════════════════════════
# LeadActivity helpers + endpoints (Этап 2 ТЗ)
# ═══════════════════════════════════════════════════════════════════════════════

def _create_lead_activity(
    db: Session,
    lead_id: int,
    *,
    type: str,
    title: str,
    description: str | None = None,
    channel: str | None = None,
    created_by: int | None = None,
    payload_json: dict | None = None,
    status_effect_from: str | None = None,
    status_effect_to: str | None = None,
    related_task_id: int | None = None,
    related_invoice_id: int | None = None,
) -> LeadActivity:
    """Создаёт запись в таймлайне лида."""
    activity = LeadActivity(
        lead_id=lead_id,
        type=type,
        title=title,
        description=description,
        channel=channel,
        created_by=created_by,
        payload_json=payload_json,
        status_effect_from=status_effect_from,
        status_effect_to=status_effect_to,
        related_task_id=related_task_id,
        related_invoice_id=related_invoice_id,
    )
    db.add(activity)
    return activity


# ─── GET /leads/{lead_id}/timeline ──────────────────────────────────────────

@router.get("/leads/{lead_id}/timeline", response_model=LeadTimelineResponse)
async def get_lead_timeline(
    lead_id: int,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Полный таймлайн по лиду с пагинацией."""
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)

    total = db.query(func.count(LeadActivity.id)).filter(LeadActivity.lead_id == lead_id).scalar() or 0
    items = (
        db.query(LeadActivity)
        .filter(LeadActivity.lead_id == lead_id)
        .order_by(LeadActivity.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return LeadTimelineResponse(
        items=items,
        total=total,
        has_more=(offset + limit) < total,
    )


# ─── GET /leads/{lead_id}/card ──────────────────────────────────────────────

def _build_next_action(lead: Lead, db: Session) -> LeadNextAction | None:
    """Вычисляет следующее действие по лиду."""
    now = datetime.utcnow()

    # Ближайшая открытая задача
    next_task = (
        db.query(LeadTask)
        .filter(
            LeadTask.lead_id == lead.id,
            LeadTask.status == LeadTaskStatus.OPEN,
            LeadTask.due_at.isnot(None),
        )
        .order_by(LeadTask.due_at.asc())
        .first()
    )

    # next_contact_at на лиде
    next_contact = lead.next_contact_at

    # Выбираем ближайшее
    candidates = []
    if next_task and next_task.due_at:
        due = next_task.due_at.replace(tzinfo=None) if next_task.due_at.tzinfo else next_task.due_at
        candidates.append(("task", next_task.note or "Задача", due, next_task.id))
    if next_contact:
        nc = next_contact.replace(tzinfo=None) if next_contact.tzinfo else next_contact
        candidates.append(("contact", "Перезвонить", nc, None))

    if not candidates:
        return None

    candidates.sort(key=lambda c: c[2])
    c_type, c_title, c_due, c_task_id = candidates[0]

    return LeadNextAction(
        type=c_type,
        title=c_title,
        due_at=c_due,
        task_id=c_task_id,
        is_overdue=c_due < now,
        is_today=c_due.date() == now.date(),
    )


def _build_sidebar(lead: Lead, db: Session) -> LeadSidebarSummary:
    """Сводка для sidebar карточки лида."""
    open_tasks = (
        db.query(LeadTask)
        .filter(LeadTask.lead_id == lead.id, LeadTask.status == LeadTaskStatus.OPEN)
        .order_by(LeadTask.due_at.asc().nullslast())
        .limit(3)
        .all()
    )
    open_count = (
        db.query(func.count(LeadTask.id))
        .filter(LeadTask.lead_id == lead.id, LeadTask.status == LeadTaskStatus.OPEN)
        .scalar()
    ) or 0

    last_invoice = (
        db.query(Invoice)
        .filter(Invoice.lead_id == lead.id)
        .order_by(Invoice.created_at.desc())
        .first()
    )
    unpaid_count = (
        db.query(func.count(Invoice.id))
        .filter(
            Invoice.lead_id == lead.id,
            Invoice.status.in_([InvoiceStatus.SENT, InvoiceStatus.OVERDUE]),
        )
        .scalar()
    ) or 0

    return LeadSidebarSummary(
        open_tasks_count=open_count,
        nearest_tasks=open_tasks,
        last_invoice=last_invoice,
        unpaid_invoices_count=unpaid_count,
    )


@router.get("/leads/{lead_id}/card", response_model=LeadCardResponse)
async def get_lead_card(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Агрегированный ответ для карточки лида — один запрос для быстрой отрисовки."""
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)

    lead = _fix_lead_strings(lead)
    next_action = _build_next_action(lead, db)
    sidebar = _build_sidebar(lead, db)

    # Timeline preview: последние 10 записей
    timeline_preview = (
        db.query(LeadActivity)
        .filter(LeadActivity.lead_id == lead_id)
        .order_by(LeadActivity.created_at.desc())
        .limit(10)
        .all()
    )

    return LeadCardResponse(
        lead=lead,
        next_action=next_action,
        pinned_comment=lead.comment if lead.comment else None,
        sidebar=sidebar,
        timeline_preview=timeline_preview,
    )


# ─── POST /leads/{lead_id}/quick-action ────────────────────────────────────

@router.post("/leads/{lead_id}/quick-action", response_model=QuickActionResponse)
async def lead_quick_action(
    lead_id: int,
    payload: QuickActionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    """
    Единый endpoint для быстрых действий менеджера.
    Создаёт activity, меняет статус при необходимости, возвращает результат.
    """
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)

    action = payload.action
    old_status = lead.status.value if isinstance(lead.status, LeadStatus) else str(lead.status)
    new_status = old_status
    activity_type = action
    activity_title = ""
    activity_description = payload.comment

    if action == "called":
        activity_title = "Дозвонились"
        if old_status == "new":
            lead.status = LeadStatus.CONTACTED
            new_status = "contacted"
        if payload.next_contact_at:
            lead.next_contact_at = payload.next_contact_at

    elif action == "no_answer":
        activity_title = "Не дозвонились"
        lead.no_answer_attempt = (lead.no_answer_attempt or 0) + 1
        if lead.no_answer_attempt <= 3:
            lead.status = LeadStatus.NO_ANSWER
            new_status = "no_answer"
        if payload.next_contact_at:
            lead.next_contact_at = payload.next_contact_at
        else:
            # Авто-follow-up: перезвонить через 4 часа если дата не задана
            lead.next_contact_at = datetime.utcnow() + timedelta(hours=4)

    elif action == "sent_info":
        activity_title = "Отправлена информация"
        # Подгружаем шаблон, если передан
        if payload.template_id:
            tpl = db.query(LeadInfoTemplate).filter(
                LeadInfoTemplate.id == payload.template_id,
                LeadInfoTemplate.is_active.is_(True),
            ).first()
            if tpl:
                activity_title = f"Отправлена информация: {tpl.name}"
                if not payload.comment:
                    activity_description = tpl.body
        lead.status = LeadStatus.THINKING
        new_status = "thinking"
        # Авто-follow-up: если дата не передана — ставим через 2 дня
        if payload.next_contact_at:
            lead.next_contact_at = payload.next_contact_at
        else:
            lead.next_contact_at = datetime.utcnow() + timedelta(days=2)

    elif action == "schedule_contact":
        activity_title = "Назначен повторный контакт"
        if payload.next_contact_at:
            lead.next_contact_at = payload.next_contact_at

    elif action == "create_invoice":
        activity_title = "Создан счёт"
        if not payload.abonement_id:
            raise HTTPException(status_code=400, detail="abonement_id обязателен для создания счёта")
        abonement = db.query(Abonement).filter(Abonement.id == payload.abonement_id).first()
        if not abonement:
            raise HTTPException(status_code=404, detail="Абонемент не найден")
        invoice = Invoice(
            lead_id=lead_id,
            abonement_id=payload.abonement_id,
            amount=abonement.price,
            currency="RUB",
            status=InvoiceStatus.SENT,
            email_to=payload.invoice_email or lead.email,
        )
        db.add(invoice)
        db.flush()
        lead.status = LeadStatus.INVOICE_SENT
        new_status = "invoice_sent"
        activity_type = "invoice_created"

    elif action == "payment_received":
        activity_title = "Оплата получена"
        # Помечаем последний неоплаченный счёт как оплаченный
        unpaid = (
            db.query(Invoice)
            .filter(
                Invoice.lead_id == lead_id,
                Invoice.status.in_([InvoiceStatus.SENT, InvoiceStatus.OVERDUE]),
            )
            .order_by(Invoice.created_at.desc())
            .first()
        )
        if unpaid:
            unpaid.status = InvoiceStatus.PAID
            unpaid.paid_at = datetime.utcnow()
        lead.status = LeadStatus.WON
        new_status = "won"
        activity_type = "invoice_paid"

    elif action == "refused":
        activity_title = "Отказ"
        lead.status = LeadStatus.REFUSED
        new_status = "refused"
        lead.lost_reason = payload.lost_reason
        activity_type = "status_changed"

    elif action == "enrolled":
        activity_title = "Успешно записан"
        lead.status = LeadStatus.WON
        new_status = "won"
        activity_type = "status_changed"

    else:
        raise HTTPException(status_code=400, detail=f"Неизвестное действие: {action}")

    # Создаём activity
    status_from = old_status if old_status != new_status else None
    status_to = new_status if old_status != new_status else None
    activity = _create_lead_activity(
        db, lead_id,
        type=activity_type,
        title=activity_title,
        description=activity_description,
        channel=payload.channel,
        created_by=current_user.id,
        status_effect_from=status_from,
        status_effect_to=status_to,
    )

    db.commit()
    db.refresh(lead)
    db.refresh(activity)
    log_action(db, current_user.id, "quick_action", "lead", lead.id, {"action": action})

    next_action = _build_next_action(lead, db)

    return QuickActionResponse(
        success=True,
        message=activity_title,
        activity=activity,
        new_status=new_status if old_status != new_status else None,
        next_action=next_action,
    )
