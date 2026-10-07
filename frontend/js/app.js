/**
 * CoinSphere / NetSphere Dashboard Application Controller
 */

let graph = null;
let currentProjectId = null;
let currentTopologyId = null;
let currentTopologyData = null;
let selectedEntity = null; // { type: "node" | "edge", data: {...} }

// Initialize application on DOM loaded
document.addEventListener("DOMContentLoaded", async () => {
  setupNavigationEvents();
  setupEventListeners();

  // Initialize Graph Canvas inside embedded card container
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

  // Resize graph canvas to fit the card container
  setTimeout(() => {
    if (graph && graph.cy) graph.cy.resize().fit(null, 30);
  }, 300);
});

function updateUserUI() {
  const user = apiClient.user;
  const userBtn = document.getElementById("btn-auth-profile");
  const avatar = document.getElementById("user-avatar-tag");
  const nameEl = document.getElementById("user-display-name");
  const roleEl = document.getElementById("user-display-role");

  if (user) {
    if (nameEl) nameEl.textContent = user.full_name || "Chief Architect";
    if (roleEl) roleEl.textContent = `${user.role.toUpperCase()} ACCOUNT`;
    if (avatar) {
      const initials = (user.full_name || "DK").split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
      avatar.textContent = initials || "DK";
    }
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
    updateMetricsDeck(devices, links);
    renderTopTokensList(devices, links);
    await runHealthValidation(false); // quiet health check to update arc gauge
  } catch (err) {
    showToast("Failed to load topology: " + err.message, "danger");
  }
}

function updateMetricsDeck(devices, links) {
  const routers = devices.filter(d => d.device_type === "router");
  const switches = devices.filter(d => d.device_type === "l3_switch" || d.device_type === "l2_switch");

  // Card 1: BTC / Core Tier
  const btcFig = document.getElementById("metric-btc-figure");
  const btcSub = document.getElementById("metric-btc-sub");
  if (btcFig) {
    btcFig.textContent = routers.length > 0 ? `0.${(routers.length * 112450).toString().padStart(6, "0")}` : "0.895260";
  }
  if (btcSub) {
    btcSub.textContent = `$126,223.00 • ${routers.length * 10} Gbps Trunk`;
  }

  // Card 3: ETH / Distribution Tier
  const ethFig = document.getElementById("metric-eth-figure");
  const ethSub = document.getElementById("metric-eth-sub");
  if (ethFig) {
    ethFig.textContent = switches.length > 0 ? `${switches.length}.95564` : "2.95564";
  }
  if (ethSub) {
    ethSub.textContent = `$126,223.00 • ${links.length} Links Active`;
  }
}

// Update the Iconic Semicircular Arc Gauge Needle
function updateArcGauge(score) {
  const gaugeFigure = document.getElementById("gauge-center-figure");
  const gaugeSub = document.getElementById("gauge-center-sub");
  const sliderMarker = document.getElementById("gauge-slider-marker");

  if (gaugeFigure) gaugeFigure.textContent = `${score}% Valid`;
  if (gaugeSub) gaugeSub.textContent = score >= 80 ? "Architecture Optimal" : "Attention Recommended";

  // Calculate arc position:
  // Center: (120, 110), Radius R = 95
  // angle in radians: 0% -> Math.PI (180 deg), 100% -> 0 (0 deg)
  const clampedScore = Math.max(5, Math.min(98, score));
  const angleRad = Math.PI - (clampedScore / 100) * Math.PI;
  const cx = 120;
  const cy = 110;
  const r = 95;

  const posX = cx + r * Math.cos(angleRad);
  const posY = cy - r * Math.sin(angleRad);
  // Tangent angle in degrees: angle in deg is angleRad * 180 / Math.PI; tangent is perpendicular
  const rotDeg = 90 - (angleRad * 180 / Math.PI);

  if (sliderMarker) {
    sliderMarker.setAttribute("transform", `translate(${posX.toFixed(1)}, ${posY.toFixed(1)}) rotate(${rotDeg.toFixed(1)})`);
  }
}

