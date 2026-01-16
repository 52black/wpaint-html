const spriteUrl=new URL('../1.png',import.meta.url).href;

function clampNum(v,lo,hi){
  const n=Number(v);
  if(!Number.isFinite(n)) return lo;
  return Math.max(lo,Math.min(hi,n));
}

function mergeParams(base,patch){
  const out={ ...base };
  if(patch && typeof patch==='object'){
    for(const k of Object.keys(patch)) out[k]=patch[k];
  }
  return out;
}

function computeRects(imgW,imgH,p){
  const cols=Math.max(1,Number(p.cols)||1);
  const rows=Math.max(1,Number(p.rows)||1);
  const borderL=Number(p.borderL)||0;
  const borderT=Number(p.borderT)||0;
  const borderR=Number(p.borderR)||0;
  const borderB=Number(p.borderB)||0;
  const gapX=Number(p.gapX)||0;
  const gapY=Number(p.gapY)||0;

  let tileW=Number(p.tileW)||0;
  let tileH=Number(p.tileH)||0;
  if(!(tileW>0)){
    tileW=(imgW-borderL-borderR-gapX*(cols-1))/cols;
  }
  if(!(tileH>0)){
    tileH=(imgH-borderT-borderB-gapY*(rows-1))/rows;
  }
  tileW=Math.max(1,Math.floor(tileW));
  tileH=Math.max(1,Math.floor(tileH));

  const rects=[];
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      const x=Math.round(borderL+c*(tileW+gapX));
      const y=Math.round(borderT+r*(tileH+gapY));
      rects.push({ r,c,x,y,w:tileW,h:tileH,i:r*cols+c });
    }
  }
  return { cols,rows,borderL,borderT,borderR,borderB,gapX,gapY,tileW,tileH,rects };
}

function ensureRoot(){
  let root=document.getElementById('spriteTestRoot');
  if(root) return root;
  root=document.createElement('div');
  root.id='spriteTestRoot';
  root.style.position='fixed';
  root.style.inset='0';
  root.style.zIndex='999999';
  root.style.background='rgba(10,10,10,.94)';
  root.style.color='#eaeaea';
  root.style.font='12px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  root.style.overflow='auto';

  const inner=document.createElement('div');
  inner.style.display='grid';
  inner.style.gap='12px';
  inner.style.padding='12px';
  inner.style.alignContent='start';
  root.appendChild(inner);

  const header=document.createElement('div');
  header.id='spriteTestHeader';
  header.style.display='flex';
  header.style.flexWrap='wrap';
  header.style.gap='12px';
  header.style.alignItems='center';
  inner.appendChild(header);

  const hint=document.createElement('div');
  hint.id='spriteTestHint';
  hint.style.opacity='.9';
  hint.textContent='打开控制台调用 window.spriteTestRender({ ... }) 反复调参；按 Esc 关闭。';
  header.appendChild(hint);

  const meta=document.createElement('div');
  meta.id='spriteTestMeta';
  meta.style.opacity='.8';
  header.appendChild(meta);

  const canvWrap=document.createElement('div');
  canvWrap.style.display='grid';
  canvWrap.style.gridTemplateColumns='minmax(260px,1fr)';
  canvWrap.style.gap='12px';
  inner.appendChild(canvWrap);

  const fullTitle=document.createElement('div');
  fullTitle.textContent='整张图（带裁剪网格）';
  fullTitle.style.opacity='.9';
  canvWrap.appendChild(fullTitle);

  const fullCanvas=document.createElement('canvas');
  fullCanvas.id='spriteTestFull';
  fullCanvas.style.width='min(1366px, 100%)';
  fullCanvas.style.height='auto';
  fullCanvas.style.background='#111';
  fullCanvas.style.border='1px solid rgba(255,255,255,.15)';
  canvWrap.appendChild(fullCanvas);

  const cutTitle=document.createElement('div');
  cutTitle.textContent='裁剪结果（按网格顺序）';
  cutTitle.style.opacity='.9';
  canvWrap.appendChild(cutTitle);

  const cutCanvas=document.createElement('canvas');
  cutCanvas.id='spriteTestCut';
  cutCanvas.style.width='min(1200px, 100%)';
  cutCanvas.style.height='auto';
  cutCanvas.style.background='#111';
  cutCanvas.style.border='1px solid rgba(255,255,255,.15)';
  canvWrap.appendChild(cutCanvas);

  document.body.appendChild(root);

  const onKey=(e)=>{
    if(e.key==='Escape'){
      try{ root.remove(); }catch{}
      window.removeEventListener('keydown',onKey,true);
    }
  };
  window.addEventListener('keydown',onKey,true);

  return root;
}

function drawHiDPICanvas(canvas,cssW,cssH){
  const dpr=Math.max(1,Math.min(4,window.devicePixelRatio||1));
  const w=Math.max(1,Math.round(cssW*dpr));
  const h=Math.max(1,Math.round(cssH*dpr));
  canvas.width=w;
  canvas.height=h;
  const ctx=canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  return ctx;
}

