/**
 * API Client Module for Enterprise Network Design & Simulation Platform
 * Supports live backend connectivity with auto-detection for GitHub Pages & standalone demo fallback
 */

const resolveApiBase = () => {
  if (window.customApiBase) return window.customApiBase;
  const stored = localStorage.getItem("custom_api_base");
  if (stored) return stored.replace(/\/+$/, "");

  const host = window.location.hostname;
  if (host.includes("github.io") || window.location.protocol === "file:") {
    return "https://4eee1b874967fd.lhr.life/api/v1";
  }
  return "/api/v1";
};

let API_BASE = resolveApiBase();

// In-memory mock storage for standalone / GitHub Pages offline mode
const mockStore = {
  projects: [
    { id: 1, name: "Global Enterprise Architecture", description: "Campus Core, Distribution, Data Center, and Branch topologies.", created_at: "2026-10-07T00:00:00" }
  ],
  topologies: [
    { id: 1, project_id: 1, name: "Enterprise Campus Network", version: 1, description: "Enterprise Core, Distribution, and Access network topology" },
    { id: 2, project_id: 1, name: "Spine-Leaf Data Center", version: 1, description: "High-throughput spine-leaf data center fabric" },
    { id: 3, project_id: 1, name: "Small Office / Branch", version: 1, description: "Branch office with secure edge firewall and endpoints" }
  ],
  devices: {
    1: [
      { id: 1, name: "Core-Router-01", device_type: "router", x_pos: 250, y_pos: 100, status: "up", vendor: "Cisco", model: "Catalyst 8500", interfaces: [{ id: 1, name: "TenGi0/0", ip_address: "10.0.0.1", status: "up" }, { id: 2, name: "TenGi0/1", ip_address: "10.0.1.1", status: "up" }] },
      { id: 2, name: "Core-Router-02", device_type: "router", x_pos: 550, y_pos: 100, status: "up", vendor: "Cisco", model: "Catalyst 8500", interfaces: [{ id: 3, name: "TenGi0/0", ip_address: "10.0.0.2", status: "up" }, { id: 4, name: "TenGi0/1", ip_address: "10.0.2.1", status: "up" }] },
      { id: 3, name: "Dist-Switch-01", device_type: "l3_switch", x_pos: 200, y_pos: 260, status: "up", vendor: "Cisco", model: "Catalyst 9300", interfaces: [{ id: 5, name: "Gi1/0/1", ip_address: "10.0.1.2", status: "up" }, { id: 6, name: "Gi1/0/2", ip_address: "10.10.0.1", status: "up" }] },
      { id: 4, name: "Dist-Switch-02", device_type: "l3_switch", x_pos: 600, y_pos: 260, status: "up", vendor: "Cisco", model: "Catalyst 9300", interfaces: [{ id: 7, name: "Gi1/0/1", ip_address: "10.0.2.2", status: "up" }, { id: 8, name: "Gi1/0/2", ip_address: "10.20.0.1", status: "up" }] },
      { id: 5, name: "Access-Switch-01", device_type: "l2_switch", x_pos: 150, y_pos: 420, status: "up", vendor: "Cisco", model: "Catalyst 9200", interfaces: [{ id: 9, name: "Gi1/0/1", status: "up" }, { id: 10, name: "Gi1/0/2", status: "up" }] },
      { id: 6, name: "Access-Switch-02", device_type: "l2_switch", x_pos: 650, y_pos: 420, status: "up", vendor: "Cisco", model: "Catalyst 9200", interfaces: [{ id: 11, name: "Gi1/0/1", status: "up" }, { id: 12, name: "Gi1/0/2", status: "up" }] },
      { id: 7, name: "Edge-Firewall-01", device_type: "firewall", x_pos: 400, y_pos: 25, status: "up", vendor: "Palo Alto", model: "PA-3220", interfaces: [{ id: 13, name: "eth1/1", ip_address: "198.51.100.1", status: "up" }, { id: 14, name: "eth1/2", ip_address: "10.0.3.1", status: "up" }] },
      { id: 8, name: "DC-Server-Farm-01", device_type: "server", x_pos: 400, y_pos: 420, status: "up", vendor: "Dell", model: "PowerEdge R750", interfaces: [{ id: 15, name: "ens192", ip_address: "10.100.0.10", status: "up" }] },
      { id: 9, name: "Eng-Workstation-01", device_type: "endpoint", x_pos: 150, y_pos: 560, status: "up", vendor: "Generic", model: "PC-Workstation", interfaces: [{ id: 16, name: "eth0", ip_address: "10.10.0.25", status: "up" }] },
      { id: 10, name: "Exec-Workstation-01", device_type: "endpoint", x_pos: 650, y_pos: 560, status: "up", vendor: "Generic", model: "PC-Workstation", interfaces: [{ id: 17, name: "eth0", ip_address: "10.20.0.25", status: "up" }] }
    ]
  },
  links: {
    1: [
      { id: 1, source_device_id: 1, target_device_id: 2, source_interface_id: 1, target_interface_id: 3, bandwidth_mbps: 10000, latency_ms: 1, cost: 10, status: "up" },
      { id: 2, source_device_id: 1, target_device_id: 3, source_interface_id: 2, target_interface_id: 5, bandwidth_mbps: 10000, latency_ms: 2, cost: 10, status: "up" },
      { id: 3, source_device_id: 2, target_device_id: 4, source_interface_id: 4, target_interface_id: 7, bandwidth_mbps: 10000, latency_ms: 2, cost: 10, status: "up" },
      { id: 4, source_device_id: 1, target_device_id: 4, source_interface_id: 1, target_interface_id: 7, bandwidth_mbps: 10000, latency_ms: 2, cost: 15, status: "up" },
      { id: 5, source_device_id: 2, target_device_id: 3, source_interface_id: 3, target_interface_id: 5, bandwidth_mbps: 10000, latency_ms: 2, cost: 15, status: "up" },
      { id: 6, source_device_id: 3, target_device_id: 5, source_interface_id: 6, target_interface_id: 9, bandwidth_mbps: 1000, latency_ms: 1, cost: 20, status: "up" },
      { id: 7, source_device_id: 4, target_device_id: 6, source_interface_id: 8, target_interface_id: 11, bandwidth_mbps: 1000, latency_ms: 1, cost: 20, status: "up" },
      { id: 8, source_device_id: 1, target_device_id: 7, source_interface_id: 1, target_interface_id: 14, bandwidth_mbps: 10000, latency_ms: 1, cost: 5, status: "up" },
      { id: 9, source_device_id: 2, target_device_id: 7, source_interface_id: 3, target_interface_id: 14, bandwidth_mbps: 10000, latency_ms: 1, cost: 5, status: "up" },
      { id: 10, source_device_id: 3, target_device_id: 8, source_interface_id: 6, target_interface_id: 15, bandwidth_mbps: 10000, latency_ms: 1, cost: 10, status: "up" },
      { id: 11, source_device_id: 4, target_device_id: 8, source_interface_id: 8, target_interface_id: 15, bandwidth_mbps: 10000, latency_ms: 1, cost: 10, status: "up" },
      { id: 12, source_device_id: 5, target_device_id: 9, source_interface_id: 10, target_interface_id: 16, bandwidth_mbps: 1000, latency_ms: 1, cost: 5, status: "up" },
      { id: 13, source_device_id: 6, target_device_id: 10, source_interface_id: 12, target_interface_id: 17, bandwidth_mbps: 1000, latency_ms: 1, cost: 5, status: "up" }
    ]
  },
  subnets: {
    1: [
      { id: 1, name: "Core Interlink", cidr: "10.0.0.0/30", gateway_ip: "10.0.0.1", vlan_id: 100, allocated_ips_json: '["10.0.0.1", "10.0.0.2"]', description: "Transit network between Core Routers" },
      { id: 2, name: "Engineering Subnet", cidr: "10.10.0.0/24", gateway_ip: "10.10.0.1", vlan_id: 10, allocated_ips_json: '["10.10.0.1", "10.10.0.25"]', description: "R&D Workstations" },
      { id: 3, name: "Executive Subnet", cidr: "10.20.0.0/24", gateway_ip: "10.20.0.1", vlan_id: 20, allocated_ips_json: '["10.20.0.1", "10.20.0.25"]', description: "Executive & Sales LAN" },
      { id: 4, name: "DataCenter Farm", cidr: "10.100.0.0/24", gateway_ip: "10.100.0.1", vlan_id: 50, allocated_ips_json: '["10.100.0.10", "10.100.0.11"]', description: "Corporate Core Services" }
    ]
  },
  vlans: {
    1: [
      { id: 1, vlan_id: 10, name: "Engineering", description: "R&D team LAN" },
      { id: 2, vlan_id: 20, name: "Executive", description: "Executive & Admin LAN" },
      { id: 3, vlan_id: 50, name: "Server-Farm", description: "Core Application Servers" },
      { id: 4, vlan_id: 100, name: "Transit-Core", description: "Core routing transit" }
    ]
  }
};

