"""Seed script to populate initial users, default project, and prebuilt topologies."""
import os
import sys

# Add project root to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database.session import SessionLocal, init_db
from app.models.user import User, UserRole
from app.models.project import Project
from app.models.simulation import TrafficFlow
from app.core.security import get_password_hash
from app.services.topology_service import get_template_definition, import_topology_from_dict


def seed_database():
    print("[*] Initializing database schema...")
    init_db()

    db = SessionLocal()
    try:
        # 1. Create Demo Users
        users_data = [
            ("admin@enterprise.local", "AdminPass123!", "Chief Network Architect", UserRole.ADMIN),
            ("engineer@enterprise.local", "EngineerPass123!", "Senior Network Engineer", UserRole.ENGINEER),
            ("viewer@enterprise.local", "ViewerPass123!", "NOC Operations Viewer", UserRole.VIEWER),
        ]

        created_users = {}
        for email, pwd, name, role in users_data:
            user = db.query(User).filter(User.email == email).first()
            if not user:
                user = User(
                    email=email,
                    hashed_password=get_password_hash(pwd),
                    full_name=name,
                    role=role,
                    is_active=True
                )
                db.add(user)
                db.commit()
                db.refresh(user)
                print(f"[+] Created user: {email} ({role})")
            created_users[role] = user

        admin_user = created_users[UserRole.ADMIN]

        # 2. Create Default Enterprise Project
        proj = db.query(Project).filter(Project.name == "Global Enterprise Architecture").first()
        if not proj:
            proj = Project(
                name="Global Enterprise Architecture",
                description="HQ Campus, Data Center, and Branch connectivity topologies.",
                owner_id=admin_user.id
            )
            db.add(proj)
            db.commit()
            db.refresh(proj)
            print(f"[+] Created project: {proj.name}")

            # 3. Seed Campus Topology
            campus_data = get_template_definition("campus")
            campus_top = import_topology_from_dict(db, proj.id, campus_data)
            print(f"[+] Created prebuilt topology: {campus_top.name} (ID: {campus_top.id})")

            # Seed sample traffic flows for campus
            # Find Eng-Workstation-01 and DC-Server-Farm-01
            dev_map = {d.name: d.id for d in campus_top.devices}
            if "Eng-Workstation-01" in dev_map and "DC-Server-Farm-01" in dev_map:
                tf1 = TrafficFlow(
                    topology_id=campus_top.id,
                    name="CAD-Design-Sync",
                    source_device_id=dev_map["Eng-Workstation-01"],
                    target_device_id=dev_map["DC-Server-Farm-01"],
                    demand_mbps=350.0,
                    protocol="TCP",
                    priority=1
                )
                db.add(tf1)
                db.commit()
                print("[+] Created sample traffic flow: CAD-Design-Sync (350 Mbps)")

            # 4. Seed Data Center Spine-Leaf
            dc_data = get_template_definition("datacenter")
            dc_top = import_topology_from_dict(db, proj.id, dc_data)
            print(f"[+] Created prebuilt topology: {dc_top.name} (ID: {dc_top.id})")

            # 5. Seed Small Office
            so_data = get_template_definition("small_office")
            so_top = import_topology_from_dict(db, proj.id, so_data)
            print(f"[+] Created prebuilt topology: {so_top.name} (ID: {so_top.id})")

        print("[✓] Database seeding successfully completed!")

    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