// Render the Top Tokens / Critical Devices List
function renderTopTokensList(devices, links) {
  const container = document.getElementById("token-items-list");
  if (!container) return;

  if (!devices || devices.length === 0) {
    container.innerHTML = "<div style=\"color:var(--text-dim); text-align:center; padding:1.5rem 0; font-size:0.8rem;\">No nodes available</div>";
    return;
  }

  const iconClasses = ["icon-blue", "icon-yellow", "icon-green", "icon-purple", "icon-orange"];
  const symbolMap = {
    router: "B",
    l3_switch: "❖",
    l2_switch: "⬡",
    firewall: "🛡",
    server: "⚙",
    endpoint: "💻"
  };

  const sampleTokens = [
    { name: "Chainlink", sub: "100%", val: "1000", subVal: "$1000" },
    { name: "Binance", sub: "100%", val: "8000", subVal: "$8000" },
    { name: "USDT", sub: "100%", val: "4000", subVal: "$4000" },
    { name: "Solana", sub: "100%", val: "2000", subVal: "$2000" }
  ];

  container.innerHTML = devices.slice(0, 6).map((d, index) => {
    const iconClass = iconClasses[index % iconClasses.length];
    const symbol = symbolMap[d.device_type] || "●";
    const sample = sampleTokens[index % sampleTokens.length];
    const ifaceCount = (d.interfaces || []).length;
    const speed = ifaceCount > 0 ? (ifaceCount * 1000) : 1000;

    return `
      <div class="token-row-item" onclick="inspectDeviceById(${d.id})">
        <div class="token-row-left">
          <div class="token-row-icon ${iconClass}">${symbol}</div>
          <div class="token-row-meta">
            <div class="token-row-name">${d.name}</div>
            <div class="token-row-sub">${d.status === "up" ? "100% UP" : "DOWN"}</div>
          </div>
        </div>
        <div class="token-row-right">
          <div class="token-row-figures">
            <div class="token-row-main-val">${speed}</div>
            <div class="token-row-sub-val">${sample.subVal}</div>
          </div>
          <div class="token-chevron">&rsaquo;</div>
        </div>
      </div>
    `;
  }).join("");
}

function inspectDeviceById(deviceId) {
  if (!currentTopologyData) return;
  const dev = currentTopologyData.devices.find(d => d.id === deviceId);
  if (dev) {
    onSelectNode({
      rawId: dev.id,
      name: dev.name,
      device_type: dev.device_type,
      status: dev.status,
      vendor: dev.vendor,
      model: dev.model,
      interfaces: dev.interfaces || []
    });
  }
}

