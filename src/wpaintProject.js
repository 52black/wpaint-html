import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { ensureWpaintName, downloadBlobAsFile } from './utils.js';

export function encodeTimelineBin({ timeline, w, h }){
  const celCount=Array.isArray(timeline)?timeline.length:0;
  const frameLen=(w|0)*(h|0);
  const hasLayerModel=Array.isArray(timeline) && timeline.some(cel=>cel && Array.isArray(cel.layers) && cel.layers.length>0);
  const hasOpacity=Array.isArray(timeline) && timeline.some(cel=>cel && Array.isArray(cel.layers) && cel.layers.some(l=>l && l.opacity!=null && Number(l.opacity)!==100));
  if(!hasLayerModel){
    const total=16 + celCount*(4 + 4*frameLen);
    const buf=new ArrayBuffer(total);
    const view=new DataView(buf);
    const out=new Uint8Array(buf);
    let o=0;
    view.setUint32(o,0x57504131,true); o+=4;
    view.setUint32(o,(w>>>0),true); o+=4;
    view.setUint32(o,(h>>>0),true); o+=4;
    view.setUint32(o,(celCount>>>0),true); o+=4;
    for(let i=0;i<celCount;i++){
      const cel=timeline[i];
      const delay=Math.max(30,cel && cel.delay|0);
      view.setUint32(o,(delay>>>0),true); o+=4;
      const layer0=(cel && Array.isArray(cel.layers) && cel.layers.length===1) ? cel.layers[0] : null;
      const frames4=layer0 && Array.isArray(layer0.frames) ? layer0.frames : (cel && cel.frames);
      for(let fi=0;fi<4;fi++){
        const f=frames4 && frames4[fi];
        if(!(f instanceof Uint8Array) || f.length!==frameLen){
          out.set(new Uint8Array(frameLen),o);
          o+=frameLen;
        }else{
          out.set(f,o);
          o+=frameLen;
        }
      }
    }
    return out;
  }

  const enc=new TextEncoder();
  let total=16;
  for(let i=0;i<celCount;i++){
    const cel=timeline[i] || {};
    const layers=Array.isArray(cel.layers) && cel.layers.length>0 ? cel.layers : [{ name:'图层1', visible:true, frames: cel.frames }];
    total+=8;
    for(const layer of layers){
      const nameBytes=enc.encode(String(layer && layer.name ? layer.name : ''));
      total+=1 + (hasOpacity ? 1 : 0) + 2 + nameBytes.length;
      total+=4*frameLen;
    }
  }
  const buf=new ArrayBuffer(total);
  const view=new DataView(buf);
  const out=new Uint8Array(buf);
  let o=0;
  view.setUint32(o,(hasOpacity ? 0x57504133 : 0x57504132),true); o+=4;
  view.setUint32(o,(w>>>0),true); o+=4;
  view.setUint32(o,(h>>>0),true); o+=4;
  view.setUint32(o,(celCount>>>0),true); o+=4;
  for(let i=0;i<celCount;i++){
    const cel=timeline[i] || {};
    const delay=Math.max(30,cel && cel.delay|0);
    view.setUint32(o,(delay>>>0),true); o+=4;
    const layers=Array.isArray(cel.layers) && cel.layers.length>0 ? cel.layers : [{ name:'图层1', visible:true, frames: cel.frames }];
    view.setUint32(o,(layers.length>>>0),true); o+=4;
    for(const layer of layers){
      const visible=(layer && layer.visible!==false) ? 1 : 0;
      out[o]=visible; o+=1;
      if(hasOpacity){
        const opacity=(layer && layer.opacity!=null) ? Math.max(0,Math.min(100,Number(layer.opacity)||0)) : 100;
        out[o]=opacity|0; o+=1;
      }
      const nameBytes=enc.encode(String(layer && layer.name ? layer.name : ''));
      const nameLen=Math.min(65535,nameBytes.length)|0;
      view.setUint16(o,(nameLen>>>0),true); o+=2;
      out.set(nameBytes.subarray(0,nameLen),o); o+=nameLen;
      const frames4=layer && Array.isArray(layer.frames) ? layer.frames : [];
      for(let fi=0;fi<4;fi++){
        const f=frames4[fi];
        if(!(f instanceof Uint8Array) || f.length!==frameLen){
          out.set(new Uint8Array(frameLen),o);
          o+=frameLen;
        }else{
          out.set(f,o);
          o+=frameLen;
        }
      }
    }
  }
  return out;
}

