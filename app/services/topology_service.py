"""Topology service for lifecycle management, import/export, and prebuilt templates."""
import json
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
from app.models.topology import Topology
from app.models.device import Device, DeviceType, DeviceStatus
from app.models.interface import Interface, InterfaceStatus
from app.models.link import Link, LinkStatus
from app.models.ipam import Subnet, VLAN
from app.schemas.topology import (
    TopologyExportSchema, DeviceExportSchema, InterfaceExportSchema,
    LinkExportSchema, SubnetExportSchema, VLANExportSchema
)
from app.core.exceptions import EntityNotFoundException, ValidationException


def export_topology_to_dict(topology: Topology) -> Dict[str, Any]:
    """Export complete topology model into portable JSON-serializable dictionary."""
    dev_map = {d.id: d for d in topology.devices}
    iface_map = {}
    for d in topology.devices:
        for i in d.interfaces:
            iface_map[i.id] = (d, i)

    devices_data = []
    for d in topology.devices:
        ifaces_data = [
            InterfaceExportSchema(
                name=i.name,
                speed_mbps=i.speed_mbps,
                mac_address=i.mac_address,
                ip_address=i.ip_address,
                subnet_mask=i.subnet_mask,
                vlan_id=i.vlan_id,
                status=i.status,
                is_management=i.is_management
            )
            for i in d.interfaces
        ]
        devices_data.append(DeviceExportSchema(
            name=d.name,
            device_type=d.device_type,
            x_pos=d.x_pos,
            y_pos=d.y_pos,
            status=d.status,
            vendor=d.vendor,
            model=d.model,
            config_json=d.config_json,
            interfaces=ifaces_data
        ))

    links_data = []
    for l in topology.links:
        src_tuple = iface_map.get(l.source_interface_id)
        tgt_tuple = iface_map.get(l.target_interface_id)
        if src_tuple and tgt_tuple:
            src_dev, src_if = src_tuple
            tgt_dev, tgt_if = tgt_tuple
            links_data.append(LinkExportSchema(
                source_device_name=src_dev.name,
                source_interface_name=src_if.name,
                target_device_name=tgt_dev.name,
                target_interface_name=tgt_if.name,
                bandwidth_mbps=l.bandwidth_mbps,
                latency_ms=l.latency_ms,
                packet_loss_pct=l.packet_loss_pct,
                status=l.status,
                cost=l.cost,
                link_type=l.link_type
            ))

    subnets_data = [
        SubnetExportSchema(
            name=s.name,
            cidr=s.cidr,
            gateway_ip=s.gateway_ip,
            vlan_id=s.vlan_id,
            allocated_ips_json=s.allocated_ips_json,
            description=s.description
        )
        for s in topology.subnets
    ]

    vlans_data = [
        VLANExportSchema(
            vlan_id=v.vlan_id,
            name=v.name,
            description=v.description
        )
        for v in topology.vlans
    ]

    export_obj = TopologyExportSchema(
        name=topology.name,
        version=topology.version,
        description=f"Export of {topology.name}",
        metadata={"exported_version": topology.version},
        devices=devices_data,
        links=links_data,
        subnets=subnets_data,
        vlans=vlans_data
    )
    return export_obj.model_dump()


