/* =========================================================
   ASTRA HEALTH · MODELO (sin DOM)
   Estado único, simulación, reglas de severidad y zonas corporales.
   Severidad: 0 = nominal · 1 = precaución · 2 = alerta.
   TODOS los umbrales son de simulación (educativos, no clínicos).
   ========================================================= */
"use strict";

const SEV_LABEL = ["NOMINAL", "PRECAUCIÓN", "ALERTA"];
const SEV_KEY = ["ok", "warn", "alert"];

/* ---------- 1. ESTADO ÚNICO ---------- */
const BASE = { hr: 72, sys: 118, dia: 78, spo2: 98.5, temp: 36.7, rr: 15, co2: 2.2, hyd: 88, fat: 18, cm: 86, dose: 22 };
const state = Object.assign({}, BASE, { evaLoad: 0, scenario: "normal" });

const NOISE = { hr: 1.6, sys: 1.6, dia: 1.2, spo2: 0.15, temp: 0.03, rr: 0.5, co2: 0.05, hyd: 0.2, fat: 0.3, cm: 0.2, dose: 0.8 };
const LIMITS = {
    hr: [35, 190], sys: [70, 200], dia: [40, 120], spo2: [70, 100], temp: [33, 42],
    rr: [4, 40], co2: [0, 10], hyd: [0, 100], fat: [0, 100], cm: [0, 100], dose: [0, 1000]
};

/* ---------- 2. ESCENARIOS (inyectables desde el panel de control) ---------- */
const SCENARIOS = {
    normal:      { label: "NORMAL",            apply() {} },
    hypoxia:     { label: "HIPOXIA",           apply(t) { t.spo2 = 86.5; t.hr += 26; t.rr += 9; } },
    tachy:       { label: "TAQUICARDIA",       apply(t) { t.hr = Math.max(t.hr, 134); t.sys += 22; t.dia += 10; t.rr += 4; } },
    dehydration: { label: "DESHIDRATACIÓN",    apply(t) { t.hyd = 50; t.temp += 0.6; t.hr += 18; t.sys -= 14; } },
    co2:         { label: "CO₂ ALTO",          apply(t) { t.co2 = 6.2; t.rr += 8; t.spo2 -= 1.5; t.hr += 10; } },
    fever:       { label: "HIPERTERMIA",       apply(t) { t.temp = 39.1; t.hr += 25; t.rr += 5; t.hyd -= 12; } },
    fatigue:     { label: "FATIGA / HUESO",    apply(t) { t.fat = 88; t.cm = 58; t.hr += 10; t.hyd -= 8; } },
    radiation:   { label: "RADIACIÓN (SPE)",   apply(t) { t.dose = 420; } }
};

function computeTargets() {
    const L = state.evaLoad / 100;
    const t = Object.assign({}, BASE);
    t.hr += 45 * L;  t.rr += 10 * L;  t.temp += 0.6 * L;  t.sys += 18 * L;  t.dia += 6 * L;
    t.hyd -= 14 * L; t.fat += 45 * L; t.co2 += 0.6 * L;   t.spo2 -= 0.8 * L;
    (SCENARIOS[state.scenario] || SCENARIOS.normal).apply(t);
    return t;
}

function stepState() {
    const t = computeTargets();
    Object.keys(NOISE).forEach(k => {
        const noise = k === "dose" ? NOISE.dose + state.dose * 0.02 : NOISE[k];
        let v = state[k] + (t[k] - state[k]) * 0.2 + (Math.random() - 0.5) * noise;
        v = Math.max(LIMITS[k][0], Math.min(LIMITS[k][1], v));
        state[k] = v;
    });
}

/* ---------- 3. REGLAS DE SEVERIDAD ---------- */
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
    return {
        hr: RULES.hr(r0(state.hr)),
        bp: RULES.bp(r0(state.sys), r0(state.dia)),
        spo2: RULES.spo2(r1(state.spo2)),
        temp: RULES.temp(r1(state.temp)),
        rr: RULES.rr(r0(state.rr)),
        co2: RULES.co2(r1(state.co2)),
        hyd: RULES.hyd(r0(state.hyd)),
        fat: RULES.fat(r0(state.fat)),
        cm: RULES.cm(r0(state.cm)),
        dose: RULES.dose(r0(state.dose))
    };
}

