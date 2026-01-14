export function createCropController(ctx){
  const {
    containerEl,
    cropBtnEl,
    cropPanelEl,
    cropApplyEl,
    cropCancelEl,
    cropAllowExtendEl,
    cropLeftEl,
    cropRightEl,
    cropTopEl,
    cropBottomEl,
    cropOverlayEl,
    cropOverlayContentEl,
    cropShadeTopEl,
    cropShadeLeftEl,
    cropShadeRightEl,
    cropShadeBottomEl,
    cropRectEl,
    patternPopoverEl,
    patternSelectBtn,
    closeZoomMenu,
    setCanvasPanMode,
    fitCanvasToViewport,
    getCanvasViewScale,
    getW,
    getH,
    setCanvasSize,
    stopAnim,
    stopTimelinePlayback,
    setTimelinePlaying,
    bumpTimelineToken,
    getTimeline,
    getTimelineIndex,
    setTimelineIndex,
    applyTimelineFrame,
    resetHistory,
    applyBackground,
    applyPlaybackMode,
  }=ctx;

  let cropMode=false;
  let cropDraft={ left:0, right:0, top:0, bottom:0 };
  let cropDrag=null;
  let cropDragMoveListener=null;
  let cropDragUpListener=null;

  function clampNum(v,lo,hi){
    const n=Number(v)||0;
    return Math.max(lo,Math.min(hi,n));
  }
  function isCropExtendEnabled(){
    return Boolean(cropAllowExtendEl && cropAllowExtendEl.checked);
  }
  function updateCropInputMins(){
    const W=getW()|0;
    const H=getH()|0;
    const extend=isCropExtendEnabled();
    const minLR=extend ? -Math.max(1,W) : 0;
    const minTB=extend ? -Math.max(1,H) : 0;
    if(cropLeftEl) cropLeftEl.min=String(minLR);
    if(cropRightEl) cropRightEl.min=String(minLR);
    if(cropTopEl) cropTopEl.min=String(minTB);
    if(cropBottomEl) cropBottomEl.min=String(minTB);
  }
  function normalizeCropDraft(draft){
    const W=getW()|0;
    const H=getH()|0;
    let left=(Number(draft?.left)||0);
    let right=(Number(draft?.right)||0);
    let top=(Number(draft?.top)||0);
    let bottom=(Number(draft?.bottom)||0);
    const extend=isCropExtendEnabled();
    const minLR=extend ? -Math.max(1,W) : 0;
    const minTB=extend ? -Math.max(1,H) : 0;
    left=clampNum(left,minLR,W-1);
    right=clampNum(right,minLR,W-1);
    top=clampNum(top,minTB,H-1);
    bottom=clampNum(bottom,minTB,H-1);
    const maxLeft=W-right-1;
    if(left>maxLeft) left=maxLeft;
    const maxRight=W-left-1;
    if(right>maxRight) right=maxRight;
    const maxTop=H-bottom-1;
    if(top>maxTop) top=maxTop;
    const maxBottom=H-top-1;
    if(bottom>maxBottom) bottom=maxBottom;
    return { left:left|0, right:right|0, top:top|0, bottom:bottom|0 };
  }
  function syncCropOverlay(){
    if(!cropOverlayContentEl) return;
    if(!cropShadeTopEl || !cropShadeLeftEl || !cropShadeRightEl || !cropShadeBottomEl || !cropRectEl) return;
    const W=getW()|0;
    const H=getH()|0;
    cropOverlayContentEl.style.width=`${W}px`;
    cropOverlayContentEl.style.height=`${H}px`;
    cropDraft=normalizeCropDraft(cropDraft);
    const rectL=cropDraft.left;
    const rectT=cropDraft.top;
    const rectR=W-cropDraft.right;
    const rectB=H-cropDraft.bottom;
    const clipL=clampNum(rectL,0,W);
    const clipT=clampNum(rectT,0,H);
    const clipR=clampNum(rectR,0,W);
    const clipB=clampNum(rectB,0,H);
    const clipW=Math.max(0,clipR-clipL);
    const clipH=Math.max(0,clipB-clipT);
    cropShadeTopEl.style.left='0px';
    cropShadeTopEl.style.top='0px';
    cropShadeTopEl.style.width=`${W}px`;
    cropShadeTopEl.style.height=`${clipT}px`;
    cropShadeLeftEl.style.left='0px';
    cropShadeLeftEl.style.top=`${clipT}px`;
    cropShadeLeftEl.style.width=`${clipL}px`;
    cropShadeLeftEl.style.height=`${clipH}px`;
    cropShadeRightEl.style.left=`${clipL+clipW}px`;
    cropShadeRightEl.style.top=`${clipT}px`;
    cropShadeRightEl.style.width=`${Math.max(0,W-(clipL+clipW))}px`;
    cropShadeRightEl.style.height=`${clipH}px`;
    cropShadeBottomEl.style.left='0px';
    cropShadeBottomEl.style.top=`${clipT+clipH}px`;
    cropShadeBottomEl.style.width=`${W}px`;
    cropShadeBottomEl.style.height=`${Math.max(0,H-(clipT+clipH))}px`;
    const outW=Math.max(1,(rectR-rectL));
    const outH=Math.max(1,(rectB-rectT));
    cropRectEl.style.left=`${rectL}px`;
    cropRectEl.style.top=`${rectT}px`;
    cropRectEl.style.width=`${outW}px`;
    cropRectEl.style.height=`${outH}px`;
  }
  function syncCropInputs(){
    if(cropLeftEl) cropLeftEl.value=String(cropDraft.left|0);
    if(cropRightEl) cropRightEl.value=String(cropDraft.right|0);
    if(cropTopEl) cropTopEl.value=String(cropDraft.top|0);
    if(cropBottomEl) cropBottomEl.value=String(cropDraft.bottom|0);
  }
  function openCrop(){
    if(!containerEl || cropMode) return;
    cropMode=true;
    containerEl.classList.add('crop-mode');
    if(cropBtnEl) cropBtnEl.classList.add('is-active');
    if(patternPopoverEl){
      patternPopoverEl.classList.remove('is-open');
      if(patternSelectBtn) patternSelectBtn.setAttribute('aria-expanded','false');
    }
    if(closeZoomMenu) closeZoomMenu();
    if(setCanvasPanMode) setCanvasPanMode(false);
    if(fitCanvasToViewport) fitCanvasToViewport();
    if(cropAllowExtendEl) cropAllowExtendEl.checked=false;
    if(cropPanelEl) cropPanelEl.classList.remove('is-extend');
    updateCropInputMins();
    cropDraft=normalizeCropDraft({ left:0, right:0, top:0, bottom:0 });
    syncCropInputs();
    syncCropOverlay();
  }
  function closeCrop(){
    if(!containerEl || !cropMode) return;
    cropMode=false;
    containerEl.classList.remove('crop-mode');
    if(cropBtnEl) cropBtnEl.classList.remove('is-active');
  }
  function cropArray(src,srcW,srcH,left,top,newW,newH){
    const out=new Uint8Array(newW*newH);
    const lx=left|0;
    const ty=top|0;
    for(let y=0;y<newH;y++){
      const sy=y+ty;
      if(sy<0 || sy>=srcH) continue;
      const di=y*newW;
      const srcStartX=Math.max(0,lx);
      const srcEndX=Math.min(srcW,lx+newW);
      const copyW=srcEndX-srcStartX;
      if(copyW<=0) continue;
      const si=sy*srcW+srcStartX;
      const destX=srcStartX-lx;
      out.set(src.subarray(si,si+copyW),di+destX);
    }
    return out;
  }
  function applyCropNow(){
    const W=getW()|0;
    const H=getH()|0;
    cropDraft=normalizeCropDraft(cropDraft);
    const left=cropDraft.left|0;
    const right=cropDraft.right|0;
    const top=cropDraft.top|0;
    const bottom=cropDraft.bottom|0;
    const newW=Math.max(1,W-left-right)|0;
    const newH=Math.max(1,H-top-bottom)|0;
    if(newW===W && newH===H && left===0 && right===0 && top===0 && bottom===0){
      closeCrop();
      return;
    }
    const oldW=W, oldH=H;
    if(stopAnim) stopAnim();
    if(stopTimelinePlayback) stopTimelinePlayback();
    if(setTimelinePlaying) setTimelinePlaying(false);
    if(bumpTimelineToken) bumpTimelineToken();
    const timeline=getTimeline ? getTimeline() : null;
    if(Array.isArray(timeline)){
      for(const cel of timeline){
        if(!cel || !cel.frames) continue;
        const nextFrames=[];
        for(let fi=0;fi<4;fi++){
          const src=cel.frames[fi];
          nextFrames[fi]=cropArray(src,oldW,oldH,left,top,newW,newH);
        }
        cel.frames=nextFrames;
      }
    }
    if(setCanvasSize) setCanvasSize(newW,newH);
    if(setTimelineIndex){
      const len=Array.isArray(timeline)?timeline.length:0;
      const next=Math.max(0,Math.min(len-1,(getTimelineIndex?getTimelineIndex():0)|0));
      setTimelineIndex(next);
      if(applyTimelineFrame) applyTimelineFrame(next);
    }
    if(resetHistory) resetHistory();
    if(applyBackground) applyBackground();
    closeCrop();
    if(fitCanvasToViewport) fitCanvasToViewport();
    if(applyPlaybackMode) applyPlaybackMode();
  }
  function updateCropDraftFromInputs(){
    const raw={
      left: cropLeftEl ? cropLeftEl.value : 0,
      right: cropRightEl ? cropRightEl.value : 0,
      top: cropTopEl ? cropTopEl.value : 0,
      bottom: cropBottomEl ? cropBottomEl.value : 0,
    };
    cropDraft=normalizeCropDraft(raw);
    syncCropInputs();
    syncCropOverlay();
    if(isCropExtendEnabled() && (cropDraft.left<0 || cropDraft.right<0 || cropDraft.top<0 || cropDraft.bottom<0)){
      if(fitCanvasToViewport) fitCanvasToViewport();
    }
  }
  function cropHitTest(clientX,clientY){
    if(!cropMode || !cropRectEl) return null;
    const r=cropRectEl.getBoundingClientRect();
    const hitPad=10;
    const withinX=(clientX>=r.left-hitPad && clientX<=r.right+hitPad);
    const withinY=(clientY>=r.top-hitPad && clientY<=r.bottom+hitPad);
    if(!withinX || !withinY) return null;
    const dL=Math.abs(clientX-r.left);
    const dR=Math.abs(clientX-r.right);
    const dT=Math.abs(clientY-r.top);
    const dB=Math.abs(clientY-r.bottom);
    const onL=dL<=hitPad && clientY>=r.top-hitPad && clientY<=r.bottom+hitPad;
    const onR=dR<=hitPad && clientY>=r.top-hitPad && clientY<=r.bottom+hitPad;
    const onT=dT<=hitPad && clientX>=r.left-hitPad && clientX<=r.right+hitPad;
    const onB=dB<=hitPad && clientX>=r.left-hitPad && clientX<=r.right+hitPad;
    const nearCornerTL=(onL && onT && dL<=hitPad && dT<=hitPad);
    const nearCornerTR=(onR && onT && dR<=hitPad && dT<=hitPad);
    const nearCornerBL=(onL && onB && dL<=hitPad && dB<=hitPad);
    const nearCornerBR=(onR && onB && dR<=hitPad && dB<=hitPad);
    if(nearCornerTL) return { left:true, top:true, right:false, bottom:false };
    if(nearCornerTR) return { left:false, top:true, right:true, bottom:false };
    if(nearCornerBL) return { left:true, top:false, right:false, bottom:true };
    if(nearCornerBR) return { left:false, top:false, right:true, bottom:true };
    if(onL) return { left:true, top:false, right:false, bottom:false };
    if(onR) return { left:false, top:false, right:true, bottom:false };
    if(onT) return { left:false, top:true, right:false, bottom:false };
    if(onB) return { left:false, top:false, right:false, bottom:true };
    return null;
  }
  function cropCursor(hit){
    if(!hit) return 'default';
    const lr=Boolean(hit.left)||Boolean(hit.right);
    const tb=Boolean(hit.top)||Boolean(hit.bottom);
    if(lr && tb){
      const tl=Boolean(hit.left)&&Boolean(hit.top);
      const tr=Boolean(hit.right)&&Boolean(hit.top);
      const bl=Boolean(hit.left)&&Boolean(hit.bottom);
      const br=Boolean(hit.right)&&Boolean(hit.bottom);
      if(tl || br) return 'nwse-resize';
      if(tr || bl) return 'nesw-resize';
      return 'nwse-resize';
    }
    if(lr) return 'ew-resize';
    if(tb) return 'ns-resize';
    return 'default';
  }
  function stopCropDrag(e){
    if(!cropDrag) return;
    if(e && e.pointerId!=null && e.pointerId!==cropDrag.pointerId) return;
    cropDrag=null;
    try{ if(cropDragMoveListener) window.removeEventListener('pointermove',cropDragMoveListener,true); }catch{}
    try{ if(cropDragUpListener) window.removeEventListener('pointerup',cropDragUpListener,true); }catch{}
    try{ if(cropDragUpListener) window.removeEventListener('pointercancel',cropDragUpListener,true); }catch{}
    cropDragMoveListener=null;
    cropDragUpListener=null;
    if(cropOverlayEl) cropOverlayEl.style.cursor='default';
    if(e && cropOverlayEl && e.pointerId!=null){
      try{ cropOverlayEl.releasePointerCapture(e.pointerId); }catch{}
    }
  }

  if(cropBtnEl){
    cropBtnEl.addEventListener('click',()=>{
      if(cropMode) closeCrop();
      else openCrop();
    });
  }
  if(cropCancelEl) cropCancelEl.addEventListener('click',closeCrop);
  if(cropApplyEl) cropApplyEl.addEventListener('click',applyCropNow);
  if(cropAllowExtendEl){
    cropAllowExtendEl.addEventListener('change',()=>{
      if(cropPanelEl){
        if(isCropExtendEnabled()) cropPanelEl.classList.add('is-extend');
        else cropPanelEl.classList.remove('is-extend');
      }
      updateCropInputMins();
      cropDraft=normalizeCropDraft(cropDraft);
      syncCropInputs();
      syncCropOverlay();
      if(fitCanvasToViewport) fitCanvasToViewport();
    });
  }
  for(const el of [cropLeftEl,cropRightEl,cropTopEl,cropBottomEl]){
    if(!el) continue;
    el.addEventListener('input',updateCropDraftFromInputs);
    el.addEventListener('change',updateCropDraftFromInputs);
  }
  window.addEventListener('keydown',(e)=>{
    if(e.key==='Escape' && cropMode) closeCrop();
  });
  if(cropOverlayEl){
    cropOverlayEl.addEventListener('pointermove',(e)=>{
      if(!cropMode || cropDrag) return;
      const hit=cropHitTest(e.clientX,e.clientY);
      cropOverlayEl.style.cursor=cropCursor(hit);
    },{capture:true});
    cropOverlayEl.addEventListener('pointerdown',(e)=>{
      if(!cropMode) return;
      if(e.button!=null && e.button!==0) return;
      const hit=cropHitTest(e.clientX,e.clientY);
      if(!hit) return;
      e.preventDefault();
      cropDraft=normalizeCropDraft(cropDraft);
      cropDrag={
        pointerId:e.pointerId,
        startX:e.clientX,
        startY:e.clientY,
        startDraft:{ ...cropDraft },
        hit,
      };
      cropOverlayEl.style.cursor=cropCursor(hit);
      try{ cropOverlayEl.setPointerCapture(e.pointerId); }catch{}
      if(cropDragMoveListener || cropDragUpListener){
        try{ if(cropDragMoveListener) window.removeEventListener('pointermove',cropDragMoveListener,true); }catch{}
        try{ if(cropDragUpListener) window.removeEventListener('pointerup',cropDragUpListener,true); }catch{}
        try{ if(cropDragUpListener) window.removeEventListener('pointercancel',cropDragUpListener,true); }catch{}
      }
      const onMove=(ev)=>{
        if(!cropDrag) return;
        if(ev.pointerId!==cropDrag.pointerId) return;
        ev.preventDefault();
        const s=(Number(getCanvasViewScale?getCanvasViewScale():1)||1)||1;
        const dx=Math.round((ev.clientX-cropDrag.startX)/s);
        const dy=Math.round((ev.clientY-cropDrag.startY)/s);
        const base=cropDrag.startDraft;
        const next={ ...base };
        if(cropDrag.hit.left) next.left=base.left+dx;
        if(cropDrag.hit.right) next.right=base.right-dx;
        if(cropDrag.hit.top) next.top=base.top+dy;
        if(cropDrag.hit.bottom) next.bottom=base.bottom-dy;
        cropDraft=normalizeCropDraft(next);
        syncCropInputs();
        syncCropOverlay();
        if(isCropExtendEnabled() && (cropDraft.left<0 || cropDraft.right<0 || cropDraft.top<0 || cropDraft.bottom<0)){
          if(fitCanvasToViewport) fitCanvasToViewport();
        }
      };
      const onUp=(ev)=>{
        if(!cropDrag) return;
        if(ev.pointerId!==cropDrag.pointerId) return;
        stopCropDrag(ev);
      };
      cropDragMoveListener=onMove;
      cropDragUpListener=onUp;
      window.addEventListener('pointermove',onMove,true);
      window.addEventListener('pointerup',onUp,true);
      window.addEventListener('pointercancel',onUp,true);
    },{capture:true});
    cropOverlayEl.addEventListener('pointerup',stopCropDrag,{capture:true});
    cropOverlayEl.addEventListener('pointercancel',stopCropDrag,{capture:true});
    cropOverlayEl.addEventListener('pointerleave',()=>{
      if(!cropMode || cropDrag) return;
      cropOverlayEl.style.cursor='default';
    },{capture:true});
  }

  return {
    isActive: ()=>cropMode,
    open: openCrop,
    close: closeCrop,
    sync: ()=>{
      updateCropInputMins();
      cropDraft=normalizeCropDraft(cropDraft);
      syncCropInputs();
      syncCropOverlay();
    },
  };
}

