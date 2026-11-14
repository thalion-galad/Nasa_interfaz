
from typing import List

from fastapi import APIRouter, HTTPException, Query, status

from app.schemas import Insight, InsightCreate
from app.store import db


router = APIRouter(
    prefix="/api/insights",
    tags=["Analysis Engine (IA)"],
)


@router.post(
    "/",
    response_model=Insight,
    status_code=status.HTTP_201_CREATED,
)
def receive_insight(payload: InsightCreate):

    if not db.get_astronaut(payload.astronaut_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No existe el astronauta con ID {payload.astronaut_id}",
        )

    return db.create_insight(payload)


@router.get("/", response_model=List[Insight])
def list_insights(
    limit: int = Query(default=50, ge=1, le=500),
):
    return db.get_insights(limit=limit)
