import pytest
from fastapi.testclient import TestClient
from src.transport.http_server import app, SessionManager, Session, MCPMessage
import json
import asyncio
from unittest.mock import Mock, patch

@pytest.fixture
def client():
    return TestClient(app)

def test_health_endpoint(client):
    """Test the health check endpoint"""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}

def test_mcp_endpoint_initialize(client):
    """Test the MCP endpoint with an initialize request"""
    # Create an initialize request
    initialize_request = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-03-26",
            "capabilities": {
                "roots": {
                    "listChanged": True
                },
                "sampling": {}
            },
            "clientInfo": {
                "name": "TestClient",
                "version": "1.0.0"
            }
        }
    }
    
    # Send the request
    response = client.post(
        "/v1/mcp",
        json=initialize_request,
        headers={"Accept": "application/json"}
    )
    
    # Print debug information
    print(f"\nRequest URL: {response.url}")
    print(f"Request Headers: {response.request.headers}")
    print(f"Response Status: {response.status_code}")
    print(f"Response Headers: {response.headers}")
    print(f"Response Body: {response.text}")
    
    assert response.status_code == 200
    response_data = response.json()
    assert response_data["jsonrpc"] == "2.0"
    assert response_data["id"] == 1
    assert "Mcp-Session-Id" in response.headers

def test_mcp_endpoint_invalid_session(client):
    """Test the MCP endpoint with an invalid session ID"""
    request = {
        "jsonrpc": "2.0",
        "id": 2,
        "method": "ping",
        "params": {}
    }
    
    response = client.post(
        "/v1/mcp",
        json=request,
        headers={
            "Accept": "application/json",
            "Mcp-Session-Id": "invalid-session-id"
        }
    )
    
    assert response.status_code == 404
    response_data = response.json()
    assert response_data["error"]["code"] == -32000
    assert "Invalid or expired session" in response_data["error"]["message"]

def test_mcp_endpoint_invalid_json(client):
    """Test the MCP endpoint with invalid JSON"""
    response = client.post(
        "/v1/mcp",
        data="invalid json",
        headers={"Accept": "application/json"}
    )
    
    assert response.status_code == 400
    response_data = response.json()
    assert response_data["error"]["code"] == -32700
    assert "Parse error" in response_data["error"]["message"]

def test_mcp_endpoint_wrong_accept(client):
    """Test the MCP endpoint with wrong Accept header"""
    response = client.post(
        "/v1/mcp",
        json={"jsonrpc": "2.0"},
        headers={"Accept": "text/plain"}
    )
    
    assert response.status_code == 406
    assert "Not Acceptable" in response.text

def test_invalid_message():
    """Test handling of invalid messages"""
    invalid_message = {
        "invalid": "message"
    }
    
    response = client.post(
        "/v1/mcp",
        json=invalid_message,
        headers={"Accept": "application/json"}
    )
    
    assert response.status_code == 400
    data = response.json()
    assert data["error"]["code"] == -32700

def test_session_management():
    """Test session creation and validation"""
    # First create a session
    init_message = {
        "jsonrpc": "2.0",
        "id": "1",
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-03-26",
            "capabilities": {},
            "clientInfo": {"name": "test", "version": "1.0"}
        }
    }
    
    response = client.post(
        "/v1/mcp",
        json=init_message,
        headers={"Accept": "application/json"}
    )
    
    session_id = response.headers["Mcp-Session-Id"]
    
    # Try using the session
    test_message = {
        "jsonrpc": "2.0",
        "id": "2",
        "method": "ping"
    }
    
    response = client.post(
        "/v1/mcp",
        json=test_message,
        headers={
            "Accept": "application/json",
            "Mcp-Session-Id": session_id
        }
    )
    
    assert response.status_code == 200
    
    # Try with invalid session
    response = client.post(
        "/v1/mcp",
        json=test_message,
        headers={
            "Accept": "application/json",
            "Mcp-Session-Id": "invalid-session"
        }
    )
    
    assert response.status_code == 404 