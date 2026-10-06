"""Tests for shortest path routing and reachability simulation."""
from app.simulation.routing import compute_shortest_path, compute_reachability_matrix


def test_dijkstra_shortest_path(sample_campus_topology):
    devices = {d.name: d.id for d in sample_campus_topology.devices}
    src = devices["Eng-Workstation-01"]
    tgt = devices["DC-Server-Farm-01"]

    result = compute_shortest_path(sample_campus_topology, src, tgt, metric="cost")
    assert result.path_found is True
    assert len(result.hops) >= 3
    assert result.total_cost > 0
    assert result.total_latency_ms > 0
    assert result.bottleneck_bandwidth_mbps == 1000


def test_reachability_matrix(sample_campus_topology):
    result = compute_reachability_matrix(sample_campus_topology)
    assert result.total_devices == len(sample_campus_topology.devices)
    assert result.reachable_pairs_count > 0
    assert result.reachability_percentage == 100.0
