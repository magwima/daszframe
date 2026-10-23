/* DASZFRAME Photo Studio v3.0 — Full professional multi-layer photo editor
   Multiple photo layers · per-layer styles · cinematic grades · color grading
   LUT support · curves · film looks · effects · AI suggestions */
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

const AI_QUICK=[
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
const lerp=(a,b,t)=>a+(b-a)*t;

function extractFragment(imgEl,region,size=400){
  const c=document.createElement('canvas');c.width=size;c.height=size;
  c.getContext('2d').drawImage(imgEl,region.x*imgEl.naturalWidth,region.y*imgEl.naturalHeight,
    region.w*imgEl.naturalWidth,region.h*imgEl.naturalHeight,0,0,size,size);
  return c.toDataURL('image/jpeg',.92);
}
const extractThumb=(imgEl,region)=>extractFragment(imgEl,region,80);

// ── Film look → CSS filter string ────────────────────────────────────────────
function lookToFilter(look){
  switch(look){
    case 'cinematic':  return 'contrast(1.18) saturate(.72) brightness(.95)';
    case 'vintage':    return 'sepia(.45) brightness(1.08) contrast(.92) saturate(.85)';
    case 'bw':         return 'grayscale(1) contrast(1.15)';
    case 'noir':       return 'grayscale(1) contrast(1.45) brightness(.82)';
    case 'bleach':     return 'contrast(1.35) saturate(.38) brightness(1.05)';
    case 'teal':       return 'contrast(1.12) saturate(1.2) hue-rotate(8deg) brightness(.97)';
    case 'editorial':  return 'contrast(1.06) brightness(1.04) saturate(.88)';
    case 'kodak':      return 'sepia(.22) contrast(1.08) saturate(1.12) brightness(1.02)';
    case 'fuji':       return 'contrast(1.05) saturate(.95) brightness(1.02) hue-rotate(-5deg)';
    case 'documentary':return 'contrast(1.04) saturate(.82) brightness(.98)';
    case 'halftone':   return 'contrast(2.2) grayscale(1)';
    default: return 'none';
  }
}

// ── Grade → CSS filter (real-time preview via CSS) ────────────────────────────
function gradeToFilter(g){
  if(!g) return 'none';
  const br=clamp(1+(g.exposure||0)/100,.1,3);
  const ct=clamp(1+(g.contrast||0)/100,.1,3);
  const sat=clamp(1+(g.saturation||0)/100,0,3);
  const lkF=g.look&&g.look!=='none'?lookToFilter(g.look):'';
  let f=`brightness(${br}) contrast(${ct}) saturate(${sat})`;
  if(g.temperature>0) f+=` sepia(${g.temperature*.003})`;
  if(g.temperature<0) f+=` hue-rotate(${g.temperature*.1}deg)`;
  if(g.blur>0) f+=` blur(${g.blur*.04}px)`;
  return f.trim();
}

// ── Apply pixel-level grade to canvas (for export) ───────────────────────────
function applyGradePixels(ctx,W,H,g){
  if(!g||!W||!H) return;
  const id=ctx.getImageData(0,0,W,H);
  const d=id.data;
  const exp=Math.pow(2,(g.exposure||0)/100);
  const gamma=g.gamma||1;
  const lift=(g.lift||0)/255;
  const gain=g.gain||1;
  const sat=(g.saturation||0)/100;
  const temp=(g.temperature||0)/100;
  const tint=(g.tint||0)/100;
  const hi=(g.highlights||0)/100;
  const sh=(g.shadows||0)/100;
  // Build lookup tables for performance
  const lut=new Uint8Array(256);
  for(let i=0;i<256;i++){
    let v=i/255;
    v=Math.pow(v,1/gamma);
    v=v*gain+lift;
    v=v*exp;
    // Highlights/shadows
    if(v>.5) v=v+hi*(1-v)*2;
    else v=v+sh*v*2;
    lut[i]=clamp(Math.round(v*255),0,255);
  }
  for(let i=0;i<d.length;i+=4){
    let r=lut[d[i]],gv=lut[d[i+1]],b=lut[d[i+2]];
    // Saturation
    if(sat!==0){const lm=.299*r+.587*gv+.114*b;r=clamp(lm+(r-lm)*(1+sat),0,255);gv=clamp(lm+(gv-lm)*(1+sat),0,255);b=clamp(lm+(b-lm)*(1+sat),0,255);}
    // Temperature (warm/cool)
    if(temp>0){r=clamp(r+temp*30,0,255);b=clamp(b-temp*20,0,255);}
    else if(temp<0){b=clamp(b-temp*30,0,255);r=clamp(r+temp*20,0,255);}
    // Tint
    if(tint>0) gv=clamp(gv-tint*20,0,255);
    else if(tint<0) gv=clamp(gv-tint*20,0,255);
    d[i]=r;d[i+1]=gv;d[i+2]=b;
  }
  ctx.putImageData(id,0,0);
}

// ── Vignette overlay ─────────────────────────────────────────────────────────
function drawVignette(ctx,W,H,strength){
  if(!strength) return;
  const grad=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*.3,W/2,H/2,Math.max(W,H)*.75);
  grad.addColorStop(0,'rgba(0,0,0,0)');
  grad.addColorStop(1,`rgba(0,0,0,${strength/100})`);
  ctx.save();ctx.globalCompositeOperation='multiply';
  ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);ctx.restore();
}

