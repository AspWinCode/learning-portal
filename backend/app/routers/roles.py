from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import Role, User
from app.permissions import PERMISSION_CATALOG
from app.routers.action_log import log_action
from app.schemas import RoleCreate, RoleResponse, RoleUpdate

router = APIRouter()


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
    return {"items": PERMISSION_CATALOG}


@router.post("/", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
async def create_role(
    payload: RoleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("roles.manage")),
):
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
