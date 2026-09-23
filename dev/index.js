//npm run dev
//
//Two servers, standing in for the two in production:
//
//  :4000  the chatroom. A stripped-down copy of the real one: chat, user list,
//         and the plugin bar / docked panel / floating window, which are the
//         chatroom's own components.
//  :4001  copecloud. Serves the plugin page the panel's iframe loads, runs
//         plugin/server.js, and carries the plugin's websocket.
//
//They are on different ports so the plugin runs cross-origin, as it does for
//real: window.top is off limits, and getNick/getTrust have to go through
//postMessage. They share a hostname so they share cookies, which is how the
//plugin socket learns your chat nick.

const fs = require('fs');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');

const db = require('./db');
const runtime = require('./runtime');
const uploader = require('./upload');
const pluginClientTools = require('./clientTools');
const { PLUGIN_DIR, OUT_DIR, buildPlugin, buildShell } = require('./build');

const CHAT_PORT = Number(process.env.CHAT_PORT) || 4000;
const PLUGIN_PORT = Number(process.env.PLUGIN_PORT) || 4001;

const SHELL_DIR = path.join(__dirname, 'shell');
const OWNER = 'dev';

//plugin/plugin.json

function readManifest () {
  let manifest = {};
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, 'plugin.json'), 'utf8'));
  } catch (e) {
    console.log('[plugin] plugin.json could not be read:', e.message);
  }

  //copecloud only accepts these characters in an app name
  const name = String(manifest.name || 'myplugin').replace(/[^a-zA-Z0-9_-]/g, '') || 'myplugin';
  const displayMode = manifest.displayMode === 'floating' ? 'floating' : 'sidebar';

  //owner and copecloudUrl are only used by the upload button
  return { name, displayMode, owner: manifest.owner, copecloudUrl: manifest.copecloudUrl };
}

let manifest = readManifest();

//small http helpers

function parseCookies (header) {
  return (header || '').split(';').reduce((acc, pair) => {
    const index = pair.indexOf('=');
    if (index > 0) acc[pair.slice(0, index).trim()] = decodeURIComponent(pair.slice(index + 1).trim());
    return acc;
  }, {});
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

function sendFile (res, file) {
  fs.readFile(file, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(content);
  });
}

function sendJson (res, data) {
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

function readBody (req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

// ─── the chatroom (:4000) ─────────────────────────────────────────────────────

const chatUsers = [];
const history = [];
const HISTORY_LIMIT = 100;

function chatSend (user, eventName, data) {
  if (user.ws.readyState === 1) user.ws.send(JSON.stringify({ eventName, data }));
}

function chatBroadcast (eventName, data) {
  chatUsers.forEach(user => chatSend(user, eventName, data));
}

function publicUser (user) {
  return { id: user.id, nick: user.nick, trust: user.trust, registered: false };
}

//Like the real chatroom, a second tab with a nick already in the room is
//renamed rather than refused.
function uniqueNick (nick, except) {
  const taken = (candidate) => chatUsers.some(user => user !== except && user.nick.toLowerCase() === candidate.toLowerCase());
  if (!taken(nick)) return nick;

  let n = 2;
  while (taken(nick + n)) n++;
  return nick + n;
}

function systemMessage (user, message) {
  chatSend(user, 'message', { nick: '*', message, time: Date.now(), system: true });
}

function postMessage (user, message) {
  const count = db.logMessage({ nick: user.nick, message });
  const entry = { nick: user.nick, message, time: Date.now(), count };

  history.push(entry);
  if (history.length > HISTORY_LIMIT) history.shift();

  chatBroadcast('message', entry);
}

function setUserState (user, stateChange) {
  Object.assign(user, stateChange);
  chatBroadcast('userStateChange', { user: publicUser(user), stateChange });
}

const COMMANDS = {
  nick (user, arg) {
    const nick = arg.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20);
    if (!nick) return systemMessage(user, 'usage: /nick <name>');
    setUserState(user, { nick: uniqueNick(nick, user) });
    systemMessage(user, `you are now ${user.nick}. Reload the plugin to pick up the new nick.`);
  },
  trust (user, arg) {
    const trust = parseInt(arg, 10);
    if (Number.isNaN(trust)) return systemMessage(user, 'usage: /trust <number>');
    setUserState(user, { trust });
    systemMessage(user, `your trust is now ${trust}`);
  },
  reload (user) {
    chatSend(user, 'pluginReload', {});
  },
  help (user) {
    systemMessage(user, '/nick <name>  /trust <number>  /reload (reload the plugin)');
  }
};

function handleChatMessage (user, text) {
  text = String(text || '').trim().slice(0, 1000);
  if (!text) return;

  const command = text.match(/^\/(\w+)\s*(.*)$/);
  if (command && COMMANDS[command[1]]) {
    COMMANDS[command[1]](user, command[2]);
  } else if (command) {
    systemMessage(user, `unknown command /${command[1]}. Try /help`);
  } else {
    postMessage(user, text);
  }
}

let nextChatId = 1;
const chatWss = new WebSocketServer({ noServer: true });

chatWss.on('connection', (ws, req) => {
  const cookies = parseCookies(req.headers.cookie);
  const nick = cookies.nick || 'guest' + Math.floor(1000 + Math.random() * 9000);

  const user = { id: String(nextChatId++), nick: uniqueNick(nick), trust: 0, ws };
  chatUsers.push(user);

  chatSend(user, 'setID', user.id);
  chatSend(user, 'userlist', chatUsers.map(publicUser));
  chatSend(user, 'history', history);
  chatSend(user, 'pluginList', [pluginRecord()]);
  chatUsers.forEach(other => { if (other !== user) chatSend(other, 'userJoin', publicUser(user)); });

  ws.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (message.eventName === 'message') handleChatMessage(user, message.data);
  });

  ws.on('close', () => {
    const index = chatUsers.indexOf(user);
    if (index !== -1) chatUsers.splice(index, 1);
    chatBroadcast('userLeft', publicUser(user));
  });
});

const chatServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/') return sendFile(res, path.join(SHELL_DIR, 'index.html'));
  if (url.pathname === '/theme.css') return sendFile(res, path.join(SHELL_DIR, 'theme.css'));
  if (url.pathname === '/shell.js') return sendFile(res, path.join(OUT_DIR, 'shell.js'));

  //where the shell finds the plugin host
  if (url.pathname === '/config.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
    res.end(`window.DEV_CONFIG = ${JSON.stringify({ pluginPort: PLUGIN_PORT })};`);
    return;
  }

  //The upload button asks where it would upload to before confirming, then
  //uploads. The plugin files are read from disk at that moment.
  if (url.pathname === '/upload-target') return sendJson(res, uploader.target(manifest));

  if (url.pathname === '/upload' && req.method === 'POST') {
    //Only the button's JSON request. A cross-site page can send a plain form
    //POST without asking, but a JSON one needs a CORS preflight, which this
    //server never grants.
    if (!String(req.headers['content-type']).startsWith('application/json')) {
      res.writeHead(415);
      res.end();
      return;
    }

    const result = await uploader.upload(manifest);
    console.log(`[upload] ${result.success ? 'ok' : 'failed'}: ${result.message}`);
    return sendJson(res, result);
  }

  //The real chatroom persists a guest's nick in this cookie, and copecloud
  //uses the same cookie as the plugin socket's identity.
  if (url.pathname === '/set-nick' && req.method === 'POST') {
    const { nick } = await readBody(req);
    if (nick) res.setHeader('Set-Cookie', `nick=${encodeURIComponent(nick)}; Path=/; SameSite=Lax`);
    res.end();
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

chatServer.on('upgrade', (req, socket, head) => {
  if (new URL(req.url, 'http://localhost').pathname !== '/chat') return socket.destroy();
  chatWss.handleUpgrade(req, socket, head, ws => chatWss.emit('connection', ws, req));
});

// ─── copecloud (:4001) ────────────────────────────────────────────────────────

function pluginRecord () {
  return { appname: manifest.name, owner: OWNER, status: 'public', displayMode: manifest.displayMode };
}

//Same page copecloud serves at /v/:user/:appName
function pluginPage (appName) {
  return `<html>
    <head>
      <title>${appName}</title>
      <script>${pluginClientTools.getToolsString(appName)}</script>
      <script>
        window.__pluginStatus = function (message) {
          var status = document.getElementById('pluginStatus');
          if (!status) return;
          status.textContent = message || '';
          status.hidden = !message;
        };
        (function () {
          var ready = false;
          window.addEventListener('userDataReady', function () {
            ready = true;
            window.__pluginStatus('');
          });
          window.addEventListener('pluginSocketClosed', function () {
            window.__pluginStatus(ready
              ? 'Disconnected from the server. Reload to reconnect.'
              : 'Could not connect to the server.');
          });
          window.addEventListener('error', function (e) {
            if (!ready) window.__pluginStatus('This plugin failed to start: ' + e.message);
          });
          setTimeout(function () {
            if (!ready) window.__pluginStatus('This plugin did not start. Try reloading, or re-save it in the editor to rebuild it.');
          }, 8000);
        })();
      </script>
      <script defer src="/pa/bundle.js" type="module"
        onerror="__pluginStatus('This plugin has not been built yet. Save it in the editor to build it.')"></script>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0" />
    </head>
    <body style="margin: 0; padding: 0; background: #000;">

      <div id="pluginStatus" role="status"
        style="padding: 12px; color: #aaa; font: 14px sans-serif;">Loading ${appName}…</div>

      <app-input></app-input>

    </body>

    `;
}

const pluginServer = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/getPublicApps') return sendJson(res, [pluginRecord()]);

  const view = url.pathname.match(/^\/v\/[^/]+\/([^/]+)$/);
  if (view) {
    if (view[1] !== manifest.name) {
      res.end('App not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(pluginPage(manifest.name));
    return;
  }

  if (url.pathname === '/pa/bundle.js') return sendFile(res, path.join(OUT_DIR, 'bundle.js'));
  if (url.pathname === '/pa/bundle.js.map') return sendFile(res, path.join(OUT_DIR, 'bundle.js.map'));

  res.writeHead(404);
  res.end('Not found');
});

const pluginWss = new WebSocketServer({ noServer: true });

pluginServer.on('upgrade', (req, socket, head) => {
  const cookies = parseCookies(req.headers.cookie);
  const nick = cookies.nick || Math.random().toString(36).substring(2, 15);

  pluginWss.handleUpgrade(req, socket, head, ws => runtime.connect(ws, nick));
});

// ─── watching plugin/ ─────────────────────────────────────────────────────────

function loadServerCode () {
  const file = path.join(PLUGIN_DIR, 'server.js');
  runtime.run(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
}

//Saving in the copecloud editor reruns the server code and reloads the
//preview; do the same on every save here.
let pending = new Set();
let timer = null;

function onPluginChange (filename) {
  if (!filename) return;
  pending.add(filename.split(path.sep).join('/'));

  clearTimeout(timer);
  timer = setTimeout(async () => {
    const changed = [...pending];
    pending = new Set();

    if (changed.includes('plugin.json')) {
      manifest = readManifest();
      chatBroadcast('pluginList', [pluginRecord()]);
    }
    if (changed.includes('server.js')) loadServerCode();
    if (changed.some(file => file.startsWith('public/'))) await buildPlugin();

    chatBroadcast('pluginReload', {});
  }, 100);
}

async function start () {
  await buildShell();
  await buildPlugin();
  loadServerCode();

  fs.watch(PLUGIN_DIR, { recursive: true }, (event, filename) => onPluginChange(filename));

  [chatServer, pluginServer].forEach(server => server.on('error', (e) => {
    if (e.code !== 'EADDRINUSE') throw e;
    console.error(`\n  Port ${e.port} is already in use. Pick others with CHAT_PORT / PLUGIN_PORT, e.g.`);
    console.error('    CHAT_PORT=5000 PLUGIN_PORT=5001 npm run dev\n');
    process.exit(1);
  }));

  chatServer.listen(CHAT_PORT, () => {
    pluginServer.listen(PLUGIN_PORT, () => {
      console.log(`\n  chatroom:  http://localhost:${CHAT_PORT}`);
      console.log(`  plugin:    ${manifest.name} (served from :${PLUGIN_PORT})`);
      console.log('\n  Edit anything in plugin/ and the panel reloads.');
      console.log(`  Second user: open http://127.0.0.1:${CHAT_PORT} (separate cookies)\n`);
    });
  });
}

start().catch(e => {
  console.error(e);
  process.exit(1);
});
