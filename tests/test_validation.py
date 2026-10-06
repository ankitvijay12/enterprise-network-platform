"""Tests for design validation heuristics and health scoring."""
from app.services.validation_service import evaluate_design_health


def test_design_health_evaluation(sample_campus_topology):
    report = evaluate_design_health(sample_campus_topology)
    assert report.health_score > 0
    assert report.grade in ["A+", "A", "B", "C", "D", "F"]
    assert "critical" in report.summary
    assert "warning" in report.summary