export function decodeTimelineBin(u8){
  if(!(u8 instanceof Uint8Array) || u8.length<16) return null;
  const view=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);
  let o=0;
  const magic=view.getUint32(o,true); o+=4;
  if(magic!==0x57504131 && magic!==0x57504132 && magic!==0x57504133) return null;
  const w=view.getUint32(o,true)|0; o+=4;
  const h=view.getUint32(o,true)|0; o+=4;
  const celCount=view.getUint32(o,true)|0; o+=4;
  if(w<=0||h<=0||celCount<=0) return null;
  const frameLen=w*h;
  const nextTimeline=[];
  if(magic===0x57504131){
    const expected=16 + celCount*(4 + 4*frameLen);
    if(u8.length<expected) return null;
    for(let i=0;i<celCount;i++){
      const delay=view.getUint32(o,true)|0; o+=4;
      const frames4=[];
      for(let fi=0;fi<4;fi++){
        frames4.push(u8.slice(o,o+frameLen));
        o+=frameLen;
      }
      nextTimeline.push({ frames: frames4, delay: Math.max(30,delay|0) });
    }
    return { w, h, timeline: nextTimeline };
  }
  const dec=new TextDecoder();
  for(let i=0;i<celCount;i++){
    if(o+8>u8.length) return null;
    const delay=view.getUint32(o,true)|0; o+=4;
    const layerCount=view.getUint32(o,true)|0; o+=4;
    const layers=[];
    for(let li=0;li<layerCount;li++){
      if(o+(magic===0x57504133 ? 4 : 3)>u8.length) return null;
      const visible=Boolean(u8[o]); o+=1;
      const opacity=(magic===0x57504133) ? (u8[o++]|0) : 100;
      const nameLen=view.getUint16(o,true)|0; o+=2;
      if(o+nameLen>u8.length) return null;
      const name=nameLen>0 ? dec.decode(u8.slice(o,o+nameLen)) : '';
      o+=nameLen;
      const frames4=[];
      for(let fi=0;fi<4;fi++){
        if(o+frameLen>u8.length) return null;
        frames4.push(u8.slice(o,o+frameLen));
        o+=frameLen;
      }
      layers.push({ name, visible, opacity, frames: frames4 });
    }
    nextTimeline.push({
      delay: Math.max(30,delay|0),
      layers,
      frames: [new Uint8Array(frameLen),new Uint8Array(frameLen),new Uint8Array(frameLen),new Uint8Array(frameLen)],
    });
  }
  return { w, h, timeline: nextTimeline };
}

export async function downloadWpaintProject({ filename, config, timeline, w, h, backgroundUrl }){
  const cfg=(config && typeof config==='object') ? config : {};
  let bgBytes=null;
  let bgMime='';
  if(backgroundUrl){
    try{
      const res=await fetch(backgroundUrl);
      bgMime=String(res.headers.get('content-type')||'');
      const buf=await res.arrayBuffer();
      bgBytes=new Uint8Array(buf);
    }catch{
      bgBytes=null;
      bgMime='';
    }
  }
  if(bgBytes){
    cfg.background={ file:'bg.bin', mime:bgMime||'application/octet-stream' };
  }else{
    cfg.background=null;
  }
  const files={
    'config.json': strToU8(JSON.stringify(cfg)),
    'timeline.bin': encodeTimelineBin({ timeline, w, h }),
  };
  if(bgBytes) files['bg.bin']=bgBytes;
  const zipped=zipSync(files,{ level: 6 });
  const blob=new Blob([zipped],{type:'application/zip'});
  downloadBlobAsFile(blob,ensureWpaintName(filename ?? 'project.wpaint'));
}

export async function readWpaintProjectFile(file){
  const buf=await file.arrayBuffer();
  const u8=new Uint8Array(buf);
  let entries=null;
  try{
    entries=unzipSync(u8);
  }catch{
    entries=null;
  }
  if(!entries) return null;
  const cfgRaw=entries['config.json'];
  const tlRaw=entries['timeline.bin'];
  if(!cfgRaw || !tlRaw) return null;
  let config=null;
  try{
    config=JSON.parse(strFromU8(cfgRaw));
  }catch{
    config=null;
  }
  const decoded=decodeTimelineBin(tlRaw);
  if(!decoded) return null;
  let background=null;
  if(config && config.background && config.background.file && entries[config.background.file]){
    background={
      mime:String(config.background.mime||'application/octet-stream'),
      bytes:entries[config.background.file],
    };
  }
  return { config, decoded, background };
}
