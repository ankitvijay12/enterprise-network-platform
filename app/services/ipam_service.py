"""IP Address Management (IPAM) and VLSM calculation service."""
import ipaddress
import math
from typing import Dict, List, Optional, Set, Tuple
from sqlalchemy.orm import Session
from app.models.ipam import Subnet, VLAN
from app.models.topology import Topology
from app.schemas.ipam import (
    VLSMRequest, VLSMResponse, VLSMAllocatedSubnet, VLSMDepartmentRequirement
)
from app.core.exceptions import ValidationException


def detect_subnet_overlaps(subnets: List[Subnet]) -> List[Dict[str, str]]:
    """Detect overlapping CIDR blocks among subnets in a topology."""
    overlaps = []
    networks = []
    for s in subnets:
        try:
            net = ipaddress.ip_network(s.cidr, strict=False)
            networks.append((s, net))
        except ValueError:
            continue

    for i in range(len(networks)):
        for j in range(i + 1, len(networks)):
            s1, net1 = networks[i]
            s2, net2 = networks[j]
            if net1.overlaps(net2):
                overlaps.append({
                    "subnet1_id": s1.id,
                    "subnet1_name": s1.name,
                    "subnet1_cidr": s1.cidr,
                    "subnet2_id": s2.id,
                    "subnet2_name": s2.name,
                    "subnet2_cidr": s2.cidr,
                    "description": f"Subnet '{s1.name}' ({s1.cidr}) overlaps with '{s2.name}' ({s2.cidr})"
                })
    return overlaps


def detect_duplicate_ips(topology: Topology) -> List[Dict[str, str]]:
    """Detect duplicate IP address assignments across device interfaces."""
    ip_to_ifaces: Dict[str, List[Dict[str, str]]] = {}
    
    for dev in topology.devices:
        for iface in dev.interfaces:
            if iface.ip_address and iface.ip_address.strip():
                clean_ip = iface.ip_address.strip()
                if clean_ip not in ip_to_ifaces:
                    ip_to_ifaces[clean_ip] = []
                ip_to_ifaces[clean_ip].append({
                    "device_id": dev.id,
                    "device_name": dev.name,
                    "interface_id": iface.id,
                    "interface_name": iface.name
                })

    duplicates = []
    for ip, assignments in ip_to_ifaces.items():
        if len(assignments) > 1:
            duplicates.append({
                "ip_address": ip,
                "assignments": assignments,
                "count": len(assignments)
            })
    return duplicates


def allocate_next_available_ip(subnet_cidr: str, currently_allocated: List[str]) -> Optional[str]:
    """Auto-allocate the next available usable host IP in a subnet CIDR."""
    try:
        network = ipaddress.ip_network(subnet_cidr, strict=False)
    except ValueError:
        return None

    allocated_set = set(currently_allocated)
    # Exclude network address and broadcast
    for host in network.hosts():
        host_str = str(host)
        if host_str not in allocated_set:
            return host_str
    return None


def calculate_vlsm(request: VLSMRequest) -> VLSMResponse:
    """Calculate Variable Length Subnet Mask (VLSM) allocation for given department host requirements."""
    try:
        major_net = ipaddress.ip_network(request.major_network, strict=False)
    except ValueError as e:
        raise ValidationException(f"Invalid major network CIDR: {request.major_network}")

    # Sort departments by needed host count descending (VLSM rule)
    sorted_depts = sorted(request.departments, key=lambda d: d.needed_hosts, reverse=True)

    allocated_subnets: List[VLSMAllocatedSubnet] = []
    current_address = int(major_net.network_address)
    major_end_address = int(major_net.broadcast_address)
    total_requested = 0
    total_capacity = 0

    for dept in sorted_depts:
        needed = dept.needed_hosts
        total_requested += needed

        # Usable hosts = 2^(32 - prefix) - 2 >= needed
        # Required size = needed + 2 (network + broadcast)
        host_bits = math.ceil(math.log2(needed + 2))
        prefix_len = 32 - host_bits
        allocated_hosts = (2 ** host_bits) - 2

        # Check alignment of current address with block size
        block_size = 2 ** host_bits
        if current_address % block_size != 0:
            # Advance to next block boundary
            current_address = ((current_address // block_size) + 1) * block_size

        if current_address + block_size - 1 > major_end_address:
            raise ValidationException(
                f"Insufficient address space in {request.major_network} to allocate {needed} hosts for '{dept.name}'"
            )

        sub_net = ipaddress.ip_network((current_address, prefix_len))
        hosts_list = list(sub_net.hosts())

        allocated_subnets.append(VLSMAllocatedSubnet(
            name=dept.name,
            needed_hosts=needed,
            allocated_hosts=allocated_hosts,
            network_address=str(sub_net.network_address),
            prefix_length=prefix_len,
            subnet_mask=str(sub_net.netmask),
            usable_range_start=str(hosts_list[0]) if hosts_list else str(sub_net.network_address),
            usable_range_end=str(hosts_list[-1]) if hosts_list else str(sub_net.broadcast_address),
            broadcast_address=str(sub_net.broadcast_address),
            wasted_hosts=allocated_hosts - needed
        ))

        total_capacity += allocated_hosts
        current_address += block_size

    unallocated_space = []
    if current_address <= major_end_address:
        unallocated_space.append(f"{ipaddress.ip_address(current_address)} - {major_net.broadcast_address}")

    return VLSMResponse(
        major_network=str(major_net),
        total_requested_hosts=total_requested,
        total_allocated_capacity=total_capacity,
        subnets=allocated_subnets,
        unallocated_space=unallocated_space
    )
