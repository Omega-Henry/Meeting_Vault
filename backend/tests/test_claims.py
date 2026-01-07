from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_onboarding_search_requires_auth():
    """Verify search endpoint requires authentication"""
    response = client.post("/api/claims/search", json={"email": "nonexistent@example.com"})
    assert response.status_code == 401


def test_create_contact_requires_auth():
    """Verify unauthenticated requests are blocked"""
    response = client.post("/api/claims", json={
        "contact_id": "some-uuid",
        "evidence": {"type": "email"}
    })
    # Should fail without auth header
    # Note: Depending on main.py middleware, might be 401 or 403
    assert response.status_code in [401, 403]
