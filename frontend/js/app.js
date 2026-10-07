/**
 * Main Frontend Application Controller
 */

let graph = null;
let currentProjectId = null;
let currentTopologyId = null;
let currentTopologyData = null;
let selectedEntity = null; // { type: 'node' | 'edge', data: {...} }

// Initialize application on DOM loaded
document.addEventListener("DOMContentLoaded", async () => {
  setupTabs();
  setupEventListeners();

  // Initialize Graph Canvas
  graph = new TopologyGraph(
    "cy",
    (nodeData) => onSelectNode(nodeData),
    (edgeData) => onSelectEdge(edgeData),
    (nodeId, x, y) => onNodeMoved(nodeId, x, y)
  );

  // Auto-login demo engineer if not logged in
  if (!apiClient.token) {
    try {
      await apiClient.login("engineer@enterprise.local", "EngineerPass123!");
    } catch (e) {
      console.warn("Auto-login demo account failed. Prompting login.");
    }
  }

  updateUserUI();
  await loadInitialProjects();
  setupIntroScreen();
});

function setupTabs() {
  const tabs = document.querySelectorAll(".tab-btn");
  tabs.forEach(btn => {
    btn.addEventListener("click", () => {
      switchDrawerTab(btn.dataset.tab);
    });
  });
}

function switchDrawerTab(tabId) {
  const tabs = document.querySelectorAll(".tab-btn");
  tabs.forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));

  const targetBtn = document.querySelector('.tab-btn[data-tab="' + tabId + '"]');
  if (targetBtn) targetBtn.classList.add("active");
  const targetPane = document.getElementById(tabId);
  if (targetPane) targetPane.classList.add("active");

  if (tabId === "tab-validation" && currentTopologyId) {
    runHealthValidation();
  }
}

function updateUserUI() {
  const user = apiClient.user;
  const userBtn = document.getElementById("btn-auth-profile");
  if (user) {
    userBtn.textContent = `${user.full_name} (${user.role.toUpperCase()})`;
  } else {
    userBtn.textContent = "Sign In";
  }
}

async function loadInitialProjects() {
  try {
    const res = await apiClient.getProjects();
    const select = document.getElementById("select-project");
    select.innerHTML = "";

    if (res.items && res.items.length > 0) {
      res.items.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name;
        select.appendChild(opt);
      });
      currentProjectId = res.items[0].id;
      await loadTopologiesForProject(currentProjectId);
    } else {
      // Create a default project
      const newProj = await apiClient.createProject("Enterprise Production Network", "Default enterprise deployment workspace");
      const opt = document.createElement("option");
      opt.value = newProj.id;
      opt.textContent = newProj.name;
      select.appendChild(opt);
      currentProjectId = newProj.id;
      // Load campus template by default
      await loadTemplate("campus");
    }
  } catch (err) {
    showToast("Error loading projects: " + err.message, "danger");
  }
}

async function loadTopologiesForProject(projectId) {
  try {
    const topologies = await apiClient.getTopologiesByProject(projectId);
    const select = document.getElementById("select-topology");
    select.innerHTML = "";

    if (topologies.length > 0) {
      topologies.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t.id;
        opt.textContent = `${t.name} (v${t.version})`;
        select.appendChild(opt);
      });
      currentTopologyId = topologies[0].id;
      await refreshCurrentTopology();
    } else {
      // Prompt template load
      await loadTemplate("campus");
    }
  } catch (err) {
    showToast("Error loading topologies: " + err.message, "danger");
  }
}

async function refreshCurrentTopology() {
  if (!currentTopologyId) return;

  try {
    const [devices, links] = await Promise.all([
      apiClient.getDevices(currentTopologyId),
      apiClient.getLinks(currentTopologyId)
    ]);

    currentTopologyData = { devices, links };
    graph.loadTopology(devices, links);
    populateDeviceSelects(devices);
    await refreshIPAMList();
  } catch (err) {
    showToast("Failed to load topology components: " + err.message, "danger");
  }
}

function populateDeviceSelects(devices) {
  const simSrc = document.getElementById("sim-src-device");
  const simTgt = document.getElementById("sim-tgt-device");
  if (!simSrc || !simTgt) return;

  simSrc.innerHTML = '<option value="">-- Select Source --</option>';
  simTgt.innerHTML = '<option value="">-- Select Target --</option>';

  devices.forEach(d => {
    const opt1 = document.createElement("option");
    opt1.value = d.id;
    opt1.textContent = `${d.name} (${d.device_type})`;
    simSrc.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = d.id;
    opt2.textContent = `${d.name} (${d.device_type})`;
    simTgt.appendChild(opt2);
  });

  if (devices.length >= 2) {
    simSrc.selectedIndex = 1;
    simTgt.selectedIndex = devices.length;
  }
}

