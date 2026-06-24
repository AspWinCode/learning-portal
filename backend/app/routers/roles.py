from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import Role, User, UserRole
from app.permissions import PERMISSION_CATALOG
from app.routers.action_log import log_action
from app.schemas.roles import RoleCreate, RoleResponse, RoleUpdate

router = APIRouter()


ELEVATED_BASE_ROLES = {UserRole.ADMIN, UserRole.OWNER}


def _ensure_owner_for_elevated_base_role(current_user: User, base_role: UserRole | None) -> None:
    if base_role in ELEVATED_BASE_ROLES and auth.resolve_effective_role(current_user) != UserRole.OWNER:
        raise HTTPException(status_code=403, detail="Only owner can create or edit admin/owner roles")

PERMISSION_DISPLAY_OVERRIDES: Dict[str, Dict[str, str]] = {
    "persons.access": {
        "label": "Просмотр реестра персон",
        "description": "Доступ к реестру персон, проверке дублей по телефону и связанным карточкам.",
    },
    "persons.manage": {
        "label": "Управление реестром персон",
        "description": "Объединение персон и привязка пользователей, лидов и карточек учеников.",
    },
    "trainer_cockpit.access": {
        "label": "Просмотр кабинета преподавателя",
        "description": "Доступ к сводке кабинета преподавателя и быстрым действиям.",
    },
    "parent_dashboard.access": {
        "label": "Просмотр кабинета родителя",
        "description": "Доступ к кабинету родителя, недельной сводке, вопросам и пуш-уведомлениям.",
    },
    "passwords.access": {
        "label": "Просмотр паролей",
        "description": "Доступ к защищенному хранилищу паролей.",
    },
    "passwords.manage": {
        "label": "Управление паролями",
        "description": "Создание, редактирование и удаление записей в хранилище паролей.",
    },
    "passwords.reveal": {
        "label": "Просмотр секретов паролей",
        "description": "Право раскрывать расшифрованные секреты из хранилища паролей.",
    },
    "communications.access": {
        "label": "Просмотр коммуникаций",
        "description": "Доступ к шаблонам коммуникаций и истории очереди отправки.",
    },
    "communications.manage": {
        "label": "Управление коммуникациями",
        "description": "Создание и редактирование шаблонов коммуникаций.",
    },
    "telegram.link": {
        "label": "Привязка Telegram",
        "description": "Право привязывать и отвязывать Telegram в профиле текущего пользователя.",
    },
    "admin_tools.manage": {
        "label": "Управление административными инструментами",
        "description": "Запуск служебных административных инструментов, например сброса пароля преподавателя.",
    },
    "owner_funnels.access": {
        "label": "Просмотр воронок владельца",
        "description": "Доступ к воронкам владельца, событиям и карточкам воронок.",
    },
    "owner_funnels.manage": {
        "label": "Управление воронками владельца",
        "description": "Создание, изменение и удаление элементов и событий воронок владельца.",
    },
    "owner_calculations.access": {
        "label": "Просмотр расчетов владельца",
        "description": "Доступ к модулю расчетов владельца по преподавателям.",
    },
    "owner_calculations.manage": {
        "label": "Управление расчетами владельца",
        "description": "Изменение ставок, премий и выплат в модуле расчетов владельца.",
    },
    "owner_dashboard.access": {
        "label": "Просмотр дашборда владельца",
        "description": "Доступ к метрическому дашборду владельца.",
    },
    "campaigns.access": {
        "label": "Просмотр кампаний",
        "description": "Доступ к кампаниям, школам кампаний, джемам и матрице школ.",
    },
    "campaigns.manage": {
        "label": "Управление кампаниями",
        "description": "Создание и изменение кампаний, джемов, школ и связанных действий по матрице.",
    },
    "sales.access": {
        "label": "Доступ к модулю продаж",
        "description": "Маршруты и экраны продаж: лиды, события, инструкции, долги и связанные операции.",
    },
    "finance.access": {
        "label": "Доступ к финансовому модулю",
        "description": "Финансовый журнал и финансовые представления.",
    },
    "owner_workspace.access": {
        "label": "Доступ к рабочему пространству владельца",
        "description": "Вход в рабочее пространство владельца и его базовые разделы.",
    },
    "projects.access": {
        "label": "Просмотр проектов",
        "description": "Доступ к проектам и канбан-доскам.",
    },
    "settings.manage": {
        "label": "Управление настройками",
        "description": "Изменение централизованных настроек, справочников и конфигурации рабочего пространства владельца.",
    },
}


