
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="ASTRA Health API",
    description="API de monitorización de salud para misiones espaciales",
    version="1.0.0"
)

# Permitir temporalmente la comunicación con nuestro frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restringiremos esto antes del despliegue
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def inicio():
    return {
        "system": "ASTRA Health",
        "status": "online",
        "message": "API funcionando correctamente"
    }


@app.get("/api/astronauts/{astronaut_id}")
def obtener_astronauta(astronaut_id: str):
    return {
        "astronaut_id": astronaut_id,
        "name": "Astronauta de simulación",
        "mission_day": 42,
        "source": "simulated"
    }
