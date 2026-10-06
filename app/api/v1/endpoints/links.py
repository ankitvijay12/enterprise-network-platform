"""Link management endpoints."""
from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, require_role
from app.core.exceptions import EntityNotFoundException, ValidationException
from app.database.session import get_db
from app.models.interface import Interface
from app.models.link import Link, LinkStatus
from app.models.topology import Topology
from app.models.user import User, UserRole
from app.schemas.link import LinkCreate, LinkResponse, LinkUpdate

router = APIRouter()


@router.get("/by-topology/{topology_id}", response_model=List[LinkResponse])
def list_links(
    topology_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all links in a topology."""
    links = db.query(Link).filter(Link.topology_id == topology_id).all()
    return links


@router.post("", response_model=LinkResponse, status_code=status.HTTP_201_CREATED)
def create_link(
    link_in: LinkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.ENGINEER]))
):
    """Create a connection link between two device interfaces."""
    top = db.query(Topology).filter(Topology.id == link_in.topology_id).first()
    if not top:
        raise EntityNotFoundException("Topology", link_in.topology_id)

    src_if = db.query(Interface).filter(Interface.id == link_in.source_interface_id).first()
    tgt_if = db.query(Interface).filter(Interface.id == link_in.target_interface_id).first()

    if not src_if:
        raise EntityNotFoundException("Source Interface", link_in.source_interface_id)
    if not tgt_if:
        raise EntityNotFoundException("Target Interface", link_in.target_interface_id)

    if src_if.device_id == tgt_if.device_id:
        raise ValidationException("Cannot link an interface to the same device (self-loop).")

    link = Link(
        topology_id=link_in.topology_id,
        source_interface_id=link_in.source_interface_id,
        target_interface_id=link_in.target_interface_id,
        bandwidth_mbps=link_in.bandwidth_mbps,
        latency_ms=link_in.latency_ms,
        packet_loss_pct=link_in.packet_loss_pct,
        status=link_in.status,
        cost=link_in.cost,
        link_type=link_in.link_type
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


@router.put("/{link_id}", response_model=LinkResponse)
def update_link(
    link_id: int,
    link_in: LinkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.ENGINEER]))
):
    """Update link parameters (bandwidth, latency, cost, status)."""
    link = db.query(Link).filter(Link.id == link_id).first()
    if not link:
        raise EntityNotFoundException("Link", link_id)

    for field, value in link_in.model_dump(exclude_unset=True).items():
        setattr(link, field, value)

    db.commit()
    db.refresh(link)
    return link


@router.delete("/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_link(
    link_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.ENGINEER]))
):
    """Delete a link."""
    link = db.query(Link).filter(Link.id == link_id).first()
    if not link:
        raise EntityNotFoundException("Link", link_id)

    db.delete(link)
    db.commit()
    return None
