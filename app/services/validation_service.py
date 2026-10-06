"""Design validation rules and network health score calculation engine."""
from typing import Dict, List, Set
from app.models.topology import Topology
from app.models.device import Device, DeviceType
from app.models.interface import Interface
from app.schemas.validation import (
    ValidationIssue, DesignHealthReport, IssueSeverity
)
from app.services.ipam_service import detect_subnet_overlaps, detect_duplicate_ips
from app.simulation.redundancy import analyze_redundancy


def evaluate_design_health(topology: Topology) -> DesignHealthReport:
    """Run all enterprise validation rules and compute a design health score (0-100)."""
    issues: List[ValidationIssue] = []

    # Map interfaces and connected links
    interface_map: Dict[int, Interface] = {}
    device_interfaces: Dict[int, List[Interface]] = {}
    device_link_count: Dict[int, int] = {}

    for d in topology.devices:
        device_interfaces[d.id] = []
        device_link_count[d.id] = 0
        for iface in d.interfaces:
            interface_map[iface.id] = iface
            device_interfaces[d.id].append(iface)

    # 1. Check link speed mismatches & count device connections
    for link in topology.links:
        src_iface = interface_map.get(link.source_interface_id)
        tgt_iface = interface_map.get(link.target_interface_id)

        if src_iface and tgt_iface:
            device_link_count[src_iface.device_id] = device_link_count.get(src_iface.device_id, 0) + 1
            device_link_count[tgt_iface.device_id] = device_link_count.get(tgt_iface.device_id, 0) + 1

            # Speed mismatch rule
            if src_iface.speed_mbps != tgt_iface.speed_mbps:
                issues.append(ValidationIssue(
                    category="hardware",
                    severity=IssueSeverity.WARNING,
                    title="Link Speed Mismatch",
                    description=(
                        f"Link {link.id} connects interface '{src_iface.name}' ({src_iface.speed_mbps} Mbps) "
                        f"to '{tgt_iface.name}' ({tgt_iface.speed_mbps} Mbps)."
                    ),
                    affected_entity_type="link",
                    affected_entity_id=link.id,
                    remediation="Match port speeds or configure auto-negotiation and rate limiting to prevent buffer bloat."
                ))

            # Link status vs interface status
            if link.status.lower() == "up" and (src_iface.status.lower() == "down" or tgt_iface.status.lower() == "down"):
                issues.append(ValidationIssue(
                    category="topology",
                    severity=IssueSeverity.WARNING,
                    title="Link Active on Down Interface",
                    description=f"Link {link.id} is marked UP but one of its terminating interfaces is DOWN.",
                    affected_entity_type="link",
                    affected_entity_id=link.id,
                    remediation="Ensure both connecting interfaces are administratively UP."
                ))

    # 2. Check for isolated devices and missing redundant uplinks
    for device in topology.devices:
        conn_count = device_link_count.get(device.id, 0)
        
        # Rule: Isolated device
        if conn_count == 0:
            issues.append(ValidationIssue(
                category="topology",
                severity=IssueSeverity.CRITICAL,
                title="Isolated Network Device",
                description=f"Device '{device.name}' ({device.device_type}) has no physical links connected.",
                affected_entity_type="device",
                affected_entity_id=device.id,
                affected_entity_name=device.name,
                remediation=f"Connect '{device.name}' to a distribution or access switch."
            ))
        
        # Rule: No redundant uplinks for switches/routers
        elif conn_count == 1 and device.device_type in [
            DeviceType.L2_SWITCH, DeviceType.L3_SWITCH, DeviceType.ROUTER, DeviceType.FIREWALL
        ]:
            issues.append(ValidationIssue(
                category="redundancy",
                severity=IssueSeverity.WARNING,
                title="Single Uplink on Distribution/Access Device",
                description=f"Device '{device.name}' ({device.device_type}) has only 1 physical link, lacking uplink redundancy.",
                affected_entity_type="device",
                affected_entity_id=device.id,
                affected_entity_name=device.name,
                remediation=f"Add a redundant secondary uplink to a dual core/distribution node."
            ))

    # 3. Check for overlapping subnets
    overlaps = detect_subnet_overlaps(topology.subnets)
    for ov in overlaps:
        issues.append(ValidationIssue(
            category="ipam",
            severity=IssueSeverity.CRITICAL,
            title="Overlapping IP Subnets",
            description=ov["description"],
            affected_entity_type="subnet",
            affected_entity_id=ov["subnet1_id"],
            remediation="Reassign CIDR blocks using non-overlapping subnets or VLSM planner."
        ))

    # 4. Check for duplicate IP addresses
    duplicates = detect_duplicate_ips(topology)
    for dup in duplicates:
        ip = dup["ip_address"]
        desc_list = [f"{a['device_name']}:{a['interface_name']}" for a in dup["assignments"]]
        issues.append(ValidationIssue(
            category="ipam",
            severity=IssueSeverity.CRITICAL,
            title="Duplicate IP Address Conflict",
            description=f"IP address '{ip}' is configured on multiple interfaces: {', '.join(desc_list)}.",
            affected_entity_type="interface",
            affected_entity_id=dup["assignments"][0]["interface_id"],
            remediation=f"Change duplicate IP on conflicting interfaces so every host address is unique."
        ))

    # 5. Check redundancy and SPOF points
    if len(topology.devices) >= 3:
        redundancy_res = analyze_redundancy(topology)
        for nid in redundancy_res.articulation_device_ids:
            dev_name = next((d.name for d in topology.devices if d.id == nid), f"Device {nid}")
            issues.append(ValidationIssue(
                category="redundancy",
                severity=IssueSeverity.WARNING,
                title="Single Point of Failure (SPOF)",
                description=f"Device '{dev_name}' is a topological articulation point. If it goes down, the network partitions.",
                affected_entity_type="device",
                affected_entity_id=nid,
                affected_entity_name=dev_name,
                remediation=f"Add bypass or redundant cross-links around '{dev_name}' to establish a biconnected mesh."
            ))

    # 6. Calculate Health Score (0-100)
    score = 100
    critical_count = 0
    warning_count = 0
    info_count = 0

    for issue in issues:
        if issue.severity == IssueSeverity.CRITICAL:
            score -= 15
            critical_count += 1
        elif issue.severity == IssueSeverity.WARNING:
            score -= 5
            warning_count += 1
        elif issue.severity == IssueSeverity.INFO:
            score -= 2
            info_count += 1

    health_score = max(0, min(score, 100))

    if health_score >= 90:
        grade = "A+" if health_score >= 95 else "A"
    elif health_score >= 80:
        grade = "B"
    elif health_score >= 70:
        grade = "C"
    elif health_score >= 60:
        grade = "D"
    else:
        grade = "F"

    return DesignHealthReport(
        topology_id=topology.id,
        topology_name=topology.name,
        health_score=health_score,
        grade=grade,
        is_healthy=(health_score >= 75 and critical_count == 0),
        summary={
            "critical": critical_count,
            "warning": warning_count,
            "info": info_count,
            "total_issues": len(issues)
        },
        issues=issues
    )
