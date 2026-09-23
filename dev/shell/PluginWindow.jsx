import { useRef, useEffect } from 'react';
import DraggableWindow from './DraggableWindow';

// The floating half of plugin presentation. Same copecloud iframe the docked
// CodeRunWindow renders, hung in a DraggableWindow instead of a resizable
// column, so a plugin whose author marked it `floating` — or one a viewer
// popped out — behaves like the room's other activities.
//
// It reports its iframe upward exactly as CodeRunWindow does, because App owns
// the postMessage bridge that answers a plugin's getNick/getTrust and it must
// end up pointing at whichever of the two is currently mounted.
function PluginWindow({ giveRefresh, giveIframe, pluginName, owner, copeCloud, onClose, onDock }) {
  const iframeRef = useRef(null);
  const src = copeCloud + 'v/' + (owner || 'sammich') + '/' + pluginName;
  const srcRef = useRef(src);
  srcRef.current = src;

  useEffect(() => {
    giveRefresh(() => { if (iframeRef.current) iframeRef.current.src = srcRef.current; });
    giveIframe(iframeRef.current);
  }, [pluginName]);

  return (
    <DraggableWindow
      title={pluginName}
      onClose={onClose}
      width='min(520px, 95vw)'
      initialLeft={100}
      initialTop={70}
      bodyStyle={{ padding: 0, overflow: 'hidden' }}
      headerActions={
        <span
          className='material-symbols-outlined'
          onClick={onDock}
          title='Dock to sidebar'
          style={{ cursor: 'pointer', fontSize: 20, display: 'flex' }}
        >
          dock_to_left
        </span>
      }
    >
      <iframe
        ref={iframeRef}
        title={pluginName}
        src={src}
        style={{ width: '100%', height: 560, maxHeight: '75vh', border: 'none', display: 'block' }}
      />
    </DraggableWindow>
  );
}

export default PluginWindow;
