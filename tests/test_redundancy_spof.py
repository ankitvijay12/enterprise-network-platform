"""Tests for redundancy and SPOF detection."""
from app.simulation.redundancy import analyze_redundancy


def test_spof_detection(sample_campus_topology):
    res = analyze_redundancy(sample_campus_topology)
    assert res.redundancy_score > 0
    # Eng-Workstation-01 is a leaf endpoint with a single link, so Access-Switch-01 is an articulation point for it
    assert len(res.articulation_device_names) >= 1
    assert len(res.recommendations) >= 1
