# Glean MCP Server Transport Layer

This directory contains the transport implementations for the Glean MCP (Model Context Protocol) server. The transport layer is responsible for handling communication between clients and the MCP server.

## Available Transports

The Glean MCP server supports multiple transport mechanisms:

1. **STDIO Transport** (Default): Communication via standard input/output streams, used when the server is launched as a subprocess.
2. **HTTP Transport**: Communication over HTTP, supporting both JSON-RPC requests and Server-Sent Events (SSE) for streaming responses.

## HTTP Transport Implementation

The HTTP transport (`http.ts`) implements the MCP protocol over HTTP, supporting:

- JSON-RPC message exchange via HTTP POST requests
- Server-Sent Events (SSE) for streaming responses
- WebSocket connections for bidirectional communication
- Session management with timeout mechanisms
- MCP protocol-compliant request/response handling

### Key Features

- **Full MCP Protocol Support**: Implements the complete Model Context Protocol specification
- **Session Management**: Maintains session state across multiple requests
- **Multiple Connection Types**: Supports both traditional HTTP requests and streaming connections
- **Timeout Handling**: Automatically cleans up expired sessions
- **Health Checks**: Provides a `/health` endpoint for monitoring

### API Endpoints

- **`POST /v1/mcp`**: Primary endpoint for MCP protocol messages
- **`GET /v1/mcp`**: SSE endpoint for receiving streaming responses
- **`DELETE /v1/mcp`**: Endpoint for explicitly terminating sessions
- **`GET /health`**: Health check endpoint

### HTTP Headers

- **`Mcp-Session-Id`**: Session identifier header for maintaining state across requests
- **`Content-Type`**: Set to `application/json` for requests
- **`Accept`**: Set to `text/event-stream` for SSE connections or `application/json` for regular responses

## Usage

### Server Configuration

To start the MCP server with HTTP transport:

```javascript
import { runServer } from './server.js';

runServer({
  transport: 'http',
  port: 3000
});
```

Or use the provided script:

```bash
npm run serve:http
```

### Client Integration

Example of a client connecting to the HTTP transport:

```javascript
import axios from 'axios';

// Initialize session
const response = await axios.post(
  'http://localhost:3000/v1/mcp',
  {
    jsonrpc: '2.0',
    id: '1',
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: {
        name: 'Example Client',
        version: '1.0.0'
      }
    }
  }
);

// Extract session ID
const sessionId = response.headers['mcp-session-id'];

// Send subsequent requests with the session ID
await axios.post(
  'http://localhost:3000/v1/mcp',
  {
    jsonrpc: '2.0',
    id: '2',
    method: 'tools/list'
  },
  {
    headers: {
      'Mcp-Session-Id': sessionId
    }
  }
);
```

See `src/examples/http-client.js` for a complete example client implementation.

## Testing

The transport layer includes comprehensive tests:

- **Unit Tests**: Test individual components of the transport implementation
- **Integration Tests**: Test the transport with a mock MCP server

Run the tests with:

```bash
npm test
```

## Implementation Notes

- The HTTP transport implements the `Transport` interface from the MCP SDK
- The implementation handles both requests to the server and responses/notifications from the server
- Sessions are created on the first request and maintained via the `Mcp-Session-Id` header
- The transport broadcasts responses to the appropriate session using an event emitter
- Session data is cleaned up after a configurable timeout period (default: 30 minutes)

## Example Workflow

1. Client sends `initialize` request to `POST /v1/mcp`
2. Server creates a session and returns the session ID in the `Mcp-Session-Id` header
3. Client sends `notifications/initialized` notification with the session ID
4. Client opens an SSE connection to `GET /v1/mcp` to receive streaming responses
5. Client sends tool requests to `POST /v1/mcp`
6. Server processes requests and sends responses via the SSE connection
7. Client can explicitly terminate the session with `DELETE /v1/mcp` 