from fastapi import FastAPI, WebSocket, Request, Response, Header, HTTPException, Depends
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List, AsyncGenerator, Literal, Union
import uuid
import json
import asyncio
from enum import Enum
import subprocess
import sys
from pathlib import Path
import logging
from auth import GleanAuth, AuthType, AuthError
from process import ProcessTransport

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

class AuthType(str, Enum):
    OAUTH = "OAUTH"
    CLIENT_TOKEN = "CLIENT_TOKEN"

class AuthCapability(BaseModel):
    type: AuthType
    token: Optional[str] = None
    user_context: Optional[Dict] = None

class Capabilities(BaseModel):
    auth: Optional[AuthCapability] = None
    transports: List[str] = Field(default_factory=lambda: ["http"])

class MCPMessage(BaseModel):
    jsonrpc: str = "2.0"
    id: Optional[Union[int, str]] = None
    method: str
    params: Optional[Dict] = None
    
    @property
    def is_initialize(self) -> bool:
        return self.method == "initialize"
    
    @property
    def auth_capability(self) -> Optional[AuthCapability]:
        if not self.is_initialize or not self.params or "capabilities" not in self.params:
            return None
        caps = Capabilities(**self.params.get("capabilities", {}))
        return caps.auth

class MCPResponse(BaseModel):
    jsonrpc: str = "2.0"
    id: str
    result: Optional[Dict[str, Any]] = None
    error: Optional[Dict[str, Any]] = None

class Session:
    def __init__(
        self,
        id: str,
        auth: GleanAuth,
        auth_type: Optional[AuthType] = None,
        oauth_token: Optional[str] = None,
        user_context: Optional[Dict] = None
    ):
        self.id = id
        self.auth = auth
        self.auth_type = auth_type
        self.oauth_token = oauth_token
        self.user_context = user_context
        self._transport = None
        logger.debug(f"Created new session {id} with auth_type={auth_type}")

    async def initialize(self):
        """Initialize the session's transport"""
        if not self._transport:
            logger.debug(f"Initializing transport for session {self.id}")
            self._transport = ProcessTransport()
            await self._transport.initialize()
            logger.debug(f"Transport initialized for session {self.id}")

    async def send_message(self, message: str):
        """Send a message through the transport"""
        if not self._transport:
            await self.initialize()
        logger.debug(f"Session {self.id} sending message: {message}")
        await self._transport.write(message + "\n")

    async def get_message(self) -> str:
        """Get a message from the transport"""
        if not self._transport:
            await self.initialize()
        response = await self._transport.readline()
        logger.debug(f"Session {self.id} received message: {response}")
        return response

    async def close(self):
        """Close the session and cleanup resources"""
        logger.debug(f"Closing session {self.id}")
        if self._transport:
            self._transport.close()
            self._transport = None

class SessionManager:
    def __init__(self, auth: GleanAuth):
        self._sessions: Dict[str, Session] = {}
        self.auth = auth
        logger.debug("SessionManager initialized")

    async def create_session(self, auth_capability: Optional[AuthCapability] = None) -> Session:
        """Create a new session with optional auth capability"""
        session_id = str(uuid.uuid4())
        logger.debug(f"Creating new session {session_id} with auth_capability={auth_capability}")
        
        # Validate auth if provided
        user_context = None
        if auth_capability:
            try:
                user_context = await self.auth.validate_auth(
                    auth_capability.type,
                    auth_capability.token
                )
            except AuthError as e:
                logger.error(f"Auth validation failed for session {session_id}: {str(e)}")
                raise ValueError(str(e))
        
        session = Session(
            id=session_id,
            auth=self.auth,
            auth_type=auth_capability.type if auth_capability else None,
            oauth_token=auth_capability.token if auth_capability else None,
            user_context=user_context
        )
        self._sessions[session_id] = session
        return session

    def get_session(self, session_id: str) -> Optional[Session]:
        """Get an existing session by ID"""
        session = self._sessions.get(session_id)
        logger.debug(f"Retrieved session {session_id}: {'found' if session else 'not found'}")
        return session

    async def cleanup_session(self, session_id: str):
        """Cleanup and remove a session"""
        logger.debug(f"Cleaning up session {session_id}")
        session = self._sessions.pop(session_id, None)
        if session:
            await session.close()

