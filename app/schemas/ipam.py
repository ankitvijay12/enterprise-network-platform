"""IPAM (IP Address Management) and VLSM schemas."""
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


# Subnet Schemas
class SubnetBase(BaseModel):
    name: str
    cidr: str = Field(..., description="IPv4 CIDR e.g. 192.168.1.0/24")
    gateway_ip: Optional[str] = None
    vlan_id: Optional[int] = None
    allocated_ips_json: Optional[str] = "[]"
    description: Optional[str] = None


class SubnetCreate(SubnetBase):
    topology_id: int


class SubnetUpdate(BaseModel):
    name: Optional[str] = None
    cidr: Optional[str] = None
    gateway_ip: Optional[str] = None
    vlan_id: Optional[int] = None
    allocated_ips_json: Optional[str] = None
    description: Optional[str] = None


class SubnetResponse(SubnetBase):
    id: int
    topology_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# VLAN Schemas
class VLANBase(BaseModel):
    vlan_id: int = Field(..., ge=1, le=4094, description="VLAN identifier 1-4094")
    name: str
    description: Optional[str] = None


class VLANCreate(VLANBase):
    topology_id: int


class VLANUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class VLANResponse(VLANBase):
    id: int
    topology_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# VLSM Calculator Schemas
class VLSMDepartmentRequirement(BaseModel):
    name: str
    needed_hosts: int = Field(..., gt=0, description="Number of required usable host addresses")


class VLSMRequest(BaseModel):
    major_network: str = Field(..., description="Major network address e.g. 192.168.0.0/24 or 10.0.0.0/16")
    departments: List[VLSMDepartmentRequirement]


class VLSMAllocatedSubnet(BaseModel):
    name: str
    needed_hosts: int
    allocated_hosts: int
    network_address: str
    prefix_length: int
    subnet_mask: str
    usable_range_start: str
    usable_range_end: str
    broadcast_address: str
    wasted_hosts: int


class VLSMResponse(BaseModel):
    major_network: str
    total_requested_hosts: int
    total_allocated_capacity: int
    subnets: List[VLSMAllocatedSubnet]
    unallocated_space: List[str]
