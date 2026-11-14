
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    DateTime,
    ForeignKey,
    JSON,
    Boolean,
)

from app.database import Base


def utc_now():
    return datetime.now(timezone.utc)


# ==========================================
# ASTRONAUTAS
# ==========================================

class AstronautDB(Base):
    __tablename__ = "astronauts"

    id = Column(Integer, primary_key=True, index=True)

    code = Column(String(20), unique=True, index=True, nullable=False)
    name = Column(String(100), nullable=False)
    role = Column(String(50), nullable=False)
    mission = Column(String(100), nullable=False)
    mission_day = Column(Integer, nullable=False, default=42)

    age = Column(Integer, nullable=False)
    blood_type = Column(String(5), nullable=False, default="O+")
    height_cm = Column(Float, nullable=False, default=175.0)
    weight_kg = Column(Float, nullable=False, default=72.0)

    status = Column(String(20), nullable=False, default="nominal")


# ==========================================
# MEDICIONES BIOMÉTRICAS Y AMBIENTALES
# ==========================================

class MeasurementDB(Base):
    __tablename__ = "measurements"

    id = Column(Integer, primary_key=True, index=True)

    astronaut_id = Column(
        Integer,
        ForeignKey("astronauts.id"),
        nullable=False,
        index=True
    )

    heart_rate_bpm = Column(Integer, nullable=False)
    systolic_bp = Column(Integer, nullable=False)
    diastolic_bp = Column(Integer, nullable=False)
    spo2_percent = Column(Float, nullable=False)

    body_temp_c = Column(Float, nullable=False)
    respiratory_rate_rpm = Column(Integer, nullable=False)
    ambient_co2_mmhg = Column(Float, nullable=False)
    hydration_percent = Column(Float, nullable=False)
    radiation_usvh = Column(Float, nullable=False)

    fatigue_index = Column(Integer, nullable=False, default=18)
    countermeasures_percent = Column(Integer, nullable=False, default=86)

    scenario = Column(String(30), nullable=False, default="normal")
    eva_load = Column(Integer, nullable=False, default=0)
    source = Column(String(100), nullable=False, default="SIM-BIO-AST01")

    timestamp = Column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
        index=True
    )


# ==========================================
# ALERTAS
# ==========================================

class AlertDB(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)

    astronaut_id = Column(
        Integer,
        ForeignKey("astronauts.id"),
        nullable=False,
        index=True
    )

    measurement_id = Column(
        Integer,
        ForeignKey("measurements.id"),
        nullable=True
    )

    severity = Column(String(20), nullable=False)
    metric = Column(String(50), nullable=False)
    zone = Column(String(30), nullable=True)

    message = Column(String(500), nullable=False)
    suggested_action = Column(String(500), nullable=True)

    acknowledged = Column(Boolean, nullable=False, default=False)

    created_at = Column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False
    )


# ==========================================
# BITÁCORA MÉDICA
# ==========================================

class LogDB(Base):
    __tablename__ = "logs"

    id = Column(Integer, primary_key=True, index=True)

    astronaut_id = Column(
        Integer,
        ForeignKey("astronauts.id"),
        nullable=False,
        index=True
    )

    zone = Column(String(100), nullable=False)
    action = Column(String(500), nullable=True)

    metrics = Column(JSON, nullable=True)

    timestamp = Column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False
    )


# ==========================================
# INSIGHTS DEL ANALYSIS ENGINE
# ==========================================

class InsightDB(Base):
    __tablename__ = "insights"

    id = Column(Integer, primary_key=True, index=True)

    astronaut_id = Column(
        Integer,
        ForeignKey("astronauts.id"),
        nullable=False,
        index=True
    )

    risk_level = Column(String(20), nullable=False)
    category = Column(String(100), nullable=False)
    description = Column(String(1000), nullable=False)
    recommendation = Column(String(1000), nullable=False)

    timestamp = Column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False
    )
