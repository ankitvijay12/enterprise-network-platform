"""Topology model representing versioned network configurations."""
from typing import List, Optional
from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import Base, TimestampMixin


class Topology(Base, TimestampMixin):
    __tablename__ = "topologies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    metadata_json: Mapped[Optional[str]] = mapped_column(Text, default="{}", nullable=True)

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="topologies")
    devices: Mapped[List["Device"]] = relationship("Device", back_populates="topology", cascade="all, delete-orphan")
    links: Mapped[List["Link"]] = relationship("Link", back_populates="topology", cascade="all, delete-orphan")
    subnets: Mapped[List["Subnet"]] = relationship("Subnet", back_populates="topology", cascade="all, delete-orphan")
    vlans: Mapped[List["VLAN"]] = relationship("VLAN", back_populates="topology", cascade="all, delete-orphan")
    traffic_flows: Mapped[List["TrafficFlow"]] = relationship("TrafficFlow", back_populates="topology", cascade="all, delete-orphan")
    simulation_runs: Mapped[List["SimulationRun"]] = relationship("SimulationRun", back_populates="topology", cascade="all, delete-orphan")
