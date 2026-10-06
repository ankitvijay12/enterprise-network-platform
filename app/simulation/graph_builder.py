"""NetworkX graph builder for topology representations."""
from typing import Dict, List, Optional, Set, Tuple
import networkx as nx
from app.models.topology import Topology
from app.models.device import Device
from app.models.interface import Interface
from app.models.link import Link


def build_network_graph(
    topology: Topology,
    exclude_device_ids: Optional[Set[int]] = None,
    exclude_link_ids: Optional[Set[int]] = None,
    only_up_elements: bool = True
) -> nx.Graph:
    """Build an undirected NetworkX Graph from a topology model."""
    G = nx.Graph()
    exclude_device_ids = exclude_device_ids or set()
    exclude_link_ids = exclude_link_ids or set()

    # Map interfaces to device
    interface_map: Dict[int, Interface] = {}
    device_map: Dict[int, Device] = {}

    for device in topology.devices:
        device_map[device.id] = device
        for iface in device.interfaces:
            interface_map[iface.id] = iface

    # Add device nodes
    for device in topology.devices:
        if device.id in exclude_device_ids:
            continue
        if only_up_elements and device.status.lower() != "up":
            continue

        G.add_node(
            device.id,
            id=device.id,
            name=device.name,
            device_type=device.device_type,
            status=device.status,
            x_pos=device.x_pos,
            y_pos=device.y_pos
        )

    # Add links
    for link in topology.links:
        if link.id in exclude_link_ids:
            continue
        if only_up_elements and link.status.lower() != "up":
            continue

        src_iface = interface_map.get(link.source_interface_id)
        tgt_iface = interface_map.get(link.target_interface_id)

        if not src_iface or not tgt_iface:
            continue

        src_dev_id = src_iface.device_id
        tgt_dev_id = tgt_iface.device_id

        # Skip if either device is excluded or not in graph
        if src_dev_id not in G or tgt_dev_id not in G:
            continue

        if only_up_elements and (src_iface.status.lower() != "up" or tgt_iface.status.lower() != "up"):
            continue

        G.add_edge(
            src_dev_id,
            tgt_dev_id,
            link_id=link.id,
            source_interface_id=src_iface.id,
            source_interface_name=src_iface.name,
            target_interface_id=tgt_iface.id,
            target_interface_name=tgt_iface.name,
            bandwidth_mbps=link.bandwidth_mbps,
            latency_ms=link.latency_ms,
            packet_loss_pct=link.packet_loss_pct,
            cost=link.cost,
            status=link.status,
            link_type=link.link_type
        )

    return G


def build_directed_network_graph(
    topology: Topology,
    exclude_device_ids: Optional[Set[int]] = None,
    exclude_link_ids: Optional[Set[int]] = None,
    only_up_elements: bool = True
) -> nx.DiGraph:
    """Build a directed NetworkX DiGraph where each physical link has forward and reverse edges."""
    G_undirected = build_network_graph(topology, exclude_device_ids, exclude_link_ids, only_up_elements)
    G_directed = nx.DiGraph()

    for node, data in G_undirected.nodes(data=True):
        G_directed.add_node(node, **data)

    for u, v, data in G_undirected.edges(data=True):
        G_directed.add_edge(u, v, **data)
        G_directed.add_edge(v, u, **data)

    return G_directed
