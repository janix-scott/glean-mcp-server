import uvicorn
from http_server import app

def main():
    """Run the MCP server"""
    uvicorn.run(
        "http_server:app",
        host="0.0.0.0",
        port=8080,
        reload=True,
        reload_dirs=["src/transport"],
        log_level="debug"
    )

if __name__ == "__main__":
    main() 