from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import alerts, astronauts, measurements

app = FastAPI(
    title="ASTRA Health API",
    description="API REST para monitorización biométrica de astronautas.",
    version="0.1.0",
)

# Permitir peticiones desde el frontend (Live Server, file:// o dominio local)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(astronauts.router)
app.include_router(measurements.router)
app.include_router(alerts.router)


@app.get("/", tags=["System"])
def root():
    return {
        "service": "ASTRA Health Backend",
        "status": "online",
        "storage_mode": "in-memory-simulated",
        "docs": "/docs",
    }