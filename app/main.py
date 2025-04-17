from fastapi import FastAPI
from prometheus_client import make_asgi_app

app = FastAPI()

# Create metrics endpoint for Prometheus
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.get("/")
async def root():
    return {"message": "Welcome to Glean MCP Server"} 