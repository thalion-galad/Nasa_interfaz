/* =========================================================
   ASTRA HEALTH · API
   Única puerta de entrada de datos: REST (carga inicial e
   historial) + WebSocket (actualizaciones de telemetría).
   No genera valores: la fuente es SQLite a través de FastAPI.
   ========================================================= */
"use strict";

// Dirección del backend FastAPI
const API_URL = "http://localhost:8000/api";
const WS_URL = "ws://localhost:8000/telemetry";

const backend = {
    socket: null,
    isConnected: false,
    reconnectTimer: null,

    // Tripulante activo (la consola muestra una sola cabina)
    astronautId: null,

    // Última medición aplicada (evita re-renderizar la misma fila)
    lastAppliedId: null,

    // Caché de la API para que los módulos rendericen de forma síncrona
    cache: {
        astronaut: null,
        latest: null,
        history: [],    // orden ascendente por fecha
        alerts: [],
        logs: [],
        insights: []
    },

    // Petición REST reutilizable
    async request(endpoint, options = {}) {
        const { headers, ...rest } = options;

        const response = await fetch(`${API_URL}${endpoint}`, {
            ...rest,
            headers: {
                "Content-Type": "application/json",
                ...headers
            }
        });

        if (!response.ok) {
            let detail = `Error HTTP ${response.status}`;

            try {
                const errorData = await response.json();
                detail = errorData.detail || detail;
            } catch (_) {}

            throw new Error(detail);
        }

        if (response.status === 204) return null;

        return response.json();
    },

    // Estado visual del enlace
    setStatus(text, color) {
        const statusEl = document.querySelector("#connection-status");

        if (statusEl) {
            statusEl.textContent = text;
            statusEl.style.color = color;
        }
    },

    /* ---------- 1. WebSocket de telemetría ---------- */
    connectTelemetry() {
        if (
            this.socket &&
            (
                this.socket.readyState === WebSocket.OPEN ||
                this.socket.readyState === WebSocket.CONNECTING
            )
        ) {
            return;
        }

        clearTimeout(this.reconnectTimer);

        const socket = new WebSocket(WS_URL);
        this.socket = socket;

        socket.onopen = () => {
            this.isConnected = true;
            console.log("Conectado a la telemetría de ASTRA Health");
            this.setStatus("EN LÍNEA", "#00ff00");
        };

        socket.onmessage = (event) => {
            try {
                this.handleMessage(JSON.parse(event.data));
            } catch (error) {
                console.error("Error procesando telemetría:", error);
            }
        };

        socket.onerror = (error) => {
            console.error("Error en WebSocket:", error);
        };

        socket.onclose = () => {
            if (this.socket !== socket) return;

            this.isConnected = false;
            this.setStatus("DESCONECTADO - REINTENTANDO...", "#ff0000");

            this.reconnectTimer = setTimeout(() => {
                this.connectTelemetry();
            }, 3000);
        };
    },

    handleMessage(message) {
        if (!message || message.type === "no_data") {
            this.setStatus("SIN TELEMETRÍA EN LA BD", "#ffb000");
            return;
        }

        if (this.applyMeasurement(message)) {
            this.setStatus("EN LÍNEA", "#00ff00");
        }
    },

    /* ---------- 2. Normalización del contrato ---------- */
    // El WebSocket usa nombres cortos (hr, sys...) y la REST usa los
    // nombres de la tabla (heart_rate_bpm, systolic_bp...).
    normalize(raw) {
        if (!raw) return null;

        const value = (short, long) => {
            const v = raw[short] !== undefined && raw[short] !== null
                ? raw[short]
                : raw[long];
            return v === undefined || v === null ? null : Number(v);
        };

        return {
            measurementId: raw.measurement_id ?? raw.id ?? null,
            astronautId: raw.astronaut_id ?? null,
            timestamp: raw.timestamp ?? null,
            source: raw.source ?? null,
            scenario: raw.scenario ?? null,
            evaLoad: value("eva_load", "eva_load"),
            hr: value("hr", "heart_rate_bpm"),
            sys: value("sys", "systolic_bp"),
            dia: value("dia", "diastolic_bp"),
            spo2: value("spo2", "spo2_percent"),
            temp: value("temp", "body_temp_c"),
            rr: value("rr", "respiratory_rate_rpm"),
            co2: value("co2", "ambient_co2_mmhg"),
            hyd: value("hyd", "hydration_percent"),
            dose: value("dose", "radiation_usvh"),
            fat: value("fat", "fatigue_index"),
            cm: value("cm", "countermeasures_percent")
        };
    },

    /* Escribe una medición en el estado global. Devuelve true si cambió. */
    applyMeasurement(raw) {
        if (typeof state === "undefined") {
            console.error("El estado global todavía no está disponible.");
            return false;
        }

        const m = this.normalize(raw);

        if (!m) return false;
        if (m.measurementId !== null && m.measurementId === this.lastAppliedId && state.ready) {
            return false;
        }

        this.lastAppliedId = m.measurementId;
        this.cache.latest = m;

        state.measurementId = m.measurementId;
        state.astronautId = m.astronautId ?? state.astronautId;
        state.timestamp = m.timestamp;
        state.source = m.source;
        state.scenario = m.scenario;
        state.evaLoad = m.evaLoad;
        state.hr = m.hr;
        state.sys = m.sys;
        state.dia = m.dia;
        state.spo2 = m.spo2;
        state.temp = m.temp;
        state.rr = m.rr;
        state.co2 = m.co2;
        state.hyd = m.hyd;
        state.fat = m.fat;
        state.cm = m.cm;
        state.dose = m.dose;
        state.ready = true;

        // Si la telemetría es de otro tripulante, refrescar el perfil.
        if (
            m.astronautId !== null &&
            this.cache.astronaut &&
            this.cache.astronaut.id !== m.astronautId
        ) {
            this.loadAstronaut(m.astronautId).catch(() => {});
        }

        return true;
    },

    /* ---------- 3. Astronautas ---------- */
    getAstronauts() {
        return this.request("/astronauts/");
    },

    getAstronaut(id) {
        return this.request(`/astronauts/${id}`);
    },

    async loadAstronaut(id = null) {
        const fallbackId = typeof state !== "undefined" ? state.astronautId : null;
        const targetId = id !== null && id !== undefined ? id : fallbackId;

        if (targetId === null || targetId === undefined) {
            const list = await this.getAstronauts();

            if (!Array.isArray(list) || list.length === 0) {
                this.cache.astronaut = null;
                return null;
            }

            this.cache.astronaut = list[0];
        } else {
            this.cache.astronaut = await this.getAstronaut(targetId);
        }

        this.astronautId = this.cache.astronaut.id;

        if (typeof state !== "undefined") {
            state.astronautId = this.astronautId;
        }

        return this.cache.astronaut;
    },

    /* ---------- 4. Mediciones ---------- */
    getMeasurements(params = {}) {
        const query = new URLSearchParams(params).toString();

        return this.request(
            `/measurements/${query ? `?${query}` : ""}`
        );
    },

    getLatestMeasurements() {
        return this.request("/measurements/latest");
    },

    createMeasurement(measurement) {
        return this.request("/measurements/", {
            method: "POST",
            body: JSON.stringify(measurement)
        });
    },

    async loadLatest() {
        const data = await this.getLatestMeasurements();
        const list = (Array.isArray(data) ? data : [data]).filter(Boolean);

        // Prioriza la fila del tripulante activo; si aún no hay uno,
        // usa la primera medición disponible.
        const chosen = list.find(row => row.astronaut_id === this.astronautId) || list[0];

        if (chosen) this.applyMeasurement(chosen);

        return chosen || null;
    },

    async loadHistory(limit = 500) {
        const params = { limit };

        if (this.astronautId !== null) {
            params.astronaut_id = this.astronautId;
        }

        const rows = await this.getMeasurements(params);
        const items = (Array.isArray(rows) ? rows : [])
            .map(row => this.normalize(row))
            .filter(item => item && item.timestamp !== null);

        items.sort((a, b) => {
            const ta = parseTs(a.timestamp);
            const tb = parseTs(b.timestamp);
            return (ta ? ta.getTime() : 0) - (tb ? tb.getTime() : 0);
        });

        this.cache.history = items;
        return items;
    },

    /* ---------- 5. Alertas ---------- */
    getAlerts(params = {}) {
        const query = new URLSearchParams(params).toString();

        return this.request(
            `/alerts/${query ? `?${query}` : ""}`
        );
    },

    acknowledgeAlert(id) {
        return this.request(`/alerts/${id}/ack`, {
            method: "PATCH"
        });
    },

    async loadAlerts() {
        const params = {};

        if (this.astronautId !== null) {
            params.astronaut_id = this.astronautId;
        }

        const data = await this.getAlerts(params);
        this.cache.alerts = Array.isArray(data) ? data : [];

        return this.cache.alerts;
    },

    /* ---------- 6. Bitácora ---------- */
    getLogs(params = {}) {
        const query = new URLSearchParams(params).toString();

        return this.request(
            `/logs/${query ? `?${query}` : ""}`
        );
    },

    async loadLogs(limit = 50) {
        const params = { limit };

        if (this.astronautId !== null) {
            params.astronaut_id = this.astronautId;
        }

        const data = await this.getLogs(params);
        this.cache.logs = Array.isArray(data) ? data : [];

        return this.cache.logs;
    },

    async saveZoneLog(zoneData) {
        try {
            const result = await this.request("/logs/", {
                method: "POST",
                body: JSON.stringify({
                    astronaut_id: this.astronautId ?? 1,
                    zone: zoneData.zone,
                    action: zoneData.action || "Escaneo rutinario sin acciones",
                    metrics: {
                        hr: state.hr,
                        spo2: state.spo2,
                        sys: state.sys,
                        dia: state.dia
                    }
                })
            });

            console.log("Bitácora guardada:", result);

            // La bitácora visible se relee desde la API.
            await this.loadLogs().catch(() => {});

            return result;

        } catch (error) {
            console.error("Error guardando bitácora:", error);
            return null;
        }
    },

    /* ---------- 7. Insights ---------- */
    getInsights(params = {}) {
        const query = new URLSearchParams(params).toString();

        return this.request(
            `/insights/${query ? `?${query}` : ""}`
        );
    },

    async loadInsights(limit = 20) {
        const data = await this.getInsights({ limit });
        this.cache.insights = Array.isArray(data) ? data : [];

        return this.cache.insights;
    },

    /* ---------- 8. Carga inicial y refresco ---------- */
    async bootstrap() {
        // Un endpoint caído no debe impedir cargar el resto: si el
        // backend arranca después del frontend, `refresh()` reintenta.
        await this.loadAstronaut().catch(() => null);

        await Promise.allSettled([
            this.loadLatest(),
            this.loadAlerts(),
            this.loadLogs(),
            this.loadInsights()
        ]);

        await this.loadHistory().catch(() => {});

        return this.cache;
    },

    async refresh() {
        const tasks = [
            this.loadLatest(),
            this.loadAlerts(),
            this.loadLogs(),
            this.loadInsights(),
            this.loadHistory()
        ];

        // Si la primera carga falló (backend apagado), se reintenta el perfil.
        if (!this.cache.astronaut) {
            tasks.push(this.loadAstronaut().catch(() => null));
        }

        await Promise.allSettled(tasks);
    }
};
