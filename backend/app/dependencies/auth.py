"""
auth.py — FastAPI dependency functions for JWT authentication and RBAC.

Usage in route files:
    from app.dependencies.auth import require_admin, require_guard, require_auditor

    @router.get("/sensitive")
    def sensitive_endpoint(user = Depends(require_admin)):
        ...

Role hierarchy (higher role satisfies lower requirements):
    ADMIN (3) > GUARD (2) > AUDITOR (1)
"""

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db.session import get_db
from app.db.models import User

_bearer = HTTPBearer(auto_error=True)

_ROLE_RANK = {"ADMIN": 3, "GUARD": 2, "AUDITOR": 1}

_CREDENTIALS_EXCEPTION = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)

_FORBIDDEN_EXCEPTION = HTTPException(
    status_code=status.HTTP_403_FORBIDDEN,
    detail="Insufficient permissions",
)


def _get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
    db: Session = Depends(get_db),
) -> User:
    """Decode Bearer token and return the corresponding active User row."""
    try:
        payload = decode_token(credentials.credentials)
        username: str = payload.get("sub")
        if not username:
            raise _CREDENTIALS_EXCEPTION
    except JWTError:
        raise _CREDENTIALS_EXCEPTION

    user = db.query(User).filter(User.username == username, User.active == True).first()
    if user is None:
        raise _CREDENTIALS_EXCEPTION
    return user


def _require_role(min_role: str):
    """Return a FastAPI dependency that enforces a minimum role."""
    def _dep(user: User = Depends(_get_current_user)) -> User:
        if _ROLE_RANK.get(user.role, 0) < _ROLE_RANK.get(min_role, 0):
            raise _FORBIDDEN_EXCEPTION
        return user
    return _dep


# ── Public dependency shortcuts ───────────────────────────────────────────────

#: Any authenticated user (no role restriction)
get_current_user = _get_current_user

#: ADMIN only
require_admin: User = Depends(_require_role("ADMIN"))

#: GUARD or ADMIN
require_guard: User = Depends(_require_role("GUARD"))

#: AUDITOR, GUARD, or ADMIN
require_auditor: User = Depends(_require_role("AUDITOR"))
