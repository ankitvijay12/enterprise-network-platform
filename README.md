# Enterprise Network Design & Simulation Platform

A production-structured, full-stack network engineering platform for designing enterprise network topologies, planning IP addressing and VLANs, evaluating design rules, and simulating routing, outages, multi-commodity traffic flows, and Single Points of Failure (SPOF).

---

## Architecture Diagram

```
+-----------------------------------------------------------------------------------------+
|                                    PRESENTATION LAYER                                   |
|   Interactive Canvas (Cytoscape.js)  |  Inspector Drawer  |  IPAM & VLSM  |  Health Gauges|
+-----------------------------------------------------------------------------------------+
                                              |
                                              | HTTP / REST (JWT Bearer Auth)
                                              v
+-----------------------------------------------------------------------------------------+
|                                  FASTAPI APPLICATION (/api/v1)                          |
|  /auth  |  /users  |  /projects  |  /topologies  |  /devices  |  /interfaces  |  /links  |
|  /ipam  |  /simulations (path, reachability, failure, traffic, redundancy)  |  /validation|
+-----------------------------------------------------------------------------------------+
              |                                                   |
              v                                                   v
+-----------------------------------+             +---------------------------------------+
|          SERVICES LAYER           |             |           SIMULATION ENGINE           |
|  - IPAM & VLSM Calculator         |             |  - NetworkX Multigraph Constructor    |
|  - Design Validation Rule Engine  |             |  - Dijkstra Routing & Metric Optimizer|
|  - Topology Import/Export/Template|             |  - Outage & Partition Resiliency      |
|  - Network Summary Reporting      |             |  - Multi-Commodity Traffic & Queuing  |
|  - RBAC & JWT Security            |             |  - Articulation Points & Bridges (SPOF)|
+-----------------------------------+             +---------------------------------------+
              |                                                   |
              +-------------------------+-------------------------+
                                        |
                                        v
+-----------------------------------------------------------------------------------------+
|                           DATA PERSISTENCE LAYER (SQLAlchemy 2.0)                       |
|   Users | Projects | Topologies | Devices | Interfaces | Links | IPAM | SimRuns | Audits   |
+-----------------------------------------------------------------------------------------+
                                        |
                                        v
               PostgreSQL 16 (Production)  /  SQLite (Local Fallback)
```

---

## Tech Stack

- **Backend**: Python 3.11+, FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2
- **Simulation Engine**: NetworkX + Python standard library `ipaddress`
- **Database**: PostgreSQL 16 (with automated SQLite fallback for local zero-dependency testing)
- **Auth**: JWT (Access + Refresh tokens), bcrypt password hashing, Role-Based Access Control (`admin`, `engineer`, `viewer`)
- **Frontend**: Clean dark cockpit web UI, Cytoscape.js interactive topology canvas
- **DevOps**: Docker, docker-compose, `.env` configuration, pytest test suite

---

## Quick Start & Local Host Link

### 1. Run with Local Python

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Seed database with demo users and prebuilt topologies
python scripts/seed_data.py

