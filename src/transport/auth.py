from typing import Optional, Dict, Any
from enum import Enum
import os
from dotenv import load_dotenv
import jwt
from datetime import datetime, timedelta
import aiohttp
import json

class AuthType(str, Enum):
    """Type of authentication being used"""
    OAUTH = "OAUTH"
    CLIENT_TOKEN = "CLIENT_TOKEN"

class AuthError(Exception):
    """Base class for authentication errors"""
    pass

class GleanAuth:
    """Handles authentication with Glean API"""
    
    def __init__(self):
        load_dotenv()
        self.subdomain = os.getenv("GLEAN_SUBDOMAIN")
        self.client_token = os.getenv("GLEAN_API_TOKEN")
        self.oauth_provider = os.getenv("GLEAN_OAUTH_PROVIDER")
        self.oauth_issuer = os.getenv("GLEAN_OAUTH_ISSUER")
        self.oauth_client_ids = os.getenv("GLEAN_OAUTH_CLIENT_IDS", "").split(",")
        self.oauth_config = {}
        self._token_cache: Dict[str, Dict[str, Any]] = {}
        
    def get_headers(self, auth_type: AuthType, access_token: Optional[str] = None, act_as_user: Optional[str] = None) -> Dict[str, str]:
        """Get headers for Glean API request
        
        Args:
            auth_type: Type of authentication to use
            access_token: OAuth access token (required if auth_type is OAUTH)
            act_as_user: Email of user to act as (required for global client tokens)
            
        Returns:
            Dict of headers to use for request
        """
        headers = {}
        
        if auth_type == AuthType.OAUTH:
            if not access_token:
                raise ValueError("access_token required for OAuth authentication")
                
            headers.update({
                "Authorization": f"Bearer {access_token}",
                "X-Glean-Auth-Type": "OAUTH"
            })
            
        elif auth_type == AuthType.CLIENT_TOKEN:
            if not self.client_token:
                raise ValueError("GLEAN_API_TOKEN not configured")
                
            headers["Authorization"] = f"Bearer {self.client_token}"
            
            # Add X-Scio-ActAs header if acting as specific user
            if act_as_user:
                headers["X-Scio-ActAs"] = act_as_user
                
        return headers
    
    def validate_oauth_config(self) -> bool:
        """Check if OAuth configuration is valid"""
        if not self.oauth_provider:
            return False
            
        if self.oauth_provider.lower() not in ["azure", "gsuite", "okta", "onelogin"]:
            return False
            
        # GSuite doesn't require issuer
        if self.oauth_provider.lower() != "gsuite" and not self.oauth_issuer:
            return False
            
        if not self.oauth_client_ids or not any(self.oauth_client_ids):
            return False
            
        return True
    
    def validate_client_token_config(self) -> bool:
        """Check if client token configuration is valid"""
        return bool(self.subdomain and self.client_token)
    
    def get_base_url(self) -> str:
        """Get base URL for Glean API"""
        if not self.subdomain:
            raise ValueError("GLEAN_SUBDOMAIN not configured")
        return f"https://{self.subdomain}.glean.com/api/v1"
    
    async def validate_oauth_token(self, token: str) -> Dict[str, Any]:
        """Validate an OAuth token and return the user context"""
        # Check cache first
        if token in self._token_cache:
            cached = self._token_cache[token]
            if datetime.now() < cached['expires_at']:
                return cached['user_context']
        
        # Validate with OAuth provider
        try:
            async with aiohttp.ClientSession() as session:
                headers = {'Authorization': f'Bearer {token}'}
                async with session.get(
                    self.oauth_config.get('userinfo_endpoint', 'https://api.glean.com/v1/userinfo'),
                    headers=headers
                ) as response:
                    if response.status != 200:
                        raise AuthError(f"Failed to validate token: {response.status}")
                    
                    user_info = await response.json()
                    
                    # Cache the result
                    self._token_cache[token] = {
                        'user_context': user_info,
                        'expires_at': datetime.now() + timedelta(minutes=5)
                    }
                    
                    return user_info
        except aiohttp.ClientError as e:
            raise AuthError(f"Failed to validate token: {str(e)}")
    
    async def validate_client_token(self, token: str) -> Dict[str, Any]:
        """Validate a client token and return the user context"""
        try:
            # Decode and verify the token
            payload = jwt.decode(
                token,
                self.oauth_config.get('client_token_secret', 'your-secret-key'),
                algorithms=['HS256']
            )
            
            # Check if token is expired
            if 'exp' in payload and datetime.fromtimestamp(payload['exp']) < datetime.now():
                raise AuthError("Token has expired")
            
            return payload.get('user_context', {})
            
        except jwt.InvalidTokenError as e:
            raise AuthError(f"Invalid client token: {str(e)}")
    
    async def validate_auth(self, auth_type: AuthType, token: str) -> Dict[str, Any]:
        """Validate authentication based on type and return user context"""
        if auth_type == AuthType.OAUTH:
            return await self.validate_oauth_token(token)
        elif auth_type == AuthType.CLIENT_TOKEN:
            return await self.validate_client_token(token)
        else:
            raise AuthError(f"Unsupported authentication type: {auth_type}")
    
    def create_client_token(self, user_context: Dict[str, Any], expires_in: int = 3600) -> str:
        """Create a new client token with the given user context"""
        payload = {
            'user_context': user_context,
            'exp': datetime.now() + timedelta(seconds=expires_in),
            'iat': datetime.now()
        }
        
        return jwt.encode(
            payload,
            self.oauth_config.get('client_token_secret', 'your-secret-key'),
            algorithm='HS256'
        ) 