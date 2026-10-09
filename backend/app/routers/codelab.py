import hashlib
import hmac
import logging

from fastapi import APIRouter, Depends, File as FastAPIFile, HTTPException, Request, Response, UploadFile, status
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import CourseCatalogItem, CourseCatalogItemKind, Group, GroupStudent, Student, StudentStatus, User, UserRole
from app.routers.action_log import log_action
from app.schemas.codelab import (
    CodelabCourseArchiveIn,
    CodelabCourseCreate,
    CodelabCourseUpdate,
    CodelabCourseWebhook,
    CodelabGradeIn,
    CodelabProjectCommentIn,
    CodelabProjectReviewIn,
    CodelabStudentProgress,
)
from app.services import codelab_client as cl
from app.services.codelab_client import CodelabError
from app.services.codelab_sso import CODELAB_EXTERNAL_BASE, fetch_student_codelab_progress
from app.services.communication_hub import CommunicationService
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
async def admin_list_courses(current_user: User = Depends(_access)):
    """Read-only course list for staff who can review learner submissions."""
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


@router.put("/admin/courses/{course_id}")
async def admin_update_course(
    course_id: int, payload: CodelabCourseUpdate,
    current_user: User = Depends(_manage), db: Session = Depends(get_db),
):
    try:
        course = await cl.update_course(current_user, course_id, payload.model_dump(exclude_unset=True))
    except CodelabError as e:
        _raise(e)
        return
    log_action(db, current_user.id, "update", "codelab_course", course_id, {})
    return course


@router.put("/admin/courses/{course_id}/archive")
async def admin_archive_course(
    course_id: int, payload: CodelabCourseArchiveIn,
    current_user: User = Depends(_manage), db: Session = Depends(get_db),
):
    try:
        course = await cl.archive_course(current_user, course_id, payload.archived)
    except CodelabError as e:
        _raise(e)
        return
    log_action(db, current_user.id, "archive" if payload.archived else "unarchive", "codelab_course", course_id, {})
    return course


