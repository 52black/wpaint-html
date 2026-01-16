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

  function capture(kindHint){
    if(typeof captureSnapshot==='function') return captureSnapshot(kindHint);
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

  function pushSnapshot(snapshot){
    undoStack.push(snapshot!=null ? snapshot : capture());
    if(undoStack.length>maxHistory) undoStack.shift();
    redoStack.length=0;
    syncUI();
  }

  function undo(){
    if(undoStack.length===0) return;
    const prevSnap=undoStack[undoStack.length-1];
    const hint=prevSnap && typeof prevSnap==='object' ? prevSnap.kind : undefined;
    redoStack.push(capture(hint));
    const applySnap=undoStack.pop();
    apply(applySnap);
    if(typeof onUndo==='function') onUndo();
    syncUI();
    renderCurrent();
  }

  function redo(){
    if(redoStack.length===0) return;
    const next=redoStack[redoStack.length-1];
    const hint=next && typeof next==='object' ? next.kind : undefined;
    undoStack.push(capture(hint));
    const nextSnap=redoStack.pop();
    apply(nextSnap);
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

  return { pushHistory, pushSnapshot, undo, redo, reset, syncUI };
}
