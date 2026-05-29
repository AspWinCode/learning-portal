import logging
import os
import traceback
from contextlib import asynccontextmanager
from datetime import date, timedelta
from typing import AsyncIterator, Optional

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.database import SessionLocal
from app.logging_config import configure_logging
from app.observability import configure_fastapi_observability, configure_sentry
from app.rate_limit import limiter
from app.routers import (
    abonements,
    admin_tools,
    auth,
    b2b,
    campaigns,
    characteristics,
    communications,
    finance,
    grades,
    groups,
    max_messenger,
    owner_calculations,
    owner_dashboard,
    owner_funnels,
    owner_workspace,
    parent_dashboard,
    personal_finance,
    programs,
    projects,
    reports,
    roles,
    sales,
    search,
    settings,
    sms,
    student_accounts,
    students,
    tasks,
    telegram,
    trainer_cockpit,
    trainer_lessons,
    users,
)

configure_logging()
configure_sentry()
logger = logging.getLogger(__name__)

# If production configuration validation fails during startup, keep serving 503s
# instead of crashing the whole process.
_startup_config_error: Optional[str] = None


def _env_enabled(name: str, default: str = "1") -> bool:
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes")


def _is_production() -> bool:
    return (os.getenv("APP_ENV") or "development").lower().strip() == "production"


def _build_error_detail(exc: Exception) -> str:
    if _is_production():
        return "Internal server error"
    return f"{type(exc).__name__}: {exc}"


def _run_tochka_auto_import() -> None:
    """Legacy in-process Tochka auto import for single-process environments."""
    try:
        from app.services.tochka_client import is_configured

        if not is_configured():
            return
        account_id = (os.getenv("TOCHKA_ACCOUNT_ID") or "").strip()
        if not account_id:
            return
        date_to = date.today()
        date_from = date_to - timedelta(days=14)
        db = SessionLocal()
        try:
            from app.routers.sales import do_tochka_import_and_apply

            do_tochka_import_and_apply(db, account_id, date_from, date_to, actor_user_id=None)
        finally:
            db.close()
    except Exception:
        logger.exception("In-process Tochka auto import failed")


