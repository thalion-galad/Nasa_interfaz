/* =========================================================
   ASTRA HEALTH · NOTIFICACIONES EMERGENTES
   Avisos flotantes en la esquina superior derecha + señal sonora.
   Se disparan desde trackAlerts() (app.js) cuando una métrica
   empeora. Respetan la configuración del módulo Ajustes:
   notificaciones activas, sonido, prioridad y método "pantalla".
   ========================================================= */
"use strict";

(() => {
    const STACK_ID = "toast-stack";
    const MAX_VISIBLE = 4;
    const AUTO_DISMISS = { 1: 6500, 2: 9500 };   // ms según severidad
    const RATE_LIMIT_MS = 8000;                   // evita repetir la misma alerta
    const SOUND_GAP_MS = 320;                     // agrupa ráfagas de alertas

    const lastNotified = {};
    let lastSoundAt = 0;
    let audioCtx = null;
    let stack = null;

    /* ---------- 1. CONTENEDOR ---------- */
    function getStack() {
        if (stack && stack.isConnected) return stack;
        stack = document.createElement("div");
        stack.id = STACK_ID;
        stack.className = "toast-stack";
        document.body.appendChild(stack);
        return stack;
    }

    /* ---------- 2. SONIDO SINTETIZADO (Web Audio, sin archivos) ---------- */
    function getAudioContext() {
        if (audioCtx) return audioCtx;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try { audioCtx = new AC(); } catch (e) { audioCtx = null; }
        return audioCtx;
    }

    // Los navegadores bloquean el audio hasta el primer gesto del usuario.
    function unlockAudio() {
        const ctx = getAudioContext();
        if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    }
    document.addEventListener("pointerdown", unlockAudio, { passive: true });
    document.addEventListener("keydown", unlockAudio);

    function beep(ctx, start, freq, duration, volume) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + duration + 0.02);
    }

    function playAlertSound(sev) {
        if (!ui.alerts.sound) return;
        const now = performance.now();
        if (now - lastSoundAt < SOUND_GAP_MS) return;   // no superponer ráfagas
        lastSoundAt = now;

        const ctx = getAudioContext();
        if (!ctx) return;

        const play = () => {
            const t = ctx.currentTime + 0.03;
            if (sev >= 2) {
                [880, 660, 880].forEach((f, i) => beep(ctx, t + i * 0.2, f, 0.13, 0.07));
            } else {
                beep(ctx, t, 620, 0.11, 0.05);
                beep(ctx, t + 0.2, 620, 0.11, 0.05);
            }
        };

        if (ctx.state === "suspended") ctx.resume().then(play).catch(() => {});
        else play();
    }

    /* ---------- 3. AVISO FLOTANTE ---------- */
    function dismiss(node, immediate) {
        if (!node || node.dataset.closing) return;
        node.dataset.closing = "1";
        clearTimeout(node._dismissTimer);
        if (immediate) { node.remove(); return; }
        node.classList.add("is-leaving");
        node.addEventListener("animationend", () => node.remove(), { once: true });
        setTimeout(() => node.remove(), 420);   // respaldo si no hay animación
    }

    function buildToast(key, sev) {
        const info = METRIC_INFO[key];
        const ms = AUTO_DISMISS[sev] || AUTO_DISMISS[1];

        const node = document.createElement("article");
        node.className = "toast";
        node.dataset.status = SEV_KEY[sev] || "warn";
        node.setAttribute("role", sev >= 2 ? "alert" : "status");
        node.setAttribute("aria-atomic", "true");

        const head = document.createElement("div");
        head.className = "toast-head";
        const badge = document.createElement("span");
        badge.className = "toast-sev";
        const dot = document.createElement("i");
        dot.className = "toast-dot";
        dot.setAttribute("aria-hidden", "true");
        badge.append(dot, document.createTextNode(SEV_LABEL[sev]));
        const time = document.createElement("time");
        time.className = "toast-time";
        time.textContent = nowTime();
        head.append(badge, time);

        const title = document.createElement("h4");
        title.className = "toast-title";
        title.textContent = info ? info.label : String(key).toUpperCase();

        const value = document.createElement("p");
        value.className = "toast-value";
        value.textContent = info ? info.fmt() : "";

        const cause = document.createElement("p");
        cause.className = "toast-cause";
        cause.textContent = info ? info.cause() : "";

        const close = document.createElement("button");
        close.type = "button";
        close.className = "toast-close";
        close.setAttribute("aria-label", "Cerrar notificación");
        close.textContent = "✕";
        close.addEventListener("click", () => dismiss(node));

        const timer = document.createElement("span");
        timer.className = "toast-timer";
        timer.setAttribute("aria-hidden", "true");
        timer.style.animationDuration = ms + "ms";

        node.append(head, title, value, cause, close, timer);
        node._dismissTimer = setTimeout(() => dismiss(node), ms);
        return node;
    }

    /* ---------- 4. API ---------- */
    function notifyAlert(key, sev) {
        if (!ui.alerts.enabled || sev < 1) return;
        if (ui.alerts.priority === "critica" && sev < 2) return;   // solo rojas

        // Misma métrica sin empeorar dentro de la ventana: no repetir.
        const now = Date.now();
        const prev = lastNotified[key];
        if (prev && now - prev.at < RATE_LIMIT_MS && sev <= prev.sev) return;
        lastNotified[key] = { sev, at: now };

        playAlertSound(sev);
        if (!ui.alerts.methods.screen) return;   // método "pantalla" desactivado

        const root = getStack();
        while (root.children.length >= MAX_VISIBLE) dismiss(root.firstElementChild, true);
        root.appendChild(buildToast(key, sev));
    }

    window.notifyAlert = notifyAlert;
})();
