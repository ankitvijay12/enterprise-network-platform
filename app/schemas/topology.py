"""Topology schemas including full JSON export and import."""
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict
from app.schemas.device import DeviceResponse, DeviceCreate
from app.schemas.link import LinkResponse, LinkCreate
from app.schemas.ipam import SubnetResponse, SubnetCreate, VLANResponse, VLANCreate


class TopologyBase(BaseModel):
    name: str
    version: int = 1
    is_active: bool = True
    metadata_json: Optional[str] = "{}"


class TopologyCreate(TopologyBase):
    project_id: int


class TopologyUpdate(BaseModel):
    name: Optional[str] = None
    version: Optional[int] = None
    is_active: Optional[bool] = None
    metadata_json: Optional[str] = None


class TopologyResponse(TopologyBase):
    id: int
    project_id: int
    devices_count: Optional[int] = 0
    links_count: Optional[int] = 0
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class InterfaceExportSchema(BaseModel):
    name: str
    speed_mbps: int = 1000
    mac_address: Optional[str] = None
    ip_address: Optional[str] = None
    subnet_mask: Optional[str] = None
    vlan_id: Optional[int] = None
    status: str = "up"
    is_management: bool = False


class DeviceExportSchema(BaseModel):
    name: str
    device_type: str
    x_pos: float = 0.0
    y_pos: float = 0.0
    status: str = "up"
    vendor: Optional[str] = None
    model: Optional[str] = None
    config_json: Optional[str] = "{}"
    interfaces: List[InterfaceExportSchema] = []


class LinkExportSchema(BaseModel):
    source_device_name: str
    source_interface_name: str
    target_device_name: str
    target_interface_name: str
    bandwidth_mbps: int = 1000
    latency_ms: float = 1.0
    packet_loss_pct: float = 0.0
    status: str = "up"
    cost: int = 10
    link_type: str = "ethernet"


class SubnetExportSchema(BaseModel):
    name: str
    cidr: str
    gateway_ip: Optional[str] = None
    vlan_id: Optional[int] = None
    allocated_ips_json: str = "[]"
    description: Optional[str] = None


class VLANExportSchema(BaseModel):
    vlan_id: int
    name: str
    description: Optional[str] = None


class TopologyExportSchema(BaseModel):
    name: str
    version: int
    description: Optional[str] = None
    metadata: Dict[str, Any] = {}
    devices: List[DeviceExportSchema] = []
    links: List[LinkExportSchema] = []
    subnets: List[SubnetExportSchema] = []
    vlans: List[VLANExportSchema] = []
