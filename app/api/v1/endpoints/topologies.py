"""Topology management endpoints: CRUD, JSON Export/Import, and Template instantiation."""
from typing import Any, Dict, List
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, require_role
from app.core.exceptions import EntityNotFoundException, ForbiddenException
from app.database.session import get_db
from app.models.project import Project
from app.models.topology import Topology
from app.models.user import User, UserRole
from app.schemas.topology import (
    TopologyCreate, TopologyResponse, TopologyUpdate, TopologyExportSchema
)
from app.services.topology_service import (
    export_topology_to_dict, import_topology_from_dict, get_template_definition
)

router = APIRouter()


@router.get("/by-project/{project_id}", response_model=List[TopologyResponse])
def list_project_topologies(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all topologies belonging to a project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise EntityNotFoundException("Project", project_id)

    topologies = db.query(Topology).filter(Topology.project_id == project_id).order_by(Topology.version.desc()).all()
    res = []
    for t in topologies:
        res.append(TopologyResponse(
            id=t.id,
            project_id=t.project_id,
            name=t.name,
            version=t.version,
            is_active=t.is_active,
            metadata_json=t.metadata_json,
            devices_count=len(t.devices),
            links_count=len(t.links),
            created_at=t.created_at,
            updated_at=t.updated_at
        ))
    return res


@router.post("", response_model=TopologyResponse, status_code=status.HTTP_201_CREATED)
def create_topology(
    topology_in: TopologyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.ENGINEER]))
):
    """Create a new empty network topology."""
    project = db.query(Project).filter(Project.id == topology_in.project_id).first()
    if not project:
        raise EntityNotFoundException("Project", topology_in.project_id)

    topology = Topology(
        project_id=topology_in.project_id,
        name=topology_in.name,
        version=topology_in.version,
        is_active=topology_in.is_active,
        metadata_json=topology_in.metadata_json
    )
    db.add(topology)
    db.commit()
    db.refresh(topology)
    return TopologyResponse(
        id=topology.id,
        project_id=topology.project_id,
        name=topology.name,
        version=topology.version,
        is_active=topology.is_active,
        metadata_json=topology.metadata_json,
        devices_count=0,
        links_count=0,
        created_at=topology.created_at,
        updated_at=topology.updated_at
    )


@router.get("/{topology_id}", response_model=TopologyResponse)
def get_topology(
    topology_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get topology metadata and counts."""
    topology = db.query(Topology).filter(Topology.id == topology_id).first()
    if not topology:
        raise EntityNotFoundException("Topology", topology_id)

    return TopologyResponse(
        id=topology.id,
        project_id=topology.project_id,
        name=topology.name,
        version=topology.version,
        is_active=topology.is_active,
        metadata_json=topology.metadata_json,
        devices_count=len(topology.devices),
        links_count=len(topology.links),
        created_at=topology.created_at,
        updated_at=topology.updated_at
    )


@router.get("/{topology_id}/export", response_model=Dict[str, Any])
def export_topology(
    topology_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Export complete topology as structured JSON."""
    topology = db.query(Topology).filter(Topology.id == topology_id).first()
    if not topology:
        raise EntityNotFoundException("Topology", topology_id)

    return export_topology_to_dict(topology)


@router.post("/import/{project_id}", response_model=TopologyResponse, status_code=status.HTTP_201_CREATED)
def import_topology(
    project_id: int,
    import_payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.ENGINEER]))
):
    """Import full topology structure from JSON into project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise EntityNotFoundException("Project", project_id)

    new_topology = import_topology_from_dict(db, project_id, import_payload)
    return TopologyResponse(
        id=new_topology.id,
        project_id=new_topology.project_id,
        name=new_topology.name,
        version=new_topology.version,
        is_active=new_topology.is_active,
        metadata_json=new_topology.metadata_json,
        devices_count=len(new_topology.devices),
        links_count=len(new_topology.links),
        created_at=new_topology.created_at,
        updated_at=new_topology.updated_at
    )


@router.post("/template/{project_id}/{template_name}", response_model=TopologyResponse, status_code=status.HTTP_201_CREATED)
def instantiate_template(
    project_id: int,
    template_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.ENGINEER]))
):
    """Load a prebuilt enterprise network template (small_office, campus, datacenter)."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise EntityNotFoundException("Project", project_id)

    template_dict = get_template_definition(template_name)
    new_topology = import_topology_from_dict(db, project_id, template_dict)

    return TopologyResponse(
        id=new_topology.id,
        project_id=new_topology.project_id,
        name=new_topology.name,
        version=new_topology.version,
        is_active=new_topology.is_active,
        metadata_json=new_topology.metadata_json,
        devices_count=len(new_topology.devices),
        links_count=len(new_topology.links),
        created_at=new_topology.created_at,
        updated_at=new_topology.updated_at
    )


@router.delete("/{topology_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_topology(
    topology_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.ENGINEER]))
):
    """Delete topology and all its child components."""
    topology = db.query(Topology).filter(Topology.id == topology_id).first()
    if not topology:
        raise EntityNotFoundException("Topology", topology_id)

    db.delete(topology)
    db.commit()
    return None
