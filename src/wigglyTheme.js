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
  ]);
  const WIGGLY_COLOR_IDS=[];
  for(let i=32;i<=47;i++) WIGGLY_COLOR_IDS.push(`hi${i}`);
  const WIGGLY_COLOR_VALUE_MAP=new Map(WIGGLY_COLOR_IDS.map((id,idx)=>[id,idx+1]));
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
    'toggleWiggle','gifImportBtn','dd','dither','rescale','eraseLinesOnly','eraseColorsOnly',
  ]);
  const ADVANCED_SHOW_NAMES=new Set([
    'button6',
    'dd','field2','slider1','field3','slider2','speedLabel','speedSlider',
    'gifImportBtn','dither','rescale','eraseLinesOnly','eraseColorsOnly',
    'field4','slider3','field5',
  ]);
  const ALWAYS_SHOW_NAMES=new Set([
    'pencil','pen','Blobby','StippleTiny','SoftLrg',
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
  let canvasViewportHomeStyle=null;
  let canvasViewportRestoreApplied=false;
  const canvasViewportHomeParent=canvasViewportEl ? canvasViewportEl.parentElement : null;
  const canvasViewportHomeNext=canvasViewportEl ? canvasViewportEl.nextSibling : null;
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
      widgets.push({
        id:name,
        type,
        pos:data.pos,
        size:data.size,
        show:data.show||'',
        style:data.style||'',
        text:typeof data.text==='string'?data.text:'',
        value:typeof data.value==='string'?data.value:'',
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
  return palette;
}
  async function getWigglyImageUrl(placeholderIndex,options){
  await ensureWigglyPalette();
  await loadWigglyPatterns();
  const transparentZero=Boolean(options && options.transparentZero);
  const patternReady=Boolean(wigglyPatternCache && wigglyPatternCache.w===8 && wigglyPatternCache.pix && wigglyPatternCache.pix.length);
  const palette=getWigglyPaletteFromColorMap();
  const paletteReady=palette.length===16;
  const paletteKey=palette.join('|');
  const cacheKey=`${placeholderIndex}|${patternReady?1:0}|${paletteReady?1:0}|${transparentZero?1:0}|${paletteKey}`;
  if(wigglyImageUrlCache.has(cacheKey)) return wigglyImageUrlCache.get(cacheKey);
  const assets=await loadWigglyAssets();
  const assetRaw=assets[placeholderIndex];
  if(typeof assetRaw!=='string' || !assetRaw.startsWith('%%IMG')){
    wigglyImageUrlCache.set(cacheKey,'');
    return '';
  }
  const url=decodeDeckImageToDataUrl(assetRaw,{ transparentZero });
  wigglyImageUrlCache.set(cacheKey,url);
  return url;
}
  async function ensureWigglyPalette(){
  wigglyPaletteCache=getWigglyPaletteFromColorMap();
  return wigglyPaletteCache;
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
  function bindWigglyButtonAction(el,widget){
    if(!el || !widget) return;
    if(widget.id==='button5' || widget.id==='button6') return;
    if(widget.id==='target' || widget.id==='dims') return;
    if(widget.type!=='button' && widget.type!=='contraption') return;
    const colorValue=WIGGLY_COLOR_VALUE_MAP.get(widget.id);
    if(colorValue!=null){
      markClickable(el);
      el.addEventListener('click',(e)=>{
        e.preventDefault();
        e.stopPropagation();
        const target=document.querySelector(`.palette-btn[data-value="${colorValue}"]`);
        console.log('[wiggly] click',widget.id,'->',`palette ${colorValue}`,'targetFound=',Boolean(target));
        if(target && !target.disabled) target.click();
      });
      return;
    }
    const targetId=resolveWigglyTargetId(widget.id);
    if(!targetId) return;
    markClickable(el);
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
    });
  }
  function syncWigglyActiveStates(tool,paletteValue){
    if(!containerEl) return;
    const nodes=[...containerEl.querySelectorAll('.wiggly-widget')];
    for(const node of nodes) node.classList.remove('is-active');
    const toolId=WIGGLY_TOOL_WIDGETS.get(tool||'');
    if(toolId){
      const toolEl=containerEl.querySelector(`.wiggly-widget[data-name="${toolId}"]`);
      if(toolEl) toolEl.classList.add('is-active');
    }
    if((tool||'')==='palette'){
      const idx=(Number(paletteValue)||0)-1;
      const colorId=WIGGLY_COLOR_IDS[idx];
      if(colorId){
        const colorEl=containerEl.querySelector(`.wiggly-widget[data-name="${colorId}"]`);
        if(colorEl) colorEl.classList.add('is-active');
      }
    }
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
    if(widget.imageIndex!=null && widget.imageIndex>=32 && widget.imageIndex<=47){
      el.dataset.palette='1';
    }else{
      el.dataset.palette='0';
    }
    if(widget.imageIndex!=null){
      el.dataset.imgIndex=String(widget.imageIndex);
      el.classList.add('has-image');
    }
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
    bindWigglyButtonAction(el,widget);
    if(widget.style==='check'){
      el.classList.add('check');
      const box=document.createElement('span');
      box.className='wiggly-check';
      el.appendChild(box);
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
    }
    if(widget.show==='none' || widget.style==='invisible'){
      el.classList.add('is-ghost');
    }
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
  if(advancedEl) advancedEl.style.display=isColorMode ? 'none' : (isAdvanced ? 'none' : '');
  if(backEl) backEl.style.display=isColorMode ? 'none' : (isAdvanced ? '' : 'none');
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
  const nodes=[...containerEl.querySelectorAll('.wiggly-widget')];
    for(const node of nodes){
      const name=node.dataset.name || '';
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
    }
  }
  const nodes=[...containerEl.querySelectorAll('.wiggly-widget[data-img-index]')];
  for(const node of nodes){
    const placeholder=Number(node.dataset.imgIndex);
    if(!Number.isFinite(placeholder)) continue;
    const url=await getWigglyImageUrl(placeholder,{ transparentZero:true });
    if(!url) continue;
    node.style.backgroundImage=`url("${url}")`;
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
    }
    syncWigglyCanvasViewport();
    return;
  }
  void applyWigglyThemeImages();
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
  };
}