app = FastAPI(title="Glean MCP Server")
auth = GleanAuth()
session_manager = SessionManager(auth)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/v1/mcp")
async def mcp_endpoint(
    request: Request,
    accept: str = Header(...),
    mcp_session_id: Optional[str] = Header(None, alias="Mcp-Session-Id")
) -> Response:
    """Main MCP endpoint handling both regular JSON-RPC messages and SSE streams"""
    logger.debug(f"Received MCP request: session_id={mcp_session_id}, accept={accept}, path={request.url.path}")
    
    # Handle POST requests for sending messages
    if "application/json" in accept:
        try:
            body = await request.body()
            logger.debug(f"Request body: {body.decode()}")
            message_data = await request.json()
            mcp_message = MCPMessage(**message_data)
            logger.debug(f"Parsed MCP message: {mcp_message.dict()}")
        except Exception as e:
            logger.error(f"Failed to parse request: {str(e)}")
            return JSONResponse(
                status_code=400,
                content={
                    "jsonrpc": "2.0",
                    "error": {
                        "code": -32700,
                        "message": "Parse error"
                    }
                }
            )
        
        # Handle initialize method specially
        if mcp_message.is_initialize and not mcp_session_id:
            try:
                logger.debug("Processing initialize request")
                session = await session_manager.create_session(mcp_message.auth_capability)
                response = await process_mcp_message(session, mcp_message)
                return JSONResponse(
                    content=response,
                    headers={"Mcp-Session-Id": session.id}
                )
            except ValueError as e:
                logger.error(f"Initialize request failed: {str(e)}")
                return JSONResponse(
                    status_code=401,
                    content={
                        "jsonrpc": "2.0",
                        "error": {
                            "code": -32001,
                            "message": str(e)
                        }
                    }
                )
        
        # Validate existing session
        session = session_manager.get_session(mcp_session_id) if mcp_session_id else None
        if not session:
            logger.error(f"Invalid session ID: {mcp_session_id}")
            return JSONResponse(
                status_code=404,
                content={
                    "jsonrpc": "2.0",
                    "error": {
                        "code": -32000,
                        "message": "Invalid or expired session"
                    }
                }
            )
        
        # Process regular MCP message
        try:
            response = await process_mcp_message(session, mcp_message)
            return JSONResponse(content=response)
        except ValueError as e:
            logger.error(f"Failed to process message: {str(e)}")
            return JSONResponse(
                status_code=401,
                content={
                    "jsonrpc": "2.0",
                    "error": {
                        "code": -32001,
                        "message": str(e)
                    }
                }
            )
    
    # Handle SSE streaming
    elif "text/event-stream" in accept:
        if not mcp_session_id:
            logger.error("SSE request missing session ID")
            raise HTTPException(status_code=400, detail="Session ID required for SSE")
            
        session = session_manager.get_session(mcp_session_id)
        if not session:
            logger.error(f"Invalid session ID for SSE: {mcp_session_id}")
            raise HTTPException(status_code=404, detail="Session not found")
            
        return StreamingResponse(
            stream_mcp_events(session),
            media_type="text/event-stream"
        )
    
    logger.error(f"Unsupported Accept header: {accept}")
    raise HTTPException(status_code=406, detail="Not Acceptable")

async def process_mcp_message(session: Session, message: MCPMessage) -> Dict:
    """Process an MCP message through the transport and return response"""
    logger.debug(f"Processing message for session {session.id}: {message.dict()}")
    
    # Add auth headers to the message if needed
    if message.params and not message.is_initialize:
        message.params["_meta"] = message.params.get("_meta", {})
        message.params["_meta"]["auth"] = {
            "type": session.auth_type.value.lower() if session.auth_type else None,
            "token": session.oauth_token,
            "user_context": session.user_context
        }
    
    # Send message to transport
    await session.send_message(json.dumps(message.dict()))
    response = await session.get_message()
    return json.loads(response)

async def stream_mcp_events(session: Session) -> AsyncGenerator[str, None]:
    """Stream MCP events for a session"""
    logger.debug(f"Starting event stream for session {session.id}")
    while True:
        try:
            message = await session.get_message()
            yield f"data: {message}\n\n"
        except Exception as e:
            logger.error(f"Event stream error for session {session.id}: {str(e)}")
            break

@app.websocket("/v1/mcp/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for bi-directional communication"""
    await websocket.accept()
    logger.debug("WebSocket connection accepted")
    
    session = await session_manager.create_session()
    
    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = MCPMessage.parse_raw(data)
                response = await process_mcp_message(session, message)
                await websocket.send_text(json.dumps(response))
            except Exception as e:
                logger.error(f"WebSocket error: {str(e)}")
                await websocket.send_text(json.dumps({
                    "jsonrpc": "2.0",
                    "error": {
                        "code": -32700,
                        "message": str(e)
                    }
                }))
    except Exception as e:
        logger.error(f"WebSocket connection error: {str(e)}")
    finally:
        await session_manager.cleanup_session(session.id)
        await websocket.close()

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    logger.debug("Health check requested")
    return {"status": "healthy"}

# Remove the if __name__ == "__main__" block since we now use main.py 