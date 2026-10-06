/**
 * Cytoscape Graph Canvas Controller
 */
class TopologyGraph {
  constructor(containerId, onSelectNode, onSelectEdge, onNodeMoved) {
    this.container = document.getElementById(containerId);
    this.onSelectNode = onSelectNode;
    this.onSelectEdge = onSelectEdge;
    this.onNodeMoved = onNodeMoved;
    this.cy = null;
    this.initCytoscape();
  }

  initCytoscape() {
    this.cy = cytoscape({
      container: this.container,
      boxSelectionEnabled: false,
      autounselectify: false,
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(name)',
            'color': '#ffffff',
            'font-size': '11px',
            'font-weight': '700',
            'text-valign': 'bottom',
            'text-margin-y': 7,
            'background-color': '#0e1017',
            'border-width': 2.5,
            'border-color': '#ff6a00',
            'width': 44,
            'height': 44,
            'shadow-blur': 14,
            'shadow-color': '#ff6a00',
            'shadow-opacity': 0.35,
            'text-background-opacity': 0.88,
            'text-background-color': '#08080c',
            'text-background-padding': 3,
            'text-background-shape': 'roundrectangle',
            'text-border-width': 1,
            'text-border-color': 'rgba(255, 106, 0, 0.35)',
            'text-border-opacity': 0.8
          }
        },
        // Device Types with Cyber Amber Palette
        {
          selector: 'node[device_type = "router"]',
          style: {
            'background-color': '#211005',
            'border-color': '#ff5900',
            'shadow-color': '#ff5900',
            'shape': 'round-rectangle'
          }
        },
        {
          selector: 'node[device_type = "l3_switch"]',
          style: {
            'background-color': '#1f1304',
            'border-color': '#ff8400',
            'shadow-color': '#ff8400',
            'shape': 'diamond'
          }
        },
        {
          selector: 'node[device_type = "l2_switch"]',
          style: {
            'background-color': '#1a1309',
            'border-color': '#ffa726',
            'shadow-color': '#ffa726',
            'shape': 'rectangle'
          }
        },
        {
          selector: 'node[device_type = "firewall"]',
          style: {
            'background-color': '#2b0909',
            'border-color': '#ff3b3b',
            'shadow-color': '#ff3b3b',
            'shape': 'hexagon'
          }
        },
        {
          selector: 'node[device_type = "server"]',
          style: {
            'background-color': '#1c0c2e',
            'border-color': '#c084fc',
            'shadow-color': '#c084fc',
            'shape': 'round-rectangle'
          }
        },
        {
          selector: 'node[device_type = "access_point"]',
          style: {
            'background-color': '#241704',
            'border-color': '#fbbf24',
            'shadow-color': '#fbbf24',
            'shape': 'ellipse'
          }
        },
        {
          selector: 'node[device_type = "endpoint"]',
          style: {
            'background-color': '#12141c',
            'border-color': '#94a3b8',
            'shadow-color': '#94a3b8',
            'shape': 'ellipse'
          }
        },
        // Edge styling
        {
          selector: 'edge',
          style: {
            'width': 2.5,
            'line-color': '#393c4e',
            'curve-style': 'bezier',
            'label': 'data(label)',
            'font-size': '9px',
            'color': '#cbd5e1',
            'text-rotation': 'autorotate',
            'text-background-opacity': 0.85,
            'text-background-color': '#0a0b10',
            'text-background-padding': 2,
            'text-background-shape': 'roundrectangle',
            'text-border-width': 1,
            'text-border-color': 'rgba(255, 115, 30, 0.25)',
            'text-border-opacity': 0.8
          }
        },
        // Highlights & States
        {
          selector: 'node:selected',
          style: {
            'border-color': '#ffaa00',
            'border-width': 4,
            'shadow-blur': 25,
            'shadow-color': '#ff7700',
            'shadow-opacity': 0.95
          }
        },
        {
          selector: 'edge:selected',
          style: {
            'line-color': '#ff8800',
            'width': 4.5,
            'shadow-blur': 15,
            'shadow-color': '#ff8800',
            'shadow-opacity': 0.8
          }
        },
        {
          selector: '.path-highlight',
          style: {
            'border-color': '#ff5000',
            'border-width': 4.5,
            'background-color': '#ff7000',
            'line-color': '#ff5500',
            'width': 5.5,
            'shadow-blur': 22,
            'shadow-color': '#ff5500',
            'shadow-opacity': 0.95,
            'z-index': 99
          }
        },
        {
          selector: '.failed',
          style: {
            'border-color': '#ef4444',
            'line-color': '#ef4444',
            'line-style': 'dashed',
            'background-color': '#450a0a',
            'shadow-color': '#ef4444',
            'shadow-blur': 15,
            'opacity': 0.6
          }
        },
        {
          selector: '.congested',
          style: {
            'line-color': '#ef4444',
            'width': 6,
            'color': '#fca5a5',
            'shadow-blur': 16,
            'shadow-color': '#ef4444',
            'z-index': 90
          }
        },
        {
          selector: '.warning-load',
          style: {
            'line-color': '#f59e0b',
            'width': 4.5,
            'color': '#fde68a',
            'shadow-blur': 12,
            'shadow-color': '#f59e0b'
          }
        },
        {
          selector: '.spof-node',
          style: {
            'border-color': '#ff3b00',
            'border-width': 5,
            'shadow-blur': 25,
            'shadow-color': '#ff5000',
            'shadow-opacity': 1.0
          }
        },
        {
          selector: '.spof-bridge',
          style: {
            'line-color': '#ff5000',
            'width': 5,
            'line-style': 'dotted',
            'shadow-blur': 16,
            'shadow-color': '#ff5000'
          }
        }
      ],
      layout: { name: 'preset' }
    });

    // Event listeners
    this.cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      if (this.onSelectNode) this.onSelectNode(node.data());
    });

    this.cy.on('tap', 'edge', (evt) => {
      const edge = evt.target;
      if (this.onSelectEdge) this.onSelectEdge(edge.data());
    });

    this.cy.on('dragfree', 'node', (evt) => {
      const node = evt.target;
      const pos = node.position();
      const rawId = node.data('rawId') || node.data('id');
      if (this.onNodeMoved) this.onNodeMoved(rawId, pos.x, pos.y);
    });

    this.cy.on('tap', (evt) => {
      if (evt.target === this.cy) {
        if (this.onSelectNode) this.onSelectNode(null);
      }
    });
  }

  loadTopology(devices, links) {
    this.cy.elements().remove();

    const elements = [];

    // Build interfaces map
    const ifaceToDev = {};
    devices.forEach(d => {
      (d.interfaces || []).forEach(i => {
        ifaceToDev[i.id] = d;
      });

      elements.push({
        group: 'nodes',
        data: {
          id: `dev_${d.id}`,
          rawId: d.id,
          name: d.name,
          device_type: d.device_type,
          status: d.status,
          vendor: d.vendor,
          model: d.model,
          interfaces: d.interfaces || []
        },
        position: {
          x: d.x_pos || (Math.random() * 500 + 100),
          y: d.y_pos || (Math.random() * 400 + 100)
        }
      });
    });

    links.forEach(l => {
      const srcDev = ifaceToDev[l.source_interface_id];
      const tgtDev = ifaceToDev[l.target_interface_id];

      if (srcDev && tgtDev) {
        elements.push({
          group: 'edges',
          data: {
            id: `link_${l.id}`,
            rawId: l.id,
            source: `dev_${srcDev.id}`,
            target: `dev_${tgtDev.id}`,
            bandwidth_mbps: l.bandwidth_mbps,
            latency_ms: l.latency_ms,
            cost: l.cost,
            status: l.status,
            label: `${l.bandwidth_mbps >= 1000 ? (l.bandwidth_mbps/1000) + 'G' : l.bandwidth_mbps + 'M'} | ${l.latency_ms}ms`
          }
        });
      }
    });

    this.cy.add(elements);
    this.cy.fit(null, 40);
  }

  clearHighlights() {
    this.cy.elements().removeClass('path-highlight failed congested warning-load spof-node spof-bridge');
  }

  highlightPath(nodeIds, edgeLinkIds) {
    this.clearHighlights();
    nodeIds.forEach(id => {
      this.cy.$(`node[rawId = ${id}]`).addClass('path-highlight');
    });
    edgeLinkIds.forEach(id => {
      this.cy.$(`edge[rawId = ${id}]`).addClass('path-highlight');
    });
  }

  highlightFailures(failedDevIds, failedLinkIds, isolatedDevIds) {
    this.clearHighlights();
    failedDevIds.forEach(id => {
      this.cy.$(`node[rawId = ${id}]`).addClass('failed');
    });
    failedLinkIds.forEach(id => {
      this.cy.$(`edge[rawId = ${id}]`).addClass('failed');
    });
    isolatedDevIds.forEach(id => {
      this.cy.$(`node[rawId = ${id}]`).addClass('failed');
    });
  }

  highlightTraffic(linkMetrics) {
    this.clearHighlights();
    linkMetrics.forEach(m => {
      const edge = this.cy.$(`edge[rawId = ${m.link_id}]`);
      if (m.is_congested) {
        edge.addClass('congested');
      } else if (m.utilization_pct >= 50.0) {
        edge.addClass('warning-load');
      }
    });
  }

  highlightRedundancy(articulationIds, bridgeLinkIds) {
    this.clearHighlights();
    articulationIds.forEach(id => {
      this.cy.$(`node[rawId = ${id}]`).addClass('spof-node');
    });
    bridgeLinkIds.forEach(id => {
      this.cy.$(`edge[rawId = ${id}]`).addClass('spof-bridge');
    });
  }

  autoLayout(layoutName = 'cose') {
    this.cy.layout({
      name: layoutName,
      animate: true,
      animationDuration: 500,
      fit: true,
      padding: 30
    }).run();
  }
}
