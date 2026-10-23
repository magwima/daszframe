/* DASZFRAME Photo Studio v5.0 — UI (app.js)
   Studio: multi-layer photo editor · face-fragment collages · film looks ·
   colour grading · .cube LUTs · optical FX.  Spotlight: detail badges.
   Rendering lives in js/engine.js (shared by preview and export), face
   detection in js/faces.js, project files and autosave in js/store.js. */
'use strict';
const {createElement:h,useState,useRef,useEffect,useCallback,useMemo,Fragment}=React;

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════

const LAYOUT_MODES=[
  {id:'dasz',label:'DASZ',icon:'◉',sig:true},
  {id:'mosaic',label:'Mosaic',icon:'▦'},{id:'editorial',label:'Editorial',icon:'◈'},
  {id:'cubist',label:'Cubist',icon:'◇'},{id:'symmetry',label:'Symmetry',icon:'⊞'},
  {id:'gallery',label:'Gallery',icon:'⊡'},{id:'experimental',label:'Exp',icon:'✦'},
];

const FILM_LOOKS=[
  {id:'none',      name:'None',          sub:'No grade applied'},
  {id:'cinematic', name:'Cinematic',     sub:'Filmic contrast · soft highlights'},
  {id:'vintage',   name:'Vintage Film',  sub:'Grain · warm tones · film fade'},
  {id:'bw',        name:'Black & White', sub:'High contrast monochrome'},
  {id:'noir',      name:'Film Noir',     sub:'Deep shadows · dramatic contrast'},
  {id:'bleach',    name:'Bleach Bypass', sub:'Desaturated · strong contrast'},
  {id:'teal',      name:'Teal & Orange', sub:'Hollywood blockbuster grading'},
  {id:'editorial', name:'Editorial',     sub:'Fashion-magazine · clean tones'},
  {id:'kodak',     name:'Kodak Style',   sub:'Warm shadows · rich tones'},
  {id:'fuji',      name:'Fuji Style',    sub:'Cool midtones · fine grain'},
  {id:'documentary',name:'Documentary', sub:'Natural · slightly desaturated'},
  {id:'halftone',  name:'Halftone',      sub:'Print effect · graphic'},
];

// Fallback regions, used only when no face is detected in the photo.
const FACE_REGIONS=[
  {id:'leftEye',   label:'Left Eye',   area:{x:.18,y:.26,w:.24,h:.16}},
  {id:'rightEye',  label:'Right Eye',  area:{x:.58,y:.26,w:.24,h:.16}},
  {id:'nose',      label:'Nose',       area:{x:.35,y:.42,w:.30,h:.20}},
  {id:'mouth',     label:'Mouth',      area:{x:.26,y:.62,w:.48,h:.18}},
  {id:'leftCheek', label:'Left Cheek', area:{x:.04,y:.38,w:.28,h:.28}},
  {id:'rightCheek',label:'Right Cheek',area:{x:.68,y:.38,w:.28,h:.28}},
  {id:'forehead',  label:'Forehead',   area:{x:.14,y:.04,w:.72,h:.22}},
  {id:'chin',      label:'Chin',       area:{x:.28,y:.80,w:.44,h:.18}},
  {id:'leftHalf',  label:'Left Half',  area:{x:.00,y:.00,w:.50,h:1.0}},
  {id:'rightHalf', label:'Right Half', area:{x:.50,y:.00,w:.50,h:1.0}},
  {id:'topStrip',  label:'Top Strip',  area:{x:.00,y:.00,w:1.0,h:.34}},
  {id:'midStrip',  label:'Mid Strip',  area:{x:.00,y:.34,w:1.0,h:.33}},
  {id:'botStrip',  label:'Bot Strip',  area:{x:.00,y:.67,w:1.0,h:.33}},
];

const BLEND_MODES=['normal','multiply','screen','overlay','darken','lighten','color-dodge','color-burn','hard-light','soft-light','difference','exclusion','hue','saturation','color','luminosity'];

const CANVAS_SIZES=[
  {id:'sq_sm',label:'Square SM',  w:480, h:480},
  {id:'sq_md',label:'Square MD',  w:640, h:640},
  {id:'sq_lg',label:'Square LG',  w:800, h:800},
  {id:'port', label:'Portrait',   w:540, h:720},
  {id:'story',label:'Story 9:16', w:405, h:720},
  {id:'land', label:'Landscape',  w:854, h:480},
];

// One-click presets: a film look plus (for collages) a layout.
const STYLE_PRESETS=[
  {id:'museum',  icon:'🏛',label:'Museum',    look:'cinematic',layout:'gallery'},
  {id:'fashion', icon:'✦', label:'Fashion',   look:'editorial', layout:'editorial'},
  {id:'noir',    icon:'◼', label:'Noir',      look:'noir',      layout:'dasz'},
  {id:'surreal', icon:'◈', label:'Surreal',   look:'bleach',    layout:'cubist'},
  {id:'press',   icon:'▧', label:'Vintage',   look:'vintage',   layout:'mosaic'},
  {id:'pop',     icon:'⬡', label:'Pop Art',   look:'teal',      layout:'symmetry'},
];

// Default grade state for a new layer
const defaultGrade=()=>({
  exposure:0, contrast:0, highlights:0, shadows:0,
  whites:0, blacks:0, saturation:0, vibrance:0,
  temperature:0, tint:0, gamma:1, gain:1, lift:0,
  clarity:0, sharpness:0,
  look:'none', lookStrength:100,
  vignette:0, grain:0, chromAb:0, blur:0, glow:0,
  blendMode:'normal', opacity:100,
  visible:true, locked:false,
  borderRadius:0, borderStyle:'none', borderWidth:3,
  rotation:0,
  // Curve control points [0-255] for RGB master
  curvePoints:[[0,0],[64,64],[128,128],[192,192],[255,255]],
  // LUT
  lutName:null, lutData:null,
});

// ══════════════════════════════════════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════════════════════════════════════
const uid=()=>Math.random().toString(36).slice(2,9);
const tick=()=>new Promise(r=>setTimeout(r,16));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// Cut a region out of the source photo at its real shape and full resolution
// (long side capped at 1600px), plus a small thumbnail. `ar` is width/height.
const FRAG_MAX=1600,THUMB_MAX=140;
function extractRegion(imgEl,area){
  const W=imgEl.naturalWidth,H=imgEl.naturalHeight;
  const sx=area.x*W,sy=area.y*H,sw=Math.max(1,area.w*W),sh=Math.max(1,area.h*H);
  const cut=(max)=>{
    const k=Math.min(1,max/Math.max(sw,sh));
    const c=document.createElement('canvas');c.width=Math.max(1,Math.round(sw*k));c.height=Math.max(1,Math.round(sh*k));
    const x=c.getContext('2d');x.imageSmoothingQuality='high';
    x.drawImage(imgEl,sx,sy,sw,sh,0,0,c.width,c.height);
    return c.toDataURL('image/jpeg',.92);
  };
  return{dataUrl:cut(FRAG_MAX),thumb:cut(THUMB_MAX),ar:sw/sh};
}

// Fit a box of aspect `ar` inside a `size`×`size` square (or w×h box).
function fitBox(ar,w,h=w){
  ar=ar||1;
  return (w/h>ar)?{w:h*ar,h}:{w,h:w/ar};
}

// ══════════════════════════════════════════════════════════════════════════════
// LAYOUT COMPOSERS
// ══════════════════════════════════════════════════════════════════════════════
function composeDasz(fragments,cw,ch){
  const placed=[];const get=(lbl,fi=0)=>fragments.find(f=>f.label===lbl)||fragments[fi];
  const rot=()=>(Math.random()-.5)*9;const jit=(v,r=.03)=>v+(Math.random()-.5)*cw*r;
  placed.push({...get('Forehead',6),id:uid(),x:jit(cw*.18),y:jit(ch*.03,.015),w:cw*.62,h:ch*.19,rotation:rot(),zIndex:1});
  placed.push({...get('Left Half',8),id:uid(),x:jit(cw*.02,.02),y:jit(ch*.23),w:cw*.21,h:ch*.40,rotation:rot(),zIndex:2});
  placed.push({...get('Left Eye',0),id:uid(),x:jit(cw*.21),y:jit(ch*.27),w:cw*.24,h:ch*.19,rotation:rot(),zIndex:4});
  placed.push({...get('Right Eye',1),id:uid(),x:jit(cw*.38),y:jit(ch*.21),w:cw*.46,h:ch*.30,rotation:rot(),zIndex:8});
  placed.push({...get('Right Half',9),id:uid(),x:jit(cw*.78,.02),y:jit(ch*.26),w:cw*.20,h:ch*.32,rotation:rot(),zIndex:3,flipped:true});
  placed.push({...get('Nose',2),id:uid(),x:jit(cw*.34),y:jit(ch*.49),w:cw*.30,h:ch*.23,rotation:rot(),zIndex:5});
  placed.push({...get('Right Cheek',5),id:uid(),x:jit(cw*.74),y:jit(ch*.55),w:cw*.20,h:ch*.23,rotation:rot(),zIndex:3});
  placed.push({...get('Chin',7),id:uid(),x:jit(cw*.22),y:jit(ch*.69),w:cw*.52,h:ch*.27,rotation:rot(),zIndex:6});
  return placed;
}
function composeLayout(fragments,mode,cw,ch){
  if(mode==='dasz') return composeDasz(fragments,cw,ch);
  const n=fragments.length;const placed=[];
  const rnd=(a,b)=>a+Math.random()*(b-a);
  const put=(f,x,y,box,extra)=>placed.push({...f,id:uid(),x,y,w:box.w,h:box.h,...extra});
  if(mode==='mosaic'){
    const cols=Math.ceil(Math.sqrt(n)),rows=Math.ceil(n/cols);const cW=cw/cols,cH=ch/rows;
    fragments.forEach((f,i)=>{const sc=rnd(.82,1.04),b=fitBox(f.ar,cW*sc,cH*sc),col=i%cols,row=Math.floor(i/cols);
      put(f,col*cW+(cW-b.w)/2,row*cH+(cH-b.h)/2,b,{rotation:rnd(-5,5),zIndex:i});});
  } else if(mode==='editorial'){
    const cx=cw/2,cy=ch/2,k=Math.min(cw,ch)/640;
    fragments.forEach((f,i)=>{const a=(i/n)*Math.PI*2-Math.PI/2,r=Math.min(cw,ch)*.28,b=fitBox(f.ar,rnd(95,190)*k);
      put(f,cx+Math.cos(a)*r-b.w/2,cy+Math.sin(a)*r-b.h/2,b,{rotation:rnd(-11,11),zIndex:i});});
  } else if(mode==='cubist'){
    const k=Math.min(cw,ch)/640;
    fragments.forEach((f,i)=>{const b=fitBox(f.ar,rnd(80,220)*k);
      put(f,rnd(0,Math.max(0,cw-b.w)),rnd(0,Math.max(0,ch-b.h)),b,{rotation:rnd(-25,25),zIndex:i});});
  } else if(mode==='symmetry'){
    const half=Math.ceil(n/2),slot=ch*.9/half;
    fragments.slice(0,half).forEach((f,i)=>{const yp=i*slot+ch*.05,b=fitBox(f.ar,Math.min(cw*.4,slot*1.6),slot*.92);
      put(f,cw*.06,yp,b,{rotation:0,zIndex:i});
      put(f,cw*.94-b.w,yp,b,{rotation:0,flipped:true,zIndex:i+half});});
  } else if(mode==='gallery'){
    const k=Math.min(cw,ch)/640,main=fitBox(fragments[0]?.ar,Math.min(cw,ch)*.52);
    put(fragments[0],cw/2-main.w/2,ch/2-main.h/2,main,{rotation:0,zIndex:20});
    const pos=[[.04,.04],[.72,.04],[.04,.72],[.72,.72],[.38,.02],[.38,.86],[.02,.38],[.86,.38],[.20,.02],[.58,.02],[.20,.86],[.58,.86]];
    fragments.slice(1).forEach((f,i)=>{const b=fitBox(f.ar,rnd(70,120)*k),[px,py]=pos[i%pos.length];
      put(f,Math.min(px*cw,cw-b.w),Math.min(py*ch,ch-b.h),b,{rotation:rnd(-9,9),zIndex:i});});
  } else {
    const k=Math.min(cw,ch)/640;
    fragments.forEach((f,i)=>{const b=fitBox(f.ar,rnd(60,260)*k);
      put(f,rnd(0,Math.max(0,cw-b.w)),rnd(0,Math.max(0,ch-b.h)),b,{rotation:rnd(-32,32),zIndex:i});});
  }
  return placed;
}

// ══════════════════════════════════════════════════════════════════════════════
// APP