# 3. Start FastAPI server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Once started, open your web browser at:
- **Interactive Web Platform**: [http://localhost:8000](http://localhost:8000)
- **Interactive Swagger API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc API Documentation**: [http://localhost:8000/redoc](http://localhost:8000/redoc)

---

### 2. Run with Docker Compose

```bash
docker-compose up --build
```
This automatically boots PostgreSQL 16, runs migrations, seeds the default topologies, and exposes the app at [http://localhost:8000](http://localhost:8000).

---

## Demo Credentials

| Role | Email | Password | Permissions |
|---|---|---|---|
| **Admin** | `admin@enterprise.local` | `AdminPass123!` | Full system administration, user management |
| **Engineer** | `engineer@enterprise.local` | `EngineerPass123!` | Create topologies, edit devices/links, run simulations |
| **Viewer** | `viewer@enterprise.local` | `ViewerPass123!` | Read-only inspection of topologies and simulation runs |

---

## Core Features & Simulation Capabilities

### 1. Project & Topology Management
- Full CRUD for projects and versioned topologies.
- Device palette supporting: `router`, `l3_switch`, `l2_switch`, `firewall`, `server`, `access_point`, `endpoint`.
- Interfaces per device (port name, speed in Mbps, IP, VLAN, administrative status up/down).
- Links with bandwidth (Mbps), latency (ms), packet loss (%), metric cost, and operational status.
- Export and Import topology as portable JSON.
- Built-in reference templates:
  - **Campus Network**: Dual Core Routers, Distribution Switches, Access Switches, Server Farm, Workstations.
  - **Data Center Spine-Leaf**: 100G Spine-Leaf Clos architecture with bare-metal compute pods.
  - **Small Office / Branch**: Edge Router, NextGen Firewall, Access Switch, Wi-Fi AP, File Server, and PC.

### 2. IP Address & VLAN Planner (IPAM)
- Auto-allocate next available host IP within subnets.
- Automatic overlap detection across CIDR blocks.
- VLAN validation (IDs 1–4094, duplicate prevention).
- **VLSM Calculator**: Input major network CIDR and department host requirements. Automatically calculates optimal subnets sorted by host requirements descending, outputting subnet masks, usable host ranges, broadcast addresses, and wasted capacity.

### 3. Simulation Engine
- **Shortest Path Routing**: Dijkstra algorithm calculating cost-optimal or latency-optimal paths, cumulative latency, and bottleneck link bandwidth.
- **Reachability Matrix**: Pairwise reachability across all network devices.
- **Failure Simulation**: Simulates node or link cuts, reporting broken flows, rerouting paths, and isolated network partitions.
- **Multi-Commodity Traffic Simulation**: Allocates flows, computes per-link utilization `(load / capacity) * 100%`, flags congested links (`>80%`), computes M/M/1 queuing delays and packet loss.
- **Redundancy & SPOF**: Uses biconnectivity graph theory to find articulation points and bridge links.

### 4. Design Validation Rules & Health Score
- Heuristics evaluate:
  - Isolated devices (no links)
  - Missing redundant uplinks on distribution/access nodes
  - Overlapping subnets or duplicate IP addresses
  - Link speed mismatches (e.g. 1G connected to 10G)
- Generates a **Design Health Score (0–100)** and letter grade (A+ to F) with remediation guidance.

---

## Example API Calls

### 1. Authenticate (Get JWT Token)
```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "engineer@enterprise.local", "password": "EngineerPass123!"}'
```

### 2. Calculate VLSM Subnet Plan
```bash
curl -X POST http://localhost:8000/api/v1/ipam/vlsm/calculate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{
    "major_network": "192.168.1.0/24",
    "departments": [
      {"name": "Engineering", "needed_hosts": 50},
      {"name": "Sales", "needed_hosts": 25},
      {"name": "Admin", "needed_hosts": 10},
      {"name": "WAN", "needed_hosts": 2}
    ]
  }'
```

### 3. Run Shortest Path Simulation
```bash
curl -X POST http://localhost:8000/api/v1/simulations/path \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{
    "topology_id": 1,
    "source_device_id": 8,
    "target_device_id": 7,
    "metric": "cost"
  }'
```

### 4. Run Single Point of Failure (SPOF) Analysis
```bash
curl -X POST http://localhost:8000/api/v1/simulations/redundancy/1 \
  -H "Authorization: Bearer <TOKEN>"
```

### 5. Validate Design Health Score
```bash
curl -X GET http://localhost:8000/api/v1/validation/1 \
  -H "Authorization: Bearer <TOKEN>"
```

---

## Running Automated Tests

```bash
pytest -v tests/
```
Output:
```
tests/test_auth.py::test_password_hashing PASSED
tests/test_auth.py::test_jwt_token_lifecycle PASSED
tests/test_auth.py::test_api_login PASSED
tests/test_failure_simulation.py::test_failure_simulation_node_cut PASSED
tests/test_ipam_vlsm.py::test_vlsm_calculation PASSED
tests/test_ipam_vlsm.py::test_allocate_next_available_ip PASSED
tests/test_ipam_vlsm.py::test_detect_subnet_overlaps PASSED
tests/test_redundancy_spof.py::test_spof_detection PASSED
tests/test_routing_simulation.py::test_dijkstra_shortest_path PASSED
tests/test_routing_simulation.py::test_reachability_matrix PASSED
tests/test_traffic_simulation.py::test_traffic_simulation_congestion PASSED
tests/test_validation.py::test_design_health_evaluation PASSED
============== 12 passed in 2.12s ==============
```
