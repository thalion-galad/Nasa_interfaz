
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query, status

from app.schemas import Measurement, MeasurementCreate
from app.store import db


router = APIRouter(
    prefix="/api/measurements",
    tags=["Measurements"],
)


@router.get("/", response_model=List[Measurement])
def get_measurements(
    astronaut_id: Optional[int] = Query(default=None, gt=0),
    limit: int = Query(default=50, ge=1, le=500),
):
    return db.list_measurements(
        astronaut_id=astronaut_id,
        limit=limit,
    )


@router.get("/latest", response_model=List[Measurement])
def get_latest_measurements():
    return db.get_latest_measurements()


@router.post(
    "/",
    response_model=Measurement,
    status_code=status.HTTP_201_CREATED,
)
def create_measurement(payload: MeasurementCreate):

    if not db.get_astronaut(payload.astronaut_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No existe el astronauta con ID {payload.astronaut_id}",
        )

    return db.create_measurement(payload)
