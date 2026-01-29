export function createWigglyTheme(deps){
  const WIGGLY_BUILD_ID='5';
  const {
    containerEl,
    stageEl,
    wigglyThemeEl,
    canvasViewportEl,
    colorMap,
    BASE_COLOR_COUNT,
    decodeDeckImageString,
    extractJsonObjectAt,
    onToggleAdvanced,
    onDisableAdvanced,
    onSwitchToDefaultTheme,
    onRequestReturnAfterColor,
    onRequestReturnAfterCrop,
    onSetCanvasSize,
    onGetToolSize,
    onSetToolSize,
    onGetJitterOn,
    onGetJitterLevel,
    onSetJitterLevel,
    onGetJitterDelayMs,
    onSetJitterDelayMs,
  }=deps;
  const ADVANCED_HIDE_NAMES=new Set([
    'hi34','hi22','hi23','hi8','hi5','hi19',
    'hi39','hi33','hi32','hi35','hi37','hi38','hi40','hi41','hi42','hi43','hi44','hi45','hi46','hi47',
  ]);
  const ALWAYS_HIDE_NAMES=new Set([
    'openAbout','quickColorPicker','lang_btn','target',
  ]);
  const WIGGLY_BUTTON_TARGETS=new Map([
    ['pencil','pen'],
    ['pen','pen2'],
    ['Blobby','blobby'],
    ['StippleTiny','stippleTiny'],
    ['SoftLrg','softLrg'],
    ['eraser','eraser'],
    ['redo','redo'],
    ['obliterate','clear'],
    ['button3','undo'],
    ['button4','switchColor'],
    ['button2','cropBtn'],
    ['button1','exportGif'],
    ['toggleWiggle','jitterOn'],
    ['gifImportBtn','importGif'],
    ['eraseLinesOnly','eraseOnlyOutline'],
    ['eraseColorsOnly','eraseOnlyEraser'],
  ]);
  const WIGGLY_COLOR_IDS=[];
  for(let i=32;i<=47;i++) WIGGLY_COLOR_IDS.push(`hi${i}`);
  // 除了 32~47（映射到 1~16 的基础调色），也允许 deck 中的 2~31 作为“别名颜色”
  // 点击这些别名颜色时，设置画笔值为 52~81（稍后在渲染阶段折算为 1~16）
  const WIGGLY_ALIAS_COLOR_IDS=[];
  for(let i=2;i<=31;i++) WIGGLY_ALIAS_COLOR_IDS.push(`hi${i}`);
  const WIGGLY_COLOR_VALUE_MAP=new Map([
    // 基础 16 色：hi32..hi47 -> 1..16
    ...WIGGLY_COLOR_IDS.map((id,idx)=>[id,idx+1]),
    // 别名 30 色：hi2..hi31 -> 52..81
    ...WIGGLY_ALIAS_COLOR_IDS.map((id,idx)=>[id,52+idx]),
  ]);
  const WIGGLY_TOOL_WIDGETS=new Map([
    ['pencil','pencil'],
    ['pen','pen'],
    ['blobby','Blobby'],
    ['stippleTiny','StippleTiny'],
    ['softLrg','SoftLrg'],
    ['eraser','eraser'],
  ]);
  const KEEP_BUTTON_NAMES=new Set([
    'button1','button2','button3','button4','button5','button6',
    'redo','obliterate',
    'toggleWiggle','gifImportBtn','eraseLinesOnly','eraseColorsOnly',
  ]);
  const ADVANCED_SHOW_NAMES=new Set([
    'button6',
    'toggleWiggle',
    'field2','slider1','speedLabel','speedSlider',
    'gifImportBtn','eraseLinesOnly','eraseColorsOnly',
    'field3','slider2',
    'field4','slider3',
    'field5','slider4',
  ]);
  const ALWAYS_SHOW_NAMES=new Set([
    'pencil','pen','Blobby','StippleTiny','SoftLrg','eraser',
  ]);
  const WIGGLY_THEME_ASSETS_URL=new URL('../color5.assets.json',import.meta.url).href;
  const WIGGLY_THEME_DECK_URL=new URL('../color5-full-nodata.deck',import.meta.url).href;
  const WIGGLY_THEME_CORE_URL=new URL('../decker-core.min.js',import.meta.url).href;
  let wigglyAssetsPromise=null;
  let wigglyDeckPromise=null;
  let wigglyCorePromise=null;
  const wigglyImageUrlCache=new Map();
  let wigglyPaletteCache=null;
  let wigglyPatternCache=null;
  let wigglyDimsRect=null;
  let wigglyCanvasSizeKey='';
  const wigglyAssetBrushCache=new Map();
  let markerShapeSlot=0;
  const MARKER_SHAPE_ASSET_FIRST=42;
  const MARKER_SHAPE_ASSET_LAST=53;
  let canvasViewportHomeStyle=null;
  let canvasViewportRestoreApplied=false;
  const canvasViewportHomeParent=canvasViewportEl ? canvasViewportEl.parentElement : null;
  const canvasViewportHomeNext=canvasViewportEl ? canvasViewportEl.nextSibling : null;
  let lastTool='';
  const TOOL_THICKNESS_WIDGETS=new Map([
    ['pencil',['field3','slider2']],
    ['pen',['field4','slider3']],
    ['eraser',['field5','slider4']],
  ]);
  function dispatchInput(el){
    if(!el) return;
    el.dispatchEvent(new Event('input',{ bubbles:true }));
  }
  function dispatchChange(el){
    if(!el) return;
    el.dispatchEvent(new Event('change',{ bubbles:true }));
  }
  async function loadWigglyAssets(){
  if(wigglyAssetsPromise) return wigglyAssetsPromise;
  wigglyAssetsPromise=(async ()=>{
    try{
      const res=await fetch(WIGGLY_THEME_ASSETS_URL);
      if(!res.ok) return [];
      const json=await res.json();
      return Array.isArray(json.assets) ? json.assets : [];
    }catch{
      return [];
    }
  })();
  return wigglyAssetsPromise;
}
  async function loadWigglyPatterns(){
  if(wigglyPatternCache) return wigglyPatternCache;
  const assets=await loadWigglyAssets();
  const raw=assets[0];
  if(typeof raw!=='string' || !raw.startsWith('%%IMG')){
    wigglyPatternCache={ pix:new Uint8Array(0), w:0, h:0 };
    return wigglyPatternCache;
  }
  const decoded=decodeDeckImageString(raw);
  if(!decoded || decoded.w<=0 || decoded.h<=0){
    wigglyPatternCache={ pix:new Uint8Array(0), w:0, h:0 };
    return wigglyPatternCache;
  }
  wigglyPatternCache={ pix:decoded.pix, w:decoded.w|0, h:decoded.h|0 };
  return wigglyPatternCache;
}
  async function loadWigglyDeckText(){
  if(wigglyDeckPromise) return wigglyDeckPromise;
  wigglyDeckPromise=(async ()=>{
    try{
      const res=await fetch(WIGGLY_THEME_DECK_URL);
      if(!res.ok) return '';
      return await res.text();
    }catch{
      return '';
    }
  })();
  return wigglyDeckPromise;
}
  async function loadWigglyCoreText(){
  if(wigglyCorePromise) return wigglyCorePromise;
  wigglyCorePromise=(async ()=>{
    try{
      const res=await fetch(WIGGLY_THEME_CORE_URL);
      if(!res.ok) return '';
      return await res.text();
    }catch{
      return '';
    }
  })();
  return wigglyCorePromise;
}
  function parseDeckWidgetMap(deckText){
  const cardStart=deckText.indexOf('{card:main}');
  if(cardStart<0) return { bgIndex:null, widgets:[] };
  const section=deckText.slice(cardStart);
  const imgMatch=section.match(/image:\s*"\{(\d+)\}"/);
  const bgIndex=imgMatch?Number(imgMatch[1]):null;
  const widgets=[];
  const widgetsStart=section.indexOf('{widgets}');
  console.log('[wiggly] parse', { cardStart, widgetsStart, len: deckText.length });
  if(widgetsStart<0) return { bgIndex, widgets };
  const widgetsText=section.slice(widgetsStart);
  let debugCount=0;
  const headerEnd=widgetsText.indexOf('\n');
  const startIndex=headerEnd>=0 ? headerEnd+1 : 0;
  const nameRegex=/(^|\n)\s*([A-Za-z0-9_-]+)\s*:/g;
  const scanStart=Math.max(0,startIndex-1);
  nameRegex.lastIndex=scanStart;
  let match;
  while((match=nameRegex.exec(widgetsText))){
    const name=match[2] || '';
    if(!name) continue;
    if(debugCount<12){
      console.log('[wiggly] widget name', name);
      debugCount++;
    }
    const colonIndex=match.index + match[0].lastIndexOf(':');
    const objInfo=extractJsonObjectAt(widgetsText,colonIndex+1);
    if(!objInfo) continue;
    let data=null;
    try{ data=JSON.parse(objInfo.json); }catch{ data=null; }
    if(data && Array.isArray(data.pos) && Array.isArray(data.size)){
      const type=String(data.type||'').trim() || 'widget';
      const imageIndex=extractImageIndexFromWidget(data);
      const interval=Array.isArray(data.interval) ? data.interval.map((n)=>Number(n)||0) : null;
      const valueNum=(typeof data.value==='number') ? Number(data.value) : null;
      widgets.push({
        id:name,
        type,
        pos:data.pos,
        size:data.size,
        show:data.show||'',
        style:data.style||'',
        text:typeof data.text==='string'?data.text:'',
        value:typeof data.value==='string'?data.value:'',
        interval,
        valueNum,
        imageIndex,
      });
    }
    nameRegex.lastIndex=objInfo.endIndex;
  }
  return { bgIndex, widgets };
}
  function extractImageIndexFromWidget(data){
  if(!data || typeof data!=='object') return null;
  if(typeof data.image==='string'){
    const m=data.image.match(/\{(\d+)\}/);
    if(m) return Number(m[1]);
  }
  if(data.widgets && typeof data.widgets==='object'){
    for(const key of Object.keys(data.widgets)){
      const child=data.widgets[key];
      if(child && typeof child==='object' && typeof child.image==='string'){
        const m=child.image.match(/\{(\d+)\}/);
        if(m) return Number(m[1]);
      }
    }
  }
  return null;
}
  function extractAssetIndex(placeholder){
  if(typeof placeholder!=='string') return null;
  const m=placeholder.match(/^\{(\d+)\}$/);
  return m?Number(m[1]):null;
}
  function decodeDeckImageToDataUrl(encoded,options){
  const decoded=decodeDeckImageString(encoded);
  if(!decoded) return '';
  const w=decoded.w|0;
  const h=decoded.h|0;
  if(!(w>0 && h>0)) return '';
  const canvas=document.createElement('canvas');
  canvas.width=w;
  canvas.height=h;
  const ctx=canvas.getContext('2d');
  if(!ctx) return '';
  const img=ctx.createImageData(w,h);
  const data=img.data;
  const transparentZero=Boolean(options && options.transparentZero);
  const transparentPaletteIndex0=Boolean(options && options.transparentPaletteIndex0);
  const palette=getWigglyPaletteFromColorMap();
  const pattern=wigglyPatternCache;
  for(let i=0;i<decoded.pix.length;i++){
    const v=decoded.pix[i]|0;
    const o=i*4;
    const x=i%w;
    const y=(i/w)|0;
    const colorIndex=mapDeckPixelToColorIndex(v,x,y,pattern,transparentZero);
    if(colorIndex<0){
      data[o+3]=0;
      continue;
    }
    if(transparentPaletteIndex0 && colorIndex===0){
      data[o+3]=0;
      continue;
    }
    const idx=Math.max(0,Math.min(palette.length-1,colorIndex|0));
    const color=palette[idx] || '#000000';
    const rgb=parseHexColor(color);
    data[o]=rgb[0];
    data[o+1]=rgb[1];
    data[o+2]=rgb[2];
    data[o+3]=255;
  }
  ctx.putImageData(img,0,0);
  return canvas.toDataURL('image/png');
}
  function mapDeckPixelToColorIndex(p,x,y,pattern,transparentZero){
  const pix=p&255;
  if(pix===0) return transparentZero ? -1 : 0;
  if(pix>47) return 0;
  if(pix>31) return pix-32;
  const bit=drawDeckPatternBit(pix,x,y,pattern);
  return bit?15:0;
}
  function drawDeckPatternBit(pix,x,y,pattern){
  if(pix<2) return pix?1:0;
  if(!pattern || pattern.w!==8 || !pattern.pix || pattern.pix.length===0) return 0;
  const px=(x&7);
  const py=(y&7);
  const idx=px+(8*py)+(64*(pix|0));
  if(idx<0 || idx>=pattern.pix.length) return 0;
  const v=pattern.pix[idx] ?? 0;
  return (v&1)?1:0;
}
  function parseHexColor(hex){
  let h=String(hex||'').trim();
  if(h.startsWith('#')) h=h.slice(1);
  if(h.length===3) h=h.split('').map((c)=>`${c}${c}`).join('');
  const n=parseInt(h,16);
  if(!Number.isFinite(n)) return [0,0,0];
  return [(n>>16)&255,(n>>8)&255,n&255];
}
  function getWigglyPaletteFromColorMap(){
  const palette=[];
  for(let i=1;i<=BASE_COLOR_COUNT;i++){
    palette.push(colorMap[i] ?? '#000000');
  }
  if(palette.length>=16){
    const tmp=palette[1];
    palette[1]=palette[15];
    palette[15]=tmp;
  }
  return palette;
}
  async function getWigglyImageUrl(placeholderIndex,options){
  await ensureWigglyPalette();
  await loadWigglyPatterns();
  const transparentZero=Boolean(options && options.transparentZero);
  const transparentPaletteIndex0=Boolean(options && options.transparentPaletteIndex0);
  const patternReady=Boolean(wigglyPatternCache && wigglyPatternCache.w===8 && wigglyPatternCache.pix && wigglyPatternCache.pix.length);
  const palette=getWigglyPaletteFromColorMap();
  const paletteReady=palette.length===16;
  const paletteKey=palette.join('|');
  const cacheKey=`${placeholderIndex}|${patternReady?1:0}|${paletteReady?1:0}|${transparentZero?1:0}|${transparentPaletteIndex0?1:0}|${paletteKey}`;
  if(wigglyImageUrlCache.has(cacheKey)) return wigglyImageUrlCache.get(cacheKey);
  const assets=await loadWigglyAssets();
  const assetRaw=assets[placeholderIndex];
  if(typeof assetRaw!=='string' || !assetRaw.startsWith('%%IMG')){
    wigglyImageUrlCache.set(cacheKey,'');
    return '';
  }
  const url=decodeDeckImageToDataUrl(assetRaw,{ transparentZero, transparentPaletteIndex0 });
  wigglyImageUrlCache.set(cacheKey,url);
  return url;
}
  async function ensureWigglyPalette(){
  wigglyPaletteCache=getWigglyPaletteFromColorMap();
  return wigglyPaletteCache;
}

  async function getDeckAssetBrush(placeholderIndex,options){
    await loadWigglyPatterns();
    const idxNum=Number(placeholderIndex)||0;
    if(idxNum<0) return null;
    const isMarkerShape=(idxNum>=MARKER_SHAPE_ASSET_FIRST && idxNum<=MARKER_SHAPE_ASSET_LAST);
    const transparentZero=(options && typeof options.transparentZero==='boolean')
      ? options.transparentZero
      : isMarkerShape;
    const transparentPaletteIndex0=(options && typeof options.transparentPaletteIndex0==='boolean')
      ? options.transparentPaletteIndex0
      : isMarkerShape;
    const patternReady=Boolean(wigglyPatternCache && wigglyPatternCache.w===8 && wigglyPatternCache.pix && wigglyPatternCache.pix.length);
    const cacheKey=`${idxNum}|${patternReady?1:0}|${transparentZero?1:0}|${transparentPaletteIndex0?1:0}`;
    if(wigglyAssetBrushCache.has(cacheKey)) return wigglyAssetBrushCache.get(cacheKey) || null;
    const assets=await loadWigglyAssets();
    const raw=assets[idxNum];
    if(typeof raw!=='string' || !raw.startsWith('%%IMG')){
      wigglyAssetBrushCache.set(cacheKey,null);
      return null;
    }
    const decoded=decodeDeckImageString(raw);
    if(!decoded || !(decoded.w>0 && decoded.h>0) || !(decoded.pix instanceof Uint8Array)){
      wigglyAssetBrushCache.set(cacheKey,null);
      return null;
    }
    const w=decoded.w|0;
    const h=decoded.h|0;
    const mask=new Uint8Array((w*h)|0);
    const pattern=wigglyPatternCache;
    for(let i=0;i<mask.length;i++){
      const v=decoded.pix[i]|0;
      const x=i%w;
      const y=(i/w)|0;
      const colorIndex=mapDeckPixelToColorIndex(v,x,y,pattern,transparentZero);
      if(colorIndex<0){
        mask[i]=0;
        continue;
      }
      if(transparentPaletteIndex0 && colorIndex===0){
        mask[i]=0;
        continue;
      }
      mask[i]=1;
    }
    const brush={ w, h, mask };
    wigglyAssetBrushCache.set(cacheKey,brush);
    return brush;
  }
  async function updateMarkerSizesDisplay(placeholderIndex){
    if(!containerEl) return;
    const markerEl=containerEl.querySelector('.wiggly-widget[data-name="markerSizes"]');
    if(!markerEl) return;
    const shapeEl=markerEl.querySelector('.wiggly-marker-shape');
    if(!shapeEl) return;
    const idx=Number(placeholderIndex)||0;
    const wanted=String(idx);
    markerEl.dataset.markerPlaceholder=wanted;
    const isMarkerShape=(idx>=MARKER_SHAPE_ASSET_FIRST && idx<=MARKER_SHAPE_ASSET_LAST);
    const transparentPaletteIndex0=isMarkerShape;
    const [url,brush]=await Promise.all([
      getWigglyImageUrl(idx,{ transparentZero:true, transparentPaletteIndex0 }),
      getDeckAssetBrush(idx,{ transparentZero:true, transparentPaletteIndex0 }),
    ]);
    if(markerEl.dataset.markerPlaceholder!==wanted) return;
    if(!url){
      shapeEl.style.removeProperty('background-image');
      return;
    }
    shapeEl.style.backgroundImage=`url("${url}")`;
    if(brush && brush.w>0 && brush.h>0){
      shapeEl.style.backgroundSize=`${brush.w|0}px ${brush.h|0}px`;
    }else{
      shapeEl.style.removeProperty('background-size');
    }
    shapeEl.style.imageRendering='pixelated';
  }
  function clearWigglyThemeWidgets(){
  if(!containerEl) return;
  const nodes=[...containerEl.querySelectorAll('.wiggly-widget')];
  for(const node of nodes) node.remove();
  if(wigglyThemeEl) wigglyThemeEl.dataset.ready='0';
}
  function classifyWidgetClass(widget){
  if(widget.type==='slider') return 'slider';
  if(widget.type==='field') return 'field';
  if(widget.style==='check') return 'check';
  return widget.type||'widget';
}
  function resolveWigglyTargetId(name){
    if(!name) return '';
    if(WIGGLY_BUTTON_TARGETS.has(name)) return WIGGLY_BUTTON_TARGETS.get(name) || '';
    if(document.getElementById(name)) return name;
    const lowerFirst=name.charAt(0).toLowerCase()+name.slice(1);
    if(lowerFirst && document.getElementById(lowerFirst)) return lowerFirst;
    const lowerAll=name.toLowerCase();
    if(lowerAll && document.getElementById(lowerAll)) return lowerAll;
    return '';
  }
  function markClickable(el){
    if(el) el.classList.add('wiggly-clickable');
  }
  function setWidgetChecked(el,on){
    if(!el) return;
    el.classList.toggle('is-checked',Boolean(on));
  }
  function setWidgetPressed(el,on){
    if(!el) return;
    el.classList.toggle('is-pressed',Boolean(on));
  }
  function getSliderParts(el){
    if(!el) return { track:null, thumb:null };
    const track=el.querySelector('.wiggly-slider-track');
    const thumb=el.querySelector('.wiggly-slider-thumb');
    return { track, thumb };
  }
  function updateSliderThumb(el,value,min,max){
    if(!el) return;
    const { thumb }=getSliderParts(el);
    if(!thumb) return;
    const a=Number(min);
    const b=Number(max);
    const v=Number(value);
    const denom=(b-a);
    const t=(denom>0) ? ((v-a)/denom) : 0;
    const pct=Math.max(0,Math.min(1,t))*100;
    thumb.style.left=`${pct}%`;
  }
  function setSliderValue(el,value){
    if(!el) return;
    const min=Number(el.dataset.min);
    const max=Number(el.dataset.max);
    const v=Number(value);
    if(Number.isFinite(v)) el.dataset.value=String(v);
    updateSliderThumb(el,v,min,max);
  }
  function mapSlider1ToJitterLevel(v){
    const raw=Number(v)||0;
    return Math.max(0,Math.min(10,Math.round(raw/2)));
  }
  function mapJitterLevelToSlider1(level){
    const raw=Math.max(0,Math.min(10,Number(level)||0));
    return Math.max(1,Math.min(20,Math.round(raw*2)));
  }
  function mapSpeedSliderToDelayMs(v){
    const raw=Math.max(1,Math.min(20,Number(v)||1));
    return Math.max(20,Math.round(((raw/5)*120)/10)*10);
  }
  function mapDelayMsToSpeedSlider(ms){
    const raw=Math.max(20,Number(ms)||120);
    return Math.max(1,Math.min(20,Math.round((raw/120)*5)));
  }
  function readHostCheckbox(id){
    const el=document.getElementById(id);
    return Boolean(el && el.checked);
  }
  function readHostNumberValue(id,fallback){
    const el=document.getElementById(id);
    const v=Number(el && el.value);
    return Number.isFinite(v) ? v : fallback;
  }
  function applySliderToHost(widgetId,value){
    const v=Number(value)||0;
    if(widgetId==='slider1'){
      const target=document.getElementById('jitter');
      if(target){
        target.value=String(mapSlider1ToJitterLevel(v));
        dispatchInput(target);
      }
      return;
    }
    if(widgetId==='speedSlider'){
      const target=document.getElementById('jitterDelay');
      if(target){
        target.value=String(mapSpeedSliderToDelayMs(v));
        dispatchChange(target);
      }
      return;
    }
    if(widgetId==='slider2' || widgetId==='slider3' || widgetId==='slider4'){
      const target=document.getElementById('size');
      if(target){
        target.value=String(Math.max(1,Math.round(v)));
        dispatchInput(target);
      }
      return;
    }
  }
  function getSliderValueFromHost(widgetId){
    if(widgetId==='slider1'){
      const lvl=readHostNumberValue('jitter',1);
      return mapJitterLevelToSlider1(lvl);
    }
    if(widgetId==='speedSlider'){
      const ms=readHostNumberValue('jitterDelay',120);
      return mapDelayMsToSpeedSlider(ms);
    }
    if(widgetId==='slider2' || widgetId==='slider3' || widgetId==='slider4'){
      return readHostNumberValue('size',1);
    }
    return Number.NaN;
  }
  function bindWigglySliderAction(el,widget){
    if(!el || !widget || widget.type!=='slider') return;
    if(!Array.isArray(widget.interval) || widget.interval.length<2) return;
    const min=Number(widget.interval[0]);
    const max=Number(widget.interval[1]);
    if(!Number.isFinite(min) || !Number.isFinite(max) || !(max>min)) return;
    el.dataset.min=String(min);
    el.dataset.max=String(max);
    el.dataset.value=String(Number(widget.valueNum)||min);
    updateSliderThumb(el,Number(el.dataset.value),min,max);
    markClickable(el);
    const calcValue=(clientX)=>{
      const { track }=getSliderParts(el);
      const r=(track || el).getBoundingClientRect();
      const x=Math.max(0,Math.min(r.width,(Number(clientX)||0)-r.left));
      const t=(r.width>0) ? (x/r.width) : 0;
      const raw=min+t*(max-min);
      return Math.round(raw);
    };
    let active=false;
    const move=(e)=>{
      if(!active) return;
      e.preventDefault();
      const next=calcValue(e.clientX);
      setSliderValue(el,next);
      applySliderToHost(widget.id,next);
    };
    const up=()=>{
      if(!active) return;
      active=false;
      window.removeEventListener('pointermove',move,{ capture:true });
      window.removeEventListener('pointerup',up,{ capture:true });
    };
    el.addEventListener('pointerdown',(e)=>{
      e.preventDefault();
      e.stopPropagation();
      active=true;
      setSliderValue(el,calcValue(e.clientX));
      applySliderToHost(widget.id,Number(el.dataset.value));
      window.addEventListener('pointermove',move,{ capture:true });
      window.addEventListener('pointerup',up,{ capture:true });
    });
  }
  function bindWigglyButtonAction(el,widget){
    if(!el || !widget) return;
    if(widget.id==='button5' || widget.id==='button6') return;
    if(widget.id==='target' || widget.id==='dims') return;
    if(widget.type!=='button' && widget.type!=='contraption') return;
    // 支持两类调色部件：
    // - hi32..hi47：点击后选择 1..16 的基础调色
    // - hi2..hi31：点击后选择 52..81 的别名值（渲染时折算回 1..16）
    const colorValue=WIGGLY_COLOR_VALUE_MAP.get(widget.id);
    if(colorValue!=null){
      markClickable(el);
      el.addEventListener('click',(e)=>{
        e.preventDefault();
        e.stopPropagation();
        const setter=window && window.setPaletteFromTheme;
        if(typeof setter==='function'){
          console.log('[wiggly] click',widget.id,'->',`palette ${colorValue}`,'targetFound=',false);
          setter(colorValue);
        }else{
          const target=document.querySelector(`.palette-btn[data-value="${colorValue}"]`);
          console.log('[wiggly] click',widget.id,'->',`palette ${colorValue}`,'targetFound=',Boolean(target));
          if(target && !target.disabled) target.click();
        }
      });
      return;
    }
    const targetId=resolveWigglyTargetId(widget.id);
    if(!targetId) return;
    markClickable(el);
    if(el.classList.contains('is-invisible-btn')){
      const clear=()=>setWidgetPressed(el,false);
      el.addEventListener('pointerdown',()=>setWidgetPressed(el,true));
      el.addEventListener('pointerup',clear);
      el.addEventListener('pointercancel',clear);
      el.addEventListener('pointerleave',clear);
    }
    el.addEventListener('click',(e)=>{
      e.preventDefault();
      e.stopPropagation();
      const target=document.getElementById(targetId);
      console.log('[wiggly] click',widget.id,'->',targetId,'targetFound=',Boolean(target),'disabled=',Boolean(target && target.disabled));
      const needsDefaultTheme=(widget.id==='button2' || widget.id==='button4');
      if(needsDefaultTheme){
        if(widget.id==='button4' && typeof onRequestReturnAfterColor==='function') onRequestReturnAfterColor();
        if(widget.id==='button2' && typeof onRequestReturnAfterCrop==='function') onRequestReturnAfterCrop();
        if(typeof onSwitchToDefaultTheme==='function') onSwitchToDefaultTheme();
        setTimeout(()=>{
          const t=document.getElementById(targetId);
          if(t && !t.disabled) t.click();
        },0);
        return;
      }
      if(target && !target.disabled) target.click();
      setTimeout(()=>syncWigglyControlStates(lastTool),0);
    });
  }
  function syncWigglyToolThicknessVisibility(tool){
    if(!containerEl) return;
    if(!containerEl.classList.contains('advanced')) return;
    const ids=[];
    for(const pair of TOOL_THICKNESS_WIDGETS.values()){
      for(const id of pair) ids.push(id);
    }
    const activePair=TOOL_THICKNESS_WIDGETS.get(tool||'') || null;
    for(const id of ids){
      const node=containerEl.querySelector(`.wiggly-widget[data-name="${id}"]`);
      if(!node) continue;
      if(activePair && activePair.includes(id)) node.style.display='';
      else node.style.display='none';
    }
  }
  function syncWigglyControlStates(tool){
    if(!containerEl) return;
    const toggleEl=containerEl.querySelector('.wiggly-widget[data-name="toggleWiggle"]');
    if(toggleEl) setWidgetChecked(toggleEl,readHostCheckbox('jitterOn'));
    const eraseLinesEl=containerEl.querySelector('.wiggly-widget[data-name="eraseLinesOnly"]');
    if(eraseLinesEl) setWidgetChecked(eraseLinesEl,readHostCheckbox('eraseOnlyOutline'));
    const eraseColorsEl=containerEl.querySelector('.wiggly-widget[data-name="eraseColorsOnly"]');
    if(eraseColorsEl) setWidgetChecked(eraseColorsEl,readHostCheckbox('eraseOnlyEraser'));
    for(const id of ['slider1','speedSlider','slider2','slider3','slider4']){
      const sliderEl=containerEl.querySelector(`.wiggly-widget[data-name="${id}"]`);
      if(!sliderEl) continue;
      const v=getSliderValueFromHost(id);
      if(Number.isFinite(v)) setSliderValue(sliderEl,v);
    }
    syncWigglyToolThicknessVisibility(tool);
  }
  function syncWigglyActiveStates(tool,paletteValue){
    lastTool=String(tool||'');
    if(!containerEl) return;
    const nodes=[...containerEl.querySelectorAll('.wiggly-widget')];
    for(const node of nodes) node.classList.remove('is-active');
    const toolId=WIGGLY_TOOL_WIDGETS.get(tool||'');
    if(toolId){
      const toolEl=containerEl.querySelector(`.wiggly-widget[data-name="${toolId}"]`);
      if(toolEl) toolEl.classList.add('is-active');
    }
    if((tool||'')==='palette'){
      // 当 paletteValue 为 1..16，激活 hi32..hi47；
      // 当 paletteValue 为 52..81，激活 hi2..hi31。
      const v=Number(paletteValue)||0;
      let activeId='';
      if(v>=1 && v<=16){
        const idx=v-1;
        activeId=WIGGLY_COLOR_IDS[idx] || '';
      }else if(v>=52 && v<=81){
        const aliasNum=2+(v-52); // 52->hi2, 81->hi31
        activeId=`hi${aliasNum}`;
      }
      if(activeId){
        const colorEl=containerEl.querySelector(`.wiggly-widget[data-name="${activeId}"]`);
        if(colorEl) colorEl.classList.add('is-active');
      }
    }
    syncWigglyControlStates(tool);
  }
  function moveCanvasViewportToContainer(){
    if(!canvasViewportEl || !containerEl) return;
    if(canvasViewportEl.parentElement!==containerEl) containerEl.appendChild(canvasViewportEl);
  }
  function captureCanvasViewportHomeStyle(){
    if(!canvasViewportEl || canvasViewportHomeStyle) return;
    canvasViewportHomeStyle={
      left: canvasViewportEl.style.left || '',
      top: canvasViewportEl.style.top || '',
      width: canvasViewportEl.style.width || '',
      height: canvasViewportEl.style.height || '',
      display: canvasViewportEl.style.display || '',
    };
  }
  function restoreCanvasViewportStyle(){
    if(!canvasViewportEl || !canvasViewportHomeStyle) return;
    canvasViewportEl.style.left=canvasViewportHomeStyle.left;
    canvasViewportEl.style.top=canvasViewportHomeStyle.top;
    canvasViewportEl.style.width=canvasViewportHomeStyle.width;
    canvasViewportEl.style.height=canvasViewportHomeStyle.height;
    canvasViewportEl.style.display=canvasViewportHomeStyle.display;
  }
  function restoreCanvasViewport(){
    if(!canvasViewportEl || !canvasViewportHomeParent) return;
    if(canvasViewportEl.parentElement===canvasViewportHomeParent) return;
    if(canvasViewportHomeNext && canvasViewportHomeNext.parentElement===canvasViewportHomeParent){
      canvasViewportHomeParent.insertBefore(canvasViewportEl,canvasViewportHomeNext);
    }else{
      canvasViewportHomeParent.appendChild(canvasViewportEl);
    }
  }
  async function buildWigglyThemeWidgets(){
  if(!wigglyThemeEl || !containerEl) return;
  clearWigglyThemeWidgets();
  const deckText=await loadWigglyDeckText();
  if(!deckText) return;
  const parsed=parseDeckWidgetMap(deckText);
  wigglyDimsRect=null;
  wigglyThemeEl.dataset.ready='1';
  wigglyThemeEl.dataset.buildId=WIGGLY_BUILD_ID;
  console.log('[wiggly] build widgets start');
  let sawDims=false;
  for(const widget of parsed.widgets){
    if(widget.id==='dims'){
      wigglyDimsRect={
        x:Number(widget.pos[0])||0,
        y:Number(widget.pos[1])||0,
        w:Number(widget.size[0])||0,
        h:Number(widget.size[1])||0,
      };
      sawDims=true;
      console.log('[wiggly] dims',wigglyDimsRect);
      continue;
    }
    if(ALWAYS_HIDE_NAMES.has(widget.id)) continue;
    if(widget.type==='button' && !KEEP_BUTTON_NAMES.has(widget.id)) continue;
    const el=document.createElement('div');
    el.className=`wiggly-widget ${classifyWidgetClass(widget)}`;
    el.style.left=`${widget.pos[0]}px`;
    el.style.top=`${widget.pos[1]}px`;
    el.style.width=`${widget.size[0]}px`;
    el.style.height=`${widget.size[1]}px`;
    el.dataset.name=widget.id;
    if(widget.show) el.dataset.show=widget.show;
    if(widget.text) el.dataset.text=widget.text;
    el.dataset.advanced=widget.show==='none' ? '1' : '0';
    const hiMatch=/^hi(\d+)$/.exec(widget.id);
    const hiNum=hiMatch ? (Number(hiMatch[1])||0) : 0;
    if(hiNum>=2 && hiNum<=47){
      el.dataset.palette='1';
    }else{
      el.dataset.palette='0';
    }
    if(widget.imageIndex!=null && widget.id!=='markerSizes'){
      el.dataset.imgIndex=String(widget.imageIndex);
      el.classList.add('has-image');
    }
    const isInvisibleButton=(widget.style==='invisible') || (widget.type==='button' && !widget.text && !widget.value && widget.imageIndex==null && widget.style!=='check');
    if(isInvisibleButton) el.classList.add('is-invisible-btn');
    if(widget.id==='button5' && typeof onToggleAdvanced==='function'){
      markClickable(el);
      el.addEventListener('click',(e)=>{
        e.preventDefault();
        e.stopPropagation();
        onToggleAdvanced();
      });
    }
    if(widget.id==='button6' && typeof onDisableAdvanced==='function'){
      markClickable(el);
      el.addEventListener('click',(e)=>{
        e.preventDefault();
        e.stopPropagation();
        onDisableAdvanced();
      });
    }
    if(widget.id==='markerSizes'){
      markClickable(el);
      const cover=document.createElement('div');
      cover.className='wiggly-marker-cover';
      cover.setAttribute('aria-hidden','true');
      const shape=document.createElement('div');
      shape.className='wiggly-marker-shape';
      shape.setAttribute('aria-hidden','true');
      el.appendChild(cover);
      el.appendChild(shape);
      if(wigglyThemeEl){
        const saved=Number(wigglyThemeEl.dataset.markerShapeSlot);
        if(Number.isFinite(saved) && saved>=0) markerShapeSlot=saved|0;
      }
      const getSlotCount=()=>Math.max(0,(MARKER_SHAPE_ASSET_LAST-MARKER_SHAPE_ASSET_FIRST+1)|0);
      el.addEventListener('click',(e)=>{
        e.preventDefault();
        e.stopPropagation();
        const rect=el.getBoundingClientRect();
        const localX=(e.clientX-rect.left);
        const ratio=(rect.width>0)?(localX/rect.width):0.5;
        const count=getSlotCount();
        if(count<=0) return;
        let delta=0;
        if(ratio<=0.2) delta=-1;
        else if(ratio>=0.8) delta=1;
        else return;
        markerShapeSlot=((markerShapeSlot+delta)%count+count)%count;
        if(wigglyThemeEl) wigglyThemeEl.dataset.markerShapeSlot=String(markerShapeSlot|0);
        const placeholder=(MARKER_SHAPE_ASSET_FIRST+markerShapeSlot)|0;
        const setter=window && window.setMarkerBrushFromTheme;
        if(typeof setter==='function'){
          void setter(placeholder);
        }
        void updateMarkerSizesDisplay(placeholder);
      });
    }
    bindWigglyButtonAction(el,widget);
    if(widget.style==='check'){
      el.classList.add('check');
      const box=document.createElement('span');
      box.className='wiggly-check';
      el.appendChild(box);
      if(widget.valueNum!=null) setWidgetChecked(el,Boolean(widget.valueNum));
    }
    if(widget.text){
      const text=document.createElement('span');
      text.textContent=widget.text;
      el.appendChild(text);
    }else if(widget.value && widget.type==='field'){
      const text=document.createElement('span');
      text.textContent=widget.value;
      el.appendChild(text);
    }
    if(widget.type==='slider'){
      const track=document.createElement('div');
      track.className='wiggly-slider-track';
      const thumb=document.createElement('div');
      thumb.className='wiggly-slider-thumb';
      el.appendChild(track);
      el.appendChild(thumb);
      bindWigglySliderAction(el,widget);
    }
    if(widget.show==='none') el.classList.add('is-ghost');
    if(ADVANCED_HIDE_NAMES.has(widget.id)) el.dataset.advHide='1';
    containerEl.appendChild(el);
  }
  if(typeof onSwitchToDefaultTheme==='function'){
    const el=document.createElement('div');
    el.className='wiggly-widget';
    el.style.left='5px';
    el.style.top='3px';
    el.style.width='120px';
    el.style.height='20px';
    el.dataset.name='switchDefaultTheme';
    el.dataset.advanced='0';
    el.dataset.palette='0';
    const text=document.createElement('span');
    text.textContent='默认主题';
    el.appendChild(text);
    markClickable(el);
    el.addEventListener('click',(e)=>{
      e.preventDefault();
      e.stopPropagation();
      onSwitchToDefaultTheme();
    });
    containerEl.appendChild(el);
  }
  if(parsed.bgIndex!=null){
    wigglyThemeEl.dataset.bgIndex=String(parsed.bgIndex);
  }else{
    wigglyThemeEl.dataset.bgIndex='';
  }
  console.log('[wiggly] build widgets done','count=',wigglyThemeEl.querySelectorAll('.wiggly-widget').length,'sawDims=',sawDims);
}
  function syncWigglyThemeButtons(){
  if(!containerEl) return;
  const isColorMode=Boolean(containerEl && containerEl.classList.contains('color-mode'));
  const isAdvanced=Boolean(containerEl && containerEl.classList.contains('advanced'));
  const advancedEl=containerEl.querySelector('.wiggly-widget[data-name="button5"]');
  const backEl=containerEl.querySelector('.wiggly-widget[data-name="button6"]');
  const showBack=(!isColorMode && isAdvanced);
  if(backEl) backEl.style.display=showBack ? '' : 'none';
  if(advancedEl) advancedEl.style.display=(!isColorMode && !showBack) ? '' : 'none';
}
  function syncWigglyCanvasViewport(){
    if(!canvasViewportEl) return;
    if(!isWigglyUiTheme()){
      captureCanvasViewportHomeStyle();
      restoreCanvasViewport();
      console.log('[wiggly] canvas viewport reset');
      if(canvasViewportRestoreApplied){
        restoreCanvasViewportStyle();
        canvasViewportRestoreApplied=false;
      }
      return;
    }
    captureCanvasViewportHomeStyle();
    moveCanvasViewportToContainer();
    canvasViewportEl.style.display='';
    if(wigglyDimsRect && wigglyDimsRect.w>0 && wigglyDimsRect.h>0){
      canvasViewportEl.style.left=`${wigglyDimsRect.x}px`;
      canvasViewportEl.style.top=`${wigglyDimsRect.y}px`;
      canvasViewportEl.style.width=`${wigglyDimsRect.w}px`;
      canvasViewportEl.style.height=`${wigglyDimsRect.h}px`;
      const nextKey=`${wigglyDimsRect.w}x${wigglyDimsRect.h}`;
      if(nextKey!==wigglyCanvasSizeKey){
        wigglyCanvasSizeKey=nextKey;
        console.log('[wiggly] canvas size update',wigglyDimsRect,'parent=',canvasViewportEl.parentElement && canvasViewportEl.parentElement.className);
      }
      canvasViewportRestoreApplied=true;
    }else{
      console.log('[wiggly] canvas dims missing',wigglyDimsRect);
    }
  }
  function syncWigglyThemeAdvancedVisibility(){
  if(!containerEl) return;
    const isAdvanced=Boolean(containerEl && containerEl.classList.contains('advanced'));
    const isColorMode=Boolean(containerEl && containerEl.classList.contains('color-mode'));
  const nodes=[...containerEl.querySelectorAll('.wiggly-widget')];
    for(const node of nodes){
      const name=node.dataset.name || '';
      if(name==='button5' || name==='button6'){
        const showBack=(!isColorMode && isAdvanced);
        if(name==='button6') node.style.display=showBack ? '' : 'none';
        if(name==='button5') node.style.display=(!isColorMode && !showBack) ? '' : 'none';
        continue;
      }
      if(ALWAYS_HIDE_NAMES.has(name)){
        node.remove();
        continue;
      }
      if(ALWAYS_SHOW_NAMES.has(name)){
        node.style.display='';
        node.classList.remove('is-ghost');
        continue;
      }
      const isAdvancedWidget=node.dataset.advanced==='1';
      const isPaletteWidget=node.dataset.palette==='1';
      const isAdvancedHide=node.dataset.advHide==='1';
      const isAdvancedShow=ADVANCED_SHOW_NAMES.has(name);
      if(isAdvanced){
        if(isAdvancedHide) node.style.display='none';
        else if(isAdvancedWidget){
          if(isAdvancedShow){
            node.style.display='';
            node.classList.remove('is-ghost');
          }else{
            node.style.display='none';
          }
        }else if(isPaletteWidget) node.style.display='none';
        else node.style.display='';
      }else{
        if(isAdvancedWidget){
          node.style.display='none';
          node.classList.add('is-ghost');
        }else if(isPaletteWidget) node.style.display='';
        else node.style.display='';
      }
    }
  }
  async function applyWigglyThemeImages(){
  if(!wigglyThemeEl || !isWigglyUiTheme()) return;
  console.log('[wiggly] apply images');
  await ensureWigglyPalette();
  await loadWigglyPatterns();
  if(wigglyThemeEl.dataset.ready!=='1' || wigglyThemeEl.dataset.buildId!==WIGGLY_BUILD_ID) await buildWigglyThemeWidgets();
  syncWigglyThemeButtons();
  syncWigglyThemeAdvancedVisibility();
  syncWigglyCanvasViewport();
  const bgIndex=Number(wigglyThemeEl.dataset.bgIndex);
  if(Number.isFinite(bgIndex)){
    const bgUrl=await getWigglyImageUrl(bgIndex,{ transparentZero:false });
    if(bgUrl){
      wigglyThemeEl.style.removeProperty('background-image');
      if(stageEl) stageEl.style.backgroundImage=`url("${bgUrl}")`;
      if(stageEl) stageEl.style.backgroundSize='100% 100%';
      if(stageEl) stageEl.style.backgroundRepeat='no-repeat';
      if(stageEl) stageEl.style.imageRendering='pixelated';
    }
  }
  const nodes=[...containerEl.querySelectorAll('.wiggly-widget[data-img-index]')];
  for(const node of nodes){
    if(node && node.dataset && node.dataset.name==='markerSizes'){
      node.style.removeProperty('background-image');
      continue;
    }
    const placeholder=Number(node.dataset.imgIndex);
    if(!Number.isFinite(placeholder)) continue;
    const url=await getWigglyImageUrl(placeholder,{ transparentZero:true });
    if(!url) continue;
    node.style.backgroundImage=`url("${url}")`;
    node.style.imageRendering='pixelated';
  }
  const savedSlot=Number(wigglyThemeEl.dataset.markerShapeSlot);
  const slot=Number.isFinite(savedSlot) && savedSlot>=0 ? (savedSlot|0) : (markerShapeSlot|0);
  const count=Math.max(0,(MARKER_SHAPE_ASSET_LAST-MARKER_SHAPE_ASSET_FIRST+1)|0);
  if(count>0){
    markerShapeSlot=((slot%count)+count)%count;
    wigglyThemeEl.dataset.markerShapeSlot=String(markerShapeSlot|0);
    const placeholder=(MARKER_SHAPE_ASSET_FIRST+markerShapeSlot)|0;
    void updateMarkerSizesDisplay(placeholder);
    const setter=window && window.setMarkerBrushFromTheme;
    if(typeof setter==='function') void setter(placeholder);
  }
}
  function applyWigglyTheme(){
  if(!wigglyThemeEl) return;
  if(!isWigglyUiTheme()){
    wigglyThemeEl.style.removeProperty('background-image');
    if(stageEl) stageEl.style.removeProperty('background-image');
    if(stageEl){
      stageEl.style.removeProperty('background-size');
      stageEl.style.removeProperty('background-repeat');
      stageEl.style.removeProperty('image-rendering');
    }
    syncWigglyCanvasViewport();
    return;
  }
  void applyWigglyThemeImages();
}
  // 暴露 deck 图案为 8x8 画笔掩码，供主程序“调色笔”使用
  async function getDeckPatternBrush(pixIndex){
    await loadWigglyPatterns();
    const pat=wigglyPatternCache;
    const idxNum=Number(pixIndex)||0;
    if(!pat || pat.w!==8 || !pat.pix || !pat.pix.length) return null;
    if(idxNum<2 || idxNum>31) return null;
    const mask=new Uint8Array(8*8);
    for(let py=0;py<8;py++){
      for(let px=0;px<8;px++){
        const i=px+(8*py)+(64*(idxNum|0));
        const v=(i>=0 && i<pat.pix.length) ? (pat.pix[i]&1) : 0;
        mask[py*8+px]=v?1:0;
      }
    }
    return { w:8, h:8, mask };
  }
  async function getWigglyDimsSize(){
    if(wigglyDimsRect && wigglyDimsRect.w>0 && wigglyDimsRect.h>0){
      return [wigglyDimsRect.w|0,wigglyDimsRect.h|0];
    }
    const deckText=await loadWigglyDeckText();
    if(!deckText) return null;
    const parsed=parseDeckWidgetMap(deckText);
    if(!parsed || !Array.isArray(parsed.widgets)) return null;
    const dimsWidget=parsed.widgets.find((widget)=>widget && widget.id==='dims');
    if(dimsWidget && Array.isArray(dimsWidget.size)){
      const w=Number(dimsWidget.size[0])||0;
      const h=Number(dimsWidget.size[1])||0;
      if(w>0 && h>0){
        const pos=Array.isArray(dimsWidget.pos) ? dimsWidget.pos : [0,0];
        wigglyDimsRect={
          x:Number(pos[0])||0,
          y:Number(pos[1])||0,
          w,
          h,
        };
        return [w|0,h|0];
      }
    }
    return null;
  }
  function normalizeUiTheme(raw){
    return raw==='wigglypaint'?'wigglypaint':(raw==='cat'?'cat':(raw==='cute'?'cute':''));
  }
  function isWigglyUiTheme(){
    return document.body.getAttribute('data-ui-theme')==='wigglypaint';
  }
  return {
    applyWigglyTheme,
    applyWigglyThemeImages,
    isWigglyUiTheme,
    normalizeUiTheme,
    syncWigglyActiveStates,
    syncWigglyThemeButtons,
    syncWigglyCanvasViewport,
    syncWigglyThemeAdvancedVisibility,
    getWigglyDimsSize,
    getDeckPatternBrush,
    getDeckAssetBrush,
  };
}
