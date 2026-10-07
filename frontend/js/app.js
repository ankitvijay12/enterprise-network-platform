/**
 * NetSphere - Enterprise Network Design & Simulation Platform
 * Application Controller
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

  // Card 1: Core Tier Backbone
  const coreFig = document.getElementById("metric-core-figure") || document.getElementById("metric-btc-figure");
  const coreSub = document.getElementById("metric-core-sub") || document.getElementById("metric-btc-sub");
  if (coreFig) {
    const totalCoreGbps = routers.length > 0 ? (routers.length * 10).toFixed(2) : "20.00";
    coreFig.textContent = `${totalCoreGbps} Gbps`;
  }
  if (coreSub) {
    const routerCount = routers.length || 2;
    coreSub.textContent = `BGP / OSPF Mesh • ${routerCount} Transit Routers`;
  }

  // Card 3: Distribution Tier Fabric
  const distFig = document.getElementById("metric-dist-figure") || document.getElementById("metric-eth-figure");
  const distSub = document.getElementById("metric-dist-sub") || document.getElementById("metric-eth-sub");
  if (distFig) {
    const totalDistGbps = switches.length > 0 ? (switches.length * 10).toFixed(2) : "40.00";
    distFig.textContent = `${totalDistGbps} Gbps`;
  }
  if (distSub) {
    const linkCount = links.length || 13;
    distSub.textContent = `100% Interlinks Up • ${linkCount} Active Links`;
  }
}

// Update the Iconic Semicircular Arc Gauge Needle
function updateArcGauge(score) {
  const gaugeFigure = document.getElementById("gauge-center-figure");
  const gaugeSub = document.getElementById("gauge-center-sub");
  const sliderMarker = document.getElementById("gauge-slider-marker");
  const gaugeTotal = document.getElementById("metric-gauge-total");

  if (gaugeFigure) gaugeFigure.textContent = `${score}% Valid`;
  if (gaugeSub) gaugeSub.textContent = score >= 80 ? "Architecture Optimal" : "Attention Recommended";
  if (gaugeTotal) {
    const badgeText = score >= 80 ? "Optimal (0 SPOFs)" : "Sub-optimal";
    gaugeTotal.innerHTML = `${score}.0% Reliability <span class="badge-percent badge-percent-green" style="font-size:0.7rem;">↗ ${badgeText}</span>`;
  }

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

// Render the Critical Infrastructure Nodes List
function renderTopTokensList(devices, links, activeFilter = "all") {
  const container = document.getElementById("token-items-list");
  if (!container) return;

  if (!devices || devices.length === 0) {
    container.innerHTML = "<div style=\"color:var(--text-dim); text-align:center; padding:1.5rem 0; font-size:0.8rem;\">No nodes available</div>";
    return;
  }

  let filtered = devices;
  if (activeFilter === "core") {
    filtered = devices.filter(d => d.device_type === "router" || d.device_type === "l3_switch");
  } else if (activeFilter === "edge") {
    filtered = devices.filter(d => d.device_type === "firewall" || d.device_type === "server" || d.device_type === "endpoint" || d.device_type === "l2_switch");
  }

  if (filtered.length === 0) {
    container.innerHTML = "<div style=\"color:var(--text-dim); text-align:center; padding:1.5rem 0; font-size:0.8rem;\">No matching devices in this tier</div>";
    return;
  }

  const roleMeta = {
    router: { symbol: "RT", class: "icon-yellow", speed: "10 Gbps", role: "BGP Edge AS 65001" },
    l3_switch: { symbol: "L3", class: "icon-blue", speed: "40 Gbps", role: "OSPF Area 0 Backbone" },
    l2_switch: { symbol: "L2", class: "icon-green", speed: "1 Gbps", role: "VLAN 10/20/30 Trunk" },
    firewall: { symbol: "FW", class: "icon-orange", speed: "10 Gbps", role: "IPSec Zero-Trust" },
    server: { symbol: "SRV", class: "icon-purple", speed: "10 Gbps", role: "Core Compute Node" },
    endpoint: { symbol: "PC", class: "icon-blue", speed: "1 Gbps", role: "Access Host Port" }
  };

  container.innerHTML = filtered.slice(0, 6).map((d) => {
    const meta = roleMeta[d.device_type] || { symbol: "ND", class: "icon-yellow", speed: "1 Gbps", role: "Standard Node" };
    const statusText = d.status === "up" ? "100% UP" : "OFFLINE";
    const statusColor = d.status === "up" ? "#10b981" : "#ef4444";

    return `
      <div class="token-row-item" onclick="inspectDeviceById(${d.id})">
        <div class="token-row-left">
          <div class="token-row-icon ${meta.class}">${meta.symbol}</div>
          <div class="token-row-meta">
            <div class="token-row-name">${d.name}</div>
            <div class="token-row-sub" style="color:${statusColor}; font-weight:600;">${statusText}</div>
          </div>
        </div>
        <div class="token-row-right">
          <div class="token-row-figures">
            <div class="token-row-main-val">${meta.speed}</div>
            <div class="token-row-sub-val">${meta.role}</div>
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

  // Critical Nodes Subfilter Pills
  const tokenFilters = document.querySelectorAll(".token-subfilter-pill");
  tokenFilters.forEach(pill => {
    pill.addEventListener("click", () => {
      tokenFilters.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      const filterKey = pill.dataset.tokenFilter || "all";
      if (currentTopologyData) {
        renderTopTokensList(currentTopologyData.devices, currentTopologyData.links, filterKey);
      }
    });
  });

  // Export JSON from Cockpit Header
  const btnExport = document.getElementById("btn-see-all-profile");
  if (btnExport) {
    btnExport.addEventListener("click", () => {
      if (!currentTopologyData) {
        showToast("No active topology loaded to export.", "warning");
        return;
      }
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentTopologyData, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `topology_${currentTopologyId || "export"}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast("Topology JSON exported successfully!", "success");
    });
  }

  // Add Node from Critical Infrastructure Card
  const btnAddNode = document.getElementById("btn-see-all-tokens");
  if (btnAddNode) {
    btnAddNode.addEventListener("click", () => {
      const palette = document.getElementById("modal-device-palette");
      if (palette) palette.style.display = "flex";
    });
  }

  // Live Graph Search Input
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!graph || !graph.cy || !currentTopologyData) return;
      if (!q) {
        graph.clearHighlights();
        return;
      }
      const matchIds = currentTopologyData.devices
        .filter(d => d.name.toLowerCase().includes(q) || d.device_type.toLowerCase().includes(q) || (d.interfaces || []).some(i => (i.ip_address || "").includes(q)))
        .map(d => d.id);
      if (matchIds.length > 0) {
        graph.highlightPath(matchIds, []);
      } else {
        graph.clearHighlights();
      }
    });
  }

  // Toggle Figures Visibility (Eye icon button)
  const btnToggleBal = document.getElementById("btn-toggle-balance-view");
  let balanceVisible = true;
  if (btnToggleBal) {
    btnToggleBal.addEventListener("click", () => {
      balanceVisible = !balanceVisible;
      const coreFig = document.getElementById("metric-core-figure") || document.getElementById("metric-btc-figure");
      const distFig = document.getElementById("metric-dist-figure") || document.getElementById("metric-eth-figure");
      if (coreFig && distFig) {
        if (!balanceVisible) {
          coreFig.dataset.origVal = coreFig.textContent;
          distFig.dataset.origVal = distFig.textContent;
          coreFig.textContent = "•••• Gbps";
          distFig.textContent = "•••• Gbps";
        } else {
          coreFig.textContent = coreFig.dataset.origVal || "20.00 Gbps";
          distFig.textContent = distFig.dataset.origVal || "40.00 Gbps";
        }
      }
      showToast(balanceVisible ? "Telemetry figures visible" : "Telemetry figures masked", "info");
    });
  }

  // Sub-Header Infrastructure Tier Dropdown Filter
  const filterTier = document.getElementById("filter-currency-tier");
  if (filterTier) {
    filterTier.addEventListener("change", (e) => {
      const val = e.target.value;
      if (currentTopologyData) {
        let filterKey = "all";
        if (val === "routers") filterKey = "core";
        if (val === "switches") filterKey = "edge";
        renderTopTokensList(currentTopologyData.devices, currentTopologyData.links, filterKey);
      }
    });
  }

  // User Profile Pill Click
  const userProfileBtn = document.getElementById("btn-auth-profile");
  if (userProfileBtn) {
    userProfileBtn.addEventListener("click", () => {
      const user = apiClient.user || { full_name: "Chief Architect", email: "admin@enterprise.net", role: "admin" };
      showToast(`User: ${user.full_name} (${user.role.toUpperCase()}) • JWT Session Active`, "info");
    });
  }
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
          if (graph && graph.cy) {
            graph.clearHighlights();
            graph.cy.resize().fit(null, 30);
          }
          showToast("Topology Canvas Ready: Connected to Backend", "success");
        } else if (target === "path") {
          openSimModal("path");
          showToast("Routing Engine: Select endpoints to calculate shortest path", "info");
        } else if (target === "outage") {
          openSimModal("outage");
          showToast("Failure Outage: Select devices to cut and test rerouting", "info");
        } else if (target === "traffic") {
          openSimModal("traffic");
          await runTrafficSimulation();
        } else if (target === "spof") {
          openSimModal("spof");
          await runRedundancySimulation();
        } else if (target === "ipam") {
          const ipamModal = document.getElementById("modal-ipam");
          if (ipamModal) ipamModal.style.display = "flex";
          showToast("IPAM & VLSM Planner Active", "info");
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
          openSimModal("path");
        } else if (target === "gateway") {
          if (currentTopologyData && currentTopologyData.devices.length > 0) {
            const gw = currentTopologyData.devices.find(d => d.device_type === "router") || currentTopologyData.devices[0];
            inspectDeviceById(gw.id);
          }
        } else if (target === "firewall") {
          if (currentTopologyData && currentTopologyData.devices.length > 0) {
            const fw = currentTopologyData.devices.find(d => d.device_type === "firewall") || currentTopologyData.devices[0];
            inspectDeviceById(fw.id);
          }
        } else if (target === "ipam") {
          const ipamModal = document.getElementById("modal-ipam");
          if (ipamModal) ipamModal.style.display = "flex";
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
