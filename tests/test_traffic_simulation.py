"""Tests for multi-commodity traffic flow simulation and link congestion."""
from app.simulation.traffic_engine import simulate_traffic_flows
from app.schemas.simulation import TrafficFlowBase


def test_traffic_simulation_congestion(sample_campus_topology):
    devices = {d.name: d.id for d in sample_campus_topology.devices}
    src = devices["Eng-Workstation-01"]
    tgt = devices["DC-Server-Farm-01"]

    # Access link capacity is 1000 Mbps. Offer 900 Mbps (90% utilization -> congested >80%)
    flows = [
        TrafficFlowBase(
            name="Heavy-Backup-Flow",
            source_device_id=src,
            target_device_id=tgt,
            demand_mbps=900.0,
            protocol="TCP",
            priority=1
        )
    ]

    res = simulate_traffic_flows(sample_campus_topology, flows_input=flows)

    assert res.total_offered_load_mbps == 900.0
    assert res.congested_links_count >= 1
    # Check that at least one link is flagged congested (>80%)
    congested_links = [m for m in res.link_metrics if m.is_congested]
    assert len(congested_links) >= 1
    assert any(m.utilization_pct >= 80.0 for m in res.link_metrics)
