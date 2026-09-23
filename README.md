# copecloud plugin template

A small local copy of the chatroom for building copecloud plugins on your own
machine. It has a chat, a user list, and the same plugin bar, docked panel and
floating window the real chatroom uses. You write your plugin in `plugin/`, and
it shows up in the panel and reloads whenever you save.

## Getting started

Needs Node 22.13 or newer.

```sh
git clone <this repo> my-plugin
cd my-plugin
npm install
npm run dev
```

Open http://localhost:4000. Your plugin opens in the panel. The starter plugin
is a ping/pong demo; replace it with your own.

## Layout

```
plugin/
  plugin.json          name, display mode, and where to upload
  server.js            the server half, runs on copecloud
  public/client.svelte the client half, runs in the chatroom's iframe
  public/...           any other client files, imported relatively
dev/                   the local chatroom and copecloud stand-in; you shouldn't need to touch it
```

`plugin.json`:

```json
{
  "name": "myplugin",
  "displayMode": "sidebar",
  "owner": "",
  "copecloudUrl": "http://localhost:8080"
}
```

- `name` is the app name on copecloud: letters, numbers, `-` and `_`. Names are
  shared by everyone on copecloud, so pick one that's yours.
- `displayMode` is `sidebar` (docked next to the chat) or `floating` (a
  draggable window). It is your default; viewers can pop a plugin out or dock
  it for themselves with the buttons in its header.
- `owner` is your copecloud username. It's only needed for uploading.
- `copecloudUrl` is the copecloud server to upload to.

## Uploading to copecloud

When your plugin works locally, press **Upload to copecloud** in the chat
header. It sends everything in `plugin/` to copecloud, which saves it, builds
it and starts it, exactly like pressing Save App in the copecloud editor. The
result has a link to view it there.

An upload **replaces** the whole plugin on copecloud. Files that aren't in
`plugin/` are deleted, including any edits made in the copecloud editor since
your last upload. It asks before it sends anything.

The first upload creates the app. If the name already belongs to someone else,
copecloud refuses and you need a different `name`. A new app starts out
**private**; make it public from its settings in the copecloud editor when
it's ready.

Files are sent as text, so only text files are uploaded (`.svelte`, `.js`,
`.css`, `.json`, `.svg` and the like). Anything else in `public/`, such as
images, is skipped, and the result lists what was skipped.

Here's how the files map onto copecloud's file tree:

| here | in the copecloud editor |
|---|---|
| `plugin/server.js` | `server` |
| `plugin/public/client.svelte` | `public/client` |
| `plugin/public/lib/Foo.svelte` | `public/lib/Foo.svelte` |

## The `tools` API

Both halves get a global `tools`. It is the same object copecloud provides.

### Server (`server.js`)

The file runs top to bottom as the body of a function. There is no `require`
and no `import`. Everything reruns on every save, so set up listeners at the
top level.

| call | what it does |
|---|---|
| `tools.on(event, (user, data) => {})` | handle an event a client sent with `tools.emit` |
| `tools.privateEmit(user.nick, event, data)` | send to one user |
| `tools.roomEmit(event, data)` | send to everyone with the plugin open |
| `tools.middleware((user, event, data) => {})` | runs before every handler; return `false` to drop the event |
| `tools.initDb(table, ['col TYPE', ...])` | create a table if it doesn't exist |
| `tools.dbSet(table, {col: value})` | insert a row (returns nothing, so don't `await` it) |
| `tools.dbGet(table, {col: value})` | promise of the matching rows; no filter returns all |
| `tools.dbDelete(table, {col: value})` | delete the matching rows |
| `tools.queryMsgLog(sql)` | promise of `{ rows }` from raw SQL against the chatroom db |
| `tools.getEmojis()` | promise of the chatroom's emojis |

### Client (`public/client.svelte`)

| call | what it does |
|---|---|
| `tools.emit(event, data)` | send to your server half |
| `tools.on(event, data => {})` | handle an event from your server half |
| `tools.getNick()` | promise of the viewer's chat nick, asked of the chatroom via postMessage |
| `tools.getTrust()` | promise of the viewer's trust level, same way |
| `tools.get('nick')` | the socket's identity (see below) |

## Dev commands

Type these in the chat:

- `/nick <name>` changes your nick. Reload the plugin afterwards so its socket picks it up.
- `/trust <number>` sets the trust level `tools.getTrust()` returns.
- `/reload` reloads the plugin.
- `/help` lists these.

## Testing with more than one user

Tabs in the same browser share cookies, so they share one plugin identity, just
like they do in production. To be a second user, open
http://127.0.0.1:4000 (a different host, so separate cookies) or use a private
window.

## Ports

The chatroom runs on 4000 and the plugin host on 4001. They're on different
ports so your plugin runs cross-origin, as it does for real. Use different ones
with:

```sh
CHAT_PORT=5000 PLUGIN_PORT=5001 npm run dev
```

In PowerShell: `$env:CHAT_PORT=5000; $env:PLUGIN_PORT=5001; npm run dev`

## Differences from production

The panel, the plugin page, the websocket protocol and `tools` are copies of
the real ones. The data behind them is not.

- **The databases are SQLite, not Postgres.** Plugin tables live in
  `.dev/plugin.sqlite` and survive restarts; delete the file to start over. The
  chatroom db behind `queryMsgLog` is in memory. It has `message_log`, filled
  by what you type in the chat, and a few sample `emojis`. Plain
  SELECT/INSERT/DELETE behave the same. Postgres-only syntax (`ILIKE`,
  `to_tsquery`, `::` casts, `SERIAL`) won't.
- **Quote camelCase columns.** Real chatroom columns like `"channelName"` are
  case-sensitive in Postgres and need the quotes. SQLite doesn't care, so a
  missing quote works here and fails in production.
- **Plugin tables aren't namespaced** in production. Every plugin shares one
  database, so prefix your table names (`myplugin_scores`, not `scores`).
- **A handler that throws** is logged here. In production it can take down the
  copecloud server for everyone, so catch your errors.
- **`roomEmit` reaches everyone on copecloud** with any plugin open, not just
  your plugin's users. Events are only delivered to handlers with that name,
  so use distinctive event names.
- **`tools.get('nick')`** is the `nick` cookie. That's the chat nick for guests,
  and a random id when the cookie isn't set. Use `tools.getNick()` when you
  want the name people see in chat.
