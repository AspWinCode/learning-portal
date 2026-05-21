"""Projects kanban for project-access roles."""

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import Project, ProjectCard, ProjectStage, Student, StudentStatus, User, UserRole
from app.schemas import (
    ProjectCardMove,
    ProjectCardResponse,
    ProjectCreate,
    ProjectResponse,
    ProjectStageCreate,
    ProjectStageResponse,
    ProjectUpdate,
)

router = APIRouter()


def _require_projects_access(user: User) -> None:
    auth.ensure_permission(user, "projects.access")


def _require_can_create_project(user: User) -> None:
    auth.ensure_permission(user, "projects.manage")


@router.get("/", response_model=List[ProjectResponse])
async def list_projects(
    archived: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_projects_access(current_user)
    query = db.query(Project)
    if archived is not None:
        query = query.filter(Project.archived == archived)
    projects = query.order_by(Project.created_at.desc()).all()
    output = []
    for project in projects:
        data = ProjectResponse.model_validate(project).model_dump(exclude={"stages", "card_count"})
        data["card_count"] = db.query(ProjectCard).filter(ProjectCard.project_id == project.id).count()
        data["stages"] = [ProjectStageResponse.model_validate(stage) for stage in project.stages]
        output.append(ProjectResponse(**data))
    return output


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    body: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
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
        parents = db.query(User).filter(User.role == UserRole.PARENT, User.is_active.is_(True)).all()
        for position, parent in enumerate(parents):
            db.add(
                ProjectCard(
                    project_id=project.id,
                    stage_id=first_stage.id,
                    entity_type="parent",
                    entity_id=parent.id,
                    position=position,
                )
            )
    else:
        students = db.query(Student).filter(Student.status == StudentStatus.ACTIVE).all()
        for position, student in enumerate(students):
            db.add(
                ProjectCard(
                    project_id=project.id,
                    stage_id=first_stage.id,
                    entity_type="student",
                    entity_id=student.id,
                    position=position,
                )
            )

    db.commit()
    db.refresh(project)
    data = ProjectResponse.model_validate(project).model_dump(exclude={"stages", "card_count"})
    data["stages"] = [ProjectStageResponse.model_validate(stage) for stage in project.stages]
    data["card_count"] = db.query(ProjectCard).filter(ProjectCard.project_id == project.id).count()
    return ProjectResponse(**data)


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_projects_access(current_user)
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    data = ProjectResponse.model_validate(project).model_dump(exclude={"stages", "card_count"})
    data["stages"] = [ProjectStageResponse.model_validate(stage) for stage in project.stages]
    data["card_count"] = db.query(ProjectCard).filter(ProjectCard.project_id == project.id).count()
    return ProjectResponse(**data)


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    body: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_projects_access(current_user)
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(project, key, value)
    db.commit()
    db.refresh(project)
    data = ProjectResponse.model_validate(project).model_dump(exclude={"stages", "card_count"})
    data["stages"] = [ProjectStageResponse.model_validate(stage) for stage in project.stages]
    data["card_count"] = db.query(ProjectCard).filter(ProjectCard.project_id == project.id).count()
    return ProjectResponse(**data)


@router.post("/{project_id}/stages", response_model=ProjectStageResponse, status_code=status.HTTP_201_CREATED)
async def create_stage(
    project_id: int,
    body: ProjectStageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_projects_access(current_user)
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    max_position = db.query(func.max(ProjectStage.position)).filter(ProjectStage.project_id == project_id).scalar() or 0
    stage = ProjectStage(
        project_id=project_id,
        name=body.name,
        position=body.position if body.position is not None else max_position + 1,
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
    _require_projects_access(current_user)
    stage = db.query(ProjectStage).filter(
        ProjectStage.id == stage_id,
        ProjectStage.project_id == project_id,
    ).first()
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    if stage.cards:
        raise HTTPException(status_code=400, detail="Move cards to another stage before deleting")
    db.delete(stage)
    db.commit()


def _safe_iso(value):
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


@router.get("/{project_id}/board")
async def get_project_board(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_projects_access(current_user)
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    stages_output = []
    for stage in sorted(getattr(project, "stages", None) or [], key=lambda item: item.position):
        cards = db.query(ProjectCard).filter(ProjectCard.stage_id == stage.id).order_by(ProjectCard.position).all()
        cards_output = []
        for card in cards:
            try:
                if card.entity_type == "parent":
                    user = db.query(User).filter(User.id == card.entity_id).first()
                    display_name = user.full_name if user else f"User #{card.entity_id}"
                else:
                    student = db.query(Student).filter(Student.id == card.entity_id).first()
                    display_name = student.full_name if student else f"Student #{card.entity_id}"
            except Exception:
                display_name = f"#{card.entity_id}"
            cards_output.append(
                {
                    "id": card.id,
                    "project_id": card.project_id,
                    "stage_id": card.stage_id,
                    "entity_type": card.entity_type,
                    "entity_id": card.entity_id,
                    "position": card.position,
                    "created_at": _safe_iso(card.created_at),
                    "display_name": display_name,
                }
            )
        stages_output.append(
            {
                "id": stage.id,
                "project_id": stage.project_id,
                "name": stage.name,
                "position": stage.position,
                "cards": cards_output,
            }
        )

    created_by_data = None
    try:
        created_by = getattr(project, "created_by", None)
        if created_by:
            created_by_data = {
                "id": created_by.id,
                "email": getattr(created_by, "email", ""),
                "full_name": getattr(created_by, "full_name", ""),
                "role": getattr(getattr(created_by, "role", None), "value", None) or str(getattr(created_by, "role", "")),
                "is_active": getattr(created_by, "is_active", True),
                "created_at": _safe_iso(getattr(created_by, "created_at", None)),
                "trainer_rate": getattr(created_by, "trainer_rate", None),
                "trainer_lessons": getattr(created_by, "trainer_lessons", None),
            }
    except Exception:
        created_by_data = None

    card_count = db.query(ProjectCard).filter(ProjectCard.project_id == project.id).count()
    project_payload = {
        "id": project.id,
        "name": project.name,
        "start_date": _safe_iso(getattr(project, "start_date", None)),
        "end_date": _safe_iso(getattr(project, "end_date", None)),
        "description": getattr(project, "description", None),
        "entity_type": project.entity_type,
        "created_by_id": project.created_by_id,
        "archived": getattr(project, "archived", False),
        "created_at": _safe_iso(getattr(project, "created_at", None)),
        "updated_at": _safe_iso(getattr(project, "updated_at", None)),
        "created_by": created_by_data,
        "stages": [],
        "card_count": card_count,
    }
    return {"project": project_payload, "stages": stages_output}


@router.patch("/{project_id}/cards/{card_id}/move")
async def move_card(
    project_id: int,
    card_id: int,
    body: ProjectCardMove,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
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