function onSelectNode(nodeData) {
  selectedEntity = nodeData ? { type: 'node', data: nodeData } : null;
  const inspector = document.getElementById("inspector-body");
  if (!nodeData) {
    inspector.innerHTML = '<div style="color:var(--text-muted); font-size:0.8rem; text-align:center; padding:2rem 0;">Click any device or link on the canvas to inspect and edit properties.</div>';
    return;
  }

  // Switch to inspector tab
  document.querySelector('[data-tab="tab-inspector"]').click();

  let ifacesHtml = (nodeData.interfaces || []).map(i => `
    <tr>
      <td><b>${i.name}</b></td>
      <td>${i.ip_address || '-'}</td>
      <td>${i.speed_mbps >= 1000 ? (i.speed_mbps/1000) + 'G' : i.speed_mbps + 'M'}</td>
      <td><span class="status-badge ${i.status === 'up' ? 'badge-success' : 'badge-critical'}">${i.status}</span></td>
    </tr>
  `).join('');

  inspector.innerHTML = `
    <div class="panel-card">
      <div class="card-title">
        <span>Device: ${nodeData.name}</span>
        <span class="status-badge ${nodeData.status === 'up' ? 'badge-success' : 'badge-critical'}">${nodeData.status}</span>
      </div>
      <div class="form-group">
        <label>Device Name</label>
        <input type="text" id="edit-dev-name" value="${nodeData.name}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Type</label>
          <input type="text" value="${nodeData.device_type}" disabled>
        </div>
        <div class="form-group">
          <label>Status</label>
          <select id="edit-dev-status">
            <option value="up" ${nodeData.status === 'up' ? 'selected' : ''}>UP</option>
            <option value="down" ${nodeData.status === 'down' ? 'selected' : ''}>DOWN</option>
          </select>
        </div>
      </div>
      <button class="btn-primary" onclick="saveDeviceEdit(${nodeData.rawId})">Save Changes</button>
      <button class="btn-danger" style="margin-top:0.25rem;" onclick="deleteSelectedDevice(${nodeData.rawId})">Delete Device</button>
    </div>

    <div class="panel-card">
      <div class="card-title">
        <span>Interfaces (${(nodeData.interfaces || []).length})</span>
        <button onclick="promptAddInterface(${nodeData.rawId})" style="padding:0.2rem 0.5rem; font-size:0.75rem;">+ Add Port</button>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Port</th>
            <th>IP</th>
            <th>Speed</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${ifacesHtml || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">No interfaces</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

function onSelectEdge(edgeData) {
  selectedEntity = edgeData ? { type: 'edge', data: edgeData } : null;
  const inspector = document.getElementById("inspector-body");
  if (!edgeData) return;

  document.querySelector('[data-tab="tab-inspector"]').click();

  inspector.innerHTML = `
    <div class="panel-card">
      <div class="card-title">
        <span>Link Details (ID: ${edgeData.rawId})</span>
        <span class="status-badge ${edgeData.status === 'up' ? 'badge-success' : 'badge-critical'}">${edgeData.status}</span>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Bandwidth (Mbps)</label>
          <input type="number" id="edit-link-bw" value="${edgeData.bandwidth_mbps}">
        </div>
        <div class="form-group">
          <label>Latency (ms)</label>
          <input type="number" step="0.1" id="edit-link-lat" value="${edgeData.latency_ms}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Metric Cost</label>
          <input type="number" id="edit-link-cost" value="${edgeData.cost}">
        </div>
        <div class="form-group">
          <label>Status</label>
          <select id="edit-link-status">
            <option value="up" ${edgeData.status === 'up' ? 'selected' : ''}>UP</option>
            <option value="down" ${edgeData.status === 'down' ? 'selected' : ''}>DOWN</option>
          </select>
        </div>
      </div>
      <button class="btn-primary" onclick="saveLinkEdit(${edgeData.rawId})">Update Link</button>
      <button class="btn-danger" style="margin-top:0.25rem;" onclick="deleteSelectedLink(${edgeData.rawId})">Delete Link</button>
    </div>
  `;
}

async function onNodeMoved(nodeId, x, y) {
  try {
    const numericId = typeof nodeId === 'string' && nodeId.startsWith('dev_') 
      ? parseInt(nodeId.replace('dev_', '')) 
      : parseInt(nodeId);
    if (!isNaN(numericId)) {
      await apiClient.updateDevice(numericId, { x_pos: Math.round(x), y_pos: Math.round(y) });
    }
  } catch (e) {
    console.error("Failed to save coordinates", e);
  }
}

async function saveDeviceEdit(deviceId) {
  const name = document.getElementById("edit-dev-name").value;
  const status = document.getElementById("edit-dev-status").value;
  try {
    await apiClient.updateDevice(deviceId, { name, status });
    showToast("Device updated successfully!", "success");
    await refreshCurrentTopology();
  } catch (err) {
    showToast("Update failed: " + err.message, "danger");
  }
}

async function deleteSelectedDevice(deviceId) {
  if (!confirm("Delete this device and connected links?")) return;
  try {
    await apiClient.deleteDevice(deviceId);
    showToast("Device deleted.", "success");
    onSelectNode(null);
    await refreshCurrentTopology();
  } catch (err) {
    showToast("Delete failed: " + err.message, "danger");
  }
}

async function saveLinkEdit(linkId) {
  const bandwidth_mbps = parseInt(document.getElementById("edit-link-bw").value);
  const latency_ms = parseFloat(document.getElementById("edit-link-lat").value);
  const cost = parseInt(document.getElementById("edit-link-cost").value);
  const status = document.getElementById("edit-link-status").value;

  try {
    await apiClient.updateLink(linkId, { bandwidth_mbps, latency_ms, cost, status });
    showToast("Link parameters saved!", "success");
    await refreshCurrentTopology();
  } catch (err) {
    showToast("Update failed: " + err.message, "danger");
  }
}

async function deleteSelectedLink(linkId) {
  if (!confirm("Delete this link?")) return;
  try {
    await apiClient.deleteLink(linkId);
    showToast("Link deleted.", "success");
    onSelectEdge(null);
    await refreshCurrentTopology();
  } catch (err) {
    showToast("Delete failed: " + err.message, "danger");
  }
}

async function promptAddInterface(deviceId) {
  const name = prompt("Interface Port Name (e.g. GigabitEthernet0/2):", "Gi0/2");
  if (!name) return;
  const ip = prompt("IP Address (optional, e.g. 192.168.10.1):", "");

  try {
    await apiClient.createInterface({
      device_id: deviceId,
      name,
      ip_address: ip || null,
      speed_mbps: 1000,
      status: "up"
    });
    showToast("Interface created!", "success");
    await refreshCurrentTopology();
  } catch (err) {
    showToast("Create interface error: " + err.message, "danger");
  }
}

function setupEventListeners() {
  // Device Palette Click to Add
  document.querySelectorAll(".device-drag-item").forEach(item => {
    item.addEventListener("click", async () => {
      if (!currentTopologyId) {
        showToast("Select or create a topology first.", "warning");
        return;
      }
      const type = item.dataset.type;
      const count = (currentTopologyData?.devices?.length || 0) + 1;
      const prefix = type.split('_')[0].toUpperCase();
      const name = `${prefix}-${count.toString().padStart(2, '0')}`;

      try {
        const dev = await apiClient.createDevice({
          topology_id: currentTopologyId,
          name,
          device_type: type,
          x_pos: 200 + Math.random() * 300,
          y_pos: 200 + Math.random() * 200,
          status: "up"
        });
        // Auto-create default interface
        await apiClient.createInterface({
          device_id: dev.id,
          name: "eth0",
          speed_mbps: 1000,
          status: "up"
        });
        showToast(`Added ${name} to topology.`, "success");
        await refreshCurrentTopology();
      } catch (e) {
        showToast("Failed to add device: " + e.message, "danger");
      }
    });
  });

  // Project selector change
  document.getElementById("select-project").addEventListener("change", async (e) => {
    currentProjectId = parseInt(e.target.value);
    await loadTopologiesForProject(currentProjectId);
  });

  // Topology selector change
  document.getElementById("select-topology").addEventListener("change", async (e) => {
    currentTopologyId = parseInt(e.target.value);
    await refreshCurrentTopology();
  });

  // Template button
  document.getElementById("btn-load-template").addEventListener("click", () => {
    document.getElementById("modal-template").style.display = "flex";
  });

  // Export JSON
  document.getElementById("btn-export-json").addEventListener("click", async () => {
    if (!currentTopologyId) return;
    try {
      const data = await apiClient.exportTopology(currentTopologyId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.name.replace(/\s+/g, '_')}_export.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Topology exported successfully!", "success");
    } catch (e) {
      showToast("Export failed: " + e.message, "danger");
    }
  });

  // Import JSON trigger
  const fileInput = document.getElementById("file-import-json");
  document.getElementById("btn-import-json").addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file || !currentProjectId) return;
    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const payload = JSON.parse(evt.target.result);
        const top = await apiClient.importTopology(currentProjectId, payload);
        showToast(`Imported "${top.name}" successfully!`, "success");
        await loadTopologiesForProject(currentProjectId);
      };
      reader.readAsText(file);
    } catch (err) {
      showToast("Import failed: " + err.message, "danger");
    }
  });

  // Graph Layout buttons
  document.getElementById("btn-layout-cose").addEventListener("click", () => graph.autoLayout("cose"));
  document.getElementById("btn-layout-grid").addEventListener("click", () => graph.autoLayout("grid"));
  document.getElementById("btn-fit-canvas").addEventListener("click", () => graph.cy.fit(null, 40));
  document.getElementById("btn-clear-highlights").addEventListener("click", () => graph.clearHighlights());

  // Link Drawer Mode Toggle
  let linkStartNode = null;
  document.getElementById("btn-connect-link").addEventListener("click", () => {
    if (!selectedEntity || selectedEntity.type !== 'node') {
      showToast("Select a source device first, then click Connect Link.", "warning");
      return;
    }
    linkStartNode = selectedEntity.data;
    showToast(`Source: ${linkStartNode.name}. Now click a target device.`, "info");

    const onNextNode = async (targetNodeData) => {
      if (!targetNodeData || targetNodeData.rawId === linkStartNode.rawId) {
        showToast("Link creation cancelled.", "info");
        return;
      }
      try {
        // Find or create ports for both
        const srcIfaces = linkStartNode.interfaces || [];
        const tgtIfaces = targetNodeData.interfaces || [];
        let srcIf = srcIfaces[0];
        let tgtIf = tgtIfaces[0];

        if (!srcIf) {
          srcIf = await apiClient.createInterface({ device_id: linkStartNode.rawId, name: `eth${srcIfaces.length}`, speed_mbps: 1000 });
        }
        if (!tgtIf) {
          tgtIf = await apiClient.createInterface({ device_id: targetNodeData.rawId, name: `eth${tgtIfaces.length}`, speed_mbps: 1000 });
        }

        await apiClient.createLink({
          topology_id: currentTopologyId,
          source_interface_id: srcIf.id,
          target_interface_id: tgtIf.id,
          bandwidth_mbps: 1000,
          latency_ms: 1.0,
          cost: 10,
          status: "up"
        });

        showToast(`Connected ${linkStartNode.name} to ${targetNodeData.name}!`, "success");
        await refreshCurrentTopology();
      } catch (err) {
        showToast("Failed to link: " + err.message, "danger");
      }
    };

    // One-time tap on next node
    graph.cy.one('tap', 'node', (evt) => {
      onNextNode(evt.target.data());
    });
  });

  // Simulation scenario execution buttons
  document.getElementById("btn-run-sim-path").addEventListener("click", runPathSimulation);
  document.getElementById("btn-run-sim-failure").addEventListener("click", runFailureSimulation);
  document.getElementById("btn-run-sim-traffic").addEventListener("click", runTrafficSimulation);
  document.getElementById("btn-run-sim-spof").addEventListener("click", runRedundancySimulation);
  document.getElementById("btn-run-sim-reachability").addEventListener("click", runReachabilitySimulation);

  // VLSM calculate button
  document.getElementById("btn-calc-vlsm").addEventListener("click", runVLSMCalculator);
}

// Load Template helper
async function loadTemplate(name) {
  if (!currentProjectId) return;
  try {
    const top = await apiClient.loadTemplate(currentProjectId, name);
    document.getElementById("modal-template").style.display = "none";
    showToast(`Template "${top.name}" loaded!`, "success");
    await loadTopologiesForProject(currentProjectId);
  } catch (err) {
    showToast("Template load error: " + err.message, "danger");
  }
}

// --- Simulation Handlers ---

async function runPathSimulation() {
  const srcId = parseInt(document.getElementById("sim-src-device").value);
  const tgtId = parseInt(document.getElementById("sim-tgt-device").value);
  const metric = document.getElementById("sim-metric").value;

  if (!srcId || !tgtId) {
    showToast("Please choose both source and target devices.", "warning");
    return;
  }

  try {
    const res = await apiClient.simulatePath(currentTopologyId, srcId, tgtId, metric);
    const resultsDiv = document.getElementById("sim-results-output");

    if (!res.path_found) {
      graph.clearHighlights();
      resultsDiv.innerHTML = `<div class="status-badge badge-critical" style="padding:0.5rem;width:100%;text-align:center;">No valid path found between selected devices.</div>`;
      return;
    }

    graph.highlightPath(res.path_nodes, res.path_edges);

    resultsDiv.innerHTML = `
      <div class="panel-card" style="border-color:var(--accent-orange); box-shadow: 0 0 20px rgba(255, 98, 0, 0.2);">
        <div class="card-title" style="color:var(--accent-amber)">
          <span>Path Computed Successfully</span>
          <span class="status-badge badge-success">Cost: ${res.total_cost}</span>
        </div>
        <div style="font-size:0.8rem; display:flex; flex-direction:column; gap:0.25rem;">
          <div><b>Latency:</b> ${res.total_latency_ms} ms</div>
          <div><b>Bottleneck Capacity:</b> ${res.bottleneck_bandwidth_mbps >= 1000 ? (res.bottleneck_bandwidth_mbps/1000) + ' Gbps' : res.bottleneck_bandwidth_mbps + ' Mbps'}</div>
          <div><b>Hops (${res.hops.length}):</b> ${res.hops.map(h => h.device_name).join(' &rarr; ')}</div>
        </div>
      </div>
    `;
  } catch (err) {
    showToast("Path calculation error: " + err.message, "danger");
  }
}

async function runFailureSimulation() {
  if (!currentTopologyData) return;
  // Get currently selected node or prompt
  let failedDevIds = [];
  if (selectedEntity && selectedEntity.type === 'node') {
    failedDevIds.push(selectedEntity.data.rawId);
  } else if (currentTopologyData.devices.length > 0) {
    failedDevIds.push(currentTopologyData.devices[0].id);
  }

  try {
    const res = await apiClient.simulateFailure(currentTopologyId, failedDevIds, []);
    graph.highlightFailures(failedDevIds, [], res.isolated_device_ids);

    const resultsDiv = document.getElementById("sim-results-output");
    resultsDiv.innerHTML = `
      <div class="panel-card" style="border-color:var(--accent-red)">
        <div class="card-title" style="color:var(--accent-red)">
          <span>Failure Resilience Impact</span>
          <span class="status-badge badge-critical">Partitions: ${res.post_failure_partitions_count}</span>
        </div>
        <div style="font-size:0.8rem; display:flex; flex-direction:column; gap:0.25rem;">
          <div><b>Simulated Failed Nodes:</b> ${failedDevIds.length}</div>
          <div><b>Isolated Devices:</b> ${res.isolated_device_names.join(', ') || 'None'}</div>
          <div><b>Rerouted Flows:</b> ${res.rerouted_flows_count}</div>
          <div><b>Dropped Flows:</b> ${res.dropped_flows_count}</div>
        </div>
      </div>
    `;
  } catch (err) {
    showToast("Failure simulation error: " + err.message, "danger");
  }
}

async function runTrafficSimulation() {
  try {
    const res = await apiClient.simulateTraffic(currentTopologyId);
    graph.highlightTraffic(res.link_metrics);

    const resultsDiv = document.getElementById("sim-results-output");
    resultsDiv.innerHTML = `
      <div class="panel-card" style="border-color:${res.congested_links_count > 0 ? 'var(--accent-red)' : 'var(--accent-green)'}">
        <div class="card-title">
          <span>Traffic Utilization Map</span>
          <span class="status-badge ${res.congested_links_count > 0 ? 'badge-critical' : 'badge-success'}">
            ${res.congested_links_count} Congested (>80%)
          </span>
        </div>
        <div style="font-size:0.8rem; display:flex; flex-direction:column; gap:0.25rem;">
          <div><b>Total Offered Load:</b> ${res.total_offered_load_mbps} Mbps</div>
          <div><b>Delivered Flows:</b> ${res.flows.filter(f => f.delivered).length} / ${res.flows.length}</div>
          <div><b>Saturated Links:</b> ${res.saturated_links_count}</div>
        </div>
      </div>
    `;
  } catch (err) {
    showToast("Traffic simulation error: " + err.message, "danger");
  }
}

async function runRedundancySimulation() {
  try {
    const res = await apiClient.simulateRedundancy(currentTopologyId);
    graph.highlightRedundancy(res.articulation_device_ids, res.bridge_link_ids);

    const resultsDiv = document.getElementById("sim-results-output");
    resultsDiv.innerHTML = `
      <div class="panel-card" style="border-color:var(--accent-yellow)">
        <div class="card-title">
          <span>Single Point of Failure (SPOF)</span>
          <span class="status-badge ${res.redundancy_score >= 80 ? 'badge-success' : 'badge-warning'}">
            Resilience: ${res.redundancy_score}%
          </span>
        </div>
        <div style="font-size:0.8rem; display:flex; flex-direction:column; gap:0.25rem;">
          <div><b>Articulation Nodes (SPOF):</b> ${res.articulation_device_names.join(', ') || 'None (Multi-homed)'}</div>
          <div><b>Bridge Links:</b> ${res.bridge_link_ids.length} critical link(s)</div>
          <div><b>Recommendation:</b> ${res.recommendations[0] || 'Design has full multi-tier redundancy.'}</div>
        </div>
      </div>
    `;
  } catch (err) {
    showToast("Redundancy analysis error: " + err.message, "danger");
  }
}

async function runReachabilitySimulation() {
  try {
    const res = await apiClient.simulateReachability(currentTopologyId);
    const resultsDiv = document.getElementById("sim-results-output");
    resultsDiv.innerHTML = `
      <div class="panel-card">
        <div class="card-title">
          <span>All-Pairs Reachability Matrix</span>
          <span class="status-badge ${res.reachability_percentage === 100 ? 'badge-success' : 'badge-warning'}">
            ${res.reachability_percentage}% Connected
          </span>
        </div>
        <div style="font-size:0.8rem;">
          Reachable Pairs: <b>${res.reachable_pairs_count}</b> / ${res.total_pairs} total pairs evaluated.
        </div>
      </div>
    `;
  } catch (err) {
    showToast("Reachability error: " + err.message, "danger");
  }
}

// --- Health & Validation ---

async function runHealthValidation() {
  if (!currentTopologyId) return;
  try {
    const rep = await apiClient.validateDesign(currentTopologyId);
    const scoreElem = document.getElementById("health-score-val");
    const gradeElem = document.getElementById("health-grade-val");
    const issuesList = document.getElementById("validation-issues-list");

    scoreElem.textContent = rep.health_score;
    gradeElem.textContent = `Grade ${rep.grade}`;

    const gauge = document.querySelector(".health-gauge");
    if (rep.health_score >= 85) {
      gauge.style.borderColor = "var(--accent-orange)";
      gauge.style.color = "var(--accent-amber)";
      gauge.style.boxShadow = "0 0 25px rgba(255, 98, 0, 0.45)";
    } else if (rep.health_score >= 70) {
      gauge.style.borderColor = "var(--accent-yellow)";
      gauge.style.color = "var(--accent-yellow)";
      gauge.style.boxShadow = "0 0 20px rgba(245, 158, 11, 0.4)";
    } else {
      gauge.style.borderColor = "var(--accent-red)";
      gauge.style.color = "var(--accent-red)";
      gauge.style.boxShadow = "0 0 20px rgba(239, 68, 68, 0.4)";
    }

    if (rep.issues.length === 0) {
      issuesList.innerHTML = `<div style="color:var(--accent-green);font-size:0.8rem;text-align:center;padding:1rem;">All enterprise validation rules passed with zero defects!</div>`;
      return;
    }

    issuesList.innerHTML = rep.issues.map(iss => `
      <div class="panel-card" style="border-left: 3px solid ${iss.severity === 'critical' ? 'var(--accent-red)' : 'var(--accent-yellow)'}">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <b style="font-size:0.8rem;">${iss.title}</b>
          <span class="status-badge ${iss.severity === 'critical' ? 'badge-critical' : 'badge-warning'}">${iss.severity.toUpperCase()}</span>
        </div>
        <div style="font-size:0.75rem; color:var(--text-muted);">${iss.description}</div>
        <div style="font-size:0.75rem; color:var(--accent-cyan);"><b>Remedy:</b> ${iss.remediation}</div>
      </div>
    `).join('');
  } catch (err) {
    showToast("Validation check failed: " + err.message, "danger");
  }
}

// --- IPAM & VLSM Calculator ---

async function refreshIPAMList() {
  if (!currentTopologyId) return;
  try {
    const subnets = await apiClient.getSubnets(currentTopologyId);
    const tbody = document.getElementById("subnets-tbody");
    if (!tbody) return;

    if (subnets.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">No subnets configured</td></tr>';
      return;
    }

    tbody.innerHTML = subnets.map(s => `
      <tr>
        <td><b>${s.name}</b></td>
        <td>${s.cidr}</td>
        <td>${s.gateway_ip || '-'}</td>
        <td>
          <button onclick="allocateNextIp(${s.id})" style="padding:0.2rem 0.4rem;font-size:0.7rem;">+ Next IP</button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    console.error("IPAM list error", e);
  }
}

