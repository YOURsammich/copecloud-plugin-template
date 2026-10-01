# copecloud plugin template

A local copy of the cope.chat chatroom for building copecloud plugins. The
plugin being built lives in `plugin/`; `npm run dev` serves it at
http://localhost:4000 and reloads on every save.

## Where the API is documented

`README.md` is the source of truth for what a plugin can do. Read it before
writing plugin code, especially:

- **The `tools` API**: every server and client call, with what it returns.
- **Copecoins**: taking payments, claiming receipts, paying out, refunds.
- **Talking to other plugins**: `tools.plugins` calls and topics, and
  stand-ins in `dev-plugins/`.
- **Who is playing**: what `user` means and when to trust it.
- **Differences from production**: what works here but not on copecloud.

Don't use a call that isn't in the README. If something seems missing, say so
rather than reaching around `tools`.

## Rules for plugin code

- `plugin/server.js` runs on copecloud in a sandbox: no `require`, `import`,
  `process`, filesystem or env vars. Locally those happen to work; uploaded,
  they fail. Use only `tools` (outbound `fetch` is allowed).
- Register `tools.on`, `tools.plugins.expose` and `tools.plugins.subscribe` at
  the top level of `server.js`; the file reruns on every save and restart.
- To know who paid, claim the receipt with `tools.wallet.claim` on the server.
  Don't trust amounts or nicks the client sends. Check `user.verified` before
  letting someone act as a chat user.
- Tables are shared with every plugin on copecloud: prefix table names with
  the plugin's name.
- Use distinctive event names; `roomEmit` reaches every plugin's viewers in
  production.
- To test talking to another plugin, put a stand-in for it in
  `dev-plugins/<appname>.js`. Stand-ins are never uploaded.

## Layout

- `plugin/`: the plugin itself, and the only thing uploaded.
- `dev-plugins/`: local stand-ins for other plugins.
- `dev/`: the local chatroom and the copecloud stand-in. `dev/runtime.js` and
  `dev/clientTools.js` mirror copecloud's `modules/plugin_host.js` and
  `modules/plugin_runner.js`, and must stay in step with them. Plugin work
  shouldn't need changes here.

Uploading is the **Upload to copecloud** button in the local chat header; it
replaces the whole plugin on copecloud, so it's the user's call, not yours.
