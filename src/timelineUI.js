import { GIFEncoder } from 'gifenc';
import { hexToRGB, downloadBlobAsFile } from './utils.js';

export function createTimelineController(ctx){
  const {
    clamp,
    openModal,
    closeModal,
    makeModalDraggable,
    stopAnim,
    renderCurrent,
    applyPlaybackMode,
    getJitterSubDelayMs,
    getW,
    getH,
    frames,
    colorMap,
    maxColorIndex,
    toggleTransparentEl,
    jitterOnEl,
    getTimeline,
    setTimeline,
    getTimelineIndex,
    setTimelineIndex,
    getTimelineToken,
    setTimelineToken,
    getTimelineAnchor,
    setTimelineAnchor,
    getTimelineSelected,
    setTimelineSelected,
    isTimelinePlaying,
    setTimelinePlaying,
    getDisplayFrame,
    setDisplayFrame,
    ensureCelModel,
    applyWorkingFramesFromCel,
  }=ctx;

  const animBtnEl=document.getElementById('animBtn');
  const animModalEl=document.getElementById('animModal');
  const animCloseEl=document.getElementById('animClose');
  const animFrameListEl=document.getElementById('animFrameList');
  const animNewFrameEl=document.getElementById('animNewFrame');
  const animDeleteFrameEl=document.getElementById('animDeleteFrame');
  const animMultiSelectEl=document.getElementById('animMultiSelect');
  const animDelayEl=document.getElementById('animDelay');
  const animPlayEl=document.getElementById('animPlay');
  const animPlayCloseEl=document.getElementById('animPlayClose');
  const animApplyAllDelayEl=document.getElementById('animApplyAllDelay');
  const animExportGifEl=document.getElementById('animExportGif');

  let animMultiSelectMode=false;
  let animJustDraggedUntil=0;
  let animDrag=null;
  const ANIM_THUMB_W=32;
  const ANIM_THUMB_H=24;

  if(makeModalDraggable) makeModalDraggable(animModalEl);

  function buildColorRgbCache(){
    const cache=new Array((maxColorIndex|0)+1);
    for(let i=1;i<cache.length;i++){
      const hex=colorMap[i];
      if(hex) cache[i]=hexToRGB(hex);
    }
    return cache;
  }
  function renderCelThumb(canvasEl,cel,sub,rgbCache){
    if(!cel) return;
    const c=canvasEl.getContext('2d');
    if(!c) return;
    c.imageSmoothingEnabled=false;
    const tw=canvasEl.width|0;
    const th=canvasEl.height|0;
    const w=getW()|0;
    const h=getH()|0;
    const img=c.createImageData(tw,th);
    const data=img.data;
    const hasLayers=cel && Array.isArray(cel.layers) && cel.layers.length>0;
    const layers=hasLayers ? cel.layers : null;
    const baseFrames=(!hasLayers && cel && Array.isArray(cel.frames)) ? cel.frames : null;
    for(let y=0;y<th;y++){
      const sy=Math.floor(y*h/th);
      for(let x=0;x<tw;x++){
        const sx=Math.floor(x*w/tw);
        const idx=sy*w+sx;
        let val=0;
        if(layers){
          for(let li=layers.length-1;li>=0;li--){
            const layer=layers[li];
            if(layer && layer.visible===false) continue;
            const frames4=layer && Array.isArray(layer.frames) ? layer.frames : null;
            const src=frames4 ? (frames4[sub] ?? frames4[0]) : null;
            if(!(src instanceof Uint8Array) || src.length!==(w*h)) continue;
            const pv=src[idx];
            if(pv!==0){ val=pv; break; }
          }
        }else if(baseFrames){
          const src=baseFrames[sub] ?? baseFrames[0];
          if(src instanceof Uint8Array && src.length===(w*h)) val=src[idx];
        }
        const o=(y*tw+x)*4;
        if(val===0){
          data[o]=0; data[o+1]=0; data[o+2]=0; data[o+3]=0;
        }else{
          const rgb=rgbCache[val] || hexToRGB(colorMap[val] ?? '#000000');
          data[o]=rgb[0]; data[o+1]=rgb[1]; data[o+2]=rgb[2]; data[o+3]=255;
        }
      }
    }
    c.putImageData(img,0,0);
  }

  function applyTimelineFrame(i){
    const timeline=getTimeline();
    const t=timeline && timeline[i];
    if(!t) return;
    if(typeof ensureCelModel==='function') ensureCelModel(t);
    if(typeof applyWorkingFramesFromCel==='function') applyWorkingFramesFromCel(t);
    else{
      for(let fi=0;fi<4;fi++){
        frames[fi]=t.frames[fi];
      }
    }
  }

  function moveTimelineFrameInsert(from,insertIndex){
    const timeline=getTimeline();
    const len=timeline.length;
    const a=from|0;
    const b=insertIndex|0;
    if(a<0 || a>=len) return;
    const nextLen=len-1;
    const finalIndex=clamp(b,0,nextLen);
    if(finalIndex===a) return;
    const [item]=timeline.splice(a,1);
    timeline.splice(finalIndex,0,item);
    const remap=(idx)=>{
      if(idx===a) return finalIndex;
      if(a<finalIndex && a<idx && idx<=finalIndex) return idx-1;
      if(finalIndex<a && finalIndex<=idx && idx<a) return idx+1;
      return idx;
    };
    setTimelineIndex(remap(getTimelineIndex()));
    setTimelineAnchor(remap(getTimelineAnchor()));
    const selected=getTimelineSelected();
    const nextSelected=new Set();
    for(const s of selected){
      nextSelected.add(remap(s));
    }
    setTimelineSelected(nextSelected);
  }

  function setTimelineIndexAndRender(i){
    const timeline=getTimeline();
    const next=Math.max(0,Math.min(timeline.length-1,i|0));
    setTimelineIndex(next);
    applyTimelineFrame(next);
    if(jitterOnEl && jitterOnEl.checked && !isTimelinePlaying()){
      applyPlaybackMode();
    }else{
      if(stopAnim) stopAnim();
      setDisplayFrame(3);
      renderCurrent();
    }
    syncAnimUI();
  }

  function cloneTimelineFrame(src){
    const out={ frames: src.frames.map(f=>new Uint8Array(f)), delay: src.delay|0 };
    if(Array.isArray(src.layers) && src.layers.length>0){
      out.layers=src.layers.map(l=>{
        const frames4=Array.isArray(l.frames) ? l.frames : [];
        return {
          name: String(l.name||''),
          visible: l.visible!==false,
          opacity: (l.opacity==null ? 100 : Math.max(0,Math.min(100,Number(l.opacity)||0))),
          frames: [0,1,2,3].map(i=>new Uint8Array(frames4[i] ?? frames4[0] ?? out.frames[i])),
        };
      });
    }
    return out;
  }

  function rebuildAnimFrameList(){
    if(!animFrameListEl) return;
    const timeline=getTimeline();
    const timelineIndex=getTimelineIndex();
    const timelineSelected=getTimelineSelected();
    const rgbCache=buildColorRgbCache();
    animFrameListEl.innerHTML='';
    for(let i=0;i<timeline.length;i++){
      const btn=document.createElement('button');
      btn.type='button';
      btn.dataset.index=String(i);
      const active=i===timelineIndex;
      const selected=timelineSelected.has(i);
      btn.className='anim-frame-btn'+(active?' is-active':'')+(selected?' is-selected':'');
      btn.title=`第${i+1}帧（${Math.max(30,timeline[i]?.delay|0)}ms）`;
      const thumb=document.createElement('canvas');
      thumb.width=ANIM_THUMB_W;
      thumb.height=ANIM_THUMB_H;
      renderCelThumb(thumb,timeline[i],3,rgbCache);
      btn.appendChild(thumb);
      btn.addEventListener('click',(e)=>{
        if(Date.now()<animJustDraggedUntil) return;
        if(isTimelinePlaying()) return;
        const isMac=navigator.platform.toLowerCase().includes('mac');
        const multiKey=isMac ? e.metaKey : e.ctrlKey;
        if(e.shiftKey){
          const a=clamp(getTimelineAnchor(),0,timeline.length-1);
          const b=i;
          const lo=Math.min(a,b), hi=Math.max(a,b);
          const next=new Set();
          for(let k=lo;k<=hi;k++) next.add(k);
          setTimelineSelected(next);
        }else if(animMultiSelectMode || multiKey){
          const next=new Set(getTimelineSelected());
          if(next.has(i)) next.delete(i);
          else next.add(i);
          if(next.size===0) next.add(i);
          setTimelineSelected(next);
          setTimelineAnchor(i);
        }else{
          setTimelineAnchor(i);
          setTimelineSelected(new Set([i]));
        }
        setTimelineIndexAndRender(i);
      });
      animFrameListEl.appendChild(btn);
    }
  }

  function syncAnimUI(){
    rebuildAnimFrameList();
    const timeline=getTimeline();
    const selected=[...getTimelineSelected()].filter(i=>i>=0 && i<timeline.length);
    const delays=selected.map(i=>Math.max(30,timeline[i]?.delay|0));
    const uniform=delays.length>0 && delays.every(x=>x===delays[0]);
    if(animDelayEl){
      if(delays.length===0){
        animDelayEl.value='';
      }else if(uniform){
        animDelayEl.value=String(delays[0]);
        animDelayEl.placeholder='';
      }else{
        animDelayEl.value='';
        animDelayEl.placeholder='多个值';
      }
    }
    const disable=isTimelinePlaying();
    if(animNewFrameEl) animNewFrameEl.disabled=disable;
    if(animDeleteFrameEl) animDeleteFrameEl.disabled=disable || timeline.length<=1 || getTimelineSelected().size===0;
    if(animDelayEl) animDelayEl.disabled=disable;
    if(animPlayEl) animPlayEl.textContent=disable?'停止':'播放';
    if(animPlayCloseEl) animPlayCloseEl.disabled=disable;
    if(animApplyAllDelayEl) animApplyAllDelayEl.disabled=disable;
    if(animExportGifEl) animExportGifEl.disabled=disable;
    if(animMultiSelectEl){
      animMultiSelectEl.disabled=disable;
      animMultiSelectEl.classList.toggle('is-active',animMultiSelectMode);
    }
  }

  function stopTimelinePlayback(){
    setTimelinePlaying(false);
    setTimelineToken((getTimelineToken()|0)+1);
    syncAnimUI();
  }

  function startTimelinePlayback(){
    if(isTimelinePlaying()) return;
    if(stopAnim) stopAnim();
    setTimelinePlaying(true);
    const token=(getTimelineToken()|0)+1;
    setTimelineToken(token);
    syncAnimUI();
    const playCel=()=>{
      if(!isTimelinePlaying() || token!==getTimelineToken()) return;
      const timeline=getTimeline();
      const idx=getTimelineIndex();
      const cel=timeline[idx];
      if(!cel){ stopTimelinePlayback(); return; }
      let remaining=Math.max(30,cel.delay|0);
      let sub=0;
      const tick=()=>{
        if(!isTimelinePlaying() || token!==getTimelineToken()) return;
        setDisplayFrame(sub);
        renderCurrent();
        const base=getJitterSubDelayMs(sub);
        const wait=Math.min(base,remaining);
        remaining-=wait;
        if(remaining>0){
          sub=(sub+1)%3;
          window.setTimeout(tick,wait);
        }else{
          const nextIndex=(idx+1)%timeline.length;
          setTimelineIndex(nextIndex);
          applyTimelineFrame(nextIndex);
          syncAnimUI();
          window.setTimeout(playCel,wait);
        }
      };
      tick();
    };
    playCel();
  }

  function openAnim(){
    if(!animModalEl) return;
    stopTimelinePlayback();
    if(stopAnim) stopAnim();
    setDisplayFrame(3);
    renderCurrent();
    openModal(animModalEl);
    if(getTimelineSelected().size===0) setTimelineSelected(new Set([getTimelineIndex()]));
    setTimelineAnchor(getTimelineIndex());
    syncAnimUI();
  }

  function closeAnim(options){
    if(!animModalEl) return;
    const stopPlayback=options?.stopPlayback!==false;
    if(stopPlayback){
      stopTimelinePlayback();
      closeModal(animModalEl);
      applyPlaybackMode();
    }else{
      closeModal(animModalEl);
    }
  }

  function exportAnimGif(){
    const transparent=Boolean(toggleTransparentEl && toggleTransparentEl.checked);
    const palette=[];
    for(let i=0;i<=maxColorIndex;i++) palette[i]=hexToRGB(colorMap[i] ?? '#000000');
    const gif=GIFEncoder({ repeat: 0 });
    const w=getW()|0;
    const h=getH()|0;
    function compositeFromLayers(cel,sub){
      const layers=Array.isArray(cel.layers) ? cel.layers : [];
      const len=(w*h)|0;
      const out=new Uint8Array(len);
      for(let i=0;i<len;i++){
        let v=0;
        for(let li=layers.length-1;li>=0;li--){
          const layer=layers[li];
          if(layer && layer.visible===false) continue;
          const frames4=layer && Array.isArray(layer.frames) ? layer.frames : null;
          const src=frames4 ? (frames4[sub] ?? frames4[0]) : null;
          if(!(src instanceof Uint8Array) || src.length!==len) continue;
          const pv=src[i];
          if(pv!==0){ v=pv; break; }
        }
        out[i]=v;
      }
      return out;
    }
    for(const cel of getTimeline()){
      const hasLayers=cel && Array.isArray(cel.layers) && cel.layers.length>0;
      const jitterFrames=hasLayers ? [compositeFromLayers(cel,0),compositeFromLayers(cel,1),compositeFromLayers(cel,2)] : null;
      let remaining=Math.max(30,cel.delay|0);
      while(remaining>0){
        for(let sub=0;sub<3 && remaining>0;sub++){
          const dt=Math.min(getJitterSubDelayMs(sub),remaining);
          const indicesRaw=hasLayers ? jitterFrames[sub] : cel.frames[sub];
          const indices=transparent ? indicesRaw : (()=>{
            const out=new Uint8Array(indicesRaw.length);
            for(let i=0;i<indicesRaw.length;i++){
              const v=indicesRaw[i];
              out[i]=v===0?1:v;
            }
            return out;
          })();
          const options={ palette, delay: dt };
          if(transparent) options.transparent=0;
          gif.writeFrame(indices,w,h,options);
          remaining-=dt;
        }
      }
    }
    gif.finish();
    const gifBytes=gif.bytes();
    const blob=new Blob([gifBytes],{type:'image/gif'});
    downloadBlobAsFile(blob,'anim.gif');
  }

  if(animBtnEl) animBtnEl.addEventListener('click',openAnim);
  if(animCloseEl) animCloseEl.addEventListener('click',()=>closeAnim());
  if(animModalEl){
    animModalEl.addEventListener('mousedown',(e)=>{
      if(e.target===animModalEl) closeAnim();
    });
  }
  window.addEventListener('keydown',(e)=>{
    if(e.key==='Escape' && animModalEl && animModalEl.classList.contains('is-open')) closeAnim();
  });

  if(animFrameListEl){
    function animGetInsertIndex(clientX,clientY){
      const buttons=[...animFrameListEl.querySelectorAll('.anim-frame-btn')];
      if(buttons.length===0) return 0;
      const items=buttons.map((el,i)=>{
        const r=el.getBoundingClientRect();
        return { el, i, left:r.left, right:r.right, top:r.top, bottom:r.bottom, cx:r.left+r.width/2, cy:r.top+r.height/2 };
      }).sort((a,b)=> (a.top-b.top) || (a.left-b.left) || (a.i-b.i));
      const rows=[];
      const rowTol=10;
      for(const it of items){
        const last=rows[rows.length-1];
        if(!last || Math.abs(it.top-last.top)>rowTol){
          rows.push({ top: it.top, bottom: it.bottom, items:[it] });
        }else{
          last.items.push(it);
          last.bottom=Math.max(last.bottom,it.bottom);
          last.top=Math.min(last.top,it.top);
        }
      }
      for(const row of rows){
        row.items.sort((a,b)=>a.left-b.left);
      }
      let rowIndex=0;
      let bestRowDist=Infinity;
      for(let r=0;r<rows.length;r++){
        const row=rows[r];
        const cy=(row.top+row.bottom)/2;
        const dy=Math.abs(clientY-cy);
        if(dy<bestRowDist){
          bestRowDist=dy;
          rowIndex=r;
        }
      }
      const row=rows[rowIndex];
      let within=0;
      if(row.items.length>0){
        let pos=row.items.length;
        for(let k=0;k<row.items.length;k++){
          const it=row.items[k];
          const before=clientX < it.cx;
          if(before){ pos=k; break; }
        }
        within=clamp(pos,0,row.items.length);
      }
      let base=0;
      for(let r=0;r<rowIndex;r++) base+=rows[r].items.length;
      return clamp(base+within,0,buttons.length);
    }
    function animPlacePlaceholder(index){
      if(!animDrag || !animDrag.placeholderEl) return;
      const placeholder=animDrag.placeholderEl;
      const buttons=[...animFrameListEl.querySelectorAll('.anim-frame-btn')];
      if(index>=buttons.length) animFrameListEl.appendChild(placeholder);
      else animFrameListEl.insertBefore(placeholder,buttons[index]);
    }
    function animStartDrag(e,btn,fromIndex){
      if(isTimelinePlaying()) return;
      if(animDrag && animDrag.active) return;
      const rect=btn.getBoundingClientRect();
      const placeholder=document.createElement('div');
      placeholder.className='anim-frame-placeholder';
      btn.parentNode.insertBefore(placeholder,btn);
      const ghost=btn.cloneNode(true);
      ghost.classList.add('is-dragging');
      ghost.style.position='fixed';
      ghost.style.left=`${rect.left}px`;
      ghost.style.top=`${rect.top}px`;
      ghost.style.width=`${rect.width}px`;
      ghost.style.height=`${rect.height}px`;
      ghost.style.zIndex='10000';
      ghost.style.pointerEvents='none';
      ghost.style.margin='0';
      document.body.appendChild(ghost);
      btn.remove();
      animDrag={
        pointerId: e.pointerId,
        fromIndex,
        placeholderEl: placeholder,
        ghostEl: ghost,
        offsetX: e.clientX-rect.left,
        offsetY: e.clientY-rect.top,
        active: true,
      };
      animFrameListEl.setPointerCapture(e.pointerId);
      animJustDraggedUntil=Date.now()+250;
      e.preventDefault();
    }
    function animFinishDrag(e,cancelled){
      if(!animDrag || animDrag.pointerId!==e.pointerId) return;
      const fromIndex=animDrag.fromIndex;
      const placeholder=animDrag.placeholderEl;
      const ghost=animDrag.ghostEl;
      let insertIndex=0;
      for(const child of animFrameListEl.children){
        if(child===placeholder) break;
        if(child.classList && child.classList.contains('anim-frame-btn')) insertIndex++;
      }
      animDrag=null;
      try{ animFrameListEl.releasePointerCapture(e.pointerId); }catch{}
      if(ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
      if(placeholder && placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);
      if(!cancelled){
        moveTimelineFrameInsert(fromIndex,insertIndex);
      }
      syncAnimUI();
    }
    animFrameListEl.addEventListener('pointerdown',(e)=>{
      if(isTimelinePlaying()) return;
      const btn=e.target.closest('.anim-frame-btn');
      if(!btn) return;
      const idx=Number(btn.dataset.index);
      if(!Number.isFinite(idx)) return;
      const pointerId=e.pointerId;
      const startX=e.clientX;
      const startY=e.clientY;
      let started=false;
      let timerId=0;
      if(e.pointerType==='touch'){
        timerId=window.setTimeout(()=>{
          if(started) return;
          started=true;
          animStartDrag(e,btn,idx);
        },220);
      }
      function onMove(ev){
        if(ev.pointerId!==pointerId) return;
        if(isTimelinePlaying()) return;
        if(!started){
          const dx=ev.clientX-startX;
          const dy=ev.clientY-startY;
          if(Math.hypot(dx,dy)>=6){
            started=true;
            if(timerId) window.clearTimeout(timerId);
            animStartDrag(ev,btn,idx);
          }
          return;
        }
        if(!animDrag || animDrag.pointerId!==pointerId) return;
        const ghost=animDrag.ghostEl;
        if(ghost){
          ghost.style.left=`${ev.clientX-animDrag.offsetX}px`;
          ghost.style.top=`${ev.clientY-animDrag.offsetY}px`;
        }
        animPlacePlaceholder(animGetInsertIndex(ev.clientX,ev.clientY));
      }
      function cleanup(){
        if(timerId) window.clearTimeout(timerId);
        window.removeEventListener('pointermove',onMove,true);
        window.removeEventListener('pointerup',onUp,true);
        window.removeEventListener('pointercancel',onCancel,true);
      }
      function onUp(ev){
        if(ev.pointerId!==pointerId) return;
        cleanup();
        if(started) animFinishDrag(ev,false);
      }
      function onCancel(ev){
        if(ev.pointerId!==pointerId) return;
        cleanup();
        if(started) animFinishDrag(ev,true);
      }
      window.addEventListener('pointermove',onMove,true);
      window.addEventListener('pointerup',onUp,true);
      window.addEventListener('pointercancel',onCancel,true);
    });
  }

  if(animMultiSelectEl){
    animMultiSelectEl.addEventListener('click',()=>{
      if(isTimelinePlaying()) return;
      animMultiSelectMode=!animMultiSelectMode;
      if(!animMultiSelectMode){
        setTimelineSelected(new Set([getTimelineIndex()]));
        setTimelineAnchor(getTimelineIndex());
      }else{
        if(getTimelineSelected().size===0) setTimelineSelected(new Set([getTimelineIndex()]));
      }
      syncAnimUI();
    });
  }
  if(animNewFrameEl){
    animNewFrameEl.addEventListener('click',()=>{
      if(isTimelinePlaying()) return;
      const timeline=getTimeline();
      const timelineIndex=getTimelineIndex();
      const cur=timeline[timelineIndex];
      const w=getW()|0;
      const h=getH()|0;
      const next=cur ? cloneTimelineFrame(cur) : { frames:[new Uint8Array(w*h),new Uint8Array(w*h),new Uint8Array(w*h),new Uint8Array(w*h)], delay:360 };
      timeline.splice(timelineIndex+1,0,next);
      setTimelineAnchor(timelineIndex+1);
      setTimelineSelected(new Set([timelineIndex+1]));
      setTimelineIndexAndRender(timelineIndex+1);
    });
  }
  if(animDeleteFrameEl){
    animDeleteFrameEl.addEventListener('click',()=>{
      if(isTimelinePlaying()) return;
      const timeline=getTimeline();
      let timelineIndex=getTimelineIndex();
      if(timeline.length<=1) return;
      let toDelete=[...getTimelineSelected()].filter(i=>i>=0 && i<timeline.length).sort((a,b)=>b-a);
      if(toDelete.length===0) toDelete=[timelineIndex];
      if(toDelete.length>=timeline.length){
        toDelete=toDelete.slice(0,timeline.length-1);
      }
      for(const i of toDelete){
        timeline.splice(i,1);
        const selected=getTimelineSelected();
        const nextSelected=new Set();
        for(const s of selected){
          if(s===i) continue;
          nextSelected.add(s>i?s-1:s);
        }
        setTimelineSelected(nextSelected);
        if(timelineIndex===i) timelineIndex=Math.max(0,Math.min(timelineIndex,timeline.length-1));
        else if(timelineIndex>i) timelineIndex--;
      }
      setTimelineIndex(timelineIndex);
      if(getTimelineSelected().size===0) setTimelineSelected(new Set([timelineIndex]));
      setTimelineAnchor(timelineIndex);
      setTimelineIndexAndRender(timelineIndex);
    });
  }
  if(animDelayEl){
    animDelayEl.addEventListener('change',()=>{
      const timeline=getTimeline();
      const timelineIndex=getTimelineIndex();
      const v=Math.max(30,Number(animDelayEl.value)||0);
      const targets=[...getTimelineSelected()].filter(i=>i>=0 && i<timeline.length);
      if(targets.length===0) targets.push(timelineIndex);
      for(const i of targets){
        const cur=timeline[i];
        if(cur) cur.delay=v;
      }
      syncAnimUI();
    });
  }
  if(animApplyAllDelayEl){
    animApplyAllDelayEl.addEventListener('click',()=>{
      const timeline=getTimeline();
      const v=Math.max(30,Number(animDelayEl && animDelayEl.value)||0);
      if(!v) return;
      for(const cel of timeline){
        cel.delay=v;
      }
      syncAnimUI();
    });
  }
  if(animExportGifEl){
    animExportGifEl.addEventListener('click',()=>{
      exportAnimGif();
    });
  }
  if(animPlayEl){
    animPlayEl.addEventListener('click',()=>{
      if(isTimelinePlaying()) stopTimelinePlayback();
      else startTimelinePlayback();
    });
  }
  if(animPlayCloseEl){
    animPlayCloseEl.addEventListener('click',()=>{
      if(!isTimelinePlaying()) startTimelinePlayback();
      closeAnim({ stopPlayback:false });
    });
  }

  return {
    applyTimelineFrame,
    setTimelineIndexAndRender,
    syncAnimUI,
    stopTimelinePlayback,
    startTimelinePlayback,
  };
}
