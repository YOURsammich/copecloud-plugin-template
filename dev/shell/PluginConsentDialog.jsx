
// Shown the first time someone opens a plugin that asks for wallet access,
// before the plugin loads. Agreeing lets it take coins from them from then on
// with no further prompts (each payment still leaves a private note in the
// chat); declining closes it. Drawn by the chat page, outside the plugin's
// iframe, so the plugin can't draw over it or click it.
function PluginConsentDialog({ appname, owner, onAllow, onDecline }) {
  return (
    <div
      role='dialog'
      aria-modal='true'
      aria-labelledby='pluginConsentTitle'
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.6)', padding: '1rem',
      }}
      onKeyDown={(e) => { if (e.key === 'Escape') onDecline(); }}
    >
      <div style={{
        maxWidth: '400px', width: '100%',
        background: '#1e1e24', color: '#f2f2f2', borderRadius: '10px',
        padding: '1.25rem', boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
      }}>
        <div id='pluginConsentTitle' style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          Open <b>{appname}</b>?
        </div>
        {owner ? <div style={{ opacity: 0.7, fontSize: '0.9rem', marginBottom: '0.75rem' }}>A plugin by {owner}.</div> : null}
        <div style={{ marginBottom: '0.5rem' }}>It asks for access to your wallet:</div>
        <ul style={{ margin: '0 0 0.75rem 1.1rem', padding: 0, lineHeight: 1.5 }}>
          <li>It can take coins from you without asking each time.</li>
          <li>You&apos;ll see a note in the chat whenever it does.</li>
        </ul>
        <div style={{ opacity: 0.7, fontSize: '0.9rem', marginBottom: '1rem' }}>
          You can take this back any time from the badge in its header, or in Settings.
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button type='button' onClick={onDecline} autoFocus>Don&apos;t open</button>
          <button type='button' onClick={onAllow}>Allow and open</button>
        </div>
      </div>
    </div>
  );
}


export default PluginConsentDialog;
