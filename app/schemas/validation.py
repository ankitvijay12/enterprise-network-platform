"""Validation schemas for design heuristics and health score."""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class IssueSeverity:
    CRITICAL = "critical"
    WARNING = "warning"
    INFO = "info"


class ValidationIssue(BaseModel):
    category: str  # topology, ipam, hardware, performance, redundancy
    severity: str  # critical, warning, info
    title: str
    description: str
    affected_entity_type: str  # device, link, subnet, interface
    affected_entity_id: Optional[int] = None
    affected_entity_name: Optional[str] = None
    remediation: str


class DesignHealthReport(BaseModel):
    topology_id: int
    topology_name: str
    health_score: int  # 0 to 100
    grade: str  # A+, A, B, C, D, F
    is_healthy: bool
    summary: Dict[str, int]  # counts: critical, warning, info
    issues: List[ValidationIssue]
