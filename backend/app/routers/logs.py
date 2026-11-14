
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query, status

from app.schemas import Log, LogCreate
from app.store import db


router = APIRouter(
    prefix="/api/logs",
    tags=["Logs (Bitácora)"],
)


@router.get("/", response_model=List[Log])
def get_logs(
    astronaut_id: Optional[int] = Query(default=None, gt=0),
    limit: int = Query(default=50, ge=1, le=500),
):

    if astronaut_id is not None and not db.get_astronaut(astronaut_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No existe el astronauta con ID {astronaut_id}",
        )

    return db.list_logs(
        astronaut_id=astronaut_id,
        limit=limit,
    )


@router.post(
    "/",
    response_model=Log,
    status_code=status.HTTP_201_CREATED,
)
def create_log(payload: LogCreate):

    if not db.get_astronaut(payload.astronaut_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No existe el astronauta con ID {payload.astronaut_id}",
        )

    return db.create_log(payload)
