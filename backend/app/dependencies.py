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


async def require_sales_manage_bank(
    current_user: User = Depends(auth.get_current_active_user),
) -> User:
    """Manage bank operations: import statements, apply/delete transactions, phone bindings."""
    auth.ensure_permission(current_user, "sales.manage_bank")
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


async def require_finance_manage(
    current_user: User = Depends(auth.get_current_active_user),
) -> User:
    """Manage finance data: accounts, models, articles, budget, metrics, transactions."""
    if not auth.has_permission(current_user, "finance.manage"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions for finance management",
        )
    return current_user