/* ---------- 4. DESCRIPCIÓN DE MÉTRICAS (valor, causa probable, acción) ---------- */
const METRIC_INFO = {
    hr: {
        label: "FREC. CARDÍACA", fmt: () => `${r0(state.hr)} BPM`,
        cause: () => state.hr > 100 ? "Taquicardia: esfuerzo EVA, estrés térmico, deshidratación o hipoxia." : "Frecuencia baja inusual: revisar contacto del sensor y fatiga extrema.",
        action: () => state.hr > 100 ? "Reducir carga de trabajo, hidratar y verificar temperatura y SpO₂; repetir lectura en 5 min." : "Verificar el parche del sensor; si persiste, notificar al oficial médico (CMO)."
    },
    bp: {
        label: "PRESIÓN ARTERIAL", fmt: () => `${r0(state.sys)}/${r0(state.dia)} mmHg`,
        cause: () => state.sys < 100 ? "Presión baja: posible deshidratación o desplazamiento de fluidos." : "Presión elevada: sobreesfuerzo, deshidratación, estrés o cambios de fluidos en microgravedad.",
        action: () => state.sys < 100 ? "Hidratar, descansar sentado/anclado y volver a medir." : "Pausar la actividad intensa, respirar con calma y volver a medir en 10 min."
    },
    spo2: {
        label: "SpO₂", fmt: () => `${r1(state.spo2).toFixed(1)} %`,
        cause: () => "Saturación baja: posible hipoxia leve (revisar presión/composición de O₂ y sellado del casco).",
        action: () => "Detener esfuerzo, verificar suministro de O₂ y ajuste del casco; notificar al CMO si no sube."
    },
    temp: {
        label: "TEMPERATURA", fmt: () => `${r1(state.temp).toFixed(1)} °C`,
        cause: () => state.temp < 36 ? "Temperatura baja: pérdida de calor del traje o sensor mal colocado." : "Temperatura alta: estrés térmico (sistema de enfriamiento del traje) o posible respuesta inmunitaria/infecciosa.",
        action: () => state.temp < 36 ? "Revisar aislamiento y calefacción del traje; reabrigar." : "Revisar enfriamiento del traje, hidratar y repetir lectura; si persiste, notificar al CMO."
    },
    rr: {
        label: "FREC. RESPIRATORIA", fmt: () => `${r0(state.rr)} rpm`,
        cause: () => "Respiración fuera de rango: asociada a esfuerzo, CO₂ elevado o hipoxia.",
        action: () => "Reducir esfuerzo y verificar ppCO₂ y SpO₂ del ambiente."
    },
    co2: {
        label: "ppCO₂", fmt: () => `${r1(state.co2).toFixed(1)} mmHg`,
        cause: () => "CO₂ ambiental elevado: posible falla o saturación del depurador / mala ventilación.",
        action: () => "Verificar depuradores de CO₂ y flujo de aire, reducir esfuerzo y notificar a Control de Misión."
    },
    hyd: {
        label: "HIDRATACIÓN", fmt: () => `${r0(state.hyd)} %`,
        cause: () => "Hidratación insuficiente: ingesta de agua por debajo del protocolo.",
        action: () => "Beber según protocolo, revisar la bolsa de agua del traje y registrar la ingesta."
    },
    fat: {
        label: "FATIGA", fmt: () => `${r0(state.fat)}/100`,
        cause: () => "Fatiga acumulada: carga EVA alta, descanso insuficiente o confinamiento prolongado.",
        action: () => "Reducir carga, programar descanso y ajustar el plan de tareas."
    },
    cm: {
        label: "CONTRAMEDIDAS", fmt: () => `${r0(state.cm)} %`,
        cause: () => "Cumplimiento bajo de ejercicio resistivo: riesgo de pérdida ósea y muscular a largo plazo.",
        action: () => "Reprogramar la sesión de ejercicio y registrar su cumplimiento."
    },
    dose: {
        label: "TASA DE DOSIS", fmt: () => `${r0(state.dose)} µSv/h`,
        cause: () => "Tasa de dosis elevada: posible evento de partículas solares (SPE).",
        action: () => "Buscar la zona de mayor blindaje, limitar actividad externa y notificar a Control de Misión."
    }
};

/* ---------- 5. ZONAS CORPORALES (riesgos NASA de referencia) ---------- */
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
