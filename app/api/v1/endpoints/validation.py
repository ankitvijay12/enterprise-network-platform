"""Validation endpoints."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api.deps import get_current_user
from app.core.exceptions import EntityNotFoundException
from app.database.session import get_db
from app.models.topology import Topology
from app.models.user import User
from app.schemas.validation import DesignHealthReport
from app.services.validation_service import evaluate_design_health

router = APIRouter()


@router.get("/{topology_id}", response_model=DesignHealthReport)
def validate_topology_design(
    topology_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Evaluate network design health rules and return health score (0-100) with categorized issues."""
    top = db.query(Topology).filter(Topology.id == topology_id).first()
    if not top:
        raise EntityNotFoundException("Topology", topology_id)

    return evaluate_design_health(top)
