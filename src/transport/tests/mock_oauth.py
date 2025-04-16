from fastapi import FastAPI, HTTPException, Header
from typing import Optional, Dict
import jwt
from datetime import datetime, timedelta

mock_oauth_app = FastAPI()

# Mock user database
MOCK_USERS = {
    "test@example.com": {
        "id": "user123",
        "email": "test@example.com",
        "name": "Test User",
        "groups": ["users"]
    }
}

# Mock tokens database
TOKENS = {}

# Configuration
SECRET_KEY = "mock-oauth-secret"
TOKEN_EXPIRE_MINUTES = 60

def create_access_token(data: Dict, expires_delta: Optional[timedelta] = None):
    """Create a mock OAuth access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm="HS256")
    return encoded_jwt

@mock_oauth_app.post("/token")
async def token_endpoint(username: str, password: str):
    """Mock OAuth token endpoint"""
    # In real OAuth this would validate client credentials
    if username not in MOCK_USERS:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Create access token
    access_token = create_access_token(
        data={"sub": username, "user_id": MOCK_USERS[username]["id"]}
    )
    
    TOKENS[access_token] = MOCK_USERS[username]
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": TOKEN_EXPIRE_MINUTES * 60
    }

@mock_oauth_app.get("/userinfo")
async def userinfo_endpoint(authorization: str = Header(None)):
    """Mock OAuth userinfo endpoint"""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    
    try:
        token_type, token = authorization.split()
        if token_type.lower() != "bearer":
            raise HTTPException(status_code=401, detail="Invalid token type")
        
        # Verify token
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            username = payload["sub"]
            if username not in MOCK_USERS:
                raise HTTPException(status_code=401, detail="Invalid token")
            
            return MOCK_USERS[username]
            
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token has expired")
        except jwt.JWTError:
            raise HTTPException(status_code=401, detail="Invalid token")
            
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid authorization header format")

@mock_oauth_app.get("/.well-known/openid-configuration")
async def openid_configuration():
    """Mock OpenID Connect discovery endpoint"""
    return {
        "issuer": "http://localhost:8081",
        "authorization_endpoint": "http://localhost:8081/authorize",
        "token_endpoint": "http://localhost:8081/token",
        "userinfo_endpoint": "http://localhost:8081/userinfo",
        "jwks_uri": "http://localhost:8081/.well-known/jwks.json",
        "response_types_supported": ["code"],
        "subject_types_supported": ["public"],
        "id_token_signing_alg_values_supported": ["RS256"],
        "scopes_supported": ["openid", "email", "profile"],
        "token_endpoint_auth_methods_supported": ["client_secret_basic"],
        "claims_supported": ["sub", "iss", "name", "email"]
    } 