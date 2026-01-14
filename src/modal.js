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
  const minVisible=24;
  const minLeft=Math.round(-(cw-minVisible));
  const maxLeft=Math.round(mw-minVisible);
  const minTop=Math.round(-(ch-minVisible));
  const maxTop=Math.round(mh-minVisible);
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
  let dragPointerId=null;
  let startX=0, startY=0, startLeft=0, startTop=0;
  let scaleX=1, scaleY=1;
  let dragMoveListener=null;
  let dragUpListener=null;

  function cleanupDrag(pointerId){
    dragging=false;
    dragPointerId=null;
    try{
      if(pointerId!=null) head.releasePointerCapture(pointerId);
    }catch{}
    if(dragMoveListener || dragUpListener){
      try{ if(dragMoveListener) window.removeEventListener('pointermove',dragMoveListener,true); }catch{}
      try{ if(dragUpListener) window.removeEventListener('pointerup',dragUpListener,true); }catch{}
      try{ if(dragUpListener) window.removeEventListener('pointercancel',dragUpListener,true); }catch{}
    }
    dragMoveListener=null;
    dragUpListener=null;
  }

  function onDragMove(e){
    if(!dragging) return;
    if(dragPointerId!=null && e.pointerId!==dragPointerId) return;
    e.preventDefault();
    const dx=(e.clientX-startX)/scaleX;
    const dy=(e.clientY-startY)/scaleY;
    const mw=modalEl.clientWidth;
    const mh=modalEl.clientHeight;
    const cw=card.offsetWidth;
    const ch=card.offsetHeight;
    const minVisible=24;
    const minLeft=Math.round(-(cw-minVisible));
    const maxLeft=Math.round(mw-minVisible);
    const minTop=Math.round(-(ch-minVisible));
    const maxTop=Math.round(mh-minVisible);
    const unclampedLeft=Math.round(startLeft+dx);
    const unclampedTop=Math.round(startTop+dy);
    const left=clamp(unclampedLeft,minLeft,maxLeft);
    const top=clamp(unclampedTop,minTop,maxTop);
    card.style.left=`${left}px`;
    card.style.top=`${top}px`;
    const key=modalEl.id || 'modal';
    modalPositions.set(key,{ left, top });
    if(left!==unclampedLeft){
      startX=e.clientX;
      startLeft=left;
    }
    if(top!==unclampedTop){
      startY=e.clientY;
      startTop=top;
    }
  }

  function onDragEnd(e){
    if(!dragging) return;
    if(e && dragPointerId!=null && e.pointerId!==dragPointerId) return;
    cleanupDrag(e ? e.pointerId : dragPointerId);
  }

  head.addEventListener('pointerdown',(e)=>{
    if(e.pointerType==='mouse' && e.button!==0) return;
    if(!modalEl.classList.contains('is-open')) return;
    if(e.target && e.target.closest && e.target.closest('button,input,select,textarea,a')) return;
    if(dragging) cleanupDrag(dragPointerId);
    dragging=true;
    dragPointerId=e.pointerId;
    const rect=modalEl.getBoundingClientRect();
    const cardRect=card.getBoundingClientRect();
    const mw=Math.max(1,modalEl.clientWidth||1);
    const mh=Math.max(1,modalEl.clientHeight||1);
    scaleX=rect.width/mw;
    scaleY=rect.height/mh;
    startX=e.clientX;
    startY=e.clientY;
    startLeft=(cardRect.left-rect.left)/scaleX;
    startTop=(cardRect.top-rect.top)/scaleY;
    try{ head.setPointerCapture(e.pointerId); }catch{}
    dragMoveListener=onDragMove;
    dragUpListener=onDragEnd;
    window.addEventListener('pointermove',dragMoveListener,true);
    window.addEventListener('pointerup',dragUpListener,true);
    window.addEventListener('pointercancel',dragUpListener,true);
    e.preventDefault();
  });
  head.addEventListener('pointermove',onDragMove);
  head.addEventListener('pointerup',onDragEnd);
  head.addEventListener('pointercancel',onDragEnd);
}
