"""Simulation runner coordinating execution and database result persistence."""
import json
from typing import Any, Dict, Optional, Tuple
from sqlalchemy.orm import Session
from app.models.simulation import SimulationRun, SimulationResult, SimulationType
from app.models.topology import Topology
from app.simulation.routing import compute_shortest_path, compute_reachability_matrix
from app.simulation.failure_engine import simulate_network_failures
from app.simulation.traffic_engine import simulate_traffic_flows
from app.simulation.redundancy import analyze_redundancy
from app.schemas.simulation import (
    PathSimulationRequest, FailureSimulationRequest, TrafficSimulationRequest
)


def run_and_persist_simulation(
    db: Session,
    topology: Topology,
    run_type: str,
    parameters: Dict[str, Any],
    user_id: Optional[int] = None
) -> Tuple[SimulationRun, Dict[str, Any]]:
    """Run simulation scenario and persist metadata to database."""
    summary_data: Dict[str, Any] = {}
    detailed_data: Dict[str, Any] = {}
    is_passed = True

    if run_type == SimulationType.PATH:
        src = parameters.get("source_device_id")
        tgt = parameters.get("target_device_id")
        metric = parameters.get("metric", "cost")
        res = compute_shortest_path(topology, src, tgt, metric)
        detailed_data = res.model_dump()
        summary_data = {
            "path_found": res.path_found,
            "total_cost": res.total_cost,
            "total_latency_ms": res.total_latency_ms,
            "bottleneck_bandwidth_mbps": res.bottleneck_bandwidth_mbps,
            "hops_count": len(res.hops)
        }
        is_passed = res.path_found

    elif run_type == SimulationType.REACHABILITY:
        res = compute_reachability_matrix(topology)
        detailed_data = res.model_dump()
        summary_data = {
            "reachable_pairs": res.reachable_pairs_count,
            "unreachable_pairs": res.unreachable_pairs_count,
            "reachability_percentage": res.reachability_percentage
        }
        is_passed = res.unreachable_pairs_count == 0

    elif run_type == SimulationType.FAILURE:
        failed_devs = parameters.get("failed_device_ids", [])
        failed_links = parameters.get("failed_link_ids", [])
        res = simulate_network_failures(topology, failed_devs, failed_links)
        detailed_data = res.model_dump()
        summary_data = {
            "broken_flows": res.broken_flows_count,
            "rerouted_flows": res.rerouted_flows_count,
            "dropped_flows": res.dropped_flows_count,
            "isolated_devices_count": len(res.isolated_device_ids),
            "post_failure_partitions": res.post_failure_partitions_count
        }
        is_passed = (res.dropped_flows_count == 0 and len(res.isolated_device_ids) == len(failed_devs))

    elif run_type == SimulationType.TRAFFIC:
        res = simulate_traffic_flows(topology)
        detailed_data = res.model_dump()
        summary_data = {
            "total_offered_load_mbps": res.total_offered_load_mbps,
            "congested_links_count": res.congested_links_count,
            "saturated_links_count": res.saturated_links_count
        }
        is_passed = (res.congested_links_count == 0)

    elif run_type == SimulationType.REDUNDANCY:
        res = analyze_redundancy(topology)
        detailed_data = res.model_dump()
        summary_data = {
            "redundancy_score": res.redundancy_score,
            "articulation_devices_count": len(res.articulation_device_ids),
            "bridge_links_count": len(res.bridge_link_ids),
            "is_biconnected": res.is_biconnected
        }
        is_passed = (res.redundancy_score >= 70.0)

    # Persist in DB
    sim_run = SimulationRun(
        topology_id=topology.id,
        run_type=run_type,
        status="completed",
        parameters_json=json.dumps(parameters),
        executed_by_id=user_id
    )
    db.add(sim_run)
    db.flush()

    sim_result = SimulationResult(
        simulation_run_id=sim_run.id,
        is_passed=is_passed,
        summary_json=json.dumps(summary_data),
        detailed_metrics_json=json.dumps(detailed_data)
    )
    db.add(sim_result)
    db.commit()
    db.refresh(sim_run)

    return sim_run, detailed_data


class TupleSimulationResult:
    pass
