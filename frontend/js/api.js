
"use strict";

// Dirección del backend FastAPI
const API_URL = "http://localhost:8000/api";
const WS_URL = "ws://localhost:8000/telemetry";

const backend = {
    socket: null,
    isConnected: false,
    reconnectTimer: null,

    // Petición REST reutilizable
    async request(endpoint, options = {}) {
        const response = await fetch(`${API_URL}${endpoint}`, {
            headers: {
                "Content-Type": "application/json",
                ...options.headers
            },
            ...options
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

    // 1. Conexión WebSocket
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

            const statusEl = document.querySelector("#connection-status");

            if (statusEl) {
                statusEl.textContent = "EN LÍNEA";
                statusEl.style.color = "#00ff00";
            }
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.updateState(data);
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

            const statusEl = document.querySelector("#connection-status");

            if (statusEl) {
                statusEl.textContent = "DESCONECTADO - REINTENTANDO...";
                statusEl.style.color = "#ff0000";
            }

            this.reconnectTimer = setTimeout(() => {
                this.connectTelemetry();
            }, 3000);
        };
    },

    // 2. Actualización del estado global
    updateState(serverData) {
        if (typeof state === "undefined") {
            console.error("El estado global todavía no está disponible.");
            return;
        }

        // El backend utiliza bp_sys y bp_dia.
        // La interfaz utiliza state.sys y state.dia.
        if (serverData.hr != null) {
            state.hr = Number(serverData.hr);
        }

        if (serverData.bp_sys != null) {
            state.sys = Number(serverData.bp_sys);
        }

        if (serverData.bp_dia != null) {
            state.dia = Number(serverData.bp_dia);
        }

        if (serverData.spo2 != null) {
            state.spo2 = Number(serverData.spo2);
        }

        // Puntos ECG opcionales
        if (
            serverData.ecg_point != null &&
            typeof D !== "undefined" &&
            Array.isArray(D.ecg)
        ) {
            D.ecg.push(serverData.ecg_point);

            if (D.ecg.length > 300) {
                D.ecg.shift();
            }
        }
    },

    // 3. Astronautas
    getAstronauts() {
        return this.request("/astronauts/");
    },

    getAstronaut(id) {
        return this.request(`/astronauts/${id}`);
    },

    // 4. Mediciones
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

    // 5. Alertas
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

    // 6. Bitácora
    getLogs(params = {}) {
        const query = new URLSearchParams(params).toString();

        return this.request(
            `/logs/${query ? `?${query}` : ""}`
        );
    },

    async saveZoneLog(zoneData) {
        try {
            const result = await this.request("/logs/", {
                method: "POST",
                body: JSON.stringify({
                    astronaut_id: 1,
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
            return result;

        } catch (error) {
            console.error("Error guardando bitácora:", error);
            return null;
        }
    },

    // 7. Insights
    getInsights(params = {}) {
        const query = new URLSearchParams(params).toString();

        return this.request(
            `/insights/${query ? `?${query}` : ""}`
        );
    }
};
