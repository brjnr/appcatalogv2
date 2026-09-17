"""Criterion: Normal user denied direct access to unauthorized app (403) and admin denied
non-admin routes (403 on /api/users, /api/categories POST, /api/apps POST)."""
import httpx
import os
API_URL = os.environ.get("BACKEND_URL", "http://localhost:8001") + "/api"

ADMIN_PW = "Admin!Passw0rd_1"
USER_PW = "User!Passw0rd_1"


def login(email, password):
    c = httpx.Client(base_url=API_URL, timeout=30.0)
    r = c.post("/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return c


def test_normal_user_denied_unassigned_app():
    admin = login("admin@corp.com", ADMIN_PW)
    apps = admin.get("/apps").json()
    items = apps if isinstance(apps, list) else apps.get("items", [])
    hr_app = next(a for a in items if a.get("category_name") == "HR" or a.get("category") == "HR")
    admin.close()

    john = login("john.doe@corp.com", USER_PW)
    r = john.get(f"/apps/{hr_app['id']}")
    assert r.status_code == 403, f"expected 403 for john on HR app, got {r.status_code}: {r.text}"
    john.close()


def test_normal_user_denied_admin_endpoints():
    john = login("john.doe@corp.com", USER_PW)
    r1 = john.get("/users")
    assert r1.status_code == 403, f"GET /users expected 403, got {r1.status_code}"
    r2 = john.post("/categories", json={"name": "tscheck-hack-cat"})
    assert r2.status_code == 403, f"POST /categories expected 403, got {r2.status_code}"
    r3 = john.post("/apps", json={"name": "tscheck-hack-app"})
    assert r3.status_code == 403, f"POST /apps expected 403, got {r3.status_code}"
    john.close()
