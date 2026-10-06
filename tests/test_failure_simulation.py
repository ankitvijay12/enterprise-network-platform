"""Tests for failure simulation and partition detection."""
from app.simulation.failure_engine import simulate_network_failures


def test_failure_simulation_node_cut(sample_campus_topology):
    devices = {d.name: d.id for d in sample_campus_topology.devices}
    # Fail Dist-L3Switch-01
    failed_node = devices["Dist-L3Switch-01"]

    res = simulate_network_failures(
        sample_campus_topology,
        failed_device_ids=[failed_node],
        failed_link_ids=[]
    )

    # Campus has dual-homed redundant dist switch, so network should remain connected via Dist-L3Switch-02
    assert res.post_failure_partitions_count >= 1
    assert res.surviving_nodes_count == len(sample_campus_topology.devices) - 1
