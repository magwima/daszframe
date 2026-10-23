/* DASZFRAME — subject / background separation (seg.js)
   Finds the people in a photo with MediaPipe Selfie Segmentation (Apache-2.0,
   bundled under vendor/selfie, ~6 MB, loaded the first time background tools
   are used), then refines the mask with a guided filter so its edges follow
   the real edges in the photo (hair, shoulders). Runs on the device.
   get(imgEl, onReady) returns a mask canvas (alpha = how much is "subject")
   or null while it is being worked out. Attaches window.DZSeg. */
(function (global) {
  'use strict';

  const SCRIPT = document.currentScript ? document.currentScript.src : document.baseURI;
  const BASE = new URL('../vendor/selfie/', SCRIPT).href;
  const WORK = 1600; // refined mask resolution (long side)

  let ready = null, queue = Promise.resolve();
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  }
  function ensure() {
    if (!ready) {
      ready = (async () => {
        if (!global.SelfieSegmentation) await loadScript(BASE + 'selfie_segmentation.js');
        const ss = new global.SelfieSegmentation({ locateFile: (f) => BASE + f });
        ss.setOptions({ modelSelection: 0 });
        await ss.initialize();
        return ss;
      })().catch(e => { ready = null; throw e; });
    }
    return ready;
  }

  // Run the model (one photo at a time) and return the raw mask as a canvas.
  async function rawMask(imgEl) {
    const ss = await ensure();
    const W = imgEl.naturalWidth, H = imgEl.naturalHeight, k = Math.min(1, 1280 / Math.max(W, H));
    const c = document.createElement('canvas');
    c.width = Math.round(W * k); c.height = Math.round(H * k);
    c.getContext('2d').drawImage(imgEl, 0, 0, c.width, c.height);
    const run = queue.then(() => new Promise((res, rej) => {
      ss.onResults((r) => {
        const m = document.createElement('canvas');
        m.width = c.width; m.height = c.height;
        m.getContext('2d').drawImage(r.segmentationMask, 0, 0, m.width, m.height);
        res(m);
      });
      ss.send({ image: c }).catch(rej);
    }));
    queue = run.catch(() => {});
    return run;
  }

  // Mean filter with a (2r+1)² window, edge-aware counts, two separable passes.
  function boxMean(src, w, h, r) {
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const o = y * w; let s = 0, n = 0;
      for (let x = 0; x <= Math.min(r, w - 1); x++) { s += src[o + x]; n++; }
      for (let x = 0; x < w; x++) {
        tmp[o + x] = s / n;
        const a = x + r + 1, b = x - r;
        if (a < w) { s += src[o + a]; n++; }
        if (b >= 0) { s -= src[o + b]; n--; }
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let y = 0; y <= Math.min(r, h - 1); y++) { s += tmp[y * w + x]; n++; }
      for (let y = 0; y < h; y++) {
        out[y * w + x] = s / n;
        const a = y + r + 1, b = y - r;
        if (a < h) { s += tmp[a * w + x]; n++; }
        if (b >= 0) { s -= tmp[b * w + x]; n--; }
      }
    }
    return out;
  }

  // Clean-up before refining: fill small holes inside the subject (a patch of
  // clothing mistaken for background) and drop small detached "subject"
  // specks (a lamp, a poster). Works on a 0..1 mask in place.
  function cleanup(p, w, h) {
    const N = w * h, lab = new Int32Array(N), stack = new Int32Array(N);
    const regions = (isIn) => {
      lab.fill(0); const out = [];
      for (let i = 0; i < N; i++) {
        if (lab[i] || !isIn(p[i])) continue;
        const id = out.length + 1; let sp = 0, n = 0, edge = false; const px = [];
        stack[sp++] = i; lab[i] = id;
        while (sp) {
          const j = stack[--sp]; n++; px.push(j);
          const x = j % w, y = (j - x) / w;
          if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
          if (x > 0 && !lab[j - 1] && isIn(p[j - 1])) { lab[j - 1] = id; stack[sp++] = j - 1; }
          if (x < w - 1 && !lab[j + 1] && isIn(p[j + 1])) { lab[j + 1] = id; stack[sp++] = j + 1; }
          if (y > 0 && !lab[j - w] && isIn(p[j - w])) { lab[j - w] = id; stack[sp++] = j - w; }
          if (y < h - 1 && !lab[j + w] && isIn(p[j + w])) { lab[j + w] = id; stack[sp++] = j + w; }
        }
        out.push({ n, edge, px });
      }
      return out;
    };
    // Holes: background regions that don't touch the photo's edge.
    for (const r of regions(v => v < 0.5)) if (!r.edge && r.n < N * 0.006) for (const j of r.px) p[j] = 1;
    // Specks: subject regions much smaller than the biggest one.
    const subj = regions(v => v >= 0.5);
    const big = subj.reduce((m, r) => Math.max(m, r.n), 0);
    for (const r of subj) if (r.n < Math.max(N * 0.015, big * 0.08)) for (const j of r.px) p[j] = 0;
  }

  // Guided filter (He et al.): smooths the mask but makes its edges follow
  // the edges of the photo itself, which recovers hair and fine outlines.
  function refine(imgEl, raw) {
    const W = imgEl.naturalWidth, H = imgEl.naturalHeight, k = Math.min(1, WORK / Math.max(W, H));
    const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k)), N = w * h;
    const ic = document.createElement('canvas'); ic.width = w; ic.height = h;
    const ix = ic.getContext('2d'); ix.drawImage(imgEl, 0, 0, w, h);
    const id = ix.getImageData(0, 0, w, h).data;
    ix.clearRect(0, 0, w, h); ix.imageSmoothingQuality = 'high'; ix.drawImage(raw, 0, 0, w, h);
    const md = ix.getImageData(0, 0, w, h).data;
    const I = new Float32Array(N), p = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      I[i] = (0.299 * id[i * 4] + 0.587 * id[i * 4 + 1] + 0.114 * id[i * 4 + 2]) / 255;
      p[i] = Math.max(md[i * 4], md[i * 4 + 3] < 255 ? md[i * 4 + 3] : 0) / 255;
    }
    cleanup(p, w, h);
    // The model's mask runs a few pixels past the real outline. Shrink it,
    // then let the guided filter grow it back only where the photo has a
    // real edge (hair against a bright window, a shoulder against a wall).
    const L = Math.max(w, h), re = Math.max(1, Math.round(L * 0.006));
    const bin = new Float32Array(N);
    for (let i = 0; i < N; i++) bin[i] = p[i] >= 0.5 ? 1 : 0;
    const er = boxMean(bin, w, h, re);
    for (let i = 0; i < N; i++) p[i] = er[i] > 0.999 ? 1 : (bin[i] ? 0.5 * er[i] : 0);
    const r = Math.max(2, Math.round(L * 0.011)), eps = 0.0004;
    const II = new Float32Array(N), Ip = new Float32Array(N);
    for (let i = 0; i < N; i++) { II[i] = I[i] * I[i]; Ip[i] = I[i] * p[i]; }
    const mI = boxMean(I, w, h, r), mp = boxMean(p, w, h, r), mII = boxMean(II, w, h, r), mIp = boxMean(Ip, w, h, r);
    const A = new Float32Array(N), B = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const v = mII[i] - mI[i] * mI[i], cv = mIp[i] - mI[i] * mp[i];
      A[i] = cv / (v + eps); B[i] = mp[i] - A[i] * mI[i];
    }
    const mA = boxMean(A, w, h, r), mB = boxMean(B, w, h, r);
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const ox = out.getContext('2d'), od = ox.createImageData(w, h), d = od.data;
    for (let i = 0; i < N; i++) {
      const q = mA[i] * I[i] + mB[i];
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255;
      d[i * 4 + 3] = q <= 0 ? 0 : q >= 1 ? 255 : q * 255;
    }
    ox.putImageData(od, 0, 0);
    return out;
  }

  const entries = new WeakMap(); // imgEl → {state, canvas, waiters}
  function start(imgEl) {
    const e = { state: 'pending', canvas: null, waiters: [] };
    entries.set(imgEl, e);
    rawMask(imgEl)
      .then(raw => { e.canvas = refine(imgEl, raw); e.state = 'ready'; })
      .catch(err => { console.warn('Background separation unavailable:', err); e.state = 'failed'; })
      .then(() => { e.waiters.splice(0).forEach(f => { try { f(); } catch (_) {} }); });
    return e;
  }
  function get(imgEl, onReady) {
    if (!imgEl || !imgEl.naturalWidth) return null;
    const e = entries.get(imgEl) || start(imgEl);
    if (e.state === 'ready') return e.canvas;
    if (e.state === 'pending' && onReady && !e.waiters.includes(onReady)) e.waiters.push(onReady);
    return null;
  }
  const status = (imgEl) => { const e = imgEl && entries.get(imgEl); return e ? e.state : 'none'; };
  function retry(imgEl) { if (status(imgEl) === 'failed') entries.delete(imgEl); }

  global.DZSeg = { get, status, retry, ensure };
})(window);