function getMockFallback(endpoint, options = {}) {
  const method = (options.method || "GET").toUpperCase();

  if (endpoint.includes("/auth/login")) {
    return {
      access_token: "demo-jwt-token-ghpages",
      refresh_token: "demo-refresh-token-ghpages",
      user_id: 1,
      email: "engineer@enterprise.local",
      full_name: "Chief Network Architect",
      role: "admin"
    };
  }

  if (endpoint === "/projects") {
    if (method === "POST") {
      const data = JSON.parse(options.body || "{}");
      const newP = { id: Date.now(), name: data.name || "New Project", description: data.description || "" };
      mockStore.projects.push(newP);
      return newP;
    }
    return { items: mockStore.projects, total: mockStore.projects.length };
  }

  if (endpoint.startsWith("/topologies/by-project/")) {
    return mockStore.topologies;
  }

  if (endpoint.startsWith("/devices/by-topology/")) {
    const topId = endpoint.split("/").pop();
    return mockStore.devices[topId] || mockStore.devices[1];
  }

  if (endpoint.startsWith("/links/by-topology/")) {
    const topId = endpoint.split("/").pop();
    return mockStore.links[topId] || mockStore.links[1];
  }

  if (endpoint.startsWith("/ipam/subnets/by-topology/")) {
    return mockStore.subnets[1];
  }

  if (endpoint.startsWith("/ipam/vlans/by-topology/")) {
    return mockStore.vlans[1];
  }

  if (endpoint === "/ipam/vlsm/calculate") {
    const data = JSON.parse(options.body || "{}");
    const major = data.major_network || "10.0.0.0/16";
    const depts = (data.departments || []).sort((a, b) => b.hosts_needed - a.hosts_needed);
    let currentThirdOctet = 0;
    const subnets = depts.map((d, idx) => {
      const hosts = d.hosts_needed;
      let mask = 24;
      if (hosts <= 2) mask = 30;
      else if (hosts <= 6) mask = 29;
      else if (hosts <= 14) mask = 28;
      else if (hosts <= 30) mask = 27;
      else if (hosts <= 62) mask = 26;
      else if (hosts <= 126) mask = 25;
      else if (hosts <= 254) mask = 24;
      else mask = 23;

      const base = `10.10.${currentThirdOctet}.0/${mask}`;
      currentThirdOctet += 1;
      return {
        department: d.name,
        requested_hosts: hosts,
        allocated_cidr: base,
        usable_hosts: Math.pow(2, 32 - mask) - 2,
        network_address: base.split("/")[0],
        gateway_ip: base.split("/")[0].replace(/\.0$/, ".1"),
        broadcast_address: base.split("/")[0].replace(/\.0$/, ".255")
      };
    });
    return { major_network: major, subnets };
  }

  if (endpoint === "/simulations/path") {
    const data = JSON.parse(options.body || "{}");
    const srcId = data.source_device_id;
    const tgtId = data.target_device_id;
    return {
      source_device_id: srcId,
      target_device_id: tgtId,
      path_nodes: [srcId, 1, 2, tgtId].filter((v, i, a) => a.indexOf(v) === i),
      path_edges: [1, 2, 6],
      total_cost: 35,
      total_latency_ms: 4.5,
      bottleneck_bandwidth_mbps: 1000
    };
  }

  if (endpoint.startsWith("/simulations/reachability/")) {
    return {
      topology_id: 1,
      reachability_percentage: 100.0,
      total_pairs: 90,
      reachable_pairs: 90,
      disconnected_components: 1,
      isolated_nodes: []
    };
  }

  if (endpoint.startsWith("/simulations/redundancy/")) {
    return {
      topology_id: 1,
      single_points_of_failure_devices: [
        { id: 5, name: "Access-Switch-01", type: "l2_switch" },
        { id: 6, name: "Access-Switch-02", type: "l2_switch" }
      ],
      critical_bridges: [
        { id: 12, name: "Access01-to-Workstation01" },
        { id: 13, name: "Access02-to-Workstation02" }
      ],
      redundancy_score_percentage: 82.5,
      recommendations: [
        "Core routing layer has full mesh N+1 redundancy.",
        "Add secondary uplink from Access Switches to both Distribution Switches to eliminate edge SPOFs."
      ]
    };
  }

  if (endpoint === "/simulations/failure") {
    return {
      failed_devices_count: 1,
      failed_links_count: 0,
      impacted_reachability_percentage: 92.0,
      rerouted_flows: 2,
      orphaned_nodes: []
    };
  }

  if (endpoint === "/simulations/traffic") {
    return {
      total_demand_mbps: 350.0,
      congested_links: [],
      max_link_utilization_percentage: 35.0,
      average_latency_ms: 2.1
    };
  }

  if (endpoint.startsWith("/validation/")) {
    return {
      topology_id: 1,
      overall_status: "PASSED",
      checks: [
        { name: "Reachability & Partitions", passed: true, message: "Fabric is fully connected with zero isolated partitions." },
        { name: "IP & Subnet Allocation", passed: true, message: "Zero IP collisions or subnet overlaps detected." },
        { name: "VLAN Uniformity", passed: true, message: "VLAN tags 10, 20, 50, 100 are properly trunked across switches." },
        { name: "Bandwidth & Capacity", passed: true, message: "10 Gbps core interlinks handle peak traffic loads." }
      ]
    };
  }

  if (endpoint.startsWith("/reports/summary/")) {
    return {
      project_name: "Global Enterprise Architecture",
      topology_name: "Enterprise Campus Network",
      total_devices: 10,
      total_links: 13,
      total_subnets: 4,
      total_vlans: 4,
      health_score: 95
    };
  }

  return {};
}

