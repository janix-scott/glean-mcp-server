import asyncio
import websockets
import aiohttp
import json
import sys
from typing import Optional, Dict, Any

class MCPTestClient:
    """Test client for MCP server that supports both HTTP and WebSocket connections"""
    
    def __init__(self, base_url: str = "http://localhost:3000"):
        self.base_url = base_url
        self.session_id: Optional[str] = None
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.http_session: Optional[aiohttp.ClientSession] = None
    
    async def connect_http(self):
        """Connect using HTTP transport"""
        self.http_session = aiohttp.ClientSession()
        
        # Initialize connection
        init_message = {
            "jsonrpc": "2.0",
            "id": "1",
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-03-26",
                "capabilities": {
                    "roots": {"listChanged": True},
                    "sampling": {}
                },
                "clientInfo": {
                    "name": "TestClient",
                    "version": "1.0.0"
                }
            }
        }
        
        async with self.http_session.post(
            f"{self.base_url}/v1/mcp",
            json=init_message,
            headers={"Accept": "application/json"}
        ) as response:
            self.session_id = response.headers.get("Mcp-Session-Id")
            data = await response.json()
            print("Initialize response:", json.dumps(data, indent=2))
            return data
    
    async def connect_ws(self):
        """Connect using WebSocket transport"""
        self.ws = await websockets.connect(f"ws://localhost:3000/v1/mcp/ws")
        
        # Initialize connection
        init_message = {
            "jsonrpc": "2.0",
            "id": "1",
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-03-26",
                "capabilities": {
                    "roots": {"listChanged": True},
                    "sampling": {}
                },
                "clientInfo": {
                    "name": "TestClient",
                    "version": "1.0.0"
                }
            }
        }
        
        await self.ws.send(json.dumps(init_message))
        response = await self.ws.recv()
        data = json.loads(response)
        print("WebSocket initialize response:", json.dumps(data, indent=2))
        return data
    
    async def send_http(self, message: Dict[str, Any]):
        """Send message using HTTP transport"""
        if not self.http_session:
            raise RuntimeError("HTTP session not initialized")
            
        async with self.http_session.post(
            f"{self.base_url}/v1/mcp",
            json=message,
            headers={
                "Accept": "application/json",
                "Mcp-Session-Id": self.session_id
            }
        ) as response:
            data = await response.json()
            print(f"HTTP Response for {message['method']}:", json.dumps(data, indent=2))
            return data
    
    async def send_ws(self, message: Dict[str, Any]):
        """Send message using WebSocket transport"""
        if not self.ws:
            raise RuntimeError("WebSocket not connected")
            
        await self.ws.send(json.dumps(message))
        response = await self.ws.recv()
        data = json.loads(response)
        print(f"WebSocket Response for {message['method']}:", json.dumps(data, indent=2))
        return data
    
    async def close(self):
        """Close all connections"""
        if self.http_session:
            await self.http_session.close()
        if self.ws:
            await self.ws.close()

async def run_tests():
    """Run integration tests"""
    # Test HTTP transport
    print("\n=== Testing HTTP Transport ===")
    http_client = MCPTestClient()
    await http_client.connect_http()
    
    # Test ping
    ping_message = {
        "jsonrpc": "2.0",
        "id": "2",
        "method": "ping"
    }
    await http_client.send_http(ping_message)
    
    # Test tools/list
    tools_message = {
        "jsonrpc": "2.0",
        "id": "3",
        "method": "tools/list"
    }
    await http_client.send_http(tools_message)
    
    await http_client.close()
    
    # Test WebSocket transport
    print("\n=== Testing WebSocket Transport ===")
    ws_client = MCPTestClient()
    await ws_client.connect_ws()
    
    # Test ping
    await ws_client.send_ws(ping_message)
    
    # Test tools/list
    await ws_client.send_ws(tools_message)
    
    await ws_client.close()

if __name__ == "__main__":
    asyncio.run(run_tests()) 