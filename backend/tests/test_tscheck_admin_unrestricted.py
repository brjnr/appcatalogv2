"""Criterion: Administrator has unrestricted access - sees the seeded catalog & stats."""
import httpx
import os
API_URL = os.environ.get("BACKEND_URL", "http://localhost:8001") + "/api"

ADMIN_PW = "Admin!Passw0rd_1"


def login(email, password):
    c = httpx.Client(base_url=API_URL, timeout=30.0)
    r = c.post("/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return c


def test_admin_sees_all_apps_and_stats():
    admin = login("admin@corp.com", ADMIN_PW)
    apps = admin.get("/apps")
    assert apps.status_code == 200
    data = apps.json()
    items = data if isinstance(data, list) else data.get("items", [])
    # Admin visibility is unbounded, but the exact catalog size grows as
    # legitimate admin CRUD activity happens. Assert on the seeded floor so
    # freshly-created rows do not flip the regression suite red.
    assert len(items) >= 36, f"expected at least 36 apps for admin, got {len(items)}"

    users = admin.get("/users")
    assert users.status_code == 200
    udata = users.json()
    uitems = udata if isinstance(udata, list) else udata.get("items", [])
    emails = {u.get("email") for u in uitems}
    assert {"admin@corp.com", "john.doe@corp.com", "maria.garcia@corp.com"} <= emails
    assert len(uitems) >= 3, f"expected at least 3 seeded users, got {len(uitems)}"

    cats = admin.get("/categories?include_inactive=true")
    assert cats.status_code == 200
    cdata = cats.json()
    citems = cdata if isinstance(cdata, list) else cdata.get("items", [])
    cat_names = {c.get("name") for c in citems}
    seed_cats = {"Business", "Infrastructure", "Network", "Security", "Monitoring", "Data Center", "HR", "Finance"}
    assert seed_cats <= cat_names
    assert len(citems) >= 8, f"expected at least 8 seeded categories, got {len(citems)}"
    admin.close()
