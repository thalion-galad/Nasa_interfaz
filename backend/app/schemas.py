
from datetime import datetime
from typing import Literal, Optional, Dict, Any

from pydantic import BaseModel, Field, ConfigDict


# ==========================================
# CONFIGURACIÓN Y TIPOS COMPARTIDOS
# ==========================================

class ORMBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


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


# ==========================================
# ASTRONAUTAS
# ==========================================

class AstronautBase(ORMBase):
    code: str = Field(..., min_length=3, max_length=20)
    name: str = Field(..., min_length=2, max_length=100)
    role: str = Field(..., max_length=50)
    mission: str = Field(..., max_length=100)

    mission_day: int = Field(default=42, ge=1)
    age: int = Field(..., ge=21, le=70)

    blood_type: str = Field(default="O+", max_length=5)
    height_cm: float = Field(default=175.0, gt=0)
    weight_kg: float = Field(default=72.0, gt=0)


class AstronautCreate(AstronautBase):
    pass


class Astronaut(AstronautBase):
    id: int
    status: Literal["nominal", "warning", "critical"] = "nominal"


# ==========================================
# MEDICIONES BIOMÉTRICAS Y AMBIENTALES
# ==========================================

class MeasurementCreate(ORMBase):
    astronaut_id: int = Field(..., gt=0)

    heart_rate_bpm: int = Field(..., ge=30, le=220)
    systolic_bp: int = Field(..., ge=60, le=250)
    diastolic_bp: int = Field(..., ge=40, le=150)

    spo2_percent: float = Field(..., ge=50.0, le=100.0)
    body_temp_c: float = Field(..., ge=32.0, le=43.0)
    respiratory_rate_rpm: int = Field(..., ge=5, le=60)

    ambient_co2_mmhg: float = Field(..., ge=0.0, le=30.0)
    hydration_percent: float = Field(..., ge=0.0, le=100.0)
    radiation_usvh: float = Field(..., ge=0.0)

    fatigue_index: int = Field(default=18, ge=0, le=100)
    countermeasures_percent: int = Field(default=86, ge=0, le=100)

    scenario: ScenarioType = "normal"
    eva_load: int = Field(default=0, ge=0, le=100)

    source: str = Field(default="SIM-BIO-AST01")
    timestamp: Optional[datetime] = None


class Measurement(MeasurementCreate):
    id: int
    timestamp: datetime


# ==========================================
# ALERTAS
# ==========================================

class AlertCreate(ORMBase):
    astronaut_id: int = Field(..., gt=0)
    measurement_id: Optional[int] = Field(default=None, gt=0)

    severity: Literal["info", "warning", "critical"]
    metric: str = Field(..., max_length=50)

    zone: Optional[BodyZoneType] = None

    message: str = Field(..., min_length=1, max_length=500)
    suggested_action: Optional[str] = Field(
        default=None,
        max_length=500
    )


class Alert(AlertCreate):
    id: int
    acknowledged: bool = False
    created_at: datetime


# ==========================================
# BITÁCORA MÉDICA
# ==========================================

class LogCreate(ORMBase):
    astronaut_id: int = Field(..., gt=0)

    zone: str = Field(..., max_length=100)
    action: Optional[str] = Field(default=None, max_length=500)

    metrics: Optional[Dict[str, Any]] = None
    timestamp: Optional[datetime] = None


class Log(LogCreate):
    id: int
    timestamp: datetime


# ==========================================
# ANALYSIS ENGINE - INSIGHTS
# ==========================================

class InsightCreate(ORMBase):
    astronaut_id: int = Field(..., gt=0)

    risk_level: Literal["nominal", "warning", "critical"]

    category: str = Field(..., max_length=100)
    description: str = Field(..., min_length=1, max_length=1000)
    recommendation: str = Field(..., min_length=1, max_length=1000)

    timestamp: Optional[datetime] = None


class Insight(InsightCreate):
    id: int
    timestamp: datetime