// ── Film grain overlay ────────────────────────────────────────────────────────
function drawGrain(ctx,W,H,amount){
  if(!amount) return;
  const id=ctx.getImageData(0,0,W,H);const d=id.data;
  const a=amount/100;
  for(let i=0;i<d.length;i+=4){const n=(Math.random()-.5)*a*80;d[i]=clamp(d[i]+n,0,255);d[i+1]=clamp(d[i+1]+n,0,255);d[i+2]=clamp(d[i+2]+n,0,255);}
  ctx.putImageData(id,0,0);
}

// ── Chromatic aberration ──────────────────────────────────────────────────────
function drawChromAb(ctx,W,H,amount){
  if(!amount||amount<1) return;
  const off=Math.round(amount*.5);
  const id=ctx.getImageData(0,0,W,H);
  const out=new ImageData(W,H);
  const s=id.data,t=out.data;
  for(let y=0;y<H;y++){for(let x=0;x<W;x++){
    const i=(y*W+x)*4;
    const ri=Math.min((y*W+Math.min(x+off,W-1))*4,s.length-4);
    const bi=Math.min((y*W+Math.max(x-off,0))*4,s.length-4);
    t[i]=s[ri];t[i+1]=s[i+1];t[i+2]=s[bi+2];t[i+3]=s[i+3];
  }}
  ctx.putImageData(out,0,0);
}

// ── Glow effect ───────────────────────────────────────────────────────────────
function drawGlow(ctx,W,H,amount){
  if(!amount) return;
  ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=amount/200;
  ctx.filter=`blur(${amount*.3}px)`;ctx.drawImage(ctx.canvas,0,0,W,H);
  ctx.filter='none';ctx.restore();
}

// ── LUT parser (.cube) ────────────────────────────────────────────────────────
function parseCube(text){
  const lines=text.split('\n').filter(l=>l.trim()&&!l.startsWith('#'));
  let size=17;const data=[];
  for(const line of lines){
    if(line.startsWith('LUT_3D_SIZE')){size=parseInt(line.split(' ')[1]);continue;}
    const vals=line.trim().split(/\s+/).map(Number);
    if(vals.length===3&&!isNaN(vals[0])) data.push(vals);
  }
  return{size,data};
}
function applyLUT(ctx,W,H,lut){
  if(!lut||!lut.data||!lut.data.length) return;
  const id=ctx.getImageData(0,0,W,H);const d=id.data;
  const s=lut.size;
  for(let i=0;i<d.length;i+=4){
    const r=d[i]/255*(s-1),g=d[i+1]/255*(s-1),b=d[i+2]/255*(s-1);
    const ri=Math.floor(r),gi=Math.floor(g),bi=Math.floor(b);
    const rf=r-ri,gf=g-gi,bf=b-bi;
    const idx=(bi*s*s+gi*s+ri);
    if(idx<lut.data.length){
      const [nr,ng,nb]=lut.data[Math.min(idx,lut.data.length-1)];
      d[i]=clamp(Math.round(nr*255),0,255);
      d[i+1]=clamp(Math.round(ng*255),0,255);
      d[i+2]=clamp(Math.round(nb*255),0,255);
    }
  }
  ctx.putImageData(id,0,0);
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
  if(mode==='mosaic'){
    const cols=Math.ceil(Math.sqrt(n)),rows=Math.ceil(n/cols);const cW=cw/cols,cH=ch/rows;
    fragments.forEach((f,i)=>{const sc=.82+Math.random()*.22,w=cW*sc,hh=cH*sc,col=i%cols,row=Math.floor(i/cols);
      placed.push({...f,id:uid(),x:col*cW+(cW-w)/2,y:row*cH+(cH-hh)/2,w,h:hh,rotation:(Math.random()-.5)*10,zIndex:i});});
  } else if(mode==='editorial'){
    const cx=cw/2,cy=ch/2;
    fragments.forEach((f,i)=>{const a=(i/n)*Math.PI*2-Math.PI/2,r=Math.min(cw,ch)*.28,sz=75+Math.random()*110;
      placed.push({...f,id:uid(),x:cx+Math.cos(a)*r-sz/2,y:cy+Math.sin(a)*r-sz/2,w:sz,h:sz,rotation:(Math.random()-.5)*22,zIndex:i});});
  } else if(mode==='cubist'){
    fragments.forEach((f,i)=>{const sz=65+Math.random()*160;
      placed.push({...f,id:uid(),x:Math.random()*(cw-sz),y:Math.random()*(ch-sz),w:sz,h:sz,rotation:(Math.random()-.5)*50,zIndex:i});});
  } else if(mode==='symmetry'){
    const half=Math.ceil(n/2);
    fragments.slice(0,half).forEach((f,i)=>{const yp=(i/half)*ch*.85+ch*.05,sz=72+Math.random()*80;
      placed.push({...f,id:uid(),x:cw*.06,y:yp,w:sz,h:sz,rotation:0,zIndex:i});
      placed.push({...fragments[i%n],id:uid(),x:cw*.94-sz,y:yp,w:sz,h:sz,rotation:0,flipped:true,zIndex:i+half});});
  } else if(mode==='gallery'){
    const ms=Math.min(cw,ch)*.52;
    placed.push({...fragments[0],id:uid(),x:cw/2-ms/2,y:ch/2-ms/2,w:ms,h:ms,rotation:0,zIndex:10});
    const pos=[[.04,.04],[.72,.04],[.04,.72],[.72,.72],[.38,.02],[.38,.86],[.02,.38],[.86,.38],[.20,.02],[.58,.02]];
    fragments.slice(1).forEach((f,i)=>{const sz=50+Math.random()*60,[px,py]=pos[i%pos.length];
      placed.push({...f,id:uid(),x:px*cw,y:py*ch,w:sz,h:sz,rotation:(Math.random()-.5)*18,zIndex:i});});
  } else {
    fragments.forEach((f,i)=>{const sz=45+Math.random()*210;
      placed.push({...f,id:uid(),x:Math.random()*(cw-sz),y:Math.random()*(ch-sz),w:sz,h:sz,rotation:(Math.random()-.5)*65,zIndex:i});});
  }
  return placed;
}

