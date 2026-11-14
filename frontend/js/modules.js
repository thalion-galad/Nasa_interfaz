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
    fx: { scan: true, glow: true, flicker: false },
    alerts: {
        enabled: true,
        sound: true,
        priority: "alta",           // critica | alta | todas
        methods: { screen: true, log: true, haptic: false, earth: true }
    },
    mission: {
        name: "ARTEMIS-SIM",
        id: "AST-MSN-042",
        duration: "180",
        sync: "auto",               // auto | manual | earth
        link: "nominal"             // nominal | reducido | contingencia
    }
};

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sevColor = sev => ["var(--green-glow)", "var(--amber-glow)", "var(--red-glow)"][sev] || "var(--green-glow)";
const sevStyle = sev => `style="--c:${sevColor(sev)}"`;
const segVal = (value, unit = "", cls = "") =>
    `<span class="seg-readout"><span class="seg ${cls}">${value}</span>${unit ? `<span class="seg-unit">${unit}</span>` : ""}</span>`;
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
    const current = data[data.length - 1];
    const curSev = M.sev(current);
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

    const stats = [["MÍNIMO", min], ["PROMEDIO", avg], ["MÁXIMO", max], ["ACTUAL", current]]
        .map(([label, v], i) => `
            <div class="stat-card" ${i === 3 ? sevStyle(curSev) : ""}>
                <span class="stat-label">${label}</span>
                ${segVal(f(v), M.unit, "seg-sm")}
            </div>`).join("");

    const delta = current - avg;
    const stable = Math.abs(delta) < M.spread * 0.2;
    const trendLabel = stable ? "TENDENCIA ESTABLE" : delta > 0 ? "TENDENCIA AL ALZA" : "TENDENCIA A LA BAJA";
    const trendText = stable
        ? `La lectura actual se mantiene cerca del promedio del periodo (${f(avg)} ${M.unit}).`
        : `La lectura actual está ${Math.abs(delta).toFixed(M.dec)} ${M.unit} ${delta > 0 ? "por encima" : "por debajo"} del promedio del periodo.`;

    return `
        <div class="module-head">
            <div>
                <span class="module-kicker">02 / HISTORIAL</span>
                <h3>Historial y línea base</h3>
            </div>
            <span class="badge-status" ${sevStyle(curSev)}>${SEV_LABEL[curSev]}</span>
        </div>
        <p class="module-intro">Evolución de tus parámetros durante el periodo seleccionado. La línea punteada marca tu referencia personal.</p>

        <div class="module-section-title"><span>RANGO TEMPORAL</span><span>${HIST_RANGES[ui.histRange].label}</span></div>
        <div class="tab-row" role="group" aria-label="Rango temporal">${rangeTabs}</div>

        <div class="module-section-title"><span>PARÁMETRO</span><span>${data.length} MUESTRAS</span></div>
        <div class="tab-row" role="group" aria-label="Parámetro">${metricTabs}</div>

        <div class="stat-grid">${stats}</div>

        <div class="monitor-panel" style="padding:8px">
            <div class="monitor-header"><span>${M.label}</span><span class="blue-text">● BASE ${f(M.base)} ${M.unit}</span></div>
            <div class="hist-chart">${bars}<div class="hist-base" style="bottom:calc(${baseBottom.toFixed(1)}% * .945)"></div></div>
            <div class="chart-legend"><span><i></i> LECTURA ACTUAL</span><span><i class="lg-base"></i> LÍNEA BASE PERSONAL</span></div>
        </div>

        <div class="trend-note" ${sevStyle(curSev)}>
            <b>${trendLabel}</b>
            <span>${trendText}</span>
        </div>
        <p class="module-note">* Datos históricos simulados. El último punto (con borde blanco) es la lectura actual.</p>`;
}

