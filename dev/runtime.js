//Runs the server half of the plugin with the same `tools` object copecloud
//gives it (copecloud: modules/plugin_host.js). Keep the two in step: if a
//tool is added or changes shape there, mirror it here, or plugins that work
//locally will break once they are uploaded.
//
//One difference: copecloud runs server.js in a sandboxed child process (no
//filesystem, no environment). Here it runs in the dev server's own process,
//so code that reaches for `process` or `require` will work locally and fail
//once uploaded. Stick to `tools`.
//
//Besides your plugin, this can run stand-ins for other plugins (dev-plugins/),
//so tools.plugins has someone to talk to. Each gets its own `tools`, as on
//copecloud, where each plugin is a process of its own.

const db = require('./db');

//connected plugin sockets, one per open iframe
const users = [];

//Every plugin running here, by app name: yours and the stand-ins.
//{ events, middlewares, exposed, subscriptions, tools }
const plugins = Object.create(null);
let mainApp = null;

//As on copecloud (modules/plugin_runner.js): a plugin-to-plugin call that
//isn't answered in time fails.
const CALL_TIMEOUT_MS = 10000;

//set by index.js, which owns the chat users and the wallet stand-in
let providers = null;

function configure (p) {
  providers = p;
}

//every open socket for that nick, one per tab
function findAllByNick (nick) {
  return users.filter(user => user.nick === nick);
}

function send (user, eventName, data) {
  if (user.ws.readyState === 1) {
    user.ws.send(JSON.stringify({ eventName, data }));
  }
}

//Production's db tools are async and fire-and-forget: initDb/dbSet return
//nothing, dbGet/dbDelete return promises. SQLite is synchronous, so defer the
//work to keep the same timing a plugin will see for real.
function later (fn) {
  return Promise.resolve().then(fn);
}

function logError (label) {
  return (e) => console.log(`[plugin] ${label} error:`, e.message);
}

//On copecloud, arguments, answers and published data are copied between
//processes; copy them here too, so what can't be sent fails locally as well.
function copy (value) {
  return structuredClone(value);
}

//tools.plugins.call: another plugin's exposed function, called as `from`.
function callPlugin (from, target, name, args) {
  return new Promise((resolve, reject) => {
    const plugin = plugins[target];
    if (!plugin) {
      console.log(`[${from}] called ${target}, which isn't running here. Add dev-plugins/${target}.js to stand in for it.`);
      return reject(new Error(`There is no plugin called ${target}`));
    }

    let sent;
    try {
      sent = copy(args);
    } catch (e) {
      return reject(new Error(`Can't send that to ${target}: ${e.message}`));
    }

    const timer = setTimeout(() => reject(new Error(`${target} did not answer '${name}' in time`)), CALL_TIMEOUT_MS);
    function settle (fn, value) {
      clearTimeout(timer);
      fn(value);
    }

    later(() => {
      const handler = Object.prototype.hasOwnProperty.call(plugin.exposed, name) && plugin.exposed[name];
      if (!handler) throw new Error(`${target} has no '${name}'`);
      return handler(from, ...sent);
    }).then(value => {
      let answer;
      try {
        answer = copy(value);
      } catch (e) {
        return settle(reject, new Error(`'${name}' returned something that can't be sent: ${e.message}`));
      }
      settle(resolve, answer);
    }, e => settle(reject, new Error((e && e.message) || String(e))));
  });
}

//tools.plugins.publish: every plugin subscribed to this topic, from this
//plugin or from '*'.
function publish (from, topic, data) {
  const sent = copy(data);
  for (const plugin of Object.values(plugins)) {
    const callbacks = [
      ...(plugin.subscriptions[JSON.stringify([from, topic])] || []),
      ...(plugin.subscriptions[JSON.stringify(['*', topic])] || [])
    ];
    for (const callback of callbacks) {
      later(() => callback(copy(sent), from))
        .catch(e => console.log(`[${plugin.appname}] error in '${topic}' subscriber:`, e));
    }
  }
}

function createTools (plugin) {
  return {
    middleware (callback) {
      plugin.middlewares.push(callback);
    },
    on (eventName, callback) {
      if (!plugin.events[eventName]) plugin.events[eventName] = [];
      plugin.events[eventName].push(callback);
    },
    privateEmit (nick, eventName, data) {
      //a nick can have several tabs open; all of them are that user
      const matches = findAllByNick(nick);
      if (matches.length) {
        matches.forEach(user => send(user, 'pluginEvent', { eventName, data }));
      } else {
        console.log('user not found', nick);
      }
    },
    roomEmit (eventName, data) {
      users.forEach(user => send(user, 'pluginEvent', { eventName, data }));
    },
    //Chat data and this plugin's coins. In production these go through the
    //chatroom's plugin API; index.js supplies local stand-ins (configure).
    chat: {
      recentMessages (channel = 'main', limit = 50) {
        return later(() => providers.chat.recentMessages(channel, limit));
      },
      search (text, opts = {}) {
        return later(() => providers.chat.search(text, opts));
      },
      user (nick) {
        return later(() => providers.chat.user(nick));
      },
      channel (name = 'main') {
        return later(() => providers.chat.channel(name));
      }
    },
    wallet: {
      balance () {
        return later(() => providers.wallet.balance());
      },
      pay (nick, amount, memo) {
        return later(() => providers.wallet.pay(nick, amount, memo));
      },
      claim (receipt) {
        return later(() => providers.wallet.claim(receipt));
      },
      refund (receipt) {
        return later(() => providers.wallet.refund(receipt));
      }
    },
    queryMsgLog () {
      return Promise.reject(new Error(
        'tools.queryMsgLog has been removed. Use tools.chat.recentMessages, tools.chat.search, ' +
        'tools.chat.user or tools.chat.channel instead.'
      ));
    },
    getEmojis () {
      return later(() => db.getEmojis());
    },

    initDb (table, columns) {
      later(() => db.initDb(table, columns)).catch(logError('initDb'));
    },
    dbSet (table, data) {
      later(() => db.dbSet(table, data)).catch(logError('dbSet'));
    },
    dbGet (table, data) {
      return later(() => db.dbGet(table, data));
    },
    dbDelete (table, data) {
      return later(() => db.dbDelete(table, data));
    },

    //Talking to other plugins. Here those are the stand-ins in dev-plugins/.
    //`fromApp` is always the real sender: copecloud fills it in.
    plugins: {
      //let other plugins call `name`: handler(fromApp, ...args)
      expose (name, handler) {
        if (typeof handler !== 'function') throw new TypeError('tools.plugins.expose needs a function');
        plugin.exposed[name] = handler;
      },
      //call what another plugin exposed
      call (appname, name, ...args) {
        return callPlugin(plugin.appname, appname, name, args);
      },
      //tell every plugin subscribed to this plugin's `topic`
      publish (topic, data) {
        publish(plugin.appname, topic, data);
      },
      //hear `topic` from one plugin, or any with '*': callback(data, fromApp)
      subscribe (appname, topic, callback) {
        const key = JSON.stringify([appname, topic]);
        if (!plugin.subscriptions[key]) plugin.subscriptions[key] = [];
        plugin.subscriptions[key].push(callback);
      }
    }
  };
}

