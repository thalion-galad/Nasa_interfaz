/* =========================================================
   ASTRA HEALTH · MODELO (sin DOM)
   Estado único que se RELLENA desde la API (REST + WebSocket).
   Aquí no se generan datos: solo se evalúa la severidad para
   colorear la interfaz y se describen métricas y zonas.
   Severidad: 0 = nominal · 1 = precaución · 2 = alerta.
   TODOS los umbrales son de simulación (educativos, no clínicos).
   ========================================================= */
"use strict";

const SEV_LABEL = ["NOMINAL", "PRECAUCIÓN", "ALERTA"];
const SEV_KEY = ["ok", "warn", "alert"];

/* ---------- 1. ESTADO ÚNICO (vacío hasta la primera lectura) ---------- */
const state = {
    ready: false,
    measurementId: null,
    astronautId: null,
    timestamp: null,
    source: null,
    scenario: null,
    evaLoad: null,

    hr: null,
    sys: null,
    dia: null,
    spo2: null,
    temp: null,
    rr: null,
    co2: null,
    hyd: null,
    fat: null,
    cm: null,
    dose: null
};

const isNum = v => typeof v === "number" && Number.isFinite(v);

/* SQLite puede devolver fechas sin zona horaria: se interpretan como UTC. */
function parseTs(value) {
    if (!value) return null;
    const text = String(value);
    const iso = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(text) ? text : `${text}Z`;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
}

/* ---------- 2. REGLAS DE SEVERIDAD ---------- */
const RULES = {
    hr:   v => (v < 50 || v > 120) ? 2 : (v < 60 || v > 100) ? 1 : 0,
    bp:   (s, d) => (s >= 140 || d >= 90 || s < 90) ? 2 : (s >= 130 || d >= 85 || s < 100) ? 1 : 0,
    spo2: v => v < 90 ? 2 : v < 95 ? 1 : 0,
    temp: v => (v >= 38.5 || v < 35) ? 2 : (v >= 37.6 || v < 36) ? 1 : 0,
    rr:   v => (v > 25 || v < 9) ? 2 : (v > 20 || v < 12) ? 1 : 0,
    co2:  v => v > 5 ? 2 : v >= 3 ? 1 : 0,
    hyd:  v => v < 60 ? 2 : v < 75 ? 1 : 0,
    fat:  v => v > 70 ? 2 : v >= 40 ? 1 : 0,
    cm:   v => v < 50 ? 2 : v < 75 ? 1 : 0,
    dose: v => v > 150 ? 2 : v >= 60 ? 1 : 0
};

const r0 = v => Math.round(v);
const r1 = v => Math.round(v * 10) / 10;

/* Evalúa con los valores tal como se muestran (redondeados). */
function evaluate() {
    const s = state;

    return {
        hr: isNum(s.hr) ? RULES.hr(r0(s.hr)) : 0,
        bp: isNum(s.sys) && isNum(s.dia) ? RULES.bp(r0(s.sys), r0(s.dia)) : 0,
        spo2: isNum(s.spo2) ? RULES.spo2(r1(s.spo2)) : 0,
        temp: isNum(s.temp) ? RULES.temp(r1(s.temp)) : 0,
        rr: isNum(s.rr) ? RULES.rr(r0(s.rr)) : 0,
        co2: isNum(s.co2) ? RULES.co2(r1(s.co2)) : 0,
        hyd: isNum(s.hyd) ? RULES.hyd(r0(s.hyd)) : 0,
        fat: isNum(s.fat) ? RULES.fat(r0(s.fat)) : 0,
        cm: isNum(s.cm) ? RULES.cm(r0(s.cm)) : 0,
        dose: isNum(s.dose) ? RULES.dose(r0(s.dose)) : 0
    };
}

