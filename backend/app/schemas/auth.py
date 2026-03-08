from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


class LoginRequest(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    full_name: Optional[str] = None
    role: str
    active: bool
    created_at: datetime
    last_login: Optional[datetime] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UserCreateIn(BaseModel):
    username: str
    full_name: Optional[str] = None
    password: str
    role: str = "GUARD"   # ADMIN | GUARD | AUDITOR


class UserUpdateIn(BaseModel):
    full_name: Optional[str] = None
    password: Optional[str] = None   # None = keep existing
    role: Optional[str] = None
    active: Optional[bool] = None
