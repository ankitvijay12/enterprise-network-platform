"""Device management endpoints."""
from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, require_role
from app.core.exceptions import EntityNotFoundException
from app.database.session import get_db
from app.models.device import Device, DeviceStatus
from app.models.topology import Topology
from app.models.user import User, UserRole
from app.schemas.device import DeviceCreate, DeviceResponse, DeviceUpdate

router = APIRouter()


@router.get("/by-topology/{topology_id}", response_model=List[DeviceResponse])
def list_devices(
    topology_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all devices with interfaces in a topology."""
    devices = db.query(Device).filter(Device.topology_id == topology_id).all()
    return devices


@router.post("", response_model=DeviceResponse, status_code=status.HTTP_201_CREATED)
def create_device(
    dev_in: DeviceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.ENGINEER]))
):
    """Add a new device to a topology."""
    topology = db.query(Topology).filter(Topology.id == dev_in.topology_id).first()
    if not topology:
        raise EntityNotFoundException("Topology", dev_in.topology_id)

    dev = Device(
        topology_id=dev_in.topology_id,
        name=dev_in.name,
        device_type=dev_in.device_type,
        x_pos=dev_in.x_pos,
        y_pos=dev_in.y_pos,
        status=dev_in.status,
        vendor=dev_in.vendor,
        model=dev_in.model,
        config_json=dev_in.config_json
    )
    db.add(dev)
    db.commit()
    db.refresh(dev)
    return dev


@router.get("/{device_id}", response_model=DeviceResponse)
def get_device(
    device_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get single device details."""
    dev = db.query(Device).filter(Device.id == device_id).first()
    if not dev:
        raise EntityNotFoundException("Device", device_id)
    return dev


@router.put("/{device_id}", response_model=DeviceResponse)
def update_device(
    device_id: int,
    dev_in: DeviceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.ENGINEER]))
):
    """Update device properties or coordinates."""
    dev = db.query(Device).filter(Device.id == device_id).first()
    if not dev:
        raise EntityNotFoundException("Device", device_id)

    for field, value in dev_in.model_dump(exclude_unset=True).items():
        setattr(dev, field, value)

    db.commit()
    db.refresh(dev)
    return dev


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_device(
    device_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.ENGINEER]))
):
    """Delete a device and cascade to its interfaces and connected links."""
    dev = db.query(Device).filter(Device.id == device_id).first()
    if not dev:
        raise EntityNotFoundException("Device", device_id)

    db.delete(dev)
    db.commit()
    return None
