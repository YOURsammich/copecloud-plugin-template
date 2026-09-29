//Sends the plugin in plugin/ to a real copecloud server, the same way the
//copecloud editor's Save App button does: POST /filemg/updateApp with the
//whole file set. copecloud stores the files, builds the client bundle and
//restarts the server code.
//
//It is a full replace. Any file copecloud has that is not in plugin/ is
//deleted, including edits made in the copecloud editor since the last upload.

const fs = require('fs');
const path = require('path');

const { PLUGIN_DIR } = require('./build');

const SERVER_FILE = 'server.js';
const PUBLIC_DIR = 'public';
const CLIENT_FILE = 'client.svelte';

//copecloud stores file contents as text, so anything else would be mangled
const TEXT_EXTENSIONS = ['.svelte', '.js', '.mjs', '.ts', '.css', '.json', '.html', '.svg', '.txt', '.md'];

const DEFAULT_URL = 'https://cloud.cope.chat';

//Your copecloud sign-in: a dev token from /devtoken in the chat. Read from the
//COPECLOUD_TOKEN env var, else from .copecloud-token in the project root
//(gitignored). It is only ever sent to copecloud, and never to the browser.
const TOKEN_FILE = path.join(__dirname, '..', '.copecloud-token');

function readToken () {
  if (process.env.COPECLOUD_TOKEN) return process.env.COPECLOUD_TOKEN.trim();
  try {
    return fs.readFileSync(TOKEN_FILE, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

function listFiles (dir, base = dir) {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full, base);
    return [path.relative(base, full).split(path.sep).join('/')];
  });
}

//where uploads go, from plugin.json. Who they go as is the dev token's
//account; the browser is only told whether there is one.
function target (manifest) {
  return {
    name: manifest.name,
    hasToken: !!readToken(),
    url: String(manifest.copecloudUrl || DEFAULT_URL).replace(/\/+$/, ''),
    displayMode: manifest.displayMode
  };
}

//plugin/ on disk -> copecloud's flat file map, keyed by path:
//  server.js             -> server
//  public/client.svelte  -> public/client   (the entry has no extension there)
//  public/lib/Foo.svelte -> public/lib/Foo.svelte
function collectFiles () {
  const files = {};
  const skipped = [];

  const serverPath = path.join(PLUGIN_DIR, SERVER_FILE);
  if (fs.existsSync(serverPath)) {
    files.server = { filetype: 'js', content: fs.readFileSync(serverPath, 'utf8') };
  }

  listFiles(path.join(PLUGIN_DIR, PUBLIC_DIR)).forEach(rel => {
    if (!TEXT_EXTENSIONS.includes(path.extname(rel).toLowerCase())) {
      skipped.push(PUBLIC_DIR + '/' + rel);
      return;
    }

    const key = rel === CLIENT_FILE ? PUBLIC_DIR + '/client' : PUBLIC_DIR + '/' + rel;
    files[key] = { filetype: 'js', content: fs.readFileSync(path.join(PLUGIN_DIR, PUBLIC_DIR, rel), 'utf8') };
  });

  return { files, skipped };
}

async function post (url, body, token) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000)
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    //some copecloud routes answer with no body
  }

  return { ok: res.ok, status: res.status, data };
}

//Resolves { success, message, viewUrl?, skipped? }; never throws, since the
//result goes straight back to the button.
async function upload (manifest) {
  const { name, url, displayMode } = target(manifest);
  const token = readToken();

  if (!token) {
    return { success: false, message: 'No dev token. Run /devtoken in the chat and save it in .copecloud-token.' };
  }

  const { files, skipped } = collectFiles();

  if (!files.server || !files['public/client']) {
    return { success: false, message: 'A plugin needs both plugin/server.js and plugin/public/client.svelte.' };
  }

  try {
    const saved = await post(url + '/filemg/updateApp', { appname: name, files }, token);

    //a build error still saves the files, and copecloud says so in the message
    if (!saved.ok || !saved.data.success) {
      return {
        success: false,
        message: saved.data.message || `copecloud answered ${saved.status}`
      };
    }

    //The display mode is an app setting, not a file. Status is left alone:
    //going public is a decision for the copecloud editor.
    await post(url + '/updateAppSettings', { appname: name, displayMode }, token);

    //plugin pages are served from their own host; copecloud says which
    const owner = saved.data.owner;
    const config = await fetch(url + '/config').then(res => res.json()).catch(() => ({}));
    const pluginUrl = String(config.pluginUrl || url).replace(/\/+$/, '');

    return {
      success: true,
      message: `Uploaded ${Object.keys(files).length} files to ${url}${owner ? ' as ' + owner : ''}`,
      viewUrl: owner ? `${pluginUrl}/v/${encodeURIComponent(owner)}/${encodeURIComponent(name)}` : undefined,
      skipped
    };
  } catch (e) {
    //fetch hides the socket error in e.cause, sometimes one level deeper
    const cause = e.cause || {};
    const code = cause.code || (cause.errors && cause.errors[0] && cause.errors[0].code);
    const reason = e.name === 'TimeoutError' ? 'timed out'
      : code === 'ECONNREFUSED' ? 'connection refused, is it running?'
      : code || cause.message || e.message;
    return { success: false, message: `Could not reach copecloud at ${url} (${reason}).` };
  }
}

module.exports = {
  target,
  upload
};
