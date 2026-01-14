export function createPatternController(ctx){
  const {
    stamp,
    stampPattern,
    u8ToB64,
    b64ToU8,
    patternPickerEl,
    patternSelectBtn,
    patternSelectLabelEl,
    patternThumbCanvas,
    patternThumbCtx,
    patternPopoverEl,
    patternListEl,
    patternEditEl,
    patternPreviewCtx,
    patternUploadBtn,
    patternInvertBtn,
    patternConfirmBtn,
    patternFileEl,
  }=ctx;

  const PATTERN_W=32;
  const PATTERN_H=32;

  const patterns=[{ id:'default', mask:null }];
  let activePatternId='default';
  let pendingMask32=null;
  let nextPatternId=1;

  const patternRenderCanvas=document.createElement('canvas');
  patternRenderCanvas.width=PATTERN_W;
  patternRenderCanvas.height=PATTERN_H;
  const patternRenderCtx=patternRenderCanvas.getContext('2d');
  patternRenderCtx.imageSmoothingEnabled=false;

  function renderMaskToCanvas(mask,w,h,ctx2d){
    const img=ctx2d.createImageData(w,h);
    const data=img.data;
    for(let i=0;i<mask.length;i++){
      const o=i*4;
      if(mask[i]){
        data[o]=0; data[o+1]=0; data[o+2]=0; data[o+3]=255;
      }else{
        data[o]=0; data[o+1]=0; data[o+2]=0; data[o+3]=0;
      }
    }
    ctx2d.putImageData(img,0,0);
  }

  function renderDefaultThumb(){
    if(!patternThumbCanvas || !patternThumbCtx) return;
    const w=patternThumbCanvas.width;
    const h=patternThumbCanvas.height;
    const img=patternThumbCtx.createImageData(w,h);
    const data=img.data;
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        const on=((x>>2)^(y>>2))&1;
        const o=(y*w+x)*4;
        const v=on?40:220;
        data[o]=v; data[o+1]=v; data[o+2]=v; data[o+3]=255;
      }
    }
    patternThumbCtx.putImageData(img,0,0);
  }

  function getActiveMask32(){
    if(activePatternId==='default') return null;
    const p=patterns.find(x=>x.id===activePatternId);
    return (p && p.mask) ? p.mask : null;
  }

  function updatePatternSelectUI(){
    if(!patternSelectLabelEl) return;
    if(activePatternId==='default'){
      patternSelectLabelEl.textContent='默认图案';
      renderDefaultThumb();
    }else{
      patternSelectLabelEl.textContent='';
      const m=getActiveMask32();
      if(m && patternThumbCanvas && patternThumbCtx){
        patternRenderCtx.clearRect(0,0,PATTERN_W,PATTERN_H);
        renderMaskToCanvas(m,PATTERN_W,PATTERN_H,patternRenderCtx);
        patternThumbCtx.clearRect(0,0,patternThumbCanvas.width,patternThumbCanvas.height);
        patternThumbCtx.drawImage(patternRenderCanvas,0,0,patternThumbCanvas.width,patternThumbCanvas.height);
      }else{
        renderDefaultThumb();
      }
    }
    if(patternListEl){
      for(const btn of patternListEl.querySelectorAll('.pattern-item')){
        btn.classList.toggle('is-active',btn.dataset.id===activePatternId);
      }
    }
  }

  function closePatternPopover(){
    if(!patternPopoverEl || !patternSelectBtn) return;
    patternPopoverEl.classList.remove('is-open');
    patternSelectBtn.setAttribute('aria-expanded','false');
  }

  function openPatternPopover(){
    if(!patternPopoverEl || !patternSelectBtn) return;
    patternPopoverEl.classList.add('is-open');
    patternSelectBtn.setAttribute('aria-expanded','true');
  }

  function rebuildPatternList(){
    if(!patternListEl) return;
    patternListEl.innerHTML='';
    for(const p of patterns){
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='pattern-item';
      btn.dataset.id=p.id;
      if(p.id==='default'){
        btn.innerHTML=`<span class="label">默认</span>`;
      }else{
        const c=document.createElement('canvas');
        c.width=PATTERN_W;
        c.height=PATTERN_H;
        const cctx=c.getContext('2d');
        cctx.imageSmoothingEnabled=false;
        renderMaskToCanvas(p.mask,PATTERN_W,PATTERN_H,cctx);
        btn.appendChild(c);
      }
      btn.addEventListener('click',()=>{
        activePatternId=p.id;
        updatePatternSelectUI();
        closePatternPopover();
      });
      patternListEl.appendChild(btn);
    }
    updatePatternSelectUI();
  }

  function fileToImage(file){
    return new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(file);
      const img=new Image();
      img.onload=()=>{
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror=()=>{
        URL.revokeObjectURL(url);
        reject(new Error('image load failed'));
      };
      img.src=url;
    });
  }

  function resampleMaskOR(src,sw,sh,ow,oh){
    const out=new Uint8Array(ow*oh);
    for(let y=0;y<oh;y++){
      const sy0=Math.floor(y*sh/oh);
      const sy1=Math.max(sy0+1,Math.floor((y+1)*sh/oh));
      for(let x=0;x<ow;x++){
        const sx0=Math.floor(x*sw/ow);
        const sx1=Math.max(sx0+1,Math.floor((x+1)*sw/ow));
        let on=0;
        for(let yy=sy0;yy<sy1 && !on;yy++){
          const row=yy*sw;
          for(let xx=sx0;xx<sx1;xx++){
            if(src[row+xx]){ on=1; break; }
          }
        }
        out[y*ow+x]=on;
      }
    }
    return out;
  }

  function trimMask(src,sw,sh){
    let minX=sw, minY=sh, maxX=-1, maxY=-1;
    for(let y=0;y<sh;y++){
      const row=y*sw;
      for(let x=0;x<sw;x++){
        if(!src[row+x]) continue;
        if(x<minX) minX=x;
        if(y<minY) minY=y;
        if(x>maxX) maxX=x;
        if(y>maxY) maxY=y;
      }
    }
    if(maxX<0) return { mask:new Uint8Array(1), w:1, h:1 };
    const w=maxX-minX+1;
    const h=maxY-minY+1;
    const out=new Uint8Array(w*h);
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        out[y*w+x]=src[(minY+y)*sw+(minX+x)];
      }
    }
    return { mask:out, w, h };
  }

  async function makeMask32FromImage(img){
    const maxDim=256;
    const scale=Math.min(1,maxDim/Math.max(img.width,img.height));
    const w=Math.max(1,Math.round(img.width*scale));
    const h=Math.max(1,Math.round(img.height*scale));
    const c=document.createElement('canvas');
    c.width=w;
    c.height=h;
    const cctx=c.getContext('2d');
    cctx.clearRect(0,0,w,h);
    cctx.drawImage(img,0,0,w,h);
    const data=cctx.getImageData(0,0,w,h).data;
    const mask=new Uint8Array(w*h);
    for(let i=0;i<mask.length;i++){
      const o=i*4;
      const a=data[o+3];
      if(a<128){ mask[i]=0; continue; }
      const r=data[o], g=data[o+1], b=data[o+2];
      const lum=(r*0.2126+g*0.7152+b*0.0722);
      mask[i]=lum<128?1:0;
    }
    const t=trimMask(mask,w,h);
    return resampleMaskOR(t.mask,t.w,t.h,PATTERN_W,PATTERN_H);
  }

  function renderPending(){
    if(!patternEditEl) return;
    patternEditEl.classList.toggle('is-visible',!!pendingMask32);
    if(!pendingMask32) return;
    if(!patternPreviewCtx) return;
    patternPreviewCtx.clearRect(0,0,PATTERN_W,PATTERN_H);
    renderMaskToCanvas(pendingMask32,PATTERN_W,PATTERN_H,patternPreviewCtx);
  }

  function getBrushForSize(patternId){
    if(!patternId || patternId==='default') return null;
    const p=patterns.find(x=>x.id===patternId);
    const baseMask=p && p.mask;
    if(!baseMask) return null;
    return { w:PATTERN_W, h:PATTERN_H, mask: baseMask };
  }

  function stampPalette(frame,x,y,val,size){
    const brush=getBrushForSize(activePatternId);
    if(brush){
      stampPattern(frame,x,y,val,size,brush);
      return;
    }
    stamp(frame,x,y,val,size);
  }

  function getConfig(){
    const list=patterns.map(p=>({
      id:String(p.id||''),
      mask:p && p.mask ? u8ToB64(p.mask) : null,
    })).filter(p=>p.id);
    return {
      activeId: String(activePatternId||'default'),
      nextId: Number(nextPatternId)||1,
      list,
    };
  }

  function applyConfig(config){
    if(!config || typeof config!=='object') return;
    if(!Array.isArray(config.list)) return;
    const nextList=config.list.map(p=>{
      const id=String(p && p.id || '').trim();
      if(!id) return null;
      if(id==='default') return { id:'default', mask:null };
      const mask=p && p.mask ? b64ToU8(p.mask) : null;
      if(!(mask instanceof Uint8Array) || mask.length!==(PATTERN_W*PATTERN_H)) return null;
      return { id, mask };
    }).filter(Boolean);
    patterns.length=0;
    patterns.push({ id:'default', mask:null });
    for(const p of nextList){
      if(p.id==='default') continue;
      if(patterns.some(x=>x.id===p.id)) continue;
      patterns.push(p);
    }
    const want=String(config.activeId||'default');
    activePatternId=patterns.some(x=>x.id===want)?want:'default';
    nextPatternId=Math.max(1,Number(config.nextId)||1);
    rebuildPatternList();
  }

  function bind(){
    if(patternSelectBtn && patternPopoverEl){
      patternSelectBtn.addEventListener('click',()=>{
        if(patternPopoverEl.classList.contains('is-open')) closePatternPopover();
        else openPatternPopover();
      });
    }
    document.addEventListener('mousedown',(e)=>{
      if(!patternPopoverEl || !patternPopoverEl.classList.contains('is-open')) return;
      if(patternPickerEl && patternPickerEl.contains(e.target)) return;
      closePatternPopover();
    });
    if(patternUploadBtn && patternFileEl){
      patternUploadBtn.addEventListener('click',()=>{
        patternFileEl.value='';
        patternFileEl.click();
      });
      patternFileEl.addEventListener('change',async ()=>{
        const file=patternFileEl.files && patternFileEl.files[0];
        if(!file) return;
        try{
          const img=await fileToImage(file);
          pendingMask32=await makeMask32FromImage(img);
          renderPending();
        }catch{}
      });
    }
    if(patternInvertBtn){
      patternInvertBtn.addEventListener('click',()=>{
        if(!pendingMask32) return;
        for(let i=0;i<pendingMask32.length;i++) pendingMask32[i]=pendingMask32[i]?0:1;
        renderPending();
      });
    }
    if(patternConfirmBtn){
      patternConfirmBtn.addEventListener('click',()=>{
        if(!pendingMask32) return;
        const id=`p${nextPatternId++}`;
        patterns.push({ id, mask: pendingMask32.slice() });
        activePatternId=id;
        pendingMask32=null;
        rebuildPatternList();
        renderPending();
      });
    }
  }

  bind();
  rebuildPatternList();
  renderPending();

  return {
    stampPalette,
    getConfig,
    applyConfig,
    getPatternSize: ()=>({ w:PATTERN_W, h:PATTERN_H }),
  };
}