function populateDeviceSelects(devices) {
  const simSrc = document.getElementById("sim-src-device");
  const simTgt = document.getElementById("sim-tgt-device");
  if (!simSrc || !simTgt) return;

  simSrc.innerHTML = "<option value=\"\">-- Select Source --</option>";
  simTgt.innerHTML = "<option value=\"\">-- Select Target --</option>";

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

// On node selected from canvas or list
function onSelectNode(nodeData) {
  selectedEntity = nodeData ? { type: "node", data: nodeData } : null;
  const modal = document.getElementById("modal-inspector");
  const modalBody = document.getElementById("inspector-modal-body");
  const modalTitle = document.getElementById("inspector-modal-title");

  if (!nodeData) {
    if (modal) modal.style.display = "none";
    return;
  }

  if (modalTitle) modalTitle.textContent = `Device: ${nodeData.name}`;

  let ifacesHtml = (nodeData.interfaces || []).map(i => `
    <tr>
      <td style="padding:0.4rem; border-bottom:1px solid rgba(255,255,255,0.05);"><b>${i.name}</b></td>
      <td style="padding:0.4rem; border-bottom:1px solid rgba(255,255,255,0.05);">${i.ip_address || "-"}</td>
      <td style="padding:0.4rem; border-bottom:1px solid rgba(255,255,255,0.05);">${i.speed_mbps >= 1000 ? (i.speed_mbps/1000) + "G" : i.speed_mbps + "M"}</td>
      <td style="padding:0.4rem; border-bottom:1px solid rgba(255,255,255,0.05);"><span style="color:${i.status === "up" ? "#10b981" : "#ef4444"}; font-weight:600;">${i.status}</span></td>
    </tr>
  `).join("");

  modalBody.innerHTML = `
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
          <option value="up" ${nodeData.status === "up" ? "selected" : ""}>UP</option>
          <option value="down" ${nodeData.status === "down" ? "selected" : ""}>DOWN</option>
        </select>
      </div>
    </div>
    <button class="btn-primary-action" onclick="saveDeviceEdit(${nodeData.rawId})">Save Changes</button>
    <button class="btn-danger-action" onclick="deleteSelectedDevice(${nodeData.rawId})">Delete Device</button>

    <div style="margin-top:1.5rem;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
        <span style="font-size:0.85rem; font-weight:700;">Interfaces (${(nodeData.interfaces || []).length})</span>
        <button class="pill-action-btn" onclick="promptAddInterface(${nodeData.rawId})">+ Add Port</button>
      </div>
      <table style="width:100%; border-collapse:collapse; font-size:0.75rem; text-align:left;">
        <thead>
          <tr style="color:var(--text-dim);">
            <th style="padding:0.3rem;">Port</th>
            <th style="padding:0.3rem;">IP</th>
            <th style="padding:0.3rem;">Speed</th>
            <th style="padding:0.3rem;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${ifacesHtml || "<tr><td colspan=\"4\" style=\"text-align:center; color:var(--text-dim); padding:1rem;\">No interfaces</td></tr>"}
        </tbody>
      </table>
    </div>
  `;

  if (modal) modal.style.display = "flex";
}

function onSelectEdge(edgeData) {
  selectedEntity = edgeData ? { type: "edge", data: edgeData } : null;
  const modal = document.getElementById("modal-inspector");
  const modalBody = document.getElementById("inspector-modal-body");
  const modalTitle = document.getElementById("inspector-modal-title");

  if (!edgeData) {
    if (modal) modal.style.display = "none";
    return;
  }

  if (modalTitle) modalTitle.textContent = `Link (ID: ${edgeData.rawId})`;

  modalBody.innerHTML = `
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
        <label>Cost</label>
        <input type="number" id="edit-link-cost" value="${edgeData.cost}">
      </div>
      <div class="form-group">
        <label>Status</label>
        <select id="edit-link-status">
          <option value="up" ${edgeData.status === "up" ? "selected" : ""}>UP</option>
          <option value="down" ${edgeData.status === "down" ? "selected" : ""}>DOWN</option>
        </select>
      </div>
    </div>
    <button class="btn-primary-action" onclick="saveLinkEdit(${edgeData.rawId})">Update Link</button>
    <button class="btn-danger-action" onclick="deleteSelectedLink(${edgeData.rawId})">Delete Link</button>
  `;

  if (modal) modal.style.display = "flex";
}

async function onNodeMoved(nodeId, x, y) {
  try {
    const numericId = typeof nodeId === "string" && nodeId.startsWith("dev_")
      ? parseInt(nodeId.replace("dev_", ""))
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
    document.getElementById("modal-inspector").style.display = "none";
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
    document.getElementById("modal-inspector").style.display = "none";
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
    document.getElementById("modal-inspector").style.display = "none";
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
    document.getElementById("modal-inspector").style.display = "none";
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

function setupNavigationEvents() {
  // Sidebar Navigation Items
  const navItems = document.querySelectorAll(".nav-item");
  navItems.forEach(item => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      navItems.forEach(n => n.classList.remove("active"));
      item.classList.add("active");

      const id = item.id;
      if (id === "nav-dashboard") {
        if (graph && graph.cy) graph.cy.fit(null, 30);
      } else if (id === "nav-topologies") {
        if (graph && graph.cy) graph.autoLayout("cose");
      } else if (id === "nav-analytics") {
        runHealthValidation(true);
      } else if (id === "nav-sim-path") {
        openSimModal("path");
      } else if (id === "nav-sim-fail") {
        openSimModal("outage");
      } else if (id === "nav-sim-traffic") {
        openSimModal("traffic");
      } else if (id === "nav-sim-spof") {
        openSimModal("spof");
      } else if (id === "nav-ipam-tool") {
        document.getElementById("modal-ipam").style.display = "flex";
      } else if (id === "nav-add-devices") {
        document.getElementById("modal-device-palette").style.display = "flex";
      } else if (id === "nav-templates-tool") {
        document.getElementById("modal-template").style.display = "flex";
      }
    });
  });

  // Sidebar Help Center / Health Check button
  const helpBtn = document.getElementById("btn-sidebar-contact");
  if (helpBtn) {
    helpBtn.addEventListener("click", () => runHealthValidation(true));
  }

  // Bottom Cockpit Tab Pills
  const cockpitTabs = document.querySelectorAll(".cockpit-tab-pill");
  cockpitTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      cockpitTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      const type = tab.dataset.cockpitTab;
      if (type === "canvas") {
        if (graph) graph.clearHighlights();
      } else if (type === "routing") {
        openSimModal("path");
      } else if (type === "outage") {
        openSimModal("outage");
      } else if (type === "traffic") {
        openSimModal("traffic");
      } else if (type === "spof") {
        openSimModal("spof");
      } else if (type === "ipam") {
        document.getElementById("modal-ipam").style.display = "flex";
      }
    });
  });
}

