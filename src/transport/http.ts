import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

import { Server } from 'http';
import express from 'express';
import * as WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type { Express, Request, Response } from 'express';
import { createServer } from 'http';
import type { EventEmitter } from 'events';
import { EventEmitter as NodeEventEmitter } from 'events';
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
  userContext?: string; // Add user context (email) for Glean "act-as" parameter
}

// JSON-RPC Message Schemas
const JSONRPCMessageSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string().optional(),
  params: z.record(z.any()).optional(),
  result: z.any().optional(),
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
export class HttpServerTransport implements Transport {
  private app: Express;
  private server: Server;
  private wss: WebSocket.Server;
  private sessions: Map<string, Session>;
  private cleanupInterval: ReturnType<typeof setInterval>;
  
  public onmessage?: (message: JSONRPCMessage) => void;
  public onclose?: () => void;
  public onerror?: (error: Error) => void;
  public sessionId?: string;

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
      methods: ['GET', 'POST', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Mcp-Session-Id', 'Accept', 'X-Glean-Act-As'],
      exposedHeaders: ['Mcp-Session-Id'],
    }));
  }

  private setupRoutes() {
    // Main MCP endpoint
    this.app.post('/v1/mcp', async (req: Request, res: Response) => {
      try {
        const sessionId = req.headers['mcp-session-id'] as string;
        const actAsUser = req.headers['x-glean-act-as'] as string;
        const accept = req.headers.accept;

        // Validate JSON-RPC message
        const parseResult = JSONRPCMessageSchema.safeParse(req.body);
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

          const newSessionId = this.createSession(actAsUser);
          res.setHeader('Mcp-Session-Id', newSessionId);
          
          // Process the message
          if (this.onmessage) {
            this.onmessage(message as JSONRPCMessage);
          }
          
          // For now, just acknowledge receipt
          // The real response will be sent via the send method
          return res.status(202).end();
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

        // Handle SSE requests for streaming
        if (req.method === 'GET' && accept?.includes('text/event-stream')) {
          this.handleSSE(req, res, sessionId);
          return;
        }

        // Handle regular JSON-RPC requests
        if (this.onmessage) {
          this.onmessage(message as JSONRPCMessage);
        }
        
        this.updateSessionActivity(sessionId);
        return res.status(202).end();

      } catch (error) {
        console.error('Error handling request:', error);
        if (this.onerror) {
          this.onerror(error instanceof Error ? error : new Error(String(error)));
        }
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal error',
          },
        });
      }
    });

    // SSE endpoint for long-polling
    this.app.get('/v1/mcp', (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string;
      const actAsUser = req.headers['x-glean-act-as'] as string;
      const accept = req.headers.accept;

      if (!this.validateSession(sessionId)) {
        return res.status(404).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Invalid or expired session',
          },
        });
      }

      // Update user context if provided
      if (actAsUser) {
        const session = this.sessions.get(sessionId);
        if (session && (!session.userContext || session.userContext !== actAsUser)) {
          session.userContext = actAsUser;
          console.log(`Updated user context for session ${sessionId} to ${actAsUser}`);
        }
      }

      if (accept?.includes('text/event-stream')) {
        this.handleSSE(req, res, sessionId);
      } else {
        res.status(405).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Method not allowed',
          },
        });
      }
    });

    // Session management - explicit termination
    this.app.delete('/v1/mcp', (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string;
      
      if (sessionId && this.sessions.has(sessionId)) {
        this.sessions.delete(sessionId);
        return res.status(204).end();
      }
      
      res.status(404).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Session not found',
        },
      });
    });

    // Health check endpoint
    this.app.get('/health', (_: Request, res: Response) => {
      res.json({ status: 'healthy' });
    });
  }

  private setupWebSocket() {
    this.wss.on('connection', (ws: WebSocket, req: any) => {
      const actAsUser = req.headers['x-glean-act-as'] as string;
      const sessionId = this.createSession(actAsUser);

      // Send the session ID in a message
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/session',
        params: {
          sessionId
        }
      }));

      ws.on('message', async (data: WebSocket.RawData) => {
        try {
          const message = JSON.parse(data.toString());
          const parseResult = JSONRPCMessageSchema.safeParse(message);
          
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

          if (this.onmessage) {
            this.onmessage(message as JSONRPCMessage);
          }
          this.updateSessionActivity(sessionId);
        } catch (error) {
          console.error('Error handling WebSocket message:', error);
          if (this.onerror) {
            this.onerror(error instanceof Error ? error : new Error(String(error)));
          }
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

  private createSession(userContext?: string): string {
    const sessionId = uuidv4();
    const now = new Date();
    this.sessions.set(sessionId, {
      id: sessionId,
      createdAt: now,
      lastActivity: now,
      eventEmitter: new NodeEventEmitter(),
      isInitialized: false,
      userContext,
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

  // Transport interface implementation
  async start(): Promise<void> {
    return this.connect();
  }

  async connect(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`HTTP MCP server listening on port ${this.port}`);
        resolve();
      });
    });
  }

  async send(message: JSONRPCMessage): Promise<void> {
    const messageStr = JSON.stringify(message);
    
    // Broadcast to all active sessions
    for (const [_, session] of this.sessions) {
      session.eventEmitter.emit('message', messageStr);
    }
  }

  async close(): Promise<void> {
    clearInterval(this.cleanupInterval);
    
    return new Promise((resolve, reject) => {
      this.wss.close();
      this.server.close((err) => {
        if (err) {
          if (this.onerror) {
            this.onerror(err);
          }
          reject(err);
        } else {
          if (this.onclose) {
            this.onclose();
          }
          resolve();
        }
      });
    });
  }
} 