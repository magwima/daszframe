/* DASZFRAME — project files and autosave (store.js)
   serialize/deserialize turn the layer list into plain JSON for .daszframe
   files and autosave. Every image (photo, fragment, thumbnail) is stored once
   in an `images` table and referenced by key, so duplicated fragments don't
   multiply the file size. Autosave uses IndexedDB, which can hold full-size
   photos (localStorage cannot). Attaches window.DZStore. */
(function (global) {
  'use strict';

  const FORMAT = 4;

  function imgElToDataURL(imgEl) {
    if (!imgEl || !imgEl.naturalWidth) return null;
    const c = document.createElement('canvas');
    c.width = imgEl.naturalWidth; c.height = imgEl.naturalHeight;
    c.getContext('2d').drawImage(imgEl, 0, 0);
    try { return c.toDataURL('image/jpeg', 0.92); } catch (_) { return null; }
  }

  // layers → {format, ..., images:{k:dataUrl}, layers:[...refs]}
  function serialize(state, srcDataCache) {
    const images = {}, keyOf = new Map();
    let n = 0;
    const ref = (data) => {
      if (!data) return null;
      if (!keyOf.has(data)) { const k = 'i' + (n++); keyOf.set(data, k); images[k] = data; }
      return { $img: keyOf.get(data) };
    };
    const frag = (f) => ({ ...f, dataUrl: ref(f.dataUrl), thumb: ref(f.thumb) });
    const layers = state.layers.map(l => {
      let src = null;
      if (l.type === 'photo' || l.type === 'collage') {
        src = srcDataCache && srcDataCache.get(l.imgEl);
        if (!src) { src = imgElToDataURL(l.imgEl); if (srcDataCache && src) srcDataCache.set(l.imgEl, src); }
      }
      return { ...l, imgEl: undefined, srcUrl: undefined, srcData: ref(src),
        fragments: (l.fragments || []).map(frag), placed: (l.placed || []).map(frag) };
    });
    return { format: FORMAT, name: state.name, savedAt: new Date().toISOString(),
      canvasSizeId: state.canvasSizeId, canvasCustom: state.canvasCustom || null, bgColor: state.bgColor, layoutMode: state.layoutMode,
      activeLayerId: state.activeLayerId, images, layers };
  }

  async function deserialize(session) {
    const images = session.images || {};
    const val = (v) => (v && typeof v === 'object' && v.$img) ? images[v.$img] : v;
    const frag = (f) => ({ ...f, dataUrl: val(f.dataUrl), thumb: val(f.thumb) || val(f.dataUrl) });
    const layers = await Promise.all((session.layers || []).map(async l => {
      const out = { ...l, fragments: (l.fragments || []).map(frag), placed: (l.placed || []).map(frag) };
      const src = val(l.srcData) || l.srcUrl;
      delete out.srcData;
      if ((l.type === 'photo' || l.type === 'collage') && src) {
        try {
          const im = new Image();
          await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = src; });
          out.imgEl = im; out.srcUrl = src;
        } catch (_) { out.imgEl = null; out.srcUrl = null; }
      }
      return out;
    }));
    return { ...session, layers };
  }

  // ── IndexedDB autosave ──────────────────────────────────────────────────────
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      if (!global.indexedDB) return rej(new Error('IndexedDB unavailable'));
      const r = indexedDB.open('daszframe', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function op(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction('kv', mode), s = t.objectStore('kv');
      const r = fn(s);
      t.oncomplete = () => res(r && r.result);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  }
  const saveAutosave = (session) => op('readwrite', s => s.put(session, 'autosave'));
  const loadAutosave = () => op('readonly', s => s.get('autosave')).catch(() => null);
  const clearAutosave = () => op('readwrite', s => s.delete('autosave')).catch(() => {});

  global.DZStore = { serialize, deserialize, saveAutosave, loadAutosave, clearAutosave, imgElToDataURL };
})(window);