function openSimModal(viewType) {
  const modal = document.getElementById("modal-simulation");
  const pathView = document.getElementById("sim-view-path");
  const outageView = document.getElementById("sim-view-outage");
  const trafficView = document.getElementById("sim-view-traffic");
  const spofView = document.getElementById("sim-view-spof");
  const title = document.getElementById("sim-modal-title");

  pathView.style.display = "none";
  outageView.style.display = "none";
  trafficView.style.display = "none";
  spofView.style.display = "none";

  if (viewType === "path") {
    pathView.style.display = "block";
    title.textContent = "Shortest Path Routing";
  } else if (viewType === "outage") {
    outageView.style.display = "block";
    title.textContent = "Simulate Link / Node Outage";
  } else if (viewType === "traffic") {
    trafficView.style.display = "block";
    title.textContent = "Simulate Traffic Load (M/M/1)";
  } else if (viewType === "spof") {
    spofView.style.display = "block";
    title.textContent = "Detect Single Points of Failure";
  }

  modal.style.display = "flex";
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
      const prefix = type.split("_")[0].toUpperCase();
      const name = `${prefix}-${count.toString().padStart(2, "0")}`;

      try {
        const dev = await apiClient.createDevice({
          topology_id: currentTopologyId,
          name,
          device_type: type,
          x_pos: 200 + Math.random() * 300,
          y_pos: 200 + Math.random() * 200,
          status: "up"
        });
        await apiClient.createInterface({
          device_id: dev.id,
          name: "eth0",
          speed_mbps: 1000,
          status: "up"
        });
        showToast(`Added ${name} to topology.`, "success");
        document.getElementById("modal-device-palette").style.display = "none";
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

  // Graph Layout buttons
  document.getElementById("btn-layout-cose").addEventListener("click", () => graph.autoLayout("cose"));
  document.getElementById("btn-fit-canvas").addEventListener("click", () => graph.cy.fit(null, 30));
  document.getElementById("btn-clear-highlights").addEventListener("click", () => graph.clearHighlights());
  document.getElementById("btn-open-palette").addEventListener("click", () => {
    document.getElementById("modal-device-palette").style.display = "flex";
  });

  // Link Drawer Mode Toggle
  let linkStartNode = null;
  document.getElementById("btn-connect-link").addEventListener("click", () => {
    if (!selectedEntity || selectedEntity.type !== "node") {
      showToast("Select a source device first, then click Link Cable.", "warning");
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

    graph.cy.one("tap", "node", (evt) => {
      onNextNode(evt.target.data());
    });
  });

  // Simulation execution buttons
  document.getElementById("btn-run-sim-path").addEventListener("click", runPathSimulation);
  document.getElementById("btn-run-sim-failure").addEventListener("click", runFailureSimulation);
  document.getElementById("btn-run-sim-traffic").addEventListener("click", runTrafficSimulation);
  document.getElementById("btn-run-sim-spof").addEventListener("click", runRedundancySimulation);
  document.getElementById("btn-calc-vlsm").addEventListener("click", runVLSMCalculator);

  // Refresh dashboard button
  const refreshBtn = document.getElementById("btn-refresh-dashboard");
  if (refreshBtn) refreshBtn.addEventListener("click", () => refreshCurrentTopology());
}

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
  const metric = document.getElementById("sim-metric-type").value;

  if (!srcId || !tgtId) {
    showToast("Select both source and target devices.", "warning");
    return;
  }

  try {
    const res = await apiClient.simulatePath(currentTopologyId, srcId, tgtId, metric);
    document.getElementById("modal-simulation").style.display = "none";

    if (res.path_found) {
      graph.highlightPath(res.path_device_ids, res.path_link_ids);
      showToast(`Shortest path: ${res.total_hops} hops, total cost ${res.total_cost}, ${res.total_latency_ms}ms`, "success");
    } else {
      showToast("No path found between selected devices.", "danger");
    }
  } catch (err) {
    showToast("Simulation error: " + err.message, "danger");
  }
}

async function runFailureSimulation() {
  const failedDevIds = selectedEntity && selectedEntity.type === "node" ? [selectedEntity.data.rawId] : [];
  if (failedDevIds.length === 0 && currentTopologyData?.devices?.length > 0) {
    failedDevIds.push(currentTopologyData.devices[0].id);
  }

  try {
    const res = await apiClient.simulateFailure(currentTopologyId, failedDevIds, []);
    document.getElementById("modal-simulation").style.display = "none";
    graph.highlightFailures(failedDevIds, [], res.isolated_device_ids || []);
    showToast(`Outage simulated: ${res.isolated_device_ids.length} isolated nodes. Rerouted paths: ${res.rerouted_paths_count}`, "warning");
  } catch (err) {
    showToast("Failure sim failed: " + err.message, "danger");
  }
}

async function runTrafficSimulation() {
  try {
    const res = await apiClient.simulateTraffic(currentTopologyId);
    document.getElementById("modal-simulation").style.display = "none";
    const congestedIds = (res.link_utilization || []).filter(u => u.is_congested).map(u => u.link_id);
    const warningIds = (res.link_utilization || []).filter(u => u.utilization_pct >= 60 && !u.is_congested).map(u => u.link_id);

    graph.highlightTrafficLoad(congestedIds, warningIds);
    showToast(`Traffic load simulated: ${congestedIds.length} congested links (>80% utilization)`, congestedIds.length > 0 ? "warning" : "success");
  } catch (err) {
    showToast("Traffic simulation error: " + err.message, "danger");
  }
}

async function runRedundancySimulation() {
  try {
    const res = await apiClient.simulateRedundancy(currentTopologyId);
    document.getElementById("modal-simulation").style.display = "none";
    graph.highlightRedundancy(res.articulation_points, res.bridges);
    showToast(`SPOF Analysis: ${res.articulation_points.length} SPOF nodes, ${res.bridges.length} bridge links detected!`, res.articulation_points.length > 0 ? "warning" : "success");
  } catch (err) {
    showToast("SPOF check failed: " + err.message, "danger");
  }
}

async function runHealthValidation(showNotification = true) {
  if (!currentTopologyId) return;
  try {
    const rep = await apiClient.validateDesign(currentTopologyId);
    const score = rep.overall_score || 95;
    updateArcGauge(score);

    if (showNotification) {
      showToast(`Health Score: ${score}/100. Issues: ${rep.issues_found ? rep.issues_found.length : 0}`, score >= 80 ? "success" : "warning");
    }
  } catch (err) {
    console.warn("Validation check error", err);
    updateArcGauge(94);
  }
}

async function runVLSMCalculator() {
  const majorNetwork = document.getElementById("vlsm-major-network").value.trim();
  const reqStr = document.getElementById("vlsm-subnets-req").value.trim();

  try {
    const departments = JSON.parse(reqStr);
    const res = await apiClient.calculateVlsm(majorNetwork, departments);
    const out = document.getElementById("vlsm-results-area");
    out.innerHTML = `
      <div style="font-size:0.75rem; color:#10b981; font-weight:700; margin-bottom:0.5rem;">Allocated ${res.allocated_subnets.length} Subnets (Waste: ${res.total_wasted_ips} IPs)</div>
      <table style="width:100%; border-collapse:collapse; font-size:0.72rem;">
        <tr style="color:var(--text-dim); text-align:left;">
          <th>Dept</th><th>Hosts</th><th>Subnet CIDR</th><th>Usable Range</th>
        </tr>
        ${res.allocated_subnets.map(s => `
          <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
            <td style="padding:0.25rem 0;"><b>${s.department}</b></td>
            <td>${s.hosts_needed}</td>
            <td>${s.network_cidr}</td>
            <td>${s.first_usable_ip} - ${s.last_usable_ip}</td>
          </tr>
        `).join("")}
      </table>
    `;
    showToast("VLSM Subnets Calculated Successfully!", "success");
  } catch (err) {
    showToast("VLSM error: " + err.message, "danger");
  }
}

function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "toast";
  if (type === "danger") toast.style.borderLeftColor = "var(--accent-red)";
  if (type === "success") toast.style.borderLeftColor = "var(--accent-green)";
  if (type === "warning") toast.style.borderLeftColor = "var(--accent-yellow)";
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

// Window scope bindings
window.saveDeviceEdit = saveDeviceEdit;
window.deleteSelectedDevice = deleteSelectedDevice;
window.saveLinkEdit = saveLinkEdit;
window.deleteSelectedLink = deleteSelectedLink;
window.promptAddInterface = promptAddInterface;
window.runHealthValidation = runHealthValidation;
window.loadTemplate = loadTemplate;
window.inspectDeviceById = inspectDeviceById;


// =========================================================================
// RECOGNITO VERTICAL SHUTTER LOUVERS INTRO CONTROLLER
// =========================================================================

function setupIntroScreen() {
  const intro = document.getElementById("intro-screen");
  if (!intro) return;

  const exitIntro = () => {
    if (intro.classList.contains("leaving")) return;
    intro.classList.add("leaving");
    setTimeout(() => {
      intro.style.display = "none";
      if (graph && graph.cy) {
        graph.cy.resize().fit(null, 30);
      }
    }, 850);
  };

  const reopenIntro = () => {
    intro.style.display = "flex";
    intro.classList.remove("leaving");
  };

  // Exit Buttons
  const applyBtn = document.getElementById("btn-hero-apply");
  const orbBtn = document.getElementById("btn-portal-orb");
  const joinBtn = document.getElementById("btn-intro-join");
  const learnBtn = document.getElementById("btn-hero-learn");
  const logoBtn = document.getElementById("btn-intro-logo");

  if (applyBtn) applyBtn.addEventListener("click", exitIntro);
  if (orbBtn) orbBtn.addEventListener("click", exitIntro);
  if (joinBtn) joinBtn.addEventListener("click", exitIntro);
  if (learnBtn) learnBtn.addEventListener("click", exitIntro);
  if (logoBtn) logoBtn.addEventListener("click", exitIntro);

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

  // Replay intro buttons in main dashboard
  const topbarReplay = document.getElementById("btn-topbar-replay");
  const sidebarReplay = document.getElementById("btn-sidebar-replay-intro");
  if (topbarReplay) topbarReplay.addEventListener("click", reopenIntro);
  if (sidebarReplay) sidebarReplay.addEventListener("click", (e) => { e.preventDefault(); reopenIntro(); });

  // Subtle Mouse Parallax on floating badges
  const badges = document.querySelectorAll(".floating-circuit-badge");
  intro.addEventListener("mousemove", (e) => {
    const xRatio = (e.clientX / window.innerWidth) - 0.5;
    const yRatio = (e.clientY / window.innerHeight) - 0.5;

    badges.forEach((b, idx) => {
      const depth = (idx % 3 + 1) * 12;
      b.style.transform = `translate(${xRatio * depth}px, ${yRatio * depth}px)`;
    });

    if (orbBtn) {
      orbBtn.style.transform = `translate(${xRatio * 8}px, ${yRatio * 8}px)`;
    }
  });
}
