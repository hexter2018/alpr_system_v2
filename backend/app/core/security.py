"""
security.py — JWT token utilities and password hashing.

Dependencies (add to requirements.txt if not present):
    python-jose[cryptography]>=3.3.0
    passlib[bcrypt]>=1.7.4
"""

from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

# ── Password hashing ──────────────────────────────────────────────────────────
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    """Return bcrypt hash of *plain* text password."""
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """Return True if *plain* matches *hashed*."""
    return _pwd_context.verify(plain, hashed)


# ── JWT ───────────────────────────────────────────────────────────────────────

def create_access_token(data: dict[str, Any]) -> str:
    """
    Create a signed JWT containing *data* as payload claims.
    Adds an ``exp`` claim automatically.
    """
    payload = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload["exp"] = expire
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict[str, Any]:
    """
    Decode and verify *token*.  Raises ``jose.JWTError`` on any failure
    (expired, bad signature, malformed, …).
    """
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
