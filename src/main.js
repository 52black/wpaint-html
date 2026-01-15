import { hexToRGB, u8ToB64, b64ToU8 } from './utils.js';
import { exportGif as exportGifFile, decodeGifFileToIndexedFrames } from './gif.js';
import { downloadWpaintProject, readWpaintProjectFile } from './wpaintProject.js';
import { createCropController } from './crop.js';
import { createTimelineController } from './timelineUI.js';
import { createHistoryController } from './history.js';
import { clamp, openModal, closeModal, makeModalDraggable } from './modal.js';
import { createPatternController } from './patterns.js';
const stageEl=document.getElementById('stage');
const containerEl=document.querySelector('.container');
const zoomBtnEl=document.getElementById('zoomBtn');
const zoomMenuEl=document.getElementById('zoomMenu');
const touchHintEl=document.getElementById('touchHint');
let touchHintTimer=null;
let touchHintPointerId=null;
let touchHintHoldTimer=null;
function showTouchHint(text,{ sticky=false }={}){
  if(!touchHintEl) return;
  const t=String(text||'').trim();
  if(!t){
    touchHintEl.classList.remove('is-visible');
    touchHintEl.textContent='';
    return;
  }
  touchHintEl.textContent=t;
  touchHintEl.classList.add('is-visible');
  if(touchHintTimer!=null) window.clearTimeout(touchHintTimer);
  touchHintTimer=null;
  if(!sticky){
    touchHintTimer=window.setTimeout(()=>{
      touchHintEl.classList.remove('is-visible');
    },900);
  }
}
function hideTouchHint(){
  if(!touchHintEl) return;
  touchHintEl.classList.remove('is-visible');
  if(touchHintTimer!=null) window.clearTimeout(touchHintTimer);
  touchHintTimer=null;
  if(touchHintHoldTimer!=null) window.clearTimeout(touchHintHoldTimer);
  touchHintHoldTimer=null;
  touchHintPointerId=null;
}
function bindTouchHintForButtons(){
  if(!touchHintEl) return;
  if(touchHintEl.parentNode!==document.body) document.body.appendChild(touchHintEl);
  const HOLD_MS=160;
  const onDown=(e)=>{
    if(e.pointerType!=='touch') return;
    if(e.button!=null && e.button!==0) return;
    if(touchHintPointerId!=null) return;
    const btn=e.currentTarget;
    if(!(btn instanceof Element)) return;
    const label=btn.getAttribute('aria-label') || btn.getAttribute('title') || '';
    if(!label) return;
    touchHintPointerId=e.pointerId;
    if(touchHintHoldTimer!=null) window.clearTimeout(touchHintHoldTimer);
    touchHintHoldTimer=window.setTimeout(()=>{
      if(touchHintPointerId!==e.pointerId) return;
      showTouchHint(label,{ sticky:true });
    },HOLD_MS);
    try{ btn.setPointerCapture(e.pointerId); }catch{}
  };
  const onUp=(e)=>{
    if(touchHintPointerId==null) return;
    if(e.pointerId!==touchHintPointerId) return;
    const btn=e.currentTarget;
    try{ if(btn && btn.releasePointerCapture) btn.releasePointerCapture(e.pointerId); }catch{}
    hideTouchHint();
  };
  const btns=[...document.querySelectorAll('button,[role="button"]')];
  for(const btn of btns){
    btn.addEventListener('pointerdown',onDown);
    btn.addEventListener('pointerup',onUp);
    btn.addEventListener('pointercancel',onUp);
  }
}
bindTouchHintForButtons();
let bodyScrollLock=null;
function lockBodyScroll(){
  if(bodyScrollLock) return;
  const y=window.scrollY || window.pageYOffset || 0;
  bodyScrollLock={ y };
  const body=document.body;
  if(!body) return;
  body.style.position='fixed';
  body.style.top=`${-y}px`;
  body.style.left='0';
  body.style.right='0';
  body.style.width='100%';
}
function unlockBodyScroll(){
  if(!bodyScrollLock) return;
  const y=bodyScrollLock.y|0;
  bodyScrollLock=null;
  const body=document.body;
  if(!body) return;
  body.style.position='';
  body.style.top='';
  body.style.left='';
  body.style.right='';
  body.style.width='';
  try{ window.scrollTo(0,y); }catch{}
}

function isSoftKeyboardTarget(el){
  if(!(el instanceof HTMLElement)) return false;
  if(el.isContentEditable) return true;
  const tag=el.tagName;
  if(tag==='INPUT' || tag==='TEXTAREA' || tag==='SELECT') return true;
  return false;
}

function applyStageScale(){
  const ae=document.activeElement;
  const softKeyboardOpen=isSoftKeyboardTarget(ae);
  const vv=window.visualViewport;
  const vw=(vv && Number.isFinite(vv.width) && vv.width>0) ? vv.width : (document.documentElement && document.documentElement.clientWidth) ? document.documentElement.clientWidth : (window.innerWidth||0);
  const vh=(vv && Number.isFinite(vv.height) && vv.height>0) ? vv.height : (document.documentElement && document.documentElement.clientHeight) ? document.documentElement.clientHeight : (window.innerHeight||0);
  if(!softKeyboardOpen){
    applyStageScale.stableViewport={ vw, vh };
  }else{
    const stable=applyStageScale.stableViewport;
    if(stable && Number.isFinite(stable.vw) && Number.isFinite(stable.vh) && stable.vw>0 && stable.vh>0){
      return applyStageScaleWithViewport(stable.vw,stable.vh);
    }
  }
  return applyStageScaleWithViewport(vw,vh);
}

function applyStageScaleWithViewport(vw,vh){
  const pad=16;
  const s=Math.min((vw-pad)/512,(vh-pad)/342);
  const scale=clamp((Number.isFinite(s)&&s>0)?s:1,0.2,3);
  if(stageEl){
    stageEl.style.width=`${Math.round(512*scale)}px`;
    stageEl.style.height=`${Math.round(342*scale)}px`;
  }
  if(containerEl){
    containerEl.style.transform=`scale(${scale})`;
  }
  if(zoomBtnEl){
    const open=Boolean(zoomMenuEl && zoomMenuEl.classList.contains('is-open'));
    zoomBtnEl.classList.toggle('is-active',open);
    zoomBtnEl.setAttribute('aria-expanded',open?'true':'false');
  }
}
applyStageScale();
window.addEventListener('resize',applyStageScale);
window.addEventListener('orientationchange',applyStageScale);
window.addEventListener('load',()=>window.requestAnimationFrame(applyStageScale));
if(window.visualViewport){
  window.visualViewport.addEventListener('resize',applyStageScale);
  window.visualViewport.addEventListener('scroll',applyStageScale);
}
window.requestAnimationFrame(applyStageScale);

