"""Failure simulation engine evaluating network resiliency and rerouting."""
from typing import Dict, List, Set
import networkx as nx
from app.models.topology import Topology
from app.simulation.graph_builder import build_network_graph
from app.schemas.simulation import (
    FailureSimulationRequest, FailureSimulationResult, BrokenPath
)


def simulate_network_failures(
    topology: Topology,
    failed_device_ids: List[int],
    failed_link_ids: List[int]
) -> FailureSimulationResult:
    """Simulate device and link outages and determine partition impact and traffic rerouting."""
    # Pre-failure graph
    G_initial = build_network_graph(topology)
    initial_partitions = nx.number_connected_components(G_initial) if len(G_initial) > 0 else 0

    # Post-failure graph
    exclude_devs = set(failed_device_ids)
    exclude_links = set(failed_link_ids)
    G_failed = build_network_graph(topology, exclude_device_ids=exclude_devs, exclude_link_ids=exclude_links)

    post_partitions = nx.number_connected_components(G_failed) if len(G_failed) > 0 else 0

    device_name_map = {d.id: d.name for d in topology.devices}

    # Find isolated devices (degree 0 in post-failure graph)
    isolated_ids: List[int] = []
    isolated_names: List[str] = []
    for node in G_failed.nodes():
        if G_failed.degree(node) == 0:
            isolated_ids.append(node)
            isolated_names.append(device_name_map.get(node, f"Device {node}"))

    # Also include failed devices as isolated/down
    for dev_id in failed_device_ids:
        if dev_id not in isolated_ids:
            isolated_ids.append(dev_id)
            isolated_names.append(device_name_map.get(dev_id, f"Device {dev_id}"))

    # Evaluate traffic flows impact
    broken_flows = 0
    rerouted_flows = 0
    dropped_flows = 0
    flow_impacts: List[BrokenPath] = []

    for flow in topology.traffic_flows:
        src = flow.source_device_id
        tgt = flow.target_device_id

        had_initial_path = (src in G_initial and tgt in G_initial and nx.has_path(G_initial, src, tgt))
        if not had_initial_path:
            continue

        initial_path = nx.shortest_path(G_initial, src, tgt, weight="cost")
        
        # Check if initial path traversed any failed node or edge
        path_nodes_set = set(initial_path)
        path_edges_in_failure = False
        for i in range(len(initial_path) - 1):
            u, v = initial_path[i], initial_path[i + 1]
            edge_data = G_initial.edges[u, v]
            if edge_data.get("link_id") in exclude_links:
                path_edges_in_failure = True
                break

        path_affected = bool(path_nodes_set.intersection(exclude_devs)) or path_edges_in_failure

        if path_affected:
            broken_flows += 1
            # Check if alternative path exists in surviving graph
            has_new_path = (src in G_failed and tgt in G_failed and nx.has_path(G_failed, src, tgt))
            if has_new_path:
                new_path = nx.shortest_path(G_failed, src, tgt, weight="cost")
                new_hops = [device_name_map.get(n, str(n)) for n in new_path]
                rerouted_flows += 1
                flow_impacts.append(BrokenPath(
                    flow_name=flow.name,
                    source_device=device_name_map.get(src, str(src)),
                    target_device=device_name_map.get(tgt, str(tgt)),
                    demand_mbps=flow.demand_mbps,
                    rerouted=True,
                    new_hops=new_hops
                ))
            else:
                dropped_flows += 1
                flow_impacts.append(BrokenPath(
                    flow_name=flow.name,
                    source_device=device_name_map.get(src, str(src)),
                    target_device=device_name_map.get(tgt, str(tgt)),
                    demand_mbps=flow.demand_mbps,
                    rerouted=False,
                    new_hops=[]
                ))

    return FailureSimulationResult(
        initial_partitions_count=initial_partitions,
        post_failure_partitions_count=post_partitions,
        isolated_device_ids=isolated_ids,
        isolated_device_names=isolated_names,
        broken_flows_count=broken_flows,
        rerouted_flows_count=rerouted_flows,
        dropped_flows_count=dropped_flows,
        flow_impacts=flow_impacts,
        surviving_nodes_count=G_failed.number_of_nodes(),
        surviving_edges_count=G_failed.number_of_edges()
    )
