export function createHistoryController({
  frames,
  undoBtn,
  redoBtn,
  renderCurrent,
  maxHistory=80,
  captureSnapshot,
  applySnapshot,
  onUndo,
  onRedo,
  bindHotkeys=true,
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

  function capture(){
    if(typeof captureSnapshot==='function') return captureSnapshot();
    return cloneFrames();
  }

  function apply(snapshot){
    if(typeof applySnapshot==='function') return applySnapshot(snapshot);
    return applyFrames(snapshot);
  }

  function syncUI(){
    if(undoBtn) undoBtn.disabled=undoStack.length===0;
    if(redoBtn) redoBtn.disabled=redoStack.length===0;
  }

  function pushHistory(){
    undoStack.push(capture());
    if(undoStack.length>maxHistory) undoStack.shift();
    redoStack.length=0;
    syncUI();
  }

  function undo(){
    if(undoStack.length===0) return;
    redoStack.push(capture());
    const prev=undoStack.pop();
    apply(prev);
    if(typeof onUndo==='function') onUndo();
    syncUI();
    renderCurrent();
  }

  function redo(){
    if(redoStack.length===0) return;
    undoStack.push(capture());
    const next=redoStack.pop();
    apply(next);
    if(typeof onRedo==='function') onRedo();
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

    if(!bindHotkeys) return;
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