async function allocateNextIp(subnetId) {
  try {
    const res = await apiClient.allocateIp(subnetId);
    showToast(`Allocated IP: ${res.allocated_ip}`, "success");
    await refreshIPAMList();
  } catch (err) {
    showToast("Allocation failed: " + err.message, "danger");
  }
}

async function runVLSMCalculator() {
  const majorNetwork = document.getElementById("vlsm-base-net").value;
  const inputDepts = document.getElementById("vlsm-depts-input").value;

  const lines = inputDepts.split('\n').filter(l => l.trim().length > 0);
  const departments = lines.map(line => {
    const parts = line.split(':');
    return {
      name: parts[0]?.trim() || "Dept",
      needed_hosts: parseInt(parts[1]?.trim() || "10")
    };
  });

  try {
    const res = await apiClient.calculateVlsm(majorNetwork, departments);
    const container = document.getElementById("vlsm-results-table");

    container.innerHTML = `
      <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:0.4rem;">
        Major Network: <b>${res.major_network}</b> | Total Capacity: <b>${res.total_allocated_capacity} hosts</b>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Dept</th>
            <th>CIDR</th>
            <th>Usable Range</th>
            <th>Hosts</th>
          </tr>
        </thead>
        <tbody>
          ${res.subnets.map(s => `
            <tr>
              <td><b>${s.name}</b></td>
              <td>${s.network_address}/${s.prefix_length}</td>
              <td>${s.usable_range_start} - ${s.usable_range_end}</td>
              <td>${s.allocated_hosts} (need ${s.needed_hosts})</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    showToast("VLSM error: " + err.message, "danger");
  }
}

