from datetime import datetime, timedelta, timezone
from typing import List, Optional
from app.schemas import (
    Alert,
    AlertCreate,
    Astronaut,
    AstronautCreate,
    Measurement,
    MeasurementCreate,
)


class InMemoryStore:
    def __init__(self) -> None:
        self.astronauts: List[Astronaut] = []
        self.measurements: List[Measurement] = []
        self.alerts: List[Alert] = []
        self._seed_data()

    def _seed_data(self) -> None:
        now = datetime.now(timezone.utc)

        # 1. Tripulante principal sincronizado con la mission-bar de index.html
        self.astronauts = [
            Astronaut(
                id=1,
                code="AST-001",
                name="Cmdr. Elena Vance",
                role="COMANDANTE",
                mission="ARTEMIS-SIM",
                mission_day=42,
                age=38,
                blood_type="O+",
                height_cm=174.0,
                weight_kg=68.5,
                status="nominal",
            ),
            Astronaut(
                id=2,
                code="AST-002",
                name="Dr. Kenji Sato",
                role="ESPECIALISTA BIOMÉDICO",
                mission="ARTEMIS-SIM",
                mission_day=42,
                age=35,
                blood_type="A+",
                height_cm=178.0,
                weight_kg=74.0,
                status="nominal",
            ),
        ]

        # 2. Historial reciente de AST-001 para gráficos de tendencia y sparklines
        samples = [
            # (mins_atras, hr, sys, dia, spo2, temp, rr, co2, hyd, rad)
            (45, 70, 116, 76, 98.7, 36.6, 14, 2.1, 89.0, 21.0),
            (30, 71, 117, 77, 98.6, 36.7, 15, 2.2, 88.5, 22.0),
            (15, 73, 119, 78, 98.4, 36.7, 15, 2.2, 88.0, 22.5),
            (0,  72, 118, 78, 98.5, 36.7, 15, 2.2, 88.0, 22.0),
        ]

        for idx, (mins, hr, sys_bp, dia_bp, spo2, temp, rr, co2, hyd, rad) in enumerate(
            samples, start=1
        ):
            self.measurements.append(
                Measurement(
                    id=idx,
                    astronaut_id=1,
                    heart_rate_bpm=hr,
                    systolic_bp=sys_bp,
                    diastolic_bp=dia_bp,
                    spo2_percent=spo2,
                    body_temp_c=temp,
                    respiratory_rate_rpm=rr,
                    ambient_co2_mmhg=co2,
                    hydration_percent=hyd,
                    radiation_usvh=rad,
                    scenario="normal",
                    eva_load=0,
                    source="SIM-BIO-AST01",
                    timestamp=now - timedelta(minutes=mins),
                )
            )

        # 3. Registro inicial de bitácora del sistema
        self.alerts = [
            Alert(
                id=1,
                astronaut_id=1,
                measurement_id=4,
                severity="info",
                metric="system",
                zone=None,
                message="Telemetría BIO-VEST v2 sincronizada en rango nominal.",
                suggested_action="Continuar escaneo continuo cada 60 segundos.",
                acknowledged=True,
                created_at=now - timedelta(minutes=15),
            )
        ]

    # --- Astronautas ---
    def list_astronauts(self) -> List[Astronaut]:
        return self.astronauts

    def get_astronaut(self, astronaut_id: int) -> Optional[Astronaut]:
        return next((a for a in self.astronauts if a.id == astronaut_id), None)

    def create_astronaut(self, data: AstronautCreate) -> Astronaut:
        next_id = max((a.id for a in self.astronauts), default=0) + 1
        new_astro = Astronaut(id=next_id, status="nominal", **data.model_dump())
        self.astronauts.append(new_astro)
        return new_astro

    # --- Mediciones ---
    def list_measurements(
        self, astronaut_id: Optional[int] = None, limit: int = 50
    ) -> List[Measurement]:
        results = self.measurements
        if astronaut_id is not None:
            results = [m for m in results if m.astronaut_id == astronaut_id]
        results = sorted(results, key=lambda m: m.timestamp)
        return results[-limit:]

    def get_latest_measurements(self) -> List[Measurement]:
        latest = []
        for astro in self.astronauts:
            astro_m = [m for m in self.measurements if m.astronaut_id == astro.id]
            if astro_m:
                latest.append(max(astro_m, key=lambda m: m.timestamp))
        return latest

    def create_measurement(self, data: MeasurementCreate) -> Measurement:
        next_id = max((m.id for m in self.measurements), default=0) + 1
        ts = data.timestamp or datetime.now(timezone.utc)
        payload = data.model_dump(exclude={"timestamp"})
        measurement = Measurement(id=next_id, timestamp=ts, **payload)
        self.measurements.append(measurement)

        self._evaluate_thresholds(measurement)
        return measurement

    def _evaluate_thresholds(self, m: Measurement) -> None:
        """Evaluación temporal de los 8 rangos de index.html hasta integrar analysis-engine."""
        astro = self.get_astronaut(m.astronaut_id)
        if not astro:
            return

        status_level = "nominal"

        checks = [
            # (condición_crítica, condición_warning, métrica, zona, mensaje, acción)
            (
                m.spo2_percent < 90.0,
                m.spo2_percent < 95.0,
                "spo2",
                "lungs",
                f"Saturación SpO2 fuera de rango ({m.spo2_percent}%)",
                "Verificar suministro de O2 en casco y reducir esfuerzo EVA.",
            ),
            (
                m.heart_rate_bpm > 140 or m.heart_rate_bpm < 45,
                m.heart_rate_bpm > 100 or m.heart_rate_bpm < 60,
                "hr",
                "heart",
                f"Frecuencia cardíaca alterada ({m.heart_rate_bpm} BPM)",
                "Monitorear trazado ECG Lead II y pausar actividad física.",
            ),
            (
                m.systolic_bp >= 150 or m.diastolic_bp >= 95,
                m.systolic_bp >= 130 or m.diastolic_bp >= 85,
                "bp",
                "heart",
                f"Presión arterial elevada ({m.systolic_bp}/{m.diastolic_bp} mmHg)",
                "Revisar ajuste de manguito Bio-Suit y estado de estrés.",
            ),
            (
                m.body_temp_c >= 38.5 or m.body_temp_c < 35.0,
                m.body_temp_c > 37.5 or m.body_temp_c < 36.0,
                "temp",
                "head",
                f"Temperatura corporal fuera de rango ({m.body_temp_c} °C)",
                "Ajustar bucle de refrigeración líquida LCVG del traje.",
            ),
            (
                m.respiratory_rate_rpm > 28 or m.respiratory_rate_rpm < 8,
                m.respiratory_rate_rpm > 20 or m.respiratory_rate_rpm < 12,
                "rr",
                "lungs",
                f"Frecuencia respiratoria alterada ({m.respiratory_rate_rpm} rpm)",
                "Controlar ritmo respiratorio y revisar flujo de aire.",
            ),
            (
                m.ambient_co2_mmhg >= 5.0,
                m.ambient_co2_mmhg >= 3.0,
                "co2",
                "head",
                f"ppCO2 ambiente elevado ({m.ambient_co2_mmhg} mmHg)",
                "Revisar depurador de CO2 (scrubber) y ventilación del casco.",
            ),
            (
                m.hydration_percent < 60.0,
                m.hydration_percent < 75.0,
                "hyd",
                "abdomen",
                f"Índice de hidratación bajo ({m.hydration_percent}%)",
                "Ingerir 300 ml de solución electrolítica vía bolsa IDB.",
            ),
            (
                m.radiation_usvh >= 100.0,
                m.radiation_usvh >= 50.0,
                "dose",
                "spine",
                f"Tasa de dosis de radiación elevada ({m.radiation_usvh} µSv/h)",
                "Desplazarse a módulo con blindaje contra radiación SPE.",
            ),
        ]

        for is_crit, is_warn, metric, zone, msg, action in checks:
            if is_crit:
                status_level = "critical"
                self.create_alert(
                    AlertCreate(
                        astronaut_id=m.astronaut_id,
                        measurement_id=m.id,
                        severity="critical",
                        metric=metric,
                        zone=zone,
                        message=msg,
                        suggested_action=action,
                    )
                )
            elif is_warn:
                if status_level != "critical":
                    status_level = "warning"
                self.create_alert(
                    AlertCreate(
                        astronaut_id=m.astronaut_id,
                        measurement_id=m.id,
                        severity="warning",
                        metric=metric,
                        zone=zone,
                        message=msg,
                        suggested_action=action,
                    )
                )

        astro.status = status_level

    # --- Alertas y Bitácora ---
    def list_alerts(
        self,
        astronaut_id: Optional[int] = None,
        severity: Optional[str] = None,
        acknowledged: Optional[bool] = None,
    ) -> List[Alert]:
        results = self.alerts
        if astronaut_id is not None:
            results = [a for a in results if a.astronaut_id == astronaut_id]
        if severity is not None:
            results = [a for a in results if a.severity == severity]
        if acknowledged is not None:
            results = [a for a in results if a.acknowledged == acknowledged]
        return sorted(results, key=lambda a: a.created_at, reverse=True)

    def create_alert(self, data: AlertCreate) -> Alert:
        next_id = max((a.id for a in self.alerts), default=0) + 1
        alert = Alert(
            id=next_id,
            acknowledged=False,
            created_at=datetime.now(timezone.utc),
            **data.model_dump(),
        )
        self.alerts.append(alert)
        return alert

    def acknowledge_alert(self, alert_id: int) -> Optional[Alert]:
        alert = next((a for a in self.alerts if a.id == alert_id), None)
        if alert:
            alert.acknowledged = True
        return alert


db = InMemoryStore()