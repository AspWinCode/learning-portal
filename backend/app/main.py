import traceback
from datetime import date, timedelta
import os
from typing import Optional
from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.database import SessionLocal
from app.routers import auth, users, students, groups, programs, grades, characteristics, reports, search, telegram, settings, communications, trainer_cockpit, parent_dashboard, owner_dashboard, abonements, sales, tasks, b2b, campaigns, owner_funnels, owner_calculations, trainer_lessons, student_accounts, projects, finance, personal_finance, admin_tools, sms, max_messenger, owner_workspace, roles

app = FastAPI(
    title="Learning Portal API",
    description="API для портала управления обучением",
    version="1.0.0"
)

# Если при старте не прошла проверка production (SECRET_KEY/DATABASE_URL), не падаем с 502, а отдаём 503 на запросах
_startup_config_error: Optional[str] = None


def _env_enabled(name: str, default: str = "1") -> bool:
    return (os.getenv(name, default).strip().lower() in ("1", "true", "yes"))

def _run_tochka_auto_import() -> None:
    """Периодическая задача: импорт выписки Точка Банк, матч по телефону (и ФИО как fallback), за последние 14 дней. Каждые 10 мин."""
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
        # Логируем, но не падаем — следующий запуск повторит
        traceback.print_exc()


@app.on_event("startup")
def _run_migrations_on_startup() -> None:
    """При старте приложения применить миграции (чтобы не было 502 из-за отсутствующих колонок)."""
    run_migrate = _env_enabled("RUN_MIGRATIONS_ON_STARTUP", "1")
    if not run_migrate:
        return
    try:
        from alembic import command
        from alembic.config import Config
        _root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        _ini = os.path.join(_root, "alembic.ini")
        alembic_cfg = Config(_ini)
        alembic_cfg.set_main_option("script_location", os.path.join(_root, "alembic"))
        command.upgrade(alembic_cfg, "head")
    except Exception as e:
        traceback.print_exc()
        print(f"[startup] Migrations on startup skipped or failed: {e}")


