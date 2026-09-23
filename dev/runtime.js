//Runs the server half of the plugin with the same `tools` object copecloud
//gives it (copecloud: modules/plugin_runner.js). Keep the two in step: if a
//tool is added or changes shape there, mirror it here, or plugins that work
//locally will break once they are uploaded.

const db = require('./db');

//connected plugin sockets, one per open iframe
const users = [];

let events = {};
let middlewares = [];

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

const tools = {
  middleware (callback) {
    middlewares.push(callback);
  },
  on (eventName, callback) {
    if (!events[eventName]) events[eventName] = [];
    events[eventName].push(callback);
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
  queryMsgLog (query) {
    return later(() => db.queryMsgLog(query));
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
  }
};

//Same as copecloud's runCode: listeners are reset, then the file is run as the
//body of a function that receives `tools`. Rerunning on save is how a change
//takes effect without restarting anything.
function run (code) {
  events = {};
  middlewares = [];

  const funcCode = 'try {' + code + '} catch (e) { console.log(e); }';

  try {
    new Function('tools', funcCode)(tools);
    console.log('[plugin] server.js loaded');
  } catch (e) {
    //a syntax error throws here, before the try/catch inside the code exists
    console.log('[plugin] server.js failed to load:', e.message);
  }
}

function trigger (eventName, user, data) {
  let middledata;
  for (let middleware of middlewares) {
    middledata = middleware(user, eventName, data);
    if (middledata === false) {
      console.log('middleware returned false');
      return;
    }
  }

  (events[eventName] || []).forEach(callback => {
    try {
      callback(user, data, middledata);
    } catch (e) {
      //production would take the whole server down here; a crash in dev
      //should just show up in the log
      console.log(`[plugin] error in '${eventName}' handler:`, e);
    }
  });
}

//A plugin socket's identity works like copecloud's: the `nick` cookie if the
//browser has one (the chatroom sets it), else a random id. Note that this is
//the chat nick only because the chat and the plugin host share a hostname.
function connect (ws, nick) {
  const user = { nick, id: nick, ws };
  users.push(user);

  send(user, 'userData', { nick: user.nick, id: user.id });

  ws.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (message.eventName === 'pluginEvent') {
      const { eventName, data } = message.data || {};
      trigger(eventName, user, data);
    }
  });

  ws.on('close', () => {
    const index = users.indexOf(user);
    if (index !== -1) users.splice(index, 1);
  });
}

module.exports = {
  run,
  connect
};
