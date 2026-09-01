from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import Student, StudentStatus, User
from app.schemas.pixelforge import PixelForgeStudentProgress
from app.services.pixelforge_sso import fetch_student_pixelforge_progress

router = APIRouter()


@router.get("/students/{student_id}/progress", response_model=PixelForgeStudentProgress)
async def get_student_progress(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Прогресс ученика на PixelForge. Доступно служебным ролям с pixelforge.access
    (тренер/методист), а также родителю — только для своих активных детей."""
    is_staff = auth.has_permission(current_user, "pixelforge.access")
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
        overview = await fetch_student_pixelforge_progress(student_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"PixelForge недоступен: {e}")

    if not overview:
        return PixelForgeStudentProgress(started=False)
    return PixelForgeStudentProgress(started=True, **overview)
