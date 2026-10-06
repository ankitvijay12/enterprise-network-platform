"""Simulation models for traffic flows, execution runs, and results."""
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import Base, TimestampMixin


class SimulationType:
    PATH = "path"
    REACHABILITY = "reachability"
    FAILURE = "failure"
    TRAFFIC = "traffic"
    REDUNDANCY = "redundancy"

    ALL = [PATH, REACHABILITY, FAILURE, TRAFFIC, REDUNDANCY]


class TrafficFlow(Base, TimestampMixin):
    __tablename__ = "traffic_flows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    topology_id: Mapped[int] = mapped_column(Integer, ForeignKey("topologies.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    source_device_id: Mapped[int] = mapped_column(Integer, ForeignKey("devices.id", ondelete="CASCADE"), nullable=False)
    target_device_id: Mapped[int] = mapped_column(Integer, ForeignKey("devices.id", ondelete="CASCADE"), nullable=False)
    demand_mbps: Mapped[float] = mapped_column(Float, default=100.0, nullable=False)
    protocol: Mapped[str] = mapped_column(String(20), default="TCP", nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Relationships
    topology: Mapped["Topology"] = relationship("Topology", back_populates="traffic_flows")
    source_device: Mapped["Device"] = relationship("Device", foreign_keys=[source_device_id])
    target_device: Mapped["Device"] = relationship("Device", foreign_keys=[target_device_id])


class SimulationRun(Base):
    __tablename__ = "simulation_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    topology_id: Mapped[int] = mapped_column(Integer, ForeignKey("topologies.id", ondelete="CASCADE"), nullable=False, index=True)
    run_type: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="completed", nullable=False)
    parameters_json: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    executed_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    topology: Mapped["Topology"] = relationship("Topology", back_populates="simulation_runs")
    executed_by: Mapped[Optional["User"]] = relationship("User", back_populates="simulation_runs")
    result: Mapped[Optional["SimulationResult"]] = relationship(
        "SimulationResult",
        back_populates="simulation_run",
        cascade="all, delete-orphan",
        uselist=False
    )


class SimulationResult(Base):
    __tablename__ = "simulation_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    simulation_run_id: Mapped[int] = mapped_column(Integer, ForeignKey("simulation_runs.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    is_passed: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    summary_json: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    detailed_metrics_json: Mapped[str] = mapped_column(Text, default="{}", nullable=False)

    # Relationships
    simulation_run: Mapped["SimulationRun"] = relationship("SimulationRun", back_populates="result")
