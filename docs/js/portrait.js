/* DASZFRAME — portrait retouch (portrait.js)
   Face Light · Eye Enhancer · Skin Smoothing · Teeth Whitening, guided by the
   68 face landmarks from faces.js. Works on the source photo, so photo layers
   and every collage fragment cut from it get the same retouch.
   Only the area around the face is processed; masks and blurs are cached per
   photo, so moving a slider only re-runs one pixel pass.
   Needs engine.js (DZ.blurredCopy). Attaches window.DZPortrait. */
(function (global) {
  'use strict';

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const KEYS = ['light', 'eyes', 'skin', 'teeth'];
  const active = (p) => !!p && KEYS.some(k => p[k] > 0);

  // imgEl → Map(maxSide → base)   base = masks, blurs, original pixels
  // imgEl → Map(paramKey → canvas) small LRU of finished results
  const bases = new WeakMap(), results = new WeakMap();

  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

  function buildBase(imgEl, points, maxSide) {
    const W = imgEl.naturalWidth, H = imgEl.naturalHeight;
    const k = Math.min(1, maxSide / Math.max(W, H));
    const cw = Math.round(W * k), ch = Math.round(H * k);
    const full = canvas(cw, ch);
    const fx = full.getContext('2d');
    fx.imageSmoothingQuality = 'high';
    fx.drawImage(imgEl, 0, 0, cw, ch);

    const P = points.map(p => ({ x: p.x * k, y: p.y * k }));
    const xs = P.slice(0, 27).map(p => p.x), ys = P.slice(0, 27).map(p => p.y);
    const fx0 = Math.min(...xs), fx1 = Math.max(...xs);
    const browTop = Math.min(...P.slice(17, 27).map(p => p.y)), chin = P[8].y;
    const faceW = fx1 - fx0, faceH = chin - browTop;

    // Working region: the head plus a margin for the face light falloff.
    const R = {
      x0: Math.floor(clamp(fx0 - faceW * 0.45, 0, cw)), x1: Math.ceil(clamp(fx1 + faceW * 0.45, 0, cw)),
      y0: Math.floor(clamp(browTop - faceH * 0.75, 0, ch)), y1: Math.ceil(clamp(chin + faceH * 0.3, 0, ch)),
    };
    const rw = Math.max(1, R.x1 - R.x0), rh = Math.max(1, R.y1 - R.y0);
    const Q = P.map(p => ({ x: p.x - R.x0, y: p.y - R.y0 }));

    const sub = canvas(rw, rh);
    sub.getContext('2d').drawImage(full, R.x0, R.y0, rw, rh, 0, 0, rw, rh);
    const orig = sub.getContext('2d').getImageData(0, 0, rw, rh).data;

    const poly = (ctx, pts, scale = 1) => {
      const c = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
      ctx.beginPath();
      pts.forEach((p, i) => { const x = c.x + (p.x - c.x) * scale, y = c.y + (p.y - c.y) * scale; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.closePath();
    };
    const maskData = (draw, feather) => {
      const m = canvas(rw, rh), x = m.getContext('2d');
      x.fillStyle = '#fff'; x.strokeStyle = '#fff';
      draw(x);
      const f = feather > 0.5 ? global.DZ.blurredCopy(m, feather) : m;
      const d = f.getContext('2d').getImageData(0, 0, rw, rh).data;
      const a = new Uint8Array(rw * rh);
      for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] ? Math.round(d[i * 4] * d[i * 4 + 3] / 255) : 0;
      return a;
    };

    // Skin: jaw line + forehead, minus eyes, brows, nostrils and lips.
    const skin = maskData(x => {
      const lift = faceH * 0.32;
      const outline = Q.slice(0, 17).concat(Q.slice(17, 27).reverse().map(p => ({ x: p.x, y: p.y - lift })));
      poly(x, outline); x.fill();
      x.globalCompositeOperation = 'destination-out';
      poly(x, Q.slice(36, 42), 1.9); x.fill();
      poly(x, Q.slice(42, 48), 1.9); x.fill();
      x.lineCap = 'round'; x.lineJoin = 'round'; x.lineWidth = faceW * 0.06;
      [Q.slice(17, 22), Q.slice(22, 27)].forEach(b => { x.beginPath(); b.forEach((p, i) => i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y)); x.stroke(); });
      poly(x, Q.slice(48, 60), 1.12); x.fill();
      poly(x, [Q[31], Q[32], Q[33], Q[34], Q[35], Q[30]], 1.15); x.fill();
    }, faceW * 0.03);

    // Face light: soft ellipse centred between the eyes and the nose tip.
    const eyesY = (Q[37].y + Q[44].y) / 2;
    const lc = { x: Q[30].x * 0.6 + (Q[39].x + Q[42].x) / 2 * 0.4, y: eyesY * 0.5 + Q[30].y * 0.5 };
    const light = maskData(x => {
      const rx = faceW * 0.78, ry = faceH * 0.95;
      x.translate(lc.x, lc.y); x.scale(1, ry / rx);
      const g = x.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,.65)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(-rx, -rx, rx * 2, rx * 2);
    }, 0);

    const eyes = maskData(x => { poly(x, Q.slice(36, 42), 1.1); x.fill(); poly(x, Q.slice(42, 48), 1.1); x.fill(); }, faceW * 0.008);

    // Teeth: inner lip line; skipped when the mouth is closed.
    const inner = Q.slice(60, 68);
    const gap = ((Q[66].y - Q[62].y) + (Q[67].y - Q[61].y) + (Q[65].y - Q[63].y)) / 3;
    const teeth = gap > faceH * 0.025 ? maskData(x => { poly(x, inner, 0.96); x.fill(); }, faceW * 0.006) : null;

    const skinBlur = global.DZ.blurredCopy(sub, Math.max(1.5, faceW * 0.035)).getContext('2d').getImageData(0, 0, rw, rh).data;
    const eyeBlur = global.DZ.blurredCopy(sub, Math.max(0.8, faceW * 0.006)).getContext('2d').getImageData(0, 0, rw, rh).data;

    return { k, cw, ch, full, R, rw, rh, orig, skin, light, eyes, teeth, skinBlur, eyeBlur };
  }

  function getBase(imgEl, points, maxSide) {
    let m = bases.get(imgEl);
    if (!m) { m = new Map(); bases.set(imgEl, m); }
    const key = maxSide + '|' + points.length + '|' + Math.round(points[30].x) + ',' + Math.round(points[30].y);
    if (!m.has(key)) { m.clear(); m.set(key, buildBase(imgEl, points, maxSide)); }
    return m.get(key);
  }

  function apply(B, p) {
    const out = canvas(B.cw, B.ch), ox = out.getContext('2d');
    ox.drawImage(B.full, 0, 0);
    const id = ox.createImageData(B.rw, B.rh), d = id.data, o = B.orig;
    const sk = (p.skin || 0) / 100, li = (p.light || 0) / 100, ey = (p.eyes || 0) / 100, te = (p.teeth || 0) / 100;
    const S = B.skinBlur, E = B.eyeBlur;
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      let r = o[i], g = o[i + 1], b = o[i + 2];
      // Skin smoothing: blend toward the blur where pixels are similar, so
      // pores and blotches soften but edges (nose, jaw, hairline) stay sharp.
      if (sk && B.skin[j]) {
        const m = B.skin[j] / 255 * sk;
        const diff = (Math.abs(r - S[i]) + Math.abs(g - S[i + 1]) + Math.abs(b - S[i + 2])) / 3;
        const w = m * Math.exp(-(diff * diff) / 800) * 0.8;
        r += (S[i] - r) * w; g += (S[i + 1] - g) * w; b += (S[i + 2] - b) * w;
      }
      // Eye enhancer: local sharpening, a little brightness and colour.
      if (ey && B.eyes[j]) {
        const m = B.eyes[j] / 255 * ey;
        r += (o[i] - E[i]) * 1.4 * m; g += (o[i + 1] - E[i + 1]) * 1.4 * m; b += (o[i + 2] - E[i + 2]) * 1.4 * m;
        r += (255 - r) * 0.16 * m; g += (255 - g) * 0.16 * m; b += (255 - b) * 0.16 * m;
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b, s = 1 + 0.35 * m;
        r = l + (r - l) * s; g = l + (g - l) * s; b = l + (b - l) * s;
      }
      // Teeth whitening: only bright, non-red pixels inside the inner lips.
      if (te && B.teeth && B.teeth[j]) {
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        let w = B.teeth[j] / 255 * te * smooth(55, 135, lum);
        if (r > g * 1.3) w *= 0.15;
        if (w > 0) {
          const avg = (r + g + b) / 3;
          r += (avg - r) * 0.75 * w; g += (avg - g) * 0.75 * w; b += (avg - b) * 0.75 * w + 6 * w;
          r += (255 - r) * 0.22 * w; g += (255 - g) * 0.22 * w; b += (255 - b) * 0.22 * w;
        }
      }
      // Face light: lift toward white, slightly warm.
      if (li && B.light[j]) {
        const m = B.light[j] / 255 * li;
        r += (255 - r) * 0.3 * m + 5 * m; g += (255 - g) * 0.3 * m + 2 * m; b += (255 - b) * 0.27 * m - 3 * m;
      }
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = o[i + 3];
    }
    ox.putImageData(id, B.R.x0, B.R.y0);
    return out;
  }

  // Returns a retouched canvas of the photo (long side ≤ maxSide), or null
  // when nothing is switched on. Results are cached per photo and settings.
  function get(imgEl, points, p, maxSide) {
    if (!imgEl || !imgEl.naturalWidth || !points || points.length < 68 || !active(p)) return null;
    let m = results.get(imgEl);
    if (!m) { m = new Map(); results.set(imgEl, m); }
    const key = maxSide + '|' + KEYS.map(k => p[k] || 0).join(',') + '|' + Math.round(points[30].x) + ',' + Math.round(points[30].y);
    let c = m.get(key);
    if (c) { m.delete(key); m.set(key, c); return c; }
    c = apply(getBase(imgEl, points, maxSide), p);
    m.set(key, c);
    while (m.size > 4) m.delete(m.keys().next().value);
    return c;
  }

  global.DZPortrait = { get, active, KEYS };
})(window);
