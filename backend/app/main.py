import asyncio

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine
from app import models

# Crear las tablas antes de importar los routers.
# Los routers importan store.py, que instancia DatabaseStore.
models.Base.metadata.create_all(bind=engine)

from app.routers import (
    alerts,
    astronauts,
    measurements,
    logs,
    analysis_hook,
)


app = FastAPI(
    title="ASTRA Health API",
    description="API REST para monitorización biométrica de astronautas.",
    version="0.1.0",
)


# Registrar routers
app.include_router(astronauts.router)
app.include_router(measurements.router)
app.include_router(alerts.router)
app.include_router(logs.router)
app.include_router(analysis_hook.router)


# Configuración CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# WebSocket de telemetría simulada
@app.websocket("/telemetry")
async def websocket_telemetry(websocket: WebSocket):
    await websocket.accept()

    try:
        while True:
            telemetry_data = {
                "hr": 72,
                "bp_sys": 120,
                "bp_dia": 80,
                "spo2": 98,
            }

            await websocket.send_json(telemetry_data)
            await asyncio.sleep(2)

    except WebSocketDisconnect:
        print("Frontend desconectado del flujo de telemetría")


@app.get("/", tags=["System"])
def root():
    return {
        "service": "ASTRA Health Backend",
        "status": "online",
        "storage_mode": "sqlite",
        "docs": "/docs",
    }
