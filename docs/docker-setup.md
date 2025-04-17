# Running MCP Auth Proxy with Glean MCP Server

This guide explains how to run both the MCP Auth Proxy and Glean MCP Server together using Docker. The setup uses Docker networking to enable secure communication between the services.

## Prerequisites

- Docker installed and running
- Access to both repositories:
  - MCP Auth Proxy repository
  - Glean MCP Server repository

## Network Setup

First, create a Docker network that both services will use to communicate:

```bash
docker network create mcp-network
```

## Building the Images

1. **Build Glean MCP Server** (in the Glean MCP Server repository):
   ```bash
   cd /path/to/glean-mcp-server
   docker build -t glean-mcp-server .
   ```

2. **Build MCP Auth Proxy** (in the MCP Auth Proxy repository):
   ```bash
   cd /path/to/mcp-auth-proxy
   docker build -t mcp-auth-proxy .
   ```

## Running the Services

### 1. Start Glean MCP Server

```bash
docker run -d \
  --name glean-mcp-server \
  --network mcp-network \
  -p 3000:3000 \
  glean-mcp-server
```

### 2. Start MCP Auth Proxy

```bash
docker run -d \
  --name mcp-auth-proxy \
  --network mcp-network \
  -p 8000:8000 \
  -e AUTH_TYPE=oauth \
  -e SESSION_SECRET=your_secret \
  -e SESSION_TIMEOUT=3600 \
  -e GLEAN_MCP_SERVER_URL=http://glean-mcp-server:3000 \
  -e GLEAN_SUBDOMAIN=your_subdomain \
  -e GLEAN_GLOBAL_API_TOKEN=your_token \
  -e ALLOWED_IPS=0.0.0.0/0 \
  -e OAUTH_CLIENT_ID=your_client_id \
  -e OAUTH_CLIENT_SECRET=your_client_secret \
  -e OAUTH_AUTHORIZE_URL=http://your-oauth-server/auth \
  -e OAUTH_TOKEN_URL=http://your-oauth-server/token \
  -e OAUTH_USERINFO_URL=http://your-oauth-server/userinfo \
  -e OAUTH_PROVIDER_NAME=generic_oauth \
  mcp-auth-proxy
```

Note: Replace the environment variables with your actual configuration values.

## Verifying the Setup

1. **Check Container Status:**
   ```bash
   docker ps
   ```
   Both containers should be listed and running.

2. **Check Container Logs:**
   ```bash
   # Check Glean MCP Server logs
   docker logs glean-mcp-server
   
   # Check MCP Auth Proxy logs
   docker logs mcp-auth-proxy
   ```

3. **Test the Connection:**
   ```bash
   # Check MCP Auth Proxy health
   curl http://localhost:8000/health
   
   # Check Glean MCP Server health (if endpoint available)
   curl http://localhost:3000/health
   ```

## Network Communication

- The MCP Auth Proxy can reach the Glean MCP Server at `http://glean-mcp-server:3000` (container DNS name)
- External clients connect to the MCP Auth Proxy at `http://localhost:8000`
- The MCP Auth Proxy forwards authenticated requests to the Glean MCP Server

## Troubleshooting

1. **Container Networking:**
   ```bash
   # Verify network connectivity
   docker network inspect mcp-network
   
   # Check if containers are on the network
   docker inspect glean-mcp-server | grep -A 20 "Networks"
   docker inspect mcp-auth-proxy | grep -A 20 "Networks"
   ```

2. **Container Logs:**
   ```bash
   # Follow logs in real-time
   docker logs -f mcp-auth-proxy
   docker logs -f glean-mcp-server
   ```

3. **Common Issues:**
   - If containers can't communicate, ensure both are on the `mcp-network`
   - If ports are already in use, stop any existing containers or change the port mapping
   - Check environment variables are correctly set
   - Verify OAuth server URLs are accessible from the MCP Auth Proxy container

## Cleanup

To stop and remove the containers and network:

```bash
# Stop containers
docker stop mcp-auth-proxy glean-mcp-server

# Remove containers
docker rm mcp-auth-proxy glean-mcp-server

# Remove network
docker network rm mcp-network
```

## Using Docker Compose (Alternative)

If you prefer using Docker Compose, here's a sample `docker-compose.yml` that you can use:

```yaml
version: '3.8'

services:
  glean-mcp-server:
    build: ../glean-mcp-server  # Adjust path as needed
    container_name: glean-mcp-server
    ports:
      - "3000:3000"
    networks:
      - mcp-network

  mcp-auth-proxy:
    build: .
    container_name: mcp-auth-proxy
    ports:
      - "8000:8000"
    environment:
      - AUTH_TYPE=oauth
      - SESSION_SECRET=your_secret
      - SESSION_TIMEOUT=3600
      - GLEAN_MCP_SERVER_URL=http://glean-mcp-server:3000
      - GLEAN_SUBDOMAIN=your_subdomain
      - GLEAN_GLOBAL_API_TOKEN=your_token
      - ALLOWED_IPS=0.0.0.0/0
      - OAUTH_CLIENT_ID=your_client_id
      - OAUTH_CLIENT_SECRET=your_client_secret
      - OAUTH_AUTHORIZE_URL=http://your-oauth-server/auth
      - OAUTH_TOKEN_URL=http://your-oauth-server/token
      - OAUTH_USERINFO_URL=http://your-oauth-server/userinfo
      - OAUTH_PROVIDER_NAME=generic_oauth
    depends_on:
      - glean-mcp-server
    networks:
      - mcp-network

networks:
  mcp-network:
    name: mcp-network
```

To use Docker Compose:
```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
``` 