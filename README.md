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
  public/icon.svg      optional icon (or icon.png / .webp / .jpg)
  public/...           any other client files, imported relatively
dev-plugins/           stand-ins for other plugins yours talks to (never uploaded)
dev/                   the local chatroom and copecloud stand-in; you shouldn't need to touch it
```

`plugin.json`:

```json
{
  "name": "myplugin",
  "description": "Ping the server and hear it pong",
  "displayMode": "sidebar",
  "permissions": [],
  "copecloudUrl": "https://cloud.cope.chat"
}
```

- `name` is the app name on copecloud: letters, numbers, `-` and `_`. Names are
  shared by everyone on copecloud, so pick one that's yours.
- `description` is one line, up to 100 characters, shown under the name in the
  chatroom's Play menu. Leave it out and uploading leaves whatever is set in
  the copecloud editor alone.
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

## Icon

Players find your plugin by its icon, on the chatroom's plugin bar and in its
Play menu. Put a square image at `plugin/public/icon.svg`, `icon.png`,
`icon.webp` or `icon.jpg`, up to 256 KB. It's drawn at 24 to 40px with
rounded corners, so keep it simple and don't put text in it. If there's more
than one, the SVG wins, then PNG, WebP, JPG.

Without an icon, the chatroom shows the first letter of the name on a colour
of its own. The local plugin bar shows your icon too, and picks up changes when
you save.

You can also set the icon in the copecloud editor's app settings instead. Pick
one place: an upload replaces the whole plugin, icon included (see below).

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
`.css`, `.json`, `.svg` and the like), plus the [icon](#icon). Anything else in
`public/`, such as other images, is skipped, and the result lists what was
skipped. copecloud refuses an icon over 256 KB, or one that isn't the image
its extension says, and the upload fails with its reason.

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
| `tools.wallet.claim(receipt)` | redeem a payment receipt: `{ ok, nick, fromApp, amount, memo }` |
| `tools.wallet.pay(nick, amount, memo)` | pay a user from your wallet: `{ ok, error }` |
| `tools.wallet.payPlugin(app, amount, memo)` | pay another plugin from your wallet; no payout permission needed: `{ ok, receipt, error }` |
| `tools.wallet.refund(receipt)` | give a payment back to whoever made it, once; no payout permission needed |
| `tools.getEmojis()` | promise of the chatroom's emojis |
| `tools.plugins.expose(name, (fromApp, ...args) => {})` | let other plugins call `name`; return the answer (see [Talking to other plugins](#talking-to-other-plugins)) |
| `tools.plugins.call(app, name, ...args)` | promise of what another plugin's exposed `name` returns |
| `tools.plugins.publish(topic, data)` | tell every plugin subscribed to your `topic` |
| `tools.plugins.subscribe(app, topic, (data, fromApp) => {})` | hear `topic` from `app`, or from any plugin with `'*'` |

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

### Paying another plugin

Plugins can pay each other from their wallets, with
`tools.wallet.payPlugin(app, amount, memo)`:

```js
// server.js of "casino"
const res = await tools.wallet.payPlugin('bank', 50, 'house fee');
// { ok: true, receipt, app: 'bank', amount: 50, coins }   coins = your wallet after
// { ok: false, error }   no such plugin, not enough coins, or it doesn't take payments
if (res.ok) await tools.plugins.call('bank', 'deposit', res.receipt);
```

It needs no **payout** permission, since the coins stay in plugin wallets.
The plugin you pay has to exist and accept payments. A plugin can't pay itself.

The coins land in the other plugin's wallet straight away, but it isn't told.
Pass it the receipt, usually with `tools.plugins.call` (see
[Talking to other plugins](#talking-to-other-plugins)), and have it claim the
receipt like a player's payment. For a payment from a plugin, `claim` gives
`fromApp`, the plugin that paid, and `nick` is null:

```js
// server.js of "bank"
tools.plugins.expose('deposit', async (fromApp, receipt) => {
  const paid = await tools.wallet.claim(receipt);   // { ok, nick: null, fromApp, amount, memo }
  if (!paid.ok || paid.fromApp !== fromApp) throw new Error('not your payment');
  credit(paid.fromApp, paid.amount);
  return { ok: true };
});
```

Don't trust an amount another plugin tells you it sent; claim the receipt.
And if your plugin takes player payments, check `paid.nick` before seating a
player: a receipt from a plugin claims fine but has no player behind it.

The plugin paid can also `tools.wallet.refund(receipt)` a payment from a
plugin. The coins go back to the paying plugin's wallet, and the result has
`fromApp` set instead of `nick`.

To show winnings, listen with `tools.onCoins(balance => ...)` rather than
calling `tools.getCoins()` after your result arrives: the two travel
separately in production, and the balance can land second.

## Talking to other plugins

Server halves can talk to each other with `tools.plugins`, in two ways.

**Calls**, when you want an answer. One plugin exposes a function, and others
call it by app name:

```js
// server.js of "bank"
tools.plugins.expose('balance', async (fromApp, nick) => {
  if (fromApp !== 'casino') throw new Error('not for you');
  return { nick, coins: 7 };
});