document.addEventListener('focusin',(e)=>{
  const target=e.target;
  if(!isSoftKeyboardTarget(target)) return;
  if(!(target instanceof HTMLElement) || !target.closest('.jitter-panel')) return;
  lockBodyScroll();
  applyStageScale();
});
document.addEventListener('focusout',(e)=>{
  const target=e.target;
  if(!isSoftKeyboardTarget(target)) return;
  if(!(target instanceof HTMLElement) || !target.closest('.jitter-panel')) return;
  window.setTimeout(()=>{
    const ae=document.activeElement;
    if(ae instanceof HTMLElement && ae.closest('.jitter-panel') && isSoftKeyboardTarget(ae)) return;
    unlockBodyScroll();
    applyStageScale();
  },0);
});
// ===== 画布/数据模型 =====
// 为了实现“沸腾抖动”的播放效果，这里用 4 帧像素数据来表示同一张画。
// - 帧 0/1/2：抖动模式下循环播放（会对每段新线条端点做随机偏移）
// - 帧 3：稳定帧（不抖动），用于非抖动显示与换色界面预览
// 每个像素存的是 0~16 的“颜色值”，渲染时再用颜色映射表把它变成真正的颜色。
// 约定：0 是“透明/橡皮擦”，不参与换色；1~16 才是可换色的调色板。
const canvas=document.getElementById('drawing');
const canvasViewportEl=document.getElementById('canvasViewport');
const canvasBgEl=document.getElementById('canvasBg');
const ctx=canvas.getContext('2d');
let W=canvas.width,H=canvas.height;
const MAX_COLOR_INDEX=21;
const BASE_COLOR_COUNT=16;
const OUTLINE_FIRST=17;
const OUTLINE_LAST=21;
const frames=[
  new Uint8Array(W*H),
  new Uint8Array(W*H),
  new Uint8Array(W*H),
  new Uint8Array(W*H),
];
let timeline=[{ frames:[frames[0],frames[1],frames[2],frames[3]], delay:360 }];
let timelineIndex=0;
let timelineToken=0;
let timelineAnchor=0;
let timelineSelected=new Set([0]);
// 颜色映射：值 0~16 -> 颜色
// 约定：值 1 为背景色，值 2 为前景色（第一只笔）
const defaultColors=['#000000','#fafafa','#4b4b4b','#d4d4d4','#9d9d9d','#f9d381','#eaaf4d','#f9938a','#e75952','#9ad1f9','#58aeee','#8deda7','#44c55b','#c3a7e1','#9569c8','#bab5aa','#948e82','#000000','#000000','#000000','#000000','#000000'];
const colorMap=defaultColors.slice();
let currentTool='pencil';
let paletteValue=2;
let jitterLevel=0;
let displayFrame=3;
let animId=null;
let drawing=false;
let drawingPointerId=null;
let last=null;
let cropController=null;
let activeSchemeId='';
function isCropMode(){
  return Boolean(cropController && cropController.isActive());
}
function openCrop(){
  if(cropController) cropController.open();
}
function closeCrop(){
  if(cropController) cropController.close();
}
const penBtn=document.getElementById('pen');
const pen2Btn=document.getElementById('pen2');
const blobbyBtn=document.getElementById('blobby');
const stippleTinyBtn=document.getElementById('stippleTiny');
const softLrgBtn=document.getElementById('softLrg');
const eraserBtn=document.getElementById('eraser');
const clearBtn=document.getElementById('clear');
const resizeModalEl=document.getElementById('resizeModal');
const resizeCloseEl=document.getElementById('resizeClose');
const resizeCancelEl=document.getElementById('resizeCancel');
const resizeApplyEl=document.getElementById('resizeApply');
const resizeWEl=document.getElementById('resizeW');
const resizeHEl=document.getElementById('resizeH');
const undoBtn=document.getElementById('undo');
const redoBtn=document.getElementById('redo');
const exportGifBtn=document.getElementById('exportGif');
const importGifBtn=document.getElementById('importGif');
const importBgBtn=document.getElementById('importBg');
const openProjectBtn=document.getElementById('openProject');
const saveAsBtn=document.getElementById('saveAs');
const clearBgBtn=document.getElementById('clearBg');
const advancedBtn=document.getElementById('advanced');
const separateOutlineEl=document.getElementById('separateOutline');
const protectOutlineEl=document.getElementById('protectOutline');
const outlineColorsEl=document.getElementById('outlineColors');
const paletteToolsEl=document.getElementById('paletteTools');
const paletteMoreToggleEl=document.getElementById('paletteMoreToggle');
const paletteCollapseEl=document.getElementById('paletteCollapse');
let paletteExpanded=false;
function setPaletteExpanded(expanded){
  paletteExpanded=Boolean(expanded);
  if(containerEl){
    containerEl.classList.toggle('palette-expanded',paletteExpanded);
    containerEl.classList.toggle('palette-compact',!paletteExpanded);
  }
  if(paletteMoreToggleEl) paletteMoreToggleEl.style.display=paletteExpanded?'none':'';
  if(paletteCollapseEl) paletteCollapseEl.style.display=paletteExpanded?'':'none';
}
if(containerEl) containerEl.classList.add('palette-compact');
if(paletteMoreToggleEl){
  paletteMoreToggleEl.addEventListener('click',()=>{
    setPaletteExpanded(true);
  });
}
if(paletteCollapseEl){
  paletteCollapseEl.addEventListener('click',()=>{
    setPaletteExpanded(false);
  });
}
const patternPickerEl=document.querySelector('.pattern-picker');
const patternSelectBtn=document.getElementById('patternSelect');
const patternSelectLabelEl=document.getElementById('patternSelectLabel');
const patternThumbCanvas=document.getElementById('patternThumb');
const patternThumbCtx=patternThumbCanvas.getContext('2d');
patternThumbCtx.imageSmoothingEnabled=false;
const patternPopoverEl=document.getElementById('patternPopover');
const patternListEl=document.getElementById('patternList');
const patternEditEl=document.getElementById('patternEdit');
const patternPreviewCanvas=document.getElementById('patternPreview');
const patternPreviewCtx=patternPreviewCanvas.getContext('2d');
patternPreviewCtx.imageSmoothingEnabled=false;
const patternUploadBtn=document.getElementById('patternUpload');
const patternDeleteBtn=document.getElementById('patternDelete');
const patternInvertBtn=document.getElementById('patternInvert');
const patternConfirmBtn=document.getElementById('patternConfirm');
const patternFileEl=document.getElementById('patternFile');
const gifFileEl=document.getElementById('gifFile');
const wpaintFileEl=document.getElementById('wpaintFile');
const bgFileEl=document.getElementById('bgFile');
const cropBtnEl=document.getElementById('cropBtn');
const cropPanelEl=document.getElementById('cropPanel');
const cropApplyEl=document.getElementById('cropApply');
const cropAutoEl=document.getElementById('cropAuto');
const cropCancelEl=document.getElementById('cropCancel');
const cropAllowExtendEl=document.getElementById('cropAllowExtend');
const cropLeftEl=document.getElementById('cropLeft');
const cropRightEl=document.getElementById('cropRight');
const cropTopEl=document.getElementById('cropTop');
const cropBottomEl=document.getElementById('cropBottom');
const cropOverlayEl=document.getElementById('cropOverlay');
const cropOverlayContentEl=document.getElementById('cropOverlayContent');
const cropShadeTopEl=document.getElementById('cropShadeTop');
const cropShadeLeftEl=document.getElementById('cropShadeLeft');
const cropShadeRightEl=document.getElementById('cropShadeRight');
const cropShadeBottomEl=document.getElementById('cropShadeBottom');
const cropRectEl=document.getElementById('cropRect');
const selectBtnEl=document.getElementById('selectBtn');
const selectPanelEl=document.getElementById('selectPanel');
const selectCopyEl=document.getElementById('selectCopy');
const selectCutEl=document.getElementById('selectCut');
const selectPasteEl=document.getElementById('selectPaste');
const selectUndoEl=document.getElementById('selectUndo');
const selectRedoEl=document.getElementById('selectRedo');
const selectKeepRatioEl=document.getElementById('selectKeepRatio');
const selectTransparentEl=document.getElementById('selectTransparent');
const selectClearEl=document.getElementById('selectClear');
const selectExitEl=document.getElementById('selectExit');
const selectOverlayEl=document.getElementById('selectOverlay');
const selectOverlayContentEl=document.getElementById('selectOverlayContent');
const selectRectEl=document.getElementById('selectRect');
const selectHandleEls=selectOverlayEl ? [...selectOverlayEl.querySelectorAll('.select-handle')] : [];
const layerBtnEl=document.getElementById('layerBtn');
const layerPanelEl=document.getElementById('layerPanel');
const layerExitEl=document.getElementById('layerExit');
const layerAddEl=document.getElementById('layerAdd');
const layerDeleteEl=document.getElementById('layerDelete');
const layerUpEl=document.getElementById('layerUp');
const layerDownEl=document.getElementById('layerDown');
const layerMergeDownEl=document.getElementById('layerMergeDown');
const layerListEl=document.getElementById('layerList');
let customBgUrl='';
const outlineColorStore=Array.from({length: MAX_COLOR_INDEX+1},()=>null);
for(let i=OUTLINE_FIRST;i<=OUTLINE_LAST;i++){
  outlineColorStore[i]=colorMap[i] ?? colorMap[2];
}
function syncOutlineColorMap(){
  const separate=Boolean(separateOutlineEl && separateOutlineEl.checked);
  for(let i=OUTLINE_FIRST;i<=OUTLINE_LAST;i++){
    colorMap[i]=separate ? (outlineColorStore[i] ?? colorMap[2]) : colorMap[2];
  }
}
syncOutlineColorMap();
const toolSettings={
  eraser:{ size:11 },
  pencil:{ size:1 },
  pen:{ size:3 },
  palette:{ size:32 },
  blobby:{ size:9 },
  stippleTiny:{ size:5 },
  softLrg:{ size:15 },
};
const sizeEl=document.getElementById('size');
const sizeValueEl=document.getElementById('sizeValue');
const MAX_HISTORY=80;
const historyController=createHistoryController({
  frames,
  undoBtn,
  redoBtn,
  renderCurrent,
  maxHistory: MAX_HISTORY,
  bindHotkeys: false,
  captureSnapshot: ()=>{
    const idx=timelineIndex|0;
    const cel=(Array.isArray(timeline) && timeline[idx]) ? timeline[idx] : null;
    if(!cel) return { timelineIndex: idx, activeLayerIndex: activeLayerIndex|0, cel: null };
    ensureCelModel(cel);
    return { timelineIndex: idx, activeLayerIndex: activeLayerIndex|0, cel: cloneCelDeep(cel) };
  },
  applySnapshot: (snapshot)=>{
    if(!snapshot || !Array.isArray(timeline) || timeline.length===0) return;
    const idx=clamp(Number(snapshot.timelineIndex)||0,0,Math.max(0,timeline.length-1));
    const nextCel=snapshot.cel;
    if(nextCel) timeline[idx]=nextCel;
    timelineIndex=idx;
    timelineSelected=new Set([idx]);
    timelineAnchor=idx;
    activeLayerIndex=Number(snapshot.activeLayerIndex)||0;
    applyTimelineFrame(idx);
    syncAnimUI();
    syncLayerUI();
  },
});
function syncHistoryUI(){ return historyController.syncUI(); }
function pushHistory(){ return historyController.pushHistory(); }
function undo(){ return historyController.undo(); }
function redo(){ return historyController.redo(); }
function resetHistory(){ return historyController.reset(); }
function setTool(tool){
  // 切换当前工具，并同步 UI（激活态/粗细/抖动可用性）
  if(canvasPanMode) setCanvasPanMode(false);
  if(isCropMode()) closeCrop();
  currentTool=tool;
  penBtn.classList.toggle('is-active',tool==='pencil');
  pen2Btn.classList.toggle('is-active',tool==='pen');
  blobbyBtn.classList.toggle('is-active',tool==='blobby');
  stippleTinyBtn.classList.toggle('is-active',tool==='stippleTiny');
  softLrgBtn.classList.toggle('is-active',tool==='softLrg');
  eraserBtn.classList.toggle('is-active',tool==='eraser');
  const maxSize=getToolMaxSize(tool);
  if(sizeEl) sizeEl.max=String(maxSize);
  const nextSize=clampToolSize(toolSettings[tool]?.size ?? 1,tool);
  if(!toolSettings[tool]) toolSettings[tool]={ size:1 };
  toolSettings[tool].size=nextSize;
  sizeEl.value=String(nextSize);
  sizeValueEl.textContent=String(nextSize);
  const erasing=tool==='eraser';
  jitter.disabled=erasing;
  jitterValue.style.opacity=erasing?'.5':'1';
  if(jitterControlsEl && eraserControlsEl){
    jitterControlsEl.style.display=erasing?'none':'block';
    eraserControlsEl.style.display=erasing?'block':'none';
  }
  syncPaletteButtonsActive();
}
function getPaintValue(){
  if(currentTool==='eraser') return 0;
  if(currentTool==='pencil') return 17;
  if(currentTool==='pen') return 18;
  if(currentTool==='blobby') return 19;
  if(currentTool==='stippleTiny') return 20;
  if(currentTool==='softLrg') return 21;
  return paletteValue;
}
function getPos(e){
  // 把鼠标坐标换算到 canvas 像素坐标（避免缩放导致的偏差）
  const rect=canvas.getBoundingClientRect();
  const x=Math.round((e.clientX-rect.left)*(canvas.width/rect.width));
  const y=Math.round((e.clientY-rect.top)*(canvas.height/rect.height));
  return {x,y};
}
function setPixel(frame,x,y,val){
  if(x<0||y<0||x>=W||y>=H) return;
  const v=val|0;
  const idx=y*W+x;
  const next=(v<0?0:(v>MAX_COLOR_INDEX?MAX_COLOR_INDEX:v));
  if(next===0 && currentTool==='eraser'){
    const cur=frame[idx];
    const isOutline=(cur>=OUTLINE_FIRST && cur<=OUTLINE_LAST);
    if(eraseOnlyOutlineEl && eraseOnlyOutlineEl.checked && !isOutline) return;
    if(eraseOnlyEraserEl && eraseOnlyEraserEl.checked && isOutline) return;
  }
  if(protectOutlineEl && protectOutlineEl.checked){
    const cur=frame[idx];
    const curIsOutline=(cur>=OUTLINE_FIRST && cur<=OUTLINE_LAST);
    const nextIsOutline=(next>=OUTLINE_FIRST && next<=OUTLINE_LAST);
    if(curIsOutline && !nextIsOutline && next!==0) return;
  }
  frame[idx]=next;
}
function stamp(frame,x,y,val,size){
  // 把“粗细”转换成一个圆形像素章，盖到当前帧上
  const r=Math.floor(size/2);
  if(r<=0){ setPixel(frame,x,y,val); return; }
  const r2=r*r;
  for(let dy=-r;dy<=r;dy++){
    const yy=y+dy;
    if(yy<0||yy>=H) continue;
    for(let dx=-r;dx<=r;dx++){
      if(dx*dx+dy*dy>r2) continue;
      const xx=x+dx;
      if(xx<0||xx>=W) continue;
      setPixel(frame,xx,yy,val);
    }
  }
}
function stampPattern(frame,x,y,val,size,brush){
  const w=brush.w, h=brush.h;
  const mask=brush.mask;
  const s=Math.max(1,size|0);
  const left=x-Math.floor(s/2);
  const top=y-Math.floor(s/2);
  for(let oy=0;oy<s;oy++){
    const my=Math.floor(oy*h/s);
    for(let ox=0;ox<s;ox++){
      const mx=Math.floor(ox*w/s);
      if(mask[my*w+mx]!==1) continue;
      setPixel(frame,left+ox,top+oy,val);
    }
  }
}
const patternController=createPatternController({
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
  patternDeleteBtn,
  patternInvertBtn,
  patternConfirmBtn,
  patternFileEl,
});
function getToolMaxSize(tool){
  if(tool==='palette') return 64;
  return 31;
}
function clampToolSize(n,tool){
  const v=n|0;
  const max=getToolMaxSize(tool);
  if(v<1) return 1;
  if(v>max) return max;
  return v;
}
const STIPPLE_TINY_BRUSHES=[
  { w:4, h:4, mask:new Uint8Array([1,0,0,0, 0,0,1,0, 0,1,0,0, 0,0,0,1]) },
  { w:4, h:4, mask:new Uint8Array([0,1,0,0, 0,0,0,1, 1,0,0,0, 0,0,1,0]) },
  { w:4, h:4, mask:new Uint8Array([0,0,1,0, 1,0,0,0, 0,0,0,1, 0,1,0,0]) },
  { w:4, h:4, mask:new Uint8Array([0,0,0,1, 0,1,0,0, 0,0,1,0, 1,0,0,0]) },
  { w:4, h:4, mask:new Uint8Array([1,0,1,0, 0,0,0,0, 0,1,0,1, 0,0,0,0]) },
  { w:4, h:4, mask:new Uint8Array([0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,1]) },
  { w:4, h:4, mask:new Uint8Array([0,1,0,1, 0,0,0,0, 1,0,1,0, 0,0,0,0]) },
  { w:4, h:4, mask:new Uint8Array([0,0,1,0, 0,0,0,0, 1,0,0,1, 0,0,0,0]) },
];
const SOFT_LRG_POINT_SETS=[
  [[5,1],[4,10],[9,10],[10,1]],[[12,2],[8,13],[7,14],[4,13]],[[4,9],[7,10],[12,9],[14,4]],[[4,3],[9,2],[9,8],[6,8]],
  [[13,9],[7,9],[13,5],[11,9]],[[10,12],[8,3],[11,7],[3,7]],[[1,9],[6,2],[4,12],[3,6]],[[5,14],[8,14],[11,12],[15,5]],
  [[1,3],[11,1],[3,4],[2,5]],[[3,11],[5,4],[10,3],[0,8]],[[14,9],[11,5],[10,8],[8,4]],[[11,2],[10,0],[2,10],[11,14]],
  [[5,7],[14,5],[0,9],[4,2]],[[1,7],[13,4],[2,3],[13,3]],[[3,14],[3,10],[7,4],[12,8]],[[6,0],[3,9],[1,8],[12,7]],
  [[4,14],[14,10],[5,0],[9,3]],[[14,3],[3,12],[11,3],[9,1]],[[3,3],[13,6],[2,12],[7,6]],[[3,2],[11,8],[4,8],[8,0]],
  [[7,2],[2,4],[8,11],[12,10]],[[8,1],[9,7],[8,12],[13,7]],[[15,7],[13,8],[10,11],[2,2]],[[6,1],[8,6],[8,7],[0,6]],
  [[4,4],[10,2],[4,1],[4,5]],[[5,2],[6,10],[14,6],[9,4]],[[5,5],[10,6],[5,3],[7,13]],[[12,13],[3,1],[14,8],[5,12]],
  [[5,15],[8,15],[11,6],[12,11]],[[3,8],[12,14],[6,9],[6,5]],[[0,7],[3,5],[7,11],[1,6]],[[6,7],[4,6],[12,6],[2,11]],
  [[13,2],[6,3],[10,9],[10,4]],[[6,15],[8,9],[13,10],[8,8]],[[8,5],[10,5],[5,11],[15,6]],[[4,7],[0,10],[8,2],[10,13]],
  [[11,4],[13,11],[14,11],[5,10]],[[12,1],[7,7],[14,7],[14,12]],[[6,11],[5,9],[3,13],[9,13]],[[7,8],[10,10],[7,3],[7,15]],
  [[9,11],[6,6],[4,11],[2,13]],[[7,12],[11,11],[9,14],[7,1]],[[15,10],[2,8],[1,5],[9,0]],[[15,8],[10,14],[10,7],[9,12]],
  [[1,10],[9,5],[15,9],[1,11]],[[0,5],[6,14],[1,4],[7,5]],[[1,12],[9,15],[10,15],[5,8]],[[5,6],[12,12],[11,10],[12,3]],
  [[9,6],[6,12],[7,0],[12,5]],[[11,13],[8,10],[2,7],[6,13]],[[13,13],[9,9],[2,9],[12,4]],[[5,13],[13,12],[2,6],[6,4]],
];
function buildSoftLrgBrushes(){
  const out=[];
  for(const set of SOFT_LRG_POINT_SETS){
    const mask=new Uint8Array(16*16);
    for(const p of set){
      const x=p[0]|0;
      const y=p[1]|0;
      if(x<0||y<0||x>=16||y>=16) continue;
      mask[y*16+x]=1;
    }
    out.push({ w:16, h:16, mask });
  }
  return out;
}
const SOFT_LRG_BRUSHES=buildSoftLrgBrushes();
function stampTool(frame,x,y,val,tool,deltaMag){
  const baseSize=toolSettings[tool]?.size ?? 1;
  if(tool==='blobby'){
    const bump=Math.min(14,Math.round((deltaMag||0)*0.5));
    const s=clampToolSize(baseSize+bump,tool);
    stamp(frame,x,y,val,s);
    return;
  }
  if(tool==='stippleTiny'){
    const brush=STIPPLE_TINY_BRUSHES[(Math.random()*STIPPLE_TINY_BRUSHES.length)|0];
    stampPattern(frame,x,y,val,clampToolSize(baseSize,tool),brush);
    return;
  }
  if(tool==='softLrg'){
    const brush=SOFT_LRG_BRUSHES[(Math.random()*SOFT_LRG_BRUSHES.length)|0];
    stampPattern(frame,x,y,val,clampToolSize(baseSize,tool),brush);
    return;
  }
  stamp(frame,x,y,val,clampToolSize(baseSize,tool));
}
function drawLineTool(frame,a,b,val,tool){
  const dx=b.x-a.x;
  const dy=b.y-a.y;
  const steps=Math.max(Math.abs(dx),Math.abs(dy));
  const deltaMag=Math.hypot(dx,dy);
  if(steps===0){
    stampTool(frame,a.x,a.y,val,tool,deltaMag);
    return;
  }
  for(let i=0;i<=steps;i++){
    const t=i/steps;
    const x=Math.round(a.x+t*dx);
    const y=Math.round(a.y+t*dy);
    stampTool(frame,x,y,val,tool,deltaMag);
  }
}
function drawLineValue(frame,a,b,val,size){
  // 线段离散为很多个像素点，每个点用 stamp 来保证粗细
  const dx=b.x-a.x,dy=b.y-a.y;
  const steps=Math.max(Math.abs(dx),Math.abs(dy));
  if(steps===0){ stamp(frame,a.x,a.y,val,size); return; }
  for(let i=0;i<=steps;i++){
    const t=i/steps;
    const x=Math.round(a.x+t*dx);
    const y=Math.round(a.y+t*dy);
    stamp(frame,x,y,val,size);
  }
}
function randOffset(maxAbs){
  return Math.round((Math.random()*2-1)*maxAbs);
}
let jitterStrokeId=1;
let jitterSegId=0;
function hash32(n){
  let x=n|0;
  x=Math.imul(x^(x>>>16),0x45d9f3b);
  x=Math.imul(x^(x>>>16),0x45d9f3b);
  x=(x^(x>>>16))>>>0;
  return x;
}
function jitterOffset(seed,maxAbs){
  if(maxAbs<=0) return 0;
  const span=maxAbs*2+1;
  return (hash32(seed)%span)-maxAbs;
}
function nextJitterBase(){
  return ((jitterStrokeId&0xffff)<<16) ^ (jitterSegId++ & 0xffff);
}
function makeFrameOffsets(base,maxAbs){
  const out=[];
  for(let fi=0;fi<3;fi++){
    const dx=jitterOffset(base+fi*131,maxAbs);
    const dy=jitterOffset(base+fi*131+77,maxAbs);
    out.push({dx,dy});
  }
  if(maxAbs>0){
    const fix=[{dx:-maxAbs,dy:0},{dx:0,dy:maxAbs},{dx:maxAbs,dy:0}];
    const allSame=out[0].dx===out[1].dx && out[0].dy===out[1].dy && out[0].dx===out[2].dx && out[0].dy===out[2].dy;
    if(allSame){
      out[0]=fix[0]; out[1]=fix[1]; out[2]=fix[2];
    }else{
      for(let i=0;i<3;i++){
        for(let j=0;j<i;j++){
          if(out[i].dx===out[j].dx && out[i].dy===out[j].dy){
            out[i]=fix[i];
          }
        }
      }
    }
  }
  return out;
}
function render(frame){
  // 把“颜色值帧”渲染成 RGBA 像素；值 0 代表透明
  const img=ctx.createImageData(W,H);
  const data=img.data;
  for(let i=0;i<frame.length;i++){
    const val=frame[i];
    const o=i*4;
    if(val===0){
      data[o]=0; data[o+1]=0; data[o+2]=0; data[o+3]=0;
    }else{
      const [r,g,b]=hexToRGB(colorMap[val]);
      data[o]=r; data[o+1]=g; data[o+2]=b; data[o+3]=255;
    }
  }
  ctx.putImageData(img,0,0);
}
const previewCanvas=document.getElementById('preview');
const previewCtx=previewCanvas.getContext('2d');
previewCtx.imageSmoothingEnabled=false;
let activeLayerIndex=0;
let compositeDirty=true;
let compositeScratchFrame=null;
const bayer4=new Uint8Array([0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5]);
let ditherMask=null;
function rebuildDitherMask(){
  const len=(W*H)|0;
  if(!ditherMask || ditherMask.length!==len) ditherMask=new Uint8Array(len);
  for(let y=0;y<H;y++){
    const row=y*W;
    const by=(y&3)<<2;
    for(let x=0;x<W;x++){
      ditherMask[row+x]=bayer4[by+(x&3)];
    }
  }
}
function markCompositeDirty(){ compositeDirty=true; }
function getCurrentCel(){
  if(!Array.isArray(timeline)) return null;
  return timeline[timelineIndex|0] || null;
}
function ensureCelModel(cel){
  if(!cel || typeof cel!=='object') return null;
  const len=(W*H)|0;
  if(!Array.isArray(cel.layers) || cel.layers.length===0){
    const legacy=Array.isArray(cel.frames) && cel.frames.length===4 ? cel.frames : null;
    const baseFrames=[0,1,2,3].map(i=>{
      const f=legacy && legacy[i];
      return (f instanceof Uint8Array && f.length===len) ? new Uint8Array(f) : new Uint8Array(len);
    });
    cel.layers=[{ name:'图层1', visible:true, opacity: 100, frames: baseFrames }];
  }
  for(let li=0;li<cel.layers.length;li++){
    const layer=cel.layers[li] || {};
    if(typeof layer.name!=='string' || !layer.name) layer.name=`图层${li+1}`;
    layer.visible=layer.visible!==false;
    if(layer.opacity==null) layer.opacity=100;
    layer.opacity=Math.max(0,Math.min(100,Number(layer.opacity)||0));
    if(!Array.isArray(layer.frames) || layer.frames.length!==4) layer.frames=[new Uint8Array(len),new Uint8Array(len),new Uint8Array(len),new Uint8Array(len)];
    for(let fi=0;fi<4;fi++){
      const f=layer.frames[fi];
      if(!(f instanceof Uint8Array) || f.length!==len) layer.frames[fi]=new Uint8Array(len);
    }
    cel.layers[li]=layer;
  }
  if(!Array.isArray(cel.frames) || cel.frames.length!==4) cel.frames=[new Uint8Array(len),new Uint8Array(len),new Uint8Array(len),new Uint8Array(len)];
  for(let fi=0;fi<4;fi++){
    const f=cel.frames[fi];
    if(!(f instanceof Uint8Array) || f.length!==len) cel.frames[fi]=new Uint8Array(len);
  }
  for(let li=0;li<cel.layers.length;li++){
    const layer=cel.layers[li];
    for(let fi=0;fi<4;fi++){
      if(layer.frames[fi]===cel.frames[fi]) layer.frames[fi]=new Uint8Array(layer.frames[fi]);
    }
  }
  return cel;
}
function clampActiveLayerIndex(cel){
  ensureCelModel(cel);
  const max=Math.max(0,(cel && cel.layers ? cel.layers.length : 1)-1);
  activeLayerIndex=Math.max(0,Math.min(max,activeLayerIndex|0));
}
function rebuildCelComposite(cel){
  ensureCelModel(cel);
  const layers=cel.layers;
  const len=(W*H)|0;
  if(!ditherMask || ditherMask.length!==len) rebuildDitherMask();
  for(let fi=0;fi<4;fi++){
    const out=cel.frames[fi];
    for(let i=0;i<len;i++){
      let v=0;
      for(let li=layers.length-1;li>=0;li--){
        const layer=layers[li];
        if(!layer.visible) continue;
        const opacity=(layer.opacity==null ? 100 : (layer.opacity|0));
        if(opacity<=0) continue;
        const pv=layer.frames[fi][i];
        if(pv===0) continue;
        if(opacity>=100){ v=pv; break; }
        const keepCount=((opacity*16)/100)|0;
        if(keepCount<=0) continue;
        if(ditherMask[i]<keepCount){ v=pv; break; }
      }
      out[i]=v;
    }
  }
}
function cloneCelDeep(cel){
  ensureCelModel(cel);
  const layers=cel.layers.map(l=>({
    name: String(l.name||''),
    visible: l.visible!==false,
    opacity: (l.opacity==null ? 100 : Math.max(0,Math.min(100,Number(l.opacity)||0))),
    frames: l.frames.map(f=>new Uint8Array(f)),
  }));
  return {
    delay: Math.max(30,Number(cel.delay)||0),
    layers,
    frames: cel.frames.map(f=>new Uint8Array(f)),
  };
}
function applyWorkingFramesFromCel(cel){
  ensureCelModel(cel);
  clampActiveLayerIndex(cel);
  const layer=cel.layers[activeLayerIndex];
  for(let fi=0;fi<4;fi++) frames[fi]=layer.frames[fi];
  markCompositeDirty();
}
function rebuildCurrentCompositeIfNeeded(){
  if(!compositeDirty) return;
  const cel=getCurrentCel();
  if(!cel) return;
  rebuildCelComposite(cel);
  compositeDirty=false;
}
function buildCompositeScratchFrame(fi,activeOverrideFrame){
  const cel=getCurrentCel();
  if(!cel || !activeOverrideFrame) return null;
  ensureCelModel(cel);
  const len=(W*H)|0;
  if(!compositeScratchFrame || compositeScratchFrame.length!==len) compositeScratchFrame=new Uint8Array(len);
  if(!ditherMask || ditherMask.length!==len) rebuildDitherMask();
  const out=compositeScratchFrame;
  const layers=cel.layers;
  for(let i=0;i<len;i++){
    let v=0;
    for(let li=layers.length-1;li>=0;li--){
      const layer=layers[li];
      if(!layer.visible) continue;
      const opacity=(layer.opacity==null ? 100 : (layer.opacity|0));
      if(opacity<=0) continue;
      const src=(li===activeLayerIndex) ? activeOverrideFrame : layer.frames[fi];
      const pv=src[i];
      if(pv===0) continue;
      if(opacity>=100){ v=pv; break; }
      const keepCount=((opacity*16)/100)|0;
      if(keepCount<=0) continue;
      if(ditherMask[i]<keepCount){ v=pv; break; }
    }
    out[i]=v;
  }
  return out;
}
function getCompositeFrame(fi){
  const cel=getCurrentCel();
  return (cel && cel.frames && cel.frames[fi]) ? cel.frames[fi] : frames[fi];
}
function isLayerMode(){
  return Boolean(containerEl && containerEl.classList.contains('layer-mode'));
}
function renderPreview(){
  // 换色界面预览固定看“稳定帧” frame3
  // 直接按预览尺寸采样渲染，避免每次都生成 360x265 的大 ImageData（系统颜色选择器拖动时会卡）
  const pw=previewCanvas.width, ph=previewCanvas.height;
  const img=previewCtx.createImageData(pw,ph);
  const data=img.data;
  let frame=null;
  if(isSelectMode() && selectionHas() && selectionBaseFrames && selectionBuffer){
    const transparentZero=Boolean(selectTransparentEl && selectTransparentEl.checked);
    const base=selectionBaseFrames[3] ?? frames[3];
    const need=(W*H)|0;
    if(!selectScratchFrame || selectScratchFrame.length!==need) selectScratchFrame=new Uint8Array(need);
    selectScratchFrame.set(base);
    if(selectionOriginRect) clearRectInFrame(selectScratchFrame,selectionOriginRect);
    blitBufferFrameAt(selectScratchFrame,selectionRect,selectionBuffer,3,{ transparentZero });
    frame=buildCompositeScratchFrame(3,selectScratchFrame) ?? selectScratchFrame;
  }else{
    rebuildCurrentCompositeIfNeeded();
    frame=getCompositeFrame(3);
  }
  for(let y=0;y<ph;y++){
    const sy=Math.floor(y*H/ph);
    for(let x=0;x<pw;x++){
      const sx=Math.floor(x*W/pw);
      const val=frame[sy*W+sx];
      const o=(y*pw+x)*4;
      if(val===0){
        data[o]=0; data[o+1]=0; data[o+2]=0; data[o+3]=0;
      }else{
        const [r,g,b]=hexToRGB(colorMap[val]);
        data[o]=r; data[o+1]=g; data[o+2]=b; data[o+3]=255;
      }
    }
  }
  previewCtx.putImageData(img,0,0);
}
let selectScratchFrame=null;
function clearRectInFrame(frame,rect){
  if(!rect || !frame) return;
  const w=rect.w|0, h=rect.h|0;
  for(let oy=0;oy<h;oy++){
    const y=(rect.y+oy)|0;
    if(y<0||y>=H) continue;
    const row=y*W;
    for(let ox=0;ox<w;ox++){
      const x=(rect.x+ox)|0;
      if(x<0||x>=W) continue;
      frame[row+x]=0;
    }
  }
}
function blitBufferFrameAt(dstFrame,rect,buffer,fi,options){
  if(!dstFrame || !rect || !buffer) return;
  const transparentZero=Boolean(options && options.transparentZero);
  const w=buffer.w|0, h=buffer.h|0;
  const src=(buffer.frames && (buffer.frames[fi] ?? buffer.frames[0])) ? (buffer.frames[fi] ?? buffer.frames[0]) : null;
  if(!src) return;
  for(let oy=0;oy<h;oy++){
    const dy=(rect.y+oy)|0;
    if(dy<0||dy>=H) continue;
    const row=dy*W;
    const so=oy*w;
    for(let ox=0;ox<w;ox++){
      const dx=(rect.x+ox)|0;
      if(dx<0||dx>=W) continue;
      const v=src[so+ox];
      if(transparentZero && v===0) continue;
      dstFrame[row+dx]=v;
    }
  }
}
function renderCurrent(){
  // 换色界面不显示绘画区，跳过大画布渲染，避免调色时卡顿
  if(!containerEl || !containerEl.classList.contains('color-mode')){
    if(isSelectMode() && selectionHas() && selectionBaseFrames && selectionBuffer){
      const transparentZero=Boolean(selectTransparentEl && selectTransparentEl.checked);
      const base=selectionBaseFrames[displayFrame] ?? frames[displayFrame];
      const need=(W*H)|0;
      if(!selectScratchFrame || selectScratchFrame.length!==need) selectScratchFrame=new Uint8Array(need);
      selectScratchFrame.set(base);
      if(selectionOriginRect) clearRectInFrame(selectScratchFrame,selectionOriginRect);
      blitBufferFrameAt(selectScratchFrame,selectionRect,selectionBuffer,displayFrame,{ transparentZero });
      const composite=buildCompositeScratchFrame(displayFrame,selectScratchFrame) ?? selectScratchFrame;
      render(composite);
    }else{
      rebuildCurrentCompositeIfNeeded();
      render(getCompositeFrame(displayFrame));
    }
  }
  renderPreview();
}
function startAnim(){
  // 抖动开启时循环播放 frame0~2
  stopAnim();
  const tick=()=>{
    displayFrame=(displayFrame+1)%3;
    renderCurrent();
    animId=window.setTimeout(tick,getJitterSubDelayMs(displayFrame));
  };
  animId=window.setTimeout(tick,getJitterSubDelayMs(displayFrame));
}
function stopAnim(){
  if(animId!==null){
    window.clearTimeout(animId);
    animId=null;
  }
}
function applyPlaybackMode(){
  if(jitterOnEl && jitterOnEl.checked){
    stopAnim();
    displayFrame=0;
    renderCurrent();
    startAnim();
  }else{
    stopAnim();
    displayFrame=3;
    renderCurrent();
  }
}
function drawSegment(from,to,val){
  if(!from || !to) return;
  const size=toolSettings[currentTool]?.size ?? 1;
  const erasing=val===0;
  if(erasing){
    for(let fi=0;fi<4;fi++){
      drawLineValue(frames[fi],from,to,val,size);
    }
    markCompositeDirty();
    return;
  }
  const baseJitter=(jitterLevel||0);
  const toolJitterScale=(currentTool==='pencil') ? 2 : 1;
  const maxAbs=baseJitter*toolJitterScale;
  const jitterActive=maxAbs>0;
  if(currentTool==='palette'){
    if(jitterActive){
      const base=nextJitterBase();
      const offsets=makeFrameOffsets(base,maxAbs);
      for(let fi=0;fi<3;fi++){
        const o=offsets[fi];
        patternController.stampPalette(frames[fi],to.x+o.dx,to.y+o.dy,val,size);
      }
    }else{
      for(let fi=0;fi<3;fi++){
        patternController.stampPalette(frames[fi],to.x,to.y,val,size);
      }
    }
    patternController.stampPalette(frames[3],to.x,to.y,val,size);
    markCompositeDirty();
    return;
  }
  if(currentTool==='blobby' || currentTool==='stippleTiny' || currentTool==='softLrg'){
    if(jitterActive){
      const base=nextJitterBase();
      const offsets=makeFrameOffsets(base,maxAbs);
      for(let fi=0;fi<3;fi++){
        const o=offsets[fi];
        drawLineTool(frames[fi],{x:from.x+o.dx,y:from.y+o.dy},{x:to.x+o.dx,y:to.y+o.dy},val,currentTool);
      }
    }else{
      for(let fi=0;fi<3;fi++){
        drawLineTool(frames[fi],from,to,val,currentTool);
      }
    }
    drawLineTool(frames[3],from,to,val,currentTool);
    markCompositeDirty();
    return;
  }
  if(jitterActive){
    const base=nextJitterBase();
    const offsets=makeFrameOffsets(base,maxAbs);
    for(let fi=0;fi<3;fi++){
      const o=offsets[fi];
      drawLineValue(frames[fi],{x:from.x+o.dx,y:from.y+o.dy},{x:to.x+o.dx,y:to.y+o.dy},val,size);
    }
  }else{
    for(let fi=0;fi<3;fi++){
      drawLineValue(frames[fi],from,to,val,size);
    }
  }
  drawLineValue(frames[3],from,to,val,size);
  markCompositeDirty();
}
function pointerCanDraw(e){
  if(e.button!=null && e.button!==0) return false;
  return true;
}
let selectionRect=null;
let selectionOriginRect=null;
let selectionBaseFrames=null;
let selectionSourceBuffer=null;
let selectionBuffer=null;
let selectionClipboard=null;
let selectionDrag=null;
let selectLastPos=null;
let selectHistoryController=null;

