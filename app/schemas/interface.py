"""Interface schemas."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class InterfaceBase(BaseModel):
    name: str = Field(..., description="Interface name e.g. GigabitEthernet0/1")
    speed_mbps: int = Field(default=1000, description="Interface link speed in Mbps")
    mac_address: Optional[str] = None
    ip_address: Optional[str] = None
    subnet_mask: Optional[str] = None
    vlan_id: Optional[int] = None
    status: str = Field(default="up", description="'up' or 'down'")
    is_management: bool = False


class InterfaceCreate(InterfaceBase):
    device_id: int


class InterfaceUpdate(BaseModel):
    name: Optional[str] = None
    speed_mbps: Optional[int] = None
    mac_address: Optional[str] = None
    ip_address: Optional[str] = None
    subnet_mask: Optional[str] = None
    vlan_id: Optional[int] = None
    status: Optional[str] = None
    is_management: Optional[bool] = None


class InterfaceResponse(InterfaceBase):
    id: int
    device_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
