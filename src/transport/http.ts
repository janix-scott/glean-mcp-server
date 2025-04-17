import type { ServerTransport } from '@modelcontextprotocol/sdk/server/transport.js';
import type { Express, Request, Response } from 'express';
import express from 'express';
import type { Server as HttpServer } from 'http';
import { createServer } from 'http';
import type { Server as WebSocketServer, RawData } from 'ws';
import WebSocket from 'ws';
import type { EventEmitter } from 'events';
import { EventEmitter as NodeEventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import type { CorsOptions } from 'cors';
import cors from 'cors';
import { z } from 'zod';

// Session timeout in milliseconds (30 minutes)
const SESSION_TIMEOUT = 30 * 60 * 1000;

interface Session {
  id: string;
  createdAt: Date;
  lastActivity: Date;
  eventEmitter: EventEmitter;
  isInitialized: boolean;
}

// JSON-RPC Message Schemas
const MCPMessageSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.record(z.any()).optional(),
});

const MCPResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  result: z.record(z.any()).optional(),
  error: z.object({
    code: z.number(),
    message: z.string(),
    data: z.any().optional(),
  }).optional(),
});

/**
 * HTTP transport implementation for the MCP protocol.
 * Supports HTTP long-polling, Server-Sent Events (SSE), and WebSocket connections.
 */
export class HttpServerTransport implements ServerTransport {
  private app: Express;
  private server: HttpServer;
  private wss: WebSocketServer;
  private sessions: Map<string, Session>;
  private messageHandler?: (message: string) => void;
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(private port: number = 3000) {
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });
    this.sessions = new Map();

    // Set up middleware and routes
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();

    // Start session cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanupSessions(), SESSION_TIMEOUT);
  }

  private setupMiddleware() {
    this.app.use(express.json());
    this.app.use(cors({
      origin: '*', // Configure appropriately for production
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Mcp-Session-Id', 'Accept'],
      exposedHeaders: ['Mcp-Session-Id'],
    }));
  }

  private setupRoutes() {
    // Main MCP endpoint
    this.app.post('/v1/mcp', async (req: Request, res: Response) => {
      try {
        const sessionId = req.headers['mcp-session-id'] as string;
        const accept = req.headers.accept;

        // Validate JSON-RPC message
        const parseResult = MCPMessageSchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            jsonrpc: '2.0',
            error: {
              code: -32700,
              message: 'Parse error',
              data: parseResult.error.errors,
            },
          });
        }

        const message = parseResult.data;

        // Handle initialization requests
        if (message.method === 'initialize') {
          if (sessionId) {
            return res.status(400).json({
              jsonrpc: '2.0',
              error: {
                code: -32002,
                message: 'Session already exists',
              },
            });
          }

          const newSessionId = this.createSession();
          res.setHeader('Mcp-Session-Id', newSessionId);
          await this.handleMessage(JSON.stringify(message), res);
          return;
        }

        // Validate session for non-initialize requests
        if (!this.validateSession(sessionId)) {
          return res.status(404).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Invalid or expired session',
            },
          });
        }

        // Handle SSE requests
        if (accept?.includes('text/event-stream')) {
          this.handleSSE(req, res, sessionId);
          return;
        }

        // Handle regular JSON-RPC requests
        await this.handleMessage(JSON.stringify(message), res);
        this.updateSessionActivity(sessionId);

      } catch (error) {
        console.error('Error handling request:', error);
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal error',
          },
        });
      }
    });

    // Health check endpoint
    this.app.get('/health', (_: Request, res: Response) => {
      res.json({ status: 'healthy' });
    });
  }

  private setupWebSocket() {
    this.wss.on('connection', (ws: WebSocket) => {
      const sessionId = this.createSession();

      ws.on('message', async (data: WebSocket.RawData) => {
        try {
          const message = JSON.parse(data.toString());
          const parseResult = MCPMessageSchema.safeParse(message);
          
          if (!parseResult.success) {
            ws.send(JSON.stringify({
              jsonrpc: '2.0',
              error: {
                code: -32700,
                message: 'Parse error',
                data: parseResult.error.errors,
              },
            }));
            return;
          }

          if (this.messageHandler) {
            this.messageHandler(data.toString());
          }
          this.updateSessionActivity(sessionId);
        } catch (error) {
          console.error('Error handling WebSocket message:', error);
          ws.send(JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal error',
            },
          }));
        }
      });

      ws.on('close', () => {
        this.sessions.delete(sessionId);
      });
    });
  }

  private createSession(): string {
    const sessionId = uuidv4();
    const now = new Date();
    this.sessions.set(sessionId, {
      id: sessionId,
      createdAt: now,
      lastActivity: now,
      eventEmitter: new NodeEventEmitter(),
      isInitialized: false,
    });
    return sessionId;
  }

  private validateSession(sessionId?: string): boolean {
    if (!sessionId) return false;
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const now = new Date();
    const timeSinceLastActivity = now.getTime() - session.lastActivity.getTime();
    return timeSinceLastActivity < SESSION_TIMEOUT;
  }

  private updateSessionActivity(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
    }
  }

  private cleanupSessions() {
    const now = new Date();
    for (const [sessionId, session] of this.sessions.entries()) {
      const timeSinceLastActivity = now.getTime() - session.lastActivity.getTime();
      if (timeSinceLastActivity >= SESSION_TIMEOUT) {
        this.sessions.delete(sessionId);
      }
    }
  }

  private handleSSE(req: Request, res: Response, sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const messageListener = (message: string) => {
      res.write(`data: ${message}\n\n`);
    };

    session.eventEmitter.on('message', messageListener);

    req.on('close', () => {
      session.eventEmitter.off('message', messageListener);
    });
  }

  private async handleMessage(message: string, res: Response) {
    if (this.messageHandler) {
      try {
        this.messageHandler(message);
        // Note: The actual response will be sent via onMessage callback
        // For now, we'll send a success response
        res.json({
          jsonrpc: '2.0',
          result: {},
        });
      } catch (error) {
        console.error('Error handling message:', error);
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal error',
          },
        });
      }
    }
  }

  async connect(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`HTTP MCP server listening on port ${this.port}`);
        resolve();
      });
    });
  }

  async disconnect(): Promise<void> {
    clearInterval(this.cleanupInterval);
    return new Promise((resolve, reject) => {
      this.wss.close();
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  onMessage(handler: (message: string) => void): void {
    this.messageHandler = handler;
  }

  send(message: string): void {
    // Broadcast to all active sessions
    for (const [_, session] of this.sessions) {
      session.eventEmitter.emit('message', message);
    }
  }
} 