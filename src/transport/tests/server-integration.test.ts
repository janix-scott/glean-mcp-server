import { HttpServerTransport } from '../http.js';
import axios from 'axios';

// Import Server directly without specifying the exact path
const { Server } = require('@modelcontextprotocol/sdk');

// Mock the Glean search and chat tools
jest.mock('../../tools/search.js', () => ({
  SearchSchema: {
    parse: jest.fn((args) => args),
  },
  search: jest.fn(async () => ({ results: [{ title: 'Mock search result', snippet: 'This is a mocked result' }] })),
  formatResponse: jest.fn(() => 'Formatted search results for: mock query'),
}));

jest.mock('../../tools/chat.js', () => ({
  ChatSchema: {
    parse: jest.fn((args) => args),
  },
  chat: jest.fn(async () => 'This is a mock chat response'),
  formatResponse: jest.fn(() => 'Formatted chat response'),
}));

// Define the request type for better type checking
interface JSONRPCRequest {
  method: string;
  params?: {
    name?: string;
    arguments?: any;
    [key: string]: any;
  };
  [key: string]: any;
}

describe('HTTP Transport with MCP Server Integration', () => {
  let transport: HttpServerTransport;
  let server: typeof Server;
  const TEST_PORT = 4000;

  beforeAll(async () => {
    // Create the transport
    transport = new HttpServerTransport(TEST_PORT);

    // Create a simple MCP server
    server = new Server(
      {
        name: 'Glean Tools MCP Test',
        version: '1.0.0',
      },
      { capabilities: { tools: {} } }
    );

    // Set up the tools/list handler
    server.setRequestHandler({ method: 'tools/list' }, async () => {
      return {
        tools: [
          {
            name: 'glean_search',
            description: 'Search Glean Enterprise Knowledge',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'The search query',
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'glean_chat',
            description: "Chat with Glean Assistant using Glean's RAG",
            inputSchema: {
              type: 'object',
              properties: {
                prompt: {
                  type: 'string',
                  description: 'The chat prompt',
                },
                metadata: {
                  type: 'object',
                  description: 'Optional metadata',
                },
              },
              required: ['prompt'],
            },
          },
        ],
      };
    });

    // Set up the tools/call handler
    server.setRequestHandler({ method: 'tools/call' }, async (request: JSONRPCRequest) => {
      const toolName = request.params?.name;
      const args = request.params?.arguments;

      if (toolName === 'glean_search') {
        return {
          content: [
            {
              type: 'text',
              text: `Formatted search results for: ${args?.query}`,
            },
          ],
          isError: false,
        };
      } else if (toolName === 'glean_chat') {
        return {
          content: [
            {
              type: 'text',
              text: `Mock chat response to: ${args?.prompt}`,
            },
          ],
          isError: false,
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${toolName}`,
            },
          ],
          isError: true,
        };
      }
    });

    // Connect the server to the transport
    await server.connect(transport);
  });

  afterAll(async () => {
    await server.shutdown();
    await transport.close();
  });

  test('health endpoint returns healthy status', async () => {
    const response = await axios.get(`http://localhost:${TEST_PORT}/health`);
    expect(response.status).toBe(200);
    expect(response.data).toEqual({ status: 'healthy' });
  });

  test('full MCP flow with initialize and tools/list', async () => {
    // Step 1: Initialize a session
    const initResponse = await axios.post(
      `http://localhost:${TEST_PORT}/v1/mcp`,
      {
        jsonrpc: '2.0',
        id: '1',
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: {
            name: 'Test Client',
            version: '1.0.0',
          },
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      }
    );

    // Verify we got a session ID
    const sessionId = initResponse.headers['mcp-session-id'];
    expect(sessionId).toBeDefined();
    expect(initResponse.status).toBe(202);

    // Step 2: Send initialized notification
    await axios.post(
      `http://localhost:${TEST_PORT}/v1/mcp`,
      {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Mcp-Session-Id': sessionId,
        },
      }
    );

    // Step 3: Set up SSE connection to receive responses
    // (In a real test we would listen to SSE, but for simplicity
    // we'll just make subsequent requests and check responses)

    // Step 4: Request tools list
    const toolsResponse = await axios.post(
      `http://localhost:${TEST_PORT}/v1/mcp`,
      {
        jsonrpc: '2.0',
        id: '2',
        method: 'tools/list',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Mcp-Session-Id': sessionId,
        },
      }
    );

    expect(toolsResponse.status).toBe(202);

    // Step 5: Call the glean_search tool
    const searchResponse = await axios.post(
      `http://localhost:${TEST_PORT}/v1/mcp`,
      {
        jsonrpc: '2.0',
        id: '3',
        method: 'tools/call',
        params: {
          name: 'glean_search',
          arguments: {
            query: 'test query',
          },
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Mcp-Session-Id': sessionId,
        },
      }
    );

    expect(searchResponse.status).toBe(202);
  });
}); 