/* =========================================================
   ASTRA HEALTH · MÓDULOS DEL CAJÓN
   Genera el HTML de cada módulo a partir del estado único.
   D = severidad "latcheada" de cada métrica (la fija app.js).
   ========================================================= */
"use strict";

const D = {};                       // severidad mostrada por métrica (0/1/2)
const eventLog = [];                // bitácora: {time, sev, text}
const ui = {
    mood: null,                     // autoinforme de ánimo: good | ok | bad
    histRange: "24h",
    histMetric: "hr",
    fx: { scan: true, glow: true, flicker: false }
};

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sevColor = sev => ["var(--green-glow)", "var(--amber-glow)", "var(--red-glow)"][sev] || "var(--green-glow)";
const sevStyle = sev => `style="--c:${sevColor(sev)}"`;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pct = (v, lo, hi) => clamp((v - lo) / (hi - lo) * 100, 0, 100);

function nowTime() {
    return new Date().toLocaleTimeString("es-PE", { hour12: false });
}

function logEvent(sev, text) {
    eventLog.unshift({ time: nowTime(), sev, text });
    if (eventLog.length > 40) eventLog.pop();
}

/* ---------- HISTORIAL (datos simulados reproducibles) ---------- */
const HIST_RANGES = {
    "24h": { n: 24, label: "24 H" },
    "7d":  { n: 7,  label: "7 DÍAS" },
    "42d": { n: 42, label: "MISIÓN" }
};
const HIST_METRICS = {
    hr:   { label: "FRECUENCIA CARDÍACA", short: "FC",   unit: "BPM", base: BASE.hr,   spread: 6,    lo: 50,   hi: 110, dec: 0, sev: v => RULES.hr(Math.round(v)),                cur: () => state.hr },
    spo2: { label: "SATURACIÓN SpO₂",     short: "SpO₂", unit: "%",   base: BASE.spo2, spread: 0.8,  lo: 90,   hi: 100, dec: 1, sev: v => RULES.spo2(Math.round(v * 10) / 10),    cur: () => state.spo2 },
    temp: { label: "TEMPERATURA",         short: "TEMP", unit: "°C",  base: BASE.temp, spread: 0.25, lo: 35.5, hi: 38,  dec: 1, sev: v => RULES.temp(Math.round(v * 10) / 10),    cur: () => state.temp }
};

