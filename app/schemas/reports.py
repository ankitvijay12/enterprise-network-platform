"""Report schemas."""
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from app.schemas.validation import DesignHealthReport
from app.schemas.simulation import RedundancySimulationResult


class TopologyInventoryReport(BaseModel):
    total_devices: int
    devices_by_type: Dict[str, int]
    total_interfaces: int
    active_interfaces: int
    total_links: int
    total_subnets: int
    total_vlans: int


class TopologyReportResponse(BaseModel):
    topology_id: int
    topology_name: str
    project_name: str
    generated_at: datetime
    inventory: TopologyInventoryReport
    health: DesignHealthReport
    redundancy: RedundancySimulationResult
    recent_simulation_runs_count: int
