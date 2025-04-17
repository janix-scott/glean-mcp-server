# MCP Auth Proxy for Glean MCP - Design Plan

## Overview

The MCP Auth Proxy will be a separate service that:

1. Provides an MCP-compliant HTTP endpoint for clients
2. Forwards requests to the underlying Glean MCP server 
3. Handles authentication and authorization
4. Manages user context switching using Glean's "act-as" parameter
5. Centrally manages a single global Glean API token

## Architecture

```
┌─────────────┐     HTTP      ┌──────────────┐     HTTP      ┌──────────────┐
│ MCP Clients ├────────────→ │  MCP Auth   │ ────────────→ │  Glean MCP   │
│ (Multiple)  │ ←────────────┤   Proxy     │ ←────────────┤   Server     │
└─────────────┘              └──────────────┘              └──────────────┘
                                    │
                                    │
                                    ▼
                               ┌──────────┐
                               │  Auth    │
                               │ Database │
                               └──────────┘
```

## Integration with Glean MCP Server

The MCP Auth Proxy is designed to work seamlessly with our existing Glean MCP server via HTTP transport. This design allows for:

1. **Centralized Token Management**: The proxy securely stores and manages a single global Glean API token with elevated permissions.

2. **User Context Isolation**: Each client connection maintains its own user context through the "act-as" parameter.

3. **Transparent Protocol Bridging**: The proxy implements the same MCP protocol as the Glean MCP server, allowing clients to connect without modification.

4. **Enhanced Security**: The global token is never exposed to end clients, reducing security risks.

### Global Token & User Context

As described by our customer: 

> "We can create a 'global' token for Glean that gives access to everything. That needs to be tightly controlled, obviously. The intermediary can use that token and expose an MCP interface to many clients. Glean API supports an 'act-as' param which is the user id (their email) that the proxy needs to pass along so that context is scoped to the user."

This pattern is implemented as follows:

1. The MCP Auth Proxy holds the global token securely in its configuration
2. Clients authenticate to the proxy with their own credentials
3. For each client session, the proxy:
   - Validates the client's authorization
   - Creates a session with the client's user context (email)
   - For all requests to the Glean MCP server:
     - Adds the global token for authentication
     - Includes the client's email as the "act-as" parameter
     - Ensures each client can only access their own data

This architecture allows for a single Glean MCP server to support multiple users through one global token, while ensuring proper data isolation and access control.

## Key Components

1. **HTTP Server**: FastAPI-based server providing MCP-compliant endpoints
2. **Authentication Service**: Handles user authentication via OAuth or API keys
3. **Session Manager**: Maintains sessions and user context
4. **Proxy Service**: Forwards requests to Glean MCP server
5. **Config Service**: Manages configuration and environment variables

## Repository Structure (Python Implementation)

```
mcp-auth-proxy/
├── src/
│   ├── main.py                     # Main application entry point
│   ├── config/
│   │   ├── __init__.py             # Configuration package
│   │   ├── settings.py             # Settings management
│   │   └── schema.py               # Configuration schema (Pydantic)
│   ├── auth/
│   │   ├── __init__.py             # Auth package
│   │   ├── middleware.py           # Auth middleware
│   │   ├── oauth.py                # OAuth implementation
│   │   └── apikey.py               # API key implementation
│   ├── proxy/
│   │   ├── __init__.py             # Proxy package
│   │   ├── forward.py              # Request forwarding
│   │   └── transform.py            # Request/response transformation
│   ├── session/
│   │   ├── __init__.py             # Session package
│   │   ├── store.py                # Session storage
│   │   └── context.py              # User context management
│   └── utils/
│       ├── __init__.py             # Utils package
│       ├── logger.py               # Logging utility
│       └── errors.py               # Error handling
├── tests/                          # Test directory
│   ├── __init__.py                 # Tests package
│   ├── conftest.py                 # Pytest configuration
│   ├── test_auth.py                # Auth tests
│   ├── test_proxy.py               # Proxy tests
│   └── test_session.py             # Session tests
├── pyproject.toml                  # Project configuration (Poetry)
├── .env.example                    # Example environment variables
├── docker-compose.yml              # Docker compose for development
└── README.md                       # Project documentation
```

## API Design

### Endpoints

1. **`POST /v1/mcp`**: Main MCP endpoint
   - Handles MCP protocol messages
   - Requires authentication
   - Forwards to Glean MCP server

2. **`GET /v1/mcp`**: SSE endpoint for streaming responses
   - Maintains persistent connection
   - Routes responses back to appropriate client

