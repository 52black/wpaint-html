import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { ensureWpaintName, downloadBlobAsFile } from './utils.js';

export function encodeTimelineBin({ timeline, w, h }){
  const celCount=Array.isArray(timeline)?timeline.length:0;
  const frameLen=(w|0)*(h|0);
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
    for(let fi=0;fi<4;fi++){
      const f=cel && cel.frames && cel.frames[fi];
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

export function decodeTimelineBin(u8){
  if(!(u8 instanceof Uint8Array) || u8.length<16) return null;
  const view=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);
  let o=0;
  const magic=view.getUint32(o,true); o+=4;
  if(magic!==0x57504131) return null;
  const w=view.getUint32(o,true)|0; o+=4;
  const h=view.getUint32(o,true)|0; o+=4;
  const celCount=view.getUint32(o,true)|0; o+=4;
  if(w<=0||h<=0||celCount<=0) return null;
  const frameLen=w*h;
  const expected=16 + celCount*(4 + 4*frameLen);
  if(u8.length<expected) return null;
  const nextTimeline=[];
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

