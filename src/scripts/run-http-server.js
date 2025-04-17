#!/usr/bin/env node

/**
 * This script runs the Glean MCP server with HTTP transport for testing.
 * It enables both HTTP and WebSocket connections on the specified port.
 */

import { runServer } from '../server.js';

// Set default port to 3000 or use provided port from environment
const port = parseInt(process.env.PORT || '3000', 10);

// Run the server with HTTP transport
runServer({
  transport: 'http',
  port
}).catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

console.log(`Starting Glean MCP Server with HTTP transport on port ${port}`);
console.log('Press Ctrl+C to stop the server'); 