// server.js of "casino"
const { coins } = await tools.plugins.call('bank', 'balance', 'someone');
```

The handler gets the caller's app name first, then the caller's arguments.
What it returns (or resolves to) is the answer; if it throws, the call rejects
with its message. A call also rejects if the plugin doesn't exist, doesn't
expose that name, crashes, or takes longer than 10 seconds. On copecloud, a
plugin nobody has opened yet is started for the call.

**Topics**, for news anyone can listen to. You publish under your own name;
others subscribe to your topic, or to that topic from any plugin with `'*'`:

```js
tools.plugins.publish('win', { nick: 'someone', points: 30 });

tools.plugins.subscribe('scores', 'win', (data, fromApp) => { /* ... */ });
tools.plugins.subscribe('*', 'win', (data, fromApp) => { /* ... */ });
```

Only running plugins hear a publish; nothing is kept for later.

`fromApp` is filled in by copecloud, not the sender, so you can trust it to
decide who may call what. Arguments, answers and published data are copied
between processes: plain data, `Date`s and `Map`s travel, functions don't.
Call `expose` and `subscribe` at the top level of `server.js`, not later, so
they're in place for the first call after a restart.

### Locally: stand-in plugins

Here your plugin is the only one, so put stand-ins for the plugins you talk to
in `dev-plugins/`. `dev-plugins/bank.js` is the `server.js` of a plugin called
`bank`, run with its own `tools`. It can expose, call, publish and subscribe
like any plugin, and it reloads when you save it. Copy in another plugin's real
`server.js`, or write just enough to answer your calls:

```js
// dev-plugins/bank.js
tools.plugins.expose('balance', (fromApp, nick) => ({ nick, coins: 100 }));
```

Stand-ins are never uploaded. Calling a plugin with no stand-in fails as it
would on copecloud, and the dev server's log says which file to add.

## Dev commands

Type these in the chat:

- `/nick <name>` changes your nick. Your plugin's server gets the new one too.
- `/trust <number>` sets your trust level, which your server sees as `user.trust`.
- `/coins <number>` sets your balance. Everyone starts with ₵1000.
- `/pluginwallet [app]` shows your plugin's balance and permissions, or a
  stand-in's.
- `/pluginperm <accept|payout> <on|off> [app]` grants or revokes them.
- `/pluginfund <750|+500|-200> [app]` sets a plugin's balance, or adds to or
  takes from it, as an admin can in production. Use it to give a stand-in
  coins to pay you with.
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
- **The only other plugins are your stand-ins** in `dev-plugins/`. Each has
  its own wallet, starting empty (`/pluginfund` fills it), but they share your
  local chat and tables. Paying a plugin with no stand-in fails as it would for
  a plugin that doesn't exist on copecloud.
- **Everyone here counts as logged in.** In production a guest's `user.registered`
  is false, and a guest has no wallet.
