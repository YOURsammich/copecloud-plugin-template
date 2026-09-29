import { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

import socket from './socket';

import Chat from './Chat';
import CodeRunWindow from './CodeRunWindow';
import PluginWindow from './PluginWindow';
import { readOverrides, writeOverrides, resolveMode } from './pluginMode';
import PluginPaymentDialog from './PluginPaymentDialog';
import { parsePluginRequest, originOf } from './pluginBridge';
import { isTrusted, requestTrustList, setPluginTrusted, useTrustedPlugins } from './pluginTrust';

// The plugin host, standing in for copecloud. Same hostname as this page so
// the two share the `nick` cookie, different port so the plugin is
// cross-origin, as in production.
const COPE_CLOUD = location.protocol + '//' + location.hostname + ':' + window.DEV_CONFIG.pluginPort + '/';
const COPE_CLOUD_ORIGIN = originOf(COPE_CLOUD);

const PAYMENT_TIMEOUT_MS = 15000;

function replyToPlugin(win, message) {
  try {
    win.postMessage(message, COPE_CLOUD_ORIGIN);
  } catch {
    // the frame is gone
  }
}

// The plugin bar, panel and message bridge below follow the real chatroom's
// App.jsx (eyechat-client/src/App.jsx); CodeRunWindow, PluginWindow,
// DraggableWindow and pluginMode are copied from it unchanged. Everything else
// the chatroom does is left out.
function App() {
  const [showApp, setShowApp] = useState(null);
  const [userlist, setUserlist] = useState([]);
  const [userID, setUserID] = useState(null);
  const [plugins, setPlugins] = useState([]);
  const [modeOverrides, setModeOverrides] = useState(readOverrides);
  const [connected, setConnected] = useState(false);

  const iframeRef = useRef(null);
  const lastAppRef = useRef(null);
  const myUserRef = useRef(null);
  const openedRef = useRef(false);
  const [payment, setPayment] = useState(null);
  const pendingPayRef = useRef(null);
  const pluginRequestRef = useRef(null);
  const openPluginRef = useRef(null);
  const trustedPlugins = useTrustedPlugins();

  const myUser = userlist.find(u => u.id === userID);
  myUserRef.current = myUser;

  useEffect(() => {
    socket.on('open', () => setConnected(true));
    socket.on('close', () => setConnected(false));

    socket.on('userlist', (list) => setUserlist(list));
    socket.on('setID', (id) => setUserID(id));
    socket.on('userJoin', (user) => setUserlist(prev => [...prev, user]));

    socket.on('userLeft', (user) => {
      setUserlist(prev => prev.filter(a => a.id !== user.id));
    });

    socket.on('userStateChange', ({ user, stateChange }) => {
      setUserlist(prev => prev.map(a => a.id === user.id ? { ...a, ...stateChange } : a));
    });

    // There is only ever your plugin here, so open it straight away.
    socket.on('pluginList', (list) => {
      setPlugins(list);
      if (!openedRef.current && list[0]) {
        openedRef.current = true;
        setShowApp(list[0].appname);
      }
    });

    // The dev server says a plugin file changed.
    socket.on('pluginReload', () => {
      if (window._refreshIframe) window._refreshIframe();
    });

    socket.init();

    window.addEventListener('message', (e) => {
      const user = myUserRef.current;
      if (!iframeRef.current || !user) return;

      if (e.data === 'requestnick') {
        iframeRef.current.contentWindow.postMessage('nick: ' + user.nick, '*');
      } else if (e.data === 'requesttrust') {
        iframeRef.current.contentWindow.postMessage('trust: ' + user.trust, '*');
      }

      // Coin requests are only taken from the open plugin's own frame.
      const request = parsePluginRequest(e.data);
      if (request && e.source === iframeRef.current.contentWindow) {
        pluginRequestRef.current(request, e.source);
      }
    });

    socket.on('pluginPayResult', (result) => {
      const pending = pendingPayRef.current;
      if (!pending || result?.requestId !== pending.requestId) return;
      if (result.needsConfirm) {
        setPayment(pending);
        return;
      }
      finishPayment(pending, { ok: !!result.ok, receipt: result.receipt, error: result.error });
    });

    socket.on('open', () => requestTrustList());
  }, []);

  // The coin half of the bridge, as in the chatroom's App.jsx.
  pluginRequestRef.current = (request, win) => {
    const user = myUserRef.current;
    const appname = openPluginRef.current?.appname;
    if (!appname) return;

    if (request.type === 'requestCoins') {
      replyToPlugin(win, { copecloud: 'coins', id: request.id, coins: user.registered ? (user.coins ?? 0) : null });
      return;
    }

    const fail = (error) => replyToPlugin(win, { copecloud: 'paymentResult', id: request.id, ok: false, error });
    if (request.type === 'invalid') return fail(request.error);
    if (!user.registered) return fail('Log in to pay with coins.');
    if (pendingPayRef.current) return fail('Another payment is still waiting.');

    const pending = {
      requestId: Math.random().toString(36).slice(2),
      id: request.id,
      appname,
      amount: request.amount,
      memo: request.memo,
      win,
    };
    pendingPayRef.current = pending;
    if (isTrusted(appname)) {
      sendPayment(pending, { confirmed: false });
    } else {
      setPayment(pending);
    }
  };

  function sendPayment(pending, { confirmed, trust = false }) {
    socket.emit('pluginPay', {
      requestId: pending.requestId,
      appname: pending.appname,
      amount: pending.amount,
      memo: pending.memo,
      confirmed,
      trust,
    });
    setTimeout(() => {
      if (pendingPayRef.current === pending) {
        finishPayment(pending, { ok: false, error: 'No answer from the server. Check your balance before trying again.' });
      }
    }, PAYMENT_TIMEOUT_MS);
  }

  function finishPayment(pending, result) {
    if (pendingPayRef.current === pending) pendingPayRef.current = null;
    setPayment(current => current === pending ? null : current);
    replyToPlugin(pending.win, { copecloud: 'paymentResult', id: pending.id, ...result });
  }

  // Keep the nick cookie in step with the chat nick, as the chatroom does for
  // guests. The plugin socket reads it when the iframe connects.
  useEffect(() => {
    if (!myUser?.nick) return;
    fetch('/set-nick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nick: myUser.nick })
    });
  }, [myUser?.nick]);

  useEffect(() => { if (showApp) lastAppRef.current = showApp; }, [showApp]);

  const openPlugin = plugins.find(p => p.appname === showApp) || null;
  const openMode = openPlugin ? resolveMode(openPlugin, modeOverrides) : null;
  openPluginRef.current = openPlugin;

  useEffect(() => {
    const pending = pendingPayRef.current;
    if (pending && pending.appname !== showApp) {
      finishPayment(pending, { ok: false, cancelled: true, error: 'Cancelled.' });
    }
  }, [showApp]);

  function setPluginMode(appname, mode) {
    setModeOverrides(prev => {
      const next = { ...prev, [appname]: mode };
      writeOverrides(next);
      return next;
    });
  }

  function togglePluginPanel() {
    setShowApp(open => open ? null : (lastAppRef.current || plugins[0]?.appname || null));
  }

  const pluginProps = openPlugin && {
    pluginName: openPlugin.appname,
    owner: openPlugin.owner,
    copeCloud: COPE_CLOUD,
    giveRefresh: (refresh) => { window._refreshIframe = refresh; },
    giveIframe: (iframe) => { iframeRef.current = iframe; },
    onClose: () => setShowApp(null),
    trusted: trustedPlugins.includes(openPlugin.appname),
    onRevokeTrust: () => setPluginTrusted(openPlugin.appname, false),
  };

  return (
    <div style={{ flexDirection: 'column', display: 'flex', flex: 1, overflow: 'hidden' }}>
      {payment ? (
        <PluginPaymentDialog
          appname={payment.appname}
          amount={payment.amount}
          memo={payment.memo}
          balance={myUser?.coins}
          onPay={(trust) => {
            setPayment(null);
            sendPayment(payment, { confirmed: true, trust });
          }}
          onCancel={() => finishPayment(payment, { ok: false, cancelled: true, error: 'Cancelled.' })}
        />
      ) : null}

      <div id='main-container'>

        <div className="sideBar">
          <div className="appViewToggle" onClick={togglePluginPanel}>
            <span className="material-symbols-outlined">code</span>
          </div>
          <div className='pluginSelectionContainer'>
            {plugins.map((plugin) => (
              <div
                key={plugin.appname}
                title={plugin.appname}
                className={'pluginSelect' + (plugin.appname === showApp ? ' pluginSelectActive' : '')}
                onClick={() => setShowApp(plugin.appname)}
              >
                {plugin.appname.slice(0, 2) + plugin.appname.slice(-2)}
              </div>
            ))}
          </div>
        </div>

        {openMode === 'sidebar' ? (
          <CodeRunWindow
            focusOnCode={false}
            draggingWindow={false}
            onPopOut={() => setPluginMode(openPlugin.appname, 'floating')}
            {...pluginProps}
          />
        ) : null}

        {openMode === 'floating' ? (
          <PluginWindow
            onDock={() => setPluginMode(openPlugin.appname, 'sidebar')}
            {...pluginProps}
          />
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowX: 'hidden' }}>
          <Chat socket={socket} userlist={userlist} user={myUser} connected={connected} />
        </div>

      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);
