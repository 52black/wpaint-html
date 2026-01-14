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
function applyStageScale(){
  const vw=window.innerWidth||0;
  const vh=window.innerHeight||0;
  const pad=16;
  const s=Math.min(1,(vw-pad)/512,(vh-pad)/342);
  const scale=(Number.isFinite(s)&&s>0)?s:1;
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
// 颜色映射：值 0~16 -> 颜色
// 约定：值 1 为背景色，值 2 为前景色（第一只笔）
const defaultColors=['#000000','#ffffff','#000000','#00ff00','#0000ff','#ffff00','#ff00ff','#00ffff','#888888','#444444','#ffa500','#800080','#008000','#000080','#808000','#800000','#ff0000','#000000','#000000','#000000','#000000','#000000'];
const colorMap=defaultColors.slice();
let currentTool='pencil';
let paletteValue=2;
let jitterLevel=0;
let displayFrame=3;
let animId=null;
let drawing=false;
let last=null;
let cropController=null;
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
const patternInvertBtn=document.getElementById('patternInvert');
const patternConfirmBtn=document.getElementById('patternConfirm');
const patternFileEl=document.getElementById('patternFile');
const gifFileEl=document.getElementById('gifFile');
const wpaintFileEl=document.getElementById('wpaintFile');
const bgFileEl=document.getElementById('bgFile');
const cropBtnEl=document.getElementById('cropBtn');
const cropPanelEl=document.getElementById('cropPanel');
const cropApplyEl=document.getElementById('cropApply');
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
  palette:{ size:5 },
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
  sizeEl.value=String(toolSettings[tool]?.size ?? 1);
  sizeValueEl.textContent=String(toolSettings[tool]?.size ?? 1);
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
  patternInvertBtn,
  patternConfirmBtn,
  patternFileEl,
});
function clampBrushSize(n){
  const v=n|0;
  if(v<1) return 1;
  if(v>31) return 31;
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
    const s=clampBrushSize(baseSize+bump);
    stamp(frame,x,y,val,s);
    return;
  }
  if(tool==='stippleTiny'){
    const brush=STIPPLE_TINY_BRUSHES[(Math.random()*STIPPLE_TINY_BRUSHES.length)|0];
    stampPattern(frame,x,y,val,clampBrushSize(baseSize),brush);
    return;
  }
  if(tool==='softLrg'){
    const brush=SOFT_LRG_BRUSHES[(Math.random()*SOFT_LRG_BRUSHES.length)|0];
    stampPattern(frame,x,y,val,clampBrushSize(baseSize),brush);
    return;
  }
  stamp(frame,x,y,val,clampBrushSize(baseSize));
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
function renderPreview(){
  // 换色界面预览固定看“稳定帧” frame3
  // 直接按预览尺寸采样渲染，避免每次都生成 360x265 的大 ImageData（系统颜色选择器拖动时会卡）
  const pw=previewCanvas.width, ph=previewCanvas.height;
  const img=previewCtx.createImageData(pw,ph);
  const data=img.data;
  const frame=frames[3];
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
function renderCurrent(){
  // 换色界面不显示绘画区，跳过大画布渲染，避免调色时卡顿
  if(!container.classList.contains('color-mode')){
    render(frames[displayFrame]);
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
  const size=toolSettings[currentTool]?.size ?? 1;
  const erasing=val===0;
  if(erasing){
    for(let fi=0;fi<4;fi++){
      drawLineValue(frames[fi],from,to,val,size);
    }
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
}
function pointerCanDraw(e){
  if(e.button!=null && e.button!==0) return false;
  return true;
}
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
  if(!pointerCanDraw(e)) return;
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  drawing=true;
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
  drawing=false;
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
  // 清空：所有帧像素值置 0（透明）
  pushHistory();
  for(const f of frames) f.fill(0);
  renderCurrent();
}
clearBtn.addEventListener('click',clearCanvas);

// ===== GIF 导出（gifenc）=====
function captureProjectConfig(){
  const schemeId=(schemeSelectEl && schemeSelectEl.value!=null) ? String(schemeSelectEl.value||'') : '';
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
    if(schemeSelectEl){
      schemeSelectEl.innerHTML='';
      const keepOpt=document.createElement('option');
      keepOpt.value='';
      keepOpt.textContent='配色方案';
      schemeSelectEl.appendChild(keepOpt);
      for(const s of paletteSchemes) appendSchemeOption(s);
      schemeSelectEl.value=(config.palette && config.palette.schemeId!=null) ? String(config.palette.schemeId||'') : '';
    }
  }
  if(config.patterns) patternController.applyConfig(config.patterns);
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
  exportGifFile({
    filename,
    frames,
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
advancedBtn.addEventListener('click',()=>{
  container.classList.toggle('advanced');
  advancedBtn.classList.toggle('is-active',container.classList.contains('advanced'));
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
  outlineColorsEl.style.display=(separateOutlineEl && separateOutlineEl.checked)?'flex':'none';
}
if(separateOutlineEl){
  separateOutlineEl.addEventListener('change',()=>{
    syncOutlineColorsUI();
    syncOutlineColorMap();
    renderCurrent();
  });
}
const schemeSelectEl=document.getElementById('schemeSelect');
const schemeResetBtn=document.getElementById('schemeReset');
const schemeSaveBtn=document.getElementById('schemeSave');
const paletteSchemes=[
  { id:'pico8', name:'PICO-8', colors:['#000000','#1d2b53','#7e2553','#008751','#ab5236','#5f574f','#c2c3c7','#fff1e8','#ff004d','#ffa300','#ffec27','#00e436','#29adff','#83769c','#ff77a8','#ffccaa'] },
  { id:'sweetie16', name:'Sweetie 16', colors:['#1a1c2c','#5d275d','#b13e53','#ef7d57','#ffcd75','#a7f070','#38b764','#257179','#29366f','#3b5dc9','#41a6f6','#73eff7','#f4f4f4','#94b0c2','#566c86','#333c57'] },
  { id:'endesga16', name:'Endesga 16', colors:['#e4a672','#b86f50','#743f39','#3f2832','#9e2835','#e53b44','#fb922b','#ffe762','#63c64d','#327345','#193d3f','#4f6781','#afbfd2','#ffffff','#2ce8f4','#0484d1'] },
  { id:'db16', name:'DawnBringer 16', colors:['#140c1c','#442434','#30346d','#4e4a4e','#854c30','#346524','#d04648','#757161','#597dce','#d27d2c','#8595a1','#6daa2c','#d2aa99','#6dc2ca','#dad45e','#deeed6'] },
  { id:'enos16', name:'ENOS16', colors:['#fafafa','#d4d4d4','#9d9d9d','#4b4b4b','#f9d381','#eaaf4d','#f9938a','#e75952','#9ad1f9','#58aeee','#8deda7','#44c55b','#c3a7e1','#9569c8','#bab5aa','#948e82'] },
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
function appendSchemeOption(scheme){
  if(!schemeSelectEl) return;
  const opt=document.createElement('option');
  opt.value=scheme.id;
  opt.textContent=scheme.name;
  schemeSelectEl.appendChild(opt);
}
function applyPaletteScheme(colors){
  for(let i=1;i<=BASE_COLOR_COUNT;i++){
    colorMap[i]=colors[i-1];
    const input=document.querySelector(`#colorPage input[type=color][data-index="${i}"]`);
    if(input) input.value=colorMap[i];
  }
  syncOutlineColorMap();
  applyBackground();
  syncPaletteButtonsColors();
  renderCurrent();
}
if(schemeSelectEl){
  const keepOpt=document.createElement('option');
  keepOpt.value='';
  keepOpt.textContent='配色方案';
  schemeSelectEl.appendChild(keepOpt);
  for(const s of paletteSchemes){
    appendSchemeOption(s);
  }
  schemeSelectEl.value='';
  schemeSelectEl.addEventListener('change',()=>{
    const id=String(schemeSelectEl.value||'');
    const scheme=paletteSchemes.find(s=>s.id===id);
    if(!scheme) return;
    applyPaletteScheme(scheme.colors);
    if(scheme && scheme.separateOutline!=null && separateOutlineEl){
      separateOutlineEl.checked=Boolean(scheme.separateOutline);
      syncOutlineColorsUI();
    }
    if(scheme && Array.isArray(scheme.outlineColors)) setOutlineColors5(scheme.outlineColors);
    syncOutlineColorMap();
    applyBackground();
    syncPaletteButtonsColors();
    renderCurrent();
    schemeBaseline=captureBaseline();
  });
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
    appendSchemeOption(scheme);
    if(schemeSelectEl) schemeSelectEl.value=id;
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
  zoomMenuEl.classList.add('is-open');
  zoomBtnEl.classList.add('is-active');
  zoomBtnEl.setAttribute('aria-expanded','true');
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
  const v=Math.max(1,Math.min(31,Number(sizeEl.value)||1));
  if(!toolSettings[currentTool]) toolSettings[currentTool]={ size:1 };
  toolSettings[currentTool].size=v;
  sizeValueEl.textContent=String(v);
});
const fileMenuToggleEl=document.getElementById('fileMenuToggle');
const fileMenuEl=document.getElementById('fileMenu');
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
const aboutBtnEl=document.getElementById('aboutBtn');
const aboutModalEl=document.getElementById('aboutModal');
const aboutCloseEl=document.getElementById('aboutClose');
makeModalDraggable(aboutModalEl);
function openAbout(){
  if(!aboutModalEl) return;
  openModal(aboutModalEl);
}
function closeAbout(){
  if(!aboutModalEl) return;
  closeModal(aboutModalEl);
}
if(aboutBtnEl) aboutBtnEl.addEventListener('click',openAbout);
if(aboutCloseEl) aboutCloseEl.addEventListener('click',closeAbout);
if(aboutModalEl){
  aboutModalEl.addEventListener('mousedown',(e)=>{
    if(e.target===aboutModalEl) closeAbout();
  });
}
window.addEventListener('keydown',(e)=>{
  if(e.key==='Escape' && aboutModalEl && aboutModalEl.classList.contains('is-open')) closeAbout();
});
let timeline=[{ frames:[frames[0],frames[1],frames[2],frames[3]], delay:360 }];
let timelineIndex=0;
let timelineToken=0;
let timelineAnchor=0;
let timelineSelected=new Set([0]);
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
});
function applyTimelineFrame(i){ return timelineController.applyTimelineFrame(i); }
function setTimelineIndex(i){ return timelineController.setTimelineIndexAndRender(i); }
function syncAnimUI(){ return timelineController.syncAnimUI(); }
function stopTimelinePlayback(){ return timelineController.stopTimelinePlayback(); }
function startTimelinePlayback(){ return timelineController.startTimelinePlayback(); }
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
  paletteButtons.push(btn);
  paletteToolsEl.appendChild(btn);
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
    targetW: W,
    targetH: H,
    colorMap,
    baseColorCount: BASE_COLOR_COUNT,
  });
  if(!decoded || !decoded.mapped || decoded.mapped.length===0) return;
  const srcCount=decoded.mapped.length;
  for(let fi=0;fi<3;fi++){
    frames[fi].set(decoded.mapped[fi%srcCount]);
  }
  frames[3].set(decoded.mapped[0]);
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
    await importGifFromFile(file);
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
      await loadWpaintProjectFromFile(file);
    }catch{}
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
