"""Network interface model for device ports."""
from typing import List, Optional
from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import Base, TimestampMixin


class InterfaceStatus:
    UP = "up"
    DOWN = "down"


class Interface(Base, TimestampMixin):
    __tablename__ = "interfaces"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    device_id: Mapped[int] = mapped_column(Integer, ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    speed_mbps: Mapped[int] = mapped_column(Integer, default=1000, nullable=False)
    mac_address: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(50), index=True, nullable=True)
    subnet_mask: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    vlan_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default=InterfaceStatus.UP, nullable=False)
    is_management: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Relationships
    device: Mapped["Device"] = relationship("Device", back_populates="interfaces")
    source_links: Mapped[List["Link"]] = relationship(
        "Link",
        foreign_keys="Link.source_interface_id",
        back_populates="source_interface",
        cascade="all, delete-orphan"
    )
    target_links: Mapped[List["Link"]] = relationship(
        "Link",
        foreign_keys="Link.target_interface_id",
        back_populates="target_interface",
        cascade="all, delete-orphan"
    )