/* ---------- MONITOREO ---------- */
function htmlMonitoring() {
    const groups = [
        ["SIGNOS VITALES", [
            ["hr", "FRECUENCIA CARDÍACA", "BPM", () => r0(state.hr)],
            ["bp", "PRESIÓN ARTERIAL", "mmHg", () => `${r0(state.sys)}/${r0(state.dia)}`],
            ["spo2", "SATURACIÓN SpO₂", "%", () => r1(state.spo2).toFixed(1)],
            ["temp", "TEMPERATURA CORPORAL", "°C", () => r1(state.temp).toFixed(1)]
        ]],
        ["RESPIRACIÓN Y ENTORNO", [
            ["rr", "FRECUENCIA RESPIRATORIA", "rpm", () => r0(state.rr)],
            ["co2", "ppCO₂ AMBIENTE", "mmHg", () => r1(state.co2).toFixed(1)],
            ["dose", "TASA DE DOSIS", "µSv/h", () => r0(state.dose)]
        ]],
        ["RECUPERACIÓN", [
            ["hyd", "HIDRATACIÓN", "%", () => r0(state.hyd)],
            ["fat", "FATIGA ACUMULADA", "/100", () => r0(state.fat)],
            ["cm", "CONTRAMEDIDAS", "%", () => r0(state.cm)]
        ]]
    ];

    const worst = Math.max(0, ...Object.keys(METRIC_INFO).map(k => D[k] || 0));
    const body = groups.map(([title, rows]) => `
        <div class="module-section-title"><span>${title}</span><span>TIEMPO REAL</span></div>
        <div class="metric-list">
            ${rows.map(([k, label, unit, val]) => `
                <div class="metric-line" ${sevStyle(D[k] || 0)}>
                    <div class="ml-label">
                        <b>${label}</b>
                        <small>${SEV_LABEL[D[k] || 0]} · HARDWARE VIRTUAL</small>
                    </div>
                    <div class="ml-value">${segVal(val(), unit)}</div>
                </div>`).join("")}
        </div>`).join("");

    return `
        <div class="module-head">
            <div>
                <span class="module-kicker">01 / MONITOREO</span>
                <h3>Monitoreo en tiempo real</h3>
            </div>
            <span class="badge-status" ${sevStyle(worst)}>${SEV_LABEL[worst]}</span>
        </div>
        <p class="module-intro">Indicadores fisiológicos y ambientales del tripulante AST-001. El color indica el estado: verde nominal, ámbar precaución y rojo alerta.</p>
        ${body}
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
    const worst = active.length ? Math.max(...active.map(k => D[k])) : 0;
    return `
        <div class="module-head">
            <div>
                <span class="module-kicker">03 / ALERTAS</span>
                <h3>Alertas y bitácora</h3>
            </div>
            <span class="badge-status" ${sevStyle(worst)}>${active.length ? `${active.length} ACTIVA${active.length > 1 ? "S" : ""}` : "SIN ALERTAS"}</span>
        </div>
        ${ui.alerts.enabled ? "" : `<div class="settings-status" ${sevStyle(1)}><span class="status-dot"></span><span>Notificaciones <b>SUSPENDIDAS</b> desde Ajustes. Las alertas se siguen calculando y registrando en la bitácora.</span></div>`}
        <div class="module-section-title"><span>ALERTAS ACTIVAS</span><span>${active.length}</span></div>
        ${cards}
        <div class="module-section-title"><span>BITÁCORA</span><span>ÚLTIMOS 14 EVENTOS</span></div>
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

    const exercise = Math.round(clamp(state.cm * 0.72 - state.evaLoad * 0.06, 0, 120));
    const sleep = clamp(8.4 - state.fat * 0.028 - Math.max(0, state.hr - 80) * 0.008, 4.5, 9);
    const water = clamp(1.4 + state.hyd / 100 * 1.6, 1.2, 3.4);
    const kcal = Math.round((1850 + state.cm * 4.2 - state.fat * 2.1) / 10) * 10;
    const mood = { good: ["BIEN", 0], ok: ["REGULAR", 1], bad: ["MAL", 2] }[ui.mood] || ["SIN REPORTE", 0];

    return {
        fat, stress, score, scoreSev: score >= 75 ? 0 : score >= 55 ? 1 : 2,
        exercise, exerciseSev: exercise >= 45 ? 0 : exercise >= 25 ? 1 : 2,
        sleep, sleepSev: sleep >= 7 ? 0 : sleep >= 6 ? 1 : 2,
        water, kcal, hydSev: RULES.hyd(r0(state.hyd)), mood
    };
}