def _build_legacy_scheduler() -> Optional[BackgroundScheduler]:
    # By default, background scheduling is moved to app.background_scheduler.
    # Keep this opt-in only for legacy single-process runs.
    if not _env_enabled("IN_PROCESS_SCHEDULER_ENABLED", "0"):
        return None

    def _run_payment_overdue_tasks() -> None:
        try:
            from app.services.payment_overdue_tasks import create_payment_overdue_tasks

            db = SessionLocal()
            try:
                create_payment_overdue_tasks(db)
            finally:
                db.close()
        except Exception:
            logger.exception("In-process payment overdue tasks failed")

    def _run_payment_reminder_notifications() -> None:
        try:
            from app.services.payment_reminder_notifications import enqueue_upcoming_payment_reminders

            db = SessionLocal()
            try:
                enqueue_upcoming_payment_reminders(db)
            finally:
                db.close()
        except Exception:
            logger.exception("In-process payment reminder notifications failed")

    def _run_parent_weekly_digests() -> None:
        try:
            from app.services.parent_weekly_digest import enqueue_parent_weekly_digests

            db = SessionLocal()
            try:
                enqueue_parent_weekly_digests(db)
            finally:
                db.close()
        except Exception:
            logger.exception("In-process parent weekly digests failed")

    def _run_student_class_autopromo() -> None:
        try:
            from app.services.student_class_autopromo import auto_promote_student_classes

            db = SessionLocal()
            try:
                auto_promote_student_classes(db)
            finally:
                db.close()
        except Exception:
            logger.exception("In-process student class autopromo failed")

    def _run_absence_link_tasks() -> None:
        try:
            from app.services.absence_link_tasks import create_morning_link_tasks

            db = SessionLocal()
            try:
                create_morning_link_tasks(db)
                db.commit()
            finally:
                db.close()
        except Exception:
            logger.exception("In-process absence link tasks failed")

    def _run_scheduled_messages() -> None:
        try:
            from app.services.scheduled_messages import dispatch_scheduled_messages

            db = SessionLocal()
            try:
                dispatch_scheduled_messages(db)
            finally:
                db.close()
        except Exception:
            logger.exception("In-process scheduled messages dispatch failed")

    def _run_communication_queue() -> None:
        try:
            from app.services.communication_hub import CommunicationService

            db = SessionLocal()
            try:
                CommunicationService.dispatch_pending(db, limit=100)
            finally:
                db.close()
        except Exception:
            logger.exception("In-process communication queue dispatch failed")

    def _run_owner_workspace_max_sync() -> None:
        try:
            flag = (os.getenv("OWNER_WORKSPACE_AUTO_SYNC_MAX") or "0").strip().lower()
            if flag not in ("1", "true", "yes"):
                return
            from app.services.owner_workspace_max_sync import sync_max_messages_into_owner_workspace

            db = SessionLocal()
            try:
                sync_max_messages_into_owner_workspace(db, limit=400)
            finally:
                db.close()
        except Exception:
            logger.exception("In-process owner workspace MAX sync failed")

    def _run_owner_workspace_notification_email_dispatch() -> None:
        try:
            if not _env_enabled("OWNER_WORKSPACE_EMAIL_DISPATCH_ENABLED", "1"):
                return
            from app.services.owner_workspace_notifications import (
                dispatch_pending_owner_workspace_notification_emails,
            )

            db = SessionLocal()
            try:
                dispatch_pending_owner_workspace_notification_emails(db, limit=100)
            finally:
                db.close()
        except Exception:
            logger.exception("In-process owner workspace email dispatch failed")

    def _run_owner_workspace_notification_web_push_dispatch() -> None:
        try:
            if not _env_enabled("OWNER_WORKSPACE_WEB_PUSH_DISPATCH_ENABLED", "1"):
                return
            from app.services.owner_workspace_notifications import (
                dispatch_pending_owner_workspace_notification_web_push,
            )

            db = SessionLocal()
            try:
                dispatch_pending_owner_workspace_notification_web_push(db, limit=100)
            finally:
                db.close()
        except Exception:
            logger.exception("In-process owner workspace web push dispatch failed")

    scheduler = BackgroundScheduler()
    scheduler.add_job(_run_tochka_auto_import, "interval", minutes=10, id="tochka_auto_import")
    scheduler.add_job(_run_payment_overdue_tasks, "interval", days=1, id="payment_overdue_tasks")
    scheduler.add_job(
        _run_payment_reminder_notifications,
        "cron",
        hour=9,
        minute=0,
        id="payment_reminder_notifications",
    )
    scheduler.add_job(_run_parent_weekly_digests, "interval", minutes=15, id="parent_weekly_digests")
    scheduler.add_job(_run_scheduled_messages, "interval", minutes=1, id="scheduled_messages")
    scheduler.add_job(_run_communication_queue, "interval", minutes=1, id="communication_queue")
    scheduler.add_job(_run_owner_workspace_max_sync, "interval", minutes=30, id="owner_workspace_max_sync")
    if _env_enabled("OWNER_WORKSPACE_DELIVERY_IN_APP", "1"):
        scheduler.add_job(
            _run_owner_workspace_notification_email_dispatch,
            "interval",
            minutes=1,
            id="owner_workspace_notification_email_dispatch",
        )
        scheduler.add_job(
            _run_owner_workspace_notification_web_push_dispatch,
            "interval",
            minutes=1,
            id="owner_workspace_notification_web_push_dispatch",
        )
    scheduler.add_job(
        _run_student_class_autopromo,
        "cron",
        month=9,
        day=1,
        hour=3,
        id="student_class_autopromo",
    )
    scheduler.add_job(
        _run_absence_link_tasks,
        "cron",
        hour=8,
        minute=0,
        id="absence_link_tasks",
    )
    return scheduler


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    global _startup_config_error

    _startup_config_error = None
    scheduler: Optional[BackgroundScheduler] = None

    app_env = (os.getenv("APP_ENV") or "development").lower().strip()
    if app_env == "production":
        db_url = os.getenv("DATABASE_URL") or ""
        if (not db_url) or ("user:password" in db_url) or ("YOUR_PASSWORD" in db_url):
            _startup_config_error = "APP_ENV=production: DATABASE_URL must be set (no placeholder credentials)"
            logger.error(_startup_config_error)
        else:
            cors_raw = os.getenv("CORS_ORIGINS") or ""
            if "localhost" in cors_raw or "127.0.0.1" in cors_raw:
                pass

    if _startup_config_error is None:
        scheduler = _build_legacy_scheduler()
        if scheduler is not None:
            scheduler.start()
            app.state.legacy_scheduler = scheduler

    try:
        yield
    finally:
        if scheduler is not None:
            scheduler.shutdown(wait=False)