function render({ img, params }){
  const root=ensureRoot();
  const fullCanvas=root.querySelector('#spriteTestFull');
  const cutCanvas=root.querySelector('#spriteTestCut');
  const metaEl=root.querySelector('#spriteTestMeta');

  const imgW=img.naturalWidth||img.width||0;
  const imgH=img.naturalHeight||img.height||0;
  const s=computeRects(imgW,imgH,params);

  const fullCssW=Math.min(imgW,Math.max(260,Math.floor(window.innerWidth-48)));
  const fullCssH=Math.round(fullCssW*(imgH/imgW));
  const fullCtx=drawHiDPICanvas(fullCanvas,fullCssW,fullCssH);
  fullCtx.clearRect(0,0,fullCssW,fullCssH);
  fullCtx.imageSmoothingEnabled=true;
  fullCtx.drawImage(img,0,0,fullCssW,fullCssH);

  const scaleX=fullCssW/imgW;
  const scaleY=fullCssH/imgH;
  fullCtx.save();
  fullCtx.scale(scaleX,scaleY);
  fullCtx.lineWidth=2/Math.max(scaleX,scaleY);
  for(const r of s.rects){
    fullCtx.strokeStyle='rgba(0,255,180,.75)';
    fullCtx.strokeRect(r.x+.5,r.y+.5,r.w,r.h);
    fullCtx.fillStyle='rgba(0,0,0,.55)';
    fullCtx.fillRect(r.x,r.y,22,16);
    fullCtx.fillStyle='rgba(255,255,255,.9)';
    fullCtx.font='12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    fullCtx.fillText(String(r.i+1),r.x+4,r.y+12);
  }
  fullCtx.restore();

  const pad=Number(params.pad);
  const gap=Number.isFinite(pad) ? pad : 10;
  const scale=Number(params.previewScale);
  const previewScale=Number.isFinite(scale) && scale>0 ? scale : 1.6;
  const cutCssW=Math.max(260,Math.floor((s.tileW*previewScale+gap)*s.cols+gap));
  const cutCssH=Math.max(120,Math.floor((s.tileH*previewScale+gap)*s.rows+gap));
  const cutCtx=drawHiDPICanvas(cutCanvas,cutCssW,cutCssH);
  cutCtx.clearRect(0,0,cutCssW,cutCssH);
  cutCtx.imageSmoothingEnabled=true;

  for(const r of s.rects){
    const dx=Math.round(gap+r.c*(s.tileW*previewScale+gap));
    const dy=Math.round(gap+r.r*(s.tileH*previewScale+gap));
    const dw=Math.round(s.tileW*previewScale);
    const dh=Math.round(s.tileH*previewScale);
    cutCtx.fillStyle='rgba(255,255,255,.06)';
    cutCtx.fillRect(dx,dy,dw,dh);
    cutCtx.drawImage(img,r.x,r.y,r.w,r.h,dx,dy,dw,dh);
    cutCtx.strokeStyle='rgba(255,255,255,.22)';
    cutCtx.lineWidth=1;
    cutCtx.strokeRect(dx+.5,dy+.5,dw,dh);
    cutCtx.fillStyle='rgba(0,0,0,.55)';
    cutCtx.fillRect(dx,dy,22,16);
    cutCtx.fillStyle='rgba(255,255,255,.9)';
    cutCtx.font='12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    cutCtx.fillText(String(r.i+1),dx+4,dy+12);
  }

  metaEl.textContent=`img=${imgW}×${imgH} cols=${s.cols} rows=${s.rows} tile=${s.tileW}×${s.tileH} gap=${s.gapX},${s.gapY} border=${s.borderL},${s.borderT},${s.borderR},${s.borderB}`;
}

const defaultParams={
  cols:6,
  rows:3,
  borderL:0,
  borderT:0,
  borderR:0,
  borderB:0,
  gapX:0,
  gapY:0,
  tileW:0,
  tileH:0,
  previewScale:1.6,
  pad:10,
};

let currentParams={ ...defaultParams };
let spriteImg=null;

async function ensureImage(){
  if(spriteImg && spriteImg.complete && (spriteImg.naturalWidth||0)>0) return spriteImg;
  const img=new Image();
  img.decoding='async';
  img.src=spriteUrl;
  await img.decode();
  spriteImg=img;
  return img;
}

window.spriteTestRender=async function spriteTestRender(patch){
  const next=mergeParams(currentParams,patch);
  next.cols=clampNum(next.cols,1,24);
  next.rows=clampNum(next.rows,1,24);
  currentParams=next;
  const img=await ensureImage();
  render({ img, params: currentParams });
  return { ...currentParams };
};

window.spriteTestParams=function spriteTestParams(){
  return { ...currentParams };
};

window.spriteTestReset=async function spriteTestReset(){
  currentParams={ ...defaultParams };
  const img=await ensureImage();
  render({ img, params: currentParams });
  return { ...currentParams };
};

window.spriteTestClose=function spriteTestClose(){
  const root=document.getElementById('spriteTestRoot');
  if(root) root.remove();
};

ensureImage().then((img)=>render({ img, params: currentParams })).catch(()=>{});