# Safety checks for production env (не падаем с 502, а выставляем флаг и отдаём 503 на запросах)
@app.on_event("startup")
def _validate_production_env() -> None:
    global _startup_config_error
    app_env = (os.getenv("APP_ENV") or "development").lower().strip()
    if app_env != "production":
        pass  # continue to scheduler
    else:
        secret = os.getenv("SECRET_KEY") or ""
        if (not secret) or secret == "your-secret-key-change-in-production" or len(secret) < 32:
            _startup_config_error = "APP_ENV=production: SECRET_KEY must be set and at least 32 characters long"
            print(f"[startup] {_startup_config_error}")
            return
        db_url = os.getenv("DATABASE_URL") or ""
        if (not db_url) or ("user:password" in db_url) or ("YOUR_PASSWORD" in db_url):
            _startup_config_error = "APP_ENV=production: DATABASE_URL must be set (no placeholder credentials)"
            print(f"[startup] {_startup_config_error}")
            return
        cors_raw = os.getenv("CORS_ORIGINS") or ""
        if "localhost" in cors_raw or "127.0.0.1" in cors_raw:
            pass

    # By default, background scheduling is moved to app.background_scheduler.
    # Keep this opt-in only for legacy single-process runs.
    if not _env_enabled("IN_PROCESS_SCHEDULER_ENABLED", "0"):
        return

    def _run_payment_overdue_tasks() -> None:
        """Просрочка оплаты: задачи менеджеру через 3 дня после next_payment_date, повтор раз в 7 дней (ТЗ п.8.3)."""
        try:
            from app.services.payment_overdue_tasks import create_payment_overdue_tasks
            db = SessionLocal()
            try:
                create_payment_overdue_tasks(db)
            finally:
                db.close()
        except Exception:
            traceback.print_exc()

    def _run_payment_reminder_notifications() -> None:
        """Ежедневно: поставить родительские напоминания об оплате за 3 дня до даты next_payment_date."""
        try:
            from app.services.payment_reminder_notifications import enqueue_upcoming_payment_reminders

            db = SessionLocal()
            try:
                enqueue_upcoming_payment_reminders(db)
            finally:
                db.close()
        except Exception:
            traceback.print_exc()

    def _run_parent_weekly_digests() -> None:
        """Проверить, пора ли отправить weekly digest родителям."""
        try:
            from app.services.parent_weekly_digest import enqueue_parent_weekly_digests

            db = SessionLocal()
            try:
                enqueue_parent_weekly_digests(db)
            finally:
                db.close()
        except Exception:
            traceback.print_exc()

    def _run_student_class_autopromo() -> None:
        """Ежегодное автоповышение класса учеников (1 сентября, только активные)."""
        try:
            from app.services.student_class_autopromo import auto_promote_student_classes

            db = SessionLocal()
            try:
                auto_promote_student_classes(db)
            finally:
                db.close()
        except Exception:
            traceback.print_exc()

    def _run_absence_link_tasks() -> None:
        """Утренние задачи: отправить ссылки на отработки."""
        try:
            from app.services.absence_link_tasks import create_morning_link_tasks

            db = SessionLocal()
            try:
                create_morning_link_tasks(db)
                db.commit()
            finally:
                db.close()
        except Exception:
            traceback.print_exc()

    def _run_scheduled_messages() -> None:
        """Каждую минуту: отправить SMS и MAX-сообщения, у которых scheduled_at <= now."""
        try:
            from app.services.scheduled_messages import dispatch_scheduled_messages
            db = SessionLocal()
            try:
                dispatch_scheduled_messages(db)
            finally:
                db.close()
        except Exception:
            traceback.print_exc()

    def _run_communication_queue() -> None:
        """Каждую минуту: обработать pending записи Communication Hub."""
        try:
            from app.services.communication_hub import CommunicationService

            db = SessionLocal()
            try:
                CommunicationService.dispatch_pending(db, limit=100)
            finally:
                db.close()
        except Exception:
            traceback.print_exc()

    def _run_owner_workspace_max_sync() -> None:
        """Импорт max_messages → owner_workspace_messages по телефону. Включить: OWNER_WORKSPACE_AUTO_SYNC_MAX=1."""
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
            traceback.print_exc()

    def _run_owner_workspace_notification_email_dispatch() -> None:
        """Dispatch queued owner workspace notification emails."""
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
            traceback.print_exc()

    def _run_owner_workspace_notification_web_push_dispatch() -> None:
        """Dispatch queued owner workspace web push notifications."""
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
            traceback.print_exc()

    scheduler = BackgroundScheduler()
    scheduler.add_job(_run_tochka_auto_import, "interval", minutes=10, id="tochka_auto_import")
    scheduler.add_job(_run_payment_overdue_tasks, "interval", days=1, id="payment_overdue_tasks")
    scheduler.add_job(_run_payment_reminder_notifications, "cron", hour=9, minute=0, id="payment_reminder_notifications")
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
    # Автоповышение класса учеников 1 сентября (cron-задача раз в год).
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
    scheduler.start()

# CORS origins from env (comma-separated). Defaults to local dev.
cors_origins_raw = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
cors_origins = [o.strip() for o in cors_origins_raw.split(",") if o.strip()]

# CORS настройки (должно быть ПЕРЕД роутерами)
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
    """Ловим любые исключения, чтобы не падать с 502, а отдавать 500/503."""
    if _startup_config_error:
        return JSONResponse(
            status_code=503,
            content={"detail": "Server misconfiguration. Check backend logs.", "error": _startup_config_error},
        )
    try:
        return await call_next(request)
    except HTTPException:
        raise
    except Exception as exc:
        # ВРЕМЕННО: всегда логируем полный traceback, чтобы увидеть причину 502/500
        tb = traceback.format_exc()
        print(tb)
        detail = f"{type(exc).__name__}: {str(exc)}"
        err_str = str(exc).lower()
        if "does not exist" in err_str and ("column" in err_str or "relation" in err_str):
            return JSONResponse(
                status_code=503,
                content={
                    "detail": "Database schema is outdated. Run: cd backend && alembic upgrade head",
                    "error": detail[:500],
                    "trace": tb.replace("\n", " ")[:800],
                },
            )
        # ВРЕМЕННО: даже в production добавляем traceback в ответ, чтобы отладить 502
        detail += " | " + tb.replace("\n", " ")[:800]
        return JSONResponse(status_code=500, content={"detail": detail})

