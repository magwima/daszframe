/* DASZFRAME — AI Fragment Portrait Studio v1.1
   Full-tab, responsive, collapsible panels, view modes */

const { createElement: h, useState, useRef, useEffect, useCallback, Fragment } = React;

// ── Constants ─────────────────────────────────────────────────────────────────
const LAYOUT_MODES = [
  { id: 'dasz',         label: 'DASZ',       icon: '◉', signature: true },
  { id: 'mosaic',       label: 'Mosaic',     icon: '▦' },
  { id: 'editorial',   label: 'Editorial',  icon: '◈' },
  { id: 'cubist',      label: 'Cubist',     icon: '◇' },
  { id: 'symmetry',    label: 'Symmetry',   icon: '⊞' },
  { id: 'gallery',     label: 'Gallery',    icon: '⊡' },
  { id: 'experimental',label: 'Experiment', icon: '✦' },
];

const STYLES = [
  { id: 'original',  label: 'Original'  },
  { id: 'bw',        label: 'B & W'     },
  { id: 'vintage',   label: 'Vintage'   },
  { id: 'cinematic', label: 'Cinema'    },
  { id: 'editorial', label: 'Editorial' },
  { id: 'halftone',  label: 'Halftone'  },
];

const FACE_REGIONS = [
  { id: 'leftEye',    label: 'Left Eye',    area: { x: 0.18, y: 0.26, w: 0.24, h: 0.16 } },
  { id: 'rightEye',   label: 'Right Eye',   area: { x: 0.58, y: 0.26, w: 0.24, h: 0.16 } },
  { id: 'nose',       label: 'Nose',        area: { x: 0.35, y: 0.42, w: 0.30, h: 0.20 } },
  { id: 'mouth',      label: 'Mouth',       area: { x: 0.26, y: 0.62, w: 0.48, h: 0.18 } },
  { id: 'leftCheek',  label: 'Left Cheek',  area: { x: 0.04, y: 0.38, w: 0.28, h: 0.28 } },
  { id: 'rightCheek', label: 'Right Cheek', area: { x: 0.68, y: 0.38, w: 0.28, h: 0.28 } },
  { id: 'forehead',   label: 'Forehead',    area: { x: 0.14, y: 0.04, w: 0.72, h: 0.22 } },
  { id: 'chin',       label: 'Chin',        area: { x: 0.28, y: 0.80, w: 0.44, h: 0.18 } },
  { id: 'leftHalf',   label: 'Left Half',   area: { x: 0.00, y: 0.00, w: 0.50, h: 1.00 } },
  { id: 'rightHalf',  label: 'Right Half',  area: { x: 0.50, y: 0.00, w: 0.50, h: 1.00 } },
  { id: 'topStrip',   label: 'Top Strip',   area: { x: 0.00, y: 0.00, w: 1.00, h: 0.34 } },
  { id: 'midStrip',   label: 'Mid Strip',   area: { x: 0.00, y: 0.34, w: 1.00, h: 0.33 } },
  { id: 'botStrip',   label: 'Bot Strip',   area: { x: 0.00, y: 0.67, w: 1.00, h: 0.33 } },
];

const CANVAS_SIZES = [
  { id: 'sm',   label: 'SM',   w: 480,  h: 480  },
  { id: 'md',   label: 'MD',   w: 600,  h: 600  },
  { id: 'lg',   label: 'LG',   w: 760,  h: 760  },
  { id: 'wide', label: 'WIDE', w: 900,  h: 600  },
];

// ── Utilities ─────────────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2, 9); }
function tick() { return new Promise(r => setTimeout(r, 16)); }

function extractFragment(imgEl, region, size = 400) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const sw = imgEl.naturalWidth, sh = imgEl.naturalHeight;
  ctx.drawImage(imgEl, region.x * sw, region.y * sh, region.w * sw, region.h * sh, 0, 0, size, size);
  return c.toDataURL('image/jpeg', 0.92);
}
function extractThumb(imgEl, region) { return extractFragment(imgEl, region, 80); }

function styleFilter(fragStyle, globalStyle) {
  const st = fragStyle === 'original' ? globalStyle : fragStyle;
  if (st === 'bw')        return 'grayscale(1)';
  if (st === 'vintage')   return 'sepia(0.55) brightness(1.06) contrast(0.95)';
  if (st === 'cinematic') return 'contrast(1.12) saturate(0.75) brightness(0.96)';
  if (st === 'editorial') return 'contrast(1.04) brightness(1.02) saturate(0.9)';
  if (st === 'halftone')  return 'contrast(2) grayscale(1)';
  return 'none';
}

