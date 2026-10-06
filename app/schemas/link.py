"""Link schemas."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class LinkBase(BaseModel):
    source_interface_id: int
    target_interface_id: int
    bandwidth_mbps: int = Field(default=1000, description="Bandwidth capacity in Mbps")
    latency_ms: float = Field(default=1.0, description="Propagation latency in ms")
    packet_loss_pct: float = Field(default=0.0, description="Packet loss percentage")
    status: str = Field(default="up", description="'up' or 'down'")
    cost: int = Field(default=10, description="Routing metric cost")
    link_type: str = "ethernet"


class LinkCreate(LinkBase):
    topology_id: int


class LinkUpdate(BaseModel):
    bandwidth_mbps: Optional[int] = None
    latency_ms: Optional[float] = None
    packet_loss_pct: Optional[float] = None
    status: Optional[str] = None
    cost: Optional[int] = None
    link_type: Optional[str] = None


class LinkResponse(LinkBase):
    id: int
    topology_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