@router.delete("/admin/courses/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_course(course_id: int, current_user: User = Depends(_manage), db: Session = Depends(get_db)):
    try:
        await cl.delete_course(current_user, course_id)
    except CodelabError as e:
        _raise(e)
        return
    log_action(db, current_user.id, "delete", "codelab_course", course_id, {})


@router.post("/admin/courses/{course_id}/tasks", status_code=status.HTTP_201_CREATED)
async def admin_create_task(course_id: int, payload: dict, current_user: User = Depends(_manage)):
    try:
        return await cl.create_task(current_user, course_id, payload)
    except CodelabError as e:
        _raise(e)


@router.get("/admin/tasks/{task_id}")
async def admin_get_task(task_id: int, current_user: User = Depends(_manage)):
    try:
        return await cl.get_task(current_user, task_id)
    except CodelabError as e:
        _raise(e)


@router.put("/admin/tasks/{task_id}")
async def admin_update_task(task_id: int, payload: dict, current_user: User = Depends(_manage)):
    try:
        return await cl.update_task(current_user, task_id, payload)
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


@router.put("/admin/items/{item_id}/archive")
async def admin_archive_item(item_id: int, payload: dict, current_user: User = Depends(_manage)):
    try:
        return await cl.archive_item(current_user, item_id, bool(payload.get("archived")))
    except CodelabError as e:
        _raise(e)


@router.post("/admin/uploads")
async def admin_upload_file(file: UploadFile = FastAPIFile(...), current_user: User = Depends(_manage)):
    """EDT-002/008: изображения из rich-text редактора (вставка через Ctrl+V,
    drag-drop или кнопку) — сохраняются в Codelab, не на портале, потому что
    учебный контент и так живёт там (см. codelab_client.upload_file).

    Codelab возвращает url относительным ("/uploads/xxx.png") — годится для
    его собственного фронтенда (студент видит материал на codelab.tirskix.space),
    но не для предпросмотра прямо здесь, в редакторе на портале: относительно
    ЭТОГО домена такого файла нет. Возвращаем абсолютный URL на Codelab."""
    data = await file.read()
    try:
        result = await cl.upload_file(current_user, file.filename or "upload", file.content_type or "", data)
    except CodelabError as e:
        _raise(e)
        return
    if isinstance(result, dict) and isinstance(result.get("url"), str) and result["url"].startswith("/"):
        result["url"] = f"{CODELAB_EXTERNAL_BASE}{result['url']}"
    return result


@router.get("/admin/courses/{course_id}/tree")
async def admin_get_course_tree(course_id: int, current_user: User = Depends(_access)):
    """Read-only tree used to choose projects in the submissions workspace."""
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


async def _get_and_authorize_project_row(
    current_user: User, db: Session, course_id: int, item_id: int, submission_id: int,
) -> dict:
    """RBAC-002 для проектов — по образцу admin_grade_submission: сверяем
    принадлежность сдачи группе тренера через ростер (в нём же и весь список
    файлов сдачи — используется ниже, чтобы не разрешить скачать/прокомментировать
    файл ЧУЖОЙ сдачи, даже если её id угадать, см. вызовы ниже)."""
    try:
        rows = await cl.list_project_submissions(current_user, course_id, item_id)
    except CodelabError as e:
        _raise(e)
        return {}
    target = next((r for r in rows if r.get("id") == submission_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Сдача не найдена в этом проекте")
    if auth.resolve_effective_role(current_user) == UserRole.TRAINER:
        my_student_ids = _trainer_student_ids(db, current_user.id)
        if _student_id_from_external_ref(target.get("student_external_ref", "")) not in my_student_ids:
            raise HTTPException(status_code=403, detail="Ученик не из ваших групп")
    return target


def _notify_student_revision_requested(db: Session, target: dict, comment: str, trainer: User) -> None:
    """Уведомляет ученика (точнее, родителя — так уже устроен
    CommunicationService._resolve_recipient для recipient_type="student"), что
    его работу отправили на доработку. `comment` — именно только что введённый
    комментарий тренера (payload.comment), а не старое значение из `target`,
    которое снято до применения текущего решения. Best-effort: ошибка отправки
    не должна ронять сам review-эндпоинт, поэтому не поднимаем исключение наружу."""
    student_id = _student_id_from_external_ref(target.get("student_external_ref", ""))
    if not student_id:
        return
    try:
        CommunicationService.send(
            db,
            channel="email",
            recipient_type="student",
            recipient_id=student_id,
            created_by=trainer.id,
            dedupe_key=f"codelab-revision:{target.get('id')}:{target.get('attempt_number')}",
            context={
                "subject": f"Доработка: {target.get('item_title') or 'проект'}",
                "message": (
                    f"Здравствуйте!\n\n"
                    f"Работа «{target.get('item_title') or ''}» отправлена на доработку "
                    f"тренером {trainer.full_name or trainer.email}.\n\n"
                    f"Комментарий: {comment}"
                ),
            },
        )
    except Exception:
        logger.exception("codelab: revision notification failed for submission %s", target.get("id"))


@router.get("/admin/courses/{course_id}/projects/{item_id}/submissions")
async def admin_list_project_submissions(
    course_id: int, item_id: int, current_user: User = Depends(_access), db: Session = Depends(get_db),
):
    """RBAC-002: методист/админ видят весь ростер проекта; тренер — только
    учеников своих групп (включая тех, кто ещё не начал сдавать — заводится
    пустой черновик на стороне Codelab, см. project_admin._ensure_roster_submissions,
    иначе некому было бы слать напоминание)."""
    try:
        rows = await cl.list_project_submissions(current_user, course_id, item_id)
    except CodelabError as e:
        _raise(e)
        return

    if auth.resolve_effective_role(current_user) == UserRole.TRAINER:
        my_student_ids = _trainer_student_ids(db, current_user.id)
        rows = [r for r in rows if _student_id_from_external_ref(r.get("student_external_ref", "")) in my_student_ids]
    return rows


@router.get("/admin/courses/{course_id}/projects/{item_id}/submissions/{submission_id}")
async def admin_get_project_submission(
    course_id: int, item_id: int, submission_id: int,
    current_user: User = Depends(_access), db: Session = Depends(get_db),
):
    await _get_and_authorize_project_row(current_user, db, course_id, item_id, submission_id)
    try:
        return await cl.get_project_submission(current_user, submission_id)
    except CodelabError as e:
        _raise(e)


@router.get("/admin/courses/{course_id}/projects/{item_id}/submissions/{submission_id}/files/{file_id}/download")
async def admin_download_project_file(
    course_id: int, item_id: int, submission_id: int, file_id: int,
    current_user: User = Depends(_access), db: Session = Depends(get_db),
):
    target = await _get_and_authorize_project_row(current_user, db, course_id, item_id, submission_id)
    if not any(f.get("id") == file_id for f in target.get("files", [])):
        raise HTTPException(status_code=404, detail="Файл не относится к этой сдаче")

    try:
        upstream = await cl.download_project_file(current_user, file_id)
    except CodelabError as e:
        _raise(e)
        return
    return Response(
        content=upstream.content,
        media_type=upstream.headers.get("content-type", "application/octet-stream"),
        headers={"Content-Disposition": upstream.headers.get("content-disposition", "attachment")},
    )


@router.post("/admin/courses/{course_id}/projects/{item_id}/submissions/{submission_id}/files/{file_id}/comments")
async def admin_comment_project_file(
    course_id: int, item_id: int, submission_id: int, file_id: int, payload: CodelabProjectCommentIn,
    current_user: User = Depends(_access), db: Session = Depends(get_db),
):
    target = await _get_and_authorize_project_row(current_user, db, course_id, item_id, submission_id)
    if not any(f.get("id") == file_id for f in target.get("files", [])):
        raise HTTPException(status_code=404, detail="Файл не относится к этой сдаче")

    try:
        result = await cl.comment_project_file(current_user, file_id, payload.body)
    except CodelabError as e:
        _raise(e)
        return
    log_action(db, current_user.id, "comment", "codelab_project_file", file_id, {})
    return result


@router.put("/admin/courses/{course_id}/projects/{item_id}/submissions/{submission_id}/review")
async def admin_review_project_submission(
    course_id: int, item_id: int, submission_id: int, payload: CodelabProjectReviewIn,
    current_user: User = Depends(_access), db: Session = Depends(get_db),
):
    """GRD-004-аналог: тренер (только своей группы) или методист/админ
    принимает работу или отправляет на доработку."""
    target = await _get_and_authorize_project_row(current_user, db, course_id, item_id, submission_id)
    try:
        result = await cl.review_project_submission(current_user, submission_id, payload.decision, payload.score, payload.comment)
    except CodelabError as e:
        _raise(e)
        return
    log_action(db, current_user.id, payload.decision, "codelab_project_submission", submission_id, {"score": payload.score})

    if payload.decision == "needs_revision":
        _notify_student_revision_requested(db, target, payload.comment, current_user)
    return result


@router.post("/admin/courses/{course_id}/projects/{item_id}/submissions/{submission_id}/remind")
async def admin_remind_project_submission(
    course_id: int, item_id: int, submission_id: int,
    current_user: User = Depends(_access), db: Session = Depends(get_db),
):
    await _get_and_authorize_project_row(current_user, db, course_id, item_id, submission_id)
    try:
        result = await cl.remind_project_submission(current_user, submission_id)
    except CodelabError as e:
        _raise(e)
        return
    log_action(db, current_user.id, "remind", "codelab_project_submission", submission_id, {})
    return result


# ─── Работы учеников: сквозной список по всем курсам (Trainer Cockpit) ─────

def _tree_roots(tree) -> list:
    if isinstance(tree, list):
        return tree
    if isinstance(tree, dict):
        if isinstance(tree.get("items"), list):
            return tree["items"]
        if isinstance(tree.get("tree"), list):
            return tree["tree"]
        if isinstance(tree.get("children"), list):
            return [tree]
    return []


def _walk_project_items(items: list) -> list:
    """Рекурсивно обходит дерево курса (module/submodule/topic/subtopic) и
    собирает элементы type="project" (проекты с ручной проверкой)."""
    found: list = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        if item.get("type") == "project":
            found.append(item)
        children = item.get("children")
        if children:
            found.extend(_walk_project_items(children))
    return found


@router.get("/trainer/pending-reviews")
async def list_pending_project_reviews(
    current_user: User = Depends(_access),
    db: Session = Depends(get_db),
):
    """Сквозной список сдач проектов (ручная проверка) по всем опубликованным
    курсам Codelab — для карточки «Работы учеников» в Trainer Cockpit и
    страницы /trainer/submissions. Ничего не хранит локально, это агрегация
    уже существующих эндпоинтов (list_courses/get_course_tree/
    list_project_submissions), которые сами достаточны для истории попыток и
    проверки (CodelabProjectSubmission.history/reviewed_at/review_comment) —
    поэтому отдельная локальная модель для этого не заводится.

    RBAC-002: тренер видит сдачи только учеников своих активных групп (как и
    в admin_list_submissions/admin_list_project_submissions); methodist/admin
    видят все. Статус "draft" (ученик ещё не начинал) не возвращается."""
    is_trainer = auth.resolve_effective_role(current_user) == UserRole.TRAINER
    my_student_ids = _trainer_student_ids(db, current_user.id) if is_trainer else set()

    try:
        courses = await cl.list_courses(current_user)
    except CodelabError as e:
        _raise(e)
        return

    results: list[dict] = []
    for course in courses:
        if course.get("status") != "published" or course.get("is_archived"):
            continue
        try:
            tree = await cl.get_course_tree(current_user, course["id"])
        except CodelabError:
            continue
        for item in _walk_project_items(_tree_roots(tree)):
            try:
                rows = await cl.list_project_submissions(current_user, course["id"], item.get("id"))
            except CodelabError:
                continue
            for row in rows:
                if row.get("status") == "draft":
                    continue
                if is_trainer:
                    sid = _student_id_from_external_ref(row.get("student_external_ref", ""))
                    if sid not in my_student_ids:
                        continue
                results.append({
                    **row,
                    "course_id": course.get("id"),
                    "course_title": course.get("title"),
                    "item_id": item.get("id"),
                    "item_title": item.get("title"),
                })

    results.sort(key=lambda r: r.get("submitted_at") or "", reverse=True)
    return results


@router.get("/admin/courses/{course_id}/analytics")
async def admin_get_course_analytics(course_id: int, current_user: User = Depends(_access)):
    """ANA-001/002/005: агрегаты курса и рейтинг задач по сложности."""
    try:
        return await cl.get_course_analytics(current_user, course_id)
    except CodelabError as e:
        _raise(e)


@router.get("/admin/status")
async def admin_get_system_status(current_user: User = Depends(_manage)):
    """ADM-004: очередь, признаки зависшего воркера, системные ошибки,
    хранилище. Не методисту (у него тоже есть codelab.manage) — только
    admin/owner, это эксплуатационная информация, не учебная."""
    effective_role = auth.resolve_effective_role(current_user)
    if effective_role not in (UserRole.ADMIN, UserRole.OWNER):
        raise HTTPException(status_code=403, detail="Доступно только администратору")
    try:
        return await cl.get_system_status(current_user)
    except CodelabError as e:
        _raise(e)


def _require_admin_or_owner(current_user: User) -> None:
    """IAM-004: как admin/status выше — не методисту с его codelab.manage,
    только admin/owner (эксплуатационное управление учётками, не учебное)."""
    effective_role = auth.resolve_effective_role(current_user)
    if effective_role not in (UserRole.ADMIN, UserRole.OWNER):
        raise HTTPException(status_code=403, detail="Доступно только администратору")


@router.get("/admin/users")
async def admin_list_codelab_users(q: str | None = None, current_user: User = Depends(_manage)):
    """IAM-004: поиск пользователей Codelab для блокировки/просмотра истории входов."""
    _require_admin_or_owner(current_user)
    try:
        return await cl.list_codelab_users(current_user, q)
    except CodelabError as e:
        _raise(e)


@router.put("/admin/users/{codelab_user_id}/block")
async def admin_set_codelab_user_blocked(
    codelab_user_id: int,
    payload: dict,
    current_user: User = Depends(_manage),
    db: Session = Depends(get_db),
):
    """IAM-004: блокировка/разблокировка учётной записи Codelab."""
    _require_admin_or_owner(current_user)
    try:
        result = await cl.set_codelab_user_blocked(current_user, codelab_user_id, bool(payload.get("blocked")))
    except CodelabError as e:
        _raise(e)
        return
    log_action(db, current_user.id, "block" if payload.get("blocked") else "unblock", "codelab_user", codelab_user_id, {})
    return result


@router.post("/admin/users/{codelab_user_id}/terminate-sessions")
async def admin_terminate_codelab_user_sessions(
    codelab_user_id: int,
    current_user: User = Depends(_manage),
    db: Session = Depends(get_db),
):
    """IAM-004: завершить все активные сессии пользователя Codelab."""
    _require_admin_or_owner(current_user)
    try:
        result = await cl.terminate_codelab_user_sessions(current_user, codelab_user_id)
    except CodelabError as e:
        _raise(e)
        return
    log_action(db, current_user.id, "terminate_sessions", "codelab_user", codelab_user_id, {})
    return result


@router.get("/admin/users/{codelab_user_id}/login-history")
async def admin_get_codelab_user_login_history(codelab_user_id: int, current_user: User = Depends(_manage)):
    """IAM-004: история входов пользователя Codelab."""
    _require_admin_or_owner(current_user)
    try:
        return await cl.get_codelab_user_login_history(current_user, codelab_user_id)
    except CodelabError as e:
        _raise(e)