function htmlWellbeing() {
    const W = wellbeingModel();
    const moods = [["good", "BIEN"], ["ok", "REGULAR"], ["bad", "MAL"]].map(([id, label]) =>
        `<button type="button" class="hw-btn" data-mood="${id}" aria-pressed="${ui.mood === id}">${label}</button>`).join(" ");
    const bar = (value, max) => Math.min(100, value / max * 100).toFixed(0);

    return `
        <div class="module-head">
            <div>
                <span class="module-kicker">04 / BIENESTAR</span>
                <h3>Bienestar y descanso</h3>
            </div>
            <span class="badge-status" ${sevStyle(W.scoreSev)}>${SEV_LABEL[W.scoreSev]}</span>
        </div>
        <p class="module-intro">El aislamiento y el confinamiento están entre los riesgos de mayor prioridad de la NASA en misiones largas. Revisa tus hábitos diarios de recuperación.</p>

        <div class="wb-score" ${sevStyle(W.scoreSev)}>
            ${segVal(W.score, "/ 100", "seg-lg")}
            <div class="wb-score-copy">
                <strong>ÍNDICE GLOBAL DE BIENESTAR</strong>
                <small>Estrés estimado: ${W.stress[0]} · Fatiga: ${W.fat[0]} · Día 042</small>
                <div class="seg-bar"><div class="seg-fill" style="width:${W.score}%"></div></div>
            </div>
        </div>

        <div class="module-section-title"><span>HÁBITOS Y RECUPERACIÓN</span><span>REGISTRO DIARIO</span></div>
        <div class="wb-list">

            <article class="wb-card" ${sevStyle(W.exerciseSev)}>
                <div class="wb-top">
                    <span class="wb-index">01</span>
                    <div class="wb-label"><b>ACTIVIDAD FÍSICA</b><small>Tiempo de ejercicio diario</small></div>
                    <div class="wb-value">${segVal(W.exercise, "MIN")}</div>
                </div>
                <div class="seg-bar"><div class="seg-fill" style="width:${bar(W.exercise, 60)}%"></div></div>
                <div class="wb-foot"><span>META: 60 MIN / DÍA</span><span>${Math.round(W.exercise / 60 * 100)}% CUMPLIDO</span></div>
            </article>

            <article class="wb-card" ${sevStyle(W.sleepSev)}>
                <div class="wb-top">
                    <span class="wb-index">02</span>
                    <div class="wb-label"><b>SUEÑO Y DESCANSO</b><small>Horas de sueño</small></div>
                    <div class="wb-value">${segVal(W.sleep.toFixed(1), "H")}</div>
                </div>
                <div class="seg-bar"><div class="seg-fill" style="width:${bar(W.sleep, 9)}%"></div></div>
                <div class="wb-foot"><span>META: 7 - 9 HORAS</span><span>${W.sleepSev === 0 ? "DESCANSO ADECUADO" : "DESCANSO INSUFICIENTE"}</span></div>
            </article>

            <article class="wb-card" ${sevStyle(W.hydSev)}>
                <div class="wb-top">
                    <span class="wb-index">03</span>
                    <div class="wb-label"><b>HIDRATACIÓN Y NUTRICIÓN</b><small>Consumo diario</small></div>
                    <div class="wb-value">${segVal(W.water.toFixed(1), "L")}</div>
                </div>
                <div class="seg-bar"><div class="seg-fill" style="width:${bar(W.water, 3.4)}%"></div></div>
                <div class="wb-foot"><span>AGUA · META 3.0 L</span><span>NUTRICIÓN: ${W.kcal.toLocaleString("es-PE")} KCAL</span></div>
            </article>

            <article class="wb-card" ${sevStyle(W.fat[1])}>
                <div class="wb-top">
                    <span class="wb-index">04</span>
                    <div class="wb-label"><b>FATIGA Y RECUPERACIÓN</b><small>Nivel de fatiga reportado</small></div>
                    <div class="wb-value">${segVal(r0(state.fat), "/100")}</div>
                </div>
                <div class="seg-bar"><div class="seg-fill" style="width:${r0(state.fat)}%"></div></div>
                <div class="wb-foot"><span>NIVEL: ${W.fat[0]}</span><span>RECUPERACIÓN ${state.fat > 70 ? "PRIORITARIA" : state.fat >= 40 ? "EN CURSO" : "ADECUADA"}</span></div>
            </article>

            <article class="wb-card" ${sevStyle(W.mood[1])}>
                <div class="wb-top">
                    <span class="wb-index">05</span>
                    <div class="wb-label"><b>BIENESTAR PSICOLÓGICO</b><small>Estado de ánimo reportado</small></div>
                    <div class="wb-value"><span class="wb-mood">${W.mood[0]}</span></div>
                </div>
                <div class="wb-moods" role="group" aria-label="Reportar estado de ánimo">${moods}</div>
                <div class="wb-foot"><span>ESTRÉS PERCIBIDO: ${W.stress[0]}</span><span>SE REGISTRA EN BITÁCORA</span></div>
            </article>

        </div>
        <p class="module-note">* Estimación simulada a partir de fatiga, FC, CO₂, carga EVA, hidratación y tu autoinforme. No es un diagnóstico.</p>`;
}

