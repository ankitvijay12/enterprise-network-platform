"""Simulation request and response schemas."""
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


# Traffic Flow CRUD
class TrafficFlowBase(BaseModel):
    name: str
    source_device_id: int
    target_device_id: int
    demand_mbps: float = Field(default=100.0, gt=0, description="Traffic volume in Mbps")
    protocol: str = "TCP"
    priority: int = 1


class TrafficFlowCreate(TrafficFlowBase):
    topology_id: int


class TrafficFlowResponse(TrafficFlowBase):
    id: int
    topology_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Path Routing Simulation
class PathSimulationRequest(BaseModel):
    topology_id: int
    source_device_id: int
    target_device_id: int
    metric: str = Field(default="cost", description="'cost' or 'latency'")


class PathHop(BaseModel):
    device_id: int
    device_name: str
    device_type: str
    interface_id: Optional[int] = None
    interface_name: Optional[str] = None
    link_id: Optional[int] = None


class PathSimulationResult(BaseModel):
    path_found: bool
    source_device: str
    target_device: str
    hops: List[PathHop]
    total_cost: int
    total_latency_ms: float
    bottleneck_bandwidth_mbps: int
    path_edges: List[int]
    path_nodes: List[int]


# Reachability Matrix
class ReachabilityPair(BaseModel):
    source_id: int
    source_name: str
    target_id: int
    target_name: str
    reachable: bool
    path_cost: Optional[int] = None
    latency_ms: Optional[float] = None


class ReachabilitySimulationResult(BaseModel):
    total_devices: int
    total_pairs: int
    reachable_pairs_count: int
    unreachable_pairs_count: int
    reachability_percentage: float
    pairs: List[ReachabilityPair]


# Failure Simulation
class FailureSimulationRequest(BaseModel):
    topology_id: int
    failed_device_ids: List[int] = []
    failed_link_ids: List[int] = []


class BrokenPath(BaseModel):
    flow_name: str
    source_device: str
    target_device: str
    demand_mbps: float
    rerouted: bool
    new_hops: List[str] = []


class FailureSimulationResult(BaseModel):
    initial_partitions_count: int
    post_failure_partitions_count: int
    isolated_device_ids: List[int]
    isolated_device_names: List[str]
    broken_flows_count: int
    rerouted_flows_count: int
    dropped_flows_count: int
    flow_impacts: List[BrokenPath]
    surviving_nodes_count: int
    surviving_edges_count: int


# Traffic Simulation
class TrafficSimulationRequest(BaseModel):
    topology_id: int
    custom_flows: Optional[List[TrafficFlowBase]] = None


class LinkTrafficMetric(BaseModel):
    link_id: int
    source_device: str
    target_device: str
    capacity_mbps: int
    carried_load_mbps: float
    utilization_pct: float
    is_congested: bool  # > 80%
    is_saturated: bool  # >= 100%
    latency_ms: float
    effective_latency_ms: float
    packet_loss_pct: float


class FlowResult(BaseModel):
    flow_name: str
    source: str
    target: str
    demand_mbps: float
    path_hops: List[str]
    delivered: bool
    end_to_end_latency_ms: float
    estimated_packet_loss_pct: float


class TrafficSimulationResult(BaseModel):
    total_offered_load_mbps: float
    total_carried_load_mbps: float
    congested_links_count: int
    congested_link_ids: List[int]
    saturated_links_count: int
    link_metrics: List[LinkTrafficMetric]
    flows: List[FlowResult]


# Redundancy / SPOF Simulation
class RedundancySimulationResult(BaseModel):
    is_biconnected: bool
    articulation_device_ids: List[int]  # Critical single nodes (SPOFs)
    articulation_device_names: List[str]
    bridge_link_ids: List[int]          # Critical single links (SPOFs)
    redundancy_score: float             # 0-100
    connected_components_count: int
    recommendations: List[str]


# Run Metadata
class SimulationRunResponse(BaseModel):
    id: int
    topology_id: int
    run_type: str
    status: str
    parameters_json: str
    executed_by_id: Optional[int] = None
    created_at: datetime
    result_summary: Optional[Dict[str, Any]] = None

    model_config = ConfigDict(from_attributes=True)
