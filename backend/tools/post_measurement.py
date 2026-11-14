"""
Prueba de integración del contrato REST.

Envía UNA sola medición a POST /api/measurements/ para comprobar que
la telemetría llega a SQLite y desde ahí al WebSocket del frontend.
NO es parte de la aplicación ni genera datos en bucle.

Ejemplo:

    python tools/post_measurement.py --hr 78 --sys 121 --dia 79

Todos los parámetros tienen valores por defecto válidos.
"""

import argparse
import json
import urllib.request


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Envía una medición de prueba a la API de ASTRA Health."
    )

    parser.add_argument("--url", default="http://localhost:8000/api")
    parser.add_argument("--astronaut", type=int, default=1)
    parser.add_argument("--hr", type=int, default=78)
    parser.add_argument("--sys", type=int, default=121)
    parser.add_argument("--dia", type=int, default=79)
    parser.add_argument("--spo2", type=float, default=97.5)
    parser.add_argument("--temp", type=float, default=36.8)
    parser.add_argument("--rr", type=int, default=15)
    parser.add_argument("--co2", type=float, default=2.1)
    parser.add_argument("--hyd", type=float, default=86.0)
    parser.add_argument("--dose", type=float, default=24.0)
    parser.add_argument("--fat", type=int, default=20)
    parser.add_argument("--cm", type=int, default=84)
    parser.add_argument("--eva", type=int, default=0)
    parser.add_argument("--scenario", default="normal")
    parser.add_argument("--source", default="DEV-TEST-01")

    args = parser.parse_args()

    payload = {
        "astronaut_id": args.astronaut,
        "heart_rate_bpm": args.hr,
        "systolic_bp": args.sys,
        "diastolic_bp": args.dia,
        "spo2_percent": args.spo2,
        "body_temp_c": args.temp,
        "respiratory_rate_rpm": args.rr,
        "ambient_co2_mmhg": args.co2,
        "hydration_percent": args.hyd,
        "radiation_usvh": args.dose,
        "fatigue_index": args.fat,
        "countermeasures_percent": args.cm,
        "scenario": args.scenario,
        "eva_load": args.eva,
        "source": args.source,
    }

    request = urllib.request.Request(
        f"{args.url}/measurements/",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(request) as response:
        print(response.status, response.read().decode("utf-8"))


if __name__ == "__main__":
    main()
