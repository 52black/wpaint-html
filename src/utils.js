export function sanitizeDownloadName(name,fallback){
  const raw=String(name ?? '').trim();
  const base=raw || fallback;
  return base.replace(/[\\\/:*?"<>|\x00-\x1F]+/g,'_').slice(0,80) || fallback;
}

export function ensureGifName(name){
  const clean=sanitizeDownloadName(name,'export.gif');
  if(clean.toLowerCase().endsWith('.gif')) return clean;
  return `${clean}.gif`;
}

export function ensureWpaintName(name){
  const clean=sanitizeDownloadName(name,'project.wpaint');
  if(clean.toLowerCase().endsWith('.wpaint')) return clean;
  return `${clean}.wpaint`;
}

export function downloadBlobAsFile(blob,filename){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function hexToRGB(hex){
  const h=String(hex||'').replace('#','');
  const r=parseInt(h.slice(0,2),16);
  const g=parseInt(h.slice(2,4),16);
  const b=parseInt(h.slice(4,6),16);
  return [r,g,b];
}

export function u8ToB64(u8){
  let s='';
  const chunk=0x8000;
  for(let i=0;i<u8.length;i+=chunk){
    s+=String.fromCharCode(...u8.subarray(i,i+chunk));
  }
  return btoa(s);
}

export function b64ToU8(b64){
  const bin=atob(String(b64||''));
  const out=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i)&255;
  return out;
}