def _repair_mojibake(value: str) -> str:
    try:
        repaired = value.encode("latin1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        try:
            repaired = value.encode("cp1251").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            return value
    return repaired if repaired.count("Р") + repaired.count("С") < value.count("Р") + value.count("С") else value


def _normalized_permission_catalog() -> List[Dict[str, Any]]:
    result: List[Dict[str, Any]] = []
    for item in PERMISSION_CATALOG:
        normalized: Dict[str, Any] = {}
        for key, value in item.items():
            normalized[key] = _repair_mojibake(value) if isinstance(value, str) else value
        normalized.update(PERMISSION_DISPLAY_OVERRIDES.get(str(item.get("key")), {}))
        result.append(normalized)
    return result


def _get_role_or_404(db: Session, role_id: int) -> Role:
    role = db.query(Role).filter(Role.id == role_id).first()
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")
    return role


@router.get("/", response_model=List[RoleResponse])
async def list_roles(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("roles.access")),
):
    return db.query(Role).order_by(Role.is_system.desc(), Role.name.asc()).all()


@router.get("/permissions-catalog")
async def get_permissions_catalog(
    current_user: User = Depends(auth.require_permission("roles.access")),
):
    return {"items": _normalized_permission_catalog()}


@router.post("/", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
async def create_role(
    payload: RoleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("roles.manage")),
):
    _ensure_owner_for_elevated_base_role(current_user, payload.base_role)
    exists = db.query(Role).filter(Role.key == payload.key).first()
    if exists:
        raise HTTPException(status_code=400, detail="Role key already exists")

    role = Role(
        key=payload.key,
        name=payload.name,
        description=payload.description,
        base_role=payload.base_role,
        permissions=payload.permissions,
        is_system=False,
        is_active=True,
    )
    db.add(role)
    db.commit()
    db.refresh(role)
    log_action(db, current_user.id, "create", "role", role.id, payload.model_dump())
    return role


@router.get("/{role_id}", response_model=RoleResponse)
async def read_role(
    role_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("roles.access")),
):
    return _get_role_or_404(db, role_id)


@router.put("/{role_id}", response_model=RoleResponse)
async def update_role(
    role_id: int,
    payload: RoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("roles.manage")),
):
    role = _get_role_or_404(db, role_id)
    if role.is_system:
        raise HTTPException(status_code=400, detail="System roles cannot be edited")

    update_data = payload.model_dump(exclude_unset=True)
    if "base_role" in update_data:
        _ensure_owner_for_elevated_base_role(current_user, update_data["base_role"])
    for field, value in update_data.items():
        setattr(role, field, value)
    db.commit()
    db.refresh(role)
    log_action(db, current_user.id, "update", "role", role.id, update_data)
    return role


@router.delete("/{role_id}")
async def archive_role(
    role_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("roles.manage")),
):
    role = _get_role_or_404(db, role_id)
    if role.is_system:
        raise HTTPException(status_code=400, detail="System roles cannot be archived")
    if db.query(User).filter(User.custom_role_id == role.id, User.is_active == True).count() > 0:  # noqa: E712
        raise HTTPException(status_code=400, detail="Role is assigned to active users")

    role.is_active = False
    db.commit()
    log_action(db, current_user.id, "archive", "role", role.id)
    return {"message": "Role archived"}