/* ---------- PERFIL ---------- */
function htmlProfile() {
    const anyAlert = Object.keys(METRIC_INFO).some(k => (D[k] || 0) > 0);
    const worst = Math.max(0, ...Object.keys(METRIC_INFO).map(k => D[k] || 0));
    const medicalStatus = anyAlert ? "REVISIÓN REQUERIDA (SIM)" : "APTO PARA EVA (SIM)";
    const restriction = anyAlert ? "REVISIÓN MÉDICA REQUERIDA (SIM)" : "SIN RESTRICCIONES EVA (SIM)";
    const missionName = esc(String(ui.mission.name).toUpperCase()) || "ARTEMIS-SIM";
    const missionDuration = Math.max(1, Math.min(3650, Math.round(Number(ui.mission.duration) || 180)));

    const section = (title, rows) => `
        <section class="info-section">
            <div class="info-section-head"><h4>${title}</h4></div>
            <dl class="info-list">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
        </section>`;

    return `
        <div class="profile-hero">
            <div class="profile-photo" role="img" aria-label="Fotografía simulada del tripulante">
                <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M20 25c0-8 5-14 12-14s12 6 12 14v7H20z" fill="rgba(0,255,102,.08)"/>
                    <rect x="24" y="22" width="16" height="10" rx="5" fill="rgba(0,225,255,.12)" stroke="#00e1ff" stroke-opacity=".6"/>
                    <path d="M14 60c1.7-11 9-17 18-17s16.3 6 18 17"/>
                    <path d="M25 45l7 6 7-6"/>
                    <path d="M32 12v-5M27 9h10"/>
                </svg>
                <span>FOTO SIM</span>
            </div>
            <div class="profile-id">
                <span class="module-kicker">05 / PERFIL · AST-001</span>
                <h3>ANDRÉS RÍOS VEGA</h3>
                <p>Comandante · ${missionName} · D042</p>
                <span class="badge-status" ${sevStyle(worst)}>${medicalStatus}</span>
            </div>
        </div>

        ${section("INFORMACIÓN PERSONAL", [
            ["Código de astronauta", "AST-001"],
            ["Nombres y apellidos", "ANDRÉS RÍOS VEGA"],
            ["Edad", "41 AÑOS"],
            ["Sexo", "MASCULINO"],
            ["Nacionalidad", "PERUANA"],
            ["Fotografía", "REGISTRADA · CREW-ART-001 (SIM)"],
            ["Identificador de tripulación", "CREW-ART-001"]
        ])}

        ${section("INFORMACIÓN DE MISIÓN", [
            ["Nombre de misión", missionName],
            ["Rol asignado", "COMANDANTE"],
            ["Fecha de inicio", "02 OCT 2026"],
            ["Duración prevista", `${missionDuration} DÍAS`],
            ["Día actual de misión", "D042"],
            ["Estado de participación", "ACTIVA"]
        ])}

        ${section("INFORMACIÓN MÉDICA", [
            ["Grupo sanguíneo", "O+"],
            ["Antecedentes médicos relevantes", "SIN ANTECEDENTES CARDIOPULMONARES (SIM)"],
            ["Alergias", "NINGUNA CONOCIDA (SIM)"],
            ["Medicamentos registrados", "NINGUNO (SIM)"],
            ["Restricciones médicas", restriction],
            ["Evaluaciones médicas previas", "3 EVALUACIONES · ÚLTIMA 10 NOV 2026"]
        ])}

        <p class="module-note">* Ficha y fotografía simuladas con fines educativos. No contienen datos médicos reales.</p>`;
}