//Same as copecloud's runCode: listeners are reset, then the file is run as the
//body of a function that receives `tools`. Rerunning on save is how a change
//takes effect without restarting anything.
function load (appname, code, label) {
  const plugin = { appname, events: {}, middlewares: [], exposed: {}, subscriptions: {} };
  plugin.tools = createTools(plugin);
  plugins[appname] = plugin;

  const funcCode = 'try {' + code + '} catch (e) { console.log(e); }';

  try {
    new Function('tools', funcCode)(plugin.tools);
    console.log(`[plugin] ${label} loaded`);
  } catch (e) {
    //a syntax error throws here, before the try/catch inside the code exists
    console.log(`[plugin] ${label} failed to load:`, e.message);
  }
}

//Your plugin's server.js, as the app called `appname` (plugin.json's name).
function run (code, appname) {
  if (mainApp && mainApp !== appname) delete plugins[mainApp];
  mainApp = appname;
  load(appname, code, 'server.js');
}

//Stand-ins for other plugins: { appname: code }. Replaces the previous set.
function runStandIns (standIns) {
  for (const appname of Object.keys(plugins)) {
    if (appname !== mainApp) delete plugins[appname];
  }
  for (const [appname, code] of Object.entries(standIns)) {
    if (appname === mainApp) {
      console.log(`[plugin] dev-plugins/${appname}.js has your plugin's name; skipped`);
      continue;
    }
    load(appname, code, `dev-plugins/${appname}.js`);
  }
}

//Handlers get the same plain { nick, id } production's sandbox passes, not
//the socket.
function trigger (eventName, socketUser, data) {
  const plugin = plugins[mainApp];
  if (!plugin) return;

  const user = {
    nick: socketUser.nick,
    id: socketUser.id,
    registered: socketUser.registered,
    trust: socketUser.trust,
    verified: socketUser.verified
  };

  let middledata;
  for (let middleware of plugin.middlewares) {
    try {
      middledata = middleware(user, eventName, data);
    } catch (e) {
      console.log('[plugin] middleware error:', e);
      return;
    }
    if (middledata === false) {
      console.log('middleware returned false');
      return;
    }
  }

  (plugin.events[eventName] || []).forEach(callback => {
    //as in production, a handler that throws is logged and the plugin keeps
    //running
    try {
      const result = callback(user, data, middledata);
      if (result && typeof result.catch === 'function') {
        result.catch(e => console.log(`[plugin] error in '${eventName}' handler:`, e));
      }
    } catch (e) {
      console.log(`[plugin] error in '${eventName}' handler:`, e);
    }
  });
}

function sendUserData (user) {
  send(user, 'userData', {
    nick: user.nick,
    id: user.id,
    registered: user.registered,
    trust: user.trust,
    verified: user.verified
  });
}

//A plugin socket's identity works like copecloud's (modules/users.js): it
//starts as an 'anon-' id, and becomes the chat user once the page sends an
//identity pass from the chat, which `redeem` checks (in production copecloud
//asks the chatroom). Cookies play no part.
function connect (ws, redeem) {
  const id = 'anon-' + require('crypto').randomBytes(8).toString('hex');
  const user = { nick: id, id, registered: false, trust: null, verified: false, app: null, ws };
  users.push(user);

  sendUserData(user);

  ws.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!message || typeof message !== 'object') return;

    if (message.eventName === 'auth') {
      const { ticket, appname } = message.data || {};
      const who = (!user.app || user.app === appname) ? redeem(ticket, appname) : null;
      if (who) {
        Object.assign(user, { nick: who.nick, registered: who.registered, trust: who.trust, verified: true, app: appname });
        send(user, 'authResult', { ok: true });
        sendUserData(user);
      } else {
        send(user, 'authResult', { ok: false });
      }
    } else if (message.eventName === 'pluginEvent') {
      const { eventName, data, appname } = message.data || {};
      if (user.app && appname !== user.app) return;
      trigger(eventName, user, data);
    }
  });

  ws.on('close', () => {
    const index = users.indexOf(user);
    if (index !== -1) users.splice(index, 1);
  });
}

module.exports = {
  configure,
  run,
  runStandIns,
  connect
};