/* ---------- 3. DESCRIPCIÓN DE MÉTRICAS (valor, causa probable, acción) ---------- */
const METRIC_INFO = {
    hr: {
        label: "FREC. CARDÍACA",
        fmt: () => isNum(state.hr) ? `${r0(state.hr)} BPM` : "—",
        cause: () => state.hr > 100 ? "Taquicardia: esfuerzo EVA, estrés térmico, deshidratación o hipoxia." : "Frecuencia baja inusual: revisar contacto del sensor y fatiga extrema.",
        action: () => state.hr > 100 ? "Reducir carga de trabajo, hidratar y verificar temperatura y SpO₂; repetir lectura en 5 min." : "Verificar el parche del sensor; si persiste, notificar al oficial médico (CMO)."
    },
    bp: {
        label: "PRESIÓN ARTERIAL",
        fmt: () => isNum(state.sys) && isNum(state.dia) ? `${r0(state.sys)}/${r0(state.dia)} mmHg` : "—",
        cause: () => state.sys < 100 ? "Presión baja: posible deshidratación o desplazamiento de fluidos." : "Presión elevada: sobreesfuerzo, deshidratación, estrés o cambios de fluidos en microgravedad.",
        action: () => state.sys < 100 ? "Hidratar, descansar sentado/anclado y volver a medir." : "Pausar la actividad intensa, respirar con calma y volver a medir en 10 min."
    },
    spo2: {
        label: "SpO₂",
        fmt: () => isNum(state.spo2) ? `${r1(state.spo2).toFixed(1)} %` : "—",
        cause: () => "Saturación baja: posible hipoxia leve (revisar presión/composición de O₂ y sellado del casco).",
        action: () => "Detener esfuerzo, verificar suministro de O₂ y ajuste del casco; notificar al CMO si no sube."
    },
    temp: {
        label: "TEMPERATURA",
        fmt: () => isNum(state.temp) ? `${r1(state.temp).toFixed(1)} °C` : "—",
        cause: () => state.temp < 36 ? "Temperatura baja: pérdida de calor del traje o sensor mal colocado." : "Temperatura alta: estrés térmico (sistema de enfriamiento del traje) o posible respuesta inmunitaria/infecciosa.",
        action: () => state.temp < 36 ? "Revisar aislamiento y calefacción del traje; reabrigar." : "Revisar enfriamiento del traje, hidratar y repetir lectura; si persiste, notificar al CMO."
    },
    rr: {
        label: "FREC. RESPIRATORIA",
        fmt: () => isNum(state.rr) ? `${r0(state.rr)} rpm` : "—",
        cause: () => "Respiración fuera de rango: asociada a esfuerzo, CO₂ elevado o hipoxia.",
        action: () => "Reducir esfuerzo y verificar ppCO₂ y SpO₂ del ambiente."
    },
    co2: {
        label: "ppCO₂",
        fmt: () => isNum(state.co2) ? `${r1(state.co2).toFixed(1)} mmHg` : "—",
        cause: () => "CO₂ ambiental elevado: posible falla o saturación del depurador / mala ventilación.",
        action: () => "Verificar depuradores de CO₂ y flujo de aire, reducir esfuerzo y notificar a Control de Misión."
    },
    hyd: {
        label: "HIDRATACIÓN",
        fmt: () => isNum(state.hyd) ? `${r0(state.hyd)} %` : "—",
        cause: () => "Hidratación insuficiente: ingesta de agua por debajo del protocolo.",
        action: () => "Beber según protocolo, revisar la bolsa de agua del traje y registrar la ingesta."
    },
    fat: {
        label: "FATIGA",
        fmt: () => isNum(state.fat) ? `${r0(state.fat)}/100` : "—",
        cause: () => "Fatiga acumulada: carga EVA alta, descanso insuficiente o confinamiento prolongado.",
        action: () => "Reducir carga, programar descanso y ajustar el plan de tareas."
    },
    cm: {
        label: "CONTRAMEDIDAS",
        fmt: () => isNum(state.cm) ? `${r0(state.cm)} %` : "—",
        cause: () => "Cumplimiento bajo de ejercicio resistivo: riesgo de pérdida ósea y muscular a largo plazo.",
        action: () => "Reprogramar la sesión de ejercicio y registrar su cumplimiento."
    },
    dose: {
        label: "TASA DE DOSIS",
        fmt: () => isNum(state.dose) ? `${r0(state.dose)} µSv/h` : "—",
        cause: () => "Tasa de dosis elevada: posible evento de partículas solares (SPE).",
        action: () => "Buscar la zona de mayor blindaje, limitar actividad externa y notificar a Control de Misión."
    }
};

/* ---------- 4. ZONAS CORPORALES (riesgos NASA de referencia) ---------- */
const ZONES = {
    head: {
        code: "01", name: "CABEZA / OJOS", metrics: ["co2", "spo2", "bp"],
        nasa: "SANS: el ojo y el cerebro pueden cambiar en vuelo por el desplazamiento de fluidos. También CO₂ elevado y estrés por aislamiento (salud mental y rendimiento)."
    },
    lungs: {
        code: "02", name: "PULMONES", metrics: ["spo2", "rr", "co2"],
        nasa: "Entorno cerrado: calidad del aire, CO₂ y umbrales seguros de oxígeno; la hipoxia leve es un riesgo que NASA estudia."
    },
    heart: {
        code: "03", name: "CORAZÓN", metrics: ["hr", "bp"],
        nasa: "Riesgo cardiovascular en misiones largas: adaptación a gravedad alterada, radiación y esfuerzo durante EVA."
    },
    abdomen: {
        code: "04", name: "ABDOMEN / CORE", metrics: ["hyd", "temp"],
        nasa: "Nutrición y balance de fluidos, termorregulación y respuestas del sistema inmunitario alteradas por el estrés del vuelo."
    },
    arms: {
        code: "05", name: "BRAZOS Y MANOS", metrics: ["fat", "hyd"],
        nasa: "Esfuerzo en EVA, carga del traje y fatiga muscular de miembros superiores."
    },
    spine: {
        code: "06", name: "COLUMNA Y CADERA", metrics: ["cm", "fat"],
        nasa: "Gravedad alterada: pérdida ósea y cambios en la columna; el ejercicio resistivo es la contramedida principal."
    },
    legs: {
        code: "07", name: "PIERNAS", metrics: ["cm", "fat"],
        nasa: "Atrofia muscular y desplazamiento de fluidos con gravedad alterada; las contramedidas de ejercicio son clave."
    }
};

const RADIATION_NASA = "Radiación espacial: riesgo de alta prioridad para NASA (efectos a largo plazo como cáncer, enfermedad cardiovascular y cambios cognitivos).";

/* Calcula severidad, causa y acción de cada zona a partir de S = evaluate(). */
function computeZones(S) {
    const out = {};
    const radFloor = S.dose === 2;
    Object.keys(ZONES).forEach(id => {
        const z = ZONES[id];
        const items = z.metrics.map(k => ({ k, sev: S[k] }));
        let sev = Math.max(...items.map(i => i.sev));
        let primary = items.slice().sort((a, b) => b.sev - a.sev)[0].k;
        let viaRadiation = false;
        if (radFloor && sev < 1) { sev = 1; primary = "dose"; viaRadiation = true; }
        out[id] = { id, sev, items, primary: sev > 0 ? primary : null, viaRadiation };
    });
    return out;
}

/* Zona de mayor severidad (para el modo AUTO del escáner). */
function worstZone(zones) {
    let best = null;
    Object.keys(zones).forEach(id => { if (zones[id].sev > 0 && (!best || zones[id].sev > best.sev)) best = zones[id]; });
    return best;
}
