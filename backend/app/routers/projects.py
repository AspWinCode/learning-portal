"""Проекты: канбан-воронки для admin/owner/sales. Родители или ученики по этапам."""
from datetime import date
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app import auth
from app.models import User, UserRole, Project, ProjectStage, ProjectCard, Student, StudentStatus
from app.schemas import (
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    ProjectStageResponse,
    ProjectStageCreate,
    ProjectCardResponse,
    ProjectCardMove,
)

router = APIRouter()


def _require_projects_access(user: User) -> None:
    if user.role not in (UserRole.ADMIN, UserRole.OWNER, UserRole.SALES):
        raise HTTPException(status_code=403, detail="Доступ только для admin, owner или sales")


def _require_can_create_project(user: User) -> None:
    if user.role not in (UserRole.ADMIN, UserRole.OWNER):
        raise HTTPException(status_code=403, detail="Создавать проекты могут только admin или owner")


@router.get("/", response_model=List[ProjectResponse])
async def list_projects(
    archived: bool | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Список проектов. Доступ: admin, owner, sales."""
    _require_projects_access(current_user)
    q = db.query(Project)
    if archived is not None:
        q = q.filter(Project.archived == archived)
    projects = q.order_by(Project.created_at.desc()).all()
    out = []
    for p in projects:
        data = ProjectResponse.model_validate(p).model_dump(exclude={"stages", "card_count"})
        data["card_count"] = db.query(ProjectCard).filter(ProjectCard.project_id == p.id).count()
        data["stages"] = [ProjectStageResponse.model_validate(s) for s in p.stages]
        out.append(ProjectResponse(**data))
    return out


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    body: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Создать проект. Только admin/owner. Создаётся этап «Новые» и в него добавляются все родители или все ученики."""
    _require_can_create_project(current_user)
    project = Project(
        name=body.name,
        start_date=body.start_date,
        end_date=body.end_date,
        description=body.description,
        entity_type=body.entity_type,
        created_by_id=current_user.id,
        archived=False,
    )
    db.add(project)
    db.flush()
    first_stage = ProjectStage(project_id=project.id, name="Новые", position=0)
    db.add(first_stage)
    db.flush()
    if body.entity_type == "parent":
        parents = db.query(User).filter(User.role == UserRole.PARENT, User.is_active == True).all()
        for pos, u in enumerate(parents):
            db.add(
                ProjectCard(
                    project_id=project.id,
                    stage_id=first_stage.id,
                    entity_type="parent",
                    entity_id=u.id,
                    position=pos,
                )
            )
    else:
        students = db.query(Student).filter(Student.status == StudentStatus.ACTIVE).all()
        for pos, s in enumerate(students):
            db.add(
                ProjectCard(
                    project_id=project.id,
                    stage_id=first_stage.id,
                    entity_type="student",
                    entity_id=s.id,
                    position=pos,
                )
            )
    db.commit()
    db.refresh(project)
    data = ProjectResponse.model_validate(project).model_dump(exclude={"stages", "card_count"})
    data["stages"] = [ProjectStageResponse.model_validate(s) for s in project.stages]
    data["card_count"] = db.query(ProjectCard).filter(ProjectCard.project_id == project.id).count()
    return ProjectResponse(**data)


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Проект по ID с этапами и счётчиком карточек."""
    _require_projects_access(current_user)
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    data = ProjectResponse.model_validate(project).model_dump(exclude={"stages", "card_count"})
    data["stages"] = [ProjectStageResponse.model_validate(s) for s in project.stages]
    data["card_count"] = db.query(ProjectCard).filter(ProjectCard.project_id == project.id).count()
    return ProjectResponse(**data)


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    body: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Обновить проект (название, даты, описание, архив)."""
    _require_projects_access(current_user)
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(project, k, v)
    db.commit()
    db.refresh(project)
    data = ProjectResponse.model_validate(project).model_dump(exclude={"stages", "card_count"})
    data["stages"] = [ProjectStageResponse.model_validate(s) for s in project.stages]
    data["card_count"] = db.query(ProjectCard).filter(ProjectCard.project_id == project.id).count()
    return ProjectResponse(**data)


@router.post("/{project_id}/stages", response_model=ProjectStageResponse, status_code=status.HTTP_201_CREATED)
async def create_stage(
    project_id: int,
    body: ProjectStageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Добавить этап в проект."""
    _require_projects_access(current_user)
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    max_pos = db.query(func.max(ProjectStage.position)).filter(
        ProjectStage.project_id == project_id
    ).scalar() or 0
    stage = ProjectStage(
        project_id=project_id,
        name=body.name,
        position=(body.position if body.position is not None else max_pos + 1),
    )
    db.add(stage)
    db.commit()
    db.refresh(stage)
    return ProjectStageResponse.model_validate(stage)


@router.patch("/{project_id}/stages/{stage_id}")
async def update_stage(
    project_id: int,
    stage_id: int,
    body: ProjectStageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Переименовать этап или изменить порядок."""
    _require_projects_access(current_user)
    stage = db.query(ProjectStage).filter(
        ProjectStage.id == stage_id,
        ProjectStage.project_id == project_id,
    ).first()
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    if body.name is not None:
        stage.name = body.name
    if body.position is not None:
        stage.position = body.position
    db.commit()
    db.refresh(stage)
    return ProjectStageResponse.model_validate(stage)


@router.delete("/{project_id}/stages/{stage_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_stage(
    project_id: int,
    stage_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Удалить этап. Карточки из этого этапа нужно предварительно переместить."""
    _require_projects_access(current_user)
    stage = db.query(ProjectStage).filter(
        ProjectStage.id == stage_id,
        ProjectStage.project_id == project_id,
    ).first()
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    if stage.cards:
        raise HTTPException(
            status_code=400,
            detail="Переместите карточки в другие этапы перед удалением",
        )
    db.delete(stage)
    db.commit()


@router.get("/{project_id}/board")
async def get_project_board(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Канбан: этапы с карточками и display_name для каждой карточки."""
    _require_projects_access(current_user)
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    stages_out = []
    for s in sorted(project.stages, key=lambda x: x.position):
        cards = db.query(ProjectCard).filter(ProjectCard.stage_id == s.id).order_by(ProjectCard.position).all()
        cards_out = []
        for c in cards:
            name = None
            if c.entity_type == "parent":
                u = db.query(User).filter(User.id == c.entity_id).first()
                name = u.full_name if u else f"User #{c.entity_id}"
            else:
                st = db.query(Student).filter(Student.id == c.entity_id).first()
                name = st.full_name if st else f"Student #{c.entity_id}"
            cards_out.append(
                ProjectCardResponse(
                    **ProjectCardResponse.model_validate(c).model_dump(),
                    display_name=name,
                )
            )
        stages_out.append(
            {
                **ProjectStageResponse.model_validate(s).model_dump(),
                "cards": cards_out,
            }
        )
    return {
        "project": ProjectResponse.model_validate(project),
        "stages": stages_out,
    }


@router.patch("/{project_id}/cards/{card_id}/move")
async def move_card(
    project_id: int,
    card_id: int,
    body: ProjectCardMove,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Переместить карточку в другой этап (и опционально позицию)."""
    _require_projects_access(current_user)
    card = db.query(ProjectCard).filter(
        ProjectCard.id == card_id,
        ProjectCard.project_id == project_id,
    ).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    stage = db.query(ProjectStage).filter(
        ProjectStage.id == body.stage_id,
        ProjectStage.project_id == project_id,
    ).first()
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    card.stage_id = body.stage_id
    if body.position is not None:
        card.position = body.position
    db.commit()
    db.refresh(card)
    return ProjectCardResponse.model_validate(card)

