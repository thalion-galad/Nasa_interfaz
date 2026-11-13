from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, status
from app.schemas import Alert, AlertCreate
from app.store import db

router = APIRouter(prefix="/api/alerts", tags=["Alerts"])


@router.get("/", response_model=List[Alert])
def get_alerts(
    astronaut_id: Optional[int] = Query(default=None),
    severity: Optional[str] = Query(default=None, pattern="^(info|warning|critical)$"),
    acknowledged: Optional[bool] = Query(default=None),
):
    return db.list_alerts(
        astronaut_id=astronaut_id,
        severity=severity,
        acknowledged=acknowledged,
    )


@router.post("/", response_model=Alert, status_code=status.HTTP_201_CREATED)
def create_alert(payload: AlertCreate):
    """Endpoint preparado para recibir alertas generadas por el Analysis Engine."""
    if not db.get_astronaut(payload.astronaut_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No existe el astronauta con ID {payload.astronaut_id}",
        )
    return db.create_alert(payload)


@router.patch("/{alert_id}/ack", response_model=Alert)
def acknowledge_alert(alert_id: int):
    alert = db.acknowledge_alert(alert_id)
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Alerta con ID {alert_id} no encontrada",
        )
    return alert