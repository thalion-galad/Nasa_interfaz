/* =========================================================
   ASTRA HEALTH · CANVAS
   ECG con barrido continuo (el periodo del latido depende de la FC)
   y analizador de actividad segmentado estilo Winamp.
   Todo es simulación; no procesa señal real.
   ========================================================= */
"use strict";

const REDUCED_MOTION = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Ajusta la resolución del canvas a su tamaño CSS. Devuelve false si está oculto. */
function fitCanvas(canvas, st) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return false;
    if (st.w !== w || st.h !== h || st.dpr !== dpr) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        st.w = w; st.h = h; st.dpr = dpr; st.reset = true;
    }
    return true;
}

/* Un latido sintético: ondas P, Q, R, S y T como gaussianas. p en [0,1). */
function ecgWave(p) {
    const g = (c, w, a) => a * Math.exp(-((p - c) * (p - c)) / (2 * w * w));
    return g(0.16, 0.025, 0.12) + g(0.265, 0.008, -0.12) + g(0.285, 0.011, 1) +
           g(0.305, 0.010, -0.25) + g(0.50, 0.050, 0.28);
}

function createEcg(canvas) {
    const st = { w: 0, h: 0, dpr: 1, reset: true, buf: null, phase: 0, acc: 0, wander: 0 };
    const ctx = canvas.getContext("2d");
    const SPEED = REDUCED_MOTION ? 60 : 120; // px/s de barrido

    return function frame(dt, p) {
        if (!fitCanvas(canvas, st)) return;
        const W = Math.floor(st.w), H = st.h;
        if (st.reset || !st.buf || st.buf.length !== W) {
            const old = st.buf;
            st.buf = new Float32Array(W);
            if (old) {                               // conserva el trazo ya dibujado al cambiar el ancho
                const k = Math.min(old.length, W);
                st.buf.set(old.subarray(old.length - k), W - k);
            }
            st.reset = false;
        }

        st.acc += dt * SPEED;
        let n = Math.floor(st.acc);
        st.acc -= n;
        n = Math.min(n, W);
        if (n > 0) {
            const step = dt / n;
            st.buf.copyWithin(0, n);
            const noiseAmp = 0.012 + (p.noise || 0) * 0.05;
            for (let i = 0; i < n; i++) {
                st.phase = (st.phase + step * p.hr / 60) % 1;
                st.wander += step;
                const wander = Math.sin(st.wander * 0.9) * 0.04;
                st.buf[W - n + i] = ecgWave(st.phase) + wander + (Math.random() - 0.5) * noiseAmp;
            }
        }

        ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
        ctx.clearRect(0, 0, st.w, H);
        ctx.strokeStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.lineWidth = 2;
        ctx.lineJoin = "round";
        ctx.beginPath();
        for (let x = 0; x < W; x++) {
            const y = H * 0.66 - st.buf[x] * H * 0.52;
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // punto brillante en la cabeza del trazo
        const hy = H * 0.66 - st.buf[W - 1] * H * 0.52;
        ctx.fillStyle = "#ffffff";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(W - 2, hy, 2.2, 0, Math.PI * 2);
        ctx.fill();
    };
}

function createRadioSpectrum(canvas) {
    const BINS = 28, GAP = 1, SEG_H = 3, SEG_GAP = 1;
    const st = { w: 0, h: 0, dpr: 1, t: 0, carrier: 17, burst: 0.6 };
    const heights = new Float32Array(BINS);
    const peaks = new Float32Array(BINS);
    const targets = new Float32Array(BINS);
    const ctx = canvas.getContext("2d");
    const REFRESH = REDUCED_MOTION ? 1.2 : 0.12;   // s entre actualizaciones del espectro

    return function frame(dt, p) {
        if (!fitCanvas(canvas, st)) return;
        const W = st.w, H = st.h;
        const link = p.link || 0;
        const level = p.level == null ? 0.6 : p.level;

        st.t += dt;
        if (st.t >= REFRESH) {
            st.t = 0;
            st.carrier = link === 2 ? 9 : link === 1 ? 13 : 17;
            st.burst = 0.35 + Math.random() * 0.65;   // tráfico de la llamada

            for (let i = 0; i < BINS; i++) {
                const d = i - st.carrier;
                const carrierPeak = Math.exp(-(d * d) / 3.4) * (1 - link * 0.2);
                const sideBands = (Math.exp(-((d - 3) ** 2) / 1.2) + Math.exp(-((d + 3) ** 2) / 1.2)) * 0.32;
                const noiseFloor = (0.06 + link * 0.11) * (0.4 + Math.random() * 1.1);
                targets[i] = clamp01(noiseFloor + (carrierPeak * (0.55 + st.burst * 0.45) + sideBands) * level);
            }
        }

        const k = Math.min(1, dt * (REDUCED_MOTION ? 3 : 14));
        for (let i = 0; i < BINS; i++) {
            heights[i] += (targets[i] - heights[i]) * k;
            peaks[i] = Math.max(peaks[i] - dt * 0.35, heights[i]);
        }

        ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);

        const color = link === 2 ? "#ff3b3b" : link === 1 ? "#ffb000" : "#00e1ff";
        const barW = (W - GAP * (BINS - 1)) / BINS;
        const step = SEG_H + SEG_GAP;
        const segs = Math.max(1, Math.floor(H / step));

        // Línea de portadora del enlace.
        const cx = st.carrier * (barW + GAP) + barW / 2;
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = color;
        ctx.setLineDash([2, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, H);
        ctx.stroke();
        ctx.restore();

        // Barras segmentadas estilo analizador; el pico central es la portadora.
        for (let i = 0; i < BINS; i++) {
            const x = i * (barW + GAP);
            const lit = Math.round(heights[i] * segs);
            for (let s = 0; s < lit; s++) {
                ctx.globalAlpha = 0.4 + (s / segs) * 0.6;
                ctx.fillStyle = color;
                ctx.fillRect(x, H - (s + 1) * step, barW, SEG_H);
            }
            ctx.globalAlpha = 1;
            const ps = Math.min(segs - 1, Math.round(peaks[i] * segs));
            if (ps > 0) {
                ctx.fillStyle = "#cfd8e3";
                ctx.fillRect(x, H - (ps + 1) * step, barW, SEG_H);
            }
        }

        // Etiqueta de frecuencia de portadora.
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.8;
        ctx.font = "8px 'Share Tech Mono', monospace";
        ctx.fillText("fc", Math.min(W - 9, cx + 3), 9);
        ctx.globalAlpha = 1;
    };
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

/* Bucle único. getParams() -> { running, hr, color, noise, level, link } */
function startCanvases(ecgCanvas, radioCanvas, getParams) {
    const ecg = ecgCanvas ? createEcg(ecgCanvas) : null;
    const radio = radioCanvas ? createRadioSpectrum(radioCanvas) : null;
    let last = performance.now();

    function loop(now) {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        const p = getParams();
        if (p.running) {
            if (ecg) ecg(dt, p);
            if (radio) radio(dt, p);
        }
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
}
