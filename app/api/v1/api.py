"""Consolidated API v1 routing table."""
from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth, users, projects, topologies, devices,
    interfaces, links, ipam, simulations, validation, reports
)

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(projects.router, prefix="/projects", tags=["Projects"])
api_router.include_router(topologies.router, prefix="/topologies", tags=["Topologies"])
api_router.include_router(devices.router, prefix="/devices", tags=["Devices"])
api_router.include_router(interfaces.router, prefix="/interfaces", tags=["Interfaces"])
api_router.include_router(links.router, prefix="/links", tags=["Links"])
api_router.include_router(ipam.router, prefix="/ipam", tags=["IPAM & VLSM"])
api_router.include_router(simulations.router, prefix="/simulations", tags=["Simulations"])
api_router.include_router(validation.router, prefix="/validation", tags=["Validation & Health"])
api_router.include_router(reports.router, prefix="/reports", tags=["Reports"])