function isSelectMode(){
  return Boolean(containerEl && containerEl.classList.contains('select-mode'));
}
function rectFromPoints(a,b){
  const x0=clamp(Math.min(a.x,b.x)|0,0,Math.max(0,(W-1)|0));
  const y0=clamp(Math.min(a.y,b.y)|0,0,Math.max(0,(H-1)|0));
  const x1=clamp(Math.max(a.x,b.x)|0,0,Math.max(0,(W-1)|0));
  const y1=clamp(Math.max(a.y,b.y)|0,0,Math.max(0,(H-1)|0));
  const w=Math.max(1,(x1-x0+1)|0);
  const h=Math.max(1,(y1-y0+1)|0);
  return { x:x0, y:y0, w, h };
}
function selectionHas(){
  return Boolean(selectionRect && selectionRect.w>0 && selectionRect.h>0);
}
function cloneFramesLocal(){
  return frames.map(f=>new Uint8Array(f));
}
function applyFramesLocal(snapshot){
  for(let i=0;i<frames.length;i++){
    frames[i].set(snapshot[i]);
  }
  markCompositeDirty();
}
function cloneSelectionBuffer(buffer){
  if(!buffer) return null;
  const w=buffer.w|0;
  const h=buffer.h|0;
  const srcFrames=Array.isArray(buffer.frames)?buffer.frames:[];
  return { w, h, frames: [0,1,2,3].map(i=>new Uint8Array(srcFrames[i] ?? srcFrames[0] ?? new Uint8Array(w*h))) };
}
function createSelectHistoryController(){
  const undoStack=[];
  const redoStack=[];
  function cloneRect(r){
    if(!r) return null;
    return { x:r.x|0, y:r.y|0, w:r.w|0, h:r.h|0 };
  }
  function captureSnapshot(includeFrames){
    const withFrames=Boolean(includeFrames);
    return {
      includeFrames: withFrames,
      frames: withFrames ? cloneFramesLocal() : null,
      selectionRect: cloneRect(selectionRect),
      selectionOriginRect: cloneRect(selectionOriginRect),
      selectionBaseFrames: selectionBaseFrames ? selectionBaseFrames.map(f=>new Uint8Array(f)) : null,
      selectionSourceBuffer: cloneSelectionBuffer(selectionSourceBuffer),
      selectionBuffer: cloneSelectionBuffer(selectionBuffer),
    };
  }
  function applySnapshot(snap){
    if(snap && snap.frames) applyFramesLocal(snap.frames);
    selectionRect=cloneRect(snap ? snap.selectionRect : null);
    selectionOriginRect=cloneRect(snap ? snap.selectionOriginRect : null);
    selectionBaseFrames=snap && snap.selectionBaseFrames ? snap.selectionBaseFrames.map(f=>new Uint8Array(f)) : null;
    selectionSourceBuffer=cloneSelectionBuffer(snap ? snap.selectionSourceBuffer : null);
    selectionBuffer=cloneSelectionBuffer(snap ? snap.selectionBuffer : null);
    selectionDrag=null;
    renderCurrent();
    syncSelectionOverlay();
    syncSelectUI();
  }
  function syncUI(){
    if(selectUndoEl) selectUndoEl.disabled=undoStack.length===0;
    if(selectRedoEl) selectRedoEl.disabled=redoStack.length===0;
  }
  function push(includeFrames){
    undoStack.push(captureSnapshot(includeFrames));
    if(undoStack.length>MAX_HISTORY) undoStack.shift();
    redoStack.length=0;
    syncUI();
  }
  function undo(){
    if(undoStack.length===0) return;
    const prev=undoStack.pop();
    redoStack.push(captureSnapshot(prev && prev.includeFrames));
    if(redoStack.length>MAX_HISTORY) redoStack.shift();
    applySnapshot(prev);
    syncUI();
  }
  function redo(){
    if(redoStack.length===0) return;
    const next=redoStack.pop();
    undoStack.push(captureSnapshot(next && next.includeFrames));
    if(undoStack.length>MAX_HISTORY) undoStack.shift();
    applySnapshot(next);
    syncUI();
  }
  function reset(){
    undoStack.length=0;
    redoStack.length=0;
    syncUI();
  }
  if(selectUndoEl) selectUndoEl.addEventListener('click',undo);
  if(selectRedoEl) selectRedoEl.addEventListener('click',redo);
  syncUI();
  return { push, undo, redo, reset, syncUI };
}
function captureSelectionBufferFrom(framesSrc,rect){
  const w=rect.w|0, h=rect.h|0;
  const outFrames=[];
  for(let fi=0;fi<4;fi++){
    const src=(framesSrc && framesSrc[fi]) ? framesSrc[fi] : frames[fi];
    const out=new Uint8Array(w*h);
    for(let oy=0;oy<h;oy++){
      const sy=rect.y+oy;
      if(sy<0||sy>=H) continue;
      for(let ox=0;ox<w;ox++){
        const sx=rect.x+ox;
        if(sx<0||sx>=W) continue;
        out[oy*w+ox]=src[sy*W+sx];
      }
    }
    outFrames[fi]=out;
  }
  return { w, h, frames: outFrames };
}
function clearRectInSnapshot(snapshot,rect){
  const w=rect.w|0, h=rect.h|0;
  for(let fi=0;fi<4;fi++){
    const arr=snapshot[fi];
    for(let oy=0;oy<h;oy++){
      const dy=rect.y+oy;
      if(dy<0||dy>=H) continue;
      const row=dy*W;
      for(let ox=0;ox<w;ox++){
        const dx=rect.x+ox;
        if(dx<0||dx>=W) continue;
        arr[row+dx]=0;
      }
    }
  }
  markCompositeDirty();
}
function blitBufferAt(rect,buffer,options){
  const transparentZero=Boolean(options && options.transparentZero);
  const w=buffer.w|0, h=buffer.h|0;
  for(let fi=0;fi<4;fi++){
    const dst=frames[fi];
    const src=buffer.frames[fi] ?? buffer.frames[0];
    for(let oy=0;oy<h;oy++){
      const dy=rect.y+oy;
      if(dy<0||dy>=H) continue;
      const row=dy*W;
      const so=oy*w;
      for(let ox=0;ox<w;ox++){
        const dx=rect.x+ox;
        if(dx<0||dx>=W) continue;
        const v=src[so+ox];
        if(transparentZero && v===0) continue;
        dst[row+dx]=v;
      }
    }
  }
  markCompositeDirty();
}
function scaleBufferNearest(buffer,nw,nh){
  const srcW=buffer.w|0, srcH=buffer.h|0;
  const w=Math.max(1,nw|0);
  const h=Math.max(1,nh|0);
  const outFrames=[];
  for(let fi=0;fi<4;fi++){
    const src=buffer.frames[fi] ?? buffer.frames[0];
    const out=new Uint8Array(w*h);
    for(let y=0;y<h;y++){
      const sy=Math.min(srcH-1,Math.floor(y*srcH/h));
      for(let x=0;x<w;x++){
        const sx=Math.min(srcW-1,Math.floor(x*srcW/w));
        out[y*w+x]=src[sy*srcW+sx];
      }
    }
    outFrames[fi]=out;
  }
  return { w, h, frames: outFrames };
}
function syncSelectionOverlay(){
  if(!selectRectEl) return;
  if(!isSelectMode() || !selectionHas()){
    selectRectEl.style.display='none';
    for(const el of selectHandleEls) el.style.display='none';
    return;
  }
  const r=selectionRect;
  selectRectEl.style.display='block';
  selectRectEl.style.left=`${r.x}px`;
  selectRectEl.style.top=`${r.y}px`;
  selectRectEl.style.width=`${r.w}px`;
  selectRectEl.style.height=`${r.h}px`;
  const x0=r.x, y0=r.y, x1=r.x+r.w, y1=r.y+r.h;
  const pts={
    nw:[x0,y0], n:[(x0+x1)/2,y0], ne:[x1,y0],
    e:[x1,(y0+y1)/2], se:[x1,y1], s:[(x0+x1)/2,y1],
    sw:[x0,y1], w:[x0,(y0+y1)/2],
  };
  for(const el of selectHandleEls){
    const h=el.getAttribute('data-h')||'';
    const p=pts[h];
    if(!p){ el.style.display='none'; continue; }
    el.style.display='block';
    el.style.left=`${p[0]}px`;
    el.style.top=`${p[1]}px`;
  }
}
function syncSelectUI(){
  const has=selectionHas();
  if(selectCopyEl) selectCopyEl.disabled=!has;
  if(selectCutEl) selectCutEl.disabled=!has;
  if(selectClearEl) selectClearEl.disabled=!has;
  if(selectPasteEl) selectPasteEl.disabled=!Boolean(selectionClipboard);
}
function resetSelectionState(){
  selectionRect=null;
  selectionOriginRect=null;
  selectionBaseFrames=null;
  selectionSourceBuffer=null;
  selectionBuffer=null;
  selectionDrag=null;
  syncSelectionOverlay();
  syncSelectUI();
}
function commitSelectionToFrames(historyPush){
  if(!selectionHas() || !selectionBaseFrames || !selectionBuffer) return false;
  const transparentZero=Boolean(selectTransparentEl && selectTransparentEl.checked);
  if(historyPush===undefined) pushHistory();
  else if(typeof historyPush==='function') historyPush();
  applyFramesLocal(selectionBaseFrames);
  if(selectionOriginRect) clearRectInSnapshot(frames,selectionOriginRect);
  blitBufferAt(selectionRect,selectionBuffer,{ transparentZero });
  return true;
}
function clearSelection(options){
  const doCommit=Boolean(options && options.commit);
  const committed=doCommit ? commitSelectionToFrames(isSelectMode() && selectHistoryController ? ()=>selectHistoryController.push(true) : undefined) : false;
  resetSelectionState();
  if(committed) renderCurrent();
}
function openSelectMode(){
  if(!containerEl) return;
  if(isCropMode()) closeCrop();
  if(isLayerMode()) closeLayerMode();
  if(canvasPanMode) setCanvasPanMode(false);
  containerEl.classList.add('select-mode');
  if(selectHistoryController) selectHistoryController.reset();
  syncSelectionOverlay();
  syncSelectUI();
}
function closeSelectMode(){
  if(!containerEl) return;
  clearSelection({ commit:true });
  containerEl.classList.remove('select-mode');
  if(selectHistoryController) selectHistoryController.reset();
}
function toggleSelectMode(){
  if(isSelectMode()) closeSelectMode();
  else openSelectMode();
}
function openLayerMode(){
  if(!containerEl) return;
  if(isCropMode()) closeCrop();
  if(isSelectMode()) closeSelectMode();
  if(canvasPanMode) setCanvasPanMode(false);
  setPaletteExpanded(false);
  closeZoomMenu();
  containerEl.classList.add('layer-mode');
  if(layerBtnEl) layerBtnEl.classList.add('is-active');
  const cel=getCurrentCel();
  if(cel) applyWorkingFramesFromCel(cel);
  syncLayerUI();
}
function closeLayerMode(){
  if(!containerEl) return;
  containerEl.classList.remove('layer-mode');
  if(layerBtnEl) layerBtnEl.classList.remove('is-active');
}
function toggleLayerMode(){
  if(isLayerMode()) closeLayerMode();
  else openLayerMode();
}
const LAYER_THUMB_W=92;
const LAYER_THUMB_H=52;
let layerDrag=null;
let layerJustDraggedUntil=0;
function buildColorRgbCache(){
  const cache=new Array((MAX_COLOR_INDEX|0)+1);
  for(let i=1;i<cache.length;i++){
    const hex=colorMap[i];
    if(hex) cache[i]=hexToRGB(hex);
  }
  return cache;
}
function renderLayerThumb(canvasEl,frame,rgbCache){
  const c=canvasEl.getContext('2d');
  if(!c) return;
  const tw=canvasEl.width|0;
  const th=canvasEl.height|0;
  const img=c.createImageData(tw,th);
  const data=img.data;
  for(let y=0;y<th;y++){
    const sy=Math.floor(y*H/th);
    for(let x=0;x<tw;x++){
      const sx=Math.floor(x*W/tw);
      const val=frame[sy*W+sx];
      const o=(y*tw+x)*4;
      if(val===0){
        data[o]=0; data[o+1]=0; data[o+2]=0; data[o+3]=0;
      }else{
        const rgb=rgbCache[val] || hexToRGB(colorMap[val] || '#000000');
        data[o]=rgb[0]; data[o+1]=rgb[1]; data[o+2]=rgb[2]; data[o+3]=255;
      }
    }
  }
  c.putImageData(img,0,0);
}
function syncLayerUI(){
  if(!layerListEl) return;
  const cel=getCurrentCel();
  if(!cel){
    layerListEl.innerHTML='';
    return;
  }
  ensureCelModel(cel);
  clampActiveLayerIndex(cel);
  layerListEl.innerHTML='';
  const rgbCache=buildColorRgbCache();
  for(let i=cel.layers.length-1;i>=0;i--){
    const layer=cel.layers[i];
    const item=document.createElement('div');
    item.className='layer-item';
    const vis=document.createElement('button');
    vis.type='button';
    vis.className='vis'+(layer.visible?'':' is-off');
    vis.title=layer.visible?'隐藏图层':'显示图层';
    vis.setAttribute('aria-label',layer.visible?'隐藏图层':'显示图层');
    vis.innerHTML=layer.visible
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 10.6a3 3 0 0 0 4.2 4.2"/><path d="M9.9 4.2A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a18.7 18.7 0 0 1-4.2 5.3"/><path d="M6.6 6.6C3.9 8.5 2 12 2 12a18.7 18.7 0 0 0 7 6 10.4 10.4 0 0 0 9 .4"/></svg>`;
    vis.addEventListener('click',()=>{
      pushHistory();
      layer.visible=!layer.visible;
      markCompositeDirty();
      renderCurrent();
      syncLayerUI();
    });
    const thumbBtn=document.createElement('button');
    thumbBtn.type='button';
    thumbBtn.className='thumb-btn'+(i===activeLayerIndex?' is-active':'');
    thumbBtn.title=layer.name || `图层${i+1}`;
    thumbBtn.setAttribute('aria-label',layer.name || `图层${i+1}`);
    const thumb=document.createElement('canvas');
    thumb.width=LAYER_THUMB_W;
    thumb.height=LAYER_THUMB_H;
    thumb.className='layer-thumb';
    renderLayerThumb(thumb,layer.frames[displayFrame] ?? layer.frames[3] ?? layer.frames[0],rgbCache);
    thumbBtn.appendChild(thumb);
    thumbBtn.addEventListener('click',()=>{
      if(layerJustDraggedUntil && Date.now()<layerJustDraggedUntil) return;
      activeLayerIndex=i;
      applyWorkingFramesFromCel(cel);
      renderCurrent();
      syncLayerUI();
    });
    const opRow=document.createElement('div');
    opRow.className='op-row';
    const op=document.createElement('input');
    op.type='range';
    op.min='0';
    op.max='100';
    op.step='5';
    op.value=String(layer.opacity==null ? 100 : Math.max(0,Math.min(100,Number(layer.opacity)||0)));
    const opLabel=document.createElement('span');
    opLabel.className='pill';
    opLabel.textContent=`${op.value}%`;
    op.addEventListener('input',()=>{
      const v=Math.max(0,Math.min(100,Number(op.value)||0));
      op.value=String(v);
      opLabel.textContent=`${v}%`;
    });
    op.addEventListener('change',()=>{
      pushHistory();
      layer.opacity=Math.max(0,Math.min(100,Number(op.value)||0));
      markCompositeDirty();
      renderCurrent();
    });
    opRow.appendChild(op);
    opRow.appendChild(opLabel);
    item.appendChild(vis);
    item.appendChild(thumbBtn);
    item.appendChild(opRow);
    layerListEl.appendChild(item);
  }
  if(layerDeleteEl) layerDeleteEl.disabled=cel.layers.length<=1;
  if(layerUpEl) layerUpEl.disabled=activeLayerIndex>=cel.layers.length-1;
  if(layerDownEl) layerDownEl.disabled=activeLayerIndex<=0;
  if(layerMergeDownEl) layerMergeDownEl.disabled=activeLayerIndex<=0;
}
function layerAdd(){
  const cel=getCurrentCel();
  if(!cel) return;
  ensureCelModel(cel);
  pushHistory();
  const len=(W*H)|0;
  const nextIndex=Math.min(cel.layers.length,activeLayerIndex+1);
  const newLayer={
    name:`图层${cel.layers.length+1}`,
    visible:true,
    opacity: 100,
    frames:[new Uint8Array(len),new Uint8Array(len),new Uint8Array(len),new Uint8Array(len)],
  };
  cel.layers.splice(nextIndex,0,newLayer);
  activeLayerIndex=nextIndex;
  applyWorkingFramesFromCel(cel);
  renderCurrent();
  syncLayerUI();
}
function layerDelete(){
  const cel=getCurrentCel();
  if(!cel) return;
  ensureCelModel(cel);
  if(cel.layers.length<=1) return;
  pushHistory();
  cel.layers.splice(activeLayerIndex,1);
  activeLayerIndex=Math.max(0,Math.min(activeLayerIndex,cel.layers.length-1));
  applyWorkingFramesFromCel(cel);
  renderCurrent();
  syncLayerUI();
}
function layerMove(delta){
  const cel=getCurrentCel();
  if(!cel) return;
  ensureCelModel(cel);
  const from=activeLayerIndex|0;
  const to=from+(delta|0);
  if(to<0 || to>=cel.layers.length) return;
  pushHistory();
  const [layer]=cel.layers.splice(from,1);
  cel.layers.splice(to,0,layer);
  activeLayerIndex=to;
  applyWorkingFramesFromCel(cel);
  renderCurrent();
  syncLayerUI();
}
function layerMoveInsert(fromDisplayIndex,insertDisplayIndex){
  const cel=getCurrentCel();
  if(!cel) return;
  ensureCelModel(cel);
  const n=cel.layers.length|0;
  if(n<=1){
    syncLayerUI();
    return;
  }
  const fromD=clamp(fromDisplayIndex|0,0,Math.max(0,n-1));
  const insD=clamp(insertDisplayIndex|0,0,n);
  const fromL=(n-1-fromD)|0;
  const moving=cel.layers[fromL];
  if(!moving) return;
  const active=cel.layers[activeLayerIndex|0];
  pushHistory();
  cel.layers.splice(fromL,1);
  const toL=(n-1-insD)|0;
  const safeTo=clamp(toL,0,cel.layers.length);
  cel.layers.splice(safeTo,0,moving);
  activeLayerIndex=Math.max(0,cel.layers.indexOf(active));
  applyWorkingFramesFromCel(cel);
  renderCurrent();
  syncLayerUI();
}
function layerMergeDown(){
  const cel=getCurrentCel();
  if(!cel) return;
  ensureCelModel(cel);
  const from=activeLayerIndex|0;
  if(from<=0 || from>=cel.layers.length) return;
  pushHistory();
  const upper=cel.layers[from];
  const lower=cel.layers[from-1];
  const len=(W*H)|0;
  for(let fi=0;fi<4;fi++){
    const u=upper.frames[fi];
    const l=lower.frames[fi];
    for(let i=0;i<len;i++){
      const v=u[i];
      if(v!==0) l[i]=v;
    }
  }
  cel.layers.splice(from,1);
  activeLayerIndex=from-1;
  applyWorkingFramesFromCel(cel);
  renderCurrent();
  syncLayerUI();
}
function bindLayerListDrag(){
  if(!layerListEl) return;
  function getInsertIndex(clientY){
    const items=[...layerListEl.querySelectorAll('.layer-item')];
    if(items.length===0) return 0;
    for(let i=0;i<items.length;i++){
      const r=items[i].getBoundingClientRect();
      const mid=(r.top+r.bottom)/2;
      if(clientY<mid) return i;
    }
    return items.length;
  }
  function placePlaceholder(index){
    if(!layerDrag || !layerDrag.placeholderEl) return;
    const placeholder=layerDrag.placeholderEl;
    const items=[...layerListEl.querySelectorAll('.layer-item')];
    if(index>=items.length) layerListEl.appendChild(placeholder);
    else layerListEl.insertBefore(placeholder,items[index]);
  }
  function startDrag(e,item,fromDisplayIndex){
    if(layerDrag && layerDrag.active) return;
    const rect=item.getBoundingClientRect();
    const placeholder=document.createElement('div');
    placeholder.className='layer-placeholder';
    placeholder.style.height=`${rect.height}px`;
    item.parentNode.insertBefore(placeholder,item);
    const ghost=item.cloneNode(true);
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
    item.remove();
    layerDrag={
      pointerId: e.pointerId,
      fromDisplayIndex,
      placeholderEl: placeholder,
      ghostEl: ghost,
      offsetX: e.clientX-rect.left,
      offsetY: e.clientY-rect.top,
      active: true,
    };
    layerListEl.setPointerCapture(e.pointerId);
    layerJustDraggedUntil=Date.now()+250;
    e.preventDefault();
  }
  function finishDrag(e,cancelled){
    if(!layerDrag || layerDrag.pointerId!==e.pointerId) return;
    const fromDisplayIndex=layerDrag.fromDisplayIndex|0;
    const placeholder=layerDrag.placeholderEl;
    const ghost=layerDrag.ghostEl;
    let insertIndex=0;
    for(const child of layerListEl.children){
      if(child===placeholder) break;
      if(child.classList && child.classList.contains('layer-item')) insertIndex++;
    }
    layerDrag=null;
    try{ layerListEl.releasePointerCapture(e.pointerId); }catch{}
    if(ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
    if(placeholder && placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);
    if(cancelled){
      syncLayerUI();
      return;
    }
    layerMoveInsert(fromDisplayIndex,insertIndex);
  }
  layerListEl.addEventListener('pointerdown',(e)=>{
    if(!isLayerMode()) return;
    const cel=getCurrentCel();
    if(!cel) return;
    ensureCelModel(cel);
    if((cel.layers.length|0)<=1) return;
    const target=e.target;
    if(target && target.closest && (target.closest('.vis') || target.closest('input[type="range"]'))) return;
    const item=e.target.closest('.layer-item');
    if(!item) return;
    if(e.button!=null && e.button!==0) return;
    const pointerId=e.pointerId;
    const startX=e.clientX;
    const startY=e.clientY;
    const items=[...layerListEl.querySelectorAll('.layer-item')];
    const fromDisplayIndex=Math.max(0,items.indexOf(item));
    let started=false;
    let timerId=0;
    if(e.pointerType==='touch'){
      timerId=window.setTimeout(()=>{
        if(started) return;
        started=true;
        startDrag(e,item,fromDisplayIndex);
      },220);
    }
    function onMove(ev){
      if(ev.pointerId!==pointerId) return;
      if(!started){
        const dx=ev.clientX-startX;
        const dy=ev.clientY-startY;
        if(Math.hypot(dx,dy)>=6){
          started=true;
          if(timerId) window.clearTimeout(timerId);
          startDrag(ev,item,fromDisplayIndex);
        }
        return;
      }
      if(!layerDrag || layerDrag.pointerId!==pointerId) return;
      const ghost=layerDrag.ghostEl;
      if(ghost){
        ghost.style.left=`${ev.clientX-layerDrag.offsetX}px`;
        ghost.style.top=`${ev.clientY-layerDrag.offsetY}px`;
      }
      placePlaceholder(getInsertIndex(ev.clientY));
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
      if(started) finishDrag(ev,false);
    }
    function onCancel(ev){
      if(ev.pointerId!==pointerId) return;
      cleanup();
      if(started) finishDrag(ev,true);
    }
    window.addEventListener('pointermove',onMove,true);
    window.addEventListener('pointerup',onUp,true);
    window.addEventListener('pointercancel',onCancel,true);
  });
}
function pointInRect(p,r){
  if(!r) return false;
  return p.x>=r.x && p.y>=r.y && p.x<(r.x+r.w) && p.y<(r.y+r.h);
}
function startSelectionDrag(e,kind,options){
  const pointerId=e.pointerId;
  const start=getPos(e);
  const startRect=selectionRect ? { x:selectionRect.x|0, y:selectionRect.y|0, w:selectionRect.w|0, h:selectionRect.h|0 } : null;
  selectionDrag={ active:true, kind, pointerId, start, startRect, ...options };
  if(selectOverlayEl) selectOverlayEl.setPointerCapture(pointerId);
  e.preventDefault();
}
function onSelectPointerDown(e){
  if(!isSelectMode()) return;
  if(e.button!=null && e.button!==0) return;
  if(!selectOverlayEl) return;
  closeZoomMenu();
  const handleEl=e.target && e.target.closest ? e.target.closest('.select-handle') : null;
  const p=getPos(e);
  if(handleEl && selectionHas()){
    if(selectHistoryController) selectHistoryController.push(false);
    const handle=handleEl.getAttribute('data-h')||'';
    const keepRatio=Boolean(selectKeepRatioEl && selectKeepRatioEl.checked) && handle.length===2;
    const ratio=(selectionRect && selectionRect.h>0) ? (selectionRect.w/selectionRect.h) : 1;
    startSelectionDrag(e,'resize',{ handle, keepRatio, ratio });
    return;
  }
  if(selectionHas() && pointInRect(p,selectionRect)){
    if(selectHistoryController) selectHistoryController.push(false);
    startSelectionDrag(e,'move',{});
    return;
  }
  if(selectionHas()){
    clearSelection({ commit:true });
  }
  selectionRect=null;
  selectionOriginRect=null;
  selectionBaseFrames=null;
  selectionSourceBuffer=null;
  selectionBuffer=null;
  syncSelectionOverlay();
  syncSelectUI();
  if(selectHistoryController) selectHistoryController.push(false);
  startSelectionDrag(e,'marquee',{ moved:false });
}
function onSelectPointerMove(e){
  selectLastPos=getPos(e);
  if(!selectionDrag || !selectionDrag.active) return;
  if(e.pointerId!==selectionDrag.pointerId) return;
  const p=getPos(e);
  const kind=selectionDrag.kind;
  if(kind==='marquee'){
    const dx=Math.abs((p.x-selectionDrag.start.x)|0);
    const dy=Math.abs((p.y-selectionDrag.start.y)|0);
    if(dx+dy>=2){
      selectionDrag.moved=true;
      selectionRect=rectFromPoints(selectionDrag.start,p);
      syncSelectionOverlay();
      syncSelectUI();
    }
    return;
  }
  if(!selectionHas() || !selectionDrag.startRect) return;
  if(kind==='move'){
    const dx=(p.x-selectionDrag.start.x)|0;
    const dy=(p.y-selectionDrag.start.y)|0;
    const nx=clamp((selectionDrag.startRect.x+dx)|0,0,Math.max(0,(W-selectionDrag.startRect.w)|0));
    const ny=clamp((selectionDrag.startRect.y+dy)|0,0,Math.max(0,(H-selectionDrag.startRect.h)|0));
    selectionRect={ x:nx, y:ny, w:selectionDrag.startRect.w, h:selectionDrag.startRect.h };
    renderCurrent();
    syncSelectionOverlay();
    return;
  }
  if(kind==='resize'){
    const h=String(selectionDrag.handle||'');
    const sr=selectionDrag.startRect;
    const ax=sr.x+sr.w-1;
    const ay=sr.y+sr.h-1;
    let x0=sr.x, y0=sr.y, x1=ax, y1=ay;
    const px=clamp(p.x|0,0,Math.max(0,(W-1)|0));
    const py=clamp(p.y|0,0,Math.max(0,(H-1)|0));
    if(selectionDrag.keepRatio && h.length===2){
      const ratio=Math.max(1e-6,Number(selectionDrag.ratio)||1);
      const fixedX=h.includes('w') ? ax : sr.x;
      const fixedY=h.includes('n') ? ay : sr.y;
      let newW=Math.max(1,Math.abs((px-fixedX)|0)+1);
      let newH=Math.max(1,Math.abs((py-fixedY)|0)+1);
      const dx=Math.abs((px-fixedX)|0);
      const dy=Math.abs((py-fixedY)|0);
      if(dx>=Math.round(dy*ratio)){
        newH=Math.max(1,Math.round(newW/ratio));
      }else{
        newW=Math.max(1,Math.round(newH*ratio));
      }
      if(h.includes('w')){ x1=fixedX; x0=fixedX-(newW-1); }else{ x0=fixedX; x1=fixedX+(newW-1); }
      if(h.includes('n')){ y1=fixedY; y0=fixedY-(newH-1); }else{ y0=fixedY; y1=fixedY+(newH-1); }
      x0=clamp(x0|0,0,Math.max(0,(W-1)|0));
      x1=clamp(x1|0,0,Math.max(0,(W-1)|0));
      y0=clamp(y0|0,0,Math.max(0,(H-1)|0));
      y1=clamp(y1|0,0,Math.max(0,(H-1)|0));
    }else{
      if(h.includes('w')) x0=px;
      if(h.includes('e')) x1=px;
      if(h.includes('n')) y0=py;
      if(h.includes('s')) y1=py;
      if(h==='n' || h==='s'){ x0=sr.x; x1=ax; }
      if(h==='e' || h==='w'){ y0=sr.y; y1=ay; }
    }
    if(x0>x1){ const t=x0; x0=x1; x1=t; }
    if(y0>y1){ const t=y0; y0=y1; y1=t; }
    const rect={ x:x0, y:y0, w:Math.max(1,(x1-x0+1)|0), h:Math.max(1,(y1-y0+1)|0) };
    selectionRect=rect;
    if(selectionSourceBuffer){
      selectionBuffer=scaleBufferNearest(selectionSourceBuffer,rect.w,rect.h);
    }
    renderCurrent();
    syncSelectionOverlay();
    syncSelectUI();
    return;
  }
}
function onSelectPointerUp(e){
  if(!selectionDrag || !selectionDrag.active) return;
  if(e.pointerId!==selectionDrag.pointerId) return;
  try{ if(selectOverlayEl) selectOverlayEl.releasePointerCapture(e.pointerId); }catch{}
  const kind=selectionDrag.kind;
  const moved=Boolean(selectionDrag.moved);
  selectionDrag=null;
  if(kind==='marquee'){
    if(moved && selectionRect){
      selectionOriginRect={ x:selectionRect.x|0, y:selectionRect.y|0, w:selectionRect.w|0, h:selectionRect.h|0 };
      selectionBaseFrames=cloneFramesLocal();
      selectionSourceBuffer=captureSelectionBufferFrom(selectionBaseFrames,selectionOriginRect);
      selectionBuffer=selectionSourceBuffer;
      renderCurrent();
    }else{
      selectionRect=null;
      selectionOriginRect=null;
      selectionBaseFrames=null;
      selectionSourceBuffer=null;
      selectionBuffer=null;
    }
  }
  syncSelectionOverlay();
  syncSelectUI();
}
if(selectOverlayEl){
  selectOverlayEl.addEventListener('pointerdown',onSelectPointerDown);
  selectOverlayEl.addEventListener('pointermove',(e)=>{
    if(!isSelectMode()) return;
    selectLastPos=getPos(e);
  });
  window.addEventListener('pointermove',onSelectPointerMove,true);
  window.addEventListener('pointerup',onSelectPointerUp,true);
  window.addEventListener('pointercancel',onSelectPointerUp,true);
}
if(selectBtnEl) selectBtnEl.addEventListener('click',toggleSelectMode);
if(selectExitEl) selectExitEl.addEventListener('click',closeSelectMode);
if(selectClearEl) selectClearEl.addEventListener('click',()=>clearSelection({ commit:true }));
if(selectCopyEl) selectCopyEl.addEventListener('click',()=>{
  if(!selectionHas()) return;
  selectionClipboard=cloneSelectionBuffer(selectionBuffer);
  syncSelectUI();
});
if(selectCutEl) selectCutEl.addEventListener('click',()=>{
  if(!selectionHas()) return;
  if(selectHistoryController) selectHistoryController.push(true);
  else pushHistory();
  selectionClipboard=cloneSelectionBuffer(selectionBuffer);
  if(selectionBaseFrames){
    applyFramesLocal(selectionBaseFrames);
    if(selectionOriginRect) clearRectInSnapshot(frames,selectionOriginRect);
  }else if(selectionOriginRect){
    clearRectInSnapshot(frames,selectionOriginRect);
  }
  resetSelectionState();
  renderCurrent();
  syncSelectUI();
});
if(selectPasteEl) selectPasteEl.addEventListener('click',()=>{
  if(!selectionClipboard) return;
  const hadSelection=selectionHas();
  if(selectHistoryController) selectHistoryController.push(hadSelection);
  if(hadSelection){
    const committed=commitSelectionToFrames(null);
    resetSelectionState();
    if(committed) renderCurrent();
  }
  const w=selectionClipboard.w|0;
  const h=selectionClipboard.h|0;
  const anchor=selectLastPos ? { x: selectLastPos.x|0, y: selectLastPos.y|0 } : { x: ((W/2)|0), y: ((H/2)|0) };
  const x=clamp((anchor.x-Math.floor(w/2))|0,0,Math.max(0,(W-w)|0));
  const y=clamp((anchor.y-Math.floor(h/2))|0,0,Math.max(0,(H-h)|0));
  selectionRect={ x, y, w, h };
  selectionOriginRect=null;
  selectionBaseFrames=cloneFramesLocal();
  selectionSourceBuffer=cloneSelectionBuffer(selectionClipboard);
  selectionBuffer=selectionSourceBuffer;
  renderCurrent();
  syncSelectUI();
  syncSelectionOverlay();
});
if(!selectHistoryController && (selectUndoEl || selectRedoEl)) selectHistoryController=createSelectHistoryController();
if(layerBtnEl) layerBtnEl.addEventListener('click',toggleLayerMode);
if(layerExitEl) layerExitEl.addEventListener('click',closeLayerMode);
if(layerAddEl) layerAddEl.addEventListener('click',layerAdd);
if(layerDeleteEl) layerDeleteEl.addEventListener('click',layerDelete);
if(layerUpEl) layerUpEl.addEventListener('click',()=>layerMove(1));
if(layerDownEl) layerDownEl.addEventListener('click',()=>layerMove(-1));
if(layerMergeDownEl) layerMergeDownEl.addEventListener('click',layerMergeDown);
bindLayerListDrag();
let canvasPanMoveListener=null;
let canvasPanUpListener=null;
function startCanvasPan(e){
  e.preventDefault();
  canvasPanning=true;
  canvasPanPointerId=e.pointerId;
  canvasPanStart={ x:e.clientX, y:e.clientY };
  canvasPanBase={ x:canvasViewPanX, y:canvasViewPanY };
  if(canvasViewportEl) canvasViewportEl.style.cursor='grabbing';
  else if(canvas) canvas.style.cursor='grabbing';
  if(canvasPanMoveListener || canvasPanUpListener){
    try{ if(canvasPanMoveListener) window.removeEventListener('pointermove',canvasPanMoveListener,true); }catch{}
    try{ if(canvasPanUpListener) window.removeEventListener('pointerup',canvasPanUpListener,true); }catch{}
    try{ if(canvasPanUpListener) window.removeEventListener('pointercancel',canvasPanUpListener,true); }catch{}
  }
  const onMove=(ev)=>{
    if(!canvasPanning) return;
    if(ev.pointerId!==canvasPanPointerId) return;
    ev.preventDefault();
    const dx=ev.clientX-(canvasPanStart?.x ?? ev.clientX);
    const dy=ev.clientY-(canvasPanStart?.y ?? ev.clientY);
    canvasViewPanX=(canvasPanBase?.x ?? canvasViewPanX)+dx;
    canvasViewPanY=(canvasPanBase?.y ?? canvasViewPanY)+dy;
    clampCanvasPan();
    applyCanvasViewTransform();
  };
  const onUp=(ev)=>{
    if(ev.pointerId!==canvasPanPointerId) return;
    stopDrawing(ev);
  };
  canvasPanMoveListener=onMove;
  canvasPanUpListener=onUp;
  window.addEventListener('pointermove',onMove,true);
  window.addEventListener('pointerup',onUp,true);
  window.addEventListener('pointercancel',onUp,true);
}
canvas.addEventListener('pointerdown',e=>{
  if(isCropMode()) return;
  if(canvasPanMode){
    startCanvasPan(e);
    return;
  }
  if(drawing && drawingPointerId!=null && e.pointerId!==drawingPointerId) return;
  if(!pointerCanDraw(e)) return;
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  drawing=true;
  drawingPointerId=e.pointerId;
  jitterStrokeId=(jitterStrokeId+1)|0;
  jitterSegId=0;
  pushHistory();
  last=getPos(e);
  const val=getPaintValue();
  drawSegment(last,last,val);
  renderCurrent();
});
canvas.addEventListener('pointermove',e=>{
  if(isCropMode()) return;
  if(canvasPanMode) return;
  if(!drawing) return;
  if(drawingPointerId!=null && e.pointerId!==drawingPointerId) return;
  e.preventDefault();
  const p=getPos(e);
  const val=getPaintValue();
  if(currentTool==='palette'){
    drawSegment(p,p,val);
  }else{
    drawSegment(last,p,val);
  }
  last=p;
  renderCurrent();
});
function stopDrawing(e){
  if(canvasPanning && (!e || e.pointerId==null || e.pointerId===canvasPanPointerId)){
    canvasPanning=false;
    canvasPanPointerId=null;
    canvasPanStart=null;
    canvasPanBase=null;
    try{ if(canvasPanMoveListener) window.removeEventListener('pointermove',canvasPanMoveListener,true); }catch{}
    try{ if(canvasPanUpListener) window.removeEventListener('pointerup',canvasPanUpListener,true); }catch{}
    try{ if(canvasPanUpListener) window.removeEventListener('pointercancel',canvasPanUpListener,true); }catch{}
    canvasPanMoveListener=null;
    canvasPanUpListener=null;
    if(canvasPanMode){
      if(canvasViewportEl) canvasViewportEl.style.cursor='grab';
      else if(canvas) canvas.style.cursor='grab';
    }
    if(e && e.pointerId!=null){
      try{ if(canvasViewportEl) canvasViewportEl.releasePointerCapture(e.pointerId); }catch{}
      try{ canvas.releasePointerCapture(e.pointerId); }catch{}
    }
    return;
  }
  if(!drawing) return;
  if(e && drawingPointerId!=null && e.pointerId!==drawingPointerId) return;
  drawing=false;
  drawingPointerId=null;
  try{
    if(e && e.pointerId!=null) canvas.releasePointerCapture(e.pointerId);
  }catch{}
}
if(canvasViewportEl){
  const panDown=(e)=>{
    if(isCropMode()) return;
    if(!canvasPanMode) return;
    startCanvasPan(e);
    e.stopPropagation();
  };
  canvasViewportEl.addEventListener('pointerdown',panDown,{capture:true});
  canvasViewportEl.addEventListener('pointerup',stopDrawing,{capture:true});
  canvasViewportEl.addEventListener('pointercancel',stopDrawing,{capture:true});
  canvasViewportEl.addEventListener('pointerleave',stopDrawing,{capture:true});
}
canvas.addEventListener('pointerup',stopDrawing);
canvas.addEventListener('pointercancel',stopDrawing);
canvas.addEventListener('pointerleave',stopDrawing);
canvas.addEventListener('contextmenu',e=>{ e.preventDefault(); });
penBtn.addEventListener('click',()=>{ setTool('pencil'); });
pen2Btn.addEventListener('click',()=>{ setTool('pen'); });
blobbyBtn.addEventListener('click',()=>{ setTool('blobby'); });
stippleTinyBtn.addEventListener('click',()=>{ setTool('stippleTiny'); });
softLrgBtn.addEventListener('click',()=>{ setTool('softLrg'); });
eraserBtn.addEventListener('click',()=>{ setTool('eraser'); });

function clearCanvas(){
  if(!resizeModalEl) return;
  if(resizeWEl) resizeWEl.value=String(Math.min(1000,W|0));
  if(resizeHEl) resizeHEl.value=String(Math.min(750,H|0));
  openModal(resizeModalEl);
  try{ if(resizeWEl) resizeWEl.focus(); }catch{}
}
function closeResizeModal(){
  if(!resizeModalEl) return;
  closeModal(resizeModalEl);
}
function parseResizeValue(v,fallback,maxValue){
  const n=Math.round(Number(v));
  if(!Number.isFinite(n) || n<=0) return fallback|0;
  const max=Math.max(1,Number(maxValue)||1);
  return Math.max(1,Math.min(max,n|0));
}
function clearAndResizeProject(newW,newH){
  const w=Math.max(1,Math.min(1000,newW|0));
  const h=Math.max(1,Math.min(750,newH|0));
  if(stopAnim) stopAnim();
  if(stopTimelinePlayback) stopTimelinePlayback();
  timelinePlaying=false;
  bumpTimelineToken();
  const t=Array.isArray(timeline) ? timeline : [];
  for(const cel of t){
    if(!cel) continue;
    const nextFrames=[
      new Uint8Array(w*h),
      new Uint8Array(w*h),
      new Uint8Array(w*h),
      new Uint8Array(w*h),
    ];
    cel.frames=nextFrames;
    if(Array.isArray(cel.layers) && cel.layers.length>0){
      for(const layer of cel.layers){
        if(!layer) continue;
        layer.frames=[
          new Uint8Array(w*h),
          new Uint8Array(w*h),
          new Uint8Array(w*h),
          new Uint8Array(w*h),
        ];
      }
    }
  }
  setCanvasSize(w,h);
  const len=t.length|0;
  timelineIndex=clamp(timelineIndex|0,0,Math.max(0,len-1));
  timelineSelected=new Set([timelineIndex]);
  timelineAnchor=timelineIndex;
  applyTimelineFrame(timelineIndex);
  if(resetHistory) resetHistory();
  closeCrop();
  if(applyBackground) applyBackground();
  fitCanvasToViewport();
  applyPlaybackMode();
  renderCurrent();
  syncAnimUI();
}
function applyResizeModal(){
  const w=parseResizeValue(resizeWEl ? resizeWEl.value : null,W,1000);
  const h=parseResizeValue(resizeHEl ? resizeHEl.value : null,H,750);
  clearAndResizeProject(w,h);
  closeResizeModal();
}
if(clearBtn) clearBtn.addEventListener('click',clearCanvas);
if(resizeApplyEl) resizeApplyEl.addEventListener('click',applyResizeModal);
if(resizeCancelEl) resizeCancelEl.addEventListener('click',closeResizeModal);
if(resizeCloseEl) resizeCloseEl.addEventListener('click',closeResizeModal);
if(resizeModalEl){
  makeModalDraggable(resizeModalEl);
  resizeModalEl.addEventListener('mousedown',(e)=>{
    if(e.target===resizeModalEl) closeResizeModal();
  });
}
window.addEventListener('keydown',(e)=>{
  if(e.key==='Escape' && resizeModalEl && resizeModalEl.classList.contains('is-open')) closeResizeModal();
});

// ===== GIF 导出（gifenc）=====
function captureProjectConfig(){
  const schemeId=String(activeSchemeId||'');
  const schemesAll=Array.isArray(paletteSchemes)?paletteSchemes.map(normalizeScheme).filter(Boolean):[];
  const schemesCustom=Array.isArray(customPaletteSchemes)?customPaletteSchemes.map(normalizeScheme).filter(Boolean):[];
  return {
    version: 1,
    w: W|0,
    h: H|0,
    palette: {
      schemeId,
      colors: getCurrentPalette16(),
      outlineColors: getOutlineColors5(),
      separateOutline: Boolean(separateOutlineEl && separateOutlineEl.checked),
    },
    schemes: {
      all: schemesAll,
      custom: schemesCustom,
    },
    settings: {
      transparent: Boolean(toggleTransparent && toggleTransparent.checked),
      protectOutline: Boolean(protectOutlineEl && protectOutlineEl.checked),
      jitterOn: Boolean(jitterOnEl && jitterOnEl.checked),
      jitterLevel: Number(jitter && jitter.value)||0,
      jitterSubDelay: Math.max(20,Number(jitterDelayEl && jitterDelayEl.value)||120),
    },
    patterns: patternController.getConfig(),
    timeline: {
      index: timelineIndex|0,
    },
    background: null,
  };
}
function applyProjectConfig(config){
  if(!config || typeof config!=='object') return;
  if(config.palette){
    applyBaseline({
      colors: Array.isArray(config.palette.colors)?config.palette.colors:getCurrentPalette16(),
      outlineColors: Array.isArray(config.palette.outlineColors)?config.palette.outlineColors:getOutlineColors5(),
      separateOutline: Boolean(config.palette.separateOutline),
    });
  }
  if(protectOutlineEl && config.settings) protectOutlineEl.checked=Boolean(config.settings.protectOutline);
  if(toggleTransparent && config.settings) toggleTransparent.checked=Boolean(config.settings.transparent);
  if(jitterOnEl && config.settings) jitterOnEl.checked=Boolean(config.settings.jitterOn);
  if(jitter && config.settings){
    jitter.value=String(Math.max(0,Math.min(10,Number(config.settings.jitterLevel)||0)));
    updateJitter();
  }
  if(jitterDelayEl && config.settings){
    jitterDelayEl.value=String(Math.max(20,Number(config.settings.jitterSubDelay)||120));
    updateJitterSubDelays();
  }
  if(config.schemes && Array.isArray(config.schemes.all) && Array.isArray(paletteSchemes)){
    const nextAll=config.schemes.all.map(normalizeScheme).filter(Boolean);
    paletteSchemes.length=0;
    for(const s of nextAll) paletteSchemes.push(s);
    customPaletteSchemes=Array.isArray(config.schemes.custom) ? config.schemes.custom.map(normalizeScheme).filter(Boolean) : [];
    saveCustomPaletteSchemes(customPaletteSchemes);
    rebuildSchemeList();
  }
  if(config.patterns) patternController.applyConfig(config.patterns);
  activeSchemeId=(config.palette && config.palette.schemeId!=null) ? String(config.palette.schemeId||'') : '';
  syncSchemeListActive();
  schemeBaseline=captureBaseline();
  applyBackground();
}
function setCanvasSize(newW,newH){
  W=newW|0;
  H=newH|0;
  canvas.width=W;
  canvas.height=H;
  ctx.imageSmoothingEnabled=false;
  canvas.style.width=`${W}px`;
  canvas.style.height=`${H}px`;
  if(canvasBgEl){
    canvasBgEl.style.width=`${W}px`;
    canvasBgEl.style.height=`${H}px`;
  }
  if(cropOverlayContentEl){
    cropOverlayContentEl.style.width=`${W}px`;
    cropOverlayContentEl.style.height=`${H}px`;
  }
  if(selectOverlayContentEl){
    selectOverlayContentEl.style.width=`${W}px`;
    selectOverlayContentEl.style.height=`${H}px`;
  }
  rebuildDitherMask();
}
async function saveWpaintProject(filename){
  const config=captureProjectConfig();
  await downloadWpaintProject({
    filename,
    config,
    timeline,
    w: W,
    h: H,
    backgroundUrl: customBgUrl,
  });
}
async function loadWpaintProjectFromFile(file){
  const loaded=await readWpaintProjectFile(file);
  if(!loaded) return;
  const { config, decoded, background }=loaded;
  stopAnim();
  stopTimelinePlayback();
  timelinePlaying=false;
  timelineToken++;
  if(customBgUrl) URL.revokeObjectURL(customBgUrl);
  customBgUrl='';
  setCanvasSize(decoded.w,decoded.h);
  timeline=decoded.timeline;
  timelineIndex=clamp(Number(config && config.timeline && config.timeline.index)||0,0,Math.max(0,timeline.length-1));
  timelineSelected=new Set([timelineIndex]);
  timelineAnchor=timelineIndex;
  applyTimelineFrame(timelineIndex);
  if(background && background.bytes){
    const mime=String(background.mime||'application/octet-stream');
    const blob=new Blob([background.bytes],{type:mime});
    customBgUrl=URL.createObjectURL(blob);
  }
  applyProjectConfig(config);
  resetHistory();
  closeCrop();
  fitCanvasToViewport();
  applyPlaybackMode();
  renderCurrent();
  syncAnimUI();
}
function exportGif(filename){
  rebuildCurrentCompositeIfNeeded();
  const compositeFrames=[0,1,2,3].map(fi=>getCompositeFrame(fi));
  exportGifFile({
    filename,
    frames: compositeFrames,
    w: W,
    h: H,
    colorMap,
    maxColorIndex: MAX_COLOR_INDEX,
    transparent: Boolean(toggleTransparent && toggleTransparent.checked),
    jitterOn: Boolean(jitterOnEl && jitterOnEl.checked),
    getJitterSubDelayMs,
  });
}
exportGifBtn.addEventListener('click',()=>exportGif());
if(saveAsBtn){
  saveAsBtn.addEventListener('click',async ()=>{
    const name=window.prompt('另存为文件名（.wpaint）','project.wpaint');
    if(name==null) return;
    await saveWpaintProject(name);
  });
}

const colorPage=document.getElementById('colorPage');
const container=document.querySelector('.container');
const jitterPanelEl=document.querySelector('.jitter-panel');
const ADV_PANEL_POS_KEY='wpaint.advancedPanelPos.v1';
let advancedPanelDrag=null;

function ensureAdvancedPanelPlacement(){
  if(!container || !jitterPanelEl) return;
  if(!container.classList.contains('advanced')) return;
  let saved=null;
  try{ saved=JSON.parse(localStorage.getItem(ADV_PANEL_POS_KEY)||'null'); }catch{}
  if(saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)){
    jitterPanelEl.style.left=`${Math.round(saved.left)}px`;
    jitterPanelEl.style.top=`${Math.round(saved.top)}px`;
    jitterPanelEl.style.right='auto';
    jitterPanelEl.style.bottom='auto';
    return;
  }
  const cw=container.clientWidth|0;
  const ch=container.clientHeight|0;
  const pw=jitterPanelEl.offsetWidth|0;
  const ph=jitterPanelEl.offsetHeight|0;
  const left=Math.max(8,cw-pw-8);
  const top=Math.max(8,ch-ph-8);
  jitterPanelEl.style.left=`${left}px`;
  jitterPanelEl.style.top=`${top}px`;
  jitterPanelEl.style.right='auto';
  jitterPanelEl.style.bottom='auto';
}

