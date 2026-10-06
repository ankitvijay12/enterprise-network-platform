"""Device schemas."""
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field
from app.schemas.interface import InterfaceResponse


class DeviceBase(BaseModel):
    name: str
    device_type: str = Field(..., description="router, l3_switch, l2_switch, firewall, server, access_point, endpoint")
    x_pos: float = 0.0
    y_pos: float = 0.0
    status: str = Field(default="up", description="'up' or 'down'")
    vendor: Optional[str] = None
    model: Optional[str] = None
    config_json: Optional[str] = "{}"


class DeviceCreate(DeviceBase):
    topology_id: int


class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    device_type: Optional[str] = None
    x_pos: Optional[float] = None
    y_pos: Optional[float] = None
    status: Optional[str] = None
    vendor: Optional[str] = None
    model: Optional[str] = None
    config_json: Optional[str] = None


class DeviceResponse(DeviceBase):
    id: int
    topology_id: int
    interfaces: List[InterfaceResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