3. **`DELETE /v1/mcp`**: Session termination
   - Ends current session
   - Cleans up resources

4. **`POST /auth/login`**: Authentication endpoint
   - Supports various auth methods
   - Returns session token

5. **`GET /health`**: Health check endpoint
   - Reports service status

### Headers

1. **`Authorization`**: Bearer token for authentication
2. **`Mcp-Session-Id`**: Session identifier
3. **`X-User-Email`**: User email for context switching

## Request & Response Flow

The communication flow between client, proxy, and Glean MCP server works as follows:

1. **Client → Proxy (Request)**
   - Client sends MCP request to proxy with Authorization header
   - Proxy validates client authentication
   - Proxy retrieves user context for session

2. **Proxy → Glean MCP Server (Forward)**
   - Proxy adds global Glean token
   - Proxy adds X-Scio-Actas header with user's email
   - Request is forwarded to Glean MCP server HTTP endpoint

3. **Glean MCP Server → Proxy (Response)**
   - Glean MCP server processes request in user's context
   - Response is returned to proxy

4. **Proxy → Client (Return)**
   - Proxy strips any sensitive headers
   - Response is returned to client

For streaming responses (SSE/WebSockets):

1. Client establishes a persistent connection with the proxy
2. Proxy maintains a corresponding connection to the Glean MCP server
3. Messages are passed through in real-time while maintaining context

## Authentication Flow

1. Client authenticates with proxy via OAuth or API key
2. Proxy creates a session and maps it to a user context
3. Proxy uses global Glean token + "act-as" parameter for all requests
4. Each session maintains its own user context

## User Context Management

1. Proxy stores mapping of session IDs to user contexts
2. For each request, proxy sets appropriate "act-as" parameter
3. All requests use the same global Glean API token
4. User context can be changed during a session

## Implementation Plan

### Phase 1: Core Framework

1. Set up basic project structure
2. Implement HTTP server with FastAPI
3. Create configuration management with Pydantic
4. Set up logging and error handling

### Phase 2: Authentication & Sessions

1. Implement session management
2. Create authentication service
3. Add middleware for securing endpoints
4. Implement user context storage

### Phase 3: Proxy Functionality

1. Create proxy service for forwarding requests
2. Implement response handling and streaming
3. Add WebSocket support
4. Add context switching logic

### Phase 4: Testing & Documentation

1. Create comprehensive tests with pytest
2. Add documentation with Swagger/OpenAPI
3. Create deployment instructions
4. Performance optimization

## Configuration Requirements

```
# Server configuration
PORT=3000
LOG_LEVEL=INFO

# Glean MCP Server
GLEAN_MCP_SERVER_URL=http://localhost:3001/v1/mcp

# Glean API configuration
GLEAN_SUBDOMAIN=yourdomain
GLEAN_GLOBAL_API_TOKEN=your-global-token

# Authentication (choose one)
AUTH_TYPE=oauth|apikey|none

# OAuth configuration (if using OAuth)
OAUTH_CLIENT_ID=your-client-id
OAUTH_CLIENT_SECRET=your-client-secret
OAUTH_REDIRECT_URI=http://localhost:3000/auth/callback

# Session configuration
SESSION_SECRET=your-session-secret
SESSION_TIMEOUT=1800  # 30 minutes in seconds
```

## Security Considerations

1. The global API token must be securely stored
2. All communication should use HTTPS
3. Rate limiting should be implemented
4. Input validation for all endpoints
5. Proper authentication and authorization checks
6. Audit logging for all requests

## Python-specific Implementation Details

1. **FastAPI Framework**: Use FastAPI for high-performance async HTTP handling
2. **Pydantic Models**: Define schemas with Pydantic for validation
3. **HTTPX**: Use HTTPX for async HTTP client requests
4. **Redis/SQLAlchemy**: Options for session storage
5. **Starlette**: Base framework for WebSockets and SSE
6. **Python-JOSE**: JWT token handling for authentication
7. **Python-Multipart**: Form data parsing for OAuth flows
8. **Uvicorn/Gunicorn**: ASGI servers for deployment

## Deployment Options

1. **Docker Container**: Package as Docker image
2. **Kubernetes**: Deploy with Kubernetes for scaling
3. **Cloud Services**: Deploy to AWS, GCP, or Azure
4. **Virtual Environments**: Deploy to traditional servers

## Testing Strategy

1. **Unit Tests**: Test individual components
2. **Integration Tests**: Test component interactions
3. **End-to-End Tests**: Test complete flows
4. **Performance Tests**: Test under load
5. **Mock Server**: Create mock Glean MCP server for testing 