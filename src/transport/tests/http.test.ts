import { HttpServerTransport } from '../http.js';
import axios from 'axios';

// Define types more explicitly to avoid type errors
interface JSONRPCRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, any>;
}

interface JSONRPCResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

type JSONRPCMessage = JSONRPCRequest | JSONRPCResponse;

describe('HttpServerTransport', () => {
  let transport: HttpServerTransport;
  const TEST_PORT = 3999;  // Use a different port for testing

  beforeAll(async () => {
    transport = new HttpServerTransport(TEST_PORT);
    await transport.start();
  });

  afterAll(async () => {
    await transport.close();
  });

  test('health endpoint returns healthy status', async () => {
    const response = await axios.get(`http://localhost:${TEST_PORT}/health`);
    expect(response.status).toBe(200);
    expect(response.data).toEqual({ status: 'healthy' });
  });

  test('mcp endpoint responds to initialize request', async () => {
    // Set up message handler
    let receivedMessage: JSONRPCMessage | null = null;
    transport.onmessage = (message: any) => {
      receivedMessage = message as JSONRPCMessage;

      // Send response back through transport
      if ('method' in message && message.method === 'initialize') {
        transport.send({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            protocolVersion: '2025-03-26',
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: 'Test MCP Server',
              version: '1.0.0'
            }
          }
        });
      }
    };

    // Send initialize request
    const initializeRequest: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: '1',
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: {
          name: 'Test Client',
          version: '1.0.0'
        }
      }
    };

    // Post to the MCP endpoint
    const response = await axios.post(
      `http://localhost:${TEST_PORT}/v1/mcp`,
      initializeRequest,
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        }
      }
    );

    // Check if we received a session ID
    expect(response.headers['mcp-session-id']).toBeDefined();
    expect(response.status).toBe(202);

    // Check if our message handler was called with the correct message
    expect(receivedMessage).not.toBeNull();
    if (receivedMessage) {
      expect(receivedMessage.jsonrpc).toBe('2.0');
      expect('method' in receivedMessage && receivedMessage.method).toBe('initialize');
    }
  });
}); 