def import_topology_from_dict(db: Session, project_id: int, data: Dict[str, Any]) -> Topology:
    """Import topology dictionary and recreate all entities with relational integrity."""
    top_name = data.get("name", "Imported Topology")
    topology = Topology(
        project_id=project_id,
        name=top_name,
        version=1,
        is_active=True,
        metadata_json=json.dumps(data.get("metadata", {}))
    )
    db.add(topology)
    db.flush()

    # Recreate subnets
    for s_data in data.get("subnets", []):
        sub = Subnet(
            topology_id=topology.id,
            name=s_data.get("name", "Subnet"),
            cidr=s_data.get("cidr", "10.0.0.0/24"),
            gateway_ip=s_data.get("gateway_ip"),
            vlan_id=s_data.get("vlan_id"),
            allocated_ips_json=s_data.get("allocated_ips_json", "[]"),
            description=s_data.get("description")
        )
        db.add(sub)

    # Recreate VLANs
    for v_data in data.get("vlans", []):
        vlan = VLAN(
            topology_id=topology.id,
            vlan_id=v_data.get("vlan_id", 1),
            name=v_data.get("name", "Default"),
            description=v_data.get("description")
        )
        db.add(vlan)

    # Recreate devices and interfaces
    dev_name_to_obj: Dict[str, Device] = {}
    iface_lookup: Dict[str, Interface] = {}  # "dev_name:if_name" -> Interface

    for d_data in data.get("devices", []):
        dev = Device(
            topology_id=topology.id,
            name=d_data.get("name"),
            device_type=d_data.get("device_type", DeviceType.ROUTER),
            x_pos=float(d_data.get("x_pos", 0.0)),
            y_pos=float(d_data.get("y_pos", 0.0)),
            status=d_data.get("status", DeviceStatus.UP),
            vendor=d_data.get("vendor"),
            model=d_data.get("model"),
            config_json=d_data.get("config_json", "{}")
        )
        db.add(dev)
        db.flush()
        dev_name_to_obj[dev.name] = dev

        for i_data in d_data.get("interfaces", []):
            iface = Interface(
                device_id=dev.id,
                name=i_data.get("name"),
                speed_mbps=int(i_data.get("speed_mbps", 1000)),
                mac_address=i_data.get("mac_address"),
                ip_address=i_data.get("ip_address"),
                subnet_mask=i_data.get("subnet_mask"),
                vlan_id=i_data.get("vlan_id"),
                status=i_data.get("status", InterfaceStatus.UP),
                is_management=bool(i_data.get("is_management", False))
            )
            db.add(iface)
            db.flush()
            iface_lookup[f"{dev.name}:{iface.name}"] = iface

    # Recreate links
    for l_data in data.get("links", []):
        src_key = f"{l_data.get('source_device_name')}:{l_data.get('source_interface_name')}"
        tgt_key = f"{l_data.get('target_device_name')}:{l_data.get('target_interface_name')}"
        src_if = iface_lookup.get(src_key)
        tgt_if = iface_lookup.get(tgt_key)

        if src_if and tgt_if:
            link = Link(
                topology_id=topology.id,
                source_interface_id=src_if.id,
                target_interface_id=tgt_if.id,
                bandwidth_mbps=int(l_data.get("bandwidth_mbps", 1000)),
                latency_ms=float(l_data.get("latency_ms", 1.0)),
                packet_loss_pct=float(l_data.get("packet_loss_pct", 0.0)),
                status=l_data.get("status", LinkStatus.UP),
                cost=int(l_data.get("cost", 10)),
                link_type=l_data.get("link_type", "ethernet")
            )
            db.add(link)

    db.commit()
    db.refresh(topology)
    return topology


