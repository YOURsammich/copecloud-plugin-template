
// The chat's own confirm for a plugin asking to be paid. Drawn by the chat page,
// outside the plugin's iframe, so a plugin can't draw over it or click it.
// "Always trust" pays now and lets this plugin's later requests go through
// without asking; it can be undone from the plugin's header or Settings.
function PluginPaymentDialog({ appname, amount, memo, balance, onPay, onCancel }) {
  const short = typeof balance === 'number' && balance < amount;

  return (
    <div
      role='dialog'
      aria-modal='true'
      aria-labelledby='pluginPayTitle'
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.6)', padding: '1rem',
      }}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
    >
      <div style={{
        maxWidth: '380px', width: '100%',
        background: '#1e1e24', color: '#f2f2f2', borderRadius: '10px',
        padding: '1.25rem', boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
      }}>
        <div id='pluginPayTitle' style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          <b>{appname}</b> wants ₵{amount}
        </div>
        {memo ? <div style={{ opacity: 0.85, marginBottom: '0.5rem', wordBreak: 'break-word' }}>“{memo}”</div> : null}
        <div style={{ opacity: 0.7, fontSize: '0.9rem', marginBottom: '1rem' }}>
          {typeof balance === 'number' ? `You have ₵${balance}.` : null}
          {short ? ' Not enough to pay this.' : null}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button type='button' onClick={onCancel} autoFocus>Cancel</button>
          <button type='button' disabled={short} onClick={() => onPay(true)}
            title={`Pay, and let ${appname} take payments without asking from now on`}>
            Pay &amp; always trust
          </button>
          <button type='button' disabled={short} onClick={() => onPay(false)}>Pay ₵{amount}</button>
        </div>
      </div>
    </div>
  );
}


export default PluginPaymentDialog;
