import asyncio

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

from app.database import engine
from app import models

# Crear las tablas antes de importar los routers.
# Los routers importan store.py, que instancia DatabaseStore.
models.Base.metadata.create_all(bind=engine)


def ensure_measurement_columns() -> None:
    """
    Añade a una base SQLite ya existente las columnas nuevas de `measurements`.
    `create_all` no modifica tablas creadas con anterioridad.
    """

    if engine.dialect.name != "sqlite":
        return

    columnas_nuevas = {
        "fatigue_index": "INTEGER NOT NULL DEFAULT 18",
        "countermeasures_percent": "INTEGER NOT NULL DEFAULT 86",
    }

    with engine.begin() as connection:
        existentes = {
            row[1]
            for row in connection.exec_driver_sql(
                "PRAGMA table_info(measurements)"
            )
        }

        for columna, definicion in columnas_nuevas.items():
            if columna not in existentes:
                connection.exec_driver_sql(
                    f"ALTER TABLE measurements "
                    f"ADD COLUMN {columna} {definicion}"
                )


ensure_measurement_columns()

from app.routers import (
    alerts,
    astronauts,
    measurements,
    logs,
    analysis_hook,
)
from app.store import db
from app.telemetry import measurement_payload


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


# WebSocket de telemetría.
# La fuente es la tabla `measurements`: no genera datos, solo difunde
# la última medición persistida (por ejemplo, la que escribe el
# dispositivo o el motor de ingesta).
@app.websocket("/telemetry")
async def websocket_telemetry(websocket: WebSocket):
    await websocket.accept()

    last_id = None

    try:
        while True:
            measurement = await run_in_threadpool(
                db.get_latest_measurement
            )

            if measurement is None:
                if last_id != "empty":
                    await websocket.send_json({"type": "no_data"})
                    last_id = "empty"
            elif measurement.id != last_id:
                last_id = measurement.id
                await websocket.send_json(
                    measurement_payload(measurement)
                )

            await asyncio.sleep(1)

    except WebSocketDisconnect:
        print("Frontend desconectado del flujo de telemetría")


@app.get("/", tags=["System"])
def root():
    latest = db.get_latest_measurement()

    return {
        "service": "ASTRA Health Backend",
        "status": "online",
        "storage_mode": "sqlite",
        "last_measurement_id": latest.id if latest else None,
        "docs": "/docs",
    }
