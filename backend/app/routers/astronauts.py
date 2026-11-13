from typing import List
from fastapi import APIRouter, HTTPException, status
from app.schemas import Astronaut, AstronautCreate
from app.store import db

router = APIRouter(prefix="/api/astronauts", tags=["Astronauts"])


@router.get("/", response_model=List[Astronaut])
def get_astronauts():
    return db.list_astronauts()


@router.get("/{astronaut_id}", response_model=Astronaut)
def get_astronaut(astronaut_id: int):
    astronaut = db.get_astronaut(astronaut_id)
    if not astronaut:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Astronauta con ID {astronaut_id} no encontrado",
        )
    return astronaut


@router.post("/", response_model=Astronaut, status_code=status.HTTP_201_CREATED)
def create_astronaut(payload: AstronautCreate):
    return db.create_astronaut(payload)