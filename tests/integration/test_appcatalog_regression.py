"""Standalone public regression checks, isolated from the legacy backend conftest."""
import os
import requests

BASE_URL = os.environ["APPCATALOG_PREVIEW_URL"]


def test_admin_catalog_create_persist_delete():
    client = requests.Session()
    login = client.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@corp.com", "password": "Admin!Passw0rd_1"}, timeout=15)
    assert login.status_code == 200
    session_cookie = next((c for c in login.cookies if c.name == "catalog_session"), None)
    assert session_cookie is not None and session_cookie.has_nonstandard_attr("HttpOnly")
    categories = client.get(f"{BASE_URL}/api/categories", timeout=15)
    apps = client.get(f"{BASE_URL}/api/apps", timeout=15)
    assert categories.status_code == 200 and categories.json()
    assert apps.status_code == 200 and len(apps.json()) > 0
    payload = {"name": "API Regression Test App", "url": "https://api-regression.example.test", "category_id": categories.json()[0]["id"], "description": "temporary", "environment": "Production", "status": "Active", "icon": "AppWindow"}
    created = client.post(f"{BASE_URL}/api/apps", json=payload, timeout=15)
    assert created.status_code == 201
    app_id = created.json()["id"]
    fetched = client.get(f"{BASE_URL}/api/apps/{app_id}", timeout=15)
    assert fetched.status_code == 200 and fetched.json()["name"] == payload["name"]
    assert client.delete(f"{BASE_URL}/api/apps/{app_id}", timeout=15).status_code == 204


def test_normal_user_is_scoped_and_cannot_create():
    client = requests.Session()
    login = client.post(f"{BASE_URL}/api/auth/login", json={"email": "john.doe@corp.com", "password": "User!Passw0rd_1"}, timeout=15)
    assert login.status_code == 200
    user = login.json()
    assert user["role"] != "administrator"
    apps = client.get(f"{BASE_URL}/api/apps", timeout=15)
    assert apps.status_code == 200 and apps.json()
    assert all(app["category_id"] in set(user["assigned_category_ids"]) for app in apps.json())
    denied = client.post(f"{BASE_URL}/api/apps", json={"name": "Unauthorized", "url": "https://x.example", "category_id": user["assigned_category_ids"][0], "description": "x", "environment": "Production", "status": "Active", "icon": "AppWindow"}, timeout=15)
    assert denied.status_code == 403