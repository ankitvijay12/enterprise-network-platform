"""Redundancy and Single Point of Failure (SPOF) simulation engine."""
from typing import List, Set, Tuple
import networkx as nx
from app.models.topology import Topology
from app.simulation.graph_builder import build_network_graph
from app.schemas.simulation import RedundancySimulationResult


def analyze_redundancy(topology: Topology) -> RedundancySimulationResult:
    """Detect single points of failure (articulation points and bridges) using graph connectivity analysis."""
    G = build_network_graph(topology)
    num_nodes = G.number_of_nodes()

    if num_nodes <= 1:
        return RedundancySimulationResult(
            is_biconnected=False,
            articulation_device_ids=[],
            articulation_device_names=[],
            bridge_link_ids=[],
            redundancy_score=100.0 if num_nodes == 1 else 0.0,
            connected_components_count=num_nodes,
            recommendations=["Add more network devices to evaluate enterprise redundancy."]
        )

    # Connected components
    components_count = nx.number_connected_components(G)
    device_name_map = {d.id: d.name for d in topology.devices}

    # Articulation points (nodes whose removal increases connected components)
    articulation_nodes = list(nx.articulation_points(G))
    articulation_names = [device_name_map.get(nid, f"Device {nid}") for nid in articulation_nodes]

    # Bridges (edges whose removal increases connected components)
    bridges = list(nx.bridges(G))
    bridge_link_ids: List[int] = []

    for u, v in bridges:
        edge_data = G.edges[u, v]
        lid = edge_data.get("link_id")
        if lid:
            bridge_link_ids.append(lid)

    # Check if network is biconnected
    is_biconnected = nx.is_biconnected(G) if components_count == 1 else False

    # Redundancy score calculation
    # Penalize based on percentage of articulation nodes and bridges
    node_spof_ratio = len(articulation_nodes) / max(num_nodes, 1)
    num_edges = max(G.number_of_edges(), 1)
    edge_spof_ratio = len(bridge_link_ids) / num_edges

    base_score = 100.0
    if components_count > 1:
        base_score -= (components_count - 1) * 15.0

    score = base_score - (node_spof_ratio * 40.0) - (edge_spof_ratio * 40.0)
    redundancy_score = max(0.0, min(round(score, 1), 100.0))

    # Recommendations
    recommendations: List[str] = []
    if len(articulation_nodes) > 0:
        names_str = ", ".join(articulation_names[:3])
        if len(articulation_names) > 3:
            names_str += f" and {len(articulation_names) - 3} others"
        recommendations.append(
            f"Add redundant bypass or dual-homed links around SPOF devices: {names_str}."
        )

    if len(bridge_link_ids) > 0:
        recommendations.append(
            f"Found {len(bridge_link_ids)} critical bridge links. Implement LAG/LACP link aggregation or parallel meshed paths."
        )

    if components_count > 1:
        recommendations.append(
            f"Network is split into {components_count} disconnected segments. Verify inter-switch links and core routing."
        )

    if not recommendations:
        recommendations.append(
            "Excellent topology redundancy: All paths are multi-homed and resilient to any single device or link outage."
        )

    return RedundancySimulationResult(
        is_biconnected=is_biconnected,
        articulation_device_ids=articulation_nodes,
        articulation_device_names=articulation_names,
        bridge_link_ids=bridge_link_ids,
        redundancy_score=redundancy_score,
        connected_components_count=components_count,
        recommendations=recommendations
    )
