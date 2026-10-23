/* DASZFRAME — face detection (faces.js)
   Finds the largest face in a photo and turns its 68 landmarks into the 13
   fragment regions (eyes, nose, mouth, cheeks, forehead, chin, halves, strips).
   Runs entirely in the browser: photos never leave the device. The detector
   (face-api, MIT) and its models are bundled under vendor/ and only downloaded
   the first time someone makes a collage. Attaches window.DZFaces. */
(function (global) {
  'use strict';

  const BASE = new URL('vendor/face-api/', document.currentScript ? document.currentScript.src.replace(/js\/[^/]*$/, '') : document.baseURI).href;
  let loading = null;

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  }

  function ensure() {
    if (!loading) {
      loading = (async () => {
        if (!global.faceapi) await loadScript(BASE + 'face-api.js');
        const fa = global.faceapi;
        if (fa.tf && fa.tf.ready) await fa.tf.ready();
        // face-api mis-parses non-http URLs (e.g. chrome-extension://), so pass
        // the path only; it resolves against the page origin either way.
        const modelPath = new URL('model', BASE).pathname;
        await fa.nets.tinyFaceDetector.loadFromUri(modelPath);
        await fa.nets.faceLandmark68Net.loadFromUri(modelPath);
        return fa;
      })().catch(e => { loading = null; throw e; });
    }
    return loading;
  }

  // Returns {points:[{x,y}] in source-image pixels, faces:n} or null if no face.
  async function detect(imgEl) {
    const fa = await ensure();
    const W = imgEl.naturalWidth, H = imgEl.naturalHeight;
    const s = Math.min(1, 1024 / Math.max(W, H));
    const c = document.createElement('canvas');
    c.width = Math.round(W * s); c.height = Math.round(H * s);
    c.getContext('2d').drawImage(imgEl, 0, 0, c.width, c.height);
    let res = [];
    for (const inputSize of [512, 320, 608]) {
      res = await fa.detectAllFaces(c, new fa.TinyFaceDetectorOptions({ inputSize, scoreThreshold: 0.35 })).withFaceLandmarks();
      if (res.length) break;
    }
    if (!res.length) return null;
    const best = res.reduce((a, b) => (b.detection.box.area > a.detection.box.area ? b : a));
    // Only count other faces that are a real size (ignores tiny false hits).
    const faces = res.filter(r => r.detection.box.area >= best.detection.box.area * 0.2 && r.detection.score >= 0.5).length || 1;
    return { faces, points: best.landmarks.positions.map(p => ({ x: p.x / s, y: p.y / s })) };
  }

  // 68-point layout: jaw 0–16 · brows 17–26 · nose 27–35 · eyes 36–47 · mouth 48–67.
  // "Left"/"Right" mean the left/right side of the picture, as before.
  function regionsFromLandmarks(P, W, H) {
    const pts = (a, b) => P.slice(a, b + 1);
    const bbox = (ps) => {
      const xs = ps.map(p => p.x), ys = ps.map(p => p.y);
      return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    };
    const ctr = (ps) => ({ x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length });
    // Normalised box, robust to tilted heads (corners may arrive swapped) and
    // never thinner than `minS` pixels on either side.
    let minS = 1;
    const box = (x0, y0, x1, y1) => {
      if (x1 < x0) [x0, x1] = [x1, x0];
      if (y1 < y0) [y0, y1] = [y1, y0];
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const w = Math.max(x1 - x0, minS), h = Math.max(y1 - y0, minS);
      x0 = Math.max(0, cx - w / 2); x1 = Math.min(W, cx + w / 2);
      y0 = Math.max(0, cy - h / 2); y1 = Math.min(H, cy + h / 2);
      return { x: x0 / W, y: y0 / H, w: Math.max(1, x1 - x0) / W, h: Math.max(1, y1 - y0) / H };
    };
    const around = (c, w, h) => box(c.x - w / 2, c.y - h / 2, c.x + w / 2, c.y + h / 2);

    const face = bbox(pts(0, 26));
    const faceW = face.x1 - face.x0;
    minS = faceW * 0.14;
    const browTop = Math.min(...pts(17, 26).map(p => p.y));
    const chinY = P[8].y;
    const faceH = chinY - browTop;
    const midX = (P[27].x + P[30].x + P[33].x + P[51].x + P[57].x) / 5;

    const eyeL = pts(36, 41), eyeR = pts(42, 47);
    const eyeLw = bbox(eyeL).x1 - bbox(eyeL).x0, eyeRw = bbox(eyeR).x1 - bbox(eyeR).x0;
    const eyeW = Math.max(eyeLw, eyeRw);
    const nose = bbox(pts(27, 35)), mouth = bbox(pts(48, 59));

    const headTop = browTop - faceH * 0.45;
    const head = { x0: face.x0 - faceW * 0.18, x1: face.x1 + faceW * 0.18, y0: headTop, y1: chinY + faceH * 0.08 };
    const headH = head.y1 - head.y0;

    const R = [
      ['leftEye', 'Left Eye', around(ctr(eyeL), eyeW * 2.1, eyeW * 1.25)],
      ['rightEye', 'Right Eye', around(ctr(eyeR), eyeW * 2.1, eyeW * 1.25)],
      ['nose', 'Nose', box(P[31].x - (P[35].x - P[31].x) * 0.55, nose.y0 + (nose.y1 - nose.y0) * 0.05,
        P[35].x + (P[35].x - P[31].x) * 0.55, nose.y1 + (nose.y1 - nose.y0) * 0.12)],
      ['mouth', 'Mouth', around(ctr(pts(48, 59)), (mouth.x1 - mouth.x0) * 1.45, Math.max((mouth.y1 - mouth.y0) * 1.9, (mouth.x1 - mouth.x0) * 0.6))],
      ['leftCheek', 'Left Cheek', box(P[1].x, P[29].y, P[31].x - (P[31].x - P[1].x) * 0.1, P[4].y)],
      ['rightCheek', 'Right Cheek', box(P[35].x + (P[15].x - P[35].x) * 0.1, P[29].y, P[15].x, P[12].y)],
      ['forehead', 'Forehead', box(face.x0 + faceW * 0.08, headTop + faceH * 0.15, face.x1 - faceW * 0.08, browTop + (P[37].y - browTop) * 0.35)],
      ['chin', 'Chin', box(P[5].x, mouth.y1 - (mouth.y1 - mouth.y0) * 0.2, P[11].x, chinY + faceH * 0.08)],
      ['leftHalf', 'Left Half', box(head.x0, head.y0, midX, head.y1)],
      ['rightHalf', 'Right Half', box(midX, head.y0, head.x1, head.y1)],
      ['topStrip', 'Top Strip', box(head.x0, head.y0, head.x1, head.y0 + headH * 0.36)],
      ['midStrip', 'Mid Strip', box(head.x0, head.y0 + headH * 0.36, head.x1, head.y0 + headH * 0.66)],
      ['botStrip', 'Bot Strip', box(head.x0, head.y0 + headH * 0.66, head.x1, head.y1)],
    ];
    return R.map(([id, label, area]) => ({ id, label, area }));
  }

  global.DZFaces = { ensure, detect, regionsFromLandmarks };
})(window);
