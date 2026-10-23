/* DASZFRAME — background tools (background.js)
   Uses the subject mask from seg.js to change only the background of a photo:
   blur (without a glow around the subject), exposure, saturation and
   temperature, or replace it with a colour, another image or transparency.
   Works on the source photo, so photo layers and collage fragments both get
   it. Also provides shaped masks for "grade only the subject / background".
   Needs engine.js. Attaches window.DZBg. */
(function (global) {
  'use strict';

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

  const DEFAULTS = { blur: 0, exposure: 0, saturation: 0, temperature: 0, mode: 'keep', color: '#1d1d1f', image: null, softness: 30, shift: 0 };
  const params = (p) => ({ ...DEFAULTS, ...(p || {}) });
  function active(p) {
    if (!p) return false;
    const q = params(p);
    return q.blur > 0 || !!q.exposure || !!q.saturation || !!q.temperature || q.mode !== 'keep';
  }

  // Edge shaping: Shift grows (+) or shrinks (−) the subject, Softness feathers.
  function shapeFn(p) {
    const q = params(p);
    // Centre sits slightly above 0.5: pulls the edge in a touch, which avoids
    // a rim of background around hair and shoulders.
    const c = 0.52 - clamp(q.shift, -50, 50) * 0.008, w = 0.03 + clamp(q.softness, 0, 100) / 100 * 0.32;
    return (m) => { const t = clamp((m - (c - w)) / (2 * w), 0, 1); return t * t * (3 - 2 * t); };
  }

  // Shaped mask at w×h as a Float32Array (0 = background, 1 = subject).
  function maskArray(mask, w, h, p) {
    const c = canvas(w, h), x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(mask, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data, f = shapeFn(p), m = new Float32Array(w * h);
    for (let i = 0; i < m.length; i++) m[i] = f(d[i * 4 + 3] / 255);
    return m;
  }

  // Shaped mask as a canvas (alpha = subject, or background when inverse),
  // used to limit Looks / Grade / FX to one part of the photo.
  const shapedCache = new WeakMap();
  function shapedMask(mask, p, inverse) {
    const q = params(p), key = q.softness + '|' + q.shift + '|' + (inverse ? 1 : 0);
    let m = shapedCache.get(mask);
    if (!m) { m = new Map(); shapedCache.set(mask, m); }
    if (m.has(key)) return m.get(key);
    const w = mask.width, h = mask.height, a = maskArray(mask, w, h, q);
    const c = canvas(w, h), x = c.getContext('2d'), id = x.createImageData(w, h), d = id.data;
    for (let i = 0; i < a.length; i++) { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255; d[i * 4 + 3] = (inverse ? 1 - a[i] : a[i]) * 255; }
    x.putImageData(id, 0, 0);
    if (m.size > 6) m.delete(m.keys().next().value);
    m.set(key, c);
    return c;
  }

  // Results cache: src → Map(key → canvas)
  const results = new WeakMap();

  // Returns the photo with its background processed, or null if a needed
  // image is still loading (onPending is called when it arrives).
  function process(src, mask, p, maxSide, opts) {
    const q = params(p), showMask = !!(opts && opts.showMask);
    const SW = src.naturalWidth || src.width, SH = src.naturalHeight || src.height;
    const k = Math.min(1, maxSide / Math.max(SW, SH)), W = Math.round(SW * k), H = Math.round(SH * k);
    let bgImg = null;
    if (q.mode === 'image' && q.image) {
      bgImg = global.DZ.img(q.image, opts && opts.onPending);
      if (!bgImg) return null;
    }
    const key = [W, q.blur, q.exposure, q.saturation, q.temperature, q.mode, q.color, q.image ? q.image.length + q.image.slice(-24) : '', q.softness, q.shift, showMask].join('|');
    let rc = results.get(src);
    if (!rc) { rc = new Map(); results.set(src, rc); }
    if (rc.has(key)) { const c = rc.get(key); rc.delete(key); rc.set(key, c); return c; }

    const base = canvas(W, H), bx = base.getContext('2d');
    bx.imageSmoothingQuality = 'high';
    bx.drawImage(src, 0, 0, W, H);
    const S = bx.getImageData(0, 0, W, H), s = S.data;
    const m = maskArray(mask, W, H, q);

    // Edge decontamination: in soft edge pixels the photo is a mix of subject
    // and background. Estimate the local background colour (blurred, with the
    // subject cut out) and solve for the subject's own colour, so the old
    // background doesn't show as a light or dark rim after it changes.
    let F = null;
    {
      const cut = canvas(W, H), cx = cut.getContext('2d'), cd = cx.createImageData(W, H), c = cd.data;
      for (let i = 0, j = 0; j < m.length; i += 4, j++) { c[i] = s[i]; c[i + 1] = s[i + 1]; c[i + 2] = s[i + 2]; c[i + 3] = (1 - m[j]) * 255; }
      cx.putImageData(cd, 0, 0);
      const est = global.DZ.blurredCopy(cut, Math.max(3, 0.012 * Math.max(W, H))).getContext('2d').getImageData(0, 0, W, H).data;
      F = new Uint8ClampedArray(s.length);
      for (let i = 0, j = 0; j < m.length; i += 4, j++) {
        const a = m[j];
        if (a > 0.02 && a < 0.995 && est[i + 3] > 4) {
          const k = 1 / Math.max(a, 0.25);
          F[i] = (s[i] - (1 - a) * est[i]) * k; F[i + 1] = (s[i + 1] - (1 - a) * est[i + 1]) * k; F[i + 2] = (s[i + 2] - (1 - a) * est[i + 2]) * k;
        } else { F[i] = s[i]; F[i + 1] = s[i + 1]; F[i + 2] = s[i + 2]; }
      }
    }

    // Background pixels
    let bg = null, bgA = null;
    if (q.mode === 'keep' && q.blur > 0) {
      // Blur the background with the subject cut out: the browser blurs with
      // premultiplied alpha, so reading it back gives background colours with
      // no glow of the subject bleeding into them.
      const cut = canvas(W, H), cx = cut.getContext('2d'), cd = cx.createImageData(W, H), c = cd.data;
      for (let i = 0, j = 0; j < m.length; i += 4, j++) { c[i] = s[i]; c[i + 1] = s[i + 1]; c[i + 2] = s[i + 2]; c[i + 3] = (1 - m[j]) * 255; }
      cx.putImageData(cd, 0, 0);
      const bl = global.DZ.blurredCopy(cut, q.blur / 100 * 0.035 * Math.max(W, H));
      bg = bl.getContext('2d').getImageData(0, 0, W, H).data; bgA = true;
    } else if (q.mode === 'color') {
      const c = canvas(W, H), x = c.getContext('2d'); x.fillStyle = q.color || '#000'; x.fillRect(0, 0, W, H);
      bg = x.getImageData(0, 0, W, H).data;
    } else if (q.mode === 'image' && bgImg) {
      const c = canvas(W, H), x = c.getContext('2d');
      global.DZ.drawCover(x, bgImg, 0, 0, W, H);
      if (q.blur > 0) { const b = global.DZ.blurredCopy(c, q.blur / 100 * 0.035 * Math.max(W, H)); x.drawImage(b, 0, 0); }
      bg = x.getImageData(0, 0, W, H).data;
    }

    const exp = Math.pow(2, q.exposure / 60), sat = 1 + q.saturation / 100, temp = q.temperature / 100;
    const adjust = q.exposure || q.saturation || q.temperature;
    const transparent = q.mode === 'transparent';
    const out = bx.createImageData(W, H), o = out.data;
    for (let i = 0, j = 0; j < m.length; i += 4, j++) {
      const a = m[j];
      let br = s[i], bgg = s[i + 1], bb = s[i + 2];
      if (bg && (!bgA || bg[i + 3] > 6)) { br = bg[i]; bgg = bg[i + 1]; bb = bg[i + 2]; }
      if (adjust && !transparent && a < 1) {
        br *= exp; bgg *= exp; bb *= exp;
        if (temp) { br += temp * 22; bb -= temp * 22; }
        if (sat !== 1) { const l = 0.2126 * br + 0.7152 * bgg + 0.0722 * bb; br = l + (br - l) * sat; bgg = l + (bgg - l) * sat; bb = l + (bb - l) * sat; }
      }
      let r = F[i] * a + br * (1 - a), g = F[i + 1] * a + bgg * (1 - a), b = F[i + 2] * a + bb * (1 - a);
      let al = transparent ? s[i + 3] * a : s[i + 3];
      if (showMask) { const t = (1 - a) * 0.55; r = r * (1 - t) + 255 * t; g *= (1 - t); b = b * (1 - t) + 60 * t; if (transparent) al = s[i + 3]; }
      o[i] = r; o[i + 1] = g; o[i + 2] = b; o[i + 3] = al;
    }
    bx.putImageData(out, 0, 0);
    rc.set(key, base);
    while (rc.size > 4) rc.delete(rc.keys().next().value);
    return base;
  }

  global.DZBg = { active, process, shapedMask, params, DEFAULTS };
})(window);
