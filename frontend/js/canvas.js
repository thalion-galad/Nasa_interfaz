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

function createAnalyzer(canvas) {
    const BARS = 24, GAP = 2, SEG_H = 4, SEG_GAP = 1;
    const st = { w: 0, h: 0, dpr: 1, reset: true, t: 0 };
    const heights = new Float32Array(BARS);
    const peaks = new Float32Array(BARS);
    const targets = new Float32Array(BARS);
    const ctx = canvas.getContext("2d");
    const REFRESH = REDUCED_MOTION ? 1.2 : 0.11; // s entre nuevos objetivos

    return function frame(dt, p) {
        if (!fitCanvas(canvas, st)) return;
        const W = st.w, H = st.h;

        st.t += dt;
        if (st.t >= REFRESH) {
            st.t = 0;
            for (let i = 0; i < BARS; i++) {
                const shape = 1 - (i / BARS) * 0.55;
                targets[i] = Math.max(0, Math.min(1, p.level * shape * (0.35 + Math.random() * 0.95)));
            }
        }
        const k = Math.min(1, dt * (REDUCED_MOTION ? 3 : 12));
        for (let i = 0; i < BARS; i++) {
            heights[i] += (targets[i] - heights[i]) * k;
            peaks[i] = Math.max(peaks[i] - dt * 0.35, heights[i]);
        }

        ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        const barW = (W - GAP * (BARS - 1)) / BARS;
        const segs = Math.floor(H / (SEG_H + SEG_GAP));
        for (let i = 0; i < BARS; i++) {
            const x = i * (barW + GAP);
            const lit = Math.round(heights[i] * segs);
            for (let s = 0; s < lit; s++) {
                const f = s / segs;
                ctx.fillStyle = f < 0.6 ? "#00ff66" : f < 0.85 ? "#ffb000" : "#ff3b3b";
                ctx.fillRect(x, H - (s + 1) * (SEG_H + SEG_GAP), barW, SEG_H);
            }
            const ps = Math.min(segs - 1, Math.round(peaks[i] * segs));
            if (ps > 0) {
                ctx.fillStyle = "#cfd8e3";
                ctx.fillRect(x, H - (ps + 1) * (SEG_H + SEG_GAP), barW, SEG_H);
            }
        }
    };
}

/* Bucle único. getParams() -> { running, hr, color, noise, level } */
function startCanvases(ecgCanvas, bioCanvas, getParams) {
    const ecg = ecgCanvas ? createEcg(ecgCanvas) : null;
    const bio = bioCanvas ? createAnalyzer(bioCanvas) : null;
    let last = performance.now();

    function loop(now) {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        const p = getParams();
        if (p.running) {
            if (ecg) ecg(dt, p);
            if (bio) bio(dt, p);
        }
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
}
