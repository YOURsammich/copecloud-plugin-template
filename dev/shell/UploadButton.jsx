import { useState } from 'react';

// Sends plugin/ to copecloud (see dev/upload.js). Confirms first, because an
// upload replaces whatever copecloud has for the plugin.
function UploadButton() {
  // idle | uploading | done | error
  const [state, setState] = useState('idle');
  const [result, setResult] = useState(null);

  async function upload() {
    setResult(null);

    let target;
    try {
      target = await fetch('/upload-target').then(res => res.json());
    } catch {
      setState('error');
      setResult({ message: 'The dev server is not responding.' });
      return;
    }

    if (!target.owner) {
      setState('error');
      setResult({ message: 'Set "owner" in plugin/plugin.json to your copecloud username first.' });
      return;
    }

    const ok = window.confirm(
      `Upload "${target.name}" to ${target.url} as ${target.owner}?\n\n` +
      'This replaces the files copecloud has for this plugin, including any edits made in the copecloud editor.'
    );
    if (!ok) {
      setState('idle');
      return;
    }

    setState('uploading');

    try {
      const res = await fetch('/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }).then(r => r.json());

      setState(res.success ? 'done' : 'error');
      setResult(res);
    } catch {
      setState('error');
      setResult({ message: 'The dev server is not responding.' });
    }
  }

  return (
    <div className='upload'>
      <button
        type='button'
        className='uploadBtn'
        onClick={upload}
        disabled={state === 'uploading'}
        aria-busy={state === 'uploading'}
      >
        <span className='material-symbols-outlined' aria-hidden='true'>cloud_upload</span>
        {state === 'uploading' ? 'Uploading…' : 'Upload to copecloud'}
      </button>

      {result ? (
        <div className={'uploadResult' + (state === 'error' ? ' uploadError' : '')} role='status'>
          <span>{result.message}</span>
          {result.viewUrl ? (
            <a href={result.viewUrl} target='_blank' rel='noreferrer'>View it</a>
          ) : null}
          {result.skipped?.length ? (
            <span className='uploadSkipped'>Skipped (not text): {result.skipped.join(', ')}</span>
          ) : null}
          <button type='button' className='uploadDismiss' aria-label='Dismiss' onClick={() => setResult(null)}>
            <span className='material-symbols-outlined' aria-hidden='true'>close</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default UploadButton;
