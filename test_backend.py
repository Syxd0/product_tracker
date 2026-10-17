import pytest
from fastapi.testclient import TestClient
from main import app
import jwt
from auth import SECRET_KEY, ALGORITHM
from datetime import datetime, timedelta, timezone

client = TestClient(app)

# Unique email generator for tests
def unique_email(prefix="test"):
    import uuid
    return f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"


def test_root_branding():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Product Tracker API"
    assert data["branding"] == "Product Tracker"
    assert "telusko" not in response.text.lower()


def test_user_registration_and_duplicate_handling():
    email = unique_email("user_reg")
    password = "StrongPassword123!"

    # 1. Register successfully
    res = client.post("/auth/register", json={"email": email, "password": password})
    assert res.status_code == 201
    data = res.json()
    assert "access_token" in data
    assert data["user"]["email"] == email
    assert "id" in data["user"]

    # 2. Attempt duplicate registration -> must return 400
    res_dup = client.post("/auth/register", json={"email": email, "password": password})
    assert res_dup.status_code == 400
    assert "already exists" in res_dup.json()["detail"].lower()


def test_user_login_success_and_failure():
    email = unique_email("user_login")
    password = "CorrectPassword123!"

    # Create account
    client.post("/auth/register", json={"email": email, "password": password})

    # Successful login
    res_ok = client.post("/auth/login", json={"email": email, "password": password})
    assert res_ok.status_code == 200
    assert "access_token" in res_ok.json()
    assert res_ok.json()["user"]["email"] == email

    # Wrong password -> 401
    res_bad_pw = client.post("/auth/login", json={"email": email, "password": "WrongPassword!"})
    assert res_bad_pw.status_code == 401

    # Nonexistent user -> 401
    res_no_user = client.post("/auth/login", json={"email": "nonexistent_99@example.com", "password": password})
    assert res_no_user.status_code == 401


def test_unauthenticated_access_is_blocked():
    # Fresh unauthenticated client without any cookies or headers
    unauth = TestClient(app)
    # Attempting to access products without token -> 401
    assert unauth.get("/products").status_code == 401
    assert unauth.post("/products", json={"name": "Test", "price": 10, "quantity": 1}).status_code == 401
    assert unauth.get("/products/1").status_code == 401
    assert unauth.put("/products/1", json={"name": "Test"}).status_code == 401
    assert unauth.delete("/products/1").status_code == 401
    assert unauth.get("/auth/me").status_code == 401


def test_invalid_and_expired_tokens():
    # Invalid token format
    res_inv = client.get("/auth/me", headers={"Authorization": "Bearer invalid.token.value"})
    assert res_inv.status_code == 401

    # Expired token
    expired_payload = {
        "sub": "1",
        "email": "test@example.com",
        "exp": datetime.now(timezone.utc) - timedelta(hours=1),
        "iat": datetime.now(timezone.utc) - timedelta(hours=2),
    }
    expired_token = jwt.encode(expired_payload, SECRET_KEY, algorithm=ALGORITHM)
    res_exp = client.get("/auth/me", headers={"Authorization": f"Bearer {expired_token}"})
    assert res_exp.status_code == 401
    assert "expired" in res_exp.json()["detail"].lower()