app = FastAPI(
    title="Learning Portal API v1",
    description="Versioned API v1 for the Learning Portal.",
    version="v1",
    lifespan=lifespan,
)
configure_fastapi_observability(app)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# CORS origins from env (comma-separated). Defaults to local dev.
cors_origins_raw = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
cors_origins = [origin.strip() for origin in cors_origins_raw.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.middleware("http")
async def catch_all_exceptions_middleware(request: Request, call_next):
    """Catch unhandled exceptions and return stable 500/503 JSON responses."""
    if _startup_config_error:
        return JSONResponse(
            status_code=503,
            content={
                "detail": (
                    "Server misconfiguration. Check backend logs."
                    if _is_production()
                    else f"Server misconfiguration. Check backend logs. | {_startup_config_error}"
                )
            },
        )
    try:
        return await call_next(request)
    except HTTPException:
        raise
    except Exception as exc:
        tb = traceback.format_exc()
        logger.exception(
            "Unhandled request error",
            extra={"path": str(request.url.path), "method": request.method},
        )
        detail = _build_error_detail(exc)
        err_str = str(exc).lower()
        if "does not exist" in err_str and ("column" in err_str or "relation" in err_str):
            return JSONResponse(
                status_code=503,
                content={
                    "detail": "Database schema is outdated. Run: cd backend && alembic upgrade head",
                },
            )
        if not _is_production():
            detail += " | " + tb.replace("\n", " ")[:800]
        return JSONResponse(status_code=500, content={"detail": detail})


@app.middleware("http")
async def redirect_legacy_api_paths(request: Request, call_next):
    path = request.url.path
    if path == "/api" or (path.startswith("/api/") and not path.startswith("/api/v1/")):
        suffix = path[4:]
        redirect_path = f"/api/v1{suffix}" if suffix else "/api/v1"
        if request.url.query:
            redirect_path = f"{redirect_path}?{request.url.query}"
        return RedirectResponse(url=redirect_path, status_code=307)
    return await call_next(request)


app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/v1/users", tags=["users"])
app.include_router(roles.router, prefix="/api/v1/roles", tags=["roles"])
app.include_router(students.router, prefix="/api/v1/students", tags=["students"])
app.include_router(groups.router, prefix="/api/v1/groups", tags=["groups"])
app.include_router(programs.router, prefix="/api/v1/programs", tags=["programs"])
app.include_router(grades.router, prefix="/api/v1/grades", tags=["grades"])
app.include_router(characteristics.router, prefix="/api/v1/characteristics", tags=["characteristics"])
app.include_router(trainer_cockpit.router, prefix="/api/v1/trainer-cockpit", tags=["trainer-cockpit"])
app.include_router(parent_dashboard.router, prefix="/api/v1/parent-dashboard", tags=["parent-dashboard"])
app.include_router(owner_dashboard.router, prefix="/api/v1/owner-dashboard", tags=["owner-dashboard"])
app.include_router(reports.router, prefix="/api/v1/reports", tags=["reports"])
app.include_router(communications.router, prefix="/api/v1/communications", tags=["communications"])
app.include_router(search.router, prefix="/api/v1/search", tags=["search"])
app.include_router(telegram.router, prefix="/api/v1/telegram", tags=["telegram"])
app.include_router(settings.router, prefix="/api/v1/settings", tags=["settings"])
app.include_router(abonements.router, prefix="/api/v1/abonements", tags=["abonements"])
app.include_router(sales.router, prefix="/api/v1/sales", tags=["sales"])
app.include_router(tasks.router, prefix="/api/v1", tags=["tasks"])
app.include_router(b2b.router, prefix="/api/v1", tags=["b2b"])
app.include_router(campaigns.router, prefix="/api/v1", tags=["campaigns"])
app.include_router(owner_funnels.router, prefix="/api/v1", tags=["owner_funnels"])
app.include_router(owner_calculations.router, prefix="/api/v1", tags=["owner_calculations"])
app.include_router(trainer_lessons.router, prefix="/api/v1/trainer-lessons", tags=["trainer_lessons"])
app.include_router(student_accounts.router, prefix="/api/v1/student-accounts", tags=["student_accounts"])
app.include_router(projects.router, prefix="/api/v1/projects", tags=["projects"])
app.include_router(finance.router, prefix="/api/v1/finance", tags=["finance"])
app.include_router(personal_finance.router, prefix="/api/v1/personal-finance", tags=["personal_finance"])
app.include_router(admin_tools.router, prefix="/api/v1/admin-tools", tags=["admin_tools"])
app.include_router(sms.router, prefix="/api/v1", tags=["sms"])
app.include_router(max_messenger.router, prefix="/api/v1", tags=["max"])
app.include_router(owner_workspace.router, prefix="/api/v1/owner-workspace", tags=["owner_workspace"])


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Return JSON for unhandled errors; HTTPException is re-raised."""
    if isinstance(exc, HTTPException):
        raise exc
    tb = traceback.format_exc()
    logger.exception(
        "Unhandled exception",
        extra={"path": str(request.url.path), "method": request.method},
    )
    detail = _build_error_detail(exc)
    err_str = str(exc).lower()
    if "does not exist" in err_str and ("column" in err_str or "relation" in err_str):
        return JSONResponse(
            status_code=503,
            content={
                "detail": "Database schema is outdated. Run migrations: cd backend && alembic upgrade head",
            },
        )
    if not _is_production():
        detail += " | " + tb.replace("\n", " ")[:800]
    return JSONResponse(status_code=500, content={"detail": detail})


@app.get("/")
async def root():
    return {"message": "Learning Portal API"}


@app.get("/api/v1/health")
async def health_check():
    return {"status": "ok"}
