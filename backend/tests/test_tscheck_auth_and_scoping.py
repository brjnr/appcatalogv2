"""Criterion: Login required/rejects bad creds; normal user sees only assigned categories."""
import httpx
import os
API_URL = os.environ.get("BACKEND_URL", "http://localhost:8001") + "/api"

ADMIN_PW = "Admin!Passw0rd_1"
USER_PW = "User!Passw0rd_1"


def login(email, password):
    c = httpx.Client(base_url=API_URL, timeout=30.0)
    r = c.post("/auth/login", json={"email": email, "password": password})
    return c, r


def test_login_rejects_bad_password():
    c, r = login("admin@corp.com", "wrongpassword")
    assert r.status_code in (400, 401, 429), f"expected auth failure, got {r.status_code}: {r.text}"
    c.close()


def test_login_success_and_me():
    c, r = login("admin@corp.com", ADMIN_PW)
    assert r.status_code == 200, r.text
    me = c.get("/auth/me")
    assert me.status_code == 200
    body = me.json()
    assert body.get("email") == "admin@corp.com"
    c.close()


def test_normal_user_scoped_to_11_apps():
    c, r = login("john.doe@corp.com", USER_PW)
    assert r.status_code == 200, r.text
    apps = c.get("/apps")
    assert apps.status_code == 200
    data = apps.json()
    items = data if isinstance(data, list) else data.get("items", data.get("apps", []))
    assert len(items) == 11, f"expected 11 apps for john, got {len(items)}: {[a.get('name') for a in items]}"
    cats = {a.get("category") or a.get("category_id") for a in items}
    cats_names = {a.get("category_name", "") for a in items}
    # ensure no HR/Finance/Business apps by name
    names = {a.get("name") for a in items}
    forbidden = {"Workday HRIS", "SAP S/4HANA ERP", "Jira Software"}
    assert not (names & forbidden), f"unexpected forbidden apps present: {names & forbidden}"
    c.close()


def test_login_by_username_alias():
    """The ``email`` field of /auth/login also accepts the account's username."""
    c = httpx.Client(base_url=API_URL, timeout=30.0)
    r = c.post("/auth/login", json={"email": "admin", "password": ADMIN_PW})
    assert r.status_code == 200, r.text
    me = c.get("/auth/me").json()
    assert me.get("username") == "admin"
    c.close()