function mulberry32(a) {
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function genHistory(range, metric) {
    const R = HIST_RANGES[range], M = HIST_METRICS[metric];
    const rnd = mulberry32(range.length * 977 + metric.charCodeAt(0) * 31 + 7);
    const arr = [];
    for (let i = 0; i < R.n - 1; i++) {
        arr.push(M.base + (rnd() - 0.5) * 2 * M.spread + Math.sin(i / (R.n / 6)) * M.spread * 0.3);
    }
    arr.push(M.cur());               // el último punto es la lectura actual
    return arr;
}

function htmlHistory() {
    const M = HIST_METRICS[ui.histMetric];
    const data = genHistory(ui.histRange, ui.histMetric);
    const min = Math.min(...data), max = Math.max(...data);
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    const f = v => v.toFixed(M.dec);

    const rangeTabs = Object.keys(HIST_RANGES).map(k =>
        `<button type="button" class="tab-btn ${k === ui.histRange ? "is-on" : ""}" data-hist-range="${k}" aria-pressed="${k === ui.histRange}">${HIST_RANGES[k].label}</button>`).join("");
    const metricTabs = Object.keys(HIST_METRICS).map(k =>
        `<button type="button" class="tab-btn ${k === ui.histMetric ? "is-on" : ""}" data-hist-metric="${k}" aria-pressed="${k === ui.histMetric}">${HIST_METRICS[k].short}</button>`).join("");

    const bars = data.map((v, i) => {
        const h = Math.max(4, pct(v, M.lo, M.hi));
        const last = i === data.length - 1;
        return `<div class="hist-bar ${last ? "now" : ""}" style="height:${h.toFixed(1)}%;--c:${sevColor(M.sev(v))}" title="${last ? "Ahora" : "Punto " + (i + 1)}: ${f(v)} ${M.unit}"></div>`;
    }).join("");
    const baseBottom = pct(M.base, M.lo, M.hi);

    return `
        <div class="tab-row" role="group" aria-label="Rango temporal">${rangeTabs}</div>
        <div class="tab-row" role="group" aria-label="Parámetro">${metricTabs}</div>
        <div class="monitor-panel" style="padding:8px">
            <div class="monitor-header"><span>${M.label}</span><span class="blue-text">● vs LÍNEA BASE ${f(M.base)}</span></div>
            <div class="hist-chart">${bars}<div class="hist-base" style="bottom:calc(${baseBottom.toFixed(1)}% * .945)"></div></div>
            <div class="hist-stats"><span>MIN ${f(min)}</span><span>MAX ${f(max)}</span><span>PROM ${f(avg)}</span></div>
        </div>
        <p class="module-note">* Datos históricos simulados. El último punto (con borde blanco) es la lectura actual. Comparar contra la línea base personal ayuda a detectar cambios graduales.</p>`;
}

/* ---------- MONITOREO ---------- */
function htmlMonitoring() {
    const keys = ["hr", "bp", "spo2", "temp", "rr", "co2", "hyd", "fat", "cm", "dose"];
    const rows = keys.map(k =>
        `<div ${sevStyle(D[k] || 0)}>${METRIC_INFO[k].label}: <strong>${METRIC_INFO[k].fmt()}</strong></div>`).join("");
    return `
        <h3>Monitoreo en tiempo real</h3>
        <p>Indicadores fisiológicos y ambientales del tripulante AST-001. El color indica el estado (verde nominal, ámbar precaución, rojo alerta).</p>
        <div class="window-data">${rows}</div>
        <p class="module-note">* Todos los valores corresponden a hardware virtual simulado.</p>`;
}

/* ---------- ALERTAS Y BITÁCORA ---------- */
function htmlAlerts() {
    const active = Object.keys(METRIC_INFO).filter(k => (D[k] || 0) > 0).sort((a, b) => D[b] - D[a]);
    const cards = active.length
        ? active.map(k => `
            <div class="alert-card" ${sevStyle(D[k])}>
                <small>${SEV_LABEL[D[k]]} — ${METRIC_INFO[k].label}</small>
                <h4>${METRIC_INFO[k].fmt()}</h4>
                <p>${esc(METRIC_INFO[k].cause())}</p>
                <p><b>Acción (sim):</b> ${esc(METRIC_INFO[k].action())}</p>
            </div>`).join("")
        : `<div class="alert-card" ${sevStyle(0)}><small>INFORMACIÓN</small><h4>SIN ALERTAS ACTIVAS</h4><p>Todos los parámetros están dentro del rango nominal.</p></div>`;
    const log = eventLog.slice(0, 14).map(e => `<li><time>${e.time}</time>${esc(e.text)}</li>`).join("");
    return `
        <h3>Alertas activas</h3>${cards}
        <h3 style="margin-top:14px">Bitácora</h3>
        <ul class="log-list">${log || "<li>Sin eventos.</li>"}</ul>
        <p class="module-note">* Sugerencias educativas. En una situación real se siguen los protocolos de la misión y se contacta al oficial médico (CMO) o al cirujano de vuelo.</p>`;
}

/* ---------- BIENESTAR ---------- */
function wellbeingModel() {
    const fat = state.fat > 70 ? ["ALTA", 2] : state.fat >= 40 ? ["MODERADA", 1] : ["BAJA", 0];
    const moodPenalty = ui.mood === "bad" ? 25 : ui.mood === "ok" ? 10 : 0;
    const stressScore = state.evaLoad * 0.4 + Math.max(0, state.hr - 80) * 0.8 + Math.max(0, state.co2 - 2.5) * 8 + moodPenalty;
    const stress = stressScore < 25 ? ["BAJO", 0] : stressScore < 50 ? ["MODERADO", 1] : ["ALTO", 2];
    const score = Math.round(clamp(100 - state.fat * 0.25 - stressScore * 0.3 - (100 - state.hyd) * 0.2 - (100 - state.cm) * 0.15, 0, 100));
    return { fat, stress, score, scoreSev: score >= 75 ? 0 : score >= 55 ? 1 : 2 };
}

function htmlWellbeing() {
    const W = wellbeingModel();
    const moods = [["good", "BIEN"], ["ok", "REGULAR"], ["bad", "MAL"]].map(([id, label]) =>
        `<button type="button" class="hw-btn" data-mood="${id}" aria-pressed="${ui.mood === id}">${label}</button>`).join(" ");
    return `
        <h3>Bienestar y descanso</h3>
        <p>El aislamiento, el confinamiento y el rendimiento conductual están entre los riesgos de mayor prioridad de la NASA en misiones largas.</p>
        <div class="window-data">
            <div>SUEÑO ACUMULADO (SIM): <strong>7.5 HORAS</strong></div>
            <div ${sevStyle(W.fat[1])}>NIVEL DE FATIGA: <strong>${W.fat[0]}</strong></div>
            <div ${sevStyle(W.stress[1])}>ESTRÉS PERCIBIDO (EST.): <strong>${W.stress[0]}</strong></div>
            <div ${sevStyle(W.scoreSev)}>PUNTAJE GLOBAL: <strong>${W.score} / 100</strong></div>
            <div>DÍAS EN CONFINAMIENTO: <strong>42</strong></div>
        </div>
        <h3 style="margin-top:14px">Autoinforme</h3>
        <p>¿Cómo te sientes ahora? Se registra en la bitácora.</p>
        <div class="tab-row">${moods}</div>
        <p class="module-note">* Estimación simulada a partir de fatiga, FC, CO₂, carga EVA y tu autoinforme. No es un diagnóstico.</p>`;
}

/* ---------- PERFIL ---------- */
function htmlProfile() {
    const anyAlert = Object.keys(METRIC_INFO).some(k => (D[k] || 0) > 0);
    const worst = Math.max(0, ...Object.keys(METRIC_INFO).map(k => D[k] || 0));
    return `
        <h3>Perfil del tripulante</h3>
        <div class="window-data">
            <div>IDENTIFICADOR: <strong>AST-001</strong></div>
            <div>ROL: <strong>COMANDANTE (SIM)</strong></div>
            <div>MISIÓN: <strong>SIMULACIÓN ARTEMIS · DÍA 042</strong></div>
            <div ${sevStyle(worst)}>ESTADO MÉDICO: <strong>${anyAlert ? "REVISIÓN REQUERIDA (SIM)" : "APTO PARA EVA (SIM)"}</strong></div>
        </div>
        <h3 style="margin-top:14px">Línea base personal</h3>
        <div class="window-data">
            <div>FC: <strong>${BASE.hr} BPM</strong></div>
            <div>PRESIÓN: <strong>${BASE.sys}/${BASE.dia} mmHg</strong></div>
            <div>SpO₂: <strong>${BASE.spo2} %</strong></div>
            <div>TEMPERATURA: <strong>${BASE.temp} °C</strong></div>
        </div>
        <p class="module-note">* Detectar cambios respecto a la línea base de cada persona es la idea central del autocontrol de salud.</p>`;
}

/* ---------- AJUSTES ---------- */
function htmlSettings() {
    const sw = (id, label, on) =>
        `<label class="toggle-row"><span>${label}</span><input type="checkbox" class="hw-switch" data-fx="${id}" ${on ? "checked" : ""}></label>`;
    return `
        <h3>Ajustes de consola</h3>
        <div class="window-data">
            <div>VERSIÓN HARDWARE: <strong>v1.3.0-WINAMP</strong></div>
            <div>ENTORNO: <strong>SIMULACIÓN VIRTUAL</strong></div>
            <div>FRECUENCIA TRAMA ECG: <strong>250 Hz (SIM)</strong></div>
            <div>ESCENARIO ACTIVO: <strong>${SCENARIOS[state.scenario].label}</strong></div>
        </div>
        <h3 style="margin-top:14px">Efectos de pantalla</h3>
        ${sw("scan", "Líneas de escaneo", ui.fx.scan)}
        ${sw("glow", "Resplandor neón", ui.fx.glow)}
        ${sw("flicker", "Parpadeo CRT", ui.fx.flicker)}
        <p class="module-note">* Desactiva los efectos si afectan la lectura o la comodidad visual.</p>`;
}

const MODULES = {
    monitoring: { title: "CENTRO DE MONITOREO BIOMÉTRICO", html: htmlMonitoring, live: true },
    history:    { title: "HISTORIAL Y LÍNEA BASE",         html: htmlHistory,    live: false },
    alerts:     { title: "ALERTAS Y BITÁCORA",             html: htmlAlerts,     live: true },
    wellbeing:  { title: "BIENESTAR Y DESCANSO",           html: htmlWellbeing,  live: true },
    profile:    { title: "PERFIL DEL TRIPULANTE",          html: htmlProfile,    live: true },
    settings:   { title: "CONFIGURACIÓN DEL SISTEMA",      html: htmlSettings,   live: false }
};
