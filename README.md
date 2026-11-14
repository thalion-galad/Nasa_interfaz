# ASTRA Health

Plataforma de monitorización y análisis de salud
para astronautas durante misiones espaciales.

## Arquitectura

```
SQLite (database/astra_health.db)
        │  ▲
        ▼  │  FastAPI + SQLAlchemy
   Backend /api
        │
        ├── REST  /api/...      → carga inicial e historial
        └── WS    /telemetry    → actualizaciones de telemetría
                │
                ▼
   Frontend (panel, alertas, historial y perfil)
```

La fuente de verdad es la base de datos. El frontend **no genera
valores**: la carga inicial llega por REST y las actualizaciones por
WebSocket. El WebSocket solo difunde la última fila de `measurements`
que exista en SQLite.

## Tecnologías

- HTML5 · CSS3 · JavaScript
- Python · FastAPI · SQLAlchemy
- SQLite
- Pandas · NumPy (análisis)

## Estructura

- `frontend/`: interfaz de usuario.
- `backend/`: API, WebSocket y persistencia.
- `database/`: base SQLite (se crea automáticamente).

## Ejecutar el backend

Desde la carpeta `backend/`:

```bash
python -m venv .venv
.venv\Scripts\activate        # Windows
source .venv/bin/activate     # Linux / macOS
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

La API queda en `http://localhost:8000` y la documentación en
`http://localhost:8000/docs`.

Al arrancar se crea `database/astra_health.db` y se registra el
tripulante inicial `ASTRA-001` si aún no existe. La migración añade
automáticamente las columnas nuevas a una base ya creada.

> La interfaz muestra `ESPERANDO TELEMETRÍA` hasta que se persiste la
> primera medición. Envíala con el endpoint de ingesta o con el script
> de prueba de la sección siguiente.

## Ejecutar el frontend

Abrir `frontend/index.html` o servirlo con cualquier servidor estático.
El backend debe estar escuchando en el puerto `8000` (ver
`frontend/js/api.js`).

## Endpoints

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/api/astronauts/` | Tripulantes |
| GET | `/api/astronauts/{id}` | Perfil |
| POST | `/api/astronauts/` | Alta de tripulante |
| GET | `/api/measurements/` | Historial (`astronaut_id`, `limit`) |
| GET | `/api/measurements/latest` | Última medición por tripulante |
| POST | `/api/measurements/` | **Ingesta de telemetría** |
| GET | `/api/alerts/` | Alertas registradas |
| POST | `/api/alerts/` | Registro de alerta |
| PATCH | `/api/alerts/{id}/ack` | Reconocer alerta |
| GET | `/api/logs/` | Bitácora |
| POST | `/api/logs/` | Registrar en bitácora |
| GET | `/api/insights/` | Análisis asistido |
| POST | `/api/insights/` | Publicar insight |
| WS | `/telemetry` | Última medición en vivo |

## Flujo de datos

1. El dispositivo o motor de ingesta hace
   `POST /api/measurements/` con una medición completa.
2. SQLAlchemy la guarda en `database/astra_health.db`.
3. El WebSocket detecta la nueva fila (por `id`) y la emite.
4. El frontend actualiza indicadores, escáner corporal y alertas.

Contrato de telemetría (WebSocket):

```json
{
  "type": "telemetry",
  "astronaut_id": 1,
  "measurement_id": 12,
  "timestamp": "2026-11-13T18:04:00Z",
  "source": "SIM-BIO-AST01",
  "scenario": "normal",
  "eva_load": 0,
  "hr": 78, "sys": 121, "dia": 79, "spo2": 97.5,
  "temp": 36.8, "rr": 15, "co2": 2.1, "hyd": 86,
  "dose": 24, "fat": 20, "cm": 84
}
```

## Prueba de integración

Con el backend en ejecución:

```bash
python backend/tools/post_measurement.py --hr 132 --sys 148 --dia 92
```

Es una herramienta de prueba (una sola medición), no forma parte de la
aplicación.

## Estado del proyecto

En desarrollo. Los datos mostrados provienen de la base de datos; la
herramienta es educativa y no sirve para diagnóstico clínico.
