import { GIFEncoder } from 'gifenc';
import { parseGIF, decompressFrames } from 'gifuct-js';
import { hexToRGB, ensureGifName, downloadBlobAsFile } from './utils.js';

export function exportGif({ filename, frames, w, h, colorMap, maxColorIndex, transparent, jitterOn, getJitterSubDelayMs }){
  const exportFrames=jitterOn ? [frames[0],frames[1],frames[2]] : [frames[3],frames[3],frames[3]];

  const palette=[];
  for(let i=0;i<=maxColorIndex;i++) palette[i]=hexToRGB(colorMap[i] ?? '#000000');

  const gif=GIFEncoder({ repeat: jitterOn ? 0 : -1 });
  for(let i=0;i<exportFrames.length;i++){
    const indices=exportFrames[i];
    const delay=jitterOn ? getJitterSubDelayMs(i%3) : 0;
    const options={ palette, delay };
    options.transparent=0;
    gif.writeFrame(indices,w,h,options);
  }
  gif.finish();
  const gifBytes=gif.bytes();
  const blob=new Blob([gifBytes],{type:'image/gif'});
  downloadBlobAsFile(blob,ensureGifName(filename ?? 'export.gif'));
}

function nearestPaletteIndex(r,g,b,paletteRGB,baseColorCount){
  let bestI=1;
  let bestD=Infinity;
  for(let i=1;i<=baseColorCount;i++){
    const pr=paletteRGB[i][0], pg=paletteRGB[i][1], pb=paletteRGB[i][2];
    const dr=r-pr, dg=g-pg, db=b-pb;
    const d=dr*dr+dg*dg+db*db;
    if(d<bestD){ bestD=d; bestI=i; }
  }
  return bestI;
}

function compositeFrame(screenW,screenH,composite,targetW,targetH,colorMap,baseColorCount){
  const paletteRGB=Array.from({length: baseColorCount+1},(_,i)=>i?hexToRGB(colorMap[i]):[0,0,0]);
  const tw=targetW|0;
  const th=targetH|0;
  const out=new Uint8Array(tw*th);
  for(let y=0;y<th;y++){
    const sy=Math.floor(y*screenH/th);
    for(let x=0;x<tw;x++){
      const sx=Math.floor(x*screenW/tw);
      const o=(sy*screenW+sx)*4;
      const a=composite[o+3];
      if(a<128){
        out[y*tw+x]=0;
      }else{
        const r=composite[o], g=composite[o+1], b=composite[o+2];
        out[y*tw+x]=nearestPaletteIndex(r,g,b,paletteRGB,baseColorCount);
      }
    }
  }
  return out;
}

function decodeGifBytesToIndexedFrames(gifBytes,{ targetW, targetH, colorMap, baseColorCount }){
  const gif=parseGIF(gifBytes);
  const screenW=gif.lsd?.width ?? (targetW|0);
  const screenH=gif.lsd?.height ?? (targetH|0);
  const tw=(targetW==null)?screenW:(targetW|0);
  const th=(targetH==null)?screenH:(targetH|0);
  const decoded=decompressFrames(gif,true);
  if(!decoded || decoded.length===0) return null;
  const composite=new Uint8ClampedArray(screenW*screenH*4);
  const mapped=[];
  const delays=[];
  let restore=null;
  for(const f of decoded){
    const { left=0, top=0, width=screenW, height=screenH }=f.dims ?? {};
    const patch=f.patch;
    if(f.disposalType===3){
      restore=composite.slice();
    }else{
      restore=null;
    }
    if(patch && width>0 && height>0){
      for(let y=0;y<height;y++){
        const dy=top+y;
        if(dy<0||dy>=screenH) continue;
        for(let x=0;x<width;x++){
          const dx=left+x;
          if(dx<0||dx>=screenW) continue;
          const so=(y*width+x)*4;
          const a=patch[so+3];
          if(a===0) continue;
          const to=(dy*screenW+dx)*4;
          composite[to]=patch[so];
          composite[to+1]=patch[so+1];
          composite[to+2]=patch[so+2];
          composite[to+3]=a;
        }
      }
    }
    mapped.push(compositeFrame(screenW,screenH,composite,tw,th,colorMap,baseColorCount));
    delays.push(Math.max(30,(Number(f.delay)||0)*10));
    if(f.disposalType===2 && width>0 && height>0){
      for(let y=0;y<height;y++){
        const dy=top+y;
        if(dy<0||dy>=screenH) continue;
        for(let x=0;x<width;x++){
          const dx=left+x;
          if(dx<0||dx>=screenW) continue;
          const to=(dy*screenW+dx)*4;
          composite[to]=0; composite[to+1]=0; composite[to+2]=0; composite[to+3]=0;
        }
      }
    }else if(f.disposalType===3 && restore){
      composite.set(restore);
    }
  }
  return { screenW, screenH, targetW: tw, targetH: th, mapped, delays };
}

export async function decodeGifFileToIndexedFrames({ file, targetW, targetH, colorMap, baseColorCount }){
  const buf=await file.arrayBuffer();
  return decodeGifBytesToIndexedFrames(new Uint8Array(buf),{ targetW, targetH, colorMap, baseColorCount });
}
