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
  "permissions": [],
  "copecloudUrl": "https://cloud.cope.chat"
}
```

- `name` is the app name on copecloud: letters, numbers, `-` and `_`. Names are
  shared by everyone on copecloud, so pick one that's yours.
- `displayMode` is `sidebar` (docked next to the chat) or `floating` (a
  draggable window). It is your default; viewers can pop a plugin out or dock
  it for themselves with the buttons in its header.
- `permissions` is what players must agree to before your plugin opens. The
  only one so far is `"wallet"`, which you need to take coins (see
  [Copecoins](#copecoins)). Uploading sends it along with the display mode.
- `copecloudUrl` is the copecloud server to upload to. It defaults to the
  live server; use `http://localhost:8080` for a copecloud on your own machine.

An `owner` field from older versions is ignored: an upload belongs to the
account your dev token signs in as.

## Uploading to copecloud

You upload as your cope.chat account. Type `/devtoken` in the chat and save
the token it shows you in a file named `.copecloud-token` next to
`package.json` (it's gitignored), or set it in the `COPECLOUD_TOKEN`
environment variable. Keep it secret: it lets anyone edit your plugins.
`/revokedevtokens` cancels every token you've made. The same token signs you
in to the copecloud editor.

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

On copecloud it runs in a sandboxed process of its own: no filesystem, no
environment variables, no child processes. Handlers get `user` as a plain
`{ nick, id, registered, trust, verified }` (see [Who is playing](#who-is-playing)).

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
| `tools.chat.recentMessages(channel, limit)` | promise of recent chat messages, newest first (max 100) |
| `tools.chat.search(text, {channel, nick, limit})` | promise of matching chat messages (max 50) |
| `tools.chat.user(nick)` | promise of a public profile, or null |
| `tools.chat.channel(name)` | promise of channel info and who is online |
| `tools.wallet.balance()` | promise of your plugin's wallet: `{ coins, accept, payout }` |
| `tools.wallet.claim(receipt)` | redeem a payment receipt: `{ ok, nick, amount, memo }` |
| `tools.wallet.pay(nick, amount, memo)` | pay a user from your wallet: `{ ok, error }` |
| `tools.wallet.refund(receipt)` | give a payment back to whoever made it, once; no payout permission needed |
| `tools.getEmojis()` | promise of the chatroom's emojis |

`tools.queryMsgLog` has been removed; use `tools.chat.*`.

### Client (`public/client.svelte`)

| call | what it does |
|---|---|
| `tools.emit(event, data)` | send to your server half |
| `tools.on(event, data => {})` | handle an event from your server half |
| `tools.requestPayment(amount, memo)` | take a payment from the viewer (needs the wallet permission): `{ ok, receipt, error }` |
| `tools.getCoins()` | promise of the viewer's balance (null for a guest) |
| `tools.onCoins(balance => {})` | called whenever the viewer's balance changes, e.g. when a payout lands |
| `tools.getNick()` | promise of the viewer's chat nick, asked of the chatroom via postMessage |
| `tools.getTrust()` | promise of the viewer's trust level, same way |
| `tools.get('nick')` | who the viewer is, for display: also `'verified'`, `'registered'`, `'trust'` (see Who is playing) |

## Copecoins

Your plugin has its own wallet. To take coins, add `"permissions": ["wallet"]`
to `plugin.json`. The first time a player opens your plugin, the chatroom tells
them it can take coins from them without asking each time, and opens it only if
they agree. After that, payments go through with no prompt; the player gets a
private note in the chat for each one.

Players pay in from the client, and your server claims the receipt. The claim is
the only thing that tells you who really paid, because `user.nick` is just a
cookie:

```js
// public/client.svelte
const res = await tools.requestPayment(25, 'Dice buy-in');
if (res.ok) tools.emit('joined', { receipt: res.receipt });
```

```js
// server.js
tools.on('joined', async (user, { receipt }) => {
  const paid = await tools.wallet.claim(receipt);   // once per receipt
  if (!paid.ok) return;
  pot += paid.amount;
  players.push(paid.nick);
});

async function payWinner (nick) {
  const res = await tools.wallet.pay(nick, pot, 'Dice pot');
  if (res.ok) pot = 0;
}
```

Paying out needs an admin to grant your plugin **payout** in the chatroom
(`/pluginperm <plugin> payout on`). Taking payments is allowed by default.
Locally you grant it yourself with `/pluginperm payout on`.

If you take a payment you then can't honour, such as a bet bigger than you can
cover or a game that was called off, hand it back with
`tools.wallet.refund(receipt)`. That works without **payout**, because the
coins can only go back to whoever paid.

To show winnings, listen with `tools.onCoins(balance => ...)` rather than
calling `tools.getCoins()` after your result arrives: the two travel
separately in production, and the balance can land second.

## Dev commands

Type these in the chat:

- `/nick <name>` changes your nick. Your plugin's server gets the new one too.
- `/trust <number>` sets your trust level, which your server sees as `user.trust`.
- `/coins <number>` sets your balance. Everyone starts with ₵1000.
- `/pluginwallet` shows your plugin's balance and permissions.
- `/pluginperm <accept|payout> <on|off>` grants or revokes them.
- `/reload` reloads the plugin.
- `/help` lists these.

## Who is playing

Every handler gets `user = { nick, id, registered, trust, verified }`. Opened
from the chat, `user.nick` is the viewer's real chat nick: the chat page hands
your plugin a one-time pass and the server checks it, so it can't be faked.
Opened anywhere else, such as the plugin's own tab, `verified` is false and
`nick` is an `anon-…` id. See copecloud's `docs/chatroom-data-access.md` for
details.

## Testing with more than one user

Tabs in the same browser share cookies, so they're the same chat user. To be a
second user, open http://127.0.0.1:4000 (a different host, so separate
cookies) or use a private window.

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
  `.dev/plugin.sqlite` and survive restarts; delete the file to start over.
  Plain SELECT/INSERT/DELETE behave the same. Postgres-only syntax (`ILIKE`,
  `::` casts, `SERIAL`) won't.
- **Chat data is local.** `tools.chat.*` reads what you type in this chat.
  Search is a plain substring match here and full-text search in production.
- **Coins are in memory** and reset on every restart.
- **Plugin tables aren't namespaced** in production. Every plugin shares one
  database, so prefix your table names (`myplugin_scores`, not `scores`).
- **Your server code isn't sandboxed here.** It runs inside the dev server, so
  `process` and friends work locally and fail on copecloud. Stick to `tools`.
- **`roomEmit` reaches everyone on copecloud** with any plugin open, not just
  your plugin's users. Events are only delivered to handlers with that name,
  so use distinctive event names.
- **Everyone here counts as logged in.** In production a guest's `user.registered`
  is false, and a guest has no wallet.
