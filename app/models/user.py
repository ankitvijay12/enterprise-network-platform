"""User model and role definitions."""
from typing import List, Optional
from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import Base, TimestampMixin


class UserRole:
    ADMIN = "admin"
    ENGINEER = "engineer"
    VIEWER = "viewer"
    ALL = [ADMIN, ENGINEER, VIEWER]


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), default=UserRole.ENGINEER, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    projects: Mapped[List["Project"]] = relationship("Project", back_populates="owner", cascade="all, delete-orphan")
    simulation_runs: Mapped[List["SimulationRun"]] = relationship("SimulationRun", back_populates="executed_by")
    audit_logs: Mapped[List["AuditLog"]] = relationship("AuditLog", back_populates="user")
