"""
Shared FastAPI dependencies for access checks.
"""

from fastapi import Depends, HTTPException, status

from app import auth
from app.models import User


def assert_not_guest(user: User) -> None:
    if user.id == auth.GUEST_USER_ID:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Guest users cannot perform this action",
        )


async def require_sales_admin_owner(
    current_user: User = Depends(auth.get_current_active_user),
) -> User:
    """Access to sales sections: leads, events, student cards, bank ops, debts."""
    auth.ensure_permission(current_user, "sales.access")
    return current_user


async def require_finance_access(
    current_user: User = Depends(auth.get_current_active_user),
) -> User:
    """Access to finance journal and finance operations."""
    if not auth.has_permission(current_user, "finance.access"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions for finance access",
        )
    return current_user
