import { useState, useRef, useEffect } from 'react';

function CodeRunWindow({ giveRefresh, giveIframe, draggingWindow, pluginName, owner, copeCloud, onClose, onPopOut }) {
  const [chatWidth, setChatWidth] = useState(600);
  const src = copeCloud + 'v/' + (owner || 'sammich') + '/' + pluginName;
  const resizeBarRef = useRef(null);
  const iframeRef = useRef(null);
  const isDraggingRef = useRef(false);
  const diffRef = useRef(0);
  // Held in a ref so the reload closure, registered once, always reloads
  // whichever plugin is currently open.
  const srcRef = useRef(src);
  srcRef.current = src;

  useEffect(() => {
    giveRefresh(() => { if (iframeRef.current) iframeRef.current.src = srcRef.current; });
    giveIframe(iframeRef.current);

    const resizeBar = resizeBarRef.current;

    function handleMouseDown(e) {
      e.preventDefault();
      const container = resizeBar.parentElement.parentElement;
      diffRef.current = container.offsetWidth - e.clientX;
      isDraggingRef.current = true;
    }

    function handleMouseMove(e) {
      if (isDraggingRef.current) setChatWidth(e.clientX + diffRef.current);
    }

    function handleMouseUp() {
      isDraggingRef.current = false;
    }

    resizeBar.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      resizeBar.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <div style={{ display: 'flex', width: chatWidth + 'px' }}>
      <div className='codeRunnerPanel' style={{ pointerEvents: draggingWindow ? 'none' : '' }}>
        <div className='codeRunnerHeader'>
          <span className='codeRunnerTitle'>{pluginName}</span>
          <span className='codeRunnerActions'>
            <span className='material-symbols-outlined' onClick={onPopOut} title='Pop out'>open_in_new</span>
            <span className='material-symbols-outlined' onClick={onClose} title='Close'>close</span>
          </span>
        </div>
        <iframe ref={iframeRef} title={pluginName} src={src}
          style={{ flex: 1, border: 'none', pointerEvents: isDraggingRef.current ? 'none' : '' }}
        />
      </div>
      <div className='resizeBar'>
        <div className='resizeHandle' ref={resizeBarRef}>
          <span className="material-symbols-outlined">width</span>
        </div>
      </div>
    </div>
  );
}

export default CodeRunWindow;
