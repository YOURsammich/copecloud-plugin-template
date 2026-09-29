
// Shown in an open plugin's header while the viewer fully trusts it (its
// payment requests skip the confirm dialog). Clicking it takes the trust back.
function TrustBadge({ pluginName, onRevoke }) {
  return (
    <span
      className='material-symbols-outlined'
      role='button'
      onClick={onRevoke}
      title={`You fully trust ${pluginName}: it can take coins without asking. Click to stop trusting it.`}
      style={{ cursor: 'pointer', fontSize: 20, display: 'flex', color: '#e0b84a' }}
    >
      verified_user
    </span>
  );
}


export default TrustBadge;
