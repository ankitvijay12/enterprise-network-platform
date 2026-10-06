"""Traffic simulation engine: multi-flow placement, link utilization, and queuing latency."""
from typing import Dict, List, Optional, Tuple
import networkx as nx
from app.models.topology import Topology
from app.simulation.graph_builder import build_network_graph
from app.schemas.simulation import (
    TrafficSimulationResult, LinkTrafficMetric, FlowResult, TrafficFlowBase
)


def simulate_traffic_flows(
    topology: Topology,
    flows_input: Optional[List[TrafficFlowBase]] = None
) -> TrafficSimulationResult:
    """Map traffic demands across topology paths and compute per-link utilization and queuing delay."""
    G = build_network_graph(topology)
    device_name_map = {d.id: d.name for d in topology.devices}

    # Gather flows: either from input or topology database records
    flows_to_simulate: List[Tuple[str, int, int, float]] = []

    if flows_input and len(flows_input) > 0:
        for f in flows_input:
            flows_to_simulate.append((f.name, f.source_device_id, f.target_device_id, f.demand_mbps))
    else:
        for tf in topology.traffic_flows:
            flows_to_simulate.append((tf.name, tf.source_device_id, tf.target_device_id, tf.demand_mbps))

    # Link load tracker: link_id -> carried load in Mbps
    link_carried_load: Dict[int, float] = {}
    for link in topology.links:
        link_carried_load[link.id] = 0.0

    flow_results: List[FlowResult] = []
    total_offered_mbps = 0.0
    total_carried_mbps = 0.0

    # Place each flow on its shortest path (cost metric)
    for name, src_id, tgt_id, demand in flows_to_simulate:
        total_offered_mbps += demand

        if src_id not in G or tgt_id not in G or not nx.has_path(G, src_id, tgt_id):
            flow_results.append(FlowResult(
                flow_name=name,
                source=device_name_map.get(src_id, str(src_id)),
                target=device_name_map.get(tgt_id, str(tgt_id)),
                demand_mbps=demand,
                path_hops=[],
                delivered=False,
                end_to_end_latency_ms=0.0,
                estimated_packet_loss_pct=100.0
            ))
            continue

        path = nx.shortest_path(G, src_id, tgt_id, weight="cost")
        hops_names = [device_name_map.get(node, str(node)) for node in path]

        # Allocate demand across path edges
        for i in range(len(path) - 1):
            u, v = path[i], path[i + 1]
            edge_data = G.edges[u, v]
            lid = edge_data.get("link_id")
            if lid in link_carried_load:
                link_carried_load[lid] += demand

        total_carried_mbps += demand
        flow_results.append(FlowResult(
            flow_name=name,
            source=device_name_map.get(src_id, str(src_id)),
            target=device_name_map.get(tgt_id, str(tgt_id)),
            demand_mbps=demand,
            path_hops=hops_names,
            delivered=True,
            end_to_end_latency_ms=0.0,  # Will be populated below based on path links
            estimated_packet_loss_pct=0.0
        ))

    # Compute link metrics
    link_metrics_map: Dict[int, LinkTrafficMetric] = {}
    congested_link_ids: List[int] = []
    saturated_links_count = 0

    # Build device-to-interface lookup for link endpoints
    iface_to_dev_name = {}
    for d in topology.devices:
        for iface in d.interfaces:
            iface_to_dev_name[iface.id] = d.name

    for link in topology.links:
        load = link_carried_load.get(link.id, 0.0)
        cap = max(link.bandwidth_mbps, 1)
        util_pct = (load / cap) * 100.0

        is_congested = util_pct > 80.0
        is_saturated = util_pct >= 100.0

        if is_congested:
            congested_link_ids.append(link.id)
        if is_saturated:
            saturated_links_count += 1

        # M/M/1 queuing model approximation for effective latency
        # As rho -> 1, queuing delay increases
        rho = min(load / cap, 0.99)
        queuing_multiplier = 1.0 / (1.0 - rho) if rho < 0.95 else 20.0
        effective_latency = link.latency_ms * (1.0 + (queuing_multiplier - 1.0) * 0.15)

        # Packet loss approximation under congestion
        loss = link.packet_loss_pct
        if is_saturated:
            loss = max(loss, min(round((util_pct - 100.0) * 0.5 + 5.0, 2), 50.0))
        elif is_congested:
            loss = max(loss, round((util_pct - 80.0) * 0.1, 2))

        src_dev_name = iface_to_dev_name.get(link.source_interface_id, "Unknown")
        tgt_dev_name = iface_to_dev_name.get(link.target_interface_id, "Unknown")

        link_metric = LinkTrafficMetric(
            link_id=link.id,
            source_device=src_dev_name,
            target_device=tgt_dev_name,
            capacity_mbps=cap,
            carried_load_mbps=round(load, 2),
            utilization_pct=round(util_pct, 2),
            is_congested=is_congested,
            is_saturated=is_saturated,
            latency_ms=round(link.latency_ms, 2),
            effective_latency_ms=round(effective_latency, 2),
            packet_loss_pct=round(loss, 2)
        )
        link_metrics_map[link.id] = link_metric

    # Second pass for flows: compute end-to-end effective latency and loss
    for flow_res in flow_results:
        if not flow_res.delivered or len(flow_res.path_hops) < 2:
            continue
        
        # Calculate e2e latency & packet loss
        e2e_lat = 0.0
        compounded_loss = 0.0
        
        # Match hops to edges
        for i in range(len(flow_res.path_hops) - 1):
            h_src = flow_res.path_hops[i]
            h_tgt = flow_res.path_hops[i + 1]
            
            # Find matching link
            for lm in link_metrics_map.values():
                if (lm.source_device == h_src and lm.target_device == h_tgt) or \
                   (lm.source_device == h_tgt and lm.target_device == h_src):
                    e2e_lat += lm.effective_latency_ms
                    compounded_loss += lm.packet_loss_pct
                    break

        flow_res.end_to_end_latency_ms = round(e2e_lat, 2)
        flow_res.estimated_packet_loss_pct = round(min(compounded_loss, 100.0), 2)

    return TrafficSimulationResult(
        total_offered_load_mbps=round(total_offered_mbps, 2),
        total_carried_load_mbps=round(total_carried_mbps, 2),
        congested_links_count=len(congested_link_ids),
        congested_link_ids=congested_link_ids,
        saturated_links_count=saturated_links_count,
        link_metrics=list(link_metrics_map.values()),
        flows=flow_results
    )