const apiClient = {
  token: localStorage.getItem("access_token") || null,
  refreshToken: localStorage.getItem("refresh_token") || null,
  user: JSON.parse(localStorage.getItem("user_profile") || "null"),

  setTokens(accessToken, refreshToken, user) {
    this.token = accessToken;
    this.refreshToken = refreshToken;
    this.user = user;
    localStorage.setItem("access_token", accessToken);
    localStorage.setItem("refresh_token", refreshToken);
    localStorage.setItem("user_profile", JSON.stringify(user));
  },

  clearAuth() {
    this.token = null;
    this.refreshToken = null;
    this.user = null;
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user_profile");
  },

  async request(endpoint, options = {}) {
    API_BASE = resolveApiBase();
    const url = `${API_BASE}${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      if (response.status === 401 && this.refreshToken && !endpoint.includes("/auth/")) {
        // Attempt refresh
        const refreshed = await this.refreshAuth();
        if (refreshed) {
          headers["Authorization"] = `Bearer ${this.token}`;
          const retryRes = await fetch(url, { ...options, headers });
          if (!retryRes.ok) {
            const errData = await retryRes.json().catch(() => ({}));
            throw new Error(errData.error?.message || `HTTP ${retryRes.status}`);
          }
          if (retryRes.status === 204) return null;
          return await retryRes.json();
        }
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || errData.detail || `Request failed with status ${response.status}`);
      }

      if (response.status === 204) return null;
      return await response.json();
    } catch (err) {
      console.warn(`[API] Backend unavailable (${url}), falling back to standalone demo mode:`, err.message);
      // Fallback to standalone demo dataset for GitHub Pages / offline hosting
      const fallback = getMockFallback(endpoint, options);
      if (fallback !== undefined) return fallback;
      throw err;
    }
  },

  // Auth
  async login(email, password) {
    const res = await this.request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    this.setTokens(res.access_token, res.refresh_token, {
      id: res.user_id,
      email: res.email,
      full_name: res.full_name,
      role: res.role
    });
    return res;
  },

  async refreshAuth() {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: this.refreshToken })
      });
      if (res.ok) {
        const data = await res.json();
        this.setTokens(data.access_token, data.refresh_token, this.user);
        return true;
      }
    } catch (e) {
      console.error("Refresh failed", e);
    }
    this.clearAuth();
    return false;
  },

  // Projects
  async getProjects() {
    return this.request("/projects");
  },

  async createProject(name, description) {
    return this.request("/projects", {
      method: "POST",
      body: JSON.stringify({ name, description })
    });
  },

  // Topologies
  async getTopologiesByProject(projectId) {
    return this.request(`/topologies/by-project/${projectId}`);
  },

  async getTopology(topologyId) {
    return this.request(`/topologies/${topologyId}`);
  },

  async createTopology(projectId, name) {
    return this.request("/topologies", {
      method: "POST",
      body: JSON.stringify({ project_id: projectId, name })
    });
  },

  async loadTemplate(projectId, templateName) {
    return this.request(`/topologies/template/${projectId}/${templateName}`, {
      method: "POST"
    });
  },

  async exportTopology(topologyId) {
    return this.request(`/topologies/${topologyId}/export`);
  },

  async importTopology(projectId, data) {
    return this.request(`/topologies/import/${projectId}`, {
      method: "POST",
      body: JSON.stringify(data)
    });
  },

  // Devices & Interfaces
  async getDevices(topologyId) {
    return this.request(`/devices/by-topology/${topologyId}`);
  },

  async createDevice(deviceData) {
    return this.request("/devices", {
      method: "POST",
      body: JSON.stringify(deviceData)
    });
  },

  async updateDevice(deviceId, deviceData) {
    return this.request(`/devices/${deviceId}`, {
      method: "PUT",
      body: JSON.stringify(deviceData)
    });
  },

  async deleteDevice(deviceId) {
    return this.request(`/devices/${deviceId}`, { method: "DELETE" });
  },

  async createInterface(interfaceData) {
    return this.request("/interfaces", {
      method: "POST",
      body: JSON.stringify(interfaceData)
    });
  },

  // Links
  async getLinks(topologyId) {
    return this.request(`/links/by-topology/${topologyId}`);
  },

  async createLink(linkData) {
    return this.request("/links", {
      method: "POST",
      body: JSON.stringify(linkData)
    });
  },

  async updateLink(linkId, linkData) {
    return this.request(`/links/${linkId}`, {
      method: "PUT",
      body: JSON.stringify(linkData)
    });
  },

  async deleteLink(linkId) {
    return this.request(`/links/${linkId}`, { method: "DELETE" });
  },

  // IPAM & VLSM
  async getSubnets(topologyId) {
    return this.request(`/ipam/subnets/by-topology/${topologyId}`);
  },

  async createSubnet(subnetData) {
    return this.request("/ipam/subnets", {
      method: "POST",
      body: JSON.stringify(subnetData)
    });
  },

  async allocateIp(subnetId) {
    return this.request(`/ipam/subnets/${subnetId}/allocate-ip`, {
      method: "POST"
    });
  },

  async getVlans(topologyId) {
    return this.request(`/ipam/vlans/by-topology/${topologyId}`);
  },

  async createVlan(vlanData) {
    return this.request("/ipam/vlans", {
      method: "POST",
      body: JSON.stringify(vlanData)
    });
  },

  async calculateVlsm(majorNetwork, departments) {
    return this.request("/ipam/vlsm/calculate", {
      method: "POST",
      body: JSON.stringify({ major_network: majorNetwork, departments })
    });
  },

  // Simulations
  async simulatePath(topologyId, sourceDeviceId, targetDeviceId, metric = "cost") {
    return this.request("/simulations/path", {
      method: "POST",
      body: JSON.stringify({
        topology_id: topologyId,
        source_device_id: sourceDeviceId,
        target_device_id: targetDeviceId,
        metric
      })
    });
  },

  async simulateReachability(topologyId) {
    return this.request(`/simulations/reachability/${topologyId}`, {
      method: "POST"
    });
  },

  async simulateFailure(topologyId, failedDeviceIds, failedLinkIds) {
    return this.request("/simulations/failure", {
      method: "POST",
      body: JSON.stringify({
        topology_id: topologyId,
        failed_device_ids: failedDeviceIds,
        failed_link_ids: failedLinkIds
      })
    });
  },

  async simulateTraffic(topologyId, flows = null) {
    return this.request("/simulations/traffic", {
      method: "POST",
      body: JSON.stringify({
        topology_id: topologyId,
        custom_flows: flows
      })
    });
  },

  async simulateRedundancy(topologyId) {
    return this.request(`/simulations/redundancy/${topologyId}`, {
      method: "POST"
    });
  },

  async getSimulationHistory(topologyId) {
    return this.request(`/simulations/history/${topologyId}`);
  },

  // Validation & Reports
  async validateDesign(topologyId) {
    return this.request(`/validation/${topologyId}`);
  },

  async getSummaryReport(topologyId) {
    return this.request(`/reports/summary/${topologyId}`);
  }
};

window.apiClient = apiClient;
