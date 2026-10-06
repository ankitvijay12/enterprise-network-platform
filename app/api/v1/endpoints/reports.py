"""Reporting endpoints."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api.deps import get_current_user
from app.core.exceptions import EntityNotFoundException
from app.database.session import get_db
from app.models.topology import Topology
from app.models.user import User
from app.schemas.reports import TopologyReportResponse
from app.services.report_service import generate_topology_summary_report

router = APIRouter()


@router.get("/summary/{topology_id}", response_model=TopologyReportResponse)
def get_network_summary_report(
    topology_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Generate comprehensive topology summary report covering devices, health score, and redundancy."""
    top = db.query(Topology).filter(Topology.id == topology_id).first()
    if not top:
        raise EntityNotFoundException("Topology", topology_id)

    return generate_topology_summary_report(db, top)
