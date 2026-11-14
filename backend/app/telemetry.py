
from datetime import timezone
from typing import Any, Dict, Optional

from app.models import MeasurementDB


def iso_utc(value) -> Optional[str]:
    """Serializa fechas como ISO-8601 en UTC (con sufijo Z)."""

    if value is None:
        return None

    # SQLite devuelve datetimes sin tzinfo aunque se guardaron en UTC.
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def measurement_payload(measurement: MeasurementDB) -> Dict[str, Any]:
    """
    Traduce una fila de `measurements` al contrato corto que consume
    el frontend por WebSocket.
    """

    return {
        "type": "telemetry",
        "astronaut_id": measurement.astronaut_id,
        "measurement_id": measurement.id,
        "timestamp": iso_utc(measurement.timestamp),
        "source": measurement.source,
        "scenario": measurement.scenario,
        "eva_load": measurement.eva_load,
        "hr": measurement.heart_rate_bpm,
        "sys": measurement.systolic_bp,
        "dia": measurement.diastolic_bp,
        "spo2": measurement.spo2_percent,
        "temp": measurement.body_temp_c,
        "rr": measurement.respiratory_rate_rpm,
        "co2": measurement.ambient_co2_mmhg,
        "hyd": measurement.hydration_percent,
        "dose": measurement.radiation_usvh,
        "fat": measurement.fatigue_index,
        "cm": measurement.countermeasures_percent,
    }
