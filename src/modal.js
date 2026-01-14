const modalPositions=new Map();

function getModalCard(modalEl){
  return modalEl ? modalEl.querySelector('.modal-card') : null;
}

function getModalHead(modalEl){
  return modalEl ? modalEl.querySelector('.modal-head') : null;
}

export function clamp(v,min,max){
  return Math.max(min,Math.min(max,v));
}

export function centerModal(modalEl){
  const card=getModalCard(modalEl);
  if(!modalEl || !card) return;
  card.classList.add('is-draggable');
  const key=modalEl.id || 'modal';
  if(modalPositions.has(key)){
    const pos=modalPositions.get(key);
    card.style.left=`${pos.left}px`;
    card.style.top=`${pos.top}px`;
    return;
  }
  const mw=modalEl.clientWidth;
  const mh=modalEl.clientHeight;
  const cw=card.offsetWidth;
  const ch=card.offsetHeight;
  const minLeft=Math.round(-cw*0.5);
  const maxLeft=Math.round(mw-cw*0.5);
  const minTop=-ch;
  const maxTop=mh;
  const left=clamp(Math.round((mw-cw)/2),minLeft,maxLeft);
  const top=clamp(Math.round((mh-ch)/2),minTop,maxTop);
  card.style.left=`${left}px`;
  card.style.top=`${top}px`;
  modalPositions.set(key,{ left, top });
}

export function openModal(modalEl){
  if(!modalEl) return;
  modalEl.classList.add('is-open');
  window.requestAnimationFrame(()=>centerModal(modalEl));
}

export function closeModal(modalEl){
  if(!modalEl) return;
  modalEl.classList.remove('is-open');
}

export function makeModalDraggable(modalEl){
  const card=getModalCard(modalEl);
  const head=getModalHead(modalEl);
  if(!modalEl || !card || !head) return;
  let dragging=false;
  let startX=0, startY=0, startLeft=0, startTop=0;
  head.addEventListener('pointerdown',(e)=>{
    if(e.button!==0) return;
    if(!modalEl.classList.contains('is-open')) return;
    if(e.target && e.target.closest && e.target.closest('button,input,select,textarea,a')) return;
    dragging=true;
    const rect=modalEl.getBoundingClientRect();
    const cardRect=card.getBoundingClientRect();
    startX=e.clientX;
    startY=e.clientY;
    startLeft=cardRect.left-rect.left;
    startTop=cardRect.top-rect.top;
    head.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  head.addEventListener('pointermove',(e)=>{
    if(!dragging) return;
    const dx=e.clientX-startX;
    const dy=e.clientY-startY;
    const mw=modalEl.clientWidth;
    const mh=modalEl.clientHeight;
    const cw=card.offsetWidth;
    const ch=card.offsetHeight;
    const minLeft=Math.round(-cw*0.5);
    const maxLeft=Math.round(mw-cw*0.5);
    const minTop=-ch;
    const maxTop=mh;
    const left=clamp(Math.round(startLeft+dx),minLeft,maxLeft);
    const top=clamp(Math.round(startTop+dy),minTop,maxTop);
    card.style.left=`${left}px`;
    card.style.top=`${top}px`;
    const key=modalEl.id || 'modal';
    modalPositions.set(key,{ left, top });
  });
  function endDrag(e){
    if(!dragging) return;
    dragging=false;
    try{ head.releasePointerCapture(e.pointerId); }catch{}
  }
  head.addEventListener('pointerup',endDrag);
  head.addEventListener('pointercancel',endDrag);
}
