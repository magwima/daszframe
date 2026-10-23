/* DASZFRAME — render engine (engine.js)
   One pipeline for both the on-screen preview and exported files, so what you
   see is what you export. Attaches window.DZ. No dependencies, CSP-safe.

   Per layer:  draw content → blur → clarity/sharpness → tone + colour grade
               → film look → 3D LUT → halftone → chromatic aberration → glow
               → vignette → grain
   Then layers are composited with their opacity and blend mode. */
(function (global) {
  'use strict';

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

  // ── Image cache ─────────────────────────────────────────────────────────────
  // img(src, onReady) returns a decoded image synchronously when cached; the
  // preview calls it every frame and re-renders when a pending image arrives.
  const cache = new Map();
  function img(src, onReady) {
    if (!src) return null;
    let e = cache.get(src);
    if (!e) {
      const el = new Image();
      e = { el, ok: false, waiters: [] };
      cache.set(src, e);
      el.onload = () => { e.ok = true; e.waiters.splice(0).forEach(f => f()); };
      el.onerror = () => { e.waiters.splice(0).forEach(f => f()); };
      el.src = src;
    }
    if (e.ok) return e.el;
    if (onReady && !e.waiters.includes(onReady)) e.waiters.push(onReady);
    return null;
  }
  function preload(srcs) {
    return Promise.all([...new Set(srcs.filter(Boolean))].map(s => new Promise(res => {
      if (img(s, res)) res();
    })));
  }
  function layerSources(layers) {
    const out = [];
    for (const l of layers) for (const f of (l.placed || [])) out.push(f.dataUrl);
    return out;
  }

  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

  // ── Blur (GPU canvas filter when the browser supports it, else JS) ───────────
  let _filterOK = null;
  function canvasFilterSupported() {
    if (_filterOK !== null) return _filterOK;
    try {
      const c = canvas(9, 1), x = c.getContext('2d');
      x.filter = 'blur(2px)';
      x.fillStyle = '#000'; x.fillRect(4, 0, 1, 1);
      _filterOK = x.filter === 'blur(2px)' && x.getImageData(2, 0, 1, 1).data[3] > 0;
    } catch (_) { _filterOK = false; }
    return _filterOK;
  }
  function boxBlurPass(src, dst, w, h, r, horizontal) {
    const iarr = 1 / (r + r + 1);
    const outer = horizontal ? h : w, inner = horizontal ? w : h;
    const step = horizontal ? 4 : w * 4;
    for (let o = 0; o < outer; o++) {
      const base = horizontal ? o * w * 4 : o * 4;
      for (let ch = 0; ch < 4; ch++) {
        const first = src[base + ch], last = src[base + (inner - 1) * step + ch];
        let acc = r * first;
        for (let j = 0; j < r; j++) acc += src[base + Math.min(j, inner - 1) * step + ch];
        for (let i = 0; i < inner; i++) {
          const add = i + r < inner ? src[base + (i + r) * step + ch] : last;
          acc += add;
          dst[base + i * step + ch] = acc * iarr;
          const sub = i - r >= 0 ? src[base + (i - r) * step + ch] : first;
          acc -= sub;
        }
      }
    }
  }
  function jsBlur(data, w, h, radius) {
    const r = Math.max(1, Math.round(radius / 1.7));
    const tmp = new Float32Array(data.length), a = new Float32Array(data);
    for (let k = 0; k < 3; k++) { boxBlurPass(a, tmp, w, h, r, true); boxBlurPass(tmp, a, w, h, r, false); }
    return a;
  }
  // Returns a blurred copy of canvas c as a new canvas.
  function blurredCopy(c, radius) {
    const out = canvas(c.width, c.height), x = out.getContext('2d');
    if (radius <= 0.3) { x.drawImage(c, 0, 0); return out; }
    if (canvasFilterSupported()) { x.filter = `blur(${radius}px)`; x.drawImage(c, 0, 0); x.filter = 'none'; return out; }
    // JS fallback: blur premultiplied colour (like the browser does) so
    // transparent areas don't darken or haze the edges.
    const id = c.getContext('2d').getImageData(0, 0, c.width, c.height), sd = id.data;
    const pm = new Uint8ClampedArray(sd.length);
    for (let i = 0; i < sd.length; i += 4) { const a = sd[i + 3] / 255; pm[i] = sd[i] * a; pm[i + 1] = sd[i + 1] * a; pm[i + 2] = sd[i + 2] * a; pm[i + 3] = sd[i + 3]; }
    const b = jsBlur(pm, c.width, c.height, radius);
    const od = x.createImageData(c.width, c.height), d = od.data;
    for (let i = 0; i < b.length; i += 4) {
      const a = b[i + 3], k = a > 0.5 ? 255 / a : 0;
      d[i] = b[i] * k; d[i + 1] = b[i + 1] * k; d[i + 2] = b[i + 2] * k; d[i + 3] = a;
    }
    x.putImageData(od, 0, 0);
    return out;
  }
  function blurInPlace(c, radius) {
    if (radius <= 0.3) return;
    const b = blurredCopy(c, radius), x = c.getContext('2d');
    x.clearRect(0, 0, c.width, c.height); x.drawImage(b, 0, 0);
  }
  // Unsharp mask: out = orig + amount * (orig − blur(orig)). Negative amount softens.
  function unsharp(c, radius, amount) {
    if (!amount) return;
    const x = c.getContext('2d');
    const o = x.getImageData(0, 0, c.width, c.height), d = o.data;
    const b = blurredCopy(c, radius).getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      d[i] = d[i] + amount * (d[i] - b[i]);
      d[i + 1] = d[i + 1] + amount * (d[i + 1] - b[i + 1]);
      d[i + 2] = d[i + 2] + amount * (d[i + 2] - b[i + 2]);
    }
    x.putImageData(o, 0, 0);
  }

  // ── Colour matrices (CSS Filter Effects maths, as 3×4 affine in 0..1) ─────────
  const I = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
  function mul(A, B) { // returns A∘B (apply B first, then A)
    const o = new Array(12);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) o[r * 4 + c] = A[r * 4] * B[c] + A[r * 4 + 1] * B[4 + c] + A[r * 4 + 2] * B[8 + c];
      o[r * 4 + 3] = A[r * 4] * B[3] + A[r * 4 + 1] * B[7] + A[r * 4 + 2] * B[11] + A[r * 4 + 3];
    }
    return o;
  }
  const OPS = {
    brightness: a => [a, 0, 0, 0, 0, a, 0, 0, 0, 0, a, 0],
    contrast: a => { const o = 0.5 - 0.5 * a; return [a, 0, 0, o, 0, a, 0, o, 0, 0, a, o]; },
    saturate: s => [
      .213 + .787 * s, .715 - .715 * s, .072 - .072 * s, 0,
      .213 - .213 * s, .715 + .285 * s, .072 - .072 * s, 0,
      .213 - .213 * s, .715 - .715 * s, .072 + .928 * s, 0],
    grayscale: a => OPS.saturate(1 - a),
    sepia: a => { const b = 1 - a; return [
      .393 + .607 * b, .769 - .769 * b, .189 - .189 * b, 0,
      .349 - .349 * b, .686 + .314 * b, .168 - .168 * b, 0,
      .272 - .272 * b, .534 - .534 * b, .131 + .869 * b, 0]; },
    hue: deg => { const t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t); return [
      .213 + c * .787 - s * .213, .715 - c * .715 - s * .715, .072 - c * .072 + s * .928, 0,
      .213 - c * .213 + s * .143, .715 + c * .285 + s * .140, .072 - c * .072 - s * .283, 0,
      .213 - c * .213 - s * .787, .715 - c * .715 + s * .715, .072 + c * .928 + s * .072, 0]; },
  };
  const LOOKS = {
    cinematic: [['contrast', 1.18], ['saturate', .72], ['brightness', .95]],
    vintage: [['sepia', .45], ['brightness', 1.08], ['contrast', .92], ['saturate', .85]],
    bw: [['grayscale', 1], ['contrast', 1.15]],
    noir: [['grayscale', 1], ['contrast', 1.45], ['brightness', .82]],
    bleach: [['contrast', 1.35], ['saturate', .38], ['brightness', 1.05]],
    teal: [['contrast', 1.12], ['saturate', 1.2], ['hue', 8], ['brightness', .97]],
    editorial: [['contrast', 1.06], ['brightness', 1.04], ['saturate', .88]],
    kodak: [['sepia', .22], ['contrast', 1.08], ['saturate', 1.12], ['brightness', 1.02]],
    fuji: [['contrast', 1.05], ['saturate', .95], ['brightness', 1.02], ['hue', -5]],
    documentary: [['contrast', 1.04], ['saturate', .82], ['brightness', .98]],
    halftone: [['grayscale', 1], ['contrast', 1.6]],
  };
  function lookMatrix(look, strength) {
    const ops = LOOKS[look];
    if (!ops) return null;
    let M = I();
    for (const [op, v] of ops) M = mul(OPS[op](v), M);
    const s = clamp(strength == null ? 1 : strength / 100, 0, 1);
    if (s >= 1) return M;
    const Id = I();
    return M.map((v, i) => Id[i] + (v - Id[i]) * s);
  }

  // ── Tone curve (monotone cubic through the points, 0..255) ───────────────────
  const curveIdentity = (pts) => !pts || pts.every(([x, y]) => Math.abs(x - y) < 0.5);
  function curveFn(pts) {
    const P = [...(pts || [[0, 0], [255, 255]])].sort((a, b) => a[0] - b[0]);
    const n = P.length;
    if (n < 2) return (v) => v;
    const xs = P.map(p => p[0]), ys = P.map(p => p[1]);
    const d = [], m = new Array(n);
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / ((xs[i + 1] - xs[i]) || 1e-6));
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) { // Fritsch–Carlson: keep it from overshooting
      if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s2 = a * a + b * b;
      if (s2 > 9) { const t = 3 / Math.sqrt(s2); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    return (v) => {
      if (v <= xs[0]) return ys[0];
      if (v >= xs[n - 1]) return ys[n - 1];
      let i = 0; while (v > xs[i + 1]) i++;
      const h = xs[i + 1] - xs[i], t = (v - xs[i]) / h, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
    };
  }

  // ── Colour mixer: hue / saturation / luminance per colour range ────────────
  const MIX_BANDS = [['red', 0], ['orange', 30], ['yellow', 60], ['green', 120], ['aqua', 180], ['blue', 225], ['purple', 270], ['magenta', 315]];
  const mixerActive = (mx) => !!mx && Object.values(mx).some(b => b && (b.h || b.s || b.l));
  // 360-entry table of [hue shift°, sat factor−1, lum shift], interpolated
  // between neighbouring bands so there are no hard edges between colours.
  function mixerTable(mx) {
    const T = new Float32Array(360 * 3);
    for (let hdeg = 0; hdeg < 360; hdeg++) {
      let a = MIX_BANDS.length - 1;
      for (let i = 0; i < MIX_BANDS.length; i++) if (MIX_BANDS[i][1] <= hdeg) a = i;
      const b = (a + 1) % MIX_BANDS.length;
      const ca = MIX_BANDS[a][1], cb = MIX_BANDS[b][1] + (b === 0 ? 360 : 0);
      const hh = hdeg < ca ? hdeg + 360 : hdeg;
      const t = (hh - ca) / (cb - ca);
      const A = mx[MIX_BANDS[a][0]] || {}, B = mx[MIX_BANDS[b][0]] || {};
      T[hdeg * 3] = ((A.h || 0) * (1 - t) + (B.h || 0) * t) / 100 * 30;
      T[hdeg * 3 + 1] = ((A.s || 0) * (1 - t) + (B.s || 0) * t) / 100;
      T[hdeg * 3 + 2] = ((A.l || 0) * (1 - t) + (B.l || 0) * t) / 100;
    }
    return T;
  }
  function hue2rgb(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }

  // ── Grade ───────────────────────────────────────────────────────────────────
  const TONE_KEYS = ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'lift'];
  function needsColor(g) {
    if (!g) return false;
    if (TONE_KEYS.some(k => g[k])) return true;
    if ((g.gamma || 1) !== 1 || (g.gain || 1) !== 1) return true;
    if (g.saturation || g.vibrance || g.temperature || g.tint) return true;
    if (mixerActive(g.mixer) || !curveIdentity(g.curvePoints)) return true;
    if (g.look && g.look !== 'none' && (g.lookStrength ?? 100) > 0) return true;
    if (g.lutData && g.lutData.data && g.lutData.data.length) return true;
    return false;
  }
  function toneLUT(g) {
    const t = new Float32Array(256);
    const exp = Math.pow(2, (g.exposure || 0) / 50);           // ±2 stops
    const c = (g.contrast || 0) / 100, cf = c >= 0 ? 1 + c * 1.5 : 1 + c * 0.9;
    const hi = (g.highlights || 0) / 100, sh = (g.shadows || 0) / 100;
    const wh = (g.whites || 0) / 100, bl = (g.blacks || 0) / 100;
    const lift = (g.lift || 0) / 100 * 0.5, gamma = g.gamma || 1, gain = g.gain || 1;
    for (let i = 0; i < 256; i++) {
      let v = i / 255;
      v = gain * (v + lift * (1 - v));
      v = Math.pow(Math.max(v, 0), 1 / gamma);
      v *= exp;
      v = (v - 0.5) * cf + 0.5;
      v += hi * 0.3 * smooth(0.45, 1, v);
      v += sh * 0.3 * (1 - smooth(0, 0.55, v));
      v += wh * 0.15 * smooth(0.7, 1, v);
      v += bl * 0.15 * (1 - smooth(0, 0.3, v));
      t[i] = clamp(v, 0, 1);
    }
    if (!curveIdentity(g.curvePoints)) {
      const f = curveFn(g.curvePoints);
      for (let i = 0; i < 256; i++) t[i] = clamp(f(t[i] * 255) / 255, 0, 1);
    }
    return t;
  }
  const _lutFlat = new WeakMap();
  function lutFlat(lut) {
    let f = _lutFlat.get(lut);
    if (!f) {
      f = new Float32Array(lut.data.length * 3);
      lut.data.forEach((v, i) => { f[i * 3] = v[0]; f[i * 3 + 1] = v[1]; f[i * 3 + 2] = v[2]; });
      _lutFlat.set(lut, f);
    }
    return f;
  }
  function applyColor(c, g) {
    const x = c.getContext('2d');
    const id = x.getImageData(0, 0, c.width, c.height), d = id.data;
    const T = toneLUT(g);
    const temp = (g.temperature || 0) / 100, tint = (g.tint || 0) / 100;
    const sat = 1 + (g.saturation || 0) / 100, vib = (g.vibrance || 0) / 100;
    const M = (g.look && g.look !== 'none') ? lookMatrix(g.look, g.lookStrength) : null;
    const MX = mixerActive(g.mixer) ? mixerTable(g.mixer) : null;
    const lut = g.lutData && g.lutData.data && g.lutData.data.length ? g.lutData : null;
    const L = lut ? lutFlat(lut) : null, S = lut ? lut.size : 0, S1 = S - 1;
    const n = L ? Math.min(S * S * S, L.length / 3) : 0;
    const at = (ri, gi, bi, ch) => { const k = (bi * S * S + gi * S + ri); return k < n ? L[k * 3 + ch] : 0; };
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      let r = T[d[i]], gg = T[d[i + 1]], b = T[d[i + 2]];
      if (temp) { r += temp * 0.08; b -= temp * 0.08; }
      if (tint) { gg -= tint * 0.06; r += tint * 0.03; b += tint * 0.03; }
      if (sat !== 1 || vib) {
        const lm = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
        let s = sat;
        if (vib) {
          const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
          s *= 1 + vib * (1 - clamp(mx - mn, 0, 1));
        }
        r = lm + (r - lm) * s; gg = lm + (gg - lm) * s; b = lm + (b - lm) * s;
      }
      if (MX) { // colour mixer, in HSL
        const R0 = clamp(r, 0, 1), G0 = clamp(gg, 0, 1), B0 = clamp(b, 0, 1);
        const mx = Math.max(R0, G0, B0), mn = Math.min(R0, G0, B0), c = mx - mn;
        if (c > 0.01) {
          let hh;
          if (mx === R0) hh = ((G0 - B0) / c) % 6; else if (mx === G0) hh = (B0 - R0) / c + 2; else hh = (R0 - G0) / c + 4;
          hh = (hh * 60 + 360) % 360;
          let L = (mx + mn) / 2, S = c / (1 - Math.abs(2 * L - 1) || 1e-6);
          const k = (Math.round(hh) % 360) * 3, wgt = Math.min(1, c * 4);
          hh = (hh + MX[k] * wgt + 360) % 360;
          S = clamp(S * (1 + MX[k + 1] * wgt), 0, 1);
          L = clamp(L + MX[k + 2] * 0.22 * wgt * (1 - Math.abs(2 * L - 1)), 0, 1);
          const q = L < 0.5 ? L * (1 + S) : L + S - L * S, p = 2 * L - q, H1 = hh / 360;
          r = hue2rgb(p, q, H1 + 1 / 3); gg = hue2rgb(p, q, H1); b = hue2rgb(p, q, H1 - 1 / 3);
        }
      }
      if (M) {
        const nr = M[0] * r + M[1] * gg + M[2] * b + M[3];
        const ng = M[4] * r + M[5] * gg + M[6] * b + M[7];
        const nb = M[8] * r + M[9] * gg + M[10] * b + M[11];
        r = nr; gg = ng; b = nb;
      }
      if (L) { // trilinear 3D LUT
        const fr = clamp(r, 0, 1) * S1, fg = clamp(gg, 0, 1) * S1, fb = clamp(b, 0, 1) * S1;
        const r0 = Math.floor(fr), g0 = Math.floor(fg), b0 = Math.floor(fb);
        const r1 = Math.min(r0 + 1, S1), g1 = Math.min(g0 + 1, S1), b1 = Math.min(b0 + 1, S1);
        const dr = fr - r0, dg = fg - g0, db = fb - b0;
        const o = [0, 0, 0];
        for (let ch = 0; ch < 3; ch++) {
          const c00 = at(r0, g0, b0, ch) * (1 - dr) + at(r1, g0, b0, ch) * dr;
          const c10 = at(r0, g1, b0, ch) * (1 - dr) + at(r1, g1, b0, ch) * dr;
          const c01 = at(r0, g0, b1, ch) * (1 - dr) + at(r1, g0, b1, ch) * dr;
          const c11 = at(r0, g1, b1, ch) * (1 - dr) + at(r1, g1, b1, ch) * dr;
          o[ch] = (c00 * (1 - dg) + c10 * dg) * (1 - db) + (c01 * (1 - dg) + c11 * dg) * db;
        }
        r = o[0]; gg = o[1]; b = o[2];
      }
      d[i] = r * 255; d[i + 1] = gg * 255; d[i + 2] = b * 255; // Uint8Clamped clamps
    }
    x.putImageData(id, 0, 0);
  }

  // ── Spatial effects ─────────────────────────────────────────────────────────
  function halftone(c, scale, strength) {
    const W = c.width, H = c.height, x = c.getContext('2d');
    const src = x.getImageData(0, 0, W, H).data;
    const out = canvas(W, H), o = out.getContext('2d');
    const cell = Math.max(3, Math.round(6 * scale));
    o.fillStyle = '#111';
    for (let cy = 0; cy < H; cy += cell) for (let cx = 0; cx < W; cx += cell) {
      let lum = 0, a = 0, n = 0;
      for (let y = cy; y < Math.min(cy + cell, H); y += 2) for (let xx = cx; xx < Math.min(cx + cell, W); xx += 2) {
        const i = (y * W + xx) * 4; const al = src[i + 3] / 255;
        lum += (0.2126 * src[i] + 0.7152 * src[i + 1] + 0.0722 * src[i + 2]) / 255 * al; a += al; n++;
      }
      if (!n || a / n < 0.05) continue;
      const L = lum / a, alpha = a / n;
      o.globalAlpha = alpha;
      o.fillStyle = '#f2ede2'; o.fillRect(cx, cy, cell, cell);
      const rad = cell * 0.72 * Math.sqrt(1 - L);
      if (rad > 0.2) { o.fillStyle = '#141414'; o.beginPath(); o.arc(cx + cell / 2, cy + cell / 2, rad, 0, Math.PI * 2); o.fill(); }
    }
    o.globalAlpha = 1;
    x.save(); x.globalAlpha = clamp(strength, 0, 1); x.globalCompositeOperation = 'source-atop'; x.drawImage(out, 0, 0); x.restore();
  }
  function chromAb(c, px) {
    if (px < 1) return;
    const W = c.width, H = c.height, x = c.getContext('2d');
    const id = x.getImageData(0, 0, W, H), s = id.data, out = new ImageData(W, H), t = out.data;
    for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
      const i = (y * W + xx) * 4;
      const ri = (y * W + Math.min(xx + px, W - 1)) * 4, bi = (y * W + Math.max(xx - px, 0)) * 4;
      t[i] = s[ri]; t[i + 1] = s[i + 1]; t[i + 2] = s[bi + 2]; t[i + 3] = s[i + 3];
    }
    x.putImageData(out, 0, 0);
  }
  function glow(c, amount, scale) {
    const b = blurredCopy(c, amount * 0.3 * scale), x = c.getContext('2d');
    x.save(); x.globalCompositeOperation = 'screen'; x.globalAlpha = amount / 200; x.drawImage(b, 0, 0); x.restore();
  }
  function vignette(c, strength) {
    const W = c.width, H = c.height, x = c.getContext('2d');
    const gr = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${strength / 100})`);
    x.save(); x.globalCompositeOperation = 'source-atop'; x.fillStyle = gr; x.fillRect(0, 0, W, H); x.restore();
  }
  // Deterministic grain: the same pattern every frame (no shimmer while dragging)
  // and the same grain size at every export scale.
  function grain(c, amount, scale) {
    const W = c.width, H = c.height, x = c.getContext('2d');
    const id = x.getImageData(0, 0, W, H), d = id.data, a = amount / 100 * 80;
    for (let y = 0; y < H; y++) {
      const gy = Math.floor(y / scale);
      for (let xx = 0; xx < W; xx++) {
        const i = (y * W + xx) * 4; if (!d[i + 3]) continue;
        let h = (Math.floor(xx / scale) * 374761393 + gy * 668265263) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
        const n = ((h & 1023) / 1023 - 0.5) * a;
        d[i] += n; d[i + 1] += n; d[i + 2] += n;
      }
    }
    x.putImageData(id, 0, 0);
  }

  // ── Drawing helpers ─────────────────────────────────────────────────────────
  // Draw an image into a box, cropping (never stretching) to fill it.
  function drawCover(ctx, im, x, y, w, h) {
    const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;
    drawCoverRect(ctx, im, 0, 0, iw, ih, x, y, w, h);
  }
  // Same, but from a source rectangle of `src`.
  function drawCoverRect(ctx, src, sx, sy, sw, sh, x, y, w, h) {
    if (!sw || !sh || !w || !h) return;
    const ba = w / h, ia = sw / sh;
    if (ia > ba) { const nw = sh * ba; sx += (sw - nw) / 2; sw = nw; } else { const nh = sw / ba; sy += (sh - nh) / 2; sh = nh; }
    ctx.drawImage(src, sx, sy, sw, sh, x, y, w, h);
  }
  // The photo a layer draws from: the original, then portrait retouch
  // (portrait.js), then background tools (background.js + seg.js).
  // Returns null when the plain original should be used.
  function portraitSource(l, o) {
    const P = global.DZPortrait, g = l.grade || {};
    if (!P || !l.imgEl || !l.face || !l.face.points || !P.active(g.portrait)) return null;
    return P.get(l.imgEl, l.face.points, g.portrait, o.hq ? 6000 : 2400);
  }
  function layerSource(l, o) {
    const ps = portraitSource(l, o), g = l.grade || {};
    const B = global.DZBg, S = global.DZSeg, showMask = o.showMaskFor && o.showMaskFor === l.id;
    if (B && S && l.imgEl && (B.active(g.bg) || showMask)) {
      const mask = S.get(l.imgEl, o.onPending);
      if (mask) {
        const r = B.process(ps || l.imgEl, mask, g.bg, o.hq ? 6000 : 2400, { showMask, onPending: o.onPending });
        if (r) return r;
      }
    }
    return ps;
  }
  // Draw a layer's content. `src` replaces the photo (used to draw masks
  // through exactly the same placement as the photo itself).
  function drawContent(lc, l, o, src) {
    const { scale, CW, CH, onPending } = o, x = lc.getContext('2d'), g = l.grade || {};
    const masking = !!src;
    x.setTransform(scale, 0, 0, scale, 0, 0);
    if (l.type === 'photo' && l.imgEl) {
      const X = l.x || 0, Y = l.y || 0, w = l.w || CW, h = l.h || CH;
      x.translate(X + w / 2, Y + h / 2); x.rotate((l.rotation || 0) * Math.PI / 180);
      x.drawImage(src || layerSource(l, o) || l.imgEl, -w / 2, -h / 2, w, h);
    } else if (l.type === 'solid') {
      if (!masking) { x.fillStyle = g.solidColor || '#444'; x.fillRect(l.x || 0, l.y || 0, l.w || CW, l.h || CH); }
    } else if (l.type === 'collage') {
      const frags = (l.placed || []).filter(f => f.visible !== false).sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
      const ps = src || layerSource(l, o); // processed source: fragments are re-cut from it
      for (const f of frags) {
        const fromSrc = !!(ps && f.area);
        if (masking && !fromSrc) continue;
        const im = fromSrc ? null : img(f.dataUrl, onPending);
        if (!im && !fromSrc) continue;
        x.save(); x.globalAlpha = masking ? 1 : (f.opacity ?? 1);
        x.translate(f.x + f.w / 2, f.y + f.h / 2); x.rotate((f.rotation || 0) * Math.PI / 180);
        if (f.flipped) x.scale(-1, 1);
        if (!masking && f.borderStyle === 'shadow') { x.shadowColor = 'rgba(0,0,0,.4)'; x.shadowBlur = 16 * scale; x.shadowOffsetX = 4 * scale; x.shadowOffsetY = 6 * scale; }
        if (!masking && f.borderStyle === 'glow') { x.shadowColor = 'rgba(232,213,163,.5)'; x.shadowBlur = 18 * scale; }
        if (f.borderRadius > 0) {
          x.beginPath(); x.roundRect(-f.w / 2, -f.h / 2, f.w, f.h, f.borderRadius);
          if (!masking && f.borderStyle) { x.fillStyle = '#000'; x.fill(); }
          x.shadowColor = 'transparent'; x.clip();
        }
        if (im) drawCover(x, im, -f.w / 2, -f.h / 2, f.w, f.h);
        else drawCoverRect(x, ps, f.area.x * ps.width, f.area.y * ps.height, f.area.w * ps.width, f.area.h * ps.height, -f.w / 2, -f.h / 2, f.w, f.h);
        x.restore();
      }
    }
    x.setTransform(1, 0, 0, 1, 0, 0);
  }

  // Render one layer, fully graded, to its own canvas at CW*scale × CH*scale.
  // With grade.target 'subject' or 'background', Looks / Grade / FX only land
  // on that part of the photo (the subject mask comes from seg.js).
  function renderLayer(l, o) {
    const { scale, CW, CH } = o, g = l.grade || {};
    const lc = canvas(CW * scale, CH * scale);
    drawContent(lc, l, o);
    if (l.type === 'solid') return lc;
    let orig = null, targetMask = null;
    if ((g.target === 'subject' || g.target === 'background') && l.imgEl && global.DZSeg && global.DZBg) {
      const mask = global.DZSeg.get(l.imgEl, o.onPending);
      if (mask) {
        targetMask = canvas(lc.width, lc.height);
        drawContent(targetMask, l, o, global.DZBg.shapedMask(mask, g.bg, g.target === 'background'));
        orig = canvas(lc.width, lc.height); orig.getContext('2d').drawImage(lc, 0, 0);
      }
    }
    if (g.blur > 0) blurInPlace(lc, g.blur * 0.12 * scale);
    if (g.clarity) unsharp(lc, 10 * scale, g.clarity / 100 * 0.8);
    if (g.sharpness > 0) unsharp(lc, 1.2 * scale, g.sharpness / 100 * 1.5);
    if (needsColor(g)) applyColor(lc, g);
    if (g.look === 'halftone') halftone(lc, scale, (g.lookStrength ?? 100) / 100);
    if (g.chromAb >= 1) chromAb(lc, Math.round(g.chromAb * 0.5 * scale));
    if (g.glow > 0) glow(lc, g.glow, scale);
    if (g.vignette > 0) vignette(lc, g.vignette);
    if (g.grain > 0) grain(lc, g.grain, scale);
    if (orig) {
      const x = lc.getContext('2d');
      x.globalCompositeOperation = 'destination-in'; x.drawImage(targetMask, 0, 0);
      const ox = orig.getContext('2d');
      ox.globalCompositeOperation = 'destination-out'; ox.drawImage(targetMask, 0, 0);
      ox.globalCompositeOperation = 'lighter'; ox.drawImage(lc, 0, 0);
      return orig;
    }
    return lc;
  }

  // Composite every visible layer onto ctx (whose canvas is CW*scale × CH*scale).
  // bgColor 'transparent' leaves the canvas see-through (for PNG cut-outs).
  function renderComposite(ctx, layers, o) {
    const { scale, CW, CH, bgColor } = o;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, CW * scale, CH * scale);
    if (bgColor !== 'transparent') { ctx.fillStyle = bgColor || '#0f0f0f'; ctx.fillRect(0, 0, CW * scale, CH * scale); }
    for (const l of layers) {
      if (l.visible === false) continue;
      const g = l.grade || {};
      const lc = renderLayer(l, o);
      ctx.globalAlpha = (g.opacity ?? 100) / 100;
      ctx.globalCompositeOperation = (g.blendMode && g.blendMode !== 'normal') ? g.blendMode : 'source-over';
      ctx.drawImage(lc, 0, 0);
    }
    ctx.restore();
  }

  // ── .cube LUT parser ────────────────────────────────────────────────────────
  function parseCube(text) {
    let size = 0; const data = [];
    let dmin = [0, 0, 0], dmax = [1, 1, 1];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line[0] === '#') continue;
      const parts = line.split(/\s+/);
      const key = parts[0].toUpperCase();
      if (key === 'LUT_3D_SIZE') { size = parseInt(parts[1], 10); continue; }
      if (key === 'DOMAIN_MIN') { dmin = parts.slice(1, 4).map(Number); continue; }
      if (key === 'DOMAIN_MAX') { dmax = parts.slice(1, 4).map(Number); continue; }
      if (/^[A-Z_]/.test(key)) continue; // TITLE, LUT_1D_SIZE, etc.
      const v = parts.slice(0, 3).map(Number);
      if (v.length === 3 && v.every(Number.isFinite)) data.push(v.map((n, i) => (n - dmin[i]) / ((dmax[i] - dmin[i]) || 1)));
    }
    if (!size || data.length < size * size * size) throw new Error('Not a valid 3D .cube LUT');
    return { size, data: data.slice(0, size * size * size) };
  }

  global.DZ = { img, preload, layerSources, renderComposite, renderLayer, drawCover, blurredCopy, parseCube, needsColor, curveFn, curveIdentity, MIX_BANDS, LOOKS };
})(window);