// ══════════════════════════════════════════════════════════════════════════════
// APP
// ══════════════════════════════════════════════════════════════════════════════
function App(){
  // ── Photo layers (multi-photo) ────────────────────────────────────────────
  // Each layer: {id, name, type:'photo'|'collage'|'solid', srcUrl, imgEl,
  //              fragments:[], placed:[], grade:{...}, x,y,w,h,
  //              blendMode, opacity, visible, locked}
  const [layers,setLayers]=useState([]);
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
  const openProjRef=useRef(null);

  // ── UI ─────────────────────────────────────────────────────────────────────
  const [leftOpen,setLeftOpen]=useState(true);
  const [rightOpen,setRightOpen]=useState(true);
  const [viewMode,setViewMode]=useState('split');
  const [rtab,setRtab]=useState('layers');
  const [ltab,setLtab]=useState('tools');
  const [isProc,setIsProc]=useState(false);
  const [procMsg,setProcMsg]=useState('');
  const [aiNote,setAiNote]=useState('');
  const [showExport,setShowExport]=useState(false);
  const [showVars,setShowVars]=useState(false);
  const [variations,setVariations]=useState([]);
  const [snapGrid,setSnapGrid]=useState(false);
  const GRID=20;

  // ── Undo/Redo ──────────────────────────────────────────────────────────────
  const [history,setHistory]=useState([]);
  const [histIdx,setHistIdx]=useState(-1);
  const skipHist=useRef(false);
  const pushHist=useCallback((newLayers)=>{
    if(skipHist.current) return;
    setHistory(prev=>[...prev.slice(0,histIdx+1),JSON.parse(JSON.stringify(newLayers))].slice(-25));
    setHistIdx(p=>Math.min(p+1,24));
  },[histIdx]);

  // Drag state
  const [dragState,setDragState]=useState(null);
  const overlayRef=useRef(null);
  const layersRef=useRef(layers);
  useEffect(()=>{layersRef.current=layers;},[layers]);
  const fileInputRef=useRef(null);
  const lutInputRef=useRef(null);

  const cs=CANVAS_SIZES.find(s=>s.id===canvasSizeId)||CANVAS_SIZES[1];
  const CW=cs.w,CH=cs.h;

  // Active layer helper
  const activeLayer=useMemo(()=>layers.find(l=>l.id===activeLayerId),[layers,activeLayerId]);
  const activeGrade=activeLayer?.grade||defaultGrade();

  // ── Update layer ───────────────────────────────────────────────────────────
  const updateLayer=useCallback((id,upd)=>{
    setLayers(prev=>{
      const next=prev.map(l=>l.id===id?{...l,...upd}:l);
      pushHist(next);return next;
    });
  },[pushHist]);

  const updateGrade=useCallback((id,gradeUpd)=>{
    setLayers(prev=>{
      const next=prev.map(l=>l.id===id?{...l,grade:{...(l.grade||defaultGrade()),...gradeUpd}}:l);
      return next; // Don't push history on every slider move
    });
  },[]);

  const commitGrade=useCallback(()=>{pushHist(layersRef.current);},[pushHist]);

  // ── Add photo layer ────────────────────────────────────────────────────────
  const addPhotoLayer=useCallback(async(file,asCollage=false)=>{
    if(!file||!file.type.startsWith('image/')) return;
    setIsProc(true);setProcMsg('Loading image…');
    const url=URL.createObjectURL(file);
    const img=new Image();
    await new Promise(res=>{img.onload=res;img.src=url;});
    const name=file.name.replace(/\.[^.]+$/,'').slice(0,24);

    let frags=[],placed=[];
    if(asCollage){
      setProcMsg('Extracting face regions…');
      await tick();
      frags=FACE_REGIONS.map(r=>({
        id:uid(),label:r.label,
        thumb:extractThumb(img,r.area),
        dataUrl:extractFragment(img,r.area,400),
        visible:true,locked:false,opacity:1,style:'original',flipped:false,
      }));
      placed=composeLayout(frags,layoutMode,CW,CH);
    }

    const newLayer={
      id:uid(),name,type:asCollage?'collage':'photo',
      srcUrl:url,imgEl:img,
      fragments:frags,placed,
      x:0,y:0,w:CW,h:CH,
      grade:defaultGrade(),
      visible:true,locked:false,
    };
    setLayers(prev=>{const next=[...prev,newLayer];pushHist(next);return next;});
    setActiveLayerId(newLayer.id);
    setIsProc(false);

    // Get AI note for new layer
    try{
      const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:120,
          messages:[{role:'user',content:`Photo editor. New ${asCollage?'collage':'photo'} layer: "${name}". Suggest a film look and one-sentence creative direction.`}]})});
      const d=await res.json();if(d.content?.[0]?.text) setAiNote(d.content[0].text);
    }catch(_){}
  },[layoutMode,CW,CH,pushHist]);

  // ── Recompose active collage layer ────────────────────────────────────────
  const recompose=useCallback(()=>{
    if(!activeLayer||activeLayer.type!=='collage'||!activeLayer.fragments.length) return;
    const newPlaced=composeLayout(activeLayer.fragments,layoutMode,CW,CH);
    updateLayer(activeLayer.id,{placed:newPlaced});
  },[activeLayer,layoutMode,CW,CH,updateLayer]);

  // ── Apply AI quick style to active layer ──────────────────────────────────
  const applyQuick=useCallback(async(q)=>{
    if(!activeLayer) return;
    updateGrade(activeLayer.id,{look:q.look});
    if(activeLayer.type==='collage'){
      setLayoutMode(q.layout);
      const newPlaced=composeLayout(activeLayer.fragments,q.layout,CW,CH);
      updateLayer(activeLayer.id,{placed:newPlaced});
    }
    setAiNote(`${q.label} style applied — ${FILM_LOOKS.find(l=>l.id===q.look)?.sub||''}`);
  },[activeLayer,CW,CH,updateLayer,updateGrade]);

  // ── Fragment drag (within collage layer) ──────────────────────────────────
  const onFragMouseDown=useCallback((e,fragId,layerId)=>{
    e.stopPropagation();
    setSelectedFragId(fragId);
    setActiveLayerId(layerId);
    const layer=layersRef.current.find(l=>l.id===layerId);
    const frag=layer?.placed.find(f=>f.id===fragId);
    if(!frag||frag.locked) return;
    const rect=overlayRef.current.getBoundingClientRect();
    setDragState({fragId,layerId,ox:e.clientX-rect.left-frag.x,oy:e.clientY-rect.top-frag.y});
  },[]);

  const onMouseMove=useCallback((e)=>{
    if(!dragState) return;
    const rect=overlayRef.current.getBoundingClientRect();
    let x=e.clientX-rect.left-dragState.ox;
    let y=e.clientY-rect.top-dragState.oy;
    if(snapGrid){x=Math.round(x/GRID)*GRID;y=Math.round(y/GRID)*GRID;}
    setLayers(prev=>prev.map(l=>l.id===dragState.layerId
      ?{...l,placed:l.placed.map(f=>f.id===dragState.fragId?{...f,x,y}:f)}:l));
  },[dragState,snapGrid]);

  const onMouseUp=useCallback(()=>{if(dragState)pushHist(layersRef.current);setDragState(null);},[dragState,pushHist]);

  // Keyboard
  useEffect(()=>{
    const h=(e)=>{
      if((e.ctrlKey||e.metaKey)&&e.key==='z'&&!e.shiftKey){
        e.preventDefault();
        if(histIdx>0){skipHist.current=true;setLayers(history[histIdx-1].map(l=>({...l})));setHistIdx(p=>p-1);setTimeout(()=>{skipHist.current=false;},0);}
      }
      if((e.ctrlKey||e.metaKey)&&(e.key==='y'||(e.key==='z'&&e.shiftKey))){
        e.preventDefault();
        if(histIdx<history.length-1){skipHist.current=true;setLayers(history[histIdx+1].map(l=>({...l})));setHistIdx(p=>p+1);setTimeout(()=>{skipHist.current=false;},0);}
      }
      if(e.key==='Escape'){setSelectedFragId(null);}
    };
    window.addEventListener('keydown',h);return()=>window.removeEventListener('keydown',h);
  },[history,histIdx]);

  // ── Fragment ops ───────────────────────────────────────────────────────────
  const updateFrag=useCallback((layerId,fragId,upd)=>{
    setLayers(prev=>prev.map(l=>l.id===layerId?{...l,placed:l.placed.map(f=>f.id===fragId?{...f,...upd}:f)}:l));
  },[]);
  const deleteFrag=useCallback((layerId,fragId)=>{
    setLayers(prev=>prev.map(l=>l.id===layerId?{...l,placed:l.placed.filter(f=>f.id!==fragId)}:l));
    setSelectedFragId(null);
  },[]);
  const dupFrag=useCallback((layerId,frag)=>{
    setLayers(prev=>prev.map(l=>l.id===layerId?{...l,placed:[...l.placed,{...frag,id:uid(),x:frag.x+20,y:frag.y+20,zIndex:(frag.zIndex||0)+1}]}:l));
  },[]);
  const bringFwd=useCallback((layerId,fragId)=>{
    setLayers(prev=>prev.map(l=>{if(l.id!==layerId)return l;const mx=Math.max(...l.placed.map(f=>f.zIndex||0));return{...l,placed:l.placed.map(f=>f.id===fragId?{...f,zIndex:mx+1}:f)};}));
  },[]);
  const sendBck=useCallback((layerId,fragId)=>{
    setLayers(prev=>prev.map(l=>{if(l.id!==layerId)return l;const mn=Math.min(...l.placed.map(f=>f.zIndex||0));return{...l,placed:l.placed.map(f=>f.id===fragId?{...f,zIndex:mn-1}:f)};}));
  },[]);

  const deleteLayer=useCallback((id)=>{setLayers(prev=>{const next=prev.filter(l=>l.id!==id);if(activeLayerId===id)setActiveLayerId(next[next.length-1]?.id||null);return next;});},[activeLayerId]);
  const dupeLayer=useCallback((id)=>{const l=layersRef.current.find(x=>x.id===id);if(!l)return;const nl={...JSON.parse(JSON.stringify({...l,imgEl:undefined})),id:uid(),name:l.name+' copy',imgEl:l.imgEl};setLayers(prev=>[...prev,nl]);setActiveLayerId(nl.id);},[]);
  const moveLayerUp=useCallback((id)=>{setLayers(prev=>{const i=prev.findIndex(l=>l.id===id);if(i<=0)return prev;const n=[...prev];[n[i-1],n[i]]=[n[i],n[i-1]];return n;});},[]);
  const moveLayerDown=useCallback((id)=>{setLayers(prev=>{const i=prev.findIndex(l=>l.id===id);if(i>=prev.length-1)return prev;const n=[...prev];[n[i],n[i+1]]=[n[i+1],n[i]];return n;});},[]);

  // ── LUT import ────────────────────────────────────────────────────────────
  const importLUT=useCallback((file)=>{
    if(!file||!activeLayer) return;
    const reader=new FileReader();
    reader.onload=e=>{
      const lut=parseCube(e.target.result);
      updateGrade(activeLayer.id,{lutName:file.name,lutData:lut});
    };
    reader.readAsText(file);
  },[activeLayer,updateGrade]);

  // ── Save Project (.daszframe) ─────────────────────────────────────────────
  const saveProject=useCallback((name)=>{
    const pName=name||projectName||'Untitled Project';
    setProjectName(pName);
    // Serialize layers — imgEl can't be JSON'd, store srcUrl for reload
    const serializableLayers=layers.map(l=>({
      ...l,
      imgEl:undefined, // exclude DOM element
      // keep srcUrl (blob URL) — won't survive page close but survives session
    }));
    const session={
      version:'3.0',
      name:pName,
      savedAt:new Date().toISOString(),
      canvasSizeId,bgColor,layoutMode,aiNote,
      layers:serializableLayers,
      activeLayerId,
    };
    const blob=new Blob([JSON.stringify(session)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=`${pName.replace(/[^a-zA-Z0-9_\- ]/g,'').trim()||'project'}.daszframe`;
    a.click();
    setLastSaved(new Date());
    // Track in recents
    const recents=[{name:pName,date:new Date().toISOString()},...recentProjects.filter(r=>r.name!==pName)].slice(0,5);
    setRecentProjects(recents);
    try{localStorage.setItem('daszframe_recent',JSON.stringify(recents));}catch(_){}
  },[layers,projectName,canvasSizeId,bgColor,layoutMode,aiNote,activeLayerId,recentProjects]);

  // ── Open Project (.daszframe) ─────────────────────────────────────────────
  const openProject=useCallback((file)=>{
    if(!file) return;
    const reader=new FileReader();
    reader.onload=async e=>{
      try{
        const session=JSON.parse(e.target.result);
        setProjectName(session.name||'Untitled Project');
        if(session.canvasSizeId) setCanvasSizeId(session.canvasSizeId);
        if(session.bgColor)      setBgColor(session.bgColor);
        if(session.layoutMode)   setLayoutMode(session.layoutMode);
        if(session.aiNote)       setAiNote(session.aiNote);

        // Reload images from their blob/object URLs
        const restoredLayers=await Promise.all((session.layers||[]).map(async l=>{
          if((l.type==='photo'||l.type==='collage')&&l.srcUrl){
            try{
              const img=new Image();
              await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=l.srcUrl;});
              return{...l,imgEl:img};
            }catch(_){return{...l,imgEl:null};}
          }
          return l;
        }));
        setLayers(restoredLayers);
        setActiveLayerId(session.activeLayerId||restoredLayers[restoredLayers.length-1]?.id||null);
        setLastSaved(new Date(session.savedAt));
      }catch(_){alert('Could not open file — it may be corrupted or from an older version.');}
    };
    reader.readAsText(file);
  },[]);

  // ── Auto-save to localStorage every 30s ──────────────────────────────────
  useEffect(()=>{
    if(!layers.length) return;
    const t=setTimeout(()=>{
      try{
        const lite={name:projectName,canvasSizeId,bgColor,layoutMode,
          layers:layers.map(l=>({...l,imgEl:undefined,
            // Only save fragment thumbnails (small), not full dataUrls (too large for localStorage)
            placed:l.placed?.map(f=>({...f,dataUrl:undefined})),
          }))
        };
        localStorage.setItem('daszframe_autosave',JSON.stringify(lite));
        localStorage.setItem('daszframe_autosave_time',new Date().toISOString());
      }catch(_){} // quota exceeded is fine
    },30000);
    return()=>clearTimeout(t);
  },[layers,projectName,canvasSizeId,bgColor,layoutMode]);

  // ── Export ────────────────────────────────────────────────────────────────
  const doExport=useCallback((fmt,scale,customName)=>{
    const c=document.createElement('canvas');c.width=CW*scale;c.height=CH*scale;
    const ctx=c.getContext('2d');ctx.scale(scale,scale);
    ctx.fillStyle=bgColor;ctx.fillRect(0,0,CW,CH);
    const baseName=(customName||projectName||'daszframe').replace(/[^a-zA-Z0-9_\- ]/g,'').trim()||'daszframe';

    const visLayers=[...layers].filter(l=>l.visible!==false);
    const drawLayer=async(idx)=>{
      if(idx>=visLayers.length){
        const a=document.createElement('a');
        a.href=c.toDataURL(fmt==='jpg'?'image/jpeg':'image/png',.96);
        a.download=`${baseName}.${fmt}`;a.click();
        return;
      }
      const l=visLayers[idx];
      const g=l.grade||defaultGrade();
      ctx.save();
      ctx.globalAlpha=(g.opacity??100)/100;
      ctx.globalCompositeOperation=g.blendMode||'normal';

      if(l.type==='photo'&&l.imgEl){
        // Draw full photo with grade
        const offC=document.createElement('canvas');offC.width=CW;offC.height=CH;
        const offCtx=offC.getContext('2d');
        offCtx.drawImage(l.imgEl,0,0,CW,CH);
        applyGradePixels(offCtx,CW,CH,g);
        if(g.lutData) applyLUT(offCtx,CW,CH,g.lutData);
        drawVignette(offCtx,CW,CH,g.vignette||0);
        drawGrain(offCtx,CW,CH,g.grain||0);
        drawChromAb(offCtx,CW,CH,g.chromAb||0);
        if(g.glow>0) drawGlow(offCtx,CW,CH,g.glow);
        ctx.drawImage(offC,0,0,CW,CH);
      } else if(l.type==='collage'){
        const sorted=[...l.placed].filter(f=>f.visible!==false).sort((a,b)=>(a.zIndex||0)-(b.zIndex||0));
        for(const f of sorted){
          await new Promise(res=>{
            const img=new Image();
            img.onload=()=>{
              ctx.save();ctx.globalAlpha=f.opacity??1;
              const cx=f.x+f.w/2,cy=f.y+f.h/2;
              ctx.translate(cx,cy);ctx.rotate((f.rotation||0)*Math.PI/180);
              if(f.flipped)ctx.scale(-1,1);
              if(f.borderRadius>0){ctx.beginPath();ctx.roundRect(-f.w/2,-f.h/2,f.w,f.h,f.borderRadius);ctx.clip();}
              ctx.drawImage(img,-f.w/2,-f.h/2,f.w,f.h);
              ctx.restore();res();
            };img.src=f.dataUrl;
          });
        }
      }
      ctx.restore();
      drawLayer(idx+1);
    };
    drawLayer(0);
  },[layers,bgColor,CW,CH]);

  // ── Save grade as JSON ─────────────────────────────────────────────────────
  const saveGrade=useCallback(()=>{
    if(!activeLayer) return;
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([JSON.stringify(activeLayer.grade,null,2)],{type:'application/json'}));
    a.download=`${activeLayer.name}-grade.json`;a.click();
  },[activeLayer]);

  const loadGrade=useCallback((file)=>{
    if(!file||!activeLayer) return;
    const reader=new FileReader();
    reader.onload=e=>{try{updateGrade(activeLayer.id,JSON.parse(e.target.result));}catch(_){}};
    reader.readAsText(file);
  },[activeLayer,updateGrade]);

  // ── Variations ────────────────────────────────────────────────────────────
  const genVariations=useCallback(()=>{
    if(!activeLayer||activeLayer.type!=='collage'||!activeLayer.fragments.length) return;
    const modes=['dasz','mosaic','editorial','cubist','symmetry','gallery','experimental'];
    setVariations(modes.map(m=>({mode:m,frags:composeLayout(activeLayer.fragments,m,CW,CH)})));
    setShowVars(true);
  },[activeLayer,CW,CH]);

  // Currently selected fragment (in active layer)
  const selFrag=activeLayer?.placed.find(f=>f.id===selectedFragId);

  // ── RENDER ────────────────────────────────────────────────────────────────

  // Slider component
  const Slider=({label,val,min,max,step=1,onChange,onCommit})=>
    h('div',{className:'srow'},
      h('span',{className:'srow-label'},label),
      h('input',{type:'range',min,max,step,value:val,
        onChange:e=>onChange(+e.target.value),
        onMouseUp:onCommit,onTouchEnd:onCommit}),
      h('span',{className:'srow-val'},val>0?`+${val}`:val)
    );

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
              h('button',{className:'btn sm',onClick:()=>{
                const l={id:uid(),name:'Solid Color',type:'solid',srcUrl:null,imgEl:null,
                  fragments:[],placed:[],grade:{...defaultGrade(),blendMode:'normal',opacity:100},
                  visible:true,locked:false,x:0,y:0,w:CW,h:CH};
                setLayers(prev=>[...prev,l]);setActiveLayerId(l.id);
              }},'+ Solid'),
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
          h('div',{className:'slabel'},'AI Quick Styles'),
          h('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:3}},
            AI_QUICK.map(q=>h('button',{key:q.id,className:'btn sm',
              style:{justifyContent:'flex-start',fontSize:10,gap:4},
              onClick:()=>applyQuick(q)},
              h('span',null,q.icon),q.label))
          )
        ),

        // Layout (for collage layers)
        activeLayer?.type==='collage'&&h('div',{className:'sec'},
          h('div',{className:'slabel'},'Collage Layout'),
          h('div',{className:`dchip${layoutMode==='dasz'?' on':''}`,
            onClick:()=>{setLayoutMode('dasz');setTimeout(recompose,0);}},
            h('span',{style:{fontSize:13}},'◉'),h('span',null,'DASZ'),h('span',{className:'dchip-sub'},'Signature')
          ),
          h('div',{className:'cgrid3',style:{marginTop:3}},
            LAYOUT_MODES.filter(m=>!m.sig).map(m=>h('div',{key:m.id,
              className:`chip${layoutMode===m.id?' on':''}`,
              onClick:()=>{setLayoutMode(m.id);setTimeout(recompose,0);}},
              m.icon,' ',m.label))
          ),
          h('button',{className:'btn sm full',style:{marginTop:4},onClick:recompose},'↻ Recompose')
        ),

        // AI note
        aiNote&&h('div',{className:'sec'},h('div',{className:'ai-card'},h('div',{className:'ai-badge'},'AI'),h('div',{className:'ai-text'},aiNote))),

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
        ),

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

  // Canvas stage
  function Stage(){
    const visLayers=[...layers].filter(l=>l.visible!==false);
    return h('div',{
      className:'stage',
      ref:overlayRef,
      style:{width:CW,height:CH,background:bgColor,position:'relative',overflow:'hidden'},
      onMouseMove,onMouseUp,onMouseLeave:onMouseUp,
      onClick:e=>{if(e.target===overlayRef.current){setSelectedFragId(null);}},
    },
      // Render each visible layer
      visLayers.map((l)=>{
        const g=l.grade||defaultGrade();
        const layerFilter=gradeToFilter(g);
        const lookFilter=g.look&&g.look!=='none'?lookToFilter(g.look):'none';
        const combinedFilter=[layerFilter,lookFilter!=='none'?lookFilter:''].filter(Boolean).join(' ')||'none';
        const isActive=l.id===activeLayerId;

        if(l.type==='photo'&&l.imgEl){
          return h('div',{key:l.id,
            style:{
              position:'absolute',left:l.x||0,top:l.y||0,
              width:l.w||CW,height:l.h||CH,
              transform:l.rotation?`rotate(${l.rotation}deg)`:'none',
              filter:combinedFilter,
              opacity:(g.opacity??100)/100,
              mixBlendMode:g.blendMode||'normal',
              outline:isActive?'1.5px solid rgba(232,213,163,0.4)':undefined,
              cursor:'default',
              zIndex:layers.indexOf(l),
            },
            onClick:()=>setActiveLayerId(l.id)},
            h('img',{src:l.srcUrl,style:{width:'100%',height:'100%',objectFit:'cover',display:'block',pointerEvents:'none'}})
          );
        } else if(l.type==='collage'){
          const sorted=[...l.placed].filter(f=>f.visible!==false).sort((a,b)=>(a.zIndex||0)-(b.zIndex||0));
          return h('div',{key:l.id,
            style:{position:'absolute',inset:0,
              filter:combinedFilter,opacity:(g.opacity??100)/100,
              mixBlendMode:g.blendMode||'normal',
              outline:isActive?'1.5px solid rgba(232,213,163,0.25)':undefined,
              zIndex:layers.indexOf(l),
            },
            onClick:()=>setActiveLayerId(l.id)},
            sorted.map(f=>h('div',{key:f.id,
              className:`frag-item${selectedFragId===f.id?' sel':''}`,
              style:{
                position:'absolute',left:f.x,top:f.y,width:f.w,height:f.h,
                transform:`rotate(${f.rotation||0}deg)${f.flipped?' scaleX(-1)':''}`,
                transformOrigin:'center center',opacity:f.opacity??1,
                zIndex:f.zIndex||0,
                borderRadius:f.borderRadius>0?`${f.borderRadius}px`:undefined,
                overflow:f.borderRadius>0?'hidden':undefined,
                boxShadow:f.borderStyle==='shadow'?'4px 6px 16px rgba(0,0,0,.4)':f.borderStyle==='glow'?'0 0 18px rgba(232,213,163,.5)':undefined,
              },
              onMouseDown:e=>onFragMouseDown(e,f.id,l.id)},
              h('img',{src:f.dataUrl,draggable:false})
            ))
          );
        } else if(l.type==='solid'){
          return h('div',{key:l.id,style:{position:'absolute',left:l.x||0,top:l.y||0,width:l.w||CW,height:l.h||CH,background:g.solidColor||'#444',opacity:(g.opacity??100)/100,mixBlendMode:g.blendMode||'normal',zIndex:layers.indexOf(l),cursor:'default',outline:isActive?'1.5px solid rgba(232,213,163,0.4)':undefined},onClick:()=>setActiveLayerId(l.id)});
        }
        return null;
      }),

      isProc&&h('div',{className:'lo'},h('div',{className:'lo-msg'},procMsg),h('div',{className:'lo-bar'},h('div',{className:'lo-fill'}))),

      layers.length===0&&!isProc&&h('div',{className:'empty'},
        h('div',{className:'empty-logo'},'DASZFRAME'),
        h('div',{className:'empty-sub'},'Add a photo layer to begin.\nStack multiple photos · grade each independently\nApply film looks · collage layouts · export.'),
        h('button',{className:'btn pri',style:{marginTop:14},onClick:()=>fileInputRef.current?.click()},'Add First Photo →')
      )
    );
  }

  // Export modal with filename input
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
                onKeyDown:e=>{if(e.key==='Enter'){doExport('png',1,fname);setShowExport(false);}},
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
          [['png',1,`PNG — Standard (${CW}×${CH})`,'↓'],
           ['png',2,`PNG — HD (${CW*2}×${CH*2})`,'↓'],
           ['png',4,`PNG — 4K (${CW*4}×${CH*4})`,'↓'],
           ['jpg',1,'JPG — Standard','↓'],
           ['jpg',2,'JPG — HD','↓'],
          ].map(([fmt,sc,label,icon])=>
            h('button',{key:`${fmt}${sc}`,className:'btn',
              style:{justifyContent:'space-between'},
              onClick:()=>{doExport(fmt,sc,fname||projectName);setShowExport(false);}},
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

  const canUndo=histIdx>0,canRedo=histIdx<history.length-1;
  const selFragLayer=layers.find(l=>l.placed?.some(f=>f.id===selectedFragId));

  // Main render
  return h('div',{id:'app'},
    h('header',{className:'hdr'},
      h('div',{className:'logo'},'DASZFRAME'),
      h('div',{className:'logo-tag'},'PHOTO STUDIO'),

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
        h('div',{className:'vsw',style:{marginLeft:8}},
          h('button',{className:`vbtn${viewMode==='split'?' on':''}`,onClick:()=>setViewMode('split')},'Split'),
          h('button',{className:`vbtn${viewMode==='canvas'?' on':''}`,onClick:()=>setViewMode('canvas')},'Canvas'),
          h('button',{className:`vbtn${viewMode==='full'?' on':''}`,onClick:()=>setViewMode('full')},'Full')
        )
      ),

      h('div',{className:'hdr-right'},
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
        h('button',{className:'btn xs ghost',disabled:!canUndo,title:'Undo (Ctrl+Z)',
          onClick:()=>{if(histIdx>0){skipHist.current=true;setLayers(history[histIdx-1].map(l=>({...l})));setHistIdx(p=>p-1);setTimeout(()=>{skipHist.current=false;},0);}}},
          '↩'),
        h('button',{className:'btn xs ghost',disabled:!canRedo,title:'Redo (Ctrl+Y)',
          onClick:()=>{if(histIdx<history.length-1){skipHist.current=true;setLayers(history[histIdx+1].map(l=>({...l})));setHistIdx(p=>p+1);setTimeout(()=>{skipHist.current=false;},0);}}},
          '↪'),
        h('div',{style:{width:1,height:14,background:'var(--b1)',margin:'0 2px'}}),
        h('button',{className:`btn xs ghost${snapGrid?' act':''}`,onClick:()=>setSnapGrid(v=>!v),title:'Snap to grid'},'⊞'),
        layers.length>0&&h(Fragment,null,
          h('button',{className:'btn xs ghost',onClick:genVariations},'Vars'),
          h('button',{className:'btn xs pri',onClick:()=>{setExportFilename(projectName);setShowExport(true);}},
            '↓ Export')
        )
      )
    ),

    h('div',{className:'body'},
      viewMode!=='canvas'&&h(LeftPanel),

      h('main',{className:'canvas-area',style:{display:viewMode==='full'?'none':'flex'}},
        h('div',{className:'toolbar'},
          h('span',{className:'tlabel'},activeLayer?`Active: ${activeLayer.name}`:'Canvas'),
          h('div',{className:'tsep'}),
          h('button',{className:`btn xs ghost${leftOpen?' act':''}`,onClick:()=>setLeftOpen(o=>!o)},'◧'),
          h('button',{className:`btn xs ghost${rightOpen?' act':''}`,onClick:()=>setRightOpen(o=>!o)},'◨'),
          h('div',{className:'tsep'}),
          selFrag&&selFragLayer&&h(Fragment,null,
            h('button',{className:'btn xs ghost',onClick:()=>bringFwd(selFragLayer.id,selectedFragId)},'↑'),
            h('button',{className:'btn xs ghost',onClick:()=>sendBck(selFragLayer.id,selectedFragId)},'↓'),
            h('button',{className:'btn xs ghost',onClick:()=>dupFrag(selFragLayer.id,selFrag)},'⊕'),
            h('button',{className:'btn xs ghost red',onClick:()=>deleteFrag(selFragLayer.id,selectedFragId)},'✕'),
            h('div',{className:'tsep'}),
            h('span',{className:'tlabel',style:{color:'var(--acc)'}},selFrag.label),
            h('div',{className:'tsep'}),
          ),
          h('div',{style:{flex:1}}),
          h('span',{className:'tlabel'},`${CW}×${CH} · ${layers.length} layers`)
        ),
        h('div',{className:'stage-wrap'},h(Stage)),
        h('div',{className:'sbar'},
          h('div',{className:`sdot${isProc?' pulse warn':''}`}),
          h('span',null,isProc?procMsg:`${layers.filter(l=>l.visible).length} visible · ${layers.filter(l=>l.type==='collage').length} collage`),
          activeLayer&&h(Fragment,null,h('span',null,'·'),h('span',{style:{color:'var(--acc)'}},activeLayer.name,` · ${activeLayer.grade?.look||'none'}`)),
          h('div',{style:{flex:1}}),
          canUndo&&h('span',null,`↩${histIdx}`)
        )
      ),

      viewMode==='full'&&h('div',{style:{flex:1,display:'flex',overflow:'hidden'}},
        h('div',{style:{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:20,background:'repeating-conic-gradient(#111 0% 25%,#0d0d0d 0% 50%) 0 0/20px 20px'}},h(Stage)),
        h('div',{style:{width:280,borderLeft:'1px solid var(--b1)',overflow:'hidden',display:'flex',flexDirection:'column',background:'var(--s1)'}},h(RightPanel))
      ),

      viewMode!=='canvas'&&h(RightPanel)
    ),
    h(ExportModal),
    h(VarsModal),
    h(SaveAsModal)
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(h(App));
