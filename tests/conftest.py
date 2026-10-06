"""Pytest configuration and test database fixtures."""
import os
import sys
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Set test environment
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["ENVIRONMENT"] = "testing"

from app.database.base import Base
from app.database.session import get_db
from app.main import app
from app.models.user import User, UserRole
from app.core.security import get_password_hash, create_access_token
from app.services.topology_service import get_template_definition, import_topology_from_dict
from app.models.project import Project

engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session", autouse=True)
def init_test_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db_session():
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def test_admin_user(db_session):
    user = User(
        email="admin_test@enterprise.local",
        hashed_password=get_password_hash("AdminPass123!"),
        full_name="Admin Test",
        role=UserRole.ADMIN,
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def admin_token(test_admin_user):
    return create_access_token(test_admin_user.id, role=test_admin_user.role)


@pytest.fixture
def sample_campus_topology(db_session, test_admin_user):
    proj = Project(
        name="Test Project",
        description="Test description",
        owner_id=test_admin_user.id
    )
    db_session.add(proj)
    db_session.commit()
    db_session.refresh(proj)

    campus_def = get_template_definition("campus")
    topology = import_topology_from_dict(db_session, proj.id, campus_def)
    return topology
