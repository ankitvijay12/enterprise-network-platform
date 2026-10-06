"""IP Address Management (IPAM) and VLSM calculator endpoints."""
from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, require_role
from app.core.exceptions import ConflictException, EntityNotFoundException, ValidationException
from app.database.session import get_db
from app.models.ipam import Subnet, VLAN
from app.models.topology import Topology
from app.models.user import User, UserRole
from app.schemas.ipam import (
    SubnetCreate, SubnetResponse, SubnetUpdate,
    VLANCreate, VLANResponse, VLANUpdate,
    VLSMRequest, VLSMResponse
)
from app.services.ipam_service import calculate_vlsm, allocate_next_available_ip
import json

router = APIRouter()


# --- Subnets ---

@router.get("/subnets/by-topology/{topology_id}", response_model=List[SubnetResponse])
def list_subnets(
    topology_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all configured subnets in a topology."""
    return db.query(Subnet).filter(Subnet.topology_id == topology_id).all()


@router.post("/subnets", response_model=SubnetResponse, status_code=status.HTTP_201_CREATED)
def create_subnet(
    subnet_in: SubnetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.ENGINEER]))
):
    """Create a new subnet."""
    top = db.query(Topology).filter(Topology.id == subnet_in.topology_id).first()
    if not top:
        raise EntityNotFoundException("Topology", subnet_in.topology_id)

    sub = Subnet(
        topology_id=subnet_in.topology_id,
        name=subnet_in.name,
        cidr=subnet_in.cidr,
        gateway_ip=subnet_in.gateway_ip,
        vlan_id=subnet_in.vlan_id,
        allocated_ips_json=subnet_in.allocated_ips_json or "[]",
        description=subnet_in.description
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


@router.post("/subnets/{subnet_id}/allocate-ip", response_model=dict)
def auto_allocate_ip(
    subnet_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.ENGINEER]))
):
    """Auto-allocate next available host IP in the given subnet."""
    sub = db.query(Subnet).filter(Subnet.id == subnet_id).first()
    if not sub:
        raise EntityNotFoundException("Subnet", subnet_id)

    try:
        allocated = json.loads(sub.allocated_ips_json)
    except Exception:
        allocated = []

    next_ip = allocate_next_available_ip(sub.cidr, allocated)
    if not next_ip:
        raise ValidationException(f"Subnet '{sub.cidr}' has exhausted all available host addresses.")

    allocated.append(next_ip)
    sub.allocated_ips_json = json.dumps(allocated)
    db.commit()

    return {"allocated_ip": next_ip, "subnet_id": sub.id, "cidr": sub.cidr}


@router.delete("/subnets/{subnet_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subnet(
    subnet_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.ENGINEER]))
):
    """Delete a subnet."""
    sub = db.query(Subnet).filter(Subnet.id == subnet_id).first()
    if not sub:
        raise EntityNotFoundException("Subnet", subnet_id)
    db.delete(sub)
    db.commit()
    return None


# --- VLANs ---

@router.get("/vlans/by-topology/{topology_id}", response_model=List[VLANResponse])
def list_vlans(
    topology_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all VLANs in a topology."""
    return db.query(VLAN).filter(VLAN.topology_id == topology_id).all()


@router.post("/vlans", response_model=VLANResponse, status_code=status.HTTP_201_CREATED)
def create_vlan(
    vlan_in: VLANCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.ENGINEER]))
):
    """Create a new VLAN with validation (1-4094, unique per topology)."""
    top = db.query(Topology).filter(Topology.id == vlan_in.topology_id).first()
    if not top:
        raise EntityNotFoundException("Topology", vlan_in.topology_id)

    existing = db.query(VLAN).filter(
        VLAN.topology_id == vlan_in.topology_id,
        VLAN.vlan_id == vlan_in.vlan_id
    ).first()
    if existing:
        raise ConflictException(f"VLAN ID {vlan_in.vlan_id} already exists in this topology.")

    vlan = VLAN(
        topology_id=vlan_in.topology_id,
        vlan_id=vlan_in.vlan_id,
        name=vlan_in.name,
        description=vlan_in.description
    )
    db.add(vlan)
    db.commit()
    db.refresh(vlan)
    return vlan


@router.delete("/vlans/{vlan_record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vlan(
    vlan_record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.ENGINEER]))
):
    """Delete a VLAN record."""
    vlan = db.query(VLAN).filter(VLAN.id == vlan_record_id).first()
    if not vlan:
        raise EntityNotFoundException("VLAN", vlan_record_id)
    db.delete(vlan)
    db.commit()
    return None


# --- VLSM Calculator ---

@router.post("/vlsm/calculate", response_model=VLSMResponse)
def calculate_vlsm_plan(
    req: VLSMRequest,
    current_user: User = Depends(get_current_user)
):
    """Calculate Variable-Length Subnet Masking (VLSM) for department host requirements."""
    return calculate_vlsm(req)
