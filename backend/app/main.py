from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth, users, students, groups, programs, grades, characteristics, reports, search, telegram, settings, abonements, sales, tasks, b2b, owner_funnels, trainer_lessons
import os

app = FastAPI(
    title="Learning Portal API",
    description="API для портала управления обучением",
    version="1.0.0"
)

# Safety checks for production env
@app.on_event("startup")
def _validate_production_env() -> None:
    app_env = (os.getenv("APP_ENV") or "development").lower().strip()
    if app_env != "production":
        return

    secret = os.getenv("SECRET_KEY") or ""
    if (not secret) or secret == "your-secret-key-change-in-production" or len(secret) < 32:
        raise RuntimeError("APP_ENV=production: SECRET_KEY must be set and at least 32 characters long")

    db_url = os.getenv("DATABASE_URL") or ""
    if (not db_url) or ("user:password" in db_url) or ("YOUR_PASSWORD" in db_url):
        raise RuntimeError("APP_ENV=production: DATABASE_URL must be set (no placeholder credentials)")

    # Soft warning-like checks (do not block startup)
    cors_raw = os.getenv("CORS_ORIGINS") or ""
    if "localhost" in cors_raw or "127.0.0.1" in cors_raw:
        # Not raising: sometimes people proxy locally even in prod, but it's usually a misconfig.
        pass

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
app.include_router(trainer_lessons.router, prefix="/api", tags=["trainer_lessons"])


@app.get("/")
async def root():
    return {"message": "Learning Portal API"}


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}

