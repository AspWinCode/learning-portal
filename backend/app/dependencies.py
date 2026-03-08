"""
Общие зависимости FastAPI: проверка прав доступа по ролям (ТЗ этап 5).

Использование: в роутере указать current_user: User = Depends(require_sales_admin_owner)
вместо вызова _require_sales_admin_owner(current_user) после get_current_active_user.
"""

from fastapi import Depends, HTTPException, status

from app import auth
from app.models import User, UserRole


async def require_sales_admin_owner(
    current_user: User = Depends(auth.get_current_active_user),
) -> User:
    """Доступ к разделам sales (лиды, события, карточки, операции банка, долги): admin, owner, sales."""
    if current_user.role not in (UserRole.SALES, UserRole.ADMIN, UserRole.OWNER):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
    return current_user


async def require_finance_access(
    current_user: User = Depends(auth.get_current_active_user),
) -> User:
    """Доступ к финансовому журналу и операциям: admin, owner, sales."""
    if current_user.role not in (UserRole.ADMIN, UserRole.OWNER, UserRole.SALES):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав для работы с финансовым журналом",
        )
    return current_user
