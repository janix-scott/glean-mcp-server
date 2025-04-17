# Glean MCP Server

Enhanced Model Context Protocol (MCP) server for Glean, offering both HTTP and stdio transport options.

## Overview

This project extends the standard MCP server to provide HTTP transport support alongside the traditional stdio transport. The HTTP transport enables:

- REST-based API endpoints for MCP protocol messages
- Server-Sent Events (SSE) for streaming responses
- WebSocket connections for bidirectional communication
- Session management with user context

## Features

- **Multiple Transport Options**: Choose between stdio (default) and HTTP transports
- **MCP Protocol Compliance**: Fully implements the MCP specification
- **Comprehensive Tools**: Provides search and chat capabilities through Glean's API
- **Session Management**: Maintains user state across requests
- **Health Monitoring**: Includes health check endpoints
- **Robust Error Handling**: Provides detailed error information

## Getting Started

### Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build
```

### Running the Server

#### With stdio Transport (Default)

```bash
npm start
```

#### With HTTP Transport

```bash
# Use the serve:http script
npm run serve:http

# Or run directly with options
node build/index.js --transport=http --port=3000
```

### Testing the Server

```bash
# Run all tests
npm test

# Start the HTTP server
npm run serve:http

# In another terminal, run the example HTTP client
npm run client:http
```

## MCP Endpoints and Tools

The server provides the following MCP tools:

1. **glean_search**: Search through Glean's enterprise knowledge
   ```json
   {
     "name": "glean_search",
     "arguments": {
       "query": "your search query"
     }
   }
   ```

2. **glean_chat**: Chat with Glean's AI assistant
   ```json
   {
     "name": "glean_chat",
     "arguments": {
       "prompt": "your chat message"
     }
   }
   ```

## HTTP Transport

The HTTP transport provides these endpoints:

- **`POST /v1/mcp`**: Send MCP protocol messages
- **`GET /v1/mcp`**: Receive streaming responses via SSE
- **`DELETE /v1/mcp`**: Terminate a session
- **`GET /health`**: Health check endpoint

See the [Transport Layer README](src/transport/README.md) for detailed information about the HTTP transport implementation.

## Example HTTP Client

An example HTTP client is provided to demonstrate interaction with the server:

```bash
npm run client:http
```

This interactive client allows you to:
- List available tools
- Execute search queries
- Chat with the assistant
- Properly handle session management

## Project Structure

```
src/
├── common/          # Common utilities and error handling
├── configure/       # Configuration management
├── examples/        # Example clients
│   └── http-client.js   # Example HTTP client
├── scripts/         # Utility scripts
│   └── run-http-server.js   # Script to run HTTP server
├── tools/           # MCP tool implementations
│   ├── search.js    # Glean search tool
│   └── chat.js      # Glean chat tool
├── transport/       # Transport layer implementations
│   ├── http.ts      # HTTP transport implementation
│   └── tests/       # Transport tests
├── server.ts        # Main server implementation
└── index.ts         # Entry point
```

## License

MIT
