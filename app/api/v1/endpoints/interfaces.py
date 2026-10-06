"""Interface management endpoints."""
from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, require_role
from app.core.exceptions import EntityNotFoundException
from app.database.session import get_db
from app.models.device import Device
from app.models.interface import Interface
from app.models.user import User, UserRole
from app.schemas.interface import InterfaceCreate, InterfaceResponse, InterfaceUpdate

router = APIRouter()


@router.get("/by-device/{device_id}", response_model=List[InterfaceResponse])
def list_interfaces(
    device_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all ports/interfaces for a device."""
    interfaces = db.query(Interface).filter(Interface.device_id == device_id).all()
    return interfaces


@router.post("", response_model=InterfaceResponse, status_code=status.HTTP_201_CREATED)
def create_interface(
    iface_in: InterfaceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.ENGINEER]))
):
    """Add a new interface port to a device."""
    dev = db.query(Device).filter(Device.id == iface_in.device_id).first()
    if not dev:
        raise EntityNotFoundException("Device", iface_in.device_id)

    iface = Interface(
        device_id=iface_in.device_id,
        name=iface_in.name,
        speed_mbps=iface_in.speed_mbps,
        mac_address=iface_in.mac_address,
        ip_address=iface_in.ip_address,
        subnet_mask=iface_in.subnet_mask,
        vlan_id=iface_in.vlan_id,
        status=iface_in.status,
        is_management=iface_in.is_management
    )
    db.add(iface)
    db.commit()
    db.refresh(iface)
    return iface


@router.put("/{interface_id}", response_model=InterfaceResponse)
def update_interface(
    interface_id: int,
    iface_in: InterfaceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.ENGINEER]))
):
    """Update interface properties (IP, VLAN, status, speed)."""
    iface = db.query(Interface).filter(Interface.id == interface_id).first()
    if not iface:
        raise EntityNotFoundException("Interface", interface_id)

    for field, value in iface_in.model_dump(exclude_unset=True).items():
        setattr(iface, field, value)

    db.commit()
    db.refresh(iface)
    return iface


@router.delete("/{interface_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_interface(
    interface_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.ENGINEER]))
):
    """Delete an interface."""
    iface = db.query(Interface).filter(Interface.id == interface_id).first()
    if not iface:
        raise EntityNotFoundException("Interface", interface_id)

    db.delete(iface)
    db.commit()
    return None