// ── DASZ Signature Layout ─────────────────────────────────────────────────────
// Replicates the photo-joiner collage style: variable zoom levels, paper background,
// hero eye fragment, subtle hand-placed rotations (±5°), visible gaps between pieces.
function composeDaszLayout(fragments, cw, ch) {
  const placed = [];

  // Helper: find fragment by label, fallback to index
  const get = (label, fallbackIdx = 0) =>
    fragments.find(f => f.label === label) || fragments[fallbackIdx];

  // Subtle rotation: ±4.5°, feels hand-placed not random
  const rot = () => (Math.random() - 0.5) * 9;
  // Small positional jitter so reruns feel fresh
  const jit = (v, range = 0.03) => v + (Math.random() - 0.5) * cw * range;

  // ── 1. Forehead — wide strip across top ──────────────────────────────────────
  //    ~62% canvas width, positioned upper-center. The "roof" of the face.
  placed.push({ ...get('Forehead', 6), id: uid(),
    x: jit(cw * 0.18), y: jit(ch * 0.03, 0.015),
    w: cw * 0.62, h: ch * 0.19,
    rotation: rot(), zIndex: 1,
  });

  // ── 2. Left side profile — tall slab on left edge ────────────────────────────
  //    Shows a compressed side-view; gives the left edge depth.
  placed.push({ ...get('Left Half', 8), id: uid(),
    x: jit(cw * 0.02, 0.02), y: jit(ch * 0.23),
    w: cw * 0.21, h: ch * 0.40,
    rotation: rot(), zIndex: 2,
  });

  // ── 3. Left eye — medium, slightly zoomed, center-left ───────────────────────
  //    Glasses visible; smaller than hero to create scale contrast.
  placed.push({ ...get('Left Eye', 0), id: uid(),
    x: jit(cw * 0.21), y: jit(ch * 0.27),
    w: cw * 0.24, h: ch * 0.19,
    rotation: rot(), zIndex: 4,
  });

  // ── 4. HERO — Right eye large, dead center ───────────────────────────────────
  //    The defining fragment. Blown up 2–3× natural scale. Anchors the whole piece.
  placed.push({ ...get('Right Eye', 1), id: uid(),
    x: jit(cw * 0.38), y: jit(ch * 0.21),
    w: cw * 0.46, h: ch * 0.30,
    rotation: rot(), zIndex: 8,
  });

  // ── 5. Right side profile — right edge, mid-height ───────────────────────────
  //    Flipped to face inward; mirrors the left profile slab.
  placed.push({ ...get('Right Half', 9), id: uid(),
    x: jit(cw * 0.78, 0.02), y: jit(ch * 0.26),
    w: cw * 0.20, h: ch * 0.32,
    rotation: rot(), zIndex: 3, flipped: true,
  });

  // ── 6. Nose — mid-center, below the eye hero ─────────────────────────────────
  //    Slightly wider crop so it reads clearly at mid-size.
  placed.push({ ...get('Nose', 2), id: uid(),
    x: jit(cw * 0.34), y: jit(ch * 0.49),
    w: cw * 0.30, h: ch * 0.23,
    rotation: rot(), zIndex: 5,
  });

  // ── 7. Right cheek / small profile — lower right ─────────────────────────────
  //    Small accent piece; adds the right-edge beard/jaw detail.
  placed.push({ ...get('Right Cheek', 5), id: uid(),
    x: jit(cw * 0.74), y: jit(ch * 0.55),
    w: cw * 0.20, h: ch * 0.23,
    rotation: rot(), zIndex: 3,
  });

  // ── 8. Chin / lower face — wide, bottom center ───────────────────────────────
  //    Beard and jaw; second-largest fragment, grounds the composition.
  placed.push({ ...get('Chin', 7), id: uid(),
    x: jit(cw * 0.22), y: jit(ch * 0.69),
    w: cw * 0.52, h: ch * 0.27,
    rotation: rot(), zIndex: 6,
  });

  return placed;
}

function composeLayout(fragments, mode, cw, ch) {
  if (mode === 'dasz') return composeDaszLayout(fragments, cw, ch);
  const n = fragments.length;
  const placed = [];
  if (mode === 'mosaic') {
    const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
    const cellW = cw / cols, cellH = ch / rows;
    fragments.forEach((f, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const scale = 0.82 + Math.random() * 0.22;
      const w = cellW * scale, hh = cellH * scale;
      placed.push({ ...f, id: uid(), x: col*cellW+(cellW-w)/2, y: row*cellH+(cellH-hh)/2, w, h: hh, rotation: (Math.random()-0.5)*10, zIndex: i });
    });
  } else if (mode === 'editorial') {
    const cx = cw/2, cy = ch/2;
    fragments.forEach((f, i) => {
      const angle = (i/n)*Math.PI*2 - Math.PI/2;
      const r = Math.min(cw, ch)*0.28, size = 75+Math.random()*110;
      placed.push({ ...f, id: uid(), x: cx+Math.cos(angle)*r-size/2, y: cy+Math.sin(angle)*r-size/2, w: size, h: size, rotation: (Math.random()-0.5)*22, zIndex: i });
    });
  } else if (mode === 'cubist') {
    fragments.forEach((f, i) => {
      const size = 65+Math.random()*160;
      placed.push({ ...f, id: uid(), x: Math.random()*(cw-size), y: Math.random()*(ch-size), w: size, h: size, rotation: (Math.random()-0.5)*50, zIndex: i });
    });
  } else if (mode === 'symmetry') {
    const half = Math.ceil(n/2);
    fragments.slice(0, half).forEach((f, i) => {
      const yPos = (i/half)*ch*0.85+ch*0.05, size = 72+Math.random()*80;
      placed.push({ ...f, id: uid(), x: cw*0.06, y: yPos, w: size, h: size, rotation: 0, zIndex: i });
      placed.push({ ...fragments[i%n], id: uid(), x: cw*0.94-size, y: yPos, w: size, h: size, rotation: 0, flipped: true, zIndex: i+half });
    });
  } else if (mode === 'gallery') {
    const mainSize = Math.min(cw, ch)*0.52;
    placed.push({ ...fragments[0], id: uid(), x: cw/2-mainSize/2, y: ch/2-mainSize/2, w: mainSize, h: mainSize, rotation: 0, zIndex: 10 });
    const pos = [[0.04,0.04],[0.72,0.04],[0.04,0.72],[0.72,0.72],[0.38,0.02],[0.38,0.86],[0.02,0.38],[0.86,0.38],[0.82,0.38],[0.20,0.02],[0.58,0.02]];
    fragments.slice(1).forEach((f, i) => {
      const size = 50+Math.random()*60, [px,py] = pos[i%pos.length];
      placed.push({ ...f, id: uid(), x: px*cw, y: py*ch, w: size, h: size, rotation: (Math.random()-0.5)*18, zIndex: i });
    });
  } else {
    fragments.forEach((f, i) => {
      const size = 45+Math.random()*210;
      placed.push({ ...f, id: uid(), x: Math.random()*(cw-size), y: Math.random()*(ch-size), w: size, h: size, rotation: (Math.random()-0.5)*65, zIndex: i });
    });
  }
  return placed;
}

