"""Report aggregation service."""
from datetime import datetime, timezone
from typing import Dict
from sqlalchemy.orm import Session
from app.models.topology import Topology
from app.schemas.reports import TopologyReportResponse, TopologyInventoryReport
from app.services.validation_service import evaluate_design_health
from app.simulation.redundancy import analyze_redundancy


def generate_topology_summary_report(db: Session, topology: Topology) -> TopologyReportResponse:
    """Generate comprehensive network summary report covering inventory, health score, and redundancy."""
    # Inventory counts
    devices_by_type: Dict[str, int] = {}
    for d in topology.devices:
        devices_by_type[d.device_type] = devices_by_type.get(d.device_type, 0) + 1

    total_interfaces = 0
    active_interfaces = 0
    for d in topology.devices:
        for iface in d.interfaces:
            total_interfaces += 1
            if iface.status.lower() == "up":
                active_interfaces += 1

    inventory = TopologyInventoryReport(
        total_devices=len(topology.devices),
        devices_by_type=devices_by_type,
        total_interfaces=total_interfaces,
        active_interfaces=active_interfaces,
        total_links=len(topology.links),
        total_subnets=len(topology.subnets),
        total_vlans=len(topology.vlans)
    )

    # Health & Validation
    health = evaluate_design_health(topology)

    # Redundancy & SPOFs
    redundancy = analyze_redundancy(topology)

    return TopologyReportResponse(
        topology_id=topology.id,
        topology_name=topology.name,
        project_name=topology.project.name if topology.project else "Default Project",
        generated_at=datetime.now(timezone.utc),
        inventory=inventory,
        health=health,
        redundancy=redundancy,
        recent_simulation_runs_count=len(topology.simulation_runs)
    )
