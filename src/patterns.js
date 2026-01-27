export function createPatternController(ctx){
  const {
    stamp,
    stampPattern,
    stampPatternOriginal,
    // 平铺填充版的图案盖章（世界坐标纹理）
    stampPatternTiled,
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
    patternDeleteBtn,
    patternInvertBtn,
    patternConfirmBtn,
    patternFileEl,
  }=ctx;

  const PATTERN_MAX_DIM=128;

  const patterns=[{ id:'default', mask:null, w:0, h:0 }];
  let activePatternId='default';
  let pendingPattern=null;
  let nextPatternId=1;
  // 允许外部临时覆盖当前调色工具使用的画笔（例如 deck 的 8x8 图案）
  // 如果设置了 activeOverrideBrush，则优先使用该画笔进行 stampPalette
  let activeOverrideBrush=null;

  const patternRenderCanvas=document.createElement('canvas');
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

  function ensureRenderCanvas(w,h){
    const cw=patternRenderCanvas.width|0;
    const ch=patternRenderCanvas.height|0;
    if(cw===w && ch===h) return;
    patternRenderCanvas.width=w;
    patternRenderCanvas.height=h;
    patternRenderCtx.imageSmoothingEnabled=false;
  }

  function drawPatternTo(ctx2d,targetW,targetH,pattern){
    if(!pattern || !pattern.mask || !pattern.w || !pattern.h) return;
    ensureRenderCanvas(pattern.w,pattern.h);
    patternRenderCtx.clearRect(0,0,pattern.w,pattern.h);
    renderMaskToCanvas(pattern.mask,pattern.w,pattern.h,patternRenderCtx);
    ctx2d.clearRect(0,0,targetW,targetH);
    const scale=Math.min(targetW/pattern.w,targetH/pattern.h);
    const dw=Math.max(1,Math.floor(pattern.w*scale));
    const dh=Math.max(1,Math.floor(pattern.h*scale));
    const dx=Math.floor((targetW-dw)/2);
    const dy=Math.floor((targetH-dh)/2);
    ctx2d.drawImage(patternRenderCanvas,dx,dy,dw,dh);
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

  function getPattern(patternId){
    if(!patternId) return null;
    const p=patterns.find(x=>x.id===patternId);
    return p || null;
  }

  function getActivePattern(){
    if(activePatternId==='default') return null;
    const p=getPattern(activePatternId);
    if(!p || !p.mask) return null;
    return p;
  }

  function updatePatternSelectUI(){
    if(!patternSelectLabelEl) return;
    if(activePatternId==='default'){
      patternSelectLabelEl.textContent='默认图案';
      renderDefaultThumb();
    }else{
      patternSelectLabelEl.textContent='';
      const p=getActivePattern();
      if(p && patternThumbCanvas && patternThumbCtx){
        drawPatternTo(patternThumbCtx,patternThumbCanvas.width,patternThumbCanvas.height,p);
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
        c.width=32;
        c.height=32;
        const cctx=c.getContext('2d');
        cctx.imageSmoothingEnabled=false;
        drawPatternTo(cctx,32,32,p);
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

  async function makePatternFromImage(img){
    const scale=Math.min(1,PATTERN_MAX_DIM/Math.max(img.width,img.height));
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
    return { mask, w, h };
  }

  function renderPending(){
    if(!patternEditEl) return;
    patternEditEl.classList.toggle('is-visible',!!pendingPattern);
    if(!pendingPattern) return;
    if(!patternPreviewCtx) return;
    const pw=patternPreviewCtx.canvas.width|0;
    const ph=patternPreviewCtx.canvas.height|0;
    drawPatternTo(patternPreviewCtx,pw,ph,pendingPattern);
  }

  function getBrushForSize(patternId){
    if(!patternId || patternId==='default') return null;
    const p=getPattern(patternId);
    if(!p || !p.mask || !p.w || !p.h) return null;
    return { w:p.w, h:p.h, mask: p.mask };
  }

  function stampPalette(frame,x,y,val,size){
    // 优先使用外部覆盖的画笔，否则按当前选择的 patternId 获取
    const override=activeOverrideBrush;
    const brush=(override && override.brush) ? override.brush : getBrushForSize(activePatternId);
    if(brush){
      const drawVal=(override && Number.isFinite(override.valOverride)) ? (override.valOverride|0) : (val|0);
      const mode=(override && override.mode) ? String(override.mode) : '';
      if(mode==='original' && typeof stampPatternOriginal==='function'){
        stampPatternOriginal(frame,x,y,drawVal,brush);
      }else if(typeof stampPatternTiled==='function'){
        stampPatternTiled(frame,x,y,drawVal,size,brush);
      }else{
        stampPattern(frame,x,y,drawVal,size,brush);
      }
      return;
    }
    stamp(frame,x,y,val,size);
  }

  function getConfig(){
    const list=patterns.map(p=>({
      id:String(p.id||''),
      mask:p && p.mask ? u8ToB64(p.mask) : null,
      w: Number(p && p.w)||0,
      h: Number(p && p.h)||0,
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
      if(!(mask instanceof Uint8Array)) return null;
      let w=Number(p && p.w)||0;
      let h=Number(p && p.h)||0;
      if(w<=0 || h<=0){
        if(mask.length===(32*32)){
          w=32; h=32;
        }else{
          return null;
        }
      }
      if(mask.length!==(w*h)) return null;
      return { id, mask, w:w|0, h:h|0 };
    }).filter(Boolean);
    patterns.length=0;
    patterns.push({ id:'default', mask:null, w:0, h:0 });
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
          pendingPattern=await makePatternFromImage(img);
          renderPending();
        }catch{}
      });
    }
    if(patternDeleteBtn){
      patternDeleteBtn.addEventListener('click',()=>{
        if(activePatternId==='default') return;
        const idx=patterns.findIndex(x=>x.id===activePatternId);
        if(idx<=0) return;
        patterns.splice(idx,1);
        activePatternId='default';
        rebuildPatternList();
        renderPending();
      });
    }
    if(patternInvertBtn){
      patternInvertBtn.addEventListener('click',()=>{
        if(!pendingPattern || !pendingPattern.mask) return;
        const mask=pendingPattern.mask;
        for(let i=0;i<mask.length;i++) mask[i]=mask[i]?0:1;
        renderPending();
      });
    }
    if(patternConfirmBtn){
      patternConfirmBtn.addEventListener('click',()=>{
        if(!pendingPattern || !pendingPattern.mask) return;
        const id=`p${nextPatternId++}`;
        patterns.push({ id, mask: pendingPattern.mask.slice(), w: pendingPattern.w|0, h: pendingPattern.h|0 });
        activePatternId=id;
        pendingPattern=null;
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
    // 设置/清除外部覆盖画笔（传入 null 代表清除）
    setActiveOverrideBrush(brush,options){
      if(brush && brush.mask instanceof Uint8Array && brush.w>0 && brush.h>0){
        const next={
          brush:{ w:brush.w|0, h:brush.h|0, mask: brush.mask },
          mode: options && options.mode ? String(options.mode) : '',
          valOverride: (options && Number.isFinite(options.valOverride)) ? (Number(options.valOverride)|0) : null,
        };
        activeOverrideBrush=next;
      }else{
        activeOverrideBrush=null;
      }
    },
  };
}