def test_current_user_and_logout():
    email = unique_email("user_me")
    password = "SecurePassword123!"

    reg = client.post("/auth/register", json={"email": email, "password": password})
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # /auth/me returns current user
    me_res = client.get("/auth/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["email"] == email

    # /auth/logout returns 200
    logout_res = client.post("/auth/logout", headers=headers)
    assert logout_res.status_code == 200


def test_user_product_crud_and_cross_user_isolation():
    # Setup User A
    email_a = unique_email("user_a")
    pw_a = "PasswordA123!"
    reg_a = client.post("/auth/register", json={"email": email_a, "password": pw_a})
    token_a = reg_a.json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}
    user_a_id = reg_a.json()["user"]["id"]

    # Setup User B
    email_b = unique_email("user_b")
    pw_b = "PasswordB123!"
    reg_b = client.post("/auth/register", json={"email": email_b, "password": pw_b})
    token_b = reg_b.json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}
    user_b_id = reg_b.json()["user"]["id"]

    assert user_a_id != user_b_id

    # 1. User A creates a product
    create_a = client.post(
        "/products",
        json={"name": "User A Widget", "description": "Widget owned by A", "price": 49.99, "quantity": 10},
        headers=headers_a
    )
    assert create_a.status_code == 201
    product_a = create_a.json()
    product_a_id = product_a["id"]
    assert product_a["name"] == "User A Widget"
    assert product_a["owner_id"] == user_a_id

    # 2. User B creates a product
    create_b = client.post(
        "/products",
        json={"name": "User B Gadget", "description": "Gadget owned by B", "price": 89.99, "quantity": 5},
        headers=headers_b
    )
    assert create_b.status_code == 201
    product_b = create_b.json()
    product_b_id = product_b["id"]
    assert product_b["owner_id"] == user_b_id

    # 3. User A lists products -> only sees User A's products
    list_a = client.get("/products", headers=headers_a)
    assert list_a.status_code == 200
    ids_seen_by_a = [p["id"] for p in list_a.json()]
    assert product_a_id in ids_seen_by_a
    assert product_b_id not in ids_seen_by_a

    # 4. User B lists products -> only sees User B's products
    list_b = client.get("/products", headers=headers_b)
    assert list_b.status_code == 200
    ids_seen_by_b = [p["id"] for p in list_b.json()]
    assert product_b_id in ids_seen_by_b
    assert product_a_id not in ids_seen_by_b

    # 5. User B attempts to read User A's product -> 404 Not Found (no leak)
    read_cross = client.get(f"/products/{product_a_id}", headers=headers_b)
    assert read_cross.status_code == 404

    # 6. User B attempts to update User A's product -> 404 Not Found
    update_cross = client.put(
        f"/products/{product_a_id}",
        json={"name": "Hacked Name"},
        headers=headers_b
    )
    assert update_cross.status_code == 404

    # Verify User A's product remains untouched
    read_a = client.get(f"/products/{product_a_id}", headers=headers_a)
    assert read_a.status_code == 200
    assert read_a.json()["name"] == "User A Widget"

    # 7. User B attempts to delete User A's product -> 404 Not Found
    del_cross = client.delete(f"/products/{product_a_id}", headers=headers_b)
    assert del_cross.status_code == 404

    # 8. User A successfully updates their own product
    update_a = client.put(
        f"/products/{product_a_id}",
        json={"name": "User A Widget Updated", "price": 59.99},
        headers=headers_a
    )
    assert update_a.status_code == 200
    assert update_a.json()["name"] == "User A Widget Updated"
    assert update_a.json()["price"] == 59.99

    # 9. User A successfully deletes their own product
    del_a = client.delete(f"/products/{product_a_id}", headers=headers_a)
    assert del_a.status_code == 200

    # 10. Confirm it's gone
    assert client.get(f"/products/{product_a_id}", headers=headers_a).status_code == 404


def test_ownership_spoofing_prevention():
    # User tries to pass someone else's ID or spoof owner_id in POST body
    email = unique_email("user_spoof")
    reg = client.post("/auth/register", json={"email": email, "password": "Password123!"})
    token = reg.json()["access_token"]
    user_id = reg.json()["user"]["id"]
    headers = {"Authorization": f"Bearer {token}"}

    # Attempt to spoof owner_id=9999 or user_id=9999
    res = client.post(
        "/products",
        json={
            "name": "Spoofed Product",
            "price": 100.0,
            "quantity": 2,
            "owner_id": 9999,
            "user_id": 9999,
        },
        headers=headers
    )
    assert res.status_code == 201
    created = res.json()
    # Backend MUST assign the authenticated user's actual ID, not the spoofed 9999
    assert created["owner_id"] == user_id
    assert created["owner_id"] != 9999
