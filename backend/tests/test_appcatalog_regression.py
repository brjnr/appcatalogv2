"""Regression coverage for the imported Application Catalog auth and catalog flows."""

import os

import pytest
import requests


BASE_URL = os.environ.get("APPCATALOG_PREVIEW_URL") or os.environ.get("BACKEND_URL")


@pytest.fixture
def admin_client():
    client = requests.Session()
    response = client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "admin@corp.com", "password": "Admin!Passw0rd_1"},
        timeout=15,
    )
    assert response.status_code == 200, response.text
    assert any(cookie.name == "catalog_session" for cookie in response.cookies)
    return client


def test_admin_catalog_and_create_persistence(admin_client):
    apps = admin_client.get(f"{BASE_URL}/api/apps", timeout=15)
    categories = admin_client.get(f"{BASE_URL}/api/categories", timeout=15)
    assert apps.status_code == 200 and isinstance(apps.json(), list)
    assert len(apps.json()) >= 1
    assert categories.status_code == 200 and categories.json()

    payload = {
        "name": "API Regression Test App",
        "url": "https://api-regression.example.test",
        "category_id": categories.json()[0]["id"],
        "description": "Temporary regression record",
        "environment": "Production",
        "status": "Active",
        "icon": "AppWindow",
    }
    created = admin_client.post(f"{BASE_URL}/api/apps", json=payload, timeout=15)
    assert created.status_code == 201, created.text
    app = created.json()
    assert app["name"] == payload["name"]
    fetched = admin_client.get(f"{BASE_URL}/api/apps/{app['id']}", timeout=15)
    assert fetched.status_code == 200
    assert fetched.json()["url"] == payload["url"]
    deleted = admin_client.delete(f"{BASE_URL}/api/apps/{app['id']}", timeout=15)
    assert deleted.status_code == 204


def test_normal_user_is_category_scoped_and_not_admin():
    client = requests.Session()
    login = client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "john.doe@corp.com", "password": "User!Passw0rd_1"},
        timeout=15,
    )
    assert login.status_code == 200, login.text
    user = login.json()
    assert user["role"] != "administrator"
    apps = client.get(f"{BASE_URL}/api/apps", timeout=15)
    assert apps.status_code == 200
    assert len(apps.json()) > 0
    allowed = set(user["assigned_category_ids"])
    assert all(app["category_id"] in allowed for app in apps.json())
    forbidden = client.post(
        f"{BASE_URL}/api/apps",
        json={"name": "Unauthorized", "url": "https://x.example", "category_id": next(iter(allowed)), "description": "x", "environment": "Production", "status": "Active", "icon": "AppWindow"},
        timeout=15,
    )
    assert forbidden.status_code == 403