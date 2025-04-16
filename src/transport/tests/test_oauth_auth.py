import pytest
import os
from fastapi.testclient import TestClient
from ..auth import GleanAuth, AuthType, AuthError
from .mock_oauth import mock_oauth_app, MOCK_USERS, create_access_token
import asyncio
import aiohttp
import jwt
from datetime import datetime, timedelta

@pytest.fixture
def oauth_client():
    return TestClient(mock_oauth_app)

@pytest.fixture
def auth_env():
    """Setup test environment variables"""
    os.environ["GLEAN_SUBDOMAIN"] = "test"
    os.environ["GLEAN_API_TOKEN"] = "test-token"
    os.environ["GLEAN_OAUTH_PROVIDER"] = "okta"
    os.environ["GLEAN_OAUTH_ISSUER"] = "http://localhost:8081"
    os.environ["GLEAN_OAUTH_CLIENT_IDS"] = "client1,client2"
    yield
    # Cleanup
    del os.environ["GLEAN_SUBDOMAIN"]
    del os.environ["GLEAN_API_TOKEN"]
    del os.environ["GLEAN_OAUTH_PROVIDER"]
    del os.environ["GLEAN_OAUTH_ISSUER"]
    del os.environ["GLEAN_OAUTH_CLIENT_IDS"]

@pytest.fixture
def auth(auth_env):
    auth = GleanAuth()
    auth.oauth_config = {
        'userinfo_endpoint': 'http://localhost:8081/userinfo'
    }
    return auth

@pytest.mark.asyncio
async def test_oauth_token_validation(auth, oauth_client):
    # Get a token from mock OAuth server
    response = oauth_client.post("/token", params={
        "username": "test@example.com",
        "password": "password"
    })
    assert response.status_code == 200
    token_data = response.json()
    assert "access_token" in token_data
    
    # Validate the token with our auth module
    user_context = await auth.validate_oauth_token(token_data["access_token"])
    assert user_context["email"] == "test@example.com"
    assert user_context["id"] == "user123"

@pytest.mark.asyncio
async def test_expired_oauth_token(auth, oauth_client):
    # Create an expired token
    expired_token = create_access_token(
        {"sub": "test@example.com"},
        expires_delta=timedelta(minutes=-5)
    )
    
    # Validation should fail
    with pytest.raises(AuthError, match="Failed to validate token: 401"):
        await auth.validate_oauth_token(expired_token)

@pytest.mark.asyncio
async def test_invalid_oauth_token(auth):
    # Test with invalid token
    with pytest.raises(AuthError):
        await auth.validate_oauth_token("invalid-token")

@pytest.mark.asyncio
async def test_oauth_token_caching(auth, oauth_client):
    # Get initial token
    response = oauth_client.post("/token", params={
        "username": "test@example.com",
        "password": "password"
    })
    token = response.json()["access_token"]
    
    # First validation should hit the mock server
    user_context1 = await auth.validate_oauth_token(token)
    assert user_context1["email"] == "test@example.com"
    
    # Second validation should use cache
    user_context2 = await auth.validate_oauth_token(token)
    assert user_context2 == user_context1
    
    # Verify it's in the cache
    assert token in auth._token_cache
    cached = auth._token_cache[token]
    assert cached["user_context"] == user_context1

@pytest.mark.asyncio
async def test_validate_auth_with_oauth(auth, oauth_client):
    # Get token from mock server
    response = oauth_client.post("/token", params={
        "username": "test@example.com",
        "password": "password"
    })
    token = response.json()["access_token"]
    
    # Validate using validate_auth
    user_context = await auth.validate_auth(AuthType.OAUTH, token)
    assert user_context["email"] == "test@example.com"
    assert user_context["id"] == "user123" 