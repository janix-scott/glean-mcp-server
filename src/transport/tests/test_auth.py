import pytest
import jwt
import os
from datetime import datetime, timedelta
from ..auth import GleanAuth, AuthType, AuthError

@pytest.fixture
def auth_env():
    """Setup test environment variables"""
    os.environ["GLEAN_SUBDOMAIN"] = "test"
    os.environ["GLEAN_API_TOKEN"] = "test-token"
    os.environ["GLEAN_OAUTH_PROVIDER"] = "okta"
    os.environ["GLEAN_OAUTH_ISSUER"] = "https://test.okta.com"
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
        'client_token_secret': 'test-secret',
        'userinfo_endpoint': 'https://api.glean.com/v1/userinfo'
    }
    return auth

@pytest.mark.asyncio
async def test_client_token_validation(auth):
    # Create a test token
    user_context = {'user_id': '123', 'name': 'Test User'}
    token = auth.create_client_token(user_context)
    
    # Validate the token
    result = await auth.validate_client_token(token)
    assert result == user_context

@pytest.mark.asyncio
async def test_expired_client_token(auth):
    # Create an expired token
    user_context = {'user_id': '123'}
    payload = {
        'user_context': user_context,
        'exp': datetime.now() - timedelta(hours=1),
        'iat': datetime.now() - timedelta(hours=2)
    }
    token = jwt.encode(payload, 'test-secret', algorithm='HS256')
    
    # Validate should fail
    with pytest.raises(AuthError, match="Token has expired"):
        await auth.validate_client_token(token)

@pytest.mark.asyncio
async def test_invalid_client_token(auth):
    # Test with invalid token
    with pytest.raises(AuthError):
        await auth.validate_client_token("invalid-token")

@pytest.mark.asyncio
async def test_validate_auth(auth):
    # Test client token auth
    user_context = {'user_id': '123'}
    token = auth.create_client_token(user_context)
    
    result = await auth.validate_auth(AuthType.CLIENT_TOKEN, token)
    assert result == user_context
    
    # Test invalid auth type
    with pytest.raises(AuthError, match="Unsupported authentication type"):
        await auth.validate_auth("INVALID", token)

def test_validate_oauth_config(auth):
    assert auth.validate_oauth_config() == True
    
    # Test invalid provider
    auth.oauth_provider = "invalid"
    assert auth.validate_oauth_config() == False
    
    # Test missing issuer
    auth.oauth_provider = "okta"
    auth.oauth_issuer = None
    assert auth.validate_oauth_config() == False

def test_validate_client_token_config(auth):
    assert auth.validate_client_token_config() == True
    
    # Test missing token
    auth.client_token = None
    assert auth.validate_client_token_config() == False
    
    # Test missing subdomain
    auth.subdomain = None
    assert auth.validate_client_token_config() == False

def test_get_headers(auth):
    # Test OAuth headers
    headers = auth.get_headers(AuthType.OAUTH, access_token="test-token")
    assert headers["Authorization"] == "Bearer test-token"
    assert headers["X-Glean-Auth-Type"] == "OAUTH"
    
    # Test client token headers
    headers = auth.get_headers(AuthType.CLIENT_TOKEN, act_as_user="user@example.com")
    assert headers["Authorization"] == f"Bearer {auth.client_token}"
    assert headers["X-Scio-ActAs"] == "user@example.com" 