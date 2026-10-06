"""Schemas module init."""
from app.schemas.common import PaginatedResponse, StandardResponse
from app.schemas.auth import LoginRequest, TokenResponse, RefreshTokenRequest, TokenPayload
from app.schemas.user import UserBase, UserCreate, UserUpdate, UserResponse
from app.schemas.project import ProjectBase, ProjectCreate, ProjectUpdate, ProjectResponse
from app.schemas.topology import (
    TopologyBase, TopologyCreate, TopologyUpdate, TopologyResponse,
    TopologyExportSchema, DeviceExportSchema, LinkExportSchema
)
from app.schemas.device import DeviceBase, DeviceCreate, DeviceUpdate, DeviceResponse
from app.schemas.interface import InterfaceBase, InterfaceCreate, InterfaceUpdate, InterfaceResponse
from app.schemas.link import LinkBase, LinkCreate, LinkUpdate, LinkResponse
from app.schemas.ipam import (
    SubnetBase, SubnetCreate, SubnetUpdate, SubnetResponse,
    VLANBase, VLANCreate, VLANUpdate, VLANResponse,
    VLSMRequest, VLSMResponse, VLSMDepartmentRequirement, VLSMAllocatedSubnet
)
from app.schemas.simulation import (
    PathSimulationRequest, PathSimulationResult,
    ReachabilitySimulationResult,
    FailureSimulationRequest, FailureSimulationResult,
    TrafficSimulationRequest, TrafficSimulationResult,
    RedundancySimulationResult, SimulationRunResponse,
    TrafficFlowBase, TrafficFlowCreate, TrafficFlowResponse
)
from app.schemas.validation import ValidationIssue, DesignHealthReport, IssueSeverity
from app.schemas.reports import TopologyReportResponse, TopologyInventoryReport

__all__ = [
    "PaginatedResponse", "StandardResponse",
    "LoginRequest", "TokenResponse", "RefreshTokenRequest", "TokenPayload",
    "UserBase", "UserCreate", "UserUpdate", "UserResponse",
    "ProjectBase", "ProjectCreate", "ProjectUpdate", "ProjectResponse",
    "TopologyBase", "TopologyCreate", "TopologyUpdate", "TopologyResponse",
    "TopologyExportSchema", "DeviceExportSchema", "LinkExportSchema",
    "DeviceBase", "DeviceCreate", "DeviceUpdate", "DeviceResponse",
    "InterfaceBase", "InterfaceCreate", "InterfaceUpdate", "InterfaceResponse",
    "LinkBase", "LinkCreate", "LinkUpdate", "LinkResponse",
    "SubnetBase", "SubnetCreate", "SubnetUpdate", "SubnetResponse",
    "VLANBase", "VLANCreate", "VLANUpdate", "VLANResponse",
    "VLSMRequest", "VLSMResponse", "VLSMDepartmentRequirement", "VLSMAllocatedSubnet",
    "PathSimulationRequest", "PathSimulationResult",
    "ReachabilitySimulationResult",
    "FailureSimulationRequest", "FailureSimulationResult",
    "TrafficSimulationRequest", "TrafficSimulationResult",
    "RedundancySimulationResult", "SimulationRunResponse",
    "TrafficFlowBase", "TrafficFlowCreate", "TrafficFlowResponse",
    "ValidationIssue", "DesignHealthReport", "IssueSeverity",
    "TopologyReportResponse", "TopologyInventoryReport"
]
