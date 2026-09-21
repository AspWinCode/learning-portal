import hashlib
import hmac
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import CourseCatalogItem, CourseCatalogItemKind, Group, GroupStudent, Student, StudentStatus, User, UserRole
from app.routers.action_log import log_action
from app.schemas.codelab import (
    CodelabCourseCreate,
    CodelabCourseWebhook,
    CodelabGradeIn,
    CodelabStudentProgress,
)
from app.services import codelab_client as cl
from app.services.codelab_client import CodelabError
from app.services.codelab_sso import CODELAB_EXTERNAL_BASE, fetch_student_codelab_progress
from app.services.kodex_sso import SSO_KODEX_SHARED_SECRET

logger = logging.getLogger(__name__)
router = APIRouter()


def codelab_course_code(course_id: int) -> str:
    return f"codelab-{course_id}"


def _student_id_from_external_ref(ref: str) -> int | None:
    if not ref.startswith("lp-student-"):
        return None
    try:
        return int(ref.rsplit("-", 1)[1])
    except ValueError:
        return None


def _trainer_student_ids(db: Session, trainer_id: int) -> set[int]:
    return {
        row[0]
        for row in db.query(GroupStudent.student_id)
        .join(Group, Group.id == GroupStudent.group_id)
        .filter(Group.trainer_id == trainer_id, GroupStudent.left_at.is_(None))
    }


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


# ══════════ Студия методиста / кабинет преподавателя — проксирование Codelab ═══
# Методист создаёт/публикует курсы, преподаватель смотрит и оценивает посылки —
# из своего аккаунта портала, не заходя в Codelab напрямую (как у PixelForge/Kodex).
# Портал ничего не хранит, только прокидывает в /api/lms-admin/** Codelab с
# HMAC-подписью (codelab_client). Курс создаёт методист (codelab.manage);
# посылки смотрит и оценивает любой, у кого есть codelab.access (тренер тоже).

def _raise(e: CodelabError):
    raise HTTPException(
        status_code=e.status_code if e.status_code < 500 else 502,
        detail=e.detail if e.status_code < 500 else f"Codelab недоступен: {e.detail}",
    )


def _manage(current_user: User = Depends(auth.require_permission("codelab.manage"))) -> User:
    return current_user


def _access(current_user: User = Depends(auth.require_permission("codelab.access"))) -> User:
    return current_user


@router.get("/admin/courses")
async def admin_list_courses(current_user: User = Depends(_manage)):
    try:
        return await cl.list_courses(current_user)
    except CodelabError as e:
        _raise(e)


@router.post("/admin/courses", status_code=status.HTTP_201_CREATED)
async def admin_create_course(
    payload: CodelabCourseCreate,
    current_user: User = Depends(_manage),
    db: Session = Depends(get_db),
):
    try:
        course = await cl.create_course(current_user, payload.model_dump(exclude_unset=True))
    except CodelabError as e:
        _raise(e)
        return
    log_action(db, current_user.id, "create", "codelab_course", course.get("id"), {"title": course.get("title")})
    return course


@router.post("/admin/courses/{course_id}/tasks", status_code=status.HTTP_201_CREATED)
async def admin_create_task(course_id: int, payload: dict, current_user: User = Depends(_manage)):
    try:
        return await cl.create_task(current_user, course_id, payload)
    except CodelabError as e:
        _raise(e)


@router.post("/admin/courses/{course_id}/items", status_code=status.HTTP_201_CREATED)
async def admin_create_item(course_id: int, payload: dict, current_user: User = Depends(_manage)):
    try:
        return await cl.create_item(current_user, course_id, payload)
    except CodelabError as e:
        _raise(e)


@router.put("/admin/items/{item_id}")
async def admin_update_item(item_id: int, payload: dict, current_user: User = Depends(_manage)):
    try:
        return await cl.update_item(current_user, item_id, payload)
    except CodelabError as e:
        _raise(e)


@router.delete("/admin/items/{item_id}")
async def admin_delete_item(item_id: int, current_user: User = Depends(_manage)):
    try:
        await cl.delete_item(current_user, item_id)
    except CodelabError as e:
        _raise(e)
        return
    return {"ok": True}


