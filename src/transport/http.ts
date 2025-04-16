import { ServerTransport } from '@modelcontextprotocol/sdk/server/transport.js';
import express from 'express';
import { Server as HttpServer } from 'http';
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

interface Session {
  id: string;
  createdAt: Date;
  eventEmitter: EventEmitter;
}

/**
 * HTTP transport implementation for the MCP protocol.
 * Supports both HTTP long-polling and WebSocket connections.
 */
export class HttpServerTransport implements ServerTransport {
  private app: express.Express;
  private server: HttpServer;
  private wss: WebSocket.Server;
  private sessions: Map<string, Session>;
  private messageHandler?: (message: string) => void;

  constructor(private port: number = 3000) {
    this.app = express();
    this.server = new HttpServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });
    this.sessions = new Map();

    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupRoutes() {
    this.app.use(express.json());

    // Main MCP endpoint
    this.app.post('/v1/mcp', (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string;
      const accept = req.headers.accept;

      // Handle initialization requests
      if (req.body.method === 'initialize' && !sessionId) {
        const newSessionId = this.createSession();
        res.setHeader('Mcp-Session-Id', newSessionId);
        this.handleMessage(JSON.stringify(req.body), res);
        return;
      }

      // Validate session
      if (!this.validateSession(sessionId)) {
        res.status(404).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Invalid or expired session'
          }
        });
        return;
      }

      // Handle SSE requests
      if (accept?.includes('text/event-stream')) {
        this.handleSSE(req, res, sessionId);
        return;
      }

      // Handle regular JSON-RPC requests
      this.handleMessage(JSON.stringify(req.body), res);
    });

    // Health check endpoint
    this.app.get('/health', (_, res) => {
      res.json({ status: 'healthy' });
    });
  }

  private setupWebSocket() {
    this.wss.on('connection', (ws) => {
      const sessionId = uuidv4();
      this.createSession();

      ws.on('message', (data) => {
        if (this.messageHandler) {
          this.messageHandler(data.toString());
        }
      });

      ws.on('close', () => {
        this.sessions.delete(sessionId);
      });
    });
  }

  private createSession(): string {
    const sessionId = uuidv4();
    this.sessions.set(sessionId, {
      id: sessionId,
      createdAt: new Date(),
      eventEmitter: new EventEmitter()
    });
    return sessionId;
  }

  private validateSession(sessionId?: string): boolean {
    return sessionId ? this.sessions.has(sessionId) : false;
  }

  private handleSSE(req: express.Request, res: express.Response, sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const messageListener = (message: string) => {
      res.write(`data: ${message}\n\n`);
    };

    session.eventEmitter.on('message', messageListener);

    req.on('close', () => {
      session.eventEmitter.off('message', messageListener);
    });
  }

  private handleMessage(message: string, res: express.Response) {
    if (this.messageHandler) {
      this.messageHandler(message);
      // Note: The actual response will be sent via onMessage callback
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
    return new Promise((resolve, reject) => {
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