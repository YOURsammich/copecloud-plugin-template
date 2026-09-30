
// Shown in an open plugin's header while the viewer has given it wallet access.
// Clicking it takes the access back (and closes the plugin; opening it again
// asks again).
function TrustBadge({ pluginName, onRevoke }) {
  return (
    <span
      className='material-symbols-outlined'
      role='button'
      onClick={onRevoke}
      title={`${pluginName} has access to your wallet: it can take coins without asking. Click to take that back.`}
      style={{ cursor: 'pointer', fontSize: 20, display: 'flex', color: '#e0b84a' }}
    >
      verified_user
    </span>
  );
}


export default TrustBadge;
