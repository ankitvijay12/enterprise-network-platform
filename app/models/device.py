"""Device model representing network nodes."""
from typing import List, Optional
from sqlalchemy import Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import Base, TimestampMixin


class DeviceType:
    ROUTER = "router"
    L3_SWITCH = "l3_switch"
    L2_SWITCH = "l2_switch"
    FIREWALL = "firewall"
    SERVER = "server"
    ACCESS_POINT = "access_point"
    ENDPOINT = "endpoint"

    ALL = [ROUTER, L3_SWITCH, L2_SWITCH, FIREWALL, SERVER, ACCESS_POINT, ENDPOINT]


class DeviceStatus:
    UP = "up"
    DOWN = "down"


class Device(Base, TimestampMixin):
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    topology_id: Mapped[int] = mapped_column(Integer, ForeignKey("topologies.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    device_type: Mapped[str] = mapped_column(String(50), nullable=False)
    x_pos: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    y_pos: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default=DeviceStatus.UP, nullable=False)
    vendor: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    config_json: Mapped[Optional[str]] = mapped_column(Text, default="{}", nullable=True)

    # Relationships
    topology: Mapped["Topology"] = relationship("Topology", back_populates="devices")
    interfaces: Mapped[List["Interface"]] = relationship("Interface", back_populates="device", cascade="all, delete-orphan")
