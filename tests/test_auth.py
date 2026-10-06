"""Tests for authentication and token mechanics."""
from app.core.security import verify_password, get_password_hash, create_access_token, decode_token


def test_password_hashing():
    pwd = "SecretPassword123!"
    hashed = get_password_hash(pwd)
    assert hashed != pwd
    assert verify_password(pwd, hashed) is True
    assert verify_password("WrongPassword", hashed) is False


def test_jwt_token_lifecycle():
    user_id = 42
    role = "engineer"
    token = create_access_token(user_id, role=role)
    assert isinstance(token, str)

    payload = decode_token(token)
    assert payload is not None
    assert payload["sub"] == "42"
    assert payload["role"] == "engineer"
    assert payload["type"] == "access"


def test_api_login(client, test_admin_user):
    response = client.post("/api/v1/auth/login", json={
        "email": test_admin_user.email,
        "password": "AdminPass123!"
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["role"] == "admin"
    assert data["email"] == test_admin_user.email
