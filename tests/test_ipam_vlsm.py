"""Tests for IPAM and VLSM Subnet calculations."""
from app.schemas.ipam import VLSMRequest, VLSMDepartmentRequirement
from app.services.ipam_service import calculate_vlsm, allocate_next_available_ip, detect_subnet_overlaps
from app.models.ipam import Subnet


def test_vlsm_calculation():
    req = VLSMRequest(
        major_network="192.168.1.0/24",
        departments=[
            VLSMDepartmentRequirement(name="Engineering", needed_hosts=50),
            VLSMDepartmentRequirement(name="Sales", needed_hosts=25),
            VLSMDepartmentRequirement(name="Admin", needed_hosts=10),
            VLSMDepartmentRequirement(name="WAN", needed_hosts=2)
        ]
    )
    res = calculate_vlsm(req)

    assert res.total_requested_hosts == 87
    assert len(res.subnets) == 4

    # Departments must be sorted descending by need
    # 50 hosts -> /26 (62 usable)
    assert res.subnets[0].name == "Engineering"
    assert res.subnets[0].prefix_length == 26
    assert res.subnets[0].allocated_hosts == 62

    # 25 hosts -> /27 (30 usable)
    assert res.subnets[1].name == "Sales"
    assert res.subnets[1].prefix_length == 27
    assert res.subnets[1].allocated_hosts == 30

    # 10 hosts -> /28 (14 usable)
    assert res.subnets[2].name == "Admin"
    assert res.subnets[2].prefix_length == 28
    assert res.subnets[2].allocated_hosts == 14

    # 2 hosts -> /30 (2 usable)
    assert res.subnets[3].name == "WAN"
    assert res.subnets[3].prefix_length == 30
    assert res.subnets[3].allocated_hosts == 2


def test_allocate_next_available_ip():
    subnet = "10.0.0.0/29"  # hosts 10.0.0.1 - 10.0.0.6
    allocated = ["10.0.0.1", "10.0.0.2"]

    next_ip = allocate_next_available_ip(subnet, allocated)
    assert next_ip == "10.0.0.3"


def test_detect_subnet_overlaps():
    s1 = Subnet(id=1, name="Subnet A", cidr="10.0.0.0/24", topology_id=1, allocated_ips_json="[]")
    s2 = Subnet(id=2, name="Subnet B", cidr="10.0.0.128/25", topology_id=1, allocated_ips_json="[]")
    s3 = Subnet(id=3, name="Subnet C", cidr="192.168.1.0/24", topology_id=1, allocated_ips_json="[]")

    overlaps = detect_subnet_overlaps([s1, s2, s3])
    assert len(overlaps) == 1
    assert overlaps[0]["subnet1_id"] == 1
    assert overlaps[0]["subnet2_id"] == 2
