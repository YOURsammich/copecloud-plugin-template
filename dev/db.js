//Stands in for the two Postgres databases a plugin touches in production:
//
//  plugin tables  -> copecloud's db, via tools.initDb/dbSet/dbGet/dbDelete.
//                    Kept in .dev/plugin.sqlite so your data survives restarts.
//  chatroom db    -> the chatroom's `awakens` db, via tools.queryMsgLog. Here it
//                    is in memory: a message_log fed by the local chat, plus a
//                    few sample emojis. It starts fresh every run.
//
//SQLite is not Postgres. Simple SELECT/INSERT/DELETE behave the same, but the
//dialects differ at the edges; see "Differences from production" in the README.

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', '.dev');
fs.mkdirSync(DATA_DIR, { recursive: true });

const pluginDb = new DatabaseSync(path.join(DATA_DIR, 'plugin.sqlite'));
const chatDb = new DatabaseSync(':memory:');

//same quoting as pg-format's %I
function ident (name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

//sqlite can't bind booleans; Postgres would store them as booleans
function bindable (value) {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === undefined) return null;
  return value;
}

function where (columns) {
  const keys = Object.keys(columns || {});
  if (!keys.length) return { sql: 'true', params: [] };

  return {
    sql: keys.map(key => ident(key) + ' = ?').join(' AND '),
    params: keys.map(key => bindable(columns[key]))
  };
}

//plugin tables

function initDb (table, columns) {
  //production hands the column list to pg-format's %s, which joins arrays with ','
  const cols = Array.isArray(columns) ? columns.join(',') : columns;
  pluginDb.exec(`CREATE TABLE IF NOT EXISTS ${ident(table)} (${cols})`);
}

function dbSet (table, data) {
  const keys = Object.keys(data);
  pluginDb
    .prepare(`INSERT INTO ${ident(table)} (${keys.map(ident).join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
    .run(...keys.map(key => bindable(data[key])));
}

function dbGet (table, columns) {
  const w = where(columns);
  return pluginDb.prepare(`SELECT * FROM ${ident(table)} WHERE ${w.sql}`).all(...w.params);
}

function dbDelete (table, columns) {
  const w = where(columns);
  pluginDb.prepare(`DELETE FROM ${ident(table)} WHERE ${w.sql}`).run(...w.params);
}

//chatroom db

chatDb.exec(`
  CREATE TABLE message_log (
    "channelName" TEXT, message TEXT, "messageType" TEXT, time INTEGER,
    nick TEXT, flair TEXT, count INTEGER
  );
  CREATE TABLE emojis (
    "channelName" TEXT, id TEXT, "imageName" TEXT, nick TEXT, category TEXT
  );
`);

const insertEmoji = chatDb.prepare('INSERT INTO emojis VALUES (?, ?, ?, ?, ?)');
[
  ['copium', 'copium.png'],
  ['hopium', 'hopium.png'],
  ['kek', 'kek.png']
].forEach(([id, imageName]) => insertEmoji.run('/main', id, imageName, 'dev', 'default'));

let messageCount = 0;
const insertMessage = chatDb.prepare('INSERT INTO message_log VALUES (?, ?, ?, ?, ?, ?, ?)');

function logMessage ({ nick, message }) {
  messageCount++;
  insertMessage.run('main', message, 'chat-message', Date.now(), nick, null, messageCount);
  return messageCount;
}

//Returns the same shape as a pg result, since that is what production hands
//back: plugins read `.rows`.
function queryMsgLog (query) {
  const statement = chatDb.prepare(query);

  if (/^\s*(select|with|pragma)\b/i.test(query)) {
    const rows = statement.all();
    return { rows, rowCount: rows.length };
  }

  const info = statement.run();
  return { rows: [], rowCount: Number(info.changes) };
}

function getEmojis () {
  return chatDb.prepare('SELECT * FROM emojis').all();
}

module.exports = {
  initDb,
  dbSet,
  dbGet,
  dbDelete,
  logMessage,
  queryMsgLog,
  getEmojis
};