/* ---------- AJUSTES ---------- */
const ALERT_PRIORITIES = {
    critica: { label: "CRÍTICA", detail: "Solo alertas rojas. Reduce la carga de avisos al mínimo." },
    alta:    { label: "ALTA",    detail: "Alertas rojas y ámbar. Recomendado durante operaciones EVA." },
    todas:   { label: "TODAS",   detail: "Incluye avisos nominales y cambios graduales de tendencia." }
};
const ALERT_METHODS = {
    screen: "PANTALLA",
    log:    "BITÁCORA",
    haptic: "VIBRACIÓN",
    earth:  "ENLACE TIERRA"
};
const SYNC_MODES = {
    auto:   { label: "AUTOMÁTICA · NTP", detail: "Sincroniza el reloj de misión con la referencia de la consola." },
    manual: { label: "MANUAL",           detail: "El reloj de misión se ajusta únicamente desde el panel local." },
    earth:  { label: "POR ENLACE TIERRA", detail: "Toma la hora de la estación de control en cada ventana de contacto." }
};
const LINK_MODES = {
    nominal:      { label: "ENLACE NOMINAL",   short: "NOMINAL",      sev: 0, state: "ESTABLE",      band: "BANDA X",  latency: "1.2 s",  window: "3 H",      detail: "Telemetría completa y voz bidireccional con el centro de control." },
    reducido:     { label: "ENLACE REDUCIDO",  short: "REDUCIDO",     sev: 1, state: "DEGRADADO",    band: "BANDA S",  latency: "6.5 s",  window: "45 MIN",   detail: "Solo telemetría esencial. La voz se reserva para contingencias." },
    contingencia: { label: "CONTINGENCIA",     short: "CONTINGENCIA", sev: 2, state: "EMERGENCIA",   band: "UHF",      latency: "VARIABLE", window: "BAJO DEMANDA", detail: "Canal de emergencia con voz y telemetría mínima. Requiere confirmación del CMO." }
};

