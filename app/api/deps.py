"""FastAPI dependency injection: Database session and JWT authentication with RBAC."""
from typing import Generator, List, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.security import decode_token
from app.core.exceptions import UnauthorizedException, ForbiddenException
from app.database.session import get_db
from app.models.user import User, UserRole

security_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    db: Session = Depends(get_db)
) -> User:
    """Validate Bearer JWT token and return active user."""
    if not credentials:
        raise UnauthorizedException("Authorization header with Bearer token is required")

    token = credentials.credentials
    payload = decode_token(token)
    if not payload:
        raise UnauthorizedException("Invalid or expired JWT token")

    if payload.get("type") != "access":
        raise UnauthorizedException("Invalid token type: access token required")

    user_id = payload.get("sub")
    if not user_id:
        raise UnauthorizedException("Token missing subject identifier")

    try:
        uid = int(user_id)
    except ValueError:
        raise UnauthorizedException("Invalid user ID in token")

    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise UnauthorizedException("User associated with token not found")

    if not user.is_active:
        raise ForbiddenException("User account is inactive")

    return user


def require_role(allowed_roles: List[str]):
    """Factory dependency enforcing RBAC roles."""
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise ForbiddenException(
                f"Role '{current_user.role}' is not authorized. Required: {', '.join(allowed_roles)}"
            )
        return current_user
    return role_checker
