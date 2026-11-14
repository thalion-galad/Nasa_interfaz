/* =========================================================
   ASTRA HEALTH · APLICACIÓN
   Un único estado (model.js) -> render() actualiza toda la UI.
   Depende de: model.js, canvas.js, modules.js (y backend.js para telemetría/API)
   ========================================================= */
"use strict";

// Conexión inicial de telemetría (el botón de bitácora se maneja más abajo, en un único listener)
document.addEventListener("DOMContentLoaded", () => {
    if (typeof backend !== "undefined") backend.connectTelemetry();
});

(() => {
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    const consoleEl = $("#console");
    const workspace = $("#console-workspace");
    const drawer = $("#module-drawer");
    const drawerTitle = $("#drawer-title");
    const drawerContent = $("#drawer-content");
    const closeBtn = $("#close-drawer");
    const moduleButtons = $$(".module-button");
    const standby = $("#standby");
    const ticker = $(".ticker");
    const tickerTrack = $("#ticker-track");
    const cards = {};
    $$("[data-metric]").forEach(n => { cards[n.dataset.metric] = n; });

    let powered = true;
    let shaded = false;
    let lastUpdate = Date.now();
    const bootTime = Date.now();

    /* ---------- 1. SEVERIDAD CON LATCH (sube al instante, baja tras 2 lecturas) ---------- */
    const pending = {};
    function latchSeverity(S) {
        Object.keys(S).forEach(k => {
            if (D[k] === undefined) { D[k] = S[k]; pending[k] = 0; return; }
            if (S[k] >= D[k]) { D[k] = S[k]; pending[k] = 0; return; }
            pending[k] = (pending[k] || 0) + 1;
            if (pending[k] >= 2) { D[k] = S[k]; pending[k] = 0; }
        });
    }

    const logged = {};
    function trackAlerts() {
        Object.keys(METRIC_INFO).forEach(k => {
            const prev = logged[k] || 0;
            if (D[k] === prev) return;
            const info = METRIC_INFO[k];
            if (D[k] > prev) logEvent(D[k], `${info.label} ${info.fmt()} → ${SEV_LABEL[D[k]]}`);
            else if (D[k] === 0) logEvent(0, `${info.label} vuelve a NOMINAL`);
            else logEvent(D[k], `${info.label} baja a ${SEV_LABEL[D[k]]}`);
            logged[k] = D[k];
        });
    }

    /* ---------- 2. TARJETAS DE MÉTRICAS ---------- */
    const CARD_DEF = {
        spo2: { val: () => r1(state.spo2).toFixed(1), bar: () => pct(state.spo2, 80, 100) },
        temp: { val: () => r1(state.temp).toFixed(1), bar: () => pct(state.temp, 34, 41) },
        rr:   { val: () => String(r0(state.rr)),      bar: () => pct(state.rr, 0, 40) },
        co2:  { val: () => r1(state.co2).toFixed(1),  bar: () => pct(state.co2, 0, 8) },
        hyd:  { val: () => String(r0(state.hyd)),     bar: () => state.hyd },
        dose: { val: () => String(r0(state.dose)),    bar: () => pct(state.dose, 0, 500) }
    };

    function setSev(node, sev) {
        node.dataset.status = SEV_KEY[sev];
        const badge = $("[data-badge]", node);
        if (badge) badge.textContent = SEV_LABEL[sev];
    }

    // Los dígitos fantasma deben tener la misma longitud y separadores que el valor visible.
    function syncLcdGhosts() {
        $$(".lcd").forEach(lcd => {
            const val = $(".lcd-val", lcd);
            const ghost = $(".lcd-ghost", lcd);
            if (!val || !ghost || !val.textContent) return;
            ghost.textContent = val.textContent.trim().replace(/\d/g, "8");
        });
    }

    const hrHist = [];
    const sysHist = [];
    const sparkBars = [];
    for (let i = 0; i < 12; i++) sysHist.push(state.sys);   // evita barras vacías al inicio
    (function buildSparkline() {
        const box = $("#bp-spark");
        for (let i = 0; i < 12; i++) { const s = document.createElement("span"); box.appendChild(s); sparkBars.push(s); }
    })();

    function renderMetrics() {
        // Frecuencia cardíaca + medidor segmentado
        const hrValEl = $("#hr-value");
        if (hrValEl) hrValEl.textContent = r0(state.hr);
        const frac = clamp((state.hr - 40) / 100, 0, 1);
        const hrGaugeEl = $("#hr-gauge-circle");
        if (hrGaugeEl) hrGaugeEl.style.strokeDashoffset = String(100 - frac * 100);
        setSev(cards.hr, D.hr);

        hrHist.push(state.hr); if (hrHist.length > 1800) hrHist.shift();
        const avg = hrHist.reduce((a, b) => a + b, 0) / hrHist.length;
        $("#hr-avg").textContent = `PROMEDIO SESIÓN: ${r0(avg)} BPM`;

        // Presión arterial + tendencia
        $("#bp-sys").textContent = r0(state.sys);
        $("#bp-dia").textContent = r0(state.dia);
        setSev(cards.bp, D.bp);
        sysHist.push(state.sys); if (sysHist.length > 12) sysHist.shift();
        sparkBars.forEach((s, i) => {
            const v = sysHist[i - (12 - sysHist.length)];
            s.style.height = v === undefined ? "0%" : Math.max(8, pct(v, 90, 160)) + "%";
        });

        // Resto de tarjetas
        Object.keys(CARD_DEF).forEach(k => {
            const c = cards[k];
            $("[data-lcd]", c).textContent = CARD_DEF[k].val();
            $("[data-bar]", c).style.width = CARD_DEF[k].bar().toFixed(1) + "%";
            setSev(c, D[k]);
        });

        // Etiqueta del ECG
        const ecgState = $("#ecg-state");
        if (D.hr === 0) { ecgState.textContent = "● SEÑAL ESTABLE"; ecgState.className = "green-text"; }
        else {
            ecgState.textContent = state.hr > 100 ? "● FREC. ELEVADA" : "● FREC. BAJA";
            ecgState.className = D.hr === 2 ? "red-text" : "amber-text";
        }

        syncLcdGhosts();
    }

    /* ---------- 3. ESTADO GLOBAL, ALERTAS Y TICKER ---------- */
    let tickerKey = "";
    function renderGlobal() {
        const keys = Object.keys(METRIC_INFO);
        const active = keys.filter(k => D[k] > 0);
        const maxSev = Math.max(0, ...keys.map(k => D[k]));
        const g = $("#global-status");
        if (maxSev === 0) { g.textContent = "● VITALES NOMINALES"; g.className = "green-text"; }
        else if (maxSev === 1) { g.textContent = `▲ PRECAUCIÓN · ${active.length} PARÁM.`; g.className = "amber-text"; }
        else { g.textContent = `■ ALERTA · ${active.length} PARÁM.`; g.className = "red-text"; }

        const badge = $("#alert-count");
        badge.hidden = active.length === 0;
        badge.textContent = active.length;
        badge.classList.toggle("is-alert", maxSev === 2);

        const key = active.map(k => k + ":" + D[k]).join(",");
        if (key !== tickerKey) {
            tickerKey = key;
            const head = active.length
                ? active.map(k => `${METRIC_INFO[k].label} ${METRIC_INFO[k].fmt()} [${SEV_LABEL[D[k]]}]`).join(" *** ")
                : "AST-001 · VITALES NOMINALES";
            tickerTrack.textContent = `*** ${head} *** MODO AUTÓNOMO: LA TRIPULACIÓN EVALÚA SU PROPIO ESTADO *** DATOS SIMULADOS — NO USO CLÍNICO *** `;
            ticker.dataset.status = SEV_KEY[maxSev];
        }
    }

    /* ---------- 4. ESCÁNER CORPORAL ---------- */
    let selectedZone = null;
    let autoMode = true;
    const zoneNodes = $$(".zone");
    const labelNodes = $$(".zone-label");

    function renderBody() {
        const Z = computeZones(D);
        zoneNodes.forEach(n => { n.dataset.status = SEV_KEY[Z[n.dataset.zone].sev]; });
        labelNodes.forEach(n => {
            const z = Z[n.dataset.zone];
            n.dataset.status = SEV_KEY[z.sev];
            $(".zl-state", n).textContent = SEV_LABEL[z.sev];
        });
        $("#body-stage").dataset.rad = SEV_KEY[D.dose || 0];

        const flagged = Object.keys(Z).filter(id => Z[id].sev > 0).length;
        $("#body-summary").textContent = flagged ? `${flagged} ZONA${flagged > 1 ? "S" : ""} EN OBSERVACIÓN` : "SIN ANOMALÍAS";

        const worst = worstZone(Z);
        const id = autoMode ? (worst ? worst.id : null) : selectedZone;
        zoneNodes.forEach(n => n.classList.toggle("is-selected", n.dataset.zone === id));
        labelNodes.forEach(n => n.classList.toggle("is-selected", n.dataset.zone === id));
        $("#zone-auto").setAttribute("aria-pressed", String(autoMode));
        renderReadout(id ? Z[id] : null);
    }

    function renderReadout(z) {
        const box = $("#zone-readout");
        const list = $("#zr-list");
        if (!z) {
            box.dataset.status = "ok";
            $("#zr-title").textContent = "ESCANEO CONTINUO";
            $("#zr-badge").textContent = "NOMINAL";
            list.innerHTML = "";
            $("#zr-nasa").textContent = "Las 7 zonas están en rango. Con comunicaciones retrasadas, la NASA busca que la tripulación detecte cambios tempranos por sí misma (operaciones médicas independientes de la Tierra).";
            $("#zr-cause").textContent = "Sin hallazgos.";
            $("#zr-action").textContent = "Mantener la rutina de monitoreo y las contramedidas de ejercicio. Pulsa una zona para ver su detalle.";
            return;
        }
        const info = ZONES[z.id];
        box.dataset.status = SEV_KEY[z.sev];
        $("#zr-title").textContent = `${info.code} ${info.name}`;
        $("#zr-badge").textContent = SEV_LABEL[z.sev];

        const items = z.items.slice();
        if (z.viaRadiation) items.push({ k: "dose", sev: D.dose });
        list.innerHTML = items.map(i =>
            `<li ${sevStyle(i.sev)}><span>${METRIC_INFO[i.k].label}</span><b>${METRIC_INFO[i.k].fmt()}</b><i>${SEV_LABEL[i.sev]}</i></li>`).join("");

        if (z.sev === 0) {
            $("#zr-nasa").textContent = info.nasa;
            $("#zr-cause").textContent = "Sin hallazgos: los parámetros de esta zona están en rango.";
            $("#zr-action").textContent = "Mantener rutina de monitoreo y contramedidas de ejercicio.";
        } else {
            const m = METRIC_INFO[z.primary];
            $("#zr-nasa").textContent = z.viaRadiation ? RADIATION_NASA : info.nasa;
            $("#zr-cause").textContent = m.cause();
            $("#zr-action").textContent = m.action();
        }
    }

    function selectZone(id) {
        selectedZone = id;
        autoMode = false;
        renderBody();
    }

    $("#body-svg").addEventListener("click", e => {
        const n = e.target.closest("[data-zone]");
        if (n) selectZone(n.dataset.zone);
    });
    $("#body-svg").addEventListener("keydown", e => {
        if (e.key !== "Enter" && e.key !== " ") return;
        const n = e.target.closest(".zone");
        if (!n) return;
        e.preventDefault();
        selectZone(n.dataset.zone);
    });
    $("#zone-auto").addEventListener("click", () => { autoMode = true; renderBody(); });

    /* Único listener de la bitácora: registra localmente y luego envía a la API REST */
    let logTimer = null;
    $("#zone-log").addEventListener("click", async e => {
        const btn = e.currentTarget;
        if (btn.disabled) return;

        const Z = computeZones(D);
        const id = autoMode ? (worstZone(Z) || {}).id : selectedZone;
        const zoneName = id ? ZONES[id].name : "Sistema General";

        // 1. Registro local
        if (id) logEvent(Z[id].sev, `BITÁCORA: ${zoneName} — ${SEV_LABEL[Z[id].sev]}`);
        else logEvent(0, "BITÁCORA: escaneo corporal sin anomalías");
        refreshDrawer(true);

        // 2. Envío al backend (si existe)
        clearTimeout(logTimer);
        let label = "REGISTRADO ✓";
        if (typeof backend !== "undefined") {
            btn.disabled = true;
            btn.textContent = "TRANSMITIENDO...";
            try {
                const result = await backend.saveZoneLog({
                    zone: zoneName,
                    action: $("#zr-action").textContent
                });
                label = result ? "REGISTRADO ✓" : "FALLO DE RED";
            } catch (err) {
                label = "FALLO DE RED";
            }
        }

        // 3. Feedback único y restauración
        btn.textContent = label;
        logTimer = setTimeout(() => {
            btn.textContent = "REGISTRAR EN BITÁCORA";
            btn.disabled = false;
        }, 3000);
    });

    /* ---------- 5. RENDER GENERAL Y SIMULACIÓN ---------- */
    function render() {
        latchSeverity(evaluate());
        trackAlerts();
        renderMetrics();
        renderGlobal();
        renderBody();
        refreshDrawer(false);
    }

    function tick() {
        if (!powered) return;

        // Solo ejecutar la simulación si no hay telemetría real
        if (typeof backend === "undefined" || !backend.isConnected) {
            stepState();
        }

        lastUpdate = Date.now();
        render();
    }

    /* ---------- 6. CAJÓN DE MÓDULOS ---------- */
    let activeModule = null;
    let lastTrigger = null;

    function renderDrawer() {
        drawerContent.innerHTML = MODULES[activeModule].html();
    }

    function refreshDrawer(force) {
        if (!activeModule || !workspace.classList.contains("drawer-open")) return;
        if (!MODULES[activeModule].live && !force) return;
        if (!force && drawerContent.contains(document.activeElement)) return; // no robar el foco
        const scrollTop = drawerContent.scrollTop;
        renderDrawer();
        drawerContent.scrollTop = scrollTop;
    }

    function openModule(id, trigger) {
        if (!MODULES[id]) return;
        if (activeModule === id && workspace.classList.contains("drawer-open")) { closeDrawer(); return; }
        activeModule = id;
        lastTrigger = trigger || null;
        drawerTitle.textContent = MODULES[id].title;
        renderDrawer();
        workspace.classList.add("drawer-open");
        drawer.setAttribute("aria-hidden", "false");
        moduleButtons.forEach(b => {
            const on = b.dataset.module === id;
            b.classList.toggle("is-active", on);
            b.setAttribute("aria-pressed", String(on));
        });
        closeBtn.focus({ preventScroll: true });
    }

    function closeDrawer() {
        workspace.classList.remove("drawer-open");
        drawer.setAttribute("aria-hidden", "true");
        activeModule = null;
        moduleButtons.forEach(b => { b.classList.remove("is-active"); b.setAttribute("aria-pressed", "false"); });
        if (lastTrigger) lastTrigger.focus({ preventScroll: true });
    }

    moduleButtons.forEach(b => b.addEventListener("click", () => openModule(b.dataset.module, b)));
    closeBtn.addEventListener("click", closeDrawer);
    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && workspace.classList.contains("drawer-open")) closeDrawer();
    });

    function rerenderKeepFocus(selector) {
        const scrollTop = drawerContent.scrollTop;
        renderDrawer();
        drawerContent.scrollTop = scrollTop;
        const again = $(selector, drawerContent);
        if (again) again.focus({ preventScroll: true });
    }

    drawerContent.addEventListener("click", e => {
        const b = e.target.closest("button");
        if (!b) return;
        if (b.dataset.histRange) { ui.histRange = b.dataset.histRange; rerenderKeepFocus(`[data-hist-range="${ui.histRange}"]`); }
        else if (b.dataset.histMetric) { ui.histMetric = b.dataset.histMetric; rerenderKeepFocus(`[data-hist-metric="${ui.histMetric}"]`); }
        else if (b.dataset.mood) {
            ui.mood = b.dataset.mood;
            logEvent(ui.mood === "bad" ? 1 : 0, `AUTOINFORME: ánimo ${{ good: "BIEN", ok: "REGULAR", bad: "MAL" }[ui.mood]}`);
            rerenderKeepFocus(`[data-mood="${ui.mood}"]`);
        }
        else if (b.dataset.alertPriority) {
            ui.alerts.priority = b.dataset.alertPriority;
            logEvent(ui.alerts.priority === "critica" ? 1 : 0, `CONFIG ALERTAS: prioridad ${ALERT_PRIORITIES[ui.alerts.priority].label}`);
            rerenderKeepFocus(`[data-alert-priority="${ui.alerts.priority}"]`);
        }
        else if (b.dataset.alertMethod) {
            const key = b.dataset.alertMethod;
            ui.alerts.methods[key] = !ui.alerts.methods[key];
            rerenderKeepFocus(`[data-alert-method="${key}"]`);
        }
        else if (b.dataset.missionLink) {
            ui.mission.link = b.dataset.missionLink;
            const link = LINK_MODES[ui.mission.link];
            logEvent(link.sev, `ENLACE TIERRA: modo ${link.label}`);
            rerenderKeepFocus(`[data-mission-link="${ui.mission.link}"]`);
        }
    });

    function applyFx() {
        document.body.classList.toggle("fx-no-scan", !ui.fx.scan);
        document.body.classList.toggle("fx-no-glow", !ui.fx.glow);
        document.body.classList.toggle("fx-flicker", ui.fx.flicker);
    }
    drawerContent.addEventListener("change", e => {
        const t = e.target;
        if (t.dataset && t.dataset.fx) { ui.fx[t.dataset.fx] = t.checked; applyFx(); return; }
        if (t.dataset && t.dataset.alert) {
            ui.alerts[t.dataset.alert] = t.checked;
            if (t.dataset.alert === "enabled") {
                logEvent(t.checked ? 0 : 1, `CONFIG ALERTAS: notificaciones ${t.checked ? "ACTIVADAS" : "SUSPENDIDAS"}`);
                rerenderKeepFocus(`[data-alert="enabled"]`);
            }
            return;
        }
        if (t.dataset && t.dataset.mission) {
            const field = t.dataset.mission;
            if (field === "duration") {
                const v = Math.max(1, Math.min(3650, Math.round(Number(t.value) || 1)));
                ui.mission.duration = v;
                t.value = String(v);
                const out = $("[data-duration-out]", drawerContent);
                if (out) out.textContent = String(v).padStart(3, "0");
            } else if (field === "sync") {
                ui.mission.sync = t.value;
                rerenderKeepFocus(`[data-mission="sync"]`);
            } else {
                const val = t.value.trim();
                if (field === "name") ui.mission.name = val || "ARTEMIS-SIM";
                else if (field === "id") ui.mission.id = val || "AST-MSN-042";
                else ui.mission[field] = val;
                t.value = ui.mission[field];
            }
        }
    });

    drawerContent.addEventListener("input", e => {
        const t = e.target;
        if (!t.dataset || !t.dataset.mission) return;
        const field = t.dataset.mission;
        ui.mission[field] = t.value;
        if (field === "duration") {
            const out = $("[data-duration-out]", drawerContent);
            if (out) {
                const v = Math.max(0, Math.min(3650, Math.round(Number(t.value) || 0)));
                out.textContent = String(v).padStart(3, "0");
            }
        }
    });

    /* ---------- 7. CONTROL DE SIMULACIÓN ---------- */
    $$(".scn-btn").forEach(b => {
        b.setAttribute("aria-pressed", String(b.classList.contains("is-on")));
        b.addEventListener("click", () => {
            state.scenario = b.dataset.scenario;
            $$(".scn-btn").forEach(x => {
                const on = x === b;
                x.classList.toggle("is-on", on);
                x.setAttribute("aria-pressed", String(on));
            });
            logEvent(0, `ESCENARIO: ${SCENARIOS[state.scenario].label}`);
            for (let i = 0; i < 4; i++) stepState();   // respuesta visible sin esperar
            lastUpdate = Date.now();
            render();
        });
    });

    $("#eva-slider").addEventListener("input", e => {
        state.evaLoad = Number(e.target.value);
        $("#eva-value").textContent = state.evaLoad;
        syncLcdGhosts();
    });

    /* ---------- 8. VENTANA: STANDBY / CONTRAER ---------- */
    function setPower(on) {
        powered = on;
        standby.hidden = on;
        consoleEl.classList.toggle("is-off", !on);
        const btn = $("#btn-power");
        btn.setAttribute("aria-pressed", String(!on));
        const label = $("#pwr-label");
        label.textContent = on ? "PWR ONLINE" : "STANDBY";
        label.className = on ? "green-text" : "amber-text";
        logEvent(0, on ? "PANTALLAS ENCENDIDAS" : "PANTALLAS EN STANDBY");
    }
    function setShade(on) {
        shaded = on;
        consoleEl.classList.toggle("is-shaded", on);
        $("#btn-shade").setAttribute("aria-pressed", String(on));
    }
    $("#btn-power").addEventListener("click", () => setPower(!powered));
    $("#btn-shade").addEventListener("click", () => setShade(!shaded));
    $("#titlebar").addEventListener("dblclick", e => { if (!e.target.closest(".win-buttons")) setShade(!shaded); });

    /* ---------- 9. RELOJES ---------- */
    const pad = n => String(n).padStart(2, "0");
    function tickClocks() {
        $("#system-clock").textContent = nowTime();
        const s = Math.floor((Date.now() - bootTime) / 1000);
        $("#met-clock").textContent = `042:${pad(Math.floor(s / 3600) % 24)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
        $("#last-sync-time").textContent = `HACE ${Math.floor((Date.now() - lastUpdate) / 1000)}s`;
    }

    /* ---------- 10. ARRANQUE ---------- */
    logEvent(0, "SISTEMA INICIADO — CALIBRACIÓN DE SENSORES COMPLETADA");
    applyFx();
    render();
    tickClocks();
    setInterval(tick, 2000);
    setInterval(tickClocks, 1000);

    startCanvases($("#ecg-canvas"), $("#bio-canvas"), () => ({
        running: powered && !shaded,
        hr: state.hr,
        color: ["#00ff66", "#ffb000", "#ff3b3b"][D.hr || 0],
        noise: (D.spo2 || 0) * 0.3 + state.evaLoad / 100 * 0.5,
        level: clamp(0.25 + (state.hr - 60) / 120 * 0.4 + state.evaLoad / 100 * 0.3, 0.2, 0.95)
    }));
})();