function htmlSettings() {
    const fxToggle = (id, label, on) =>
        `<label class="toggle-row"><span>${label}</span><input type="checkbox" class="hw-switch" data-fx="${id}" ${on ? "checked" : ""}></label>`;
    const alertToggle = (id, label, on) =>
        `<label class="toggle-row"><span>${label}</span><input type="checkbox" class="hw-switch" data-alert="${id}" ${on ? "checked" : ""}></label>`;
    const priorityBtn = (key, info) =>
        `<button type="button" class="tab-btn ${ui.alerts.priority === key ? "is-on" : ""}" data-alert-priority="${key}" aria-pressed="${ui.alerts.priority === key}">${info.label}</button>`;
    const methodBtn = (key, label) => {
        const on = Boolean(ui.alerts.methods[key]);
        return `<button type="button" class="tab-btn ${on ? "is-on" : ""}" data-alert-method="${key}" aria-pressed="${on}">${label}</button>`;
    };
    const missionField = (key, label, value, type = "text", attrs = "") => `
        <label class="field-row">
            <span class="field-label">${label}</span>
            <input class="hw-input" type="${type}" data-mission="${key}" value="${esc(value)}" ${attrs}>
        </label>`;
    const linkBtn = (key, info) =>
        `<button type="button" class="tab-btn ${ui.mission.link === key ? "is-on" : ""}" data-mission-link="${key}" aria-pressed="${ui.mission.link === key}">${info.short}</button>`;

    const priority = ALERT_PRIORITIES[ui.alerts.priority] || ALERT_PRIORITIES.alta;
    const activeMethods = Object.keys(ALERT_METHODS).filter(k => ui.alerts.methods[k]).map(k => ALERT_METHODS[k]);
    const methodText = activeMethods.length ? activeMethods.join(" · ") : "NINGUNO";
    const alertSev = ui.alerts.enabled ? 0 : 1;
    const link = LINK_MODES[ui.mission.link] || LINK_MODES.nominal;
    const sync = SYNC_MODES[ui.mission.sync] || SYNC_MODES.auto;
    const duration = Math.max(1, Math.min(3650, Math.round(Number(ui.mission.duration) || 1)));

    const alertNote = ui.alerts.enabled
        ? `Prioridad <b>${priority.label}</b> · Métodos: <b>${methodText}</b>.`
        : `Notificaciones <b>SUSPENDIDAS</b>. La configuración se conserva y puede reactivarse en cualquier momento.`;
    const methodNote = activeMethods.length
        ? `Se notificará por: <b>${methodText}</b>.`
        : `Sin métodos activos: las alertas no se mostrarán ni registrarán.`;

    return `
        <div class="module-head">
            <div>
                <span class="module-kicker">06 / AJUSTES</span>
                <h3>Configuración del sistema</h3>
            </div>
            <span class="badge-status" ${sevStyle(0)}>LOCAL</span>
        </div>
        <p class="module-intro">Ajusta el comportamiento de las alertas y los parámetros operativos de la misión. Los cambios se aplican solo a esta consola simulada.</p>

        <div class="module-section-title"><span>CONFIGURACIÓN DE ALERTAS</span><span>${ui.alerts.enabled ? "ACTIVAS" : "SUSPENDIDAS"}</span></div>
        <div class="settings-panel">
            ${alertToggle("enabled", "Activar notificaciones", ui.alerts.enabled)}
            ${alertToggle("sound", "Sonidos de alerta", ui.alerts.sound)}
            <div class="settings-label">PRIORIDAD DE NOTIFICACIONES</div>
            <div class="tab-row" role="group" aria-label="Prioridad de notificaciones">
                ${Object.keys(ALERT_PRIORITIES).map(k => priorityBtn(k, ALERT_PRIORITIES[k])).join("")}
            </div>
            <p class="settings-hint">${priority.detail}</p>
            <div class="settings-label">MÉTODOS DE NOTIFICACIÓN</div>
            <div class="method-grid" role="group" aria-label="Métodos de notificación">
                ${Object.keys(ALERT_METHODS).map(k => methodBtn(k, ALERT_METHODS[k])).join("")}
            </div>
            <p class="settings-hint">${methodNote}</p>
            <div class="settings-status" ${sevStyle(alertSev)}>
                <span class="status-dot"></span>
                <span>${alertNote}</span>
            </div>
        </div>

        <div class="module-section-title"><span>CONFIGURACIÓN DE MISIÓN</span><span>D042 / ${duration} DÍAS</span></div>
        <div class="settings-panel">
            ${missionField("name", "NOMBRE DE MISIÓN", ui.mission.name, "text", 'autocomplete="off" spellcheck="false"')}
            ${missionField("id", "IDENTIFICADOR DE MISIÓN", ui.mission.id, "text", 'autocomplete="off" spellcheck="false"')}
            ${missionField("duration", "DURACIÓN PREVISTA (DÍAS)", ui.mission.duration, "number", 'min="1" max="3650" step="1"')}
            <label class="field-row">
                <span class="field-label">SINCRONIZACIÓN HORARIA</span>
                <select class="hw-select" data-mission="sync">
                    ${Object.keys(SYNC_MODES).map(k => `<option value="${k}" ${ui.mission.sync === k ? "selected" : ""}>${SYNC_MODES[k].label}</option>`).join("")}
                </select>
            </label>
            <p class="settings-hint">${sync.detail}</p>
            <div class="settings-readout">
                <span>DÍA ACTUAL / DURACIÓN</span>
                <span class="seg-readout"><span class="seg seg-sm">042</span><span class="seg-unit">/ <span data-duration-out>${String(duration).padStart(3, "0")}</span> D</span></span>
            </div>
        </div>

        <div class="module-section-title"><span>ENLACE CON LA TIERRA</span><span>${link.state}</span></div>
        <div class="tab-row" role="group" aria-label="Configuración del enlace con la Tierra">
            ${Object.keys(LINK_MODES).map(k => linkBtn(k, LINK_MODES[k])).join("")}
        </div>
        <div class="link-status" ${sevStyle(link.sev)}>
            <div class="link-status-head">
                <span class="status-dot"></span>
                <b>${link.label}</b>
                <span class="badge-status" ${sevStyle(link.sev)}>${link.state}</span>
            </div>
            <p>${link.detail}</p>
            <div class="link-meta"><span>${link.band}</span><span>LATENCIA ${link.latency}</span><span>VENTANA ${link.window}</span></div>
        </div>

        <div class="module-section-title"><span>EFECTOS DE PANTALLA</span><span>VISUAL</span></div>
        ${fxToggle("scan", "Líneas de escaneo", ui.fx.scan)}
        ${fxToggle("glow", "Resplandor neón", ui.fx.glow)}
        ${fxToggle("flicker", "Parpadeo CRT", ui.fx.flicker)}

        <div class="module-section-title"><span>SISTEMA</span><span>v1.3.0</span></div>
        <div class="window-data">
            <div>VERSIÓN HARDWARE: <strong>v1.3.0-WINAMP</strong></div>
            <div>ENTORNO: <strong>SIMULACIÓN VIRTUAL</strong></div>
            <div>FRECUENCIA TRAMA ECG: <strong>250 Hz (SIM)</strong></div>
            <div>ESCENARIO ACTIVO: <strong>${SCENARIOS[state.scenario].label}</strong></div>
        </div>
        <p class="module-note">* Configuración local de demostración. No se envían notificaciones ni datos reales.</p>`;
}

const MODULES = {
    monitoring: { title: "CENTRO DE MONITOREO BIOMÉTRICO", html: htmlMonitoring, live: true },
    history:    { title: "HISTORIAL Y LÍNEA BASE",         html: htmlHistory,    live: false },
    alerts:     { title: "ALERTAS Y BITÁCORA",             html: htmlAlerts,     live: true },
    wellbeing:  { title: "BIENESTAR Y DESCANSO",           html: htmlWellbeing,  live: true },
    profile:    { title: "PERFIL DEL TRIPULANTE",          html: htmlProfile,    live: true },
    settings:   { title: "CONFIGURACIÓN DEL SISTEMA",      html: htmlSettings,   live: false }
};