function bindAdvancedPanelDrag(){
  if(!container || !jitterPanelEl) return;
  jitterPanelEl.addEventListener('pointerdown',(e)=>{
    if(e.button!=null && e.button!==0) return;
    if(!container.classList.contains('advanced')) return;
    const target=e.target;
    if(target && target.closest && target.closest('button,input,select,textarea,a')) return;
    ensureAdvancedPanelPlacement();
    const containerRect=container.getBoundingClientRect();
    const panelRect=jitterPanelEl.getBoundingClientRect();
    const cw=Math.max(1,container.clientWidth||1);
    const ch=Math.max(1,container.clientHeight||1);
    const scaleX=containerRect.width/cw;
    const scaleY=containerRect.height/ch;
    advancedPanelDrag={
      pointerId:e.pointerId,
      startX:e.clientX,
      startY:e.clientY,
      startLeft: (panelRect.left-containerRect.left)/scaleX,
      startTop: (panelRect.top-containerRect.top)/scaleY,
      scaleX,
      scaleY,
      pointerType: e.pointerType || '',
      isDragging: e.pointerType!=='touch',
    };
    try{ jitterPanelEl.setPointerCapture(e.pointerId); }catch{}
    if(advancedPanelDrag.isDragging) e.preventDefault();
  });
  jitterPanelEl.addEventListener('pointermove',(e)=>{
    if(!advancedPanelDrag) return;
    if(e.pointerId!==advancedPanelDrag.pointerId) return;
    if(!advancedPanelDrag.isDragging){
      const dx=e.clientX-advancedPanelDrag.startX;
      const dy=e.clientY-advancedPanelDrag.startY;
      const dist=(dx*dx)+(dy*dy);
      if(dist<(8*8)) return;
      advancedPanelDrag.isDragging=true;
    }
    const dx=(e.clientX-advancedPanelDrag.startX)/(advancedPanelDrag.scaleX||1);
    const dy=(e.clientY-advancedPanelDrag.startY)/(advancedPanelDrag.scaleY||1);
    const cw=container.clientWidth|0;
    const ch=container.clientHeight|0;
    const pw=jitterPanelEl.offsetWidth|0;
    const ph=jitterPanelEl.offsetHeight|0;
    const minVisibleX=Math.max(0,Math.round(pw*0.5));
    const minVisibleY=Math.max(0,Math.round(ph*0.5));
    const minLeft=-minVisibleX;
    const maxLeft=(cw-minVisibleX)|0;
    const minTop=-minVisibleY;
    const maxTop=(ch-minVisibleY)|0;
    const left=clamp(Math.round(advancedPanelDrag.startLeft+dx),minLeft,maxLeft);
    const top=clamp(Math.round(advancedPanelDrag.startTop+dy),minTop,maxTop);
    jitterPanelEl.style.left=`${left}px`;
    jitterPanelEl.style.top=`${top}px`;
    jitterPanelEl.style.right='auto';
    jitterPanelEl.style.bottom='auto';
    try{ localStorage.setItem(ADV_PANEL_POS_KEY,JSON.stringify({ left, top })); }catch{}
    e.preventDefault();
  });
  function endDrag(e){
    if(!advancedPanelDrag) return;
    if(e && e.pointerId!=null && e.pointerId!==advancedPanelDrag.pointerId) return;
    try{ if(e && e.pointerId!=null) jitterPanelEl.releasePointerCapture(e.pointerId); }catch{}
    if(e && advancedPanelDrag.isDragging) e.preventDefault();
    advancedPanelDrag=null;
  }
  jitterPanelEl.addEventListener('pointerup',endDrag);
  jitterPanelEl.addEventListener('pointercancel',endDrag);
}
bindAdvancedPanelDrag();
advancedBtn.addEventListener('click',()=>{
  container.classList.toggle('advanced');
  advancedBtn.classList.toggle('is-active',container.classList.contains('advanced'));
  if(container.classList.contains('advanced')) ensureAdvancedPanelPlacement();
});
document.getElementById('switchColor').addEventListener('click',()=>{
  stopAnim();
  displayFrame=3;
  colorPage.style.display='flex';
  container.classList.add('color-mode');
  schemeBaseline=captureBaseline();
  syncOutlineColorsUI();
  renderCurrent();
});
document.getElementById('back').addEventListener('click',()=>{
  colorPage.style.display='none';
  container.classList.remove('color-mode');
  applyPlaybackMode();
});
document.querySelectorAll('#colorPage input[type=color]').forEach(input=>{
  const idx=Number(input.dataset.index);
  if(idx>=OUTLINE_FIRST && idx<=OUTLINE_LAST){
    input.value=outlineColorStore[idx] ?? colorMap[2];
  }else{
    input.value=colorMap[idx];
  }
  input.addEventListener('change',()=>{
    const next=input.value;
    if(idx>=OUTLINE_FIRST && idx<=OUTLINE_LAST){
      outlineColorStore[idx]=next;
      syncOutlineColorMap();
    }else{
      colorMap[idx]=next;
      if(idx===2 && !(separateOutlineEl && separateOutlineEl.checked)) syncOutlineColorMap();
      if(idx===1){ applyBackground(); }
    }
    syncPaletteButtonsColors();
    renderCurrent();
  });
});
function syncOutlineColorsUI(){
  if(!outlineColorsEl) return;
  outlineColorsEl.style.display=(separateOutlineEl && separateOutlineEl.checked)?'grid':'none';
}
if(separateOutlineEl){
  separateOutlineEl.addEventListener('change',()=>{
    syncOutlineColorsUI();
    syncOutlineColorMap();
    renderCurrent();
  });
}
const schemeListEl=document.getElementById('schemeList');
const schemeResetBtn=document.getElementById('schemeReset');
const schemeSaveBtn=document.getElementById('schemeSave');
const paletteSchemes=[
  { id:'pico8', name:'PICO-8', colors:['#000000','#1d2b53','#7e2553','#008751','#ab5236','#5f574f','#c2c3c7','#fff1e8','#ff004d','#ffa300','#ffec27','#00e436','#29adff','#83769c','#ff77a8','#ffccaa'] },
  { id:'sweetie16', name:'Sweetie 16', colors:['#1a1c2c','#5d275d','#b13e53','#ef7d57','#ffcd75','#a7f070','#38b764','#257179','#29366f','#3b5dc9','#41a6f6','#73eff7','#f4f4f4','#94b0c2','#566c86','#333c57'] },
  { id:'endesga16', name:'Endesga 16', colors:['#e4a672','#b86f50','#743f39','#3f2832','#9e2835','#e53b44','#fb922b','#ffe762','#63c64d','#327345','#193d3f','#4f6781','#afbfd2','#ffffff','#2ce8f4','#0484d1'] },
  { id:'db16', name:'DawnBringer 16', colors:['#140c1c','#442434','#30346d','#4e4a4e','#854c30','#346524','#d04648','#757161','#597dce','#d27d2c','#8595a1','#6daa2c','#d2aa99','#6dc2ca','#dad45e','#deeed6'] },
  { id:'enos16', name:'ENOS16', colors:['#fafafa','#4b4b4b','#d4d4d4','#9d9d9d','#f9d381','#eaaf4d','#f9938a','#e75952','#9ad1f9','#58aeee','#8deda7','#44c55b','#c3a7e1','#9569c8','#bab5aa','#948e82'] },
];
const CUSTOM_SCHEMES_STORAGE_KEY='wpaint.paletteSchemes.v1';
function normalizeScheme(raw){
  if(!raw || typeof raw!=='object') return null;
  const id=String(raw.id||'').trim();
  const name=String(raw.name||'').trim();
  const colors=raw.colors;
  if(!id || !name || !Array.isArray(colors) || colors.length!==BASE_COLOR_COUNT) return null;
  const normalizedColors=colors.map(c=>String(c||'').trim()).filter(Boolean);
  if(normalizedColors.length!==BASE_COLOR_COUNT) return null;
  const outlineColorsRaw=raw.outlineColors;
  let normalizedOutlineColors=null;
  if(Array.isArray(outlineColorsRaw) && outlineColorsRaw.length===(OUTLINE_LAST-OUTLINE_FIRST+1)){
    const tmp=outlineColorsRaw.map(c=>String(c||'').trim()).filter(Boolean);
    if(tmp.length===(OUTLINE_LAST-OUTLINE_FIRST+1)) normalizedOutlineColors=tmp;
  }
  const separateOutline=(raw.separateOutline===true || raw.separateOutline===false) ? raw.separateOutline : null;
  const out={ id, name, colors: normalizedColors };
  if(normalizedOutlineColors) out.outlineColors=normalizedOutlineColors;
  if(separateOutline!==null) out.separateOutline=separateOutline;
  return out;
}
function loadCustomPaletteSchemes(){
  try{
    const raw=localStorage.getItem(CUSTOM_SCHEMES_STORAGE_KEY);
    if(!raw) return [];
    const parsed=JSON.parse(raw);
    if(!Array.isArray(parsed)) return [];
    return parsed.map(normalizeScheme).filter(Boolean);
  }catch{
    return [];
  }
}
function saveCustomPaletteSchemes(list){
  try{
    localStorage.setItem(CUSTOM_SCHEMES_STORAGE_KEY,JSON.stringify(list));
  }catch{}
}
let customPaletteSchemes=loadCustomPaletteSchemes();
for(const s of customPaletteSchemes){
  if(!paletteSchemes.some(x=>x.id===s.id)) paletteSchemes.push(s);
}
let schemeBaseline=null;
function getCurrentPalette16(){
  const colors=[];
  for(let i=1;i<=BASE_COLOR_COUNT;i++) colors.push(colorMap[i]);
  return colors;
}
function getOutlineColors5(){
  const colors=[];
  for(let i=OUTLINE_FIRST;i<=OUTLINE_LAST;i++) colors.push(outlineColorStore[i] ?? colorMap[2]);
  return colors;
}
function setOutlineColors5(colors){
  if(!Array.isArray(colors) || colors.length!==(OUTLINE_LAST-OUTLINE_FIRST+1)) return;
  for(let i=OUTLINE_FIRST;i<=OUTLINE_LAST;i++){
    const c=colors[i-OUTLINE_FIRST];
    if(!c) continue;
    outlineColorStore[i]=c;
    const input=document.querySelector(`#colorPage input[type=color][data-index="${i}"]`);
    if(input) input.value=c;
  }
}
function setPalette16(colors){
  for(let i=1;i<=BASE_COLOR_COUNT;i++){
    const c=colors[i-1];
    if(!c) continue;
    colorMap[i]=c;
    const input=document.querySelector(`#colorPage input[type=color][data-index="${i}"]`);
    if(input) input.value=c;
  }
}
function captureBaseline(){
  return {
    colors: getCurrentPalette16(),
    outlineColors: getOutlineColors5(),
    separateOutline: Boolean(separateOutlineEl && separateOutlineEl.checked),
  };
}
function applyBaseline(baseline){
  if(!baseline) return;
  setPalette16(baseline.colors);
  setOutlineColors5(baseline.outlineColors);
  if(separateOutlineEl) separateOutlineEl.checked=Boolean(baseline.separateOutline);
  syncOutlineColorsUI();
  syncOutlineColorMap();
  applyBackground();
  syncPaletteButtonsColors();
  renderCurrent();
}
function applyPaletteScheme(colors){
  for(let i=1;i<=BASE_COLOR_COUNT;i++){
    colorMap[i]=colors[i-1];
    const input=document.querySelector(`#colorPage input[type=color][data-index="${i}"]`);
    if(input) input.value=colorMap[i];
  }
  syncOutlineColorMap();
}
function syncSchemeListActive(){
  if(!schemeListEl) return;
  const items=schemeListEl.querySelectorAll('[data-scheme-id]');
  for(const el of items){
    const id=String(el.getAttribute('data-scheme-id')||'');
    el.classList.toggle('is-active',id && id===String(activeSchemeId||''));
  }
}
function makeSchemeItem(scheme){
  const btn=document.createElement('button');
  btn.type='button';
  btn.className='action-btn scheme-item';
  btn.setAttribute('data-scheme-id',scheme.id);
  btn.textContent=scheme.name;
  btn.addEventListener('click',()=>{
    activeSchemeId=scheme.id;
    applyPaletteScheme(scheme.colors);
    if(scheme.separateOutline!=null && separateOutlineEl){
      separateOutlineEl.checked=Boolean(scheme.separateOutline);
      syncOutlineColorsUI();
    }
    if(Array.isArray(scheme.outlineColors)) setOutlineColors5(scheme.outlineColors);
    syncOutlineColorMap();
    applyBackground();
    syncPaletteButtonsColors();
    renderCurrent();
    schemeBaseline=captureBaseline();
    syncSchemeListActive();
  });
  return btn;
}
function rebuildSchemeList(){
  if(!schemeListEl) return;
  schemeListEl.innerHTML='';
  for(const scheme of paletteSchemes){
    schemeListEl.appendChild(makeSchemeItem(scheme));
  }
  syncSchemeListActive();
}
rebuildSchemeList();
{
  const defaultScheme=paletteSchemes.find(s=>s.id==='enos16');
  if(defaultScheme){
    activeSchemeId='enos16';
    applyPaletteScheme(defaultScheme.colors);
    if(defaultScheme.separateOutline!=null && separateOutlineEl){
      separateOutlineEl.checked=Boolean(defaultScheme.separateOutline);
      syncOutlineColorsUI();
    }
    if(Array.isArray(defaultScheme.outlineColors)) setOutlineColors5(defaultScheme.outlineColors);
    schemeBaseline=captureBaseline();
    syncSchemeListActive();
  }
}
if(schemeResetBtn){
  schemeResetBtn.addEventListener('click',()=>{
    applyBaseline(schemeBaseline);
  });
}
if(schemeSaveBtn){
  schemeSaveBtn.addEventListener('click',()=>{
    const colors=getCurrentPalette16();
    const id=`custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
    const name=`自定义${customPaletteSchemes.length+1}`;
    const scheme={
      id,
      name,
      colors: colors.slice(),
      outlineColors: getOutlineColors5(),
      separateOutline: Boolean(separateOutlineEl && separateOutlineEl.checked),
    };
    paletteSchemes.push(scheme);
    customPaletteSchemes.push(scheme);
    saveCustomPaletteSchemes(customPaletteSchemes);
    activeSchemeId=id;
    rebuildSchemeList();
    schemeBaseline=captureBaseline();
  });
}
const checkerboard=document.getElementById('checkerboard');
const toggleTransparent=document.getElementById('toggleTransparent');
const canvasZoomRangeEl=document.getElementById('canvasZoom');
const canvasZoomValueEl=document.getElementById('canvasZoomValue');
const zoomInEl=document.getElementById('zoomIn');
const zoomOutEl=document.getElementById('zoomOut');
const zoomResetEl=document.getElementById('zoomReset');
const zoomFitEl=document.getElementById('zoomFit');
const canvasPanModeEl=document.getElementById('canvasPanMode');
const jitterOnEl=document.getElementById('jitterOn');
const jitter=document.getElementById('jitter');
const jitterValue=document.getElementById('jitterValue');
const jitterDelayEl=document.getElementById('jitterDelay');
const jitterControlsEl=document.getElementById('jitterControls');
const eraserControlsEl=document.getElementById('eraserControls');
const eraseOnlyOutlineEl=document.getElementById('eraseOnlyOutline');
const eraseOnlyEraserEl=document.getElementById('eraseOnlyEraser');
let timelinePlaying=false;
let jitterSubDelay=120;
let canvasViewScale=1;
let canvasViewPanX=0;
let canvasViewPanY=0;
let canvasPanMode=false;
let canvasPanning=false;
let canvasPanPointerId=null;
let canvasPanStart=null;
let canvasPanBase=null;
let toolBeforePan=null;
function getCanvasViewportSize(){
  const vw=(canvasViewportEl && canvasViewportEl.clientWidth) ? canvasViewportEl.clientWidth : W;
  const vh=(canvasViewportEl && canvasViewportEl.clientHeight) ? canvasViewportEl.clientHeight : H;
  return { vw, vh };
}
function applyCanvasViewTransform(){
  const safeScale=(Number(canvasViewScale)||1)||1;
  const t=`translate(${canvasViewPanX}px,${canvasViewPanY}px) scale(${safeScale})`;
  if(canvas) canvas.style.transform=t;
  if(canvasBgEl) canvasBgEl.style.transform=t;
  if(cropOverlayContentEl) cropOverlayContentEl.style.transform=t;
  if(selectOverlayContentEl) selectOverlayContentEl.style.transform=t;
  updateCheckerboardScale();
}
function updateCheckerboardScale(){
  if(!checkerboard) return;
  if(customBgUrl) return;
  const px=Math.max(2,Math.round(16*canvasViewScale));
  checkerboard.style.backgroundSize=`${px}px ${px}px`;
  checkerboard.style.backgroundPosition=`0 0, ${Math.round(px/2)}px ${Math.round(px/2)}px`;
}
function setCanvasViewScale(scale){
  const prev=canvasViewScale;
  const next=Math.max(0.5,Math.min(3,Number(scale)||1));
  if(next!==prev){
    const { vw, vh }=getCanvasViewportSize();
    const anchorScreenX=vw/2;
    const anchorScreenY=vh/2;
    const anchorContentX=(anchorScreenX-canvasViewPanX)/prev;
    const anchorContentY=(anchorScreenY-canvasViewPanY)/prev;
    canvasViewScale=next;
    canvasViewPanX=Math.round(anchorScreenX-anchorContentX*next);
    canvasViewPanY=Math.round(anchorScreenY-anchorContentY*next);
    clampCanvasPan();
  }else{
    canvasViewScale=next;
  }
  if(canvasZoomRangeEl) canvasZoomRangeEl.value=String(Math.round(next*100));
  if(canvasZoomValueEl) canvasZoomValueEl.textContent=`${Math.round(next*100)}%`;
  applyCanvasViewTransform();
}
function clampCanvasPan(){
  const { vw, vh }=getCanvasViewportSize();
  const scaledW=W*canvasViewScale;
  const scaledH=H*canvasViewScale;
  const minX=Math.min(0,vw-scaledW);
  const maxX=Math.max(0,vw-scaledW);
  const minY=Math.min(0,vh-scaledH);
  const maxY=Math.max(0,vh-scaledH);
  canvasViewPanX=Math.max(minX,Math.min(maxX,canvasViewPanX));
  canvasViewPanY=Math.max(minY,Math.min(maxY,canvasViewPanY));
}
function fitCanvasToViewport(){
  const { vw, vh }=getCanvasViewportSize();
  const scale=Math.max(0.5,Math.min(3,Math.min(vw/Math.max(1,W),vh/Math.max(1,H))));
  canvasViewScale=scale;
  canvasViewPanX=Math.round((vw-W*scale)/2);
  canvasViewPanY=Math.round((vh-H*scale)/2);
  clampCanvasPan();
  if(canvasZoomRangeEl) canvasZoomRangeEl.value=String(Math.round(scale*100));
  if(canvasZoomValueEl) canvasZoomValueEl.textContent=`${Math.round(scale*100)}%`;
  applyCanvasViewTransform();
}
function setCanvasPanMode(on){
  const wasOn=canvasPanMode;
  canvasPanMode=Boolean(on);
  if(canvasPanModeEl) canvasPanModeEl.checked=canvasPanMode;
  if(canvasViewportEl) canvasViewportEl.style.cursor=canvasPanMode?'grab':'crosshair';
  else if(canvas) canvas.style.cursor=canvasPanMode?'grab':'crosshair';
  if(!wasOn && canvasPanMode){
    toolBeforePan=currentTool;
    for(const el of document.querySelectorAll('.tool-btn.is-active,.action-btn.is-active,.palette-btn.is-active,.anim-frame-btn.is-active')){
      el.classList.remove('is-active');
    }
  }else if(wasOn && !canvasPanMode){
    const restore=toolBeforePan;
    toolBeforePan=null;
    if(restore) setTool(restore);
  }
}
function openZoomMenu(){
  if(!zoomMenuEl || !zoomBtnEl) return;
  zoomMenuEl.classList.remove('open-down');
  zoomMenuEl.classList.add('is-open');
  zoomBtnEl.classList.add('is-active');
  zoomBtnEl.setAttribute('aria-expanded','true');
  window.requestAnimationFrame(()=>{
    if(!zoomMenuEl || !zoomBtnEl) return;
    if(!zoomMenuEl.classList.contains('is-open')) return;
    const menuRect=zoomMenuEl.getBoundingClientRect();
    const btnRect=zoomBtnEl.getBoundingClientRect();
    const vh=window.innerHeight || document.documentElement.clientHeight || 0;
    const spaceAbove=Math.max(0,btnRect.top);
    const spaceBelow=Math.max(0,vh-btnRect.bottom);
    const need=Math.ceil(menuRect.height)+8;
    if(spaceAbove<need && spaceBelow>=need){
      zoomMenuEl.classList.add('open-down');
    }
    applyStageScale();
  });
  applyStageScale();
}
function closeZoomMenu(){
  if(!zoomMenuEl || !zoomBtnEl) return;
  zoomMenuEl.classList.remove('is-open');
  zoomBtnEl.classList.remove('is-active');
  zoomBtnEl.setAttribute('aria-expanded','false');
  applyStageScale();
}
function toggleZoomMenu(){
  if(!zoomMenuEl) return;
  if(zoomMenuEl.classList.contains('is-open')) closeZoomMenu();
  else openZoomMenu();
}
if(zoomBtnEl){
  zoomBtnEl.addEventListener('click',(e)=>{
    e.preventDefault();
    toggleZoomMenu();
  });
}
window.addEventListener('pointerdown',(e)=>{
  if(!zoomMenuEl || !zoomBtnEl) return;
  if(!zoomMenuEl.classList.contains('is-open')) return;
  const target=e.target;
  if(zoomMenuEl.contains(target) || zoomBtnEl.contains(target)) return;
  closeZoomMenu();
},{capture:true});
if(canvasZoomRangeEl){
  const onZoomInput=()=>{
    const v=Math.max(50,Math.min(300,Number(canvasZoomRangeEl.value)||100));
    setCanvasViewScale(v/100);
  };
  canvasZoomRangeEl.addEventListener('input',onZoomInput);
  canvasZoomRangeEl.addEventListener('change',onZoomInput);
}
if(zoomInEl){
  zoomInEl.addEventListener('click',()=>{
    setCanvasViewScale((Math.round(canvasViewScale*100)+10)/100);
  });
}
if(zoomOutEl){
  zoomOutEl.addEventListener('click',()=>{
    setCanvasViewScale((Math.round(canvasViewScale*100)-10)/100);
  });
}
if(zoomResetEl){
  zoomResetEl.addEventListener('click',()=>{
    setCanvasViewScale(1);
  });
}
if(zoomFitEl){
  zoomFitEl.addEventListener('click',()=>{
    fitCanvasToViewport();
  });
}
if(canvasPanModeEl){
  canvasPanModeEl.addEventListener('change',()=>{
    setCanvasPanMode(Boolean(canvasPanModeEl.checked));
  });
}
setCanvasViewScale(1);
setCanvasPanMode(false);
function getJitterSubDelayMs(i){
  return Math.max(20,Number(jitterSubDelay)||120);
}
function updateJitterSubDelays(){
  const v=Math.max(20,Number(jitterDelayEl && jitterDelayEl.value)||120);
  if(jitterDelayEl) jitterDelayEl.value=String(v);
  jitterSubDelay=v;
  if(container.classList.contains('color-mode')) return;
  if(timelinePlaying) return;
  if(jitterOnEl && jitterOnEl.checked){
    stopAnim();
    if(displayFrame===3) displayFrame=0;
    renderCurrent();
    startAnim();
  }
}
updateJitterSubDelays();
if(jitterDelayEl) jitterDelayEl.addEventListener('change',updateJitterSubDelays);
if(eraseOnlyOutlineEl && eraseOnlyEraserEl){
  eraseOnlyOutlineEl.addEventListener('change',()=>{
    if(eraseOnlyOutlineEl.checked) eraseOnlyEraserEl.checked=false;
  });
  eraseOnlyEraserEl.addEventListener('change',()=>{
    if(eraseOnlyEraserEl.checked) eraseOnlyOutlineEl.checked=false;
  });
}
function updateJitter(){
  jitterLevel=Number(jitter.value)||0;
  jitterValue.textContent=String(jitterLevel);
}
updateJitter();
jitter.addEventListener('input',updateJitter);
jitterOnEl.addEventListener('change',()=>{
  if(container.classList.contains('color-mode')){
    displayFrame=jitterOnEl.checked?0:3;
    return;
  }
  applyPlaybackMode();
});
sizeEl.addEventListener('input',()=>{
  const v=clampToolSize(Number(sizeEl.value)||1,currentTool);
  if(!toolSettings[currentTool]) toolSettings[currentTool]={ size:1 };
  toolSettings[currentTool].size=v;
  sizeValueEl.textContent=String(v);
});
const fileMenuToggleEl=document.getElementById('fileMenuToggle');
const fileMenuEl=document.getElementById('fileMenu');
const settingsOpenEl=document.getElementById('settingsOpen');
const settingsFooterBtnEl=document.getElementById('settingsFooterBtn');
const UI_THEME_STORAGE_KEY='wpaint.uiTheme.v1';
const settingsModalEl=document.getElementById('settingsModal');
const settingsCloseEl=document.getElementById('settingsClose');
const settingsTabGeneralEl=document.getElementById('settingsTabGeneral');
const settingsTabAboutEl=document.getElementById('settingsTabAbout');
const settingsTabShortcutsEl=document.getElementById('settingsTabShortcuts');
const settingsPageGeneralEl=document.getElementById('settingsPageGeneral');
const settingsPageAboutEl=document.getElementById('settingsPageAbout');
const settingsPageShortcutsEl=document.getElementById('settingsPageShortcuts');
const fullscreenToggleEl=document.getElementById('fullscreenToggle');
const fullscreenStateEl=document.getElementById('fullscreenState');
const shortcutsListEl=document.getElementById('shortcutsList');
const shortcutsResetEl=document.getElementById('shortcutsReset');
const uiThemeDefaultEl=document.getElementById('uiThemeDefault');
const uiThemeCuteEl=document.getElementById('uiThemeCute');
const SHORTCUTS_STORAGE_KEY='wpaint.shortcuts.v1';
function normalizeUiTheme(raw){
  return raw==='cute'?'cute':'';
}
function isCuteUiTheme(){
  return document.body.getAttribute('data-ui-theme')==='cute';
}
function syncUiThemeRadios(){
  if(uiThemeDefaultEl) uiThemeDefaultEl.checked=!isCuteUiTheme();
  if(uiThemeCuteEl) uiThemeCuteEl.checked=isCuteUiTheme();
}
function setUiTheme(theme){
  const next=normalizeUiTheme(theme);
  if(next) document.body.setAttribute('data-ui-theme',next);
  else document.body.removeAttribute('data-ui-theme');
  syncUiThemeRadios();
  try{
    localStorage.setItem(UI_THEME_STORAGE_KEY,next);
  }catch{}
}
{
  let saved='';
  try{
    saved=normalizeUiTheme(localStorage.getItem(UI_THEME_STORAGE_KEY));
  }catch{}
  if(saved) document.body.setAttribute('data-ui-theme',saved);
  syncUiThemeRadios();
}
makeModalDraggable(settingsModalEl);
let settingsActivePage='general';
const settingsShortcutsMedia=window.matchMedia ? window.matchMedia('(hover:hover) and (pointer:fine)') : null;
function canShowSettingsShortcuts(){
  if(!settingsTabShortcutsEl || !settingsPageShortcutsEl) return false;
  if(!settingsShortcutsMedia) return true;
  return settingsShortcutsMedia.matches;
}
function syncSettingsShortcutsVisibility(){
  const show=canShowSettingsShortcuts();
  if(settingsTabShortcutsEl) settingsTabShortcutsEl.hidden=!show;
  if(settingsPageShortcutsEl && !show) settingsPageShortcutsEl.hidden=true;
  if(!show && settingsActivePage==='shortcuts') settingsActivePage='general';
}
function isFullscreen(){
  return Boolean(document.fullscreenElement);
}
function syncFullscreenUI(){
  if(!fullscreenToggleEl) return;
  fullscreenToggleEl.textContent=isFullscreen()?'退出全屏':'进入全屏';
  if(fullscreenStateEl) fullscreenStateEl.textContent=isFullscreen()?'当前：全屏':'';
}
async function toggleFullscreen(){
  try{
    if(isFullscreen()) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  }catch{}
  syncFullscreenUI();
}
if(fullscreenToggleEl) fullscreenToggleEl.addEventListener('click',toggleFullscreen);
document.addEventListener('fullscreenchange',syncFullscreenUI);
syncFullscreenUI();

function normalizeShortcutKey(raw){
  const key=String(raw||'');
  const lower=key.toLowerCase();
  if(lower==='esc') return 'escape';
  if(lower==='space') return ' ';
  return lower;
}
function isShortcutModifierKey(key){
  const k=String(key||'');
  return k==='Shift' || k==='Control' || k==='Alt' || k==='Meta';
}
function isMacPlatform(){
  return typeof navigator!=='undefined' && typeof navigator.platform==='string' && navigator.platform.toLowerCase().includes('mac');
}
function getEventModKey(e){
  return isMacPlatform() ? e.metaKey : e.ctrlKey;
}
function eventToCombo(e){
  const key=normalizeShortcutKey(e.key||'');
  return {
    key,
    mod: Boolean(getEventModKey(e)),
    shift: Boolean(e.shiftKey),
    alt: Boolean(e.altKey),
  };
}
function comboEquals(a,b){
  if(!a || !b) return false;
  return a.key===b.key && Boolean(a.mod)===Boolean(b.mod) && Boolean(a.shift)===Boolean(b.shift) && Boolean(a.alt)===Boolean(b.alt);
}
function formatCombo(combo){
  if(!combo || !combo.key) return '未设置';
  const parts=[];
  if(combo.alt) parts.push('Alt');
  if(combo.shift) parts.push('Shift');
  if(combo.mod) parts.push(isMacPlatform() ? '⌘' : 'Ctrl');
  let k=combo.key;
  if(k===' ') k='Space';
  else if(k==='escape') k='Esc';
  else if(k==='delete') k='Del';
  else if(k==='backspace') k='Backspace';
  else if(k.length===1) k=k.toUpperCase();
  else if(/^f\d{1,2}$/.test(k)) k=k.toUpperCase();
  else if(k.startsWith('arrow')) k='Arrow';
  parts.push(k);
  return parts.join(' + ');
}
const shortcutDefs=[
  { id:'undo', label:'撤销', slots:1, defaults:[{ key:'z', mod:true, shift:false, alt:false }] },
  { id:'redo', label:'重做', slots:2, defaults:[{ key:'y', mod:true, shift:false, alt:false },{ key:'z', mod:true, shift:true, alt:false }] },
  { id:'selectCopy', label:'复制（选择模式）', slots:1, defaults:[{ key:'c', mod:true, shift:false, alt:false }] },
  { id:'selectCut', label:'剪切（选择模式）', slots:1, defaults:[{ key:'x', mod:true, shift:false, alt:false }] },
  { id:'selectPaste', label:'粘贴（选择模式）', slots:1, defaults:[{ key:'v', mod:true, shift:false, alt:false }] },
  { id:'toggleFullscreen', label:'切换全屏', slots:1, defaults:[] },
];
function buildDefaultShortcuts(){
  const out={};
  for(const def of shortcutDefs){
    out[def.id]=Array.from({ length:def.slots },(_,i)=>def.defaults[i] ?? null);
  }
  return out;
}
function normalizeShortcuts(raw){
  const defaults=buildDefaultShortcuts();
  const src=(raw && typeof raw==='object') ? raw : {};
  const out={};
  for(const def of shortcutDefs){
    const arr=Array.isArray(src[def.id]) ? src[def.id] : [];
    const slots=[];
    for(let i=0;i<def.slots;i++){
      const c=arr[i];
      if(c && typeof c==='object' && typeof c.key==='string' && c.key){
        slots.push({
          key: normalizeShortcutKey(c.key),
          mod: Boolean(c.mod),
          shift: Boolean(c.shift),
          alt: Boolean(c.alt),
        });
      }else if(c===null){
        slots.push(null);
      }else{
        slots.push(defaults[def.id]?.[i] ?? null);
      }
    }
    out[def.id]=slots;
  }
  return out;
}
function loadShortcuts(){
  try{
    const parsed=JSON.parse(localStorage.getItem(SHORTCUTS_STORAGE_KEY)||'null');
    return normalizeShortcuts(parsed);
  }catch{
    return normalizeShortcuts(null);
  }
}
function saveShortcuts(map){
  try{
    localStorage.setItem(SHORTCUTS_STORAGE_KEY,JSON.stringify(map));
  }catch{}
}
let shortcuts=loadShortcuts();
let shortcutsRendered=false;
let shortcutRecording=null;

function findShortcutMatch(combo){
  for(const def of shortcutDefs){
    const arr=Array.isArray(shortcuts[def.id]) ? shortcuts[def.id] : [];
    for(let i=0;i<arr.length;i++){
      if(comboEquals(arr[i],combo)) return { id:def.id, slot:i };
    }
  }
  return null;
}
function performShortcutAction(actionId){
  if(actionId==='undo'){
    if(isSelectMode() && selectHistoryController){ selectHistoryController.undo(); return true; }
    undo();
    return true;
  }
  if(actionId==='redo'){
    if(isSelectMode() && selectHistoryController){ selectHistoryController.redo(); return true; }
    redo();
    return true;
  }
  if(actionId==='selectCopy'){
    if(!isSelectMode()) return false;
    if(selectCopyEl){ selectCopyEl.click(); return true; }
    return false;
  }
  if(actionId==='selectCut'){
    if(!isSelectMode()) return false;
    if(selectCutEl){ selectCutEl.click(); return true; }
    return false;
  }
  if(actionId==='selectPaste'){
    if(!isSelectMode()) return false;
    if(selectPasteEl){ selectPasteEl.click(); return true; }
    return false;
  }
  if(actionId==='toggleFullscreen'){
    toggleFullscreen();
    return true;
  }
  return false;
}
function onGlobalShortcutsKeyDown(e){
  if(shortcutRecording) return;
  if(e.target && (e.target.tagName==='INPUT' || e.target.tagName==='SELECT' || e.target.tagName==='TEXTAREA')) return;
  if(e.repeat) return;
  if(isShortcutModifierKey(e.key)) return;
  const combo=eventToCombo(e);
  const match=findShortcutMatch(combo);
  if(!match) return;
  const ran=performShortcutAction(match.id);
  if(ran){
    e.preventDefault();
    e.stopPropagation();
  }
}
window.addEventListener('keydown',onGlobalShortcutsKeyDown,{capture:true});

function renderShortcutsPage(){
  if(shortcutsRendered) return;
  if(!shortcutsListEl) return;
  shortcutsRendered=true;
  shortcutsListEl.innerHTML='';
  for(const def of shortcutDefs){
    const slots=shortcuts[def.id] || [];
    const row=document.createElement('div');
    row.className='row';
    const label=document.createElement('span');
    label.textContent=def.label;
    const slotsWrap=document.createElement('div');
    slotsWrap.className='shortcut-slots';
    for(let i=0;i<def.slots;i++){
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='action-btn shortcut-btn';
      btn.dataset.actionId=def.id;
      btn.dataset.slot=String(i);
      const kbd=document.createElement('kbd');
      kbd.textContent=formatCombo(slots[i]);
      btn.appendChild(kbd);
      btn.addEventListener('click',()=>{
        shortcutRecording={ actionId:def.id, slot:i, button:btn, prevText:kbd.textContent };
        kbd.textContent='按下新的组合键…';
      });
      slotsWrap.appendChild(btn);
    }
    row.appendChild(label);
    row.appendChild(slotsWrap);
    shortcutsListEl.appendChild(row);
  }
}
function rerenderShortcuts(){
  shortcutsRendered=false;
  if(shortcutsListEl) shortcutsListEl.innerHTML='';
  if(settingsActivePage==='shortcuts') renderShortcutsPage();
}
function onShortcutRecordKeyDown(e){
  if(!shortcutRecording) return;
  e.preventDefault();
  e.stopPropagation();
  if(isShortcutModifierKey(e.key)) return;
  const { actionId, slot, button }=shortcutRecording;
  const kbd=button ? button.querySelector('kbd') : null;
  const combo=eventToCombo(e);
  const dup=findShortcutMatch(combo);
  if(dup && !(dup.id===actionId && dup.slot===slot)){
    if(kbd) kbd.textContent='已被占用，换一个';
    shortcutRecording=null;
    window.setTimeout(()=>{ rerenderShortcuts(); },350);
    return;
  }
  if(!shortcuts[actionId]) shortcuts[actionId]=[];
  shortcuts[actionId][slot]=combo;
  saveShortcuts(shortcuts);
  if(kbd) kbd.textContent=formatCombo(combo);
  shortcutRecording=null;
}
window.addEventListener('keydown',onShortcutRecordKeyDown,{capture:true});
if(shortcutsResetEl){
  shortcutsResetEl.addEventListener('click',()=>{
    shortcuts=buildDefaultShortcuts();
    saveShortcuts(shortcuts);
    rerenderShortcuts();
  });
}

function setSettingsPage(page){
  syncSettingsShortcutsVisibility();
  settingsActivePage=(page==='about' || page==='shortcuts') ? page : 'general';
  if(settingsActivePage==='shortcuts' && !canShowSettingsShortcuts()) settingsActivePage='general';
  const isGeneral=settingsActivePage==='general';
  const isAbout=settingsActivePage==='about';
  const isShortcuts=settingsActivePage==='shortcuts';
  if(settingsTabGeneralEl){
    settingsTabGeneralEl.classList.toggle('is-active',isGeneral);
    settingsTabGeneralEl.setAttribute('aria-selected',isGeneral?'true':'false');
  }
  if(settingsTabAboutEl){
    settingsTabAboutEl.classList.toggle('is-active',isAbout);
    settingsTabAboutEl.setAttribute('aria-selected',isAbout?'true':'false');
  }
  if(settingsTabShortcutsEl){
    settingsTabShortcutsEl.classList.toggle('is-active',isShortcuts);
    settingsTabShortcutsEl.setAttribute('aria-selected',isShortcuts?'true':'false');
  }
  if(settingsPageGeneralEl) settingsPageGeneralEl.hidden=!isGeneral;
  if(settingsPageAboutEl) settingsPageAboutEl.hidden=!isAbout;
  if(settingsPageShortcutsEl) settingsPageShortcutsEl.hidden=!isShortcuts;
  if(isShortcuts) renderShortcutsPage();
}
function openSettings(){
  if(!settingsModalEl) return;
  syncSettingsShortcutsVisibility();
  setSettingsPage(settingsActivePage);
  syncUiThemeRadios();
  openModal(settingsModalEl);
}
function closeSettings(){
  if(!settingsModalEl) return;
  closeModal(settingsModalEl);
}
if(settingsOpenEl) settingsOpenEl.addEventListener('click',openSettings);
if(settingsFooterBtnEl) settingsFooterBtnEl.addEventListener('click',openSettings);
if(settingsCloseEl) settingsCloseEl.addEventListener('click',closeSettings);
if(settingsTabGeneralEl) settingsTabGeneralEl.addEventListener('click',()=>setSettingsPage('general'));
if(settingsTabAboutEl) settingsTabAboutEl.addEventListener('click',()=>setSettingsPage('about'));
if(settingsTabShortcutsEl) settingsTabShortcutsEl.addEventListener('click',()=>setSettingsPage('shortcuts'));
if(settingsModalEl){
  settingsModalEl.addEventListener('mousedown',(e)=>{
    if(e.target===settingsModalEl) closeSettings();
  });
}
if(uiThemeDefaultEl){
  uiThemeDefaultEl.addEventListener('change',()=>{
    if(uiThemeDefaultEl.checked) setUiTheme('');
  });
}
if(uiThemeCuteEl){
  uiThemeCuteEl.addEventListener('change',()=>{
    if(uiThemeCuteEl.checked) setUiTheme('cute');
  });
}
function updateFileMenuPlacement(){
  if(!fileMenuEl || !fileMenuToggleEl) return;
  const rootRect=(containerEl?containerEl.getBoundingClientRect():null);
  const limitTop=(rootRect?rootRect.top:0)+8;
  const limitBottom=(rootRect?rootRect.bottom:window.innerHeight)-8;
  const anchorRect=fileMenuToggleEl.getBoundingClientRect();
  const gap=6;
  const downAvail=limitBottom-(anchorRect.bottom+gap);
  const upAvail=(anchorRect.top-gap)-limitTop;
  const openUp=upAvail>downAvail;
  fileMenuEl.classList.toggle('open-up',openUp);
  const avail=openUp?upAvail:downAvail;
  fileMenuEl.style.maxHeight=`${Math.max(120,Math.floor(avail))}px`;
}
function openFileMenu(){
  fileMenuEl.classList.add('is-open');
  fileMenuToggleEl.setAttribute('aria-expanded','true');
  updateFileMenuPlacement();
}
function closeFileMenu(){
  fileMenuEl.classList.remove('is-open');
  fileMenuToggleEl.setAttribute('aria-expanded','false');
  fileMenuEl.classList.remove('open-up');
  fileMenuEl.style.maxHeight='';
}
fileMenuToggleEl.addEventListener('click',()=>{
  if(fileMenuEl.classList.contains('is-open')) closeFileMenu();
  else openFileMenu();
});
window.addEventListener('resize',()=>{
  if(fileMenuEl && fileMenuEl.classList.contains('is-open')) updateFileMenuPlacement();
});
document.addEventListener('mousedown',(e)=>{
  if(!fileMenuEl.classList.contains('is-open')) return;
  if(fileMenuToggleEl && fileMenuToggleEl.contains(e.target)) return;
  if(fileMenuEl && fileMenuEl.contains(e.target)) return;
  closeFileMenu();
});
document.addEventListener('pointerdown',(e)=>{
  if(!fileMenuEl.classList.contains('is-open')) return;
  if(fileMenuToggleEl && fileMenuToggleEl.contains(e.target)) return;
  if(fileMenuEl && fileMenuEl.contains(e.target)) return;
  closeFileMenu();
},{capture:true});
fileMenuEl.addEventListener('click',(e)=>{
  if(e.target.closest('button')) closeFileMenu();
});
window.addEventListener('keydown',(e)=>{
  if(e.key==='Escape' && settingsModalEl && settingsModalEl.classList.contains('is-open')) closeSettings();
});
const timelineController=createTimelineController({
  clamp,
  openModal,
  closeModal,
  makeModalDraggable,
  stopAnim,
  renderCurrent,
  applyPlaybackMode,
  getJitterSubDelayMs,
  getW: ()=>W,
  getH: ()=>H,
  frames,
  colorMap,
  maxColorIndex: MAX_COLOR_INDEX,
  toggleTransparentEl: toggleTransparent,
  jitterOnEl,
  getTimeline: ()=>timeline,
  setTimeline: (t)=>{ timeline=t; },
  getTimelineIndex: ()=>timelineIndex,
  setTimelineIndex: (i)=>{ timelineIndex=i; },
  getTimelineToken: ()=>timelineToken,
  setTimelineToken: (t)=>{ timelineToken=t; },
  getTimelineAnchor: ()=>timelineAnchor,
  setTimelineAnchor: (a)=>{ timelineAnchor=a; },
  getTimelineSelected: ()=>timelineSelected,
  setTimelineSelected: (s)=>{ timelineSelected=s; },
  isTimelinePlaying: ()=>timelinePlaying,
  setTimelinePlaying: (v)=>{ timelinePlaying=v; },
  getDisplayFrame: ()=>displayFrame,
  setDisplayFrame: (v)=>{ displayFrame=v; },
  ensureCelModel,
  applyWorkingFramesFromCel,
});
function applyTimelineFrame(i){ return timelineController.applyTimelineFrame(i); }
function setTimelineIndex(i){ return timelineController.setTimelineIndexAndRender(i); }
function syncAnimUI(){ return timelineController.syncAnimUI(); }
function stopTimelinePlayback(){ return timelineController.stopTimelinePlayback(); }
function startTimelinePlayback(){ return timelineController.startTimelinePlayback(); }
function bumpTimelineToken(){ timelineToken++; }
applyTimelineFrame(timelineIndex);
renderCurrent();
syncLayerUI();

cropController=createCropController({
  containerEl,
  cropBtnEl,
  cropPanelEl,
  cropApplyEl,
  cropAutoEl,
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
  getCanvasViewScale: ()=>canvasViewScale,
  getW: ()=>W,
  getH: ()=>H,
  setCanvasSize,
  stopAnim,
  stopTimelinePlayback,
  setTimelinePlaying: (v)=>{ timelinePlaying=Boolean(v); },
  bumpTimelineToken,
  getTimeline: ()=>timeline,
  getTimelineIndex: ()=>timelineIndex,
  setTimelineIndex: (i)=>{ timelineIndex=i|0; },
  applyTimelineFrame,
  resetHistory,
  applyBackground,
  applyPlaybackMode,
});
function createPaletteButton(value){
  const btn=document.createElement('button');
  btn.type='button';
  btn.className='palette-btn';
  btn.dataset.value=String(value);
  btn.title=`颜色${value}`;
  btn.innerHTML=`<span class="wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 0 18c2.2 0 3-1 3-2.5S14 16 12.5 16H12a2 2 0 0 1 0-4h1.2c1.9 0 3.8-1.5 3.8-4.2A4.8 4.8 0 0 0 12 3Z"/><path d="M7.5 10.5h.01"/><path d="M9.5 7.5h.01"/><path d="M14.5 7.5h.01"/><path d="M16.5 10.5h.01"/></svg><span class="swatch"></span></span>`;
  btn.addEventListener('click',()=>{
    paletteValue=value;
    setTool('palette');
  });
  return btn;
}
const paletteButtons=[];
for(let i=1;i<=BASE_COLOR_COUNT;i++){
  const btn=createPaletteButton(i);
  if(i>6) btn.classList.add('is-extra');
  paletteButtons.push(btn);
  paletteToolsEl.appendChild(btn);
  if(i===6 && paletteMoreToggleEl && paletteToolsEl && paletteMoreToggleEl.parentNode!==paletteToolsEl){
    paletteToolsEl.appendChild(paletteMoreToggleEl);
  }
}
function syncPaletteButtonsColors(){
  for(const btn of paletteButtons){
    const v=Number(btn.dataset.value);
    const swatch=btn.querySelector('.swatch');
    if(swatch) swatch.style.background=colorMap[v] ?? '#000000';
  }
}
function syncPaletteButtonsActive(){
  for(const btn of paletteButtons){
    const v=Number(btn.dataset.value);
    btn.classList.toggle('is-active',currentTool==='palette' && v===paletteValue);
  }
}
function applyBackground(){
  // “透明背景”开关只影响棋盘格的显示，用于表达透明区域
  const bg1=colorMap[1];
  if(containerEl) containerEl.style.background='#fff';
  const showBgLayer=toggleTransparent.checked;
  checkerboard.style.display='block';
  if(customBgUrl){
    checkerboard.style.backgroundImage=`url("${customBgUrl}")`;
    checkerboard.style.backgroundSize='contain';
    checkerboard.style.backgroundRepeat='no-repeat';
    checkerboard.style.backgroundPosition='center';
  }else{
    checkerboard.style.backgroundImage=
      `linear-gradient(45deg, #dcdcdc 25%, transparent 25%, transparent 75%, #dcdcdc 75%, #dcdcdc),
       linear-gradient(45deg, ${bg1} 25%, transparent 25%, transparent 75%, ${bg1} 75%, ${bg1})`;
    checkerboard.style.backgroundSize='16px 16px';
    checkerboard.style.backgroundPosition='0 0, 8px 8px';
    checkerboard.style.backgroundRepeat='repeat';
  }
  updateCheckerboardScale();
  if(canvasBgEl){
    canvasBgEl.style.display=showBgLayer?'none':'block';
    canvasBgEl.style.background=bg1;
  }
  const previewBg=document.getElementById('previewBg');
  if(showBgLayer){
    if(customBgUrl){
      previewBg.style.backgroundImage=`url("${customBgUrl}")`;
      previewBg.style.backgroundSize='contain';
      previewBg.style.backgroundRepeat='no-repeat';
      previewBg.style.backgroundPosition='center';
      previewBg.style.backgroundColor=bg1;
    }else{
      previewBg.style.backgroundImage=
        `linear-gradient(45deg, #dcdcdc 25%, transparent 25%, transparent 75%, #dcdcdc 75%, #dcdcdc),
         linear-gradient(45deg, ${bg1} 25%, transparent 25%, transparent 75%, ${bg1} 75%, ${bg1})`;
      previewBg.style.backgroundSize='16px 16px';
      previewBg.style.backgroundPosition='0 0, 8px 8px';
      previewBg.style.backgroundColor='';
    }
  }else{
    previewBg.style.backgroundImage='none';
    previewBg.style.backgroundColor=bg1;
  }
}
toggleTransparent.addEventListener('change',()=>{
  applyBackground();
  renderCurrent();
});
applyBackground();
syncOutlineColorsUI();
syncPaletteButtonsColors();
syncHistoryUI();
applyPlaybackMode();
setTool('pencil');

async function importGifFromFile(file){
  const decoded=await decodeGifFileToIndexedFrames({
    file,
    targetW: null,
    targetH: null,
    colorMap,
    baseColorCount: BASE_COLOR_COUNT,
  });
  if(!decoded || !decoded.mapped || decoded.mapped.length===0) return 0;
  const w=Math.max(1,decoded.targetW|0);
  const h=Math.max(1,decoded.targetH|0);
  const mapped=decoded.mapped;
  const delays=Array.isArray(decoded.delays) ? decoded.delays : [];
  if(stopTimelinePlayback) stopTimelinePlayback();
  timelinePlaying=false;
  bumpTimelineToken();
  setCanvasSize(w,h);
  if(mapped.length>=3 && mapped.length<=4){
    const f0=new Uint8Array(mapped[0]);
    const f1=new Uint8Array(mapped[1]);
    const f2=new Uint8Array(mapped[2]);
    timeline=[{
      frames: [f0,f1,f2,new Uint8Array(f0)],
      delay: Math.max(30,Number(delays[0])||360),
    }];
  }else{
    timeline=mapped.map((src,i)=>{
      const base=new Uint8Array(src);
      return {
        frames: [new Uint8Array(base),new Uint8Array(base),new Uint8Array(base),new Uint8Array(base)],
        delay: Math.max(30,Number(delays[i])||360),
      };
    });
  }
  if(!Array.isArray(timeline) || timeline.length===0){
    const blank=new Uint8Array(w*h);
    timeline=[{ frames:[new Uint8Array(blank),new Uint8Array(blank),new Uint8Array(blank),new Uint8Array(blank)], delay:360 }];
  }
  timelineIndex=0;
  timelineSelected=new Set([0]);
  timelineAnchor=0;
  applyTimelineFrame(0);
  resetHistory();
  closeCrop();
  fitCanvasToViewport();
  applyPlaybackMode();
  renderCurrent();
  syncAnimUI();
  return timeline.length|0;
}

function decodeDeckImageString(x){
  if(typeof x!=='string') return null;
  if(x.slice(0,5)!=='%%IMG') return null;
  const f=x[5]==null?-1:(+x[5]);
  let data=null;
  try{
    data=b64ToU8(x.slice(6));
  }catch{
    return null;
  }
  if(!data || data.length<4) return null;
  const w=((data[0]<<8)|data[1])|0;
  const h=((data[2]<<8)|data[3])|0;
  if(!(w>0 && h>0)) return null;
  const pix=new Uint8Array(w*h);
  if(f===0){
    const stride=Math.ceil(w/8);
    let o=0;
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        const b=data[4+(x>>3)+y*stride];
        pix[o++]=(b&(1<<(7-(x&7))))?1:0;
      }
    }
  }else if(f===1){
    const src=data.subarray(4,4+pix.length);
    pix.set(src);
  }else if(f===2){
    let i=4,o=0;
    while(i+1<data.length && o<pix.length){
      const p=data[i++]&255;
      let c=data[i++]&255;
      while(c>0 && o<pix.length){
        pix[o++]=p;
        c--;
      }
    }
  }else{
    return null;
  }
  return { w,h,pix };
}

function resizeDeckFrame(src,srcW,srcH,dstW,dstH){
  const out=new Uint8Array(dstW*dstH);
  const w=Math.min(srcW,dstW)|0;
  const h=Math.min(srcH,dstH)|0;
  for(let y=0;y<h;y++){
    out.set(src.subarray(y*srcW,y*srcW+w),y*dstW);
  }
  return out;
}

function extractJsonObjectAfterKey(text,key,startIndex){
  const needle=`${key}:`;
  let i=text.indexOf(needle,startIndex||0);
  if(i<0) return null;
  i+=needle.length;
  while(i<text.length && /\s/.test(text[i])) i++;
  if(text[i]!=='{') return null;
  let depth=0,inStr=false,esc=false;
  let j=i;
  for(; j<text.length; j++){
    const ch=text[j];
    if(inStr){
      if(esc){ esc=false; continue; }
      if(ch==='\\'){ esc=true; continue; }
      if(ch==='"'){ inStr=false; continue; }
      continue;
    }
    if(ch==='"'){ inStr=true; continue; }
    if(ch==='{'){ depth++; continue; }
    if(ch==='}'){
      depth--;
      if(depth===0){ j++; break; }
    }
  }
  if(depth!==0) return null;
  return { json:text.slice(i,j), endIndex:j };
}

function extractJsonObjectAt(text,startIndex){
  let i=startIndex|0;
  if(i<0 || i>=text.length) return null;
  while(i<text.length && /\s/.test(text[i])) i++;
  if(text[i]!=='{') return null;
  let depth=0,inStr=false,esc=false;
  let j=i;
  for(; j<text.length; j++){
    const ch=text[j];
    if(inStr){
      if(esc){ esc=false; continue; }
      if(ch==='\\'){ esc=true; continue; }
      if(ch==='"'){ inStr=false; continue; }
      continue;
    }
    if(ch==='"'){ inStr=true; continue; }
    if(ch==='{'){ depth++; continue; }
    if(ch==='}'){
      depth--;
      if(depth===0){ j++; break; }
    }
  }
  if(depth!==0) return null;
  return { json:text.slice(i,j), endIndex:j };
}

function extractDeckCardSections(deckText){
  const cards=[];
  let i=0;
  while(i<deckText.length){
    const start=deckText.indexOf('{card:',i);
    if(start<0) break;
    const nameStart=start+6;
    const nameEnd=deckText.indexOf('}',nameStart);
    if(nameEnd<0) break;
    const name=deckText.slice(nameStart,nameEnd).trim();
    const sectionStart=nameEnd+1;
    let next=deckText.indexOf('{card:',sectionStart);
    if(next<0) next=deckText.length;
    cards.push({ name, section: deckText.slice(sectionStart,next) });
    i=next;
  }
  return cards;
}

function deckerDefaultPalette16(){
  return [
    '#ffffff','#ffff00','#ff6500','#dc0000',
    '#ff0097','#360097','#0000ca','#0097ff',
    '#00a800','#006500','#653600','#976536',
    '#b9b9b9','#868686','#454545','#000000',
  ];
}

function extractDeckPalette16FromPatterns(deckText){
  const key='patterns:"%%IMG';
  const start=deckText.indexOf(key);
  if(start<0) return null;
  const valueStart=start+'patterns:"'.length;
  const end=deckText.indexOf('"',valueStart);
  if(end<0) return null;
  const encoded=deckText.slice(valueStart,end);
  const decoded=decodeDeckImageString(encoded);
  if(!decoded) return null;
  if(decoded.w!==8) return null;
  const PAT_ROWS=28*8;
  const PAT_BYTES=decoded.w*PAT_ROWS;
  if(decoded.h<=PAT_ROWS) return deckerDefaultPalette16();
  const need=PAT_BYTES+(BASE_COLOR_COUNT*3);
  if(decoded.pix.length<need) return null;
  const colors=[];
  let o=PAT_BYTES;
  for(let i=0;i<BASE_COLOR_COUNT;i++,o+=3){
    const r=decoded.pix[o]&255;
    const g=decoded.pix[o+1]&255;
    const b=decoded.pix[o+2]&255;
    colors.push(`#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`);
  }
  return colors;
}

function extractTargetFrameStringsFromWidget(targetWidget){
  const arg=targetWidget && targetWidget.widgets && targetWidget.widgets.fr && targetWidget.widgets.fr.value && targetWidget.widgets.fr.value.arg;
  if(Array.isArray(arg)){
    const imgs=arg.filter(s=>typeof s==='string' && s.slice(0,5)==='%%IMG');
    if(imgs.length>=3) return imgs.slice(0,3);
  }
  const imgs=[];
  const walk=(v)=>{
    if(imgs.length>=3) return;
    if(typeof v==='string'){
      if(v.slice(0,5)==='%%IMG') imgs.push(v);
      return;
    }
    if(Array.isArray(v)){
      for(const x of v){ walk(x); if(imgs.length>=3) return; }
      return;
    }
    if(v && typeof v==='object'){
      for(const k of Object.keys(v)){ walk(v[k]); if(imgs.length>=3) return; }
    }
  };
  walk(targetWidget);
  return imgs.length>=3?imgs.slice(0,3):null;
}

function remapDeckPatternIndex(v){
  const p=v&255;
  if(p===0) return 0;
  if(p===1) return OUTLINE_FIRST;
  if(p>=32 && p<(32+BASE_COLOR_COUNT)){
    const mapped=(p-31);
    if(mapped===2) return 16;
    if(mapped===16) return 2;
    return mapped;
  }
  return 0;
}

function remapDeckFrameInPlace(frame){
  for(let i=0;i<frame.length;i++) frame[i]=remapDeckPatternIndex(frame[i]);
  return frame;
}

async function importDeckFromFile(file){
  const deckText=await file.text();
  const deckPalette=extractDeckPalette16FromPatterns(deckText);
  if(deckPalette){
    const swappedPalette=deckPalette.slice();
    const tmp=swappedPalette[1];
    swappedPalette[1]=swappedPalette[15];
    swappedPalette[15]=tmp;
    activeSchemeId='';
    setPalette16(swappedPalette);
    syncOutlineColorMap();
    applyBackground();
    syncPaletteButtonsColors();
    schemeBaseline=captureBaseline();
    syncSchemeListActive();
    renderCurrent();
  }
  const cards=extractDeckCardSections(deckText).filter(c=>c.name!=='title');
  if(cards.length===0) return 0;
  const parsed=[];
  for(const c of cards){
    const widgetsIx=c.section.indexOf('{widgets}');
    const searchStart=widgetsIx>=0?(widgetsIx+'{widgets}'.length):0;
    const found=extractJsonObjectAfterKey(c.section,'target',searchStart);
    if(!found){
      parsed.push({ name:c.name, frames:null });
      continue;
    }
    let widget=null;
    try{ widget=JSON.parse(found.json); }catch{ widget=null; }
    const frameStrings=widget?extractTargetFrameStringsFromWidget(widget):null;
    parsed.push({ name:c.name, frames:frameStrings });
  }
  let base=null;
  for(const p of parsed){
    if(!p.frames) continue;
    const decoded=decodeDeckImageString(p.frames[0]);
    if(decoded){ base=decoded; break; }
  }
  if(!base) return 0;
  if(stopTimelinePlayback) stopTimelinePlayback();
  timelinePlaying=false;
  bumpTimelineToken();
  setCanvasSize(base.w,base.h);
  const nextTimeline=[];
  for(const p of parsed){
    const blank=new Uint8Array(base.w*base.h);
    if(!p.frames){
      nextTimeline.push({ frames:[new Uint8Array(blank),new Uint8Array(blank),new Uint8Array(blank),new Uint8Array(blank)], delay:360 });
      continue;
    }
    const d0=decodeDeckImageString(p.frames[0]);
    const d1=decodeDeckImageString(p.frames[1]);
    const d2=decodeDeckImageString(p.frames[2]);
    const f0=remapDeckFrameInPlace(d0?((d0.w===base.w && d0.h===base.h)?new Uint8Array(d0.pix):resizeDeckFrame(d0.pix,d0.w,d0.h,base.w,base.h)):new Uint8Array(blank));
    const f1=remapDeckFrameInPlace(d1?((d1.w===base.w && d1.h===base.h)?new Uint8Array(d1.pix):resizeDeckFrame(d1.pix,d1.w,d1.h,base.w,base.h)):new Uint8Array(f0));
    const f2=remapDeckFrameInPlace(d2?((d2.w===base.w && d2.h===base.h)?new Uint8Array(d2.pix):resizeDeckFrame(d2.pix,d2.w,d2.h,base.w,base.h)):new Uint8Array(f0));
    nextTimeline.push({ frames:[f0,f1,f2,new Uint8Array(f0)], delay:360 });
  }
  if(nextTimeline.length){
    timeline=nextTimeline;
  }else{
    const baseFrame=remapDeckFrameInPlace(new Uint8Array(base.pix));
    timeline=[{ frames:[new Uint8Array(baseFrame),new Uint8Array(baseFrame),new Uint8Array(baseFrame),new Uint8Array(baseFrame)], delay:360 }];
  }
  timelineIndex=0;
  timelineSelected=new Set([0]);
  timelineAnchor=0;
  applyTimelineFrame(0);
  resetHistory();
  closeCrop();
  fitCanvasToViewport();
  applyPlaybackMode();
  renderCurrent();
  syncAnimUI();
  return timeline.length|0;
}
importGifBtn.addEventListener('click',()=>{
  gifFileEl.value='';
  gifFileEl.click();
});
gifFileEl.addEventListener('change',async ()=>{
  const file=gifFileEl.files && gifFileEl.files[0];
  if(!file) return;
  stopAnim();
  try{
    const count=await importGifFromFile(file);
    if(count>1){
      displayFrame=3;
      renderCurrent();
      return;
    }
  }catch{}
  if(jitterOnEl.checked){
    displayFrame=0;
    startAnim();
  }else{
    displayFrame=3;
  }
  renderCurrent();
});
if(openProjectBtn){
  openProjectBtn.addEventListener('click',()=>{
    if(wpaintFileEl) wpaintFileEl.value='';
    if(wpaintFileEl) wpaintFileEl.click();
  });
}
if(wpaintFileEl){
  wpaintFileEl.addEventListener('change',async ()=>{
    const file=wpaintFileEl.files && wpaintFileEl.files[0];
    if(!file) return;
    try{
      stopAnim();
      const name=String(file.name||'').toLowerCase();
      if(name.endsWith('.deck')){
        const count=await importDeckFromFile(file);
        if(count>1){
          displayFrame=3;
          renderCurrent();
          return;
        }
      }else{
        await loadWpaintProjectFromFile(file);
      }
    }catch{}
    if(jitterOnEl.checked){
      displayFrame=0;
      startAnim();
    }else{
      displayFrame=3;
    }
    renderCurrent();
  });
}
importBgBtn.addEventListener('click',()=>{
  bgFileEl.value='';
  bgFileEl.click();
});
bgFileEl.addEventListener('change',()=>{
  const file=bgFileEl.files && bgFileEl.files[0];
  if(!file) return;
  if(customBgUrl) URL.revokeObjectURL(customBgUrl);
  customBgUrl=URL.createObjectURL(file);
  applyBackground();
  renderCurrent();
});
if(clearBgBtn){
  clearBgBtn.addEventListener('click',()=>{
    if(customBgUrl) URL.revokeObjectURL(customBgUrl);
    customBgUrl='';
    if(bgFileEl) bgFileEl.value='';
    applyBackground();
    renderCurrent();
  });
}
