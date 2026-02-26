import traceback
from datetime import date, timedelta
import os
from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.database import SessionLocal
from app.routers import auth, users, students, groups, programs, grades, characteristics, reports, search, telegram, settings, abonements, sales, tasks, b2b, owner_funnels, trainer_lessons, student_accounts, projects

app = FastAPI(
    title="Learning Portal API",
    description="API для портала управления обучением",
    version="1.0.0"
)

# Если при старте не прошла проверка production (SECRET_KEY/DATABASE_URL), не падаем с 502, а отдаём 503 на запросах
_startup_config_error: str | None = None

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
    run_migrate = os.getenv("RUN_MIGRATIONS_ON_STARTUP", "1").strip().lower() in ("1", "true", "yes")
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

    scheduler = BackgroundScheduler()
    scheduler.add_job(_run_tochka_auto_import, "interval", minutes=10, id="tochka_auto_import")
    scheduler.add_job(_run_payment_overdue_tasks, "interval", days=1, id="payment_overdue_tasks")
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
        tb = traceback.format_exc()
        detail = f"{type(exc).__name__}: {str(exc)}"
        err_str = str(exc).lower()
        if "does not exist" in err_str and ("column" in err_str or "relation" in err_str):
            return JSONResponse(
                status_code=503,
                content={
                    "detail": "Database schema is outdated. Run: cd backend && alembic upgrade head",
                    "error": detail[:500],
                },
            )
        if os.getenv("APP_ENV", "").lower() != "production":
            detail += " | " + tb.replace("\n", " ")[:500]
        return JSONResponse(status_code=500, content={"detail": detail})

# Подключение роутеров
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(students.router, prefix="/api/students", tags=["students"])
app.include_router(groups.router, prefix="/api/groups", tags=["groups"])
app.include_router(programs.router, prefix="/api/programs", tags=["programs"])
app.include_router(grades.router, prefix="/api/grades", tags=["grades"])
app.include_router(characteristics.router, prefix="/api/characteristics", tags=["characteristics"])
app.include_router(reports.router, prefix="/api/reports", tags=["reports"])
app.include_router(search.router, prefix="/api/search", tags=["search"])
app.include_router(telegram.router, prefix="/api/telegram", tags=["telegram"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(abonements.router, prefix="/api/abonements", tags=["abonements"])
app.include_router(sales.router, prefix="/api/sales", tags=["sales"])
app.include_router(tasks.router, prefix="/api", tags=["tasks"])
app.include_router(b2b.router, prefix="/api", tags=["b2b"])
app.include_router(owner_funnels.router, prefix="/api", tags=["owner_funnels"])
app.include_router(trainer_lessons.router, prefix="/api/trainer-lessons", tags=["trainer_lessons"])
app.include_router(student_accounts.router, prefix="/api/student-accounts", tags=["student_accounts"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """При необработанной ошибке возвращаем JSON с detail (HTTPException пропускаем)."""
    if isinstance(exc, HTTPException):
        raise exc
    tb = traceback.format_exc()
    detail = f"{type(exc).__name__}: {str(exc)}"
    err_str = str(exc).lower()
    if ("does not exist" in err_str and ("column" in err_str or "relation" in err_str)):
        return JSONResponse(
            status_code=503,
            content={
                "detail": "Database schema is outdated. Run migrations: cd backend && alembic upgrade head",
                "error": detail[:500],
            },
        )
    if os.getenv("APP_ENV", "").lower() != "production":
        detail += " | " + tb.replace("\n", " ")[:800]
    return JSONResponse(status_code=500, content={"detail": detail})


@app.get("/")
async def root():
    return {"message": "Learning Portal API"}


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}

