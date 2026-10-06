/**
 * API Client Module for Enterprise Network Design & Simulation Platform
 */
const API_BASE = "/api/v1";

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
      console.error(`API Error [${endpoint}]:`, err);
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