def get_template_definition(template_name: str) -> Dict[str, Any]:
    """Retrieve prebuilt network template definition."""
    template_name = template_name.lower().replace("-", "_").replace(" ", "_")

    if template_name in ["small_office", "smalloffice", "branch"]:
        return {
            "name": "Small Office Branch",
            "metadata": {"template": "small_office"},
            "subnets": [
                {"name": "Office LAN", "cidr": "192.168.10.0/24", "gateway_ip": "192.168.10.1", "vlan_id": 10},
                {"name": "Guest WiFi", "cidr": "192.168.20.0/24", "gateway_ip": "192.168.20.1", "vlan_id": 20}
            ],
            "vlans": [
                {"vlan_id": 10, "name": "Corporate-Data", "description": "Employee workstations and server"},
                {"vlan_id": 20, "name": "Guest-Wireless", "description": "Isolated guest network"}
            ],
            "devices": [
                {
                    "name": "Edge-Router-01",
                    "device_type": DeviceType.ROUTER,
                    "x_pos": 300,
                    "y_pos": 100,
                    "interfaces": [
                        {"name": "WAN0", "speed_mbps": 1000, "ip_address": "203.0.113.2", "status": "up"},
                        {"name": "LAN0", "speed_mbps": 1000, "ip_address": "192.168.1.1", "status": "up"}
                    ]
                },
                {
                    "name": "FW-01",
                    "device_type": DeviceType.FIREWALL,
                    "x_pos": 300,
                    "y_pos": 220,
                    "interfaces": [
                        {"name": "eth0-WAN", "speed_mbps": 1000, "ip_address": "192.168.1.2", "status": "up"},
                        {"name": "eth1-Trust", "speed_mbps": 1000, "ip_address": "192.168.10.1", "status": "up"}
                    ]
                },
                {
                    "name": "SW-Access-01",
                    "device_type": DeviceType.L2_SWITCH,
                    "x_pos": 300,
                    "y_pos": 360,
                    "interfaces": [
                        {"name": "Gi0/1-Uplink", "speed_mbps": 1000, "status": "up"},
                        {"name": "Gi0/2-AP", "speed_mbps": 1000, "status": "up", "vlan_id": 20},
                        {"name": "Gi0/3-Server", "speed_mbps": 1000, "status": "up", "vlan_id": 10},
                        {"name": "Gi0/4-PC1", "speed_mbps": 1000, "status": "up", "vlan_id": 10}
                    ]
                },
                {
                    "name": "AP-Office-01",
                    "device_type": DeviceType.ACCESS_POINT,
                    "x_pos": 150,
                    "y_pos": 500,
                    "interfaces": [
                        {"name": "Eth0", "speed_mbps": 1000, "ip_address": "192.168.20.10", "status": "up"}
                    ]
                },
                {
                    "name": "Server-File-01",
                    "device_type": DeviceType.SERVER,
                    "x_pos": 300,
                    "y_pos": 500,
                    "interfaces": [
                        {"name": "Eth0", "speed_mbps": 1000, "ip_address": "192.168.10.50", "status": "up"}
                    ]
                },
                {
                    "name": "Workstation-PC-01",
                    "device_type": DeviceType.ENDPOINT,
                    "x_pos": 450,
                    "y_pos": 500,
                    "interfaces": [
                        {"name": "Eth0", "speed_mbps": 1000, "ip_address": "192.168.10.101", "status": "up"}
                    ]
                }
            ],
            "links": [
                {
                    "source_device_name": "Edge-Router-01", "source_interface_name": "LAN0",
                    "target_device_name": "FW-01", "target_interface_name": "eth0-WAN",
                    "bandwidth_mbps": 1000, "latency_ms": 1.0, "cost": 5
                },
                {
                    "source_device_name": "FW-01", "source_interface_name": "eth1-Trust",
                    "target_device_name": "SW-Access-01", "target_interface_name": "Gi0/1-Uplink",
                    "bandwidth_mbps": 1000, "latency_ms": 1.0, "cost": 5
                },
                {
                    "source_device_name": "SW-Access-01", "source_interface_name": "Gi0/2-AP",
                    "target_device_name": "AP-Office-01", "target_interface_name": "Eth0",
                    "bandwidth_mbps": 1000, "latency_ms": 2.0, "cost": 10
                },
                {
                    "source_device_name": "SW-Access-01", "source_interface_name": "Gi0/3-Server",
                    "target_device_name": "Server-File-01", "target_interface_name": "Eth0",
                    "bandwidth_mbps": 1000, "latency_ms": 1.0, "cost": 10
                },
                {
                    "source_device_name": "SW-Access-01", "source_interface_name": "Gi0/4-PC1",
                    "target_device_name": "Workstation-PC-01", "target_interface_name": "Eth0",
                    "bandwidth_mbps": 1000, "latency_ms": 1.5, "cost": 10
                }
            ]
        }

    elif template_name in ["campus", "campus_network"]:
        return {
            "name": "Enterprise Campus Network",
            "metadata": {"template": "campus"},
            "subnets": [
                {"name": "Core Interlink", "cidr": "10.0.0.0/30", "gateway_ip": "10.0.0.1", "vlan_id": 100},
                {"name": "Engineering Subnet", "cidr": "10.10.0.0/24", "gateway_ip": "10.10.0.1", "vlan_id": 10},
                {"name": "Operations Subnet", "cidr": "10.20.0.0/24", "gateway_ip": "10.20.0.1", "vlan_id": 20},
                {"name": "DataCenter Farm", "cidr": "10.100.0.0/24", "gateway_ip": "10.100.0.1", "vlan_id": 50}
            ],
            "vlans": [
                {"vlan_id": 10, "name": "Engineering", "description": "R&D team LAN"},
                {"vlan_id": 20, "name": "Operations", "description": "Operations and Finance LAN"},
                {"vlan_id": 50, "name": "Server-Farm", "description": "Core Application Servers"},
                {"vlan_id": 100, "name": "Transit-Core", "description": "Core routing transit"}
            ],
            "devices": [
                {
                    "name": "Core-Router-01",
                    "device_type": DeviceType.ROUTER,
                    "x_pos": 250,
                    "y_pos": 100,
                    "interfaces": [
                        {"name": "TenGi0/0", "speed_mbps": 10000, "ip_address": "10.0.0.1", "status": "up"},
                        {"name": "TenGi0/1", "speed_mbps": 10000, "ip_address": "10.0.1.1", "status": "up"},
                        {"name": "TenGi0/2", "speed_mbps": 10000, "ip_address": "10.0.2.1", "status": "up"}
                    ]
                },
                {
                    "name": "Core-Router-02",
                    "device_type": DeviceType.ROUTER,
                    "x_pos": 450,
                    "y_pos": 100,
                    "interfaces": [
                        {"name": "TenGi0/0", "speed_mbps": 10000, "ip_address": "10.0.0.2", "status": "up"},
                        {"name": "TenGi0/1", "speed_mbps": 10000, "ip_address": "10.0.3.1", "status": "up"},
                        {"name": "TenGi0/2", "speed_mbps": 10000, "ip_address": "10.0.4.1", "status": "up"}
                    ]
                },
                {
                    "name": "Dist-L3Switch-01",
                    "device_type": DeviceType.L3_SWITCH,
                    "x_pos": 200,
                    "y_pos": 280,
                    "interfaces": [
                        {"name": "TenGi1/1", "speed_mbps": 10000, "ip_address": "10.0.1.2", "status": "up"},
                        {"name": "TenGi1/2", "speed_mbps": 10000, "ip_address": "10.0.3.2", "status": "up"},
                        {"name": "Gi1/3", "speed_mbps": 1000, "status": "up"},
                        {"name": "Gi1/4", "speed_mbps": 1000, "status": "up"}
                    ]
                },
                {
                    "name": "Dist-L3Switch-02",
                    "device_type": DeviceType.L3_SWITCH,
                    "x_pos": 500,
                    "y_pos": 280,
                    "interfaces": [
                        {"name": "TenGi1/1", "speed_mbps": 10000, "ip_address": "10.0.2.2", "status": "up"},
                        {"name": "TenGi1/2", "speed_mbps": 10000, "ip_address": "10.0.4.2", "status": "up"},
                        {"name": "Gi1/3", "speed_mbps": 1000, "status": "up"},
                        {"name": "Gi1/4", "speed_mbps": 1000, "status": "up"}
                    ]
                },
                {
                    "name": "Access-Switch-01",
                    "device_type": DeviceType.L2_SWITCH,
                    "x_pos": 150,
                    "y_pos": 460,
                    "interfaces": [
                        {"name": "Gi0/1", "speed_mbps": 1000, "status": "up"},
                        {"name": "Gi0/2", "speed_mbps": 1000, "status": "up"},
                        {"name": "Gi0/10", "speed_mbps": 1000, "status": "up", "vlan_id": 10}
                    ]
                },
                {
                    "name": "Access-Switch-02",
                    "device_type": DeviceType.L2_SWITCH,
                    "x_pos": 350,
                    "y_pos": 460,
                    "interfaces": [
                        {"name": "Gi0/1", "speed_mbps": 1000, "status": "up"},
                        {"name": "Gi0/2", "speed_mbps": 1000, "status": "up"},
                        {"name": "Gi0/10", "speed_mbps": 1000, "status": "up", "vlan_id": 20}
                    ]
                },
                {
                    "name": "DC-Server-Farm-01",
                    "device_type": DeviceType.SERVER,
                    "x_pos": 550,
                    "y_pos": 460,
                    "interfaces": [
                        {"name": "Eth0", "speed_mbps": 1000, "ip_address": "10.100.0.10", "status": "up"},
                        {"name": "Eth1", "speed_mbps": 1000, "ip_address": "10.100.0.11", "status": "up"}
                    ]
                },
                {
                    "name": "Eng-Workstation-01",
                    "device_type": DeviceType.ENDPOINT,
                    "x_pos": 150,
                    "y_pos": 620,
                    "interfaces": [
                        {"name": "Eth0", "speed_mbps": 1000, "ip_address": "10.100.0.25", "status": "up"}
                    ]
                }
            ],
            "links": [
                # Core Interlink
                {"source_device_name": "Core-Router-01", "source_interface_name": "TenGi0/0",
                 "target_device_name": "Core-Router-02", "target_interface_name": "TenGi0/0",
                 "bandwidth_mbps": 10000, "latency_ms": 0.5, "cost": 5},
                # Core to Dist 1
                {"source_device_name": "Core-Router-01", "source_interface_name": "TenGi0/1",
                 "target_device_name": "Dist-L3Switch-01", "target_interface_name": "TenGi1/1",
                 "bandwidth_mbps": 10000, "latency_ms": 1.0, "cost": 10},
                # Core 2 to Dist 1
                {"source_device_name": "Core-Router-02", "source_interface_name": "TenGi0/1",
                 "target_device_name": "Dist-L3Switch-01", "target_interface_name": "TenGi1/2",
                 "bandwidth_mbps": 10000, "latency_ms": 1.0, "cost": 10},
                # Core 1 to Dist 2
                {"source_device_name": "Core-Router-01", "source_interface_name": "TenGi0/2",
                 "target_device_name": "Dist-L3Switch-02", "target_interface_name": "TenGi1/1",
                 "bandwidth_mbps": 10000, "latency_ms": 1.0, "cost": 10},
                # Core 2 to Dist 2
                {"source_device_name": "Core-Router-02", "source_interface_name": "TenGi0/2",
                 "target_device_name": "Dist-L3Switch-02", "target_interface_name": "TenGi1/2",
                 "bandwidth_mbps": 10000, "latency_ms": 1.0, "cost": 10},
                # Dist 1 & 2 to Access 1
                {"source_device_name": "Dist-L3Switch-01", "source_interface_name": "Gi1/3",
                 "target_device_name": "Access-Switch-01", "target_interface_name": "Gi0/1",
                 "bandwidth_mbps": 1000, "latency_ms": 1.0, "cost": 10},
                {"source_device_name": "Dist-L3Switch-02", "source_interface_name": "Gi1/3",
                 "target_device_name": "Access-Switch-01", "target_interface_name": "Gi0/2",
                 "bandwidth_mbps": 1000, "latency_ms": 1.0, "cost": 10},
                # Dist 1 & 2 to Access 2
                {"source_device_name": "Dist-L3Switch-01", "source_interface_name": "Gi1/4",
                 "target_device_name": "Access-Switch-02", "target_interface_name": "Gi0/1",
                 "bandwidth_mbps": 1000, "latency_ms": 1.0, "cost": 10},
                {"source_device_name": "Dist-L3Switch-02", "source_interface_name": "Gi1/4",
                 "target_device_name": "Access-Switch-02", "target_interface_name": "Gi0/2",
                 "bandwidth_mbps": 1000, "latency_ms": 1.0, "cost": 10},
                # Access 1 to Endpoint
                {"source_device_name": "Access-Switch-01", "source_interface_name": "Gi0/10",
                 "target_device_name": "Eng-Workstation-01", "target_interface_name": "Eth0",
                 "bandwidth_mbps": 1000, "latency_ms": 1.5, "cost": 10},
                # Dist 2 to Server Farm
                {"source_device_name": "Dist-L3Switch-02", "source_interface_name": "Gi1/4",
                 "target_device_name": "DC-Server-Farm-01", "target_interface_name": "Eth0",
                 "bandwidth_mbps": 1000, "latency_ms": 0.8, "cost": 5}
            ]
        }

    elif template_name in ["datacenter", "data_center", "spine_leaf"]:
        return {
            "name": "Data Center Spine-Leaf Fabric",
            "metadata": {"template": "spine_leaf"},
            "subnets": [
                {"name": "Fabric Underlay", "cidr": "172.16.0.0/16", "gateway_ip": "172.16.0.1", "vlan_id": 4090},
                {"name": "Compute Pod A", "cidr": "10.240.1.0/24", "gateway_ip": "10.240.1.1", "vlan_id": 101},
                {"name": "Compute Pod B", "cidr": "10.240.2.0/24", "gateway_ip": "10.240.2.1", "vlan_id": 102}
            ],
            "vlans": [
                {"vlan_id": 101, "name": "Compute-Tier-A", "description": "Kubernetes worker nodes"},
                {"vlan_id": 102, "name": "Compute-Tier-B", "description": "Database clusters"}
            ],
            "devices": [
                {
                    "name": "Spine-01", "device_type": DeviceType.L3_SWITCH, "x_pos": 250, "y_pos": 100,
                    "interfaces": [
                        {"name": "HundredGig0/1", "speed_mbps": 100000, "status": "up"},
                        {"name": "HundredGig0/2", "speed_mbps": 100000, "status": "up"}
                    ]
                },
                {
                    "name": "Spine-02", "device_type": DeviceType.L3_SWITCH, "x_pos": 450, "y_pos": 100,
                    "interfaces": [
                        {"name": "HundredGig0/1", "speed_mbps": 100000, "status": "up"},
                        {"name": "HundredGig0/2", "speed_mbps": 100000, "status": "up"}
                    ]
                },
                {
                    "name": "Leaf-01", "device_type": DeviceType.L3_SWITCH, "x_pos": 200, "y_pos": 300,
                    "interfaces": [
                        {"name": "HundredGig0/1", "speed_mbps": 100000, "status": "up"},
                        {"name": "HundredGig0/2", "speed_mbps": 100000, "status": "up"},
                        {"name": "TwentyFiveGig0/1", "speed_mbps": 25000, "status": "up"}
                    ]
                },
                {
                    "name": "Leaf-02", "device_type": DeviceType.L3_SWITCH, "x_pos": 500, "y_pos": 300,
                    "interfaces": [
                        {"name": "HundredGig0/1", "speed_mbps": 100000, "status": "up"},
                        {"name": "HundredGig0/2", "speed_mbps": 100000, "status": "up"},
                        {"name": "TwentyFiveGig0/1", "speed_mbps": 25000, "status": "up"}
                    ]
                },
                {
                    "name": "BareMetal-Server-01", "device_type": DeviceType.SERVER, "x_pos": 200, "y_pos": 500,
                    "interfaces": [
                        {"name": "Eth0", "speed_mbps": 25000, "ip_address": "10.240.1.10", "status": "up"}
                    ]
                },
                {
                    "name": "BareMetal-Server-02", "device_type": DeviceType.SERVER, "x_pos": 500, "y_pos": 500,
                    "interfaces": [
                        {"name": "Eth0", "speed_mbps": 25000, "ip_address": "10.240.2.10", "status": "up"}
                    ]
                }
            ],
            "links": [
                # Spine 1 - Leaf 1
                {"source_device_name": "Spine-01", "source_interface_name": "HundredGig0/1",
                 "target_device_name": "Leaf-01", "target_interface_name": "HundredGig0/1",
                 "bandwidth_mbps": 100000, "latency_ms": 0.2, "cost": 1},
                # Spine 1 - Leaf 2
                {"source_device_name": "Spine-01", "source_interface_name": "HundredGig0/2",
                 "target_device_name": "Leaf-02", "target_interface_name": "HundredGig0/1",
                 "bandwidth_mbps": 100000, "latency_ms": 0.2, "cost": 1},
                # Spine 2 - Leaf 1
                {"source_device_name": "Spine-02", "source_interface_name": "HundredGig0/1",
                 "target_device_name": "Leaf-01", "target_interface_name": "HundredGig0/2",
                 "bandwidth_mbps": 100000, "latency_ms": 0.2, "cost": 1},
                # Spine 2 - Leaf 2
                {"source_device_name": "Spine-02", "source_interface_name": "HundredGig0/2",
                 "target_device_name": "Leaf-02", "target_interface_name": "HundredGig0/2",
                 "bandwidth_mbps": 100000, "latency_ms": 0.2, "cost": 1},
                # Leaf 1 - Server 1
                {"source_device_name": "Leaf-01", "source_interface_name": "TwentyFiveGig0/1",
                 "target_device_name": "BareMetal-Server-01", "target_interface_name": "Eth0",
                 "bandwidth_mbps": 25000, "latency_ms": 0.4, "cost": 5},
                # Leaf 2 - Server 2
                {"source_device_name": "Leaf-02", "source_interface_name": "TwentyFiveGig0/1",
                 "target_device_name": "BareMetal-Server-02", "target_interface_name": "Eth0",
                 "bandwidth_mbps": 25000, "latency_ms": 0.4, "cost": 5}
            ]
        }
    else:
        raise ValidationException(f"Unknown template: '{template_name}'. Choose from 'campus', 'small_office', 'datacenter'.")