# Подключение роутеров
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(roles.router, prefix="/api/roles", tags=["roles"])
app.include_router(students.router, prefix="/api/students", tags=["students"])
app.include_router(groups.router, prefix="/api/groups", tags=["groups"])
app.include_router(programs.router, prefix="/api/programs", tags=["programs"])
app.include_router(grades.router, prefix="/api/grades", tags=["grades"])
app.include_router(characteristics.router, prefix="/api/characteristics", tags=["characteristics"])
app.include_router(trainer_cockpit.router, prefix="/api/trainer-cockpit", tags=["trainer-cockpit"])
app.include_router(parent_dashboard.router, prefix="/api/parent-dashboard", tags=["parent-dashboard"])
app.include_router(owner_dashboard.router, prefix="/api/owner-dashboard", tags=["owner-dashboard"])
app.include_router(reports.router, prefix="/api/reports", tags=["reports"])
app.include_router(communications.router, prefix="/api/communications", tags=["communications"])
app.include_router(search.router, prefix="/api/search", tags=["search"])
app.include_router(telegram.router, prefix="/api/telegram", tags=["telegram"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(abonements.router, prefix="/api/abonements", tags=["abonements"])
app.include_router(sales.router, prefix="/api/sales", tags=["sales"])
app.include_router(tasks.router, prefix="/api", tags=["tasks"])
app.include_router(b2b.router, prefix="/api", tags=["b2b"])
app.include_router(campaigns.router, prefix="/api", tags=["campaigns"])
app.include_router(owner_funnels.router, prefix="/api", tags=["owner_funnels"])
app.include_router(owner_calculations.router, prefix="/api", tags=["owner_calculations"])
app.include_router(trainer_lessons.router, prefix="/api/trainer-lessons", tags=["trainer_lessons"])
app.include_router(student_accounts.router, prefix="/api/student-accounts", tags=["student_accounts"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(finance.router, prefix="/api/finance", tags=["finance"])
app.include_router(personal_finance.router, prefix="/api/personal-finance", tags=["personal_finance"])
app.include_router(admin_tools.router, prefix="/api/admin-tools", tags=["admin_tools"])
app.include_router(sms.router, prefix="/api", tags=["sms"])
app.include_router(max_messenger.router, prefix="/api", tags=["max"])
app.include_router(owner_workspace.router, prefix="/api/owner-workspace", tags=["owner_workspace"])


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """При необработанной ошибке возвращаем JSON с detail (HTTPException пропускаем)."""
    if isinstance(exc, HTTPException):
        raise exc
    tb = traceback.format_exc()
    # ВРЕМЕННО: логируем traceback всегда
    print(tb)
    detail = f"{type(exc).__name__}: {str(exc)}"
    err_str = str(exc).lower()
    if ("does not exist" in err_str and ("column" in err_str or "relation" in err_str)):
        return JSONResponse(
            status_code=503,
            content={
                "detail": "Database schema is outdated. Run migrations: cd backend && alembic upgrade head",
                "error": detail[:500],
                "trace": tb.replace("\n", " ")[:800],
            },
        )
    # ВРЕМЕННО: добавляем traceback в detail даже в production
    detail += " | " + tb.replace("\n", " ")[:800]
    return JSONResponse(status_code=500, content={"detail": detail})


@app.get("/")
async def root():
    return {"message": "Learning Portal API"}


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}


