"""Routing simulation engine: Dijkstra shortest path and reachability matrix."""
from typing import Dict, List, Optional, Tuple
import networkx as nx
from app.models.topology import Topology
from app.simulation.graph_builder import build_network_graph
from app.schemas.simulation import (
    PathSimulationRequest, PathSimulationResult, PathHop,
    ReachabilitySimulationResult, ReachabilityPair
)


def compute_shortest_path(
    topology: Topology,
    source_device_id: int,
    target_device_id: int,
    metric: str = "cost"
) -> PathSimulationResult:
    """Compute Dijkstra shortest path between source and target device."""
    G = build_network_graph(topology)

    device_name_map = {d.id: d.name for d in topology.devices}
    source_name = device_name_map.get(source_device_id, f"Device {source_device_id}")
    target_name = device_name_map.get(target_device_id, f"Device {target_device_id}")

    if source_device_id not in G or target_device_id not in G:
        return PathSimulationResult(
            path_found=False,
            source_device=source_name,
            target_device=target_name,
            hops=[],
            total_cost=0,
            total_latency_ms=0.0,
            bottleneck_bandwidth_mbps=0,
            path_edges=[],
            path_nodes=[]
        )

    weight_attr = "latency_ms" if metric == "latency" else "cost"

    try:
        node_path: List[int] = nx.shortest_path(
            G,
            source=source_device_id,
            target=target_device_id,
            weight=weight_attr
        )
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return PathSimulationResult(
            path_found=False,
            source_device=source_name,
            target_device=target_name,
            hops=[],
            total_cost=0,
            total_latency_ms=0.0,
            bottleneck_bandwidth_mbps=0,
            path_edges=[],
            path_nodes=[]
        )

    # Reconstruct path details
    hops: List[PathHop] = []
    total_cost = 0
    total_latency_ms = 0.0
    bottleneck_bandwidth = 10_000_000
    path_edges: List[int] = []

    for i, node_id in enumerate(node_path):
        dev_data = G.nodes[node_id]
        iface_id = None
        iface_name = None
        link_id = None

        if i < len(node_path) - 1:
            next_node = node_path[i + 1]
            edge_data = G.edges[node_id, next_node]
            link_id = edge_data.get("link_id")
            path_edges.append(link_id)
            total_cost += edge_data.get("cost", 10)
            total_latency_ms += edge_data.get("latency_ms", 1.0)
            bw = edge_data.get("bandwidth_mbps", 1000)
            if bw < bottleneck_bandwidth:
                bottleneck_bandwidth = bw

            iface_id = edge_data.get("source_interface_id")
            iface_name = edge_data.get("source_interface_name")

        hops.append(PathHop(
            device_id=node_id,
            device_name=dev_data.get("name", f"Device {node_id}"),
            device_type=dev_data.get("device_type", "router"),
            interface_id=iface_id,
            interface_name=iface_name,
            link_id=link_id
        ))

    if bottleneck_bandwidth == 10_000_000:
        bottleneck_bandwidth = 0

    return PathSimulationResult(
        path_found=True,
        source_device=source_name,
        target_device=target_name,
        hops=hops,
        total_cost=total_cost,
        total_latency_ms=round(total_latency_ms, 2),
        bottleneck_bandwidth_mbps=bottleneck_bandwidth,
        path_edges=path_edges,
        path_nodes=node_path
    )


def compute_reachability_matrix(topology: Topology) -> ReachabilitySimulationResult:
    """Compute reachability matrix across all device pairs in the topology."""
    G = build_network_graph(topology)
    devices = [d for d in topology.devices if d.status.lower() == "up"]
    pairs: List[ReachabilityPair] = []
    
    reachable_count = 0
    total_pairs = 0

    for i in range(len(devices)):
        for j in range(len(devices)):
            if i == j:
                continue
            
            src = devices[i]
            tgt = devices[j]
            total_pairs += 1

            if src.id in G and tgt.id in G and nx.has_path(G, src.id, tgt.id):
                reachable_count += 1
                cost = nx.shortest_path_length(G, src.id, tgt.id, weight="cost")
                lat = nx.shortest_path_length(G, src.id, tgt.id, weight="latency_ms")
                pairs.append(ReachabilityPair(
                    source_id=src.id,
                    source_name=src.name,
                    target_id=tgt.id,
                    target_name=tgt.name,
                    reachable=True,
                    path_cost=int(cost),
                    latency_ms=round(float(lat), 2)
                ))
            else:
                pairs.append(ReachabilityPair(
                    source_id=src.id,
                    source_name=src.name,
                    target_id=tgt.id,
                    target_name=tgt.name,
                    reachable=False,
                    path_cost=None,
                    latency_ms=None
                ))

    unreachable_count = total_pairs - reachable_count
    pct = (reachable_count / total_pairs * 100.0) if total_pairs > 0 else 100.0

    return ReachabilitySimulationResult(
        total_devices=len(devices),
        total_pairs=total_pairs,
        reachable_pairs_count=reachable_count,
        unreachable_pairs_count=unreachable_count,
        reachability_percentage=round(pct, 1),
        pairs=pairs
    )