// ══════════════════════════════════════════════════════════════════════════════
// SPOTLIGHT — Image Element Selector v3
// Resize handles · orientation toggle · aspect ratio lock · numeric inputs
// ══════════════════════════════════════════════════════════════════════════════
function SpotlightEditor(){
  const [baseImg,setBaseImg]=useState(null);
  const [badges,setBadges]=useState([]);
  const [selBadgeId,setSelBadgeId]=useState(null);
  const [dragging,setDragging]=useState(null);
  // dragging shapes:
  //   {type:'sel',  startX,startY}              — drawing new selection
  //   {type:'move', id, startX,startY, origBx,origBy}
  //   {type:'resize', id, handle, startX,startY, origBx,origBy,origW,origH, aspectRatio}
  const [selRect,setSelRect]=useState(null);
  const [editingLabelId,setEditingLabelId]=useState(null);
  const imgRef=useRef();
  const imgWrapRef=useRef();
  const labelInputRef=useRef();
  const idRef=useRef(0);
  const nextId=()=>{ idRef.current+=1; return idRef.current; };

  const selBadge=badges.find(b=>b.id===selBadgeId)||null;

  // ── Image loading ──────────────────────────────────────────────────────────
  function loadImage(file){
    if(!file||!file.type.startsWith('image/'))return;
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{ setBaseImg(url); setBadges([]); setSelBadgeId(null); setSelRect(null); };
    img.src=url;
  }

  // ── Coordinate helpers ─────────────────────────────────────────────────────
  function getImgRect(){ return imgRef.current?imgRef.current.getBoundingClientRect():null; }

  function clientToNorm(cx,cy){
    const r=getImgRect(); if(!r) return {x:0,y:0};
    return { x:Math.max(0,Math.min(1,(cx-r.left)/r.width)), y:Math.max(0,Math.min(1,(cy-r.top)/r.height)) };
  }

  function normToWrapPx(nx,ny){
    const img=imgRef.current; const wrap=imgWrapRef.current;
    if(!img||!wrap) return {x:0,y:0};
    const ir=img.getBoundingClientRect(), wr=wrap.getBoundingClientRect();
    return { x:(ir.left-wr.left)+nx*ir.width, y:(ir.top-wr.top)+ny*ir.height };
  }

  // ── Crop preview (respects orientation W×H) ────────────────────────────────
  function getCropUrl(badge){
    const img=imgRef.current; if(!img||!baseImg) return null;
    const canvas=document.createElement('canvas');
    canvas.width=badge.bw; canvas.height=badge.bh;
    const ctx=canvas.getContext('2d');
    ctx.drawImage(img,
      badge.selX*img.naturalWidth, badge.selY*img.naturalHeight,
      badge.selW*img.naturalWidth, badge.selH*img.naturalHeight,
      0,0,badge.bw,badge.bh);
    return canvas.toDataURL('image/png');
  }

  // ── Badge factory ──────────────────────────────────────────────────────────
  function createBadge(x,y,w,h){
    const bx=w<0?x+w:x, by=h<0?y+h:y;
    const bw=Math.abs(w), bh=Math.abs(h);
    if(bw<0.01||bh<0.01) return;
    const anchor=normToWrapPx(bx+bw/2, by+bh/2);
    const id=nextId();
    // default badge: 160×160 square, placed to the right of anchor
    const defaultW=160, defaultH=160;
    setBadges(prev=>[...prev,{
      id, selX:bx, selY:by, selW:bw, selH:bh,
      bx: Math.max(10, anchor.x+100),
      by: Math.max(10, anchor.y-80),
      bw: defaultW, bh: defaultH,
      // orientation: 'square'|'landscape'|'portrait'
      orientation: 'square',
      // aspect lock
      aspectLock: true,
      shape:'square', radius:8,
      borderColor:'#00ff41', borderWidth:2,
      label:'ELEMENT', labelPos:'top', labelColor:'#00ff41', labelSize:11,
      // fit mode inside badge: 'cover'|'contain'
      fitMode:'cover',
      // connector
      lineEnabled:true, lineShape:'straight', lineStyle:'solid',
      lineThick:1.5, lineColor:'#00ff41', lineStartCap:'dot', lineEndCap:'arrow',
    }]);
    setSelBadgeId(id);
    setSelRect(null);
  }

  function updateBadge(id,patch){ setBadges(prev=>prev.map(b=>b.id===id?{...b,...patch}:b)); }
  function deleteBadge(id){ setBadges(prev=>prev.filter(b=>b.id!==id)); setSelBadgeId(null); if(editingLabelId===id) setEditingLabelId(null); }

  // Apply orientation preset
  function setOrientation(id,ori){
    const badge=badges.find(b=>b.id===id); if(!badge) return;
    const base=Math.max(badge.bw,badge.bh,120);
    let nw,nh;
    if(ori==='square'){   nw=base;         nh=base; }
    else if(ori==='landscape'){ nw=Math.round(base*1.6); nh=base; }
    else{                 nw=base;         nh=Math.round(base*1.6); } // portrait
    updateBadge(id,{orientation:ori,bw:nw,bh:nh});
  }

  // ── Mouse handling ─────────────────────────────────────────────────────────
  function onImgMouseDown(e){
    if(e.button!==0||editingLabelId) return;
    e.preventDefault();
    const n=clientToNorm(e.clientX,e.clientY);
    setSelRect({startX:n.x,startY:n.y,x:n.x,y:n.y,w:0,h:0});
    setDragging({type:'sel',startX:n.x,startY:n.y});
    setSelBadgeId(null);
  }

  function onBadgeMoveDown(e,id){
    if(e.button!==0) return;
    e.stopPropagation(); e.preventDefault();
    if(editingLabelId===id) return;
    const badge=badges.find(b=>b.id===id); if(!badge) return;
    setSelBadgeId(id); setEditingLabelId(null);
    setDragging({type:'move',id,startX:e.clientX,startY:e.clientY,origBx:badge.bx,origBy:badge.by});
  }

  // handle = 'nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w'
  function onResizeHandleDown(e,id,handle){
    if(e.button!==0) return;
    e.stopPropagation(); e.preventDefault();
    const badge=badges.find(b=>b.id===id); if(!badge) return;
    setSelBadgeId(id);
    setDragging({type:'resize',id,handle,startX:e.clientX,startY:e.clientY,
      origBx:badge.bx,origBy:badge.by,origW:badge.bw,origH:badge.bh,
      aspectRatio:badge.aspectLock?(badge.bw/badge.bh):null});
  }

  function onMouseMove(e){
    if(!dragging) return;
    const dx=e.clientX-dragging.startX, dy=e.clientY-dragging.startY;

    if(dragging.type==='sel'){
      const n=clientToNorm(e.clientX,e.clientY);
      setSelRect({startX:dragging.startX,startY:dragging.startY,x:dragging.startX,y:dragging.startY,w:n.x-dragging.startX,h:n.y-dragging.startY});

    } else if(dragging.type==='move'){
      updateBadge(dragging.id,{bx:dragging.origBx+dx,by:dragging.origBy+dy});

    } else if(dragging.type==='resize'){
      const {handle,origBx,origBy,origW,origH,aspectRatio}=dragging;
      let nbx=origBx, nby=origBy, nw=origW, nh=origH;

      // Determine dimension changes based on which handle
      const onRight=handle.includes('e'), onLeft=handle.includes('w');
      const onBottom=handle.includes('s'), onTop=handle.includes('n');

      if(onRight)  nw=Math.max(40,origW+dx);
      if(onLeft){  nw=Math.max(40,origW-dx); nbx=origBx+dx; if(nw===40) nbx=origBx+origW-40; }
      if(onBottom) nh=Math.max(30,origH+dy);
      if(onTop){   nh=Math.max(30,origH-dy); nby=origBy+dy; if(nh===30) nby=origBy+origH-30; }

      // Aspect ratio lock
      if(aspectRatio){
        if(onRight||onLeft)      nh=Math.round(nw/aspectRatio);
        else if(onBottom||onTop) nw=Math.round(nh*aspectRatio);
      }

      updateBadge(dragging.id,{bx:nbx,by:nby,bw:nw,bh:nh});
    }
  }

  function onMouseUp(){
    if(dragging&&dragging.type==='sel'&&selRect) createBadge(selRect.x,selRect.y,selRect.w,selRect.h);
    setDragging(null);
  }

  // ── Label editing ──────────────────────────────────────────────────────────
  function startEditLabel(e,id){
    e.stopPropagation(); e.preventDefault();
    setEditingLabelId(id); setSelBadgeId(id);
    setTimeout(()=>{ labelInputRef.current&&labelInputRef.current.select(); },10);
  }
  function commitLabel(){ setEditingLabelId(null); }

  // ── SVG line helpers ───────────────────────────────────────────────────────
  function buildLinePath(ax,ay,bx,by,shape){
    const dx=bx-ax, dy=by-ay;
    const len=Math.sqrt(dx*dx+dy*dy)||1;
    const nx=-dy/len, ny=dx/len;
    const mx=(ax+bx)/2, my=(ay+by)/2;
    if(shape==='curved'){
      const cx=mx+nx*Math.min(80,len*0.3), cy=my+ny*Math.min(80,len*0.3);
      return `M ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`;
    }
    if(shape==='wavy'){
      const segs=4; let d=`M ${ax} ${ay}`;
      for(let i=0;i<segs;i++){
        const t1=(i+.5)/segs,t2=(i+1)/segs;
        d+=` Q ${ax+dx*t1+nx*(i%2===0?20:-20)} ${ay+dy*t1+ny*(i%2===0?20:-20)} ${ax+dx*t2} ${ay+dy*t2}`;
      }
      return d;
    }
    if(shape==='zigzag'){
      let d=`M ${ax} ${ay}`;
      for(let i=1;i<=5;i++){ const t=i/5; d+=` L ${ax+dx*t+nx*(i%2===0?-14:14)} ${ay+dy*t+ny*(i%2===0?-14:14)}`; }
      return d+` L ${bx} ${by}`;
    }
    if(shape==='multi-angle') return `M ${ax} ${ay} L ${bx} ${ay} L ${bx} ${by}`;
    return `M ${ax} ${ay} L ${bx} ${by}`;
  }

  function capMarkerId(capType,bid,end){ return `cap-${capType}-${bid}-${end}`; }

  function CapDef({badge,end}){
    const cap=end==='start'?badge.lineStartCap:badge.lineEndCap;
    if(!cap||cap==='none') return null;
    const id=capMarkerId(cap,badge.id,end);
    const c=badge.lineColor, t=badge.lineThick, isEnd=end==='end';
    if(cap==='dot')    return h('marker',{id,markerWidth:6,markerHeight:6,refX:3,refY:3,orient:'auto'},h('circle',{cx:3,cy:3,r:Math.max(1.5,t),fill:c}));
    if(cap==='circle') return h('marker',{id,markerWidth:8,markerHeight:8,refX:4,refY:4,orient:'auto'},h('circle',{cx:4,cy:4,r:3,fill:'none',stroke:c,strokeWidth:t*.8}));
    if(cap==='arrow')  return h('marker',{id,markerWidth:10,markerHeight:10,refX:isEnd?9:1,refY:5,orient:'auto'},h('path',{d:isEnd?'M 0 0 L 10 5 L 0 10 z':'M 10 0 L 0 5 L 10 10 z',fill:c}));
    return null;
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  async function exportSpotlight(){
    const img=imgRef.current; if(!img) return;
    const NW=img.naturalWidth, NH=img.naturalHeight;
    const ir=img.getBoundingClientRect();
    const scale=NW/ir.width;

    const canvas=document.createElement('canvas');
    canvas.width=NW; canvas.height=NH;
    const ctx=canvas.getContext('2d');
    ctx.drawImage(img,0,0,NW,NH);

    for(const b of badges){
      const bpx=b.bx*scale, bpy=b.by*scale;
      const bsw=b.bw*scale, bsh=b.bh*scale;
      const bThick=b.borderWidth*scale;

      // Connection line
      if(b.lineEnabled){
        const ax=(b.selX+b.selW/2)*NW, ay=(b.selY+b.selH/2)*NH;
        const bcx=(b.bx+b.bw/2)*scale, bcy=(b.by+b.bh/2)*scale;
        ctx.save();
        ctx.strokeStyle=b.lineColor; ctx.lineWidth=b.lineThick*scale;
        const dashPx=b.lineStyle==='dashed'?[b.lineThick*4*scale,b.lineThick*3*scale]:b.lineStyle==='dotted'?[b.lineThick*scale,b.lineThick*3*scale]:[];
        ctx.setLineDash(dashPx);
        const dx2=bcx-ax,dy2=bcy-ay,len2=Math.sqrt(dx2*dx2+dy2*dy2)||1;
        const nx2=-dy2/len2,ny2=dx2/len2;
        const mx2=(ax+bcx)/2,my2=(ay+bcy)/2;
        ctx.beginPath();
        const sh=b.lineShape;
        if(sh==='curved'){ ctx.moveTo(ax,ay);ctx.quadraticCurveTo(mx2+nx2*Math.min(80,len2*.3)*scale,my2+ny2*Math.min(80,len2*.3)*scale,bcx,bcy); }
        else if(sh==='wavy'){ const segs=4;ctx.moveTo(ax,ay);for(let i=0;i<segs;i++){const t1=(i+.5)/segs,t2=(i+1)/segs;ctx.quadraticCurveTo(ax+dx2*t1+nx2*(i%2===0?20:-20)*scale,ay+dy2*t1+ny2*(i%2===0?20:-20)*scale,ax+dx2*t2,ay+dy2*t2);} }
        else if(sh==='zigzag'){ ctx.moveTo(ax,ay);for(let i=1;i<=5;i++){const t=i/5;ctx.lineTo(ax+dx2*t+nx2*(i%2===0?-14:14)*scale,ay+dy2*t+ny2*(i%2===0?-14:14)*scale);}ctx.lineTo(bcx,bcy); }
        else if(sh==='multi-angle'){ ctx.moveTo(ax,ay);ctx.lineTo(bcx,ay);ctx.lineTo(bcx,bcy); }
        else{ ctx.moveTo(ax,ay);ctx.lineTo(bcx,bcy); }
        ctx.stroke(); ctx.setLineDash([]);
        // caps
        const ang=Math.atan2(bcy-ay,bcx-ax);
        const r=Math.max(2,b.lineThick*1.5)*scale;
        function drawCap(cx2,cy2,angle,cap){
          if(!cap||cap==='none') return;
          ctx.save();ctx.translate(cx2,cy2);ctx.rotate(angle);ctx.fillStyle=b.lineColor;ctx.strokeStyle=b.lineColor;ctx.lineWidth=b.lineThick*scale*.8;
          if(cap==='dot'){ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();}
          if(cap==='circle'){ctx.beginPath();ctx.arc(0,0,r*1.5,0,Math.PI*2);ctx.stroke();}
          if(cap==='arrow'){ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(-r*3,-r*2);ctx.lineTo(-r*3,r*2);ctx.closePath();ctx.fill();}
          ctx.restore();
        }
        drawCap(ax,ay,ang+Math.PI,b.lineStartCap);
        drawCap(bcx,bcy,ang,b.lineEndCap);
        ctx.restore();
      }

      // Selection crosshair
      ctx.save();
      ctx.strokeStyle=b.borderColor; ctx.lineWidth=bThick;
      ctx.setLineDash([4*scale,4*scale]);
      ctx.strokeRect(b.selX*NW,b.selY*NH,b.selW*NW,b.selH*NH);
      ctx.setLineDash([]); ctx.restore();

      // Badge crop
      ctx.save();
      const rad=b.shape==='circle'?Math.min(bsw,bsh)/2:b.shape==='rounded'?b.radius*scale:0;
      if(rad>0){ ctx.beginPath();ctx.roundRect(bpx,bpy,bsw,bsh,rad);ctx.clip(); }
      if(b.fitMode==='contain'){
        // letterbox
        const srcRatio=b.selW/b.selH, dstRatio=bsw/bsh;
        let sw,sh,sx,sy;
        if(srcRatio>dstRatio){ sh=bsh;sw=bsh*srcRatio;sx=bpx-(sw-bsw)/2;sy=bpy; }
        else{ sw=bsw;sh=bsw/srcRatio;sx=bpx;sy=bpy-(sh-bsh)/2; }
        ctx.drawImage(img,b.selX*NW,b.selY*NH,b.selW*NW,b.selH*NH,sx,sy,sw,sh);
      } else {
        ctx.drawImage(img,b.selX*NW,b.selY*NH,b.selW*NW,b.selH*NH,bpx,bpy,bsw,bsh);
      }
      ctx.restore();

      // Border
      ctx.save(); ctx.strokeStyle=b.borderColor; ctx.lineWidth=bThick;
      if(b.shape==='circle'){ ctx.beginPath();ctx.ellipse(bpx+bsw/2,bpy+bsh/2,bsw/2,bsh/2,0,0,Math.PI*2);ctx.stroke(); }
      else if(b.shape==='rounded'){ ctx.beginPath();ctx.roundRect(bpx,bpy,bsw,bsh,b.radius*scale);ctx.stroke(); }
      else{ ctx.strokeRect(bpx,bpy,bsw,bsh); }
      ctx.restore();

      // Label
      if(b.labelPos!=='none'&&b.label){
        const fs=b.labelSize*scale;
        ctx.save(); ctx.font=`700 ${fs}px monospace`;
        const tw=ctx.measureText(b.label).width; const lh=fs*1.4;
        const lx=bpx, ly=b.labelPos==='top'?bpy-lh-2*scale:bpy+bsh+2*scale;
        ctx.fillStyle='rgba(0,0,0,0.85)'; ctx.fillRect(lx,ly,tw+12*scale,lh);
        ctx.strokeStyle=b.borderColor; ctx.lineWidth=scale; ctx.strokeRect(lx,ly,tw+12*scale,lh);
        ctx.fillStyle=b.labelColor; ctx.fillText(b.label,lx+6*scale,ly+fs*1.1);
        ctx.restore();
      }
    }

    const a=document.createElement('a');
    a.href=canvas.toDataURL('image/png');
    a.download='spotlight_export.png';
    a.click();
  }

  // ── Styles ─────────────────────────────────────────────────────────────────
  const S={
    wrap:{display:'flex',height:'calc(100vh - 46px)',background:'#0a0a0a',color:'#e0e0e0',fontFamily:'monospace',overflow:'hidden',userSelect:'none'},
    main:{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'},
    toolbar:{padding:'8px 12px',borderBottom:'1px solid #1e1e1e',display:'flex',gap:8,alignItems:'center',background:'#111',flexShrink:0},
    imgArea:{flex:1,overflow:'auto',display:'flex',alignItems:'center',justifyContent:'center',background:'repeating-conic-gradient(#111 0% 25%,#0d0d0d 0% 50%) 0 0/20px 20px'},
    imgWrap:{position:'relative',display:'inline-block',flexShrink:0},
    img:{display:'block',maxWidth:'100%',maxHeight:'calc(100vh - 110px)',cursor:'crosshair',pointerEvents:'auto'},
    selBox:{position:'absolute',border:'2px dashed #00ff41',boxSizing:'border-box',pointerEvents:'none',background:'rgba(0,255,65,0.05)'},
    panel:{width:272,borderLeft:'1px solid #1e1e1e',display:'flex',flexDirection:'column',background:'#111',overflow:'hidden',flexShrink:0},
    panelHead:{padding:'10px 12px',borderBottom:'1px solid #1e1e1e',fontSize:11,letterSpacing:2,color:'#00ff41',fontWeight:700,flexShrink:0},
    badgeList:{overflow:'auto',padding:8,maxHeight:150,borderBottom:'1px solid #1e1e1e'},
    inspector:{flex:1,overflow:'auto',padding:10},
    row:{display:'flex',alignItems:'center',gap:5,marginBottom:8},
    lbl:{fontSize:10,color:'#888',width:74,flexShrink:0,letterSpacing:1},
    inp:{flex:1,background:'#1a1a1a',border:'1px solid #2a2a2a',color:'#e0e0e0',padding:'3px 6px',borderRadius:3,fontSize:11,fontFamily:'monospace'},
    numInp:{width:48,background:'#1a1a1a',border:'1px solid #2a2a2a',color:'#e0e0e0',padding:'3px 5px',borderRadius:3,fontSize:11,fontFamily:'monospace',textAlign:'right'},
    btn:{padding:'3px 8px',background:'#1a1a1a',border:'1px solid #2a2a2a',color:'#e0e0e0',borderRadius:3,cursor:'pointer',fontSize:10,fontFamily:'monospace'},
    btnG:{padding:'4px 12px',background:'#00ff41',border:'none',color:'#000',borderRadius:3,cursor:'pointer',fontSize:11,fontFamily:'monospace',fontWeight:700},
    btnR:{padding:'3px 8px',background:'transparent',border:'1px solid #c00',color:'#f66',borderRadius:3,cursor:'pointer',fontSize:10},
    sec:{fontSize:9,letterSpacing:2,color:'#444',textTransform:'uppercase',margin:'10px 0 5px',borderTop:'1px solid #1a1a1a',paddingTop:8},
  };

  const selD=selRect?{
    left:`${Math.min(selRect.x,selRect.x+selRect.w)*100}%`,
    top:`${Math.min(selRect.y,selRect.y+selRect.h)*100}%`,
    width:`${Math.abs(selRect.w)*100}%`,
    height:`${Math.abs(selRect.h)*100}%`,
  }:null;

  // ── SVG connector overlay ──────────────────────────────────────────────────
  function ConnectorSVG(){
    const img=imgRef.current; const wrap=imgWrapRef.current;
    if(!img||!wrap||!baseImg) return null;
    const ir=img.getBoundingClientRect(), wr=wrap.getBoundingClientRect();
    const imgLeft=ir.left-wr.left, imgTop=ir.top-wr.top;
    const W=wr.width, H=wr.height;
    return h('svg',{style:{position:'absolute',inset:0,pointerEvents:'none',overflow:'visible'},width:W,height:H,viewBox:`0 0 ${W} ${H}`},
      h('defs',null, ...badges.flatMap(b=>[h(CapDef,{key:`s${b.id}`,badge:b,end:'start'}),h(CapDef,{key:`e${b.id}`,badge:b,end:'end'})])),
      ...badges.filter(b=>b.lineEnabled).map(b=>{
        const ax=imgLeft+(b.selX+b.selW/2)*ir.width, ay=imgTop+(b.selY+b.selH/2)*ir.height;
        const bcx=b.bx+b.bw/2, bcy=b.by+b.bh/2;
        const pathD=buildLinePath(ax,ay,bcx,bcy,b.lineShape);
        const dash=b.lineStyle==='dashed'?`${b.lineThick*4} ${b.lineThick*3}`:b.lineStyle==='dotted'?`${b.lineThick} ${b.lineThick*3}`:undefined;
        const sid=capMarkerId(b.lineStartCap,b.id,'start'), eid=capMarkerId(b.lineEndCap,b.id,'end');
        return h('path',{key:b.id,d:pathD,stroke:b.lineColor,strokeWidth:b.lineThick,fill:'none',
          strokeDasharray:dash,
          markerStart:(b.lineStartCap&&b.lineStartCap!=='none')?`url(#${sid})`:undefined,
          markerEnd:(b.lineEndCap&&b.lineEndCap!=='none')?`url(#${eid})`:undefined});
      })
    );
  }

  // ── Selection crosshairs on image ─────────────────────────────────────────
  function SelectionOverlays(){
    return h(Fragment,null,...badges.map(b=>{
      const isActive=b.id===selBadgeId;
      return h('div',{key:b.id,style:{
        position:'absolute',left:`${b.selX*100}%`,top:`${b.selY*100}%`,
        width:`${b.selW*100}%`,height:`${b.selH*100}%`,
        border:`${isActive?2:1}px solid ${b.borderColor}`,boxSizing:'border-box',pointerEvents:'none',
      }},
        h('div',{style:{position:'absolute',top:-1,left:-1,width:6,height:6,borderTop:`2px solid ${b.borderColor}`,borderLeft:`2px solid ${b.borderColor}`}}),
        h('div',{style:{position:'absolute',top:-1,right:-1,width:6,height:6,borderTop:`2px solid ${b.borderColor}`,borderRight:`2px solid ${b.borderColor}`}}),
        h('div',{style:{position:'absolute',bottom:-1,left:-1,width:6,height:6,borderBottom:`2px solid ${b.borderColor}`,borderLeft:`2px solid ${b.borderColor}`}}),
        h('div',{style:{position:'absolute',bottom:-1,right:-1,width:6,height:6,borderBottom:`2px solid ${b.borderColor}`,borderRight:`2px solid ${b.borderColor}`}}),
      );
    }));
  }

  // ── Resize handle dots ─────────────────────────────────────────────────────
  // returns cursor CSS for a given handle string
  function handleCursor(h){ const map={nw:'nw-resize',n:'n-resize',ne:'ne-resize',e:'e-resize',se:'se-resize',s:'s-resize',sw:'sw-resize',w:'w-resize'}; return map[h]||'se-resize'; }

  function ResizeHandles({badge}){
    // 8 handles: corners + edge midpoints
    const handles=[
      {h:'nw',style:{top:-5,left:-5}},
      {h:'n', style:{top:-5,left:'50%',transform:'translateX(-50%)'}},
      {h:'ne',style:{top:-5,right:-5}},
      {h:'e', style:{top:'50%',right:-5,transform:'translateY(-50%)'}},
      {h:'se',style:{bottom:-5,right:-5}},
      {h:'s', style:{bottom:-5,left:'50%',transform:'translateX(-50%)'}},
      {h:'sw',style:{bottom:-5,left:-5}},
      {h:'w', style:{top:'50%',left:-5,transform:'translateY(-50%)'}},
    ];
    return h(Fragment,null,...handles.map(({h:handle,style})=>
      h('div',{key:handle,
        style:{position:'absolute',...style,width:10,height:10,background:'#fff',border:'1px solid #000',borderRadius:2,cursor:handleCursor(handle),zIndex:200,boxSizing:'border-box'},
        onMouseDown:e=>onResizeHandleDown(e,badge.id,handle),
      })
    ));
  }

  // ── Badge overlay ──────────────────────────────────────────────────────────
  function BadgeOverlay({badge}){
    const cropUrl=getCropUrl(badge);
    const isSel=badge.id===selBadgeId;
    const isEditing=editingLabelId===badge.id;

    const fitStyle=badge.fitMode==='contain'
      ? {backgroundSize:'contain',backgroundRepeat:'no-repeat',backgroundPosition:'center',backgroundColor:'#000'}
      : {backgroundSize:'cover',backgroundPosition:'center'};

    const boxStyle={
      width:badge.bw, height:badge.bh,
      borderRadius:badge.shape==='circle'?'50%':badge.shape==='rounded'?badge.radius+'px':'0px',
      border:`${badge.borderWidth}px solid ${badge.borderColor}`,
      boxSizing:'border-box',
      backgroundImage:cropUrl?`url(${cropUrl})`:'none',
      ...fitStyle,
      boxShadow:isSel?`0 0 0 1.5px #fff,0 0 10px ${badge.borderColor}88`:`0 0 6px ${badge.borderColor}33`,
      overflow:'hidden', position:'relative', flexShrink:0,
    };

    const labelStyle={
      fontSize:badge.labelSize, color:badge.labelColor, letterSpacing:2, textTransform:'uppercase',
      background:'rgba(0,0,0,0.85)', padding:'2px 6px', border:`1px solid ${badge.borderColor}`,
      whiteSpace:'nowrap', display:'inline-block', maxWidth:badge.bw+60, cursor:'text', minWidth:40,
    };

    const LabelEl=isEditing
      ? h('input',{ref:labelInputRef,type:'text',value:badge.label,
          style:{...labelStyle,outline:'none',fontFamily:'monospace',fontWeight:700,minWidth:80,cursor:'text'},
          onMouseDown:e=>e.stopPropagation(),
          onChange:e=>updateBadge(badge.id,{label:e.target.value}),
          onBlur:commitLabel,
          onKeyDown:e=>{ if(e.key==='Enter'||e.key==='Escape'){e.preventDefault();commitLabel();} e.stopPropagation(); },
          autoFocus:true})
      : h('div',{style:labelStyle,onMouseDown:e=>startEditLabel(e,badge.id),title:'Click to edit label'},badge.label||'ELEMENT');

    // Dimension readout while resizing
    const isResizing=dragging&&dragging.type==='resize'&&dragging.id===badge.id;

    return h('div',{
      style:{position:'absolute',left:badge.bx,top:badge.by,cursor:isEditing?'default':'grab',userSelect:'none',zIndex:isSel?100:50,display:'flex',flexDirection:'column',alignItems:'flex-start'},
      onMouseDown:e=>onBadgeMoveDown(e,badge.id),
      onClick:e=>{ e.stopPropagation(); setSelBadgeId(badge.id); },
    },
      badge.labelPos==='top'&&h('div',{style:{marginBottom:3}},LabelEl),
      h('div',{style:{...boxStyle,position:'relative'}},
        // Resize dimension readout
        isResizing&&h('div',{style:{position:'absolute',bottom:4,right:4,background:'rgba(0,0,0,0.75)',color:'#fff',fontSize:9,padding:'2px 5px',borderRadius:2,fontFamily:'monospace',pointerEvents:'none',zIndex:300}},
          `${Math.round(badge.bw)}×${Math.round(badge.bh)}`
        ),
      ),
      badge.labelPos==='bottom'&&h('div',{style:{marginTop:3}},LabelEl),
      // Resize handles (only when selected)
      isSel&&h(ResizeHandles,{badge}),
    );
  }

  // ── Inspector ──────────────────────────────────────────────────────────────
  function BadgeInspector(){
    if(!selBadge) return h('div',{style:{padding:16,color:'#333',fontSize:11,lineHeight:1.8}},
      h('div',null,'Select a badge to inspect.'),h('div',null,'Drag on the image to create one.'));

    const U=(k,v)=>updateBadge(selBadge.id,{[k]:v});
    const Btn=(val,target,key,label)=>h('button',{
      style:{...S.btn,flex:1,borderColor:val===target?'#00ff41':'#2a2a2a',color:val===target?'#00ff41':'#666',background:val===target?'#111':'#0d0d0d'},
      onClick:()=>U(key,target)},label);

    return h('div',{style:S.inspector},
      h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}},
        h('div',{style:{fontSize:10,letterSpacing:2,color:'#555'}},`BADGE #${selBadge.id}`),
        h('button',{style:S.btnR,onClick:()=>deleteBadge(selBadge.id)},'✕ DELETE'),
      ),

      // ── SIZE & ORIENTATION ──
      h('div',{style:S.sec},'Size & Orientation'),

      // Orientation presets
      h('div',{style:S.row},
        h('div',{style:S.lbl},'ORIENT'),
        ['square','landscape','portrait'].map(o=>h('button',{key:o,
          style:{...S.btn,flex:1,borderColor:selBadge.orientation===o?'#00ff41':'#2a2a2a',color:selBadge.orientation===o?'#00ff41':'#666'},
          onClick:()=>setOrientation(selBadge.id,o)},
          o==='square'?'□':o==='landscape'?'▭':'▯'
        ))
      ),

      // Size presets
      h('div',{style:S.row},
        h('div',{style:S.lbl},'PRESET'),
        [{l:'S',w:100,h:100},{l:'M',w:160,h:160},{l:'L',w:240,h:240},{l:'XL',w:340,h:340}].map(p=>h('button',{key:p.l,
          style:{...S.btn,flex:1},
          onClick:()=>{ const ratio=selBadge.bw/selBadge.bh; U('bw',p.w); U('bh',selBadge.orientation==='square'?p.h:selBadge.orientation==='landscape'?Math.round(p.w/ratio):Math.round(p.h*ratio)); }},
          p.l
        ))
      ),

      // Numeric W × H
      h('div',{style:S.row},
        h('div',{style:S.lbl},'W × H'),
        h('input',{type:'number',value:Math.round(selBadge.bw),min:40,max:800,style:S.numInp,
          onChange:e=>{
            const nw=Math.max(40,+e.target.value);
            if(selBadge.aspectLock) U('bw',nw)||U('bh',Math.round(nw/(selBadge.bw/selBadge.bh)));
            else U('bw',nw);
            updateBadge(selBadge.id,{bw:nw,...(selBadge.aspectLock?{bh:Math.round(nw*selBadge.bh/selBadge.bw)}:{})});
          }}),
        h('span',{style:{color:'#444',fontSize:11}},'×'),
        h('input',{type:'number',value:Math.round(selBadge.bh),min:30,max:800,style:S.numInp,
          onChange:e=>{
            const nh=Math.max(30,+e.target.value);
            updateBadge(selBadge.id,{bh:nh,...(selBadge.aspectLock?{bw:Math.round(nh*selBadge.bw/selBadge.bh)}:{})});
          }}),
        h('button',{
          title:'Aspect ratio lock',
          style:{...S.btn,padding:'2px 6px',borderColor:selBadge.aspectLock?'#00ff41':'#2a2a2a',color:selBadge.aspectLock?'#00ff41':'#555'},
          onClick:()=>U('aspectLock',!selBadge.aspectLock)},
          selBadge.aspectLock?'🔒':'🔓'
        ),
      ),

      // Realtime dims display
      h('div',{style:{...S.row,marginBottom:4}},
        h('div',{style:S.lbl},'DIMS'),
        h('div',{style:{fontSize:10,color:'#555',fontFamily:'monospace'}},`${Math.round(selBadge.bw)} × ${Math.round(selBadge.bh)} px`),
      ),

      // Fit mode
      h('div',{style:S.row},
        h('div',{style:S.lbl},'IMAGE FIT'),
        Btn(selBadge.fitMode,'cover','fitMode','Cover'),
        Btn(selBadge.fitMode,'contain','fitMode','Contain'),
      ),

      // ── APPEARANCE ──
      h('div',{style:S.sec},'Appearance'),

      h('div',{style:S.row},
        h('div',{style:S.lbl},'SHAPE'),
        Btn(selBadge.shape,'square','shape','□'),
        Btn(selBadge.shape,'circle','shape','○'),
        Btn(selBadge.shape,'rounded','shape','▢'),
      ),
      selBadge.shape==='rounded'&&h('div',{style:S.row},
        h('div',{style:S.lbl},'RADIUS'),
        h('input',{type:'range',min:0,max:80,value:selBadge.radius,style:{flex:1},onChange:e=>U('radius',+e.target.value)}),
        h('span',{style:{fontSize:10,color:'#555',width:24}},selBadge.radius),
      ),
      h('div',{style:S.row},
        h('div',{style:S.lbl},'BORDER'),
        h('input',{type:'range',min:0,max:8,value:selBadge.borderWidth,style:{flex:1},onChange:e=>U('borderWidth',+e.target.value)}),
        h('input',{type:'color',value:selBadge.borderColor,style:{width:26,height:20,border:'none',cursor:'pointer'},onChange:e=>U('borderColor',e.target.value)}),
      ),

      // ── LABEL ──
      h('div',{style:S.sec},'Label'),
      h('div',{style:S.row},
        h('div',{style:S.lbl},'TEXT'),
        h('input',{type:'text',value:selBadge.label,style:S.inp,
          onChange:e=>U('label',e.target.value),
          onFocus:()=>setEditingLabelId(selBadge.id),
          onBlur:()=>setEditingLabelId(null),
        }),
      ),
      h('div',{style:S.row},
        h('div',{style:S.lbl},'POSITION'),
        Btn(selBadge.labelPos,'top','labelPos','Top'),
        Btn(selBadge.labelPos,'bottom','labelPos','Bot'),
        Btn(selBadge.labelPos,'none','labelPos','Off'),
      ),
      h('div',{style:S.row},
        h('div',{style:S.lbl},'CLR / SIZE'),
        h('input',{type:'color',value:selBadge.labelColor,style:{width:26,height:20,border:'none',cursor:'pointer'},onChange:e=>U('labelColor',e.target.value)}),
        h('input',{type:'range',min:8,max:22,value:selBadge.labelSize,style:{flex:1},onChange:e=>U('labelSize',+e.target.value)}),
        h('span',{style:{fontSize:10,color:'#555',width:20}},selBadge.labelSize),
      ),

      // ── CONNECTION LINE ──
      h('div',{style:S.sec},'Connection Line'),
      h('div',{style:S.row},
        h('div',{style:S.lbl},'ENABLED'),
        h('button',{style:{...S.btn,flex:1,borderColor:selBadge.lineEnabled?'#00ff41':'#2a2a2a',color:selBadge.lineEnabled?'#00ff41':'#555'},
          onClick:()=>U('lineEnabled',!selBadge.lineEnabled)},selBadge.lineEnabled?'ON':'OFF'),
        h('input',{type:'color',value:selBadge.lineColor,style:{width:26,height:20,border:'none',cursor:'pointer'},onChange:e=>U('lineColor',e.target.value)}),
      ),
      selBadge.lineEnabled&&h(Fragment,null,
        h('div',{style:S.row},
          h('div',{style:S.lbl},'SHAPE'),
          h('select',{value:selBadge.lineShape,style:{...S.inp},onChange:e=>U('lineShape',e.target.value)},
            ['straight','curved','wavy','zigzag','multi-angle','dashed','broken'].map(s=>h('option',{key:s,value:s},s))),
        ),
        h('div',{style:S.row},
          h('div',{style:S.lbl},'STYLE'),
          Btn(selBadge.lineStyle,'solid','lineStyle','Solid'),
          Btn(selBadge.lineStyle,'dashed','lineStyle','Dashed'),
          Btn(selBadge.lineStyle,'dotted','lineStyle','Dotted'),
        ),
        h('div',{style:S.row},
          h('div',{style:S.lbl},'THICK'),
          h('input',{type:'range',min:0.5,max:10,step:0.5,value:selBadge.lineThick,style:{flex:1},onChange:e=>U('lineThick',+e.target.value)}),
          h('span',{style:{fontSize:10,color:'#555',width:24}},selBadge.lineThick),
        ),
        h('div',{style:S.row},
          h('div',{style:S.lbl},'START CAP'),
          h('select',{value:selBadge.lineStartCap,style:{...S.inp},onChange:e=>U('lineStartCap',e.target.value)},
            ['none','dot','circle','arrow'].map(c=>h('option',{key:c,value:c},c))),
        ),
        h('div',{style:S.row},
          h('div',{style:S.lbl},'END CAP'),
          h('select',{value:selBadge.lineEndCap,style:{...S.inp},onChange:e=>U('lineEndCap',e.target.value)},
            ['none','dot','circle','arrow'].map(c=>h('option',{key:c,value:c},c))),
        ),
      ),
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return h('div',{style:S.wrap,onMouseMove,onMouseUp},
    h('div',{style:S.main},
      h('div',{style:S.toolbar},
        h('label',{style:{...S.btnG,cursor:'pointer'},title:'Load an image to annotate'},
          '⊕ LOAD IMAGE',
          h('input',{type:'file',accept:'image/*',style:{display:'none'},onChange:e=>{loadImage(e.target.files[0]);e.target.value='';}}),
        ),
        baseImg&&h('span',{style:{fontSize:10,color:'#555',marginLeft:4}},'Drag on image to add badge'),
        h('div',{style:{flex:1}}),
        badges.length>0&&h('button',{style:S.btn,onClick:exportSpotlight},'↓ EXPORT PNG'),
        badges.length>0&&h('button',{style:S.btn,onClick:()=>{setBadges([]);setSelBadgeId(null);}},'✕ CLEAR'),
      ),
      h('div',{style:S.imgArea,onClick:()=>{ if(editingLabelId)setEditingLabelId(null); setSelBadgeId(null); }},
        baseImg
          ? h('div',{ref:imgWrapRef,style:S.imgWrap},
              h('img',{ref:imgRef,src:baseImg,style:S.img,draggable:false,onMouseDown:onImgMouseDown}),
              h(SelectionOverlays),
              selD&&h('div',{style:{...S.selBox,...selD}}),
              h(ConnectorSVG),
              ...badges.map(b=>h(BadgeOverlay,{key:b.id,badge:b})),
            )
          : h('div',{style:{textAlign:'center',color:'#2a2a2a',pointerEvents:'none'}},
              h('div',{style:{fontSize:48,lineHeight:1,marginBottom:12}},'⊡'),
              h('div',{style:{fontSize:11,letterSpacing:3}},'LOAD AN IMAGE TO BEGIN'),
            ),
      ),
    ),
    h('div',{style:S.panel},
      h('div',{style:S.panelHead},'BADGES  '+badges.length),
      h('div',{style:S.badgeList},
        badges.length===0&&h('div',{style:{fontSize:10,color:'#2a2a2a',padding:'10px 0',textAlign:'center'}},'No badges yet'),
        badges.map(b=>h('div',{key:b.id,
          style:{padding:'5px 8px',marginBottom:3,borderRadius:3,cursor:'pointer',fontSize:10,
            display:'flex',justifyContent:'space-between',alignItems:'center',
            border:`1px solid ${b.id===selBadgeId?b.borderColor:'#1a1a1a'}`,
            background:b.id===selBadgeId?'#1a1a1a':'transparent',
            color:b.id===selBadgeId?'#e0e0e0':'#555'},
          onClick:e=>{ e.stopPropagation(); setSelBadgeId(b.id); }},
          h('span',null,b.label||`#${b.id}`),
          h('span',{style:{fontSize:9,color:'#444',display:'flex',gap:3,alignItems:'center'}},
            `${Math.round(b.bw)}×${Math.round(b.bh)}`,
            b.lineEnabled&&h('span',{style:{color:b.lineColor,marginLeft:3}},'—'),
          ),
        )),
      ),
      h(BadgeInspector),
    ),
  );
}


function App(){
  const [appTab,setAppTab]=useState('studio');

  // ── Photo layers (multi-photo) ────────────────────────────────────────────
  // Each layer: {id, name, type:'photo'|'collage'|'solid', srcUrl, imgEl,
  //              fragments:[], placed:[], grade:{...}, x,y,w,h, rotation,
  //              visible, locked}
  // Layers are always updated immutably, so an undo snapshot is just the old
  // array — no deep copy, and loaded photos (imgEl) survive undo/redo.
  const [layers,setLayersState]=useState([]);
  const layersRef=useRef(layers);
  const [activeLayerId,setActiveLayerId]=useState(null);
  const [selectedFragId,setSelectedFragId]=useState(null);

  // ── Canvas ─────────────────────────────────────────────────────────────────
  const [canvasSizeId,setCanvasSizeId]=useState('sq_md');
  const [bgColor,setBgColor]=useState('#0f0f0f');
  const [layoutMode,setLayoutMode]=useState('mosaic');

  // ── Project / File ─────────────────────────────────────────────────────────
  const [projectName,setProjectName]=useState('Untitled Project');
  const [isEditingName,setIsEditingName]=useState(false);
  const [recentProjects,setRecentProjects]=useState(()=>{try{return JSON.parse(localStorage.getItem('daszframe_recent')||'[]');}catch(_){return[];}});
  const [lastSaved,setLastSaved]=useState(null);
  const [exportFilename,setExportFilename]=useState('');
  const [showSaveAs,setShowSaveAs]=useState(false);
  const [restoreOffer,setRestoreOffer]=useState(null);
  const openProjRef=useRef(null);
  const srcDataCache=useRef(new WeakMap());

  // ── UI ─────────────────────────────────────────────────────────────────────
  const [leftOpen,setLeftOpen]=useState(true);
  const [rightOpen,setRightOpen]=useState(true);
  const [viewMode,setViewMode]=useState('split');
  const [rtab,setRtab]=useState('looks');
  const [isProc,setIsProc]=useState(false);
  const [procMsg,setProcMsg]=useState('');
  const [statusNote,setStatusNote]=useState('');
  const [showExport,setShowExport]=useState(false);
  const [showVars,setShowVars]=useState(false);
  const [variations,setVariations]=useState([]);
  const [snapGrid,setSnapGrid]=useState(false);
  const [zoom,setZoom]=useState(1);
  const GRID=20;

  const cs=CANVAS_SIZES.find(s=>s.id===canvasSizeId)||CANVAS_SIZES[1];
  const CW=cs.w,CH=cs.h;

  // ── Undo / redo ────────────────────────────────────────────────────────────
  // commit(fn,key): apply a change and record it. Changes with the same key
  // within 700ms (e.g. one slider drag) merge into a single undo step.
  const hist=useRef({stack:[[]],idx:0,key:null,t:0});
  const [,setHistVer]=useState(0);
  const setLive=useCallback((fn)=>{
    const next=typeof fn==='function'?fn(layersRef.current):fn;
    layersRef.current=next;setLayersState(next);return next;
  },[]);
  const record=useCallback((next,key)=>{
    const H=hist.current,now=Date.now();
    if(key&&key===H.key&&now-H.t<700&&H.idx===H.stack.length-1){H.stack[H.idx]=next;}
    else{H.stack=H.stack.slice(0,H.idx+1);H.stack.push(next);if(H.stack.length>50)H.stack.shift();H.idx=H.stack.length-1;}
    H.key=key||null;H.t=now;setHistVer(v=>v+1);
  },[]);
  const commit=useCallback((fn,key)=>{const next=setLive(fn);record(next,key);return next;},[setLive,record]);
  const endGesture=useCallback(()=>{hist.current.key=null;},[]);
  const undo=useCallback(()=>{const H=hist.current;if(H.idx>0){H.idx--;H.key=null;setLive(H.stack[H.idx]);setHistVer(v=>v+1);}},[setLive]);
  const redo=useCallback(()=>{const H=hist.current;if(H.idx<H.stack.length-1){H.idx++;H.key=null;setLive(H.stack[H.idx]);setHistVer(v=>v+1);}},[setLive]);
  const resetHistory=useCallback((ls)=>{hist.current={stack:[ls],idx:0,key:null,t:0};setHistVer(v=>v+1);},[]);

  // Drag state
  const [dragState,setDragState]=useState(null);
  const overlayRef=useRef(null);
  const fileInputRef=useRef(null);
  const lutInputRef=useRef(null);

  // Active layer helper
  const activeLayer=useMemo(()=>layers.find(l=>l.id===activeLayerId),[layers,activeLayerId]);
  const activeGrade=activeLayer?.grade||defaultGrade();

  // ── Update helpers ─────────────────────────────────────────────────────────
  const updateLayer=useCallback((id,upd)=>{
    commit(prev=>prev.map(l=>l.id===id?{...l,...upd}:l),'L'+id+Object.keys(upd).join());
  },[commit]);
  const updateGrade=useCallback((id,gradeUpd)=>{
    commit(prev=>prev.map(l=>l.id===id?{...l,grade:{...(l.grade||defaultGrade()),...gradeUpd}}:l),'G'+id+Object.keys(gradeUpd).join());
  },[commit]);
  const commitGrade=endGesture;

  // ── Add photo layer ────────────────────────────────────────────────────────
  const addPhotoLayer=useCallback(async(file,asCollage=false)=>{
    if(!file||!file.type.startsWith('image/')) return;
    setIsProc(true);setProcMsg('Loading image…');
    const url=URL.createObjectURL(file);
    const img=new Image();
    try{
      await new Promise((res,rej)=>{img.onload=res;img.onerror=()=>rej(new Error('decode failed'));img.src=url;});
    }catch(_){
      setIsProc(false);URL.revokeObjectURL(url);
      alert('That image could not be loaded — it may be corrupt or an unsupported format.');
      return;
    }
    const name=file.name.replace(/\.[^.]+$/,'').slice(0,24);

    let frags=[],placed=[],note='';
    if(asCollage){
      let regions=FACE_REGIONS;
      setProcMsg('Finding the face…');await tick();
      try{
        const found=await window.DZFaces.detect(img);
        if(found){
          regions=window.DZFaces.regionsFromLandmarks(found.points,img.naturalWidth,img.naturalHeight);
          note=found.faces>1?`Found ${found.faces} faces, so the largest one was used.`:'Face found. Fragments follow the eyes, nose and mouth.';
        } else note='No face found, so standard portrait crops were used. A clear, front-facing face works best.';
      }catch(err){
        console.warn('Face detection unavailable:',err);
        note='Face detection could not load, so standard portrait crops were used.';
      }
      setProcMsg('Cutting fragments…');await tick();
      frags=regions.map(r=>({
        id:uid(),label:r.label,...extractRegion(img,r.area),
        visible:true,locked:false,opacity:1,style:'original',flipped:false,
      }));
      placed=composeLayout(frags,layoutMode,CW,CH);
    }

    // Photo layers keep their shape: scaled to cover the canvas, centred.
    const k=Math.max(CW/img.naturalWidth,CH/img.naturalHeight);
    const w=img.naturalWidth*k,hh=img.naturalHeight*k;
    const newLayer={
      id:uid(),name,type:asCollage?'collage':'photo',
      srcUrl:url,imgEl:img,
      fragments:frags,placed,
      x:(CW-w)/2,y:(CH-hh)/2,w,h:hh,rotation:0,
      grade:defaultGrade(),
      visible:true,locked:false,
    };
    commit(prev=>[...prev,newLayer]);
    setActiveLayerId(newLayer.id);
    setIsProc(false);
    setStatusNote(note);
  },[layoutMode,CW,CH,commit]);

  // ── Collage layout ────────────────────────────────────────────────────────
  const recompose=useCallback((mode=layoutMode)=>{
    const l=layersRef.current.find(x=>x.id===activeLayerId);
    if(!l||l.type!=='collage'||!l.fragments.length) return;
    commit(prev=>prev.map(x=>x.id===l.id?{...x,placed:composeLayout(x.fragments,mode,CW,CH)}:x));
  },[activeLayerId,layoutMode,CW,CH,commit]);
  const chooseLayout=useCallback((mode)=>{setLayoutMode(mode);recompose(mode);},[recompose]);

  // ── Style presets ─────────────────────────────────────────────────────────
  const applyPreset=useCallback((q)=>{
    if(!activeLayer) return;
    updateGrade(activeLayer.id,{look:q.look});endGesture();
    if(activeLayer.type==='collage') chooseLayout(q.layout);
    setStatusNote(`${q.label} preset: ${FILM_LOOKS.find(l=>l.id===q.look)?.name||q.look}${activeLayer.type==='collage'?` look with the ${q.layout} layout`:' look'}.`);
  },[activeLayer,updateGrade,endGesture,chooseLayout]);

  // ── Fragment drag (pointer events: mouse, pen and touch) ───────────────────
  const toCanvas=useCallback((e)=>{
    const r=overlayRef.current.getBoundingClientRect();
    return{x:(e.clientX-r.left)/zoom,y:(e.clientY-r.top)/zoom};
  },[zoom]);
  const onFragPointerDown=useCallback((e,fragId,layerId)=>{
    e.stopPropagation();e.preventDefault();
    setSelectedFragId(fragId);
    setActiveLayerId(layerId);
    const layer=layersRef.current.find(l=>l.id===layerId);
    const frag=layer?.placed.find(f=>f.id===fragId);
    if(!frag||frag.locked||layer.locked) return;
    const p=toCanvas(e);
    setDragState({fragId,layerId,ox:p.x-frag.x,oy:p.y-frag.y,moved:false});
  },[toCanvas]);
  useEffect(()=>{
    if(!dragState) return;
    const move=(e)=>{
      const p=toCanvas(e);
      let x=p.x-dragState.ox,y=p.y-dragState.oy;
      if(snapGrid){x=Math.round(x/GRID)*GRID;y=Math.round(y/GRID)*GRID;}
      dragState.moved=true;draggingRef.current=true;
      setLive(prev=>prev.map(l=>l.id===dragState.layerId
        ?{...l,placed:l.placed.map(f=>f.id===dragState.fragId?{...f,x,y}:f)}:l));
    };
    const up=()=>{
      draggingRef.current=false;
      if(dragState.moved) record(layersRef.current);
      setDragState(null);
    };
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);
    return()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);};
  },[dragState,snapGrid,toCanvas,setLive,record]);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(()=>{
    const isField=(el)=>el&&/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
    const onKey=(e)=>{
      if(isField(e.target)) return;
      const mod=e.ctrlKey||e.metaKey;
      if(mod&&e.key.toLowerCase()==='z'&&!e.shiftKey){e.preventDefault();undo();}
      else if(mod&&(e.key.toLowerCase()==='y'||(e.key.toLowerCase()==='z'&&e.shiftKey))){e.preventDefault();redo();}
      else if(e.key==='Escape') setSelectedFragId(null);
      else if((e.key==='Delete'||e.key==='Backspace')&&selectedFragId){
        const l=layersRef.current.find(x=>x.placed?.some(f=>f.id===selectedFragId));
        if(l){e.preventDefault();deleteFrag(l.id,selectedFragId);}
      }
    };
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  });

  // ── Fragment ops ───────────────────────────────────────────────────────────
  const updateFrag=useCallback((layerId,fragId,upd)=>{
    commit(prev=>prev.map(l=>l.id===layerId?{...l,placed:l.placed.map(f=>f.id===fragId?{...f,...upd}:f)}:l),'F'+fragId+Object.keys(upd).join());
  },[commit]);
  const deleteFrag=useCallback((layerId,fragId)=>{
    commit(prev=>prev.map(l=>l.id===layerId?{...l,placed:l.placed.filter(f=>f.id!==fragId)}:l));
    setSelectedFragId(null);
  },[commit]);
  const dupFrag=useCallback((layerId,frag)=>{
    const nf={...frag,id:uid(),x:frag.x+20,y:frag.y+20,zIndex:(frag.zIndex||0)+1};
    commit(prev=>prev.map(l=>l.id===layerId?{...l,placed:[...l.placed,nf]}:l));
    setSelectedFragId(nf.id);
  },[commit]);
  const bringFwd=useCallback((layerId,fragId)=>{
    commit(prev=>prev.map(l=>{if(l.id!==layerId)return l;const mx=Math.max(...l.placed.map(f=>f.zIndex||0));return{...l,placed:l.placed.map(f=>f.id===fragId?{...f,zIndex:mx+1}:f)};}));
  },[commit]);
  const sendBck=useCallback((layerId,fragId)=>{
    commit(prev=>prev.map(l=>{if(l.id!==layerId)return l;const mn=Math.min(...l.placed.map(f=>f.zIndex||0));return{...l,placed:l.placed.map(f=>f.id===fragId?{...f,zIndex:mn-1}:f)};}));
  },[commit]);

  // ── Layer ops ─────────────────────────────────────────────────────────────
  const addSolidLayer=useCallback(()=>{
    const l={id:uid(),name:'Solid Color',type:'solid',srcUrl:null,imgEl:null,
      fragments:[],placed:[],grade:{...defaultGrade(),solidColor:'#444444'},
      visible:true,locked:false,x:0,y:0,w:CW,h:CH,rotation:0};
    commit(prev=>[...prev,l]);setActiveLayerId(l.id);
  },[CW,CH,commit]);
  const deleteLayer=useCallback((id)=>{
    const next=commit(prev=>prev.filter(l=>l.id!==id));
    if(activeLayerId===id) setActiveLayerId(next[next.length-1]?.id||null);
  },[activeLayerId,commit]);
  const dupeLayer=useCallback((id)=>{
    const l=layersRef.current.find(x=>x.id===id);if(!l)return;
    const nl={...l,id:uid(),name:l.name+' copy'};
    commit(prev=>{const i=prev.findIndex(x=>x.id===id);const n=[...prev];n.splice(i+1,0,nl);return n;});
    setActiveLayerId(nl.id);
  },[commit]);
  const moveLayer=useCallback((id,dir)=>{
    commit(prev=>{const i=prev.findIndex(l=>l.id===id),j=i+dir;if(i<0||j<0||j>=prev.length)return prev;const n=[...prev];[n[i],n[j]]=[n[j],n[i]];return n;});
  },[commit]);
  const moveLayerUp=useCallback((id)=>moveLayer(id,1),[moveLayer]);
  const moveLayerDown=useCallback((id)=>moveLayer(id,-1),[moveLayer]);

  // ── LUT import ────────────────────────────────────────────────────────────
  const importLUT=useCallback((file)=>{
    if(!file||!activeLayer) return;
    const id=activeLayer.id;
    const reader=new FileReader();
    reader.onload=e=>{
      try{updateGrade(id,{lutName:file.name,lutData:window.DZ.parseCube(e.target.result)});endGesture();}
      catch(err){alert(`Could not read ${file.name}: ${err.message}. DASZFRAME supports 3D .cube LUTs.`);}
    };
    reader.readAsText(file);
  },[activeLayer,updateGrade,endGesture]);

  // ── Sessions: save, open, autosave, restore ───────────────────────────────
  const snapshot=useCallback(()=>window.DZStore.serialize(
    {layers:layersRef.current,name:projectName,canvasSizeId,bgColor,layoutMode,activeLayerId},
    srcDataCache.current),[projectName,canvasSizeId,bgColor,layoutMode,activeLayerId]);

  const applySession=useCallback(async(session)=>{
    const s=await window.DZStore.deserialize(session);
    setProjectName(s.name||'Untitled Project');
    if(s.canvasSizeId) setCanvasSizeId(s.canvasSizeId);
    if(s.bgColor) setBgColor(s.bgColor);
    if(s.layoutMode) setLayoutMode(s.layoutMode);
    setLive(s.layers);resetHistory(s.layers);
    setActiveLayerId(s.activeLayerId||s.layers[s.layers.length-1]?.id||null);
    setSelectedFragId(null);
    if(s.savedAt) setLastSaved(new Date(s.savedAt));
  },[setLive,resetHistory]);

  const saveProject=useCallback((name)=>{
    const pName=name||projectName||'Untitled Project';
    setProjectName(pName);
    const session={...snapshot(),name:pName};
    const blob=new Blob([JSON.stringify(session)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=`${pName.replace(/[^a-zA-Z0-9_\- ]/g,'').trim()||'project'}.daszframe`;
    a.click();setTimeout(()=>URL.revokeObjectURL(a.href),10000);
    setLastSaved(new Date());
    const recents=[{name:pName,date:new Date().toISOString()},...recentProjects.filter(r=>r.name!==pName)].slice(0,5);
    setRecentProjects(recents);
    try{localStorage.setItem('daszframe_recent',JSON.stringify(recents));}catch(_){}
  },[projectName,snapshot,recentProjects]);

  const openProject=useCallback((file)=>{
    if(!file) return;
    const reader=new FileReader();
    reader.onload=async e=>{
      try{setIsProc(true);setProcMsg('Opening project…');await applySession(JSON.parse(e.target.result));setRestoreOffer(null);}
      catch(_){alert('Could not open file — it may be corrupted or not a .daszframe project.');}
      finally{setIsProc(false);}
    };
    reader.readAsText(file);
  },[applySession]);

  // Offer to restore the last session on start-up.
  useEffect(()=>{
    window.DZStore.loadAutosave().then(s=>{if(s&&s.layers&&s.layers.length) setRestoreOffer(s);});
  },[]);
  const restoreSession=useCallback(async()=>{
    const s=restoreOffer;setRestoreOffer(null);if(!s) return;
    setIsProc(true);setProcMsg('Restoring your last session…');
    try{await applySession(s);}catch(_){alert('The saved session could not be restored.');}
    setIsProc(false);
  },[restoreOffer,applySession]);
  const dismissRestore=useCallback(()=>{setRestoreOffer(null);window.DZStore.clearAutosave();},[]);

  // Autosave to IndexedDB 1.5s after the last change (full photos included).
  useEffect(()=>{
    if(!layers.length||restoreOffer) return;
    const t=setTimeout(()=>{
      try{window.DZStore.saveAutosave(snapshot()).catch(err=>console.warn('Autosave failed:',err));}
      catch(err){console.warn('Autosave failed:',err);}
    },1500);
    return()=>clearTimeout(t);
  },[layers,projectName,canvasSizeId,bgColor,layoutMode,restoreOffer,snapshot]);

  // ── Live preview: the same engine as export, drawn to a canvas ─────────────
  const canvasRef=useRef(null);
  const draggingRef=useRef(false);
  const viewRef=useRef({});
  viewRef.current={CW,CH,bgColor,zoom};
  const rafRef=useRef(0);
  const drawPreview=useCallback(()=>{
    cancelAnimationFrame(rafRef.current);
    rafRef.current=requestAnimationFrame(()=>{
      const c=canvasRef.current;if(!c) return;
      const V=viewRef.current;
      const pr=(draggingRef.current?1:Math.min(window.devicePixelRatio||1,2))*V.zoom;
      const w=Math.round(V.CW*pr),hh=Math.round(V.CH*pr);
      if(c.width!==w||c.height!==hh){c.width=w;c.height=hh;}
      try{window.DZ.renderComposite(c.getContext('2d'),layersRef.current,{scale:pr,CW:V.CW,CH:V.CH,bgColor:V.bgColor,onPending:drawPreview});}
      catch(err){console.error('Preview render failed:',err);}
    });
  },[]);
  useEffect(()=>{drawPreview();},[layers,bgColor,CW,CH,zoom,appTab,viewMode,dragState,drawPreview]);

  // Fit the canvas to the available space (never upscales past 100%).
  const stageWrapRef=useRef(null);
  useEffect(()=>{
    const el=stageWrapRef.current;if(!el) return;
    const fit=()=>{const r=el.getBoundingClientRect();if(!r.width) return;setZoom(clamp(Math.min((r.width-40)/CW,(r.height-40)/CH,1),.15,1));};
    fit();
    const ro=new ResizeObserver(fit);ro.observe(el);
    return()=>ro.disconnect();
  },[CW,CH,appTab,viewMode,leftOpen,rightOpen]);

  // ── Still export (PNG / JPG) ──────────────────────────────────────────────
  const doExport=useCallback(async(fmt,scale,customName)=>{
    const baseName=(customName||projectName||'daszframe').replace(/[^a-zA-Z0-9_\- ]/g,'').trim()||'daszframe';
    const mime=fmt==='jpg'?'image/jpeg':'image/png';
    const render=async(sc)=>{
      const c=document.createElement('canvas');c.width=CW*sc;c.height=CH*sc;
      const ctx=c.getContext('2d');
      if(!ctx) throw new Error('This device could not create a canvas that large.');
      await window.DZ.preload(window.DZ.layerSources(layersRef.current));
      window.DZ.renderComposite(ctx,layersRef.current,{scale:sc,CW,CH,bgColor});
      const blob=await new Promise(res=>c.toBlob(res,mime,.95));
      if(!blob) throw new Error('The image was too large for this device.');
      const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${baseName}.${fmt}`;a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),10000);
    };
    setIsProc(true);setProcMsg(`Rendering ${CW*scale}×${CH*scale}…`);await tick();
    try{await render(scale);return true;}
    catch(err){
      if(scale>1){
        try{await render(1);alert(`Export at ${scale}× ran out of memory, so it was saved at 1× instead.`);return true;}catch(_){}
      }
      alert('Export failed: '+(err&&err.message?err.message:'unknown error'));
      return false;
    }finally{setIsProc(false);}
  },[bgColor,CW,CH,projectName]);

  // ── Save / load grade as JSON ─────────────────────────────────────────────
  const saveGrade=useCallback(()=>{
    if(!activeLayer) return;
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([JSON.stringify(activeLayer.grade,null,2)],{type:'application/json'}));
    a.download=`${activeLayer.name}-grade.json`;a.click();
  },[activeLayer]);

  const loadGrade=useCallback((file)=>{
    if(!file||!activeLayer) return;
    const id=activeLayer.id;
    const reader=new FileReader();
    reader.onload=e=>{try{updateGrade(id,JSON.parse(e.target.result));endGesture();}catch(_){alert('That file is not a DASZFRAME grade.');}};
    reader.readAsText(file);
  },[activeLayer,updateGrade,endGesture]);

  // ── Variations ────────────────────────────────────────────────────────────
  const genVariations=useCallback(()=>{
    if(!activeLayer||activeLayer.type!=='collage'||!activeLayer.fragments.length){
      setStatusNote('Variations work on a collage layer. Add or select one first.');return;
    }
    const modes=['dasz','mosaic','editorial','cubist','symmetry','gallery','experimental'];
    setVariations(modes.map(m=>({mode:m,frags:composeLayout(activeLayer.fragments,m,CW,CH)})));
    setShowVars(true);
  },[activeLayer,CW,CH]);

  // Currently selected fragment (in active layer)
  const selFrag=activeLayer?.placed.find(f=>f.id===selectedFragId);

  // ── RENDER ────────────────────────────────────────────────────────────────

  // Left panel — tools + layers
  function LeftPanel(){
    return h('div',{className:`panel pl${!leftOpen?' col':''}`},
      h('div',{className:'phdr'},
        h('span',{className:'ptitle'},'Layers'),
        h('button',{className:'btn ico ghost',onClick:()=>setLeftOpen(o=>!o)},leftOpen?'←':'→')
      ),
      h('div',{className:'pclabel',onClick:()=>setLeftOpen(true)},'Layers'),
      h('div',{className:'pscroll'},
        // Add layer buttons
        h('div',{className:'sec'},
          h('div',{className:'slabel'},'Add Layer'),
          h('div',{style:{display:'flex',flexDirection:'column',gap:3}},
            h('button',{className:'btn sm full',onClick:()=>fileInputRef.current?.click()},
              h('span',{style:{fontSize:14}},'🖼'),' Add Photo Layer'),
            h('button',{className:'btn sm full',onClick:()=>{fileInputRef.current.dataset.collage='1';fileInputRef.current.click();}},
              h('span',{style:{fontSize:14}},'◈'),' Add Collage Layer'),
            h('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:3}},
              h('button',{className:'btn sm',onClick:addSolidLayer},'+ Solid'),
              h('button',{className:'btn sm',onClick:()=>genVariations()},'⊞ Vars')
            )
          ),
          h('input',{ref:fileInputRef,type:'file',accept:'image/*',style:{display:'none'},
            onChange:e=>{const f=e.target.files[0];const isC=e.target.dataset.collage==='1';delete e.target.dataset.collage;addPhotoLayer(f,isC);e.target.value='';}}),
        ),

        // Layer stack
        h('div',{className:'sec'},
          h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:7}},
            h('div',{className:'slabel',style:{marginBottom:0}},`Layers (${layers.length})`),
            h('div',{style:{display:'flex',gap:3}},
              h('button',{className:'btn xs ghost',title:'Move up',onClick:()=>activeLayerId&&moveLayerUp(activeLayerId)},'↑'),
              h('button',{className:'btn xs ghost',title:'Move down',onClick:()=>activeLayerId&&moveLayerDown(activeLayerId)},'↓')
            )
          ),
          layers.length===0&&h('div',{style:{fontSize:11,color:'var(--muted)',textAlign:'center',padding:12}},'No layers yet.\nAdd a photo above.'),
          h('div',{className:'layer-list'},
            [...layers].reverse().map(l=>{
              const isActive=l.id===activeLayerId;
              const g=l.grade||defaultGrade();
              return h('div',{key:l.id,
                className:`layer-item${isActive?' active-layer sel':''}`,
                onClick:()=>{setActiveLayerId(l.id);setSelectedFragId(null);}},
                isActive&&h('div',{className:'active-mark'}),
                l.imgEl
                  ?h('img',{className:'lthumb',src:l.srcUrl,style:{opacity:l.visible?1:.35}})
                  :h('div',{className:'lthumb',style:{background:l.grade?.solidColor||'#444',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,opacity:l.visible?1:.35}},'▪'),
                h('div',{className:'linfo'},
                  h('div',{className:'lname'},l.name),
                  h('div',{className:'lmeta'},`${l.type} · ${g.blendMode||'normal'} · ${g.opacity??100}%`)
                ),
                h('span',{className:'layer-badge'},l.type==='collage'?'COL':'IMG'),
                h('div',{style:{display:'flex',gap:2,opacity:isActive?1:0,transition:'opacity .12s'}},
                  h('button',{className:'btn ico ghost',onClick:e=>{e.stopPropagation();updateLayer(l.id,{visible:!l.visible});}},l.visible?'●':'○'),
                  h('button',{className:'btn ico ghost red',onClick:e=>{e.stopPropagation();deleteLayer(l.id);}},h('span',{style:{fontSize:10}},'✕'))
                )
              );
            })
          )
        ),

        // Quick AI styles
        h('div',{className:'sec'},
          h('div',{className:'slabel'},'Style Presets'),
          h('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:3}},
            STYLE_PRESETS.map(q=>h('button',{key:q.id,className:'btn sm',
              style:{justifyContent:'flex-start',fontSize:10,gap:4},
              title:`${FILM_LOOKS.find(l=>l.id===q.look)?.name} look`+' + '+q.layout+' layout',onClick:()=>applyPreset(q)},
              h('span',null,q.icon),q.label))
          )
        ),

        // Layout (for collage layers)
        activeLayer?.type==='collage'&&h('div',{className:'sec'},
          h('div',{className:'slabel'},'Collage Layout'),
          h('div',{className:`dchip${layoutMode==='dasz'?' on':''}`,
            onClick:()=>chooseLayout('dasz')},
            h('span',{style:{fontSize:13}},'◉'),h('span',null,'DASZ'),h('span',{className:'dchip-sub'},'Signature')
          ),
          h('div',{className:'cgrid3',style:{marginTop:3}},
            LAYOUT_MODES.filter(m=>!m.sig).map(m=>h('div',{key:m.id,
              className:`chip${layoutMode===m.id?' on':''}`,
              onClick:()=>chooseLayout(m.id)},
              m.icon,' ',m.label))
          ),
          h('button',{className:'btn sm full',style:{marginTop:4},onClick:()=>recompose()},'↻ Recompose')
        ),

        // AI note
        statusNote&&h('div',{className:'sec'},h('div',{className:'ai-card'},h('div',{className:'ai-badge'},'NOTE'),h('div',{className:'ai-text'},statusNote),
          h('button',{className:'btn ico ghost',title:'Dismiss',onClick:()=>setStatusNote(''),style:{marginLeft:'auto',alignSelf:'flex-start'}},'✕'))),

        // Canvas
        h('div',{className:'sec'},
          h('div',{className:'slabel'},'Canvas'),
          h('div',{style:{display:'flex',flexDirection:'column',gap:3}},
            CANVAS_SIZES.map(s=>h('button',{key:s.id,className:`btn sm${canvasSizeId===s.id?' act':''}`,
              style:{justifyContent:'space-between'},onClick:()=>setCanvasSizeId(s.id)},
              h('span',null,s.label),h('span',{style:{color:'var(--muted)',fontSize:9,fontFamily:'var(--fm)'}},`${s.w}×${s.h}`)
            ))
          ),
          h('div',{style:{display:'flex',gap:5,flexWrap:'wrap',alignItems:'center',marginTop:6}},
            ['#0f0f0f','#ffffff','#f5f0e8','#e2ddd6','#1a1a2e'].map(c=>
              h('div',{key:c,onClick:()=>setBgColor(c),style:{width:18,height:18,background:c,borderRadius:2,cursor:'pointer',border:bgColor===c?'2px solid var(--acc)':'1px solid var(--b2)'}})
            ),
            h('input',{type:'color',value:bgColor,onChange:e=>setBgColor(e.target.value),style:{width:18,height:18,border:'none',background:'none',cursor:'pointer',padding:0}})
          )
        )
      )
    );
  }

  // Right panel — grade / effects / props
  function RightPanel(){
    const g=activeGrade;
    const gid=activeLayer?.id;

    return h('div',{className:`panel pr${!rightOpen?' col':''}`},
      h('div',{className:'phdr'},
        h('button',{className:'btn ico ghost',onClick:()=>setRightOpen(o=>!o)},rightOpen?'→':'←'),
        h('span',{className:'ptitle'},activeLayer?`Grade: ${activeLayer.name}`:'Grading')
      ),
      h('div',{className:'pclabel',onClick:()=>setRightOpen(true)},'Grade'),
      h('div',{className:'pscroll'},
        h('div',{className:'tabs'},
          h('div',{className:`tab${rtab==='looks'?' on':''}`,onClick:()=>setRtab('looks')},'Looks'),
          h('div',{className:`tab${rtab==='grade'?' on':''}`,onClick:()=>setRtab('grade')},'Grade'),
          h('div',{className:`tab${rtab==='fx'?' on':''}`,onClick:()=>setRtab('fx')},'FX'),
          h('div',{className:`tab${rtab==='frag'?' on':''}`,onClick:()=>setRtab('frag')},'Layer'),
        ),

        !activeLayer&&h('div',{style:{color:'var(--muted)',fontSize:11,textAlign:'center',padding:16,lineHeight:1.8}},'Select a layer\nto start grading.'),

        // ── LOOKS TAB ──────────────────────────────────────────────────────
        rtab==='looks'&&activeLayer&&h('div',null,
          h('div',{className:'sec'},
            h('div',{className:'slabel'},'Film Looks'),
            h('div',{className:'look-grid'},
              FILM_LOOKS.map(lk=>h('div',{key:lk.id,
                className:`look-card${g.look===lk.id?' on':''}`,
                onClick:()=>updateGrade(gid,{look:lk.id})},
                h('div',{className:'look-name'},lk.name),
                h('div',{className:'look-sub'},lk.sub)
              ))
            )
          ),
          g.look&&g.look!=='none'&&h('div',{className:'sec'},
            h('div',{className:'slabel'},'Look Strength'),
            h('div',{className:'srow'},
              h('span',{className:'srow-label'},'Strength'),
              h('input',{type:'range',min:0,max:100,value:g.lookStrength??100,onChange:e=>updateGrade(gid,{lookStrength:+e.target.value})}),
              h('span',{className:'srow-val'},`${g.lookStrength??100}%`)
            )
          ),
          // LUT
          h('div',{className:'sec'},
            h('div',{className:'slabel'},'LUT Import / Export'),
            g.lutName&&h('div',{className:'lut-badge',style:{marginBottom:6}},
              h('span',null,'📁'),h('span',null,g.lutName),
              h('button',{className:'btn ico ghost',onClick:()=>updateGrade(gid,{lutName:null,lutData:null})},'✕')
            ),
            h('div',{style:{display:'flex',gap:4}},
              h('label',{className:'btn sm',style:{cursor:'pointer',flex:1,justifyContent:'center'}},
                '↑ Import .cube',
                h('input',{ref:lutInputRef,type:'file',accept:'.cube',style:{display:'none'},onChange:e=>importLUT(e.target.files[0])})
              ),
              h('button',{className:'btn sm',style:{flex:1},onClick:saveGrade},'↓ Export Grade')
            ),
            h('label',{className:'btn sm full',style:{cursor:'pointer',marginTop:3,justifyContent:'center'}},
              '↑ Load Grade JSON',
              h('input',{type:'file',accept:'.json',style:{display:'none'},onChange:e=>loadGrade(e.target.files[0])})
            )
          )
        ),

        // ── GRADE TAB (node-style) ─────────────────────────────────────────
        rtab==='grade'&&activeLayer&&h('div',null,

          // ── SOLID COLOUR LAYER — full editor ──────────────────────────────
          activeLayer.type==='solid'&&h('div',{className:'sec',style:{background:'var(--s2)',borderRadius:6,padding:10,marginBottom:6}},
            h('div',{className:'node-title',style:{marginBottom:8}},'◈ Solid Colour'),
            h('div',{style:{display:'flex',alignItems:'center',gap:8,marginBottom:10}},
              // Big colour preview swatch that opens native picker
              h('label',{style:{display:'block',cursor:'pointer',flexShrink:0},title:'Click to pick colour'},
                h('div',{style:{
                  width:56,height:56,borderRadius:6,
                  background:g.solidColor||'#444444',
                  border:'2px solid var(--b2)',
                  boxShadow:'inset 0 0 0 1px rgba(255,255,255,0.08)',
                }}),
                h('input',{type:'color',value:g.solidColor||'#444444',
                  style:{position:'absolute',opacity:0,width:0,height:0,pointerEvents:'none'},
                  onChange:e=>{ updateGrade(gid,{solidColor:e.target.value}); }})
              ),
              h('div',{style:{flex:1}},
                // Hex text input
                h('div',{style:{fontSize:10,color:'var(--muted)',marginBottom:4,fontFamily:'var(--fm)',letterSpacing:1}},'HEX'),
                h('input',{
                  type:'text',
                  value:(g.solidColor||'#444444').toUpperCase(),
                  style:{width:'100%',background:'var(--s3)',border:'1px solid var(--b1)',color:'var(--text)',padding:'4px 8px',borderRadius:4,fontSize:12,fontFamily:'var(--fm)'},
                  onChange:e=>{
                    const v=e.target.value.trim();
                    if(/^#[0-9a-fA-F]{6}$/.test(v)||/^#[0-9a-fA-F]{3}$/.test(v)) updateGrade(gid,{solidColor:v});
                  },
                  onBlur:e=>{
                    let v=e.target.value.trim();
                    if(!/^#/.test(v)) v='#'+v;
                    if(/^#[0-9a-fA-F]{6}$/.test(v)) updateGrade(gid,{solidColor:v});
                  },
                }),
              ),
            ),
            // Colour presets
            h('div',{style:{fontSize:10,color:'var(--muted)',fontFamily:'var(--fm)',letterSpacing:1,marginBottom:6}},'PRESETS'),
            h('div',{style:{display:'flex',flexWrap:'wrap',gap:5}},
              ['#000000','#111111','#ffffff','#f5f5f5','#f0e8d0','#1a1a2e',
               '#ff0000','#ff6b00','#ffd700','#00c853','#00b0ff','#aa00ff',
               '#e91e63','#3d5afe','#1de9b6','#607d8b',
              ].map(c=>h('div',{key:c,
                onClick:()=>updateGrade(gid,{solidColor:c}),
                style:{
                  width:22,height:22,borderRadius:4,background:c,cursor:'pointer',
                  border:`2px solid ${(g.solidColor||'').toLowerCase()===c?'var(--acc)':'var(--b2)'}`,
                  transition:'border-color .1s',
                  boxShadow:'inset 0 0 0 1px rgba(255,255,255,0.06)',
                },
                title:c,
              }))
            ),
            // Opacity (reuse global opacity control)
            h('div',{className:'srow',style:{marginTop:10}},
              h('span',{className:'srow-label'},'Opacity'),
              h('input',{type:'range',min:0,max:100,value:g.opacity??100,
                onChange:e=>updateGrade(gid,{opacity:+e.target.value}),
                onMouseUp:commitGrade}),
              h('span',{className:'srow-val'},`${g.opacity??100}%`)
            ),
            // Blend mode
            h('div',{className:'srow',style:{marginTop:4}},
              h('span',{className:'srow-label'},'Blend'),
              h('select',{
                value:g.blendMode||'normal',
                style:{flex:1,background:'var(--s3)',border:'1px solid var(--b1)',color:'var(--text)',padding:'3px 6px',borderRadius:3,fontSize:11,fontFamily:'var(--fm)'},
                onChange:e=>{ updateGrade(gid,{blendMode:e.target.value}); commitGrade(); }},
                BLEND_MODES.map(m=>h('option',{key:m,value:m},m))
              )
            ),
          ),

          // For non-solid layers, show normal grade nodes
          activeLayer.type!=='solid'&&h('div',null,
          // Exposure node
          h('div',{className:'sec'},
            h('div',{className:'node-graph'},
              h('div',{className:'node-title'},'◈ Exposure & Tone'),
              [['Exposure',g.exposure,'exposure',-100,100],
               ['Contrast',g.contrast,'contrast',-100,100],
               ['Highlights',g.highlights,'highlights',-100,100],
               ['Shadows',g.shadows,'shadows',-100,100],
               ['Whites',g.whites,'whites',-100,100],
               ['Blacks',g.blacks,'blacks',-100,100],
              ].map(([label,val,key,mn,mx])=>
                h('div',{key:key,className:'srow'},
                  h('span',{className:'srow-label'},label),
                  h('input',{type:'range',min:mn,max:mx,step:1,value:val||0,
                    onChange:e=>updateGrade(gid,{[key]:+e.target.value}),
                    onMouseUp:commitGrade}),
                  h('span',{className:'srow-val'},(val||0)>0?`+${val||0}`:val||0)
                )
              )
            ),
            // Color node
            h('div',{className:'node-graph'},
              h('div',{className:'node-title'},'◈ Color'),
              [['Saturation',g.saturation,'saturation',-100,100],
               ['Temperature',g.temperature,'temperature',-100,100],
               ['Tint',g.tint,'tint',-100,100],
               ['Vibrance',g.vibrance,'vibrance',-100,100],
              ].map(([label,val,key,mn,mx])=>
                h('div',{key:key,className:'srow'},
                  h('span',{className:'srow-label'},label),
                  h('input',{type:'range',min:mn,max:mx,step:1,value:val||0,
                    onChange:e=>updateGrade(gid,{[key]:+e.target.value}),
                    onMouseUp:commitGrade}),
                  h('span',{className:'srow-val'},(val||0)>0?`+${val||0}`:val||0)
                )
              )
            ),
            // Lift/Gamma/Gain node
            h('div',{className:'node-graph'},
              h('div',{className:'node-title'},'◈ Lift · Gamma · Gain'),
              [['Lift',g.lift,'lift',-50,50,1],
               ['Gamma',g.gamma,'gamma',.1,2.5,.01],
               ['Gain',g.gain,'gain',.1,2.5,.01],
              ].map(([label,val,key,mn,mx,step])=>
                h('div',{key:key,className:'srow'},
                  h('span',{className:'srow-label'},label),
                  h('input',{type:'range',min:mn,max:mx,step,value:val||0,
                    onChange:e=>updateGrade(gid,{[key]:+e.target.value}),
                    onMouseUp:commitGrade}),
                  h('span',{className:'srow-val'},typeof val==='number'?val.toFixed(key==='lift'?0:2):'0')
                )
              )
            ),
          ),
          // Blend mode for the layer
          h('div',{className:'sec'},
            h('div',{className:'slabel'},'Layer Blend Mode'),
            h('div',{className:'blend-row'},
              BLEND_MODES.map(bm=>h('div',{key:bm,className:`blend-chip${(g.blendMode||'normal')===bm?' on':''}`,
                onClick:()=>updateGrade(gid,{blendMode:bm})},bm))
            )
          ),
          h('div',{className:'sec'},
            h('div',{className:'slabel'},'Layer Opacity'),
            h('div',{className:'srow'},
              h('span',{className:'srow-label'},'Opacity'),
              h('input',{type:'range',min:0,max:100,value:g.opacity??100,
                onChange:e=>updateGrade(gid,{opacity:+e.target.value})}),
              h('span',{className:'srow-val'},`${g.opacity??100}%`)
            )
          )
        )
        ) // end non-solid wrapper div
        , // end grade tab children

        // ── FX TAB ────────────────────────────────────────────────────────
        rtab==='fx'&&activeLayer&&h('div',{className:'sec'},
          h('div',{className:'node-graph'},
            h('div',{className:'node-title'},'◈ Optical Effects'),
            [['Vignette',g.vignette||0,'vignette',0,100],
             ['Film Grain',g.grain||0,'grain',0,100],
             ['Chromatic Ab.',g.chromAb||0,'chromAb',0,20],
             ['Blur',g.blur||0,'blur',0,100],
             ['Glow',g.glow||0,'glow',0,100],
             ['Clarity',g.clarity||0,'clarity',-100,100],
             ['Sharpness',g.sharpness||0,'sharpness',0,100],
            ].map(([label,val,key,mn,mx])=>
              h('div',{key:key,className:'srow'},
                h('span',{className:'srow-label'},label),
                h('input',{type:'range',min:mn,max:mx,step:1,value:val,onChange:e=>updateGrade(gid,{[key]:+e.target.value}),onMouseUp:commitGrade}),
                h('span',{className:'srow-val'},val>0?`+${val}`:val)
              )
            )
          ),
          h('div',{className:'node-graph'},
            h('div',{className:'node-title'},'◈ Background'),
            h('div',{style:{display:'flex',flexDirection:'column',gap:4}},
              h('button',{className:'btn sm full',onClick:()=>{
                // Simple BG blur — add blur to bottom-most layer
                const bottomL=layers[0];if(bottomL) updateGrade(bottomL.id,{blur:30});
              }},'Blur Background'),
              h('button',{className:'btn sm full',onClick:()=>{
                const bottomL=layers[0];if(bottomL) updateGrade(bottomL.id,{blur:0,look:'none'});
              }},'Reset Background'),
              h('button',{className:'btn sm full',onClick:()=>fileInputRef.current?.click()},'Replace Background Photo')
            )
          )
        ),

        // ── LAYER / FRAGMENT TAB ──────────────────────────────────────────
        rtab==='frag'&&activeLayer&&h('div',null,
          // Layer-level props
          h('div',{className:'sec'},
            h('div',{className:'slabel'},'Layer Transform'),
            h('div',{className:'pgrid2'},
              ['x','y'].map(p=>h('div',{key:p,className:'pfield'},
                h('div',{className:'pfield-lbl'},p.toUpperCase()),
                h('input',{type:'number',value:Math.round(activeLayer[p]||0),onChange:e=>updateLayer(activeLayer.id,{[p]:+e.target.value})})
              ))
            ),
            h('div',{className:'pgrid2'},
              ['w','h'].map(p=>h('div',{key:p,className:'pfield'},
                h('div',{className:'pfield-lbl'},p==='w'?'WIDTH':'HEIGHT'),
                h('input',{type:'number',value:Math.round(activeLayer[p]||0),onChange:e=>updateLayer(activeLayer.id,{[p]:+e.target.value})})
              ))
            ),
            h('div',{className:'srow'},
              h('span',{className:'srow-label'},'Rotation'),
              h('input',{type:'range',min:-180,max:180,step:1,value:activeLayer.rotation||0,onChange:e=>updateLayer(activeLayer.id,{rotation:+e.target.value})}),
              h('span',{className:'srow-val'},`${activeLayer.rotation||0}°`)
            ),
            h('div',{style:{display:'flex',gap:4,marginTop:4}},
              h('button',{className:'btn sm',style:{flex:1},onClick:()=>dupeLayer(activeLayer.id)},'⊕ Duplicate'),
              h('button',{className:'btn sm red',style:{flex:1},onClick:()=>deleteLayer(activeLayer.id)},'✕ Delete')
            )
          ),
          // Fragment props (if collage layer and frag selected)
          activeLayer.type==='collage'&&selFrag&&h('div',{className:'sec'},
            h('div',{className:'slabel'},'Fragment: '+selFrag.label),
            h('div',{className:'pgrid2'},
              ['x','y'].map(p=>h('div',{key:p,className:'pfield'},
                h('div',{className:'pfield-lbl'},p.toUpperCase()),
                h('input',{type:'number',value:Math.round(selFrag[p]||0),onChange:e=>updateFrag(activeLayer.id,selectedFragId,{[p]:+e.target.value})})
              ))
            ),
            h('div',{className:'pgrid2',style:{marginBottom:6}},
              ['w','h'].map(p=>h('div',{key:p,className:'pfield'},
                h('div',{className:'pfield-lbl'},p==='w'?'W':'H'),
                h('input',{type:'number',value:Math.round(selFrag[p]||0),onChange:e=>updateFrag(activeLayer.id,selectedFragId,{[p]:+e.target.value})})
              ))
            ),
            h('div',{className:'srow'},
              h('span',{className:'srow-label'},'Rotation'),
              h('input',{type:'range',min:-180,max:180,step:1,value:selFrag.rotation||0,onChange:e=>updateFrag(activeLayer.id,selectedFragId,{rotation:+e.target.value})}),
              h('span',{className:'srow-val'},`${Math.round(selFrag.rotation||0)}°`)
            ),
            h('div',{className:'srow'},
              h('span',{className:'srow-label'},'Opacity'),
              h('input',{type:'range',min:0,max:1,step:.01,value:selFrag.opacity??1,onChange:e=>updateFrag(activeLayer.id,selectedFragId,{opacity:+e.target.value})}),
              h('span',{className:'srow-val'},`${Math.round((selFrag.opacity??1)*100)}%`)
            ),
            h('div',{className:'srow'},
              h('span',{className:'srow-label'},'Radius'),
              h('input',{type:'range',min:0,max:80,step:1,value:selFrag.borderRadius||0,onChange:e=>updateFrag(activeLayer.id,selectedFragId,{borderRadius:+e.target.value})}),
              h('span',{className:'srow-val'},`${selFrag.borderRadius||0}px`)
            ),
            h('div',{style:{display:'flex',flexDirection:'column',gap:4,marginTop:4}},
              h('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4}},
                h('button',{className:'btn sm',onClick:()=>updateFrag(activeLayer.id,selectedFragId,{flipped:!selFrag.flipped})},'↔ Flip'),
                h('button',{className:'btn sm',onClick:()=>bringFwd(activeLayer.id,selectedFragId)},'↑ Fwd')
              ),
              h('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4}},
                h('button',{className:'btn sm',onClick:()=>dupFrag(activeLayer.id,selFrag)},'⊕ Dup'),
                h('button',{className:'btn sm red',onClick:()=>deleteFrag(activeLayer.id,selectedFragId)},'✕ Del')
              )
            )
          ),
          // Fragment list
          activeLayer.type==='collage'&&activeLayer.placed.length>0&&h('div',{className:'sec'},
            h('div',{className:'slabel'},'Fragments ({n})'.replace('{n}',activeLayer.placed.length)),
            h('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:3}},
              activeLayer.placed.slice(0,10).map(f=>
                h('div',{key:f.id,
                  style:{borderRadius:3,overflow:'hidden',border:`1px solid ${selectedFragId===f.id?'var(--acc)':'var(--b1)'}`,background:'var(--s3)',cursor:'pointer',opacity:f.visible===false?.35:1},
                  onClick:()=>setSelectedFragId(f.id)},
                  h('img',{src:f.thumb,style:{width:'100%',display:'block'}}),
                  h('div',{style:{fontSize:8,fontFamily:'var(--fm)',color:'var(--muted)',padding:'2px 4px'}},f.label)
                )
              )
            )
          )
        )
      )
    );
  }

  // Canvas stage: the engine draws everything into one <canvas>; transparent
  // hit-boxes on top handle selecting and dragging.
  function Stage(){
    const sel=selectedFragId;
    return h('div',{className:'stage-fit',style:{width:CW*zoom,height:CH*zoom}},
      h('div',{
        className:'stage',
        ref:overlayRef,
        style:{width:CW,height:CH,position:'relative',overflow:'hidden',transform:`scale(${zoom})`,transformOrigin:'0 0'},
        onPointerDown:e=>{if(e.target===overlayRef.current||e.target===canvasRef.current){setSelectedFragId(null);}},
      },
        h('canvas',{ref:canvasRef,className:'stage-canvas',style:{position:'absolute',left:0,top:0,width:CW,height:CH}}),
        layers.filter(l=>l.visible!==false).map(l=>{
          const isActive=l.id===activeLayerId;
          if(l.type==='collage'){
            const frags=[...l.placed].filter(f=>f.visible!==false).sort((a,b)=>(a.zIndex||0)-(b.zIndex||0));
            return h('div',{key:l.id,className:'hit-layer'},
              frags.map(f=>h('div',{key:f.id,
                className:`hit frag-hit${sel===f.id?' sel':''}${isActive?' in-active':''}`,
                title:f.label,
                style:{left:f.x,top:f.y,width:f.w,height:f.h,
                  transform:`rotate(${f.rotation||0}deg)`,
                  borderRadius:f.borderRadius>0?`${f.borderRadius}px`:undefined},
                onPointerDown:e=>onFragPointerDown(e,f.id,l.id)}))
            );
          }
          return h('div',{key:l.id,className:`hit layer-hit${isActive?' sel':''}`,
            style:{left:l.x||0,top:l.y||0,width:l.w||CW,height:l.h||CH,transform:l.rotation?`rotate(${l.rotation}deg)`:undefined},
            onPointerDown:e=>{e.stopPropagation();setActiveLayerId(l.id);setSelectedFragId(null);}});
        }),

        isProc&&h('div',{className:'lo'},h('div',{className:'lo-msg'},procMsg),h('div',{className:'lo-bar'},h('div',{className:'lo-fill'}))),

        layers.length===0&&!isProc&&h('div',{className:'empty'},
          h('div',{className:'empty-logo'},'DASZFRAME'),
          h('div',{className:'empty-sub'},'Turn a portrait into a fragmented collage, or grade photos like film.\nEverything runs in your browser. Your photos never leave your device.'),
          h('div',{style:{display:'flex',gap:8,marginTop:14,flexWrap:'wrap',justifyContent:'center'}},
            h('button',{className:'btn pri',onClick:()=>{fileInputRef.current.dataset.collage='1';fileInputRef.current.click();}},'◈ Make a Face Collage'),
            h('button',{className:'btn',onClick:()=>fileInputRef.current?.click()},'🖼 Add a Photo')
          )
        )
      )
    );
  }

  function ExportModal(){
    const [fname,setFname]=useState(exportFilename||projectName||'daszframe');
    if(!showExport) return null;
    return h('div',{className:'modal-bg',onClick:()=>setShowExport(false)},
      h('div',{className:'modal',style:{width:340},onClick:e=>e.stopPropagation()},
        h('div',{className:'modal-title'},'Export Image'),
        h('div',{style:{marginBottom:14}},
          h('div',{style:{fontSize:10,color:'var(--muted)',fontFamily:'var(--fm)',marginBottom:6}},
            `${layers.filter(l=>l.visible).length} layers · ${CW}×${CH}`),
          h('div',{style:{marginBottom:10}},
            h('div',{style:{fontSize:11,color:'var(--text2)',marginBottom:5}},
              'Filename'),
            h('div',{style:{display:'flex',alignItems:'center',gap:6}},
              h('input',{type:'text',value:fname,
                onChange:e=>setFname(e.target.value),
                onKeyDown:e=>{if(e.key==='Enter'){setShowExport(false);doExport('png',2,fname);}},
                placeholder:'my-portrait',
                style:{flex:1,background:'var(--s3)',border:'1px solid var(--b2)',color:'var(--text)',
                  fontFamily:'var(--fb)',fontSize:13,padding:'5px 8px',borderRadius:3,outline:'none'}}),
              h('span',{style:{fontSize:11,color:'var(--muted)',fontFamily:'var(--fm)',flexShrink:0}},'.png / .jpg')
            )
          )
        ),
        h('div',{style:{fontSize:11,color:'var(--text2)',marginBottom:8}},
          'Format & Resolution'),
        h('div',{style:{display:'flex',flexDirection:'column',gap:5}},
          [['png',1,`PNG — Standard · ${CW}×${CH}`,'↓'],
           ['png',2,`PNG — HD · ${CW*2}×${CH*2}`,'↓'],
           ['png',4,`PNG — Print · ${CW*4}×${CH*4}`,'↓'],
           ['jpg',2,`JPG — HD · ${CW*2}×${CH*2}`,'↓'],
           ['jpg',4,`JPG — Print · ${CW*4}×${CH*4}`,'↓'],
          ].map(([fmt,sc,label,icon])=>
            h('button',{key:`${fmt}${sc}`,className:'btn',
              style:{justifyContent:'space-between'},
              onClick:()=>{setShowExport(false);doExport(fmt,sc,fname||projectName);}},
              h('span',null,label),
              h('span',{style:{color:'var(--muted)',fontSize:11}},`${icon} ${fname||'daszframe'}.${fmt}`)
            )
          )
        ),
        h('div',{className:'divider',style:{margin:'12px 0'}}),
        h('button',{className:'btn',style:{width:'100%'},onClick:()=>setShowExport(false)},'Cancel')
      )
    );
  }

  // Save As modal — rename and save project file
  function SaveAsModal(){
    const [name,setName]=useState(projectName);
    if(!showSaveAs) return null;
    return h('div',{className:'modal-bg',onClick:()=>setShowSaveAs(false)},
      h('div',{className:'modal',style:{width:320},onClick:e=>e.stopPropagation()},
        h('div',{className:'modal-title'},'Save Project'),
        h('div',{style:{marginBottom:14}},
          h('div',{style:{fontSize:11,color:'var(--text2)',marginBottom:6}},'Project name'),
          h('input',{type:'text',value:name,onChange:e=>setName(e.target.value),
            autoFocus:true,
            onKeyDown:e=>{if(e.key==='Enter'&&name.trim()){saveProject(name.trim());setShowSaveAs(false);}},
            placeholder:'My Portrait Project',
            style:{width:'100%',background:'var(--s3)',border:'1px solid var(--acc)',
              color:'var(--text)',fontFamily:'var(--fb)',fontSize:14,padding:'7px 10px',
              borderRadius:3,outline:'none',marginBottom:4}}),
          h('div',{style:{fontSize:10,color:'var(--muted)',fontFamily:'var(--fm)'}},'Saves as .daszframe file — open it later to continue editing')
        ),
        // Recents
        recentProjects.length>0&&h('div',{style:{marginBottom:14}},
          h('div',{style:{fontSize:10,color:'var(--muted)',fontFamily:'var(--fm)',letterSpacing:'.08em',textTransform:'uppercase',marginBottom:6}},'Recent Projects'),
          recentProjects.map(r=>h('div',{key:r.date,
            style:{display:'flex',alignItems:'center',gap:8,padding:'5px 8px',borderRadius:3,cursor:'pointer',transition:'background .12s'},
            onMouseEnter:e=>e.currentTarget.style.background='var(--s3)',
            onMouseLeave:e=>e.currentTarget.style.background='transparent',
            onClick:()=>setName(r.name)},
            h('span',{style:{fontSize:12,flex:1}},r.name),
            h('span',{style:{fontSize:9,color:'var(--muted)',fontFamily:'var(--fm)'}},new Date(r.date).toLocaleDateString())
          ))
        ),
        h('div',{style:{display:'flex',gap:6}},
          h('button',{className:'btn',style:{flex:1},onClick:()=>setShowSaveAs(false)},'Cancel'),
          h('button',{className:'btn pri',style:{flex:1},
            disabled:!name.trim(),
            onClick:()=>{if(name.trim()){saveProject(name.trim());setShowSaveAs(false);}}},
            '↓ Save')
        )
      )
    );
  }

  // Variations modal
  function VarsModal(){
    if(!showVars) return null;
    return h('div',{className:'modal-bg',onClick:()=>setShowVars(false)},
      h('div',{className:'modal',style:{width:460},onClick:e=>e.stopPropagation()},
        h('div',{className:'modal-title'},'Layout Variations'),
        h('p',{style:{fontSize:11,color:'var(--muted)',marginBottom:12}},'Click to apply to active collage layer.'),
        h('div',{style:{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6}},
          variations.map((v,i)=>h('div',{key:i,className:'var-thumb',onClick:()=>{
            if(activeLayer?.type==='collage'){updateLayer(activeLayer.id,{placed:v.frags});setLayoutMode(v.mode);}setShowVars(false);
          }},
            h('div',{style:{position:'relative',width:'100%',paddingBottom:'100%',background:bgColor}},
              v.frags.slice(0,7).map(f=>h('div',{key:f.id,style:{position:'absolute',left:`${(f.x/CW)*100}%`,top:`${(f.y/CH)*100}%`,width:`${(f.w/CW)*100}%`,height:`${(f.h/CH)*100}%`,transform:`rotate(${f.rotation||0}deg)`,overflow:'hidden'}},
                h('img',{src:f.thumb,style:{width:'100%',height:'100%',objectFit:'cover'}})
              )),
              h('div',{className:'var-lbl'},v.mode)
            )
          ))
        ),
        h('button',{className:'btn',style:{marginTop:12,width:'100%'},onClick:()=>setShowVars(false)},'Close')
      )
    );
  }


  const canUndo=hist.current.idx>0,canRedo=hist.current.idx<hist.current.stack.length-1;
  const selFragLayer=layers.find(l=>l.placed?.some(f=>f.id===selectedFragId));

  // Main render
  return h('div',{id:'app'},
    h('header',{className:'hdr'},
      h('div',{className:'logo'},'DASZFRAME'),
      h('div',{className:'logo-tag'},'PHOTO STUDIO'),

      h('div',{style:{display:'flex',gap:2,marginLeft:12,background:'var(--s2)',borderRadius:5,padding:2}},
        ['studio','spotlight'].map(t=>
          h('button',{key:t,
            style:{padding:'3px 14px',borderRadius:4,fontSize:11,fontFamily:'var(--fb)',fontWeight:600,
              letterSpacing:1.5,textTransform:'uppercase',cursor:'pointer',transition:'all .15s',
              background:appTab===t?'var(--acc)':'transparent',
              color:appTab===t?'#000':'var(--muted)',border:'none'},
            onClick:()=>setAppTab(t)},t)
        )
      ),

      // Editable project name in center
      h('div',{className:'hdr-center'},
        isEditingName
          ? h('input',{type:'text',value:projectName,autoFocus:true,
              style:{background:'var(--s2)',border:'1px solid var(--acc)',color:'var(--text)',
                fontFamily:'var(--fb)',fontSize:13,fontWeight:500,padding:'3px 8px',
                borderRadius:3,outline:'none',minWidth:200,textAlign:'center'},
              onChange:e=>setProjectName(e.target.value),
              onBlur:()=>setIsEditingName(false),
              onKeyDown:e=>{if(e.key==='Enter'||e.key==='Escape')setIsEditingName(false);}})
          : h('div',{
              style:{display:'flex',alignItems:'center',gap:6,cursor:'text',padding:'3px 8px',
                borderRadius:3,border:'1px solid transparent',transition:'border-color .15s'},
              onClick:()=>setIsEditingName(true),
              onMouseEnter:e=>e.currentTarget.style.borderColor='var(--b2)',
              onMouseLeave:e=>e.currentTarget.style.borderColor='transparent'},
              h('span',{style:{fontSize:13,fontWeight:500,color:'var(--text)'}},projectName),
              h('span',{style:{fontSize:10,color:'var(--muted)'}},lastSaved?`· saved ${lastSaved.toLocaleTimeString()}`:layers.length?'· unsaved':''),
              h('span',{style:{fontSize:10,color:'var(--muted)',marginLeft:2}},'✏')
            ),
        appTab==='studio'&&h('div',{className:'vsw',style:{marginLeft:8}},
          h('button',{className:`vbtn${viewMode==='split'?' on':''}`,onClick:()=>setViewMode('split')},'Split'),
          h('button',{className:`vbtn${viewMode==='canvas'?' on':''}`,onClick:()=>setViewMode('canvas')},'Canvas'),
                  )
      ),

      appTab==='studio'&&h('div',{className:'hdr-right'},
        // Save / Open
        h('button',{className:'btn xs ghost',title:'Open project (.daszframe)',
          onClick:()=>openProjRef.current?.click()},'↑ Open'),
        h('input',{ref:openProjRef,type:'file',accept:'.daszframe',style:{display:'none'},
          onChange:e=>{openProject(e.target.files[0]);e.target.value=''}}),
        h('button',{className:'btn xs ghost',title:'Save project',
          onClick:()=>setShowSaveAs(true)},
          layers.length?'↓ Save':'↓ Save'),
        h('div',{style:{width:1,height:14,background:'var(--b1)',margin:'0 2px'}}),
        // Undo/Redo
        h('button',{className:'btn xs ghost',disabled:!canUndo,title:'Undo (Ctrl+Z)',onClick:undo},'↩'),
        h('button',{className:'btn xs ghost',disabled:!canRedo,title:'Redo (Ctrl+Y)',onClick:redo},'↪'),
        h('div',{style:{width:1,height:14,background:'var(--b1)',margin:'0 2px'}}),
        h('button',{className:`btn xs ghost${snapGrid?' act':''}`,onClick:()=>setSnapGrid(v=>!v),title:'Snap to grid'},'⊞'),
        layers.length>0&&h(Fragment,null,
          h('button',{className:'btn xs ghost',onClick:genVariations},'Vars'),
          h('button',{className:'btn xs pri',onClick:()=>{setExportFilename(projectName);setShowExport(true);}},
            '↓ Export')
        )
      )
    ),

    restoreOffer&&h('div',{className:'restore-bar'},
      h('span',null,`Restore your last session${restoreOffer.name?` "${restoreOffer.name}"`:''}${restoreOffer.savedAt?` from ${new Date(restoreOffer.savedAt).toLocaleString()}`:''}?`),
      h('button',{className:'btn xs pri',onClick:restoreSession},'Restore'),
      h('button',{className:'btn xs ghost',onClick:dismissRestore},'Start fresh')
    ),

    appTab==='spotlight'&&h(SpotlightEditor),
    appTab==='studio'&&h('div',{className:'body'},
      viewMode!=='canvas'&&LeftPanel(),

      h('main',{className:'canvas-area'},
        h('div',{className:'toolbar'},
          h('span',{className:'tlabel'},activeLayer?`Active: ${activeLayer.name}`:'Canvas'),
          h('div',{className:'tsep'}),
          h('button',{className:`btn xs ghost${leftOpen?' act':''}`,title:'Toggle left panel',onClick:()=>setLeftOpen(o=>!o)},'◧'),
          h('button',{className:`btn xs ghost${rightOpen?' act':''}`,title:'Toggle right panel',onClick:()=>setRightOpen(o=>!o)},'◨'),
          h('div',{className:'tsep'}),
          selFrag&&selFragLayer&&h(Fragment,null,
            h('button',{className:'btn xs ghost',title:'Bring forward',onClick:()=>bringFwd(selFragLayer.id,selectedFragId)},'↑'),
            h('button',{className:'btn xs ghost',title:'Send back',onClick:()=>sendBck(selFragLayer.id,selectedFragId)},'↓'),
            h('button',{className:'btn xs ghost',title:'Duplicate',onClick:()=>dupFrag(selFragLayer.id,selFrag)},'⊕'),
            h('button',{className:'btn xs ghost red',title:'Delete (Del)',onClick:()=>deleteFrag(selFragLayer.id,selectedFragId)},'✕'),
            h('div',{className:'tsep'}),
            h('span',{className:'tlabel',style:{color:'var(--acc)'}},selFrag.label),
            h('div',{className:'tsep'}),
          ),
          h('div',{style:{flex:1}}),
          h('span',{className:'tlabel'},`${CW}×${CH} · ${Math.round(zoom*100)}% · ${layers.length} layers`)
        ),
        h('div',{className:'stage-wrap',ref:stageWrapRef},Stage()),
        h('div',{className:'sbar'},
          h('div',{className:`sdot${isProc?' pulse warn':''}`}),
          h('span',null,isProc?procMsg:`${layers.filter(l=>l.visible).length} visible · ${layers.filter(l=>l.type==='collage').length} collage`),
          activeLayer&&h(Fragment,null,h('span',null,'·'),h('span',{style:{color:'var(--acc)'}},activeLayer.name,` · ${activeLayer.grade?.look||'none'}`)),
          h('div',{style:{flex:1}}),
          canUndo&&h('span',null,`↩${hist.current.idx}`)
        )
      ),

      viewMode!=='canvas'&&RightPanel()
    ),
    appTab==='studio'&&h(Fragment,null,h(ExportModal),VarsModal(),h(SaveAsModal))
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(h(App));
