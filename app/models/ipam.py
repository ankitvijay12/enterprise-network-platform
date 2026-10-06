"""IPAM (IP Address Management) models: Subnet and VLAN."""
from typing import Optional
from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import Base, TimestampMixin


class Subnet(Base, TimestampMixin):
    __tablename__ = "subnets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    topology_id: Mapped[int] = mapped_column(Integer, ForeignKey("topologies.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    cidr: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    gateway_ip: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    vlan_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    allocated_ips_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    topology: Mapped["Topology"] = relationship("Topology", back_populates="subnets")


class VLAN(Base, TimestampMixin):
    __tablename__ = "vlans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    topology_id: Mapped[int] = mapped_column(Integer, ForeignKey("topologies.id", ondelete="CASCADE"), nullable=False, index=True)
    vlan_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    topology: Mapped["Topology"] = relationship("Topology", back_populates="vlans")
