export function createHistoryController({
  frames,
  undoBtn,
  redoBtn,
  renderCurrent,
  maxHistory=80,
}){
  const undoStack=[];
  const redoStack=[];

  function cloneFrames(){
    return frames.map(f=>new Uint8Array(f));
  }

  function applyFrames(snapshot){
    for(let i=0;i<frames.length;i++){
      frames[i].set(snapshot[i]);
    }
  }

  function syncUI(){
    if(undoBtn) undoBtn.disabled=undoStack.length===0;
    if(redoBtn) redoBtn.disabled=redoStack.length===0;
  }

  function pushHistory(){
    undoStack.push(cloneFrames());
    if(undoStack.length>maxHistory) undoStack.shift();
    redoStack.length=0;
    syncUI();
  }

  function undo(){
    if(undoStack.length===0) return;
    redoStack.push(cloneFrames());
    const prev=undoStack.pop();
    applyFrames(prev);
    syncUI();
    renderCurrent();
  }

  function redo(){
    if(redoStack.length===0) return;
    undoStack.push(cloneFrames());
    const next=redoStack.pop();
    applyFrames(next);
    syncUI();
    renderCurrent();
  }

  function reset(){
    undoStack.length=0;
    redoStack.length=0;
    syncUI();
  }

  function bind(){
    if(undoBtn) undoBtn.addEventListener('click',undo);
    if(redoBtn) redoBtn.addEventListener('click',redo);

    window.addEventListener('keydown',e=>{
      if(e.target && (e.target.tagName==='INPUT' || e.target.tagName==='SELECT' || e.target.tagName==='TEXTAREA')) return;
      const isMac=navigator.platform.toLowerCase().includes('mac');
      const ctrl=isMac ? e.metaKey : e.ctrlKey;
      if(!ctrl) return;
      const key=(e.key||'').toLowerCase();
      if(key==='z'){
        e.preventDefault();
        if(e.shiftKey) redo();
        else undo();
      }else if(key==='y'){
        e.preventDefault();
        redo();
      }
    });
  }

  bind();
  syncUI();

  return { pushHistory, undo, redo, reset, syncUI };
}

