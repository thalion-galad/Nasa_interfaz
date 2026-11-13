from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field

ScenarioType = Literal[
    "normal",
    "hypoxia",
    "tachy",
    "dehydration",
    "co2",
    "fever",
    "fatigue",
    "radiation",
]

BodyZoneType = Literal[
    "head",
    "lungs",
    "heart",
    "abdomen",
    "arms",
    "spine",
    "legs",
]


# --- ASTRONAUTAS / PERFIL ---
class AstronautBase(BaseModel):
    code: str = Field(..., examples=["AST-001"])
    name: str = Field(..., min_length=2, max_length=100, examples=["Cmdr. Elena Vance"])
    role: str = Field(..., examples=["COMANDANTE"])
    mission: str = Field(..., examples=["ARTEMIS-SIM"])
    mission_day: int = Field(default=42, ge=1, examples=[42])
    age: int = Field(..., ge=21, le=70, examples=[38])
    blood_type: str = Field(default="O+", examples=["O+"])
    height_cm: float = Field(default=175.0, examples=[175.0])
    weight_kg: float = Field(default=72.0, examples=[72.0])


class AstronautCreate(AstronautBase):
    pass


class Astronaut(AstronautBase):
    id: int
    status: Literal["nominal", "warning", "critical"] = "nominal"


# --- MEDICIONES BIOMÉTRICAS Y AMBIENTALES ---
class MeasurementCreate(BaseModel):
    astronaut_id: int = Field(default=1)
    heart_rate_bpm: int = Field(..., ge=30, le=220, examples=[72])
    systolic_bp: int = Field(..., ge=60, le=250, examples=[118])
    diastolic_bp: int = Field(..., ge=40, le=150, examples=[78])
    spo2_percent: float = Field(..., ge=50.0, le=100.0, examples=[98.5])
    body_temp_c: float = Field(..., ge=32.0, le=43.0, examples=[36.7])
    respiratory_rate_rpm: int = Field(..., ge=5, le=60, examples=[15])
    ambient_co2_mmhg: float = Field(..., ge=0.0, le=30.0, examples=[2.2])
    hydration_percent: float = Field(..., ge=0.0, le=100.0, examples=[88.0])
    radiation_usvh: float = Field(..., ge=0.0, examples=[22.0])
    scenario: ScenarioType = "normal"
    eva_load: int = Field(default=0, ge=0, le=100, examples=[0])
    source: str = Field(default="SIM-BIO-AST01")
    timestamp: Optional[datetime] = None


class Measurement(MeasurementCreate):
    id: int
    timestamp: datetime


# --- ALERTAS Y BITÁCORA DEL ESCÁNER CORPORAL ---
class AlertCreate(BaseModel):
    astronaut_id: int = Field(default=1)
    measurement_id: Optional[int] = None
    severity: Literal["info", "warning", "critical"]
    metric: str = Field(..., examples=["hr"])
    zone: Optional[BodyZoneType] = Field(default=None, examples=["heart"])
    message: str = Field(..., examples=["Frecuencia cardíaca elevada durante carga EVA"])
    suggested_action: Optional[str] = Field(
        default=None, examples=["Reducir intensidad de actividad y monitorizar ECG Lead II"]
    )


class Alert(AlertCreate):
    id: int
    acknowledged: bool = False
    created_at: datetime