@router.get("/admin/courses/{course_id}/tree")
async def admin_get_course_tree(course_id: int, current_user: User = Depends(_manage)):
    try:
        return await cl.get_course_tree(current_user, course_id)
    except CodelabError as e:
        _raise(e)


@router.post("/admin/courses/{course_id}/publish")
async def admin_publish_course(course_id: int, current_user: User = Depends(_manage), db: Session = Depends(get_db)):
    try:
        course = await cl.publish_course(current_user, course_id)
    except CodelabError as e:
        _raise(e)
        return
    log_action(db, current_user.id, "publish", "codelab_course", course_id, {})
    return course


@router.post("/admin/courses/{course_id}/unpublish")
async def admin_unpublish_course(course_id: int, current_user: User = Depends(_manage), db: Session = Depends(get_db)):
    try:
        return await cl.unpublish_course(current_user, course_id)
    except CodelabError as e:
        _raise(e)


# ─── Кабинет преподавателя (TCH-001/003/004) ───────────────────────────────────

@router.get("/admin/courses/{course_id}/submissions")
async def admin_list_submissions(course_id: int, current_user: User = Depends(_access), db: Session = Depends(get_db)):
    """RBAC-002: методист/админ видят все посылки курса; тренер — только
    учеников своих групп. Codelab не знает про группы LMS, поэтому список
    приходит целиком, а фильтрация по группе — здесь."""
    try:
        rows = await cl.list_course_submissions(current_user, course_id)
    except CodelabError as e:
        _raise(e)
        return

    if auth.resolve_effective_role(current_user) == UserRole.TRAINER:
        my_student_ids = _trainer_student_ids(db, current_user.id)
        rows = [
            r for r in rows
            if _student_id_from_external_ref(r.get("student_external_ref", "")) in my_student_ids
        ]
    return rows


@router.put("/admin/courses/{course_id}/submissions/{submission_id}/grade")
async def admin_grade_submission(
    course_id: int,
    submission_id: int,
    payload: CodelabGradeIn,
    current_user: User = Depends(_access),
    db: Session = Depends(get_db),
):
    """RBAC-002: тренер может оценивать только посылки учеников своих групп.
    Раньше эндпоинт не принимал course_id вообще, и эту проверку сделать
    было нечем (мог оценить чужую посылку, если угадал её id) — теперь
    сверяем через список посылок курса, который и так фильтруется по группе."""
    if auth.resolve_effective_role(current_user) == UserRole.TRAINER:
        try:
            course_rows = await cl.list_course_submissions(current_user, course_id)
        except CodelabError as e:
            _raise(e)
            return
        target = next((r for r in course_rows if r.get("submission_id") == submission_id), None)
        if not target:
            raise HTTPException(status_code=404, detail="Посылка не найдена в этом курсе")
        my_student_ids = _trainer_student_ids(db, current_user.id)
        if _student_id_from_external_ref(target.get("student_external_ref", "")) not in my_student_ids:
            raise HTTPException(status_code=403, detail="Ученик не из ваших групп")

    try:
        result = await cl.grade_submission(current_user, course_id, submission_id, payload.score, payload.comment)
    except CodelabError as e:
        _raise(e)
        return
    log_action(db, current_user.id, "grade", "codelab_submission", submission_id, {"score": payload.score})
    return result


@router.post("/admin/courses/{course_id}/submissions/rerun")
async def admin_rerun_submissions(
    course_id: int,
    payload: dict,
    current_user: User = Depends(_manage),
    db: Session = Depends(get_db),
):
    """TASK-007: массовая перепроверка после исправления тестов — только
    методисту (codelab.manage), не тренеру: перезапуск проверки — авторское
    действие над задачей, не просмотр/оценка конкретного ученика."""
    try:
        result = await cl.rerun_submissions(current_user, course_id, payload.get("submission_ids", []))
    except CodelabError as e:
        _raise(e)
        return
    log_action(db, current_user.id, "rerun", "codelab_submissions", course_id, {"count": len(payload.get("submission_ids", []))})
    return result


@router.get("/admin/courses/{course_id}/analytics")
async def admin_get_course_analytics(course_id: int, current_user: User = Depends(_access)):
    """ANA-001/002/005: агрегаты курса и рейтинг задач по сложности."""
    try:
        return await cl.get_course_analytics(current_user, course_id)
    except CodelabError as e:
        _raise(e)
