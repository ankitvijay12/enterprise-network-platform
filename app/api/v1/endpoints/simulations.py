"""Simulation endpoints: Routing, Reachability, Failures, Traffic, and Redundancy."""
from typing import Any, Dict, List
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, require_role
from app.core.exceptions import EntityNotFoundException
from app.database.session import get_db
from app.models.simulation import SimulationRun, SimulationType, TrafficFlow
from app.models.topology import Topology
from app.models.user import User, UserRole
from app.schemas.simulation import (
    PathSimulationRequest, PathSimulationResult,
    ReachabilitySimulationResult,
    FailureSimulationRequest, FailureSimulationResult,
    TrafficSimulationRequest, TrafficSimulationResult,
    RedundancySimulationResult, SimulationRunResponse,
    TrafficFlowCreate, TrafficFlowResponse
)
from app.simulation.runner import run_and_persist_simulation
from app.simulation.routing import compute_shortest_path, compute_reachability_matrix
from app.simulation.failure_engine import simulate_network_failures
from app.simulation.traffic_engine import simulate_traffic_flows
from app.simulation.redundancy import analyze_redundancy
import json

router = APIRouter()


# --- Traffic Flows CRUD ---

@router.get("/traffic-flows/by-topology/{topology_id}", response_model=List[TrafficFlowResponse])
def list_traffic_flows(
    topology_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List defined traffic flows for a topology."""
    return db.query(TrafficFlow).filter(TrafficFlow.topology_id == topology_id).all()


@router.post("/traffic-flows", response_model=TrafficFlowResponse, status_code=status.HTTP_201_CREATED)
def create_traffic_flow(
    flow_in: TrafficFlowCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.ENGINEER]))
):
    """Define a persistent traffic flow requirement."""
    top = db.query(Topology).filter(Topology.id == flow_in.topology_id).first()
    if not top:
        raise EntityNotFoundException("Topology", flow_in.topology_id)

    tf = TrafficFlow(
        topology_id=flow_in.topology_id,
        name=flow_in.name,
        source_device_id=flow_in.source_device_id,
        target_device_id=flow_in.target_device_id,
        demand_mbps=flow_in.demand_mbps,
        protocol=flow_in.protocol,
        priority=flow_in.priority
    )
    db.add(tf)
    db.commit()
    db.refresh(tf)
    return tf


@router.delete("/traffic-flows/{flow_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_traffic_flow(
    flow_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.ENGINEER]))
):
    """Delete a traffic flow."""
    tf = db.query(TrafficFlow).filter(TrafficFlow.id == flow_id).first()
    if not tf:
        raise EntityNotFoundException("TrafficFlow", flow_id)
    db.delete(tf)
    db.commit()
    return None


# --- Simulation Executions ---

@router.post("/path", response_model=PathSimulationResult)
def simulate_path(
    req: PathSimulationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.ENGINEER]))
):
    """Compute Dijkstra shortest path between any two devices and persist run."""
    top = db.query(Topology).filter(Topology.id == req.topology_id).first()
    if not top:
        raise EntityNotFoundException("Topology", req.topology_id)

    sim_run, details = run_and_persist_simulation(
        db=db,
        topology=top,
        run_type=SimulationType.PATH,
        parameters=req.model_dump(),
        user_id=current_user.id
    )
    return details


@router.post("/reachability/{topology_id}", response_model=ReachabilitySimulationResult)
def simulate_reachability(
    topology_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.ENGINEER]))
):
    """Compute all-pairs reachability matrix for the topology."""
    top = db.query(Topology).filter(Topology.id == topology_id).first()
    if not top:
        raise EntityNotFoundException("Topology", topology_id)

    sim_run, details = run_and_persist_simulation(
        db=db,
        topology=top,
        run_type=SimulationType.REACHABILITY,
        parameters={"topology_id": topology_id},
        user_id=current_user.id
    )
    return details


@router.post("/failure", response_model=FailureSimulationResult)
def simulate_failure(
    req: FailureSimulationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.ENGINEER]))
):
    """Simulate link or device outages and report impact, reroutes, and partitions."""
    top = db.query(Topology).filter(Topology.id == req.topology_id).first()
    if not top:
        raise EntityNotFoundException("Topology", req.topology_id)

    sim_run, details = run_and_persist_simulation(
        db=db,
        topology=top,
        run_type=SimulationType.FAILURE,
        parameters=req.model_dump(),
        user_id=current_user.id
    )
    return details


@router.post("/traffic", response_model=TrafficSimulationResult)
def simulate_traffic(
    req: TrafficSimulationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.ENGINEER]))
):
    """Simulate multi-commodity traffic flows and compute per-link utilization and queuing delay."""
    top = db.query(Topology).filter(Topology.id == req.topology_id).first()
    if not top:
        raise EntityNotFoundException("Topology", req.topology_id)

    sim_run, details = run_and_persist_simulation(
        db=db,
        topology=top,
        run_type=SimulationType.TRAFFIC,
        parameters=req.model_dump(),
        user_id=current_user.id
    )
    return details


@router.post("/redundancy/{topology_id}", response_model=RedundancySimulationResult)
def simulate_redundancy(
    topology_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.ENGINEER]))
):
    """Analyze redundancy, detect articulation points and bridges (SPOFs), and score resilience."""
    top = db.query(Topology).filter(Topology.id == topology_id).first()
    if not top:
        raise EntityNotFoundException("Topology", topology_id)

    sim_run, details = run_and_persist_simulation(
        db=db,
        topology=top,
        run_type=SimulationType.REDUNDANCY,
        parameters={"topology_id": topology_id},
        user_id=current_user.id
    )
    return details


@router.get("/history/{topology_id}", response_model=List[SimulationRunResponse])
def get_simulation_history(
    topology_id: int,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve historical simulation runs and result summaries."""
    runs = db.query(SimulationRun).filter(
        SimulationRun.topology_id == topology_id
    ).order_by(SimulationRun.created_at.desc()).limit(limit).all()

    res = []
    for r in runs:
        summary_obj = None
        if r.result:
            try:
                summary_obj = json.loads(r.result.summary_json)
            except Exception:
                summary_obj = {}

        res.append(SimulationRunResponse(
            id=r.id,
            topology_id=r.topology_id,
            run_type=r.run_type,
            status=r.status,
            parameters_json=r.parameters_json,
            executed_by_id=r.executed_by_id,
            created_at=r.created_at,
            result_summary=summary_obj
        ))
    return res
