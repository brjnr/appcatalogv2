"""Criterion: Admin can create a user with role + category assignments, and scoping applies."""
import uuid
import httpx
import os
API_URL = os.environ.get("BACKEND_URL", "http://localhost:8001") + "/api"

ADMIN_PW = "Admin!Passw0rd_1"
# Strong password that satisfies the 13+/upper/lower/symbol server rule.
QA_PW = "QaUser!Passw0rd_1"


def login(email, password):
    c = httpx.Client(base_url=API_URL, timeout=30.0)
    r = c.post("/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return c


def test_admin_creates_scoped_user():
    admin = login("admin@corp.com", ADMIN_PW)
    cats = admin.get("/categories").json()
    citems = cats if isinstance(cats, list) else cats.get("items", [])
    finance = next(c for c in citems if c.get("name") == "Finance")

    suffix = uuid.uuid4().hex[:8]
    email = f"tscheck-qa-{suffix}@corp.com"
    username = f"tscheck.qa.{suffix}"
    payload = {
        "name": f"tscheck-QA-{suffix}",
        "username": username,
        "email": email,
        "password": QA_PW,
        "password_confirm": QA_PW,
        "role": "normal_user",
        "assigned_category_ids": [finance["id"]],
    }
    r = admin.post("/users", json=payload)
    assert r.status_code in (200, 201), r.text
    created = r.json()
    assert created.get("role") == "normal_user"
    assert created.get("username") == username
    assert finance["id"] in created.get("assigned_category_ids", [])
    admin.close()

    qa = login(email, QA_PW)
    apps = qa.get("/apps")
    assert apps.status_code == 200
    items = apps.json()
    items = items if isinstance(items, list) else items.get("items", [])
    assert len(items) == 4, f"expected 4 Finance apps for new user, got {len(items)}"
    names = {a.get("category_name") for a in items}
    assert names == {"Finance"}, f"unexpected categories leaked: {names}"
    qa.close()


def test_password_confirm_mismatch_rejected():
    admin = login("admin@corp.com", ADMIN_PW)
    suffix = uuid.uuid4().hex[:8]
    r = admin.post(
        "/users",
        json={
            "name": f"mismatch-{suffix}",
            "username": f"mismatch.{suffix}",
            "email": f"mismatch-{suffix}@corp.com",
            "password": QA_PW,
            "password_confirm": QA_PW + "X",
            "role": "normal_user",
        },
    )
    assert r.status_code == 422, f"expected 422 on password mismatch, got {r.status_code}: {r.text}"
    admin.close()


def test_weak_password_rejected():
    admin = login("admin@corp.com", ADMIN_PW)
    suffix = uuid.uuid4().hex[:8]
    r = admin.post(
        "/users",
        json={
            "name": f"weak-{suffix}",
            "username": f"weak.{suffix}",
            "email": f"weak-{suffix}@corp.com",
            "password": "shortpass",
            "password_confirm": "shortpass",
            "role": "normal_user",
        },
    )
    assert r.status_code == 422, f"expected 422 on weak password, got {r.status_code}: {r.text}"
    admin.close()
