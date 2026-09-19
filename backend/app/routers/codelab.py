import hashlib
import hmac
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import CourseCatalogItem, CourseCatalogItemKind, Student, StudentStatus, User
from app.schemas.codelab import CodelabCourseWebhook, CodelabStudentProgress
from app.services.codelab_sso import CODELAB_EXTERNAL_BASE, fetch_student_codelab_progress
from app.services.kodex_sso import SSO_KODEX_SHARED_SECRET

logger = logging.getLogger(__name__)
router = APIRouter()


def codelab_course_code(course_id: int) -> str:
    return f"codelab-{course_id}"


@router.get("/students/{student_id}/progress", response_model=CodelabStudentProgress)
async def get_student_progress(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Прогресс ученика на Codelab. Доступно служебным ролям с codelab.access
    (тренер/методист), а также родителю — только для своих активных детей."""
    is_staff = auth.has_permission(current_user, "codelab.access")
    is_own_child = False
    if not is_staff and auth.has_permission(current_user, "parent_dashboard.access"):
        student = (
            db.query(Student)
            .filter(
                Student.id == student_id,
                Student.parent_id == current_user.id,
                Student.status == StudentStatus.ACTIVE,
            )
            .first()
        )
        is_own_child = student is not None
    if not is_staff and not is_own_child:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")

    try:
        overview = await fetch_student_codelab_progress(student_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Codelab недоступен: {e}")

    if not overview:
        return CodelabStudentProgress(started=False)
    return CodelabStudentProgress(started=True, **overview)


# ─── Вебхук публикации курса — ведёт пункт витрины портала ──────────────────────

@router.post("/courses/webhook")
async def codelab_course_webhook(request: Request, db: Session = Depends(get_db)):
    """Codelab зовёт при смене видимости курса. Подпись — HMAC тела общим
    секретом (заголовок X-LP-Signature, как X-Kodex-Signature у progress-sync).
    Ведёт пункт витрины `codelab-<course_id>`."""
    raw = await request.body()
    sig = request.headers.get("X-LP-Signature", "")
    secret = SSO_KODEX_SHARED_SECRET.encode("utf-8")
    if not secret or not sig or not hmac.compare_digest(
        hmac.new(secret, raw, hashlib.sha256).hexdigest(), sig
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверная подпись")

    payload = CodelabCourseWebhook.model_validate_json(raw)
    c = payload.course
    code = codelab_course_code(c.id)
    item = db.query(CourseCatalogItem).filter(CourseCatalogItem.code == code).first()

    if payload.event == "published":
        base = CODELAB_EXTERNAL_BASE.rstrip("/")
        external_url = f"{base}/api/auth/sso?course={c.id}"
        if item:
            item.name = c.title
            item.description = c.description
            item.external_url = external_url
            item.is_active = True
        else:
            db.add(CourseCatalogItem(
                code=code,
                name=c.title,
                description=c.description,
                kind=CourseCatalogItemKind.EXTERNAL,
                external_url=external_url,
                is_active=True,
                sort_order=100,
            ))
        db.commit()
    elif payload.event in ("unpublished", "deleted"):
        if item:
            item.is_active = False
            db.commit()
    else:
        logger.warning("codelab webhook: unknown event %r", payload.event)

    return {"ok": True}