// Toast notification
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = "toast";
  if (type === "danger") toast.style.borderColor = "var(--accent-red)";
  if (type === "success") toast.style.borderColor = "var(--accent-green)";
  if (type === "warning") toast.style.borderColor = "var(--accent-yellow)";
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

// Expose functions called by HTML onclick handlers
window.saveDeviceEdit = saveDeviceEdit;
window.deleteSelectedDevice = deleteSelectedDevice;
window.saveLinkEdit = saveLinkEdit;
window.deleteSelectedLink = deleteSelectedLink;
window.promptAddInterface = promptAddInterface;
window.allocateNextIp = allocateNextIp;
window.runHealthValidation = runHealthValidation;
window.loadTemplate = loadTemplate;




// =========================================================================
// NETSPHERE VERTICAL SHUTTER LOUVERS INTRO CONTROLLER
// =========================================================================

function setupIntroScreen() {
  const intro = document.getElementById("intro-screen");
  if (!intro) return;

  // Check live backend connectivity on load
  if (window.apiClient) {
    apiClient.getProjects().then(() => {
      const statusText = document.getElementById("intro-backend-status-text");
      if (statusText) statusText.textContent = "Backend Simulation Engine Online • FastAPI & NetworkX Active";
    }).catch(err => {
      console.warn("Backend handshake notice:", err);
      const statusText = document.getElementById("intro-backend-status-text");
      if (statusText) statusText.textContent = "Simulation Engine Active • Local / Client Mode Ready";
    });
  }

  const exitIntro = (callback) => {
    if (intro.classList.contains("leaving")) {
      if (typeof callback === "function") callback();
      return;
    }
    intro.classList.add("leaving");
    setTimeout(() => {
      intro.style.display = "none";
      if (graph && graph.cy) {
        graph.cy.resize().fit(null, 30);
      }
      if (typeof callback === "function") {
        callback();
      }
    }, 700);
  };

  const reopenIntro = () => {
    intro.style.display = "flex";
    intro.classList.remove("leaving");
  };

  // Intro Frosted Capsule Pill Navigation Tabs
  const introNavLinks = intro.querySelectorAll(".intro-nav-link");
  introNavLinks.forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      introNavLinks.forEach(l => l.classList.remove("active"));
      link.classList.add("active");
      const target = link.dataset.introTarget || "canvas";

      exitIntro(async () => {
        if (target === "canvas") {
          switchDrawerTab("tab-inspector");
          if (graph && graph.cy) {
            graph.clearHighlights();
            graph.cy.resize().fit(null, 30);
          }
          showToast("Topology Canvas Ready: Connected to Backend", "success");
        } else if (target === "path") {
          switchDrawerTab("tab-simulation");
          const card = document.getElementById("card-sim-path");
          if (card) card.scrollIntoView({ behavior: "smooth" });
          showToast("Routing Engine: Select endpoints to calculate shortest path", "info");
        } else if (target === "outage") {
          switchDrawerTab("tab-simulation");
          const card = document.getElementById("card-sim-failure");
          if (card) card.scrollIntoView({ behavior: "smooth" });
          showToast("Failure Outage: Select a device or link to cut and test failover", "info");
        } else if (target === "traffic") {
          switchDrawerTab("tab-simulation");
          const card = document.getElementById("card-sim-traffic");
          if (card) card.scrollIntoView({ behavior: "smooth" });
          await runTrafficSimulation();
        } else if (target === "spof") {
          switchDrawerTab("tab-simulation");
          const card = document.getElementById("card-sim-spof");
          if (card) card.scrollIntoView({ behavior: "smooth" });
          await runRedundancySimulation();
        } else if (target === "ipam") {
          switchDrawerTab("tab-ipam");
          const card = document.getElementById("card-ipam-vlsm");
          if (card) card.scrollIntoView({ behavior: "smooth" });
          showToast("IPAM & VLSM Subnet Planner Active", "info");
        }
      });
    });
  });

  // Floating Circuit Badges
  const circuitBadges = intro.querySelectorAll(".floating-circuit-badge");
  circuitBadges.forEach(badge => {
    badge.addEventListener("click", () => {
      const target = badge.dataset.badgeTarget;
      exitIntro(() => {
        if (target === "core") {
          if (currentTopologyData && graph) {
            const coreDevs = currentTopologyData.devices.filter(d => d.device_type === "router");
            graph.highlightPath(coreDevs.map(d => d.id), []);
            showToast("Highlighted Core Backbone Transit Routers", "info");
          }
        } else if (target === "dist") {
          if (currentTopologyData && graph) {
            const distDevs = currentTopologyData.devices.filter(d => d.device_type === "l3_switch" || d.device_type === "l2_switch");
            graph.highlightPath(distDevs.map(d => d.id), []);
            showToast("Highlighted Spine-Leaf Distribution Switches", "info");
          }
        } else if (target === "path") {
          switchDrawerTab("tab-simulation");
          const simMetric = document.getElementById("sim-metric");
          if (simMetric) simMetric.value = "latency";
          runPathSimulation();
        } else if (target === "gateway") {
          if (currentTopologyData && currentTopologyData.devices.length > 0) {
            const gw = currentTopologyData.devices.find(d => d.device_type === "router") || currentTopologyData.devices[0];
            onSelectNode(gw);
            if (graph && graph.cy) {
              const node = graph.cy.getElementById(gw.id);
              if (node && node.length > 0) {
                graph.cy.center(node);
                node.select();
              }
            }
          }
        } else if (target === "firewall") {
          if (currentTopologyData && currentTopologyData.devices.length > 0) {
            const fw = currentTopologyData.devices.find(d => d.device_type === "firewall") || currentTopologyData.devices[0];
            onSelectNode(fw);
            if (graph && graph.cy) {
              const node = graph.cy.getElementById(fw.id);
              if (node && node.length > 0) {
                graph.cy.center(node);
                node.select();
              }
            }
          }
        } else if (target === "ipam") {
          switchDrawerTab("tab-ipam");
          showToast("IPAM / VLSM Subnet Planner Ready", "info");
        }
      });
    });
  });

  // Exit Buttons
  const applyBtn = document.getElementById("btn-hero-apply");
  const orbBtn = document.getElementById("btn-portal-orb");
  const joinBtn = document.getElementById("btn-intro-join");
  const learnBtn = document.getElementById("btn-hero-learn");
  const logoBtn = document.getElementById("btn-intro-logo");

  if (applyBtn) applyBtn.addEventListener("click", () => exitIntro());
  if (orbBtn) orbBtn.addEventListener("click", () => exitIntro());
  if (joinBtn) joinBtn.addEventListener("click", () => exitIntro());
  if (logoBtn) logoBtn.addEventListener("click", () => exitIntro());

  // Documentation Button Opens the Platform Architecture & Engine Modal
  if (learnBtn) {
    learnBtn.addEventListener("click", () => {
      const docModal = document.getElementById("modal-documentation");
      if (docModal) docModal.style.display = "flex";
    });
  }

  // Wheel down scroll to exit
  intro.addEventListener("wheel", (e) => {
    if (e.deltaY > 20) {
      exitIntro();
    }
  }, { passive: true });

  // Keyboard shortcut to exit
  window.addEventListener("keydown", (e) => {
    if (intro.style.display !== "none" && !intro.classList.contains("leaving")) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        exitIntro();
      }
    }
  });

  // Replay intro button in top header
  const replayBtn = document.getElementById("btn-replay-intro");
  if (replayBtn) replayBtn.addEventListener("click", reopenIntro);
}

window.setupIntroScreen = setupIntroScreen;
window.switchDrawerTab = switchDrawerTab;