// ── App ───────────────────────────────────────────────────────────────────────
function App() {
  const [sourceImage, setSourceImage] = useState(null);
  const [sourceImg,   setSourceImg]   = useState(null);
  const [fragments,   setFragments]   = useState([]);
  const [placed,      setPlaced]      = useState([]);
  const [selectedId,  setSelectedId]  = useState(null);
  const [layoutMode,  setLayoutMode]  = useState('mosaic');
  const [globalStyle, setGlobalStyle] = useState('original');
  const [bgColor,     setBgColor]     = useState('#0f0f0f');
  const [isLoading,   setIsLoading]   = useState(false);
  const [loadingMsg,  setLoadingMsg]  = useState('');
  const [aiNote,      setAiNote]      = useState('');
  const [tab,         setTab]         = useState('layers');
  const [showExport,  setShowExport]  = useState(false);
  const [showVars,    setShowVars]    = useState(false);
  const [variations,  setVariations]  = useState([]);
  const [isDragOver,  setIsDragOver]  = useState(false);
  const [dragState,   setDragState]   = useState(null);
  const [leftOpen,    setLeftOpen]    = useState(true);
  const [rightOpen,   setRightOpen]   = useState(true);
  // viewMode: 'split' = panels+canvas, 'canvas' = canvas only, 'panels' = both panels prominent
  const [viewMode,    setViewMode]    = useState('split');
  const [canvasSizeId,setCanvasSizeId]= useState('md');

  const fileInputRef = useRef(null);
  const overlayRef   = useRef(null);
  const placedRef    = useRef(placed);
  useEffect(() => { placedRef.current = placed; }, [placed]);

  const cs = CANVAS_SIZES.find(s => s.id === canvasSizeId) || CANVAS_SIZES[1];
  const CW = cs.w, CH = cs.h;

  // ── File ────────────────────────────────────────────────────────────────────
  const handleFile = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    setSourceImage(url);
    const img = new Image();
    img.onload = () => setSourceImg(img);
    img.src = url;
  }, []);

  // ── Build fragments ─────────────────────────────────────────────────────────
  const buildFragments = useCallback((img) => {
    return FACE_REGIONS.map(r => ({
      id: uid(), label: r.label,
      thumb: extractThumb(img, r.area),
      dataUrl: extractFragment(img, r.area, 400),
      visible: true, locked: false, opacity: 1, style: 'original', flipped: false,
    }));
  }, []);

  // ── Analyze + Compose ───────────────────────────────────────────────────────
  const analyzeAndCompose = useCallback(async (img, mode, style) => {
    setIsLoading(true); setLoadingMsg('Detecting facial regions...'); await tick();
    const frags = buildFragments(img);
    setFragments(frags);
    setLoadingMsg('AI art director thinking...'); await tick();
    let note = 'The portrait breathes through its fragments — each shard a mirror of identity, the whole greater than its sum.';
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514', max_tokens: 200,
          messages: [{ role: 'user', content: `Art director for a fragmented portrait collage. ${frags.length} facial regions: ${frags.map(f=>f.label).join(', ')}. Layout: "${mode}", style: "${style}". 2 sentences, poetic art direction.` }]
        })
      });
      const d = await res.json();
      if (d.content?.[0]?.text) note = d.content[0].text;
    } catch(_) {}
    setAiNote(note);
    setLoadingMsg('Composing layout...'); await tick();
    setPlaced(composeLayout(frags, mode, CW, CH));
    setIsLoading(false);
  }, [buildFragments, CW, CH]);

  useEffect(() => { if (sourceImg) analyzeAndCompose(sourceImg, layoutMode, globalStyle); }, [sourceImg]); // eslint-disable-line

  const recompose = useCallback(() => {
    if (!fragments.length) return;
    setPlaced(composeLayout(fragments, layoutMode, CW, CH));
  }, [fragments, layoutMode, CW, CH]);

  // Recompose when canvas size changes (scale existing positions)
  const prevCSRef = useRef({ w: CW, h: CH });
  useEffect(() => {
    const prev = prevCSRef.current;
    if (placed.length && (prev.w !== CW || prev.h !== CH)) {
      const scaleX = CW / prev.w, scaleY = CH / prev.h;
      setPlaced(p => p.map(f => ({ ...f, x: f.x*scaleX, y: f.y*scaleY, w: f.w*scaleX, h: f.h*scaleY })));
    }
    prevCSRef.current = { w: CW, h: CH };
  }, [CW, CH]); // eslint-disable-line

  // ── Canvas Drag ─────────────────────────────────────────────────────────────
  const onFragMouseDown = useCallback((e, id) => {
    e.stopPropagation();
    setSelectedId(id);
    const frag = placedRef.current.find(f => f.id === id);
    if (!frag || frag.locked) return;
    const rect = overlayRef.current.getBoundingClientRect();
    setDragState({ id, ox: e.clientX-rect.left-frag.x, oy: e.clientY-rect.top-frag.y });
  }, []);
  const onMouseMove = useCallback((e) => {
    if (!dragState) return;
    const rect = overlayRef.current.getBoundingClientRect();
    setPlaced(p => p.map(f => f.id===dragState.id ? {...f, x: e.clientX-rect.left-dragState.ox, y: e.clientY-rect.top-dragState.oy} : f));
  }, [dragState]);
  const onMouseUp = useCallback(() => setDragState(null), []);

  // ── Fragment ops ─────────────────────────────────────────────────────────────
  const updateFrag = useCallback((id, upd) => setPlaced(p => p.map(f => f.id===id ? {...f,...upd} : f)), []);
  const deleteFrag = useCallback((id) => { setPlaced(p => p.filter(f=>f.id!==id)); if(selectedId===id) setSelectedId(null); }, [selectedId]);
  const dupFrag    = useCallback((f)  => setPlaced(p => [...p, {...f, id:uid(), x:f.x+20, y:f.y+20, zIndex:(f.zIndex||0)+1}]), []);
  const bringFwd   = useCallback((id) => { const mx=Math.max(...placedRef.current.map(f=>f.zIndex||0)); updateFrag(id,{zIndex:mx+1}); }, [updateFrag]);
  const sendBck    = useCallback((id) => { const mn=Math.min(...placedRef.current.map(f=>f.zIndex||0)); updateFrag(id,{zIndex:mn-1}); }, [updateFrag]);

  const sel = placed.find(f => f.id === selectedId);

  // ── Export ───────────────────────────────────────────────────────────────────
  const doExport = useCallback((fmt, scale) => {
    const c = document.createElement('canvas');
    c.width = CW*scale; c.height = CH*scale;
    const ctx = c.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, CW, CH);
    const sorted = [...placed].filter(f=>f.visible!==false).sort((a,b)=>(a.zIndex||0)-(b.zIndex||0));
    Promise.all(sorted.map(f => new Promise(res => {
      const img = new Image();
      img.onload = () => {
        ctx.save(); ctx.globalAlpha = f.opacity??1;
        ctx.translate(f.x+f.w/2, f.y+f.h/2);
        ctx.rotate((f.rotation||0)*Math.PI/180);
        if(f.flipped) ctx.scale(-1,1);
        ctx.drawImage(img, -f.w/2, -f.h/2, f.w, f.h);
        ctx.restore(); res();
      };
      img.src = f.dataUrl;
    }))).then(() => {
      const a = document.createElement('a');
      a.href = c.toDataURL(fmt==='jpg'?'image/jpeg':'image/png', 0.95);
      a.download = `facet-portrait.${fmt}`; a.click();
    });
  }, [placed, bgColor, CW, CH]);

  // ── Variations ───────────────────────────────────────────────────────────────
  const genVariations = useCallback(() => {
    const modes = ['dasz','mosaic','editorial','cubist','symmetry','gallery','experimental'];
    setVariations(modes.map(m => ({ mode: m, frags: composeLayout(fragments, m, CW, CH) })));
    setShowVars(true);
  }, [fragments, CW, CH]);

  // ── Render: Left Panel ───────────────────────────────────────────────────────
  function LeftPanel() {
    return h('div', { className: `panel-left${!leftOpen?' collapsed':''}` },
      h('div', { className: 'panel-header' },
        h('span', { className: 'panel-title' }, 'Controls'),
        h('button', { className: 'panel-collapse-btn', title: leftOpen?'Collapse':'Expand', onClick: ()=>setLeftOpen(o=>!o) },
          leftOpen ? '←' : '→')
      ),
      h('div', { className: 'panel-collapsed-label', onClick: ()=>setLeftOpen(true) }, 'Controls'),
      h('div', { className: 'panel-scroll' },
        // Upload
        h('div', { className: 'panel-section' },
          h('div', { className: 'panel-label' }, 'Source'),
          h('div', {
            className: `upload-zone${isDragOver?' drag':''}`,
            onClick: () => fileInputRef.current?.click(),
            onDragOver: e => { e.preventDefault(); setIsDragOver(true); },
            onDragLeave: () => setIsDragOver(false),
            onDrop: e => { e.preventDefault(); setIsDragOver(false); handleFile(e.dataTransfer.files[0]); }
          },
            sourceImage
              ? h('img', { src: sourceImage, style: { width:'100%', height:90, objectFit:'cover', borderRadius:3, display:'block' } })
              : h(Fragment, null,
                  h('div', { style:{fontSize:22,color:'var(--muted)',marginBottom:5} }, '◈'),
                  h('div', { className:'upload-text' }, h('strong',null,'Upload Portrait'), 'Click or drag here')
                )
          ),
          h('input', { ref:fileInputRef, type:'file', accept:'image/*', style:{display:'none'}, onChange:e=>handleFile(e.target.files[0]) }),
          sourceImage && h('button', { className:'btn sm full', style:{marginTop:6}, onClick:()=>fileInputRef.current?.click() }, 'Replace Image')
        ),

        // Layout
        h('div', { className: 'panel-section' },
          h('div', { className: 'panel-label' }, 'Layout'),

          // DASZ signature preset — full-width, special styling
          h('div', {
            className: `layout-chip dasz-chip${layoutMode==='dasz'?' active':''}`,
            onClick: () => {
              setLayoutMode('dasz');
              setBgColor('#e2ddd6');
              setGlobalStyle('bw');
              setTimeout(recompose, 0);
            }
          },
            h('span', {className:'chip-icon'}, '◉'),
            h('span', null, 'DASZ'),
            h('span', {className:'dasz-chip-sub'}, 'Signature preset · auto B&W')
          ),

          // Other layouts in grid
          h('div', { className: 'layout-grid', style:{marginTop:5} },
            LAYOUT_MODES.filter(m=>!m.signature).map(m => h('div', {
              key: m.id,
              className: `layout-chip${layoutMode===m.id?' active':''}`,
              onClick: () => { setLayoutMode(m.id); setTimeout(recompose, 0); }
            }, h('span',{className:'chip-icon'},m.icon), m.label))
          )
        ),

        // Style
        h('div', { className: 'panel-section' },
          h('div', { className: 'panel-label' }, 'Style'),
          h('div', { className: 'style-grid' },
            STYLES.map(s => h('div', {
              key: s.id,
              className: `style-chip${globalStyle===s.id?' active':''}`,
              onClick: () => setGlobalStyle(s.id)
            }, s.label))
          )
        ),

        // Background
        h('div', { className: 'panel-section' },
          h('div', { className: 'panel-label' }, 'Background'),
          h('div', { style:{display:'flex',gap:5,flexWrap:'wrap',alignItems:'center'} },
            ['#0f0f0f','#ffffff','#f5f0e8','#1a1a2e','#2d1b2e','#1a2e1a'].map(c =>
              h('div', { key:c, onClick:()=>setBgColor(c), style:{ width:20,height:20,background:c,borderRadius:3,cursor:'pointer',border:bgColor===c?'2px solid #e8d5a3':'1px solid rgba(255,255,255,0.15)' } })
            ),
            h('input', { type:'color', value:bgColor, onChange:e=>setBgColor(e.target.value), style:{width:20,height:20,border:'none',background:'none',cursor:'pointer',padding:0} })
          )
        ),

        // Canvas size
        h('div', { className: 'panel-section' },
          h('div', { className: 'panel-label' }, 'Canvas Size'),
          h('div', { style:{display:'flex',gap:4,flexWrap:'wrap'} },
            CANVAS_SIZES.map(s => h('button', {
              key: s.id,
              className: `size-btn${canvasSizeId===s.id?' active':''}`,
              onClick: () => setCanvasSizeId(s.id)
            }, s.label, h('span',{style:{color:'var(--muted)',fontSize:8}},` ${s.w}×${s.h}`)))
          )
        ),

        // AI note
        aiNote && h('div', { className: 'panel-section' },
          h('div', { className: 'ai-card' },
            h('div', { className: 'ai-badge' }, 'AI ART DIRECTOR'),
            h('div', { className: 'ai-text' }, aiNote)
          )
        ),

        // Actions
        sourceImg && h('div', { className: 'panel-section' },
          h('div', { className: 'panel-label' }, 'Actions'),
          h('div', { style:{display:'flex',flexDirection:'column',gap:5} },
            h('button', { className:'btn sm full', onClick:recompose }, '↻ Recompose'),
            h('button', { className:'btn sm full', onClick:()=>analyzeAndCompose(sourceImg,layoutMode,globalStyle) }, '⊕ Re-analyze'),
            placed.length>0 && h('button', { className:'btn sm full', onClick:genVariations }, '⊞ Variations')
          )
        )
      )
    );
  }

  // ── Render: Right Panel ──────────────────────────────────────────────────────
  function RightPanel() {
    return h('div', { className:`panel-right${!rightOpen?' collapsed':''}` },
      h('div', { className:'panel-header' },
        h('button', { className:'panel-collapse-btn', title:rightOpen?'Collapse':'Expand', onClick:()=>setRightOpen(o=>!o) },
          rightOpen ? '→' : '←'),
        h('span', { className:'panel-title' }, 'Layers & Props')
      ),
      h('div', { className:'panel-collapsed-label', onClick:()=>setRightOpen(true) }, 'Layers'),
      h('div', { className:'panel-scroll' },
        h('div', { className:'tabs' },
          h('div', { className:`tab${tab==='layers'?' active':''}`, onClick:()=>setTab('layers') }, 'Layers'),
          h('div', { className:`tab${tab==='props'?' active':''}`,  onClick:()=>setTab('props')  }, 'Props')
        ),

        // LAYERS TAB
        tab==='layers' && h('div', { style:{padding:'5px 4px'} },
          placed.length===0
            ? h('div', {style:{color:'var(--muted)',fontSize:11,padding:12,textAlign:'center'}}, 'No fragments yet.')
            : [...placed].reverse().map(f =>
                h('div', {
                  key: f.id,
                  className: `frag-layer-item${selectedId===f.id?' selected':''}`,
                  onClick: () => setSelectedId(f.id)
                },
                  h('img', { src:f.thumb, className:'frag-thumb', style:{opacity:f.visible===false?0.3:1} }),
                  h('div', { className:'frag-info' },
                    h('div', { className:'frag-name' }, f.label),
                    h('div', { className:'frag-meta' }, `${Math.round(f.w)}×${Math.round(f.h)}`)
                  ),
                  h('button', {
                    className:'btn icon sm layer-vis',
                    title: f.visible===false?'Show':'Hide',
                    onClick: e => { e.stopPropagation(); updateFrag(f.id,{visible:f.visible===false}); }
                  }, f.visible===false?'○':'●')
                )
              )
        ),

        // PROPS TAB
        tab==='props' && h('div', { style:{padding:'8px 10px'} },
          !sel
            ? h('div', {style:{color:'var(--muted)',fontSize:11,textAlign:'center',padding:16,lineHeight:1.7}}, 'Click a fragment\non the canvas\nto edit it.')
            : h(Fragment, null,
                h('div', { className:'panel-label', style:{marginBottom:6} }, sel.label),

                // X/Y and W/H in 2-col grids
                h('div', { className:'prop-group' },
                  ['x','y'].map(p => h('div', {key:p, className:'prop-field'},
                    h('div', {className:'prop-field-label'}, p.toUpperCase()),
                    h('input', {type:'number', value:Math.round(sel[p]), onChange:e=>updateFrag(selectedId,{[p]:+e.target.value})})
                  ))
                ),
                h('div', { className:'prop-group', style:{marginBottom:8} },
                  ['w','h'].map(p => h('div', {key:p, className:'prop-field'},
                    h('div', {className:'prop-field-label'}, p==='w'?'WIDTH':'HEIGHT'),
                    h('input', {type:'number', value:Math.round(sel[p]), onChange:e=>updateFrag(selectedId,{[p]:+e.target.value})})
                  ))
                ),

                h('div', { className:'panel-label', style:{marginBottom:4} }, `Rotation: ${Math.round(sel.rotation||0)}°`),
                h('input', { type:'range', min:-180, max:180, step:1, value:sel.rotation||0, onChange:e=>updateFrag(selectedId,{rotation:+e.target.value}), style:{marginBottom:8} }),

                h('div', { className:'panel-label', style:{marginBottom:4} }, `Opacity: ${Math.round((sel.opacity??1)*100)}%`),
                h('input', { type:'range', min:0, max:1, step:0.01, value:sel.opacity??1, onChange:e=>updateFrag(selectedId,{opacity:+e.target.value}), style:{marginBottom:8} }),

                h('div', { className:'divider' }),
                h('div', { className:'panel-label', style:{marginBottom:6} }, 'Style'),
                h('div', { className:'style-grid', style:{marginBottom:8} },
                  STYLES.map(s => h('div', {
                    key:s.id,
                    className:`style-chip${(sel.style||'original')===s.id?' active':''}`,
                    onClick:()=>updateFrag(selectedId,{style:s.id})
                  }, s.label))
                ),

                h('div', { className:'divider' }),
                h('div', { style:{display:'flex',flexDirection:'column',gap:4} },
                  h('button', {className:'btn sm full', onClick:()=>updateFrag(selectedId,{flipped:!sel.flipped})}, '↔ Flip Horizontal'),
                  h('div', {style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4}},
                    h('button', {className:'btn sm', onClick:()=>bringFwd(selectedId)}, '↑ Forward'),
                    h('button', {className:'btn sm', onClick:()=>sendBck(selectedId)},  '↓ Back')
                  ),
                  h('button', {className:'btn sm full', onClick:()=>dupFrag(sel)}, '⊕ Duplicate'),
                  h('button', {className:'btn sm full danger', onClick:()=>deleteFrag(selectedId)}, '✕ Delete Fragment')
                )
              )
        )
      )
    );
  }

  // ── Render: Canvas ───────────────────────────────────────────────────────────
  function Canvas() {
    const visFrags = [...placed].filter(f=>f.visible!==false).sort((a,b)=>(a.zIndex||0)-(b.zIndex||0));
    return h('div', {
      className: 'canvas-stage',
      ref: overlayRef,
      style: { width:CW, height:CH, background:bgColor },
      onMouseMove, onMouseUp, onMouseLeave:onMouseUp,
      onClick: e => { if(e.target===overlayRef.current) setSelectedId(null); }
    },
      visFrags.map(f =>
        h('div', {
          key: f.id,
          className: `frag-item${selectedId===f.id?' selected':''}`,
          style: {
            position:'absolute', left:f.x, top:f.y, width:f.w, height:f.h,
            transform:`rotate(${f.rotation||0}deg)${f.flipped?' scaleX(-1)':''}`,
            transformOrigin:'center center', opacity:f.opacity??1,
            zIndex:f.zIndex||0,
            filter:styleFilter(f.style, globalStyle),
          },
          onMouseDown: e => onFragMouseDown(e, f.id),
        },
          h('img', { src:f.dataUrl, draggable:false })
        )
      ),
      isLoading && h('div', {className:'loading-overlay'},
        h('div', {className:'loading-text'}, loadingMsg),
        h('div', {className:'loading-bar'}, h('div',{className:'loading-bar-fill'}))
      ),
      !sourceImage && !isLoading && h('div', {className:'empty-state'},
        h('div', {className:'empty-icon'}, '◈'),
        h('div', {className:'empty-title'}, 'DASZFRAME'),
        h('div', {className:'empty-sub'}, 'Upload a portrait to begin.\nAI will fragment and compose\nit into gallery artwork.'),
        h('button', {className:'btn primary', style:{marginTop:14}, onClick:()=>fileInputRef.current?.click()}, 'Upload Portrait →')
      )
    );
  }

  // ── Modals ───────────────────────────────────────────────────────────────────
  function ExportModal() {
    if(!showExport) return null;
    return h('div', {className:'modal-overlay', onClick:()=>setShowExport(false)},
      h('div', {className:'modal', onClick:e=>e.stopPropagation()},
        h('div', {className:'modal-title'}, 'Export Portrait'),
        h('div', {style:{fontSize:11,color:'var(--muted)',marginBottom:14,fontFamily:'var(--font-mono)'}},
          `${placed.filter(f=>f.visible!==false).length} fragments · ${CW}×${CH} · ${layoutMode} · ${globalStyle}`),
        h('div', {style:{display:'flex',flexDirection:'column',gap:6}},
          [['png',1,`PNG Standard (${CW}×${CH})`],['png',2,`PNG HD (${CW*2}×${CH*2})`],['png',4,`PNG 4K (${CW*4}×${CH*4})`],['jpg',1,'JPG Standard'],['jpg',2,'JPG HD']].map(([fmt,sc,label]) =>
            h('button', {key:label, className:'btn', onClick:()=>{ doExport(fmt,sc); setShowExport(false); }}, label)
          )
        ),
        h('button', {className:'btn', style:{marginTop:10,width:'100%'}, onClick:()=>setShowExport(false)}, 'Cancel')
      )
    );
  }

  function VariationsModal() {
    if(!showVars) return null;
    return h('div', {className:'modal-overlay', onClick:()=>setShowVars(false)},
      h('div', {className:'modal wide', onClick:e=>e.stopPropagation()},
        h('div', {className:'modal-title'}, 'Layout Variations'),
        h('p', {style:{fontSize:11,color:'var(--muted)',marginBottom:12}}, 'Click any layout to apply it instantly.'),
        h('div', {style:{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}},
          variations.map((v,i) =>
            h('div', {key:i,
              className:'variation-thumb',
              style: v.mode==='dasz' ? {borderColor:'var(--accent2)'} : {},
              onClick:()=>{ setPlaced(v.frags); setLayoutMode(v.mode); if(v.mode==='dasz'){setBgColor('#e2ddd6');setGlobalStyle('bw');} setShowVars(false); }},
              h('div', {style:{position:'relative',width:'100%',paddingBottom:'100%',background:bgColor}},
                v.frags.slice(0,7).map(f =>
                  h('div', {key:f.id, style:{
                    position:'absolute',
                    left:`${(f.x/CW)*100}%`, top:`${(f.y/CH)*100}%`,
                    width:`${(f.w/CW)*100}%`, height:`${(f.h/CH)*100}%`,
                    transform:`rotate(${f.rotation||0}deg)`, overflow:'hidden',
                  }},
                    h('img', {src:f.thumb, style:{width:'100%',height:'100%',objectFit:'cover'}})
                  )
                ),
                h('div', {className:'var-label'}, v.mode)
              )
            )
          )
        ),
        h('button', {className:'btn', style:{marginTop:14,width:'100%'}, onClick:()=>setShowVars(false)}, 'Close')
      )
    );
  }

  // ── Hide/show panels based on viewMode ───────────────────────────────────────
  const showLeft  = viewMode !== 'canvas';
  const showRight = viewMode !== 'canvas';

  // ── Main render ───────────────────────────────────────────────────────────────
  return h('div', {id:'app'},

    // Header
    h('header', {className:'app-header'},
      h('div', {className:'header-left'},
        h('div', {className:'logo'}, 'DASZFRAME'),
        h('div', {className:'logo-sub'}, 'AI PORTRAIT STUDIO')
      ),

      // View mode switcher — always visible
      h('div', {className:'view-switcher'},
        h('button', {className:`view-btn${viewMode==='split'?' active':''}`,   onClick:()=>setViewMode('split'),  title:'Split view'},   h('span',{className:'vb-icon'},'⊠'), 'Split'),
        h('button', {className:`view-btn${viewMode==='canvas'?' active':''}`,  onClick:()=>setViewMode('canvas'), title:'Canvas only'},  h('span',{className:'vb-icon'},'⊞'), 'Canvas'),
        h('button', {className:`view-btn${viewMode==='panels'?' active':''}`,  onClick:()=>setViewMode('panels'), title:'Panels focus'}, h('span',{className:'vb-icon'},'⊟'), 'Panels'),
      ),

      h('div', {className:'header-right'},
        placed.length>0 && h(Fragment, null,
          h('button', {className:'btn sm ghost', onClick:genVariations}, '⊞ Variations'),
          h('button', {className:'btn sm primary', onClick:()=>setShowExport(true)}, '↓ Export')
        )
      )
    ),

    // Body
    h('div', {className:'app-body'},
      showLeft && h(LeftPanel),

      // Canvas area (hidden in 'panels' mode but still mounted)
      h('main', {className:'canvas-area', style:{display:viewMode==='panels'?'none':'flex'}},
        // Toolbar
        h('div', {className:'canvas-toolbar'},
          h('span', {className:'toolbar-label'}, 'Canvas'),
          h('div', {className:'toolbar-sep'}),
          // Panel toggles in toolbar
          h('button', {className:`btn sm ghost${leftOpen?' active':''}`, onClick:()=>setLeftOpen(o=>!o), title:'Toggle left panel'}, '◧'),
          h('button', {className:`btn sm ghost${rightOpen?' active':''}`, onClick:()=>setRightOpen(o=>!o), title:'Toggle right panel'}, '◨'),
          h('div', {className:'toolbar-sep'}),
          sel && h(Fragment, null,
            h('button', {className:'btn sm icon ghost', title:'Bring forward', onClick:()=>bringFwd(selectedId)}, '↑'),
            h('button', {className:'btn sm icon ghost', title:'Send back',     onClick:()=>sendBck(selectedId)},  '↓'),
            h('button', {className:'btn sm icon ghost', title:'Duplicate',     onClick:()=>dupFrag(sel)},         '⊕'),
            h('button', {className:'btn sm icon ghost danger', title:'Delete', onClick:()=>deleteFrag(selectedId)}, '✕'),
            h('div', {className:'toolbar-sep'}),
            h('span', {className:'toolbar-label', style:{color:'var(--accent)'}}, sel.label),
            h('div', {className:'toolbar-sep'}),
          ),
          h('div', {className:'toolbar-spacer'}),
          // Upload shortcut
          !sourceImage && h('button', {className:'btn sm', onClick:()=>fileInputRef.current?.click()}, '+ Upload Portrait'),
          h('span', {className:'toolbar-label'}, `${CW}×${CH}`)
        ),

        h('div', {className:'canvas-wrap'}, h(Canvas)),

        h('div', {className:'status-bar'},
          h('div', {className:'status-dot', style:{background:isLoading?'var(--accent)':'var(--success)'}}),
          h('span', null, isLoading ? loadingMsg : `${placed.filter(f=>f.visible!==false).length} fragments`),
          sel && h(Fragment, null, h('span',null,'·'), h('span',{style:{color:'var(--accent)'}}, sel.label)),
          h('div', {style:{flex:1}}),
          h('span', null, `${layoutMode} · ${globalStyle} · ${CW}×${CH}`)
        )
      ),

      // Panels-only layout: show both panels side by side with larger canvas in between
      viewMode==='panels' && h('div', {style:{flex:1,display:'flex',overflow:'hidden',minWidth:0}},
        h('div', {style:{flex:1,overflow:'auto',background:'var(--surface)',borderRight:'1px solid var(--border)'}},
          h('div', {style:{padding:'12px 14px'}},
            h('div', {className:'panel-label', style:{marginBottom:8}}, 'Quick Controls'),
            h('div', {style:{display:'flex',gap:6,flexWrap:'wrap',marginBottom:10}},
              h('button', {className:'btn sm', onClick:recompose}, '↻ Recompose'),
              h('button', {className:'btn sm', onClick:()=>analyzeAndCompose(sourceImg,layoutMode,globalStyle)}, '⊕ Re-analyze'),
              h('button', {className:'btn sm', onClick:genVariations}, '⊞ Variations'),
              h('button', {className:'btn sm primary', onClick:()=>setShowExport(true)}, '↓ Export'),
            ),
            h('div', {className:'panel-label', style:{marginBottom:6}}, 'Layout'),
            h('div', {
              className: `layout-chip dasz-chip${layoutMode==='dasz'?' active':''}`,
              style:{marginBottom:5},
              onClick: () => { setLayoutMode('dasz'); setBgColor('#e2ddd6'); setGlobalStyle('bw'); setTimeout(recompose,0); }
            }, h('span',{className:'chip-icon'},'◉'), h('span',null,'DASZ'), h('span',{className:'dasz-chip-sub'},'Signature preset · auto B&W')),
            h('div', {className:'layout-grid', style:{marginBottom:10}},
              LAYOUT_MODES.filter(m=>!m.signature).map(m => h('div',{key:m.id,className:`layout-chip${layoutMode===m.id?' active':''}`,onClick:()=>{setLayoutMode(m.id);setTimeout(recompose,0)}},h('span',{className:'chip-icon'},m.icon),m.label))
            ),
            h('div', {className:'panel-label', style:{marginBottom:6}}, 'Style'),
            h('div', {className:'style-grid', style:{marginBottom:10}},
              STYLES.map(s => h('div',{key:s.id,className:`style-chip${globalStyle===s.id?' active':''}`,onClick:()=>setGlobalStyle(s.id)},s.label))
            ),
          )
        ),
        h('div', {style:{flex:2,overflow:'auto',display:'flex',alignItems:'center',justifyContent:'center',padding:24,background:'var(--bg)'}},
          h(Canvas)
        ),
        h('div', {style:{flex:1,overflow:'auto',background:'var(--surface)',borderLeft:'1px solid var(--border)'}},
          h('div', {className:'tabs'},
            h('div', {className:`tab${tab==='layers'?' active':''}`,onClick:()=>setTab('layers')}, 'Layers'),
            h('div', {className:`tab${tab==='props'?' active':''}`, onClick:()=>setTab('props')},  'Props')
          ),
          h('div', {style:{padding:'5px 8px'}},
            tab==='layers' && (placed.length===0
              ? h('div',{style:{color:'var(--muted)',fontSize:11,padding:12,textAlign:'center'}},'No fragments yet.')
              : [...placed].reverse().map(f =>
                  h('div',{key:f.id,className:`frag-layer-item${selectedId===f.id?' selected':''}`,onClick:()=>setSelectedId(f.id)},
                    h('img',{src:f.thumb,className:'frag-thumb',style:{opacity:f.visible===false?0.3:1}}),
                    h('div',{className:'frag-info'},h('div',{className:'frag-name'},f.label),h('div',{className:'frag-meta'},`${Math.round(f.w)}×${Math.round(f.h)}`)),
                    h('button',{className:'btn icon sm layer-vis',onClick:e=>{e.stopPropagation();updateFrag(f.id,{visible:f.visible===false})}},f.visible===false?'○':'●')
                  )
                )
            ),
            tab==='props' && !sel && h('div',{style:{color:'var(--muted)',fontSize:11,textAlign:'center',padding:16,lineHeight:1.7}},'Click a fragment\nto edit.'),
            tab==='props' && sel && h('div',{style:{padding:'4px 2px'}},
              h('div',{className:'prop-group'},
                ['x','y'].map(p=>h('div',{key:p,className:'prop-field'},h('div',{className:'prop-field-label'},p.toUpperCase()),h('input',{type:'number',value:Math.round(sel[p]),onChange:e=>updateFrag(selectedId,{[p]:+e.target.value})})))
              ),
              h('div',{className:'prop-group'},
                ['w','h'].map(p=>h('div',{key:p,className:'prop-field'},h('div',{className:'prop-field-label'},p==='w'?'W':'H'),h('input',{type:'number',value:Math.round(sel[p]),onChange:e=>updateFrag(selectedId,{[p]:+e.target.value})})))
              ),
              h('div',{className:'panel-label',style:{marginBottom:4}},`Rotation ${Math.round(sel.rotation||0)}°`),
              h('input',{type:'range',min:-180,max:180,step:1,value:sel.rotation||0,onChange:e=>updateFrag(selectedId,{rotation:+e.target.value}),style:{marginBottom:8}}),
              h('div',{className:'panel-label',style:{marginBottom:4}},`Opacity ${Math.round((sel.opacity??1)*100)}%`),
              h('input',{type:'range',min:0,max:1,step:0.01,value:sel.opacity??1,onChange:e=>updateFrag(selectedId,{opacity:+e.target.value}),style:{marginBottom:8}}),
              h('div',{className:'divider'}),
              h('div',{style:{display:'flex',flexDirection:'column',gap:4}},
                h('button',{className:'btn sm full',onClick:()=>updateFrag(selectedId,{flipped:!sel.flipped})},'↔ Flip'),
                h('button',{className:'btn sm full',onClick:()=>dupFrag(sel)},'⊕ Duplicate'),
                h('button',{className:'btn sm full danger',onClick:()=>deleteFrag(selectedId)},'✕ Delete')
              )
            )
          )
        )
      ),

      showRight && viewMode!=='panels' && h(RightPanel)
    ),

    h(ExportModal),
    h(VariationsModal)
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(h(App));
