"""
auth.py — Authentication & user-management endpoints.

Public:
    POST /api/auth/login        — obtain JWT token

Authenticated (any role):
    GET  /api/auth/me           — current user profile

Admin only:
    GET  /api/auth/users        — list all users
    POST /api/auth/users        — create user
    PUT  /api/auth/users/{id}   — update user (role, password, active…)
    DELETE /api/auth/users/{id} — deactivate user (soft delete)
"""

from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password, create_access_token
from app.db.session import get_db
from app.db.models import User
from app.schemas.auth import (
    LoginRequest,
    TokenResponse,
    UserOut,
    UserCreateIn,
    UserUpdateIn,
)
from app.dependencies.auth import get_current_user, _require_role

router = APIRouter(prefix="/auth", tags=["auth"])

_VALID_ROLES = {"ADMIN", "GUARD", "AUDITOR"}


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = (
        db.query(User)
        .filter(User.username == body.username, User.active == True)
        .first()
    )
    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    # Record last login time
    user.last_login = datetime.now(timezone.utc)
    db.commit()

    token = create_access_token({"sub": user.username, "role": user.role})
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


# ── Current user ──────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)


# ── Admin: user management ────────────────────────────────────────────────────

@router.get("/users", response_model=List[UserOut])
def list_users(
    _: User = Depends(_require_role("ADMIN")),
    db: Session = Depends(get_db),
):
    return [UserOut.model_validate(u) for u in db.query(User).order_by(User.id).all()]


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(
    body: UserCreateIn,
    _: User = Depends(_require_role("ADMIN")),
    db: Session = Depends(get_db),
):
    if body.role not in _VALID_ROLES:
        raise HTTPException(400, f"role must be one of {sorted(_VALID_ROLES)}")

    existing = db.query(User).filter(User.username == body.username).first()
    if existing:
        raise HTTPException(409, "Username already taken")

    user = User(
        username=body.username,
        full_name=body.full_name,
        hashed_password=hash_password(body.password),
        role=body.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    body: UserUpdateIn,
    _: User = Depends(_require_role("ADMIN")),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    if body.full_name is not None:
        user.full_name = body.full_name
    if body.role is not None:
        if body.role not in _VALID_ROLES:
            raise HTTPException(400, f"role must be one of {sorted(_VALID_ROLES)}")
        user.role = body.role
    if body.active is not None:
        user.active = body.active
    if body.password:
        user.hashed_password = hash_password(body.password)

    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.delete("/users/{user_id}", status_code=204)
def deactivate_user(
    user_id: int,
    current_user: User = Depends(_require_role("ADMIN")),
    db: Session = Depends(get_db),
):
    """Soft-delete: sets active=False.  Admins cannot deactivate themselves."""
    if user_id == current_user.id:
        raise HTTPException(400, "Cannot deactivate your own account")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    user.active = False
    db.commit()
