
from datetime import datetime, timezone

from sqlalchemy import func

from app.database import SessionLocal
from app.models import (
    AstronautDB,
    MeasurementDB,
    AlertDB,
    LogDB,
    InsightDB,
)

from app.schemas import (
    AstronautCreate,
    MeasurementCreate,
    AlertCreate,
    LogCreate,
    InsightCreate,
)


def utc_now():
    return datetime.now(timezone.utc)


def as_utc(value: datetime = None) -> datetime:
    """
    Normaliza una fecha a UTC.

    SQLite descarta la zona horaria al guardar, así que una fecha con
    offset distinto de UTC se leería como si fuera UTC. Convertirla
    antes de persistir mantiene el orden del historial.
    """

    if value is None:
        return utc_now()

    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc)


class DatabaseStore:

    def __init__(self):
        self._seed_data()

    # ==========================================
    # DATOS INICIALES
    # ==========================================

    def _seed_data(self):
        """Crea un astronauta de prueba si no existe."""

        with SessionLocal() as db:
            astronaut = (
                db.query(AstronautDB)
                .filter(AstronautDB.code == "ASTRA-001")
                .first()
            )

            if not astronaut:
                astronaut = AstronautDB(
                    code="ASTRA-001",
                    name="Cmdr. Elena Vance",
                    role="Mission Commander",
                    mission="ASTRA-01",
                    mission_day=1,
                    age=42,
                    blood_type="O+",
                    height_cm=170.0,
                    weight_kg=65.0,
                    status="nominal",
                )

                db.add(astronaut)
                db.commit()

                print("Astronauta inicial creado correctamente.")

    # ==========================================
    # ASTRONAUTAS
    # ==========================================

    def get_astronauts(self):
        with SessionLocal() as db:
            return (
                db.query(AstronautDB)
                .order_by(AstronautDB.id.asc())
                .all()
            )

    def get_astronaut(self, astronaut_id: int):
        with SessionLocal() as db:
            return (
                db.query(AstronautDB)
                .filter(AstronautDB.id == astronaut_id)
                .first()
            )

    def create_astronaut(self, data: AstronautCreate):
        with SessionLocal() as db:
            astronaut = AstronautDB(**data.model_dump())

            db.add(astronaut)
            db.commit()
            db.refresh(astronaut)

            return astronaut

    # ==========================================
    # MEDICIONES
    # ==========================================

    def create_measurement(self, data: MeasurementCreate):
        with SessionLocal() as db:

            payload = data.model_dump(exclude={"timestamp"})

            measurement = MeasurementDB(
                **payload,
                timestamp=as_utc(data.timestamp),
            )

            db.add(measurement)
            db.commit()
            db.refresh(measurement)

            return measurement
    
    def get_measurement(self, measurement_id: int):
        with SessionLocal() as db:
            return (
                db.query(MeasurementDB)
                .filter(MeasurementDB.id == measurement_id)
                .first()
            )

    def list_measurements(
        self,
        astronaut_id: int = None,
        limit: int = 50,
    ):
        with SessionLocal() as db:

            query = db.query(MeasurementDB)

            if astronaut_id is not None:
                query = query.filter(
                    MeasurementDB.astronaut_id == astronaut_id
                )

            return (
                query
                .order_by(MeasurementDB.timestamp.desc())
                .limit(limit)
                .all()
            )

    def get_latest_measurement(self, astronaut_id: int = None):
        """Última medición persistida (la de ID más alto)."""

        with SessionLocal() as db:

            query = db.query(MeasurementDB)

            if astronaut_id is not None:
                query = query.filter(
                    MeasurementDB.astronaut_id == astronaut_id
                )

            return (
                query
                .order_by(
                    MeasurementDB.id.desc(),
                )
                .first()
            )

    def get_latest_measurements(self):
        """Obtiene la última medición de cada astronauta."""

        with SessionLocal() as db:

            latest_ids = (
                db.query(
                    func.max(MeasurementDB.id).label("id"),
                )
                .group_by(MeasurementDB.astronaut_id)
                .subquery()
            )

            return (
                db.query(MeasurementDB)
                .join(
                    latest_ids,
                    MeasurementDB.id == latest_ids.c.id,
                )
                .order_by(MeasurementDB.astronaut_id.asc())
                .all()
            )

    # ==========================================
    # ALERTAS
    # ==========================================

    def create_alert(self, data: AlertCreate):
        with SessionLocal() as db:

            alert = AlertDB(**data.model_dump())

            db.add(alert)
            db.commit()
            db.refresh(alert)

            return alert

    def list_alerts(
        self,
        astronaut_id: int = None,
        severity: str = None,
        acknowledged: bool = None,
    ):
        with SessionLocal() as db:

            query = db.query(AlertDB)

            if astronaut_id is not None:
                query = query.filter(
                    AlertDB.astronaut_id == astronaut_id
                )

            if severity is not None:
                query = query.filter(
                    AlertDB.severity == severity
                )

            if acknowledged is not None:
                query = query.filter(
                    AlertDB.acknowledged == acknowledged
                )

            return (
                query
                .order_by(AlertDB.created_at.desc())
                .all()
            )

    def acknowledge_alert(self, alert_id: int):
        with SessionLocal() as db:

            alert = (
                db.query(AlertDB)
                .filter(AlertDB.id == alert_id)
                .first()
            )

            if not alert:
                return None

            if not alert.acknowledged:
                alert.acknowledged = True
                db.commit()
                db.refresh(alert)

            return alert

    # ==========================================
    # LOGS / BITÁCORA
    # ==========================================

    def create_log(self, data: LogCreate):
        with SessionLocal() as db:

            payload = data.model_dump(exclude={"timestamp"})

            log = LogDB(
                **payload,
                timestamp=as_utc(data.timestamp),
            )

            db.add(log)
            db.commit()
            db.refresh(log)

            return log

    def list_logs(
        self,
        astronaut_id: int = None,
        limit: int = 50,
    ):
        with SessionLocal() as db:

            query = db.query(LogDB)

            if astronaut_id is not None:
                query = query.filter(
                    LogDB.astronaut_id == astronaut_id
                )

            return (
                query
                .order_by(LogDB.timestamp.desc())
                .limit(limit)
                .all()
            )

    # ==========================================
    # INSIGHTS / ANALYSIS ENGINE
    # ==========================================

    def create_insight(self, data: InsightCreate):
        with SessionLocal() as db:

            payload = data.model_dump(exclude={"timestamp"})

            insight = InsightDB(
                **payload,
                timestamp=as_utc(data.timestamp),
            )

            db.add(insight)

            # Generar alerta si el análisis detecta riesgo crítico.
            if insight.risk_level == "critical":

                alert = AlertDB(
                    astronaut_id=insight.astronaut_id,
                    severity="critical",
                    metric=insight.category,
                    message=f"[IA PREDICTION]: {insight.description}",
                    suggested_action=insight.recommendation,
                )

                db.add(alert)

            # Ambos registros se guardan en una misma transacción.
            db.commit()
            db.refresh(insight)

            return insight

    def get_insights(self, limit: int = 50):
        with SessionLocal() as db:

            return (
                db.query(InsightDB)
                .order_by(InsightDB.timestamp.desc())
                .limit(limit)
                .all()
            )


# ==========================================
# INSTANCIA GLOBAL
# ==========================================

db = DatabaseStore()
