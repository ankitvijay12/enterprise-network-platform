"""Link model connecting device interfaces."""
from typing import Optional
from sqlalchemy import Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import Base, TimestampMixin


class LinkStatus:
    UP = "up"
    DOWN = "down"


class Link(Base, TimestampMixin):
    __tablename__ = "links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    topology_id: Mapped[int] = mapped_column(Integer, ForeignKey("topologies.id", ondelete="CASCADE"), nullable=False, index=True)
    source_interface_id: Mapped[int] = mapped_column(Integer, ForeignKey("interfaces.id", ondelete="CASCADE"), nullable=False, index=True)
    target_interface_id: Mapped[int] = mapped_column(Integer, ForeignKey("interfaces.id", ondelete="CASCADE"), nullable=False, index=True)
    
    bandwidth_mbps: Mapped[int] = mapped_column(Integer, default=1000, nullable=False)
    latency_ms: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    packet_loss_pct: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default=LinkStatus.UP, nullable=False)
    cost: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    link_type: Mapped[str] = mapped_column(String(50), default="ethernet", nullable=False)

    # Relationships
    topology: Mapped["Topology"] = relationship("Topology", back_populates="links")
    source_interface: Mapped["Interface"] = relationship("Interface", foreign_keys=[source_interface_id], back_populates="source_links")
    target_interface: Mapped["Interface"] = relationship("Interface", foreign_keys=[target_interface_id], back_populates="target_links")
