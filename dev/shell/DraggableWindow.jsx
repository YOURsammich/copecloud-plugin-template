import { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

// A generic floating, draggable window. Portaled to document.body so it floats
// above everything regardless of where it is used (no ancestor overflow/transform
// can clip it). Dragging is bound to the title bar only, so interactive body
// content (e.g. a paint canvas) is never hijacked. Follows the same fixed +
// zIndex + move-on-mousemove idiom as UnoPanel.
export default function DraggableWindow({ title, onClose, children, initialLeft = 140, initialTop = 90, width = 'auto', headerActions = null, bodyStyle = null }) {
  const panelRef = useRef(null);
  const headerRef = useRef(null);

  useEffect(() => {
    const panel = panelRef.current;
    const header = headerRef.current;
    let dragging = false, startX, startY, initX, initY;

    function onMouseDown(e) {
      if (e.target.nodeName === 'BUTTON' || e.target.closest('button')) return;
      if (e.target.closest('[data-window-action]')) return;
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      const rect = panel.getBoundingClientRect();
      initX = rect.left; initY = rect.top;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    }
    function onMouseMove(e) {
      if (!dragging) return;
      panel.style.left = (initX + e.clientX - startX) + 'px';
      panel.style.top = Math.max(0, initY + e.clientY - startY) + 'px';
    }
    function onMouseUp() {
      dragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    header.addEventListener('mousedown', onMouseDown);
    return () => {
      header.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  return createPortal(
    <div
      ref={panelRef}
      style={{
        position: 'fixed', top: initialTop, left: initialLeft, zIndex: 10000, width,
        maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        background: '#1b1b1b', color: '#eee', border: '1px solid #333',
        borderRadius: 6, boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
      }}
    >
      <div
        ref={headerRef}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 10px', cursor: 'move', userSelect: 'none', borderBottom: '1px solid #333',
        }}
      >
        <span style={{ fontWeight: 'bold', fontSize: 13 }}>{title}</span>
        <span data-window-action style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {headerActions}
          <span
            className='material-symbols-outlined'
            onClick={onClose}
            title='Close'
            style={{ cursor: 'pointer', fontSize: 20, display: 'flex' }}
          >
            close
          </span>
        </span>
      </div>
      <div style={{ padding: 12, overflow: 'auto', flex: 1, minHeight: 0, ...bodyStyle }}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
