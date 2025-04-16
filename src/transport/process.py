import asyncio
import subprocess
from pathlib import Path
import sys
from typing import Optional

class ProcessTransport:
    """Handles communication with a subprocess via stdin/stdout"""
    
    def __init__(self):
        self._process: Optional[subprocess.Popen] = None
        self._reader: Optional[asyncio.StreamReader] = None
        self._writer: Optional[asyncio.StreamWriter] = None
        
    async def initialize(self):
        """Initialize the process and set up communication channels"""
        # Get the path to the MCP server
        server_path = Path(__file__).parent.parent.parent / "build" / "index.js"
        
        # Start the process
        self._process = subprocess.Popen(
            [sys.executable, str(server_path)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=0
        )
        
        # Create stream reader/writer
        loop = asyncio.get_event_loop()
        transport, protocol = await loop.connect_write_pipe(
            asyncio.Protocol,
            self._process.stdin
        )
        self._writer = asyncio.StreamWriter(transport, protocol, None, loop)
        
        self._reader = asyncio.StreamReader()
        protocol = asyncio.StreamReaderProtocol(self._reader)
        await loop.connect_read_pipe(
            lambda: protocol,
            self._process.stdout
        )
        
    async def write(self, data: str):
        """Write data to the process stdin"""
        if not self._writer:
            await self.initialize()
        self._writer.write(data.encode())
        await self._writer.drain()
        
    async def readline(self) -> str:
        """Read a line from the process stdout"""
        if not self._reader:
            await self.initialize()
        line = await self._reader.readline()
        return line.decode().strip()
        
    def close(self):
        """Close the transport and terminate the process"""
        if self._writer:
            self._writer.close()
        if self._process:
            self._process.terminate()
            self._process = None 