//Bundles the client half of the plugin the way copecloud does
//(copecloud: modules/app_builder.js), and the chat shell around it.

const fs = require('fs');
const path = require('path');

const esbuild = require('esbuild');
const sveltePlugin = require('esbuild-svelte');

const ROOT = path.join(__dirname, '..');
const PLUGIN_DIR = path.join(ROOT, 'plugin');
const OUT_DIR = path.join(ROOT, '.dev');
const BUILD_DIR = path.join(OUT_DIR, 'build');

const CLIENT_ENTRY = path.join(PLUGIN_DIR, 'public', 'client.svelte');
const MAIN_ENTRY = path.join(BUILD_DIR, '__main.svelte');

//The same wrapper copecloud generates: the plugin becomes the <app-input>
//custom element and is held back until the socket has sent the user's data.
function writeWrapper () {
  fs.mkdirSync(BUILD_DIR, { recursive: true });

  const clientImport = path.relative(BUILD_DIR, CLIENT_ENTRY).split(path.sep).join('/');

  fs.writeFileSync(MAIN_ENTRY, `
<svelte:options customElement="app-input" />

<script>
  import App from '${clientImport}';

  let appReady = false;

  window.addEventListener('userDataReady', () => {
    appReady = true;
  });

  tools._initWebSocket();
</script>

{#if appReady}
  <App/>
{/if}
`);
}

//Resolves true on success. A broken build is reported, not thrown, so the dev
//server keeps running while you fix it.
async function buildPlugin () {
  if (!fs.existsSync(CLIENT_ENTRY)) {
    console.log('[build] plugin/public/client.svelte is missing');
    return false;
  }

  writeWrapper();

  try {
    await esbuild.build({
      entryPoints: [MAIN_ENTRY],
      bundle: true,
      format: 'esm',
      outfile: path.join(OUT_DIR, 'bundle.js'),
      sourcemap: true,
      plugins: [sveltePlugin({
        compilerOptions: { customElement: true }
      })],
      logLevel: 'silent'
    });
    console.log('[build] plugin client built');
    return true;
  } catch (e) {
    console.log('[build] plugin client failed:\n' + (e.errors || []).map(err =>
      `  ${err.location ? err.location.file + ':' + err.location.line + ' ' : ''}${err.text}`
    ).join('\n'));
    return false;
  }
}

async function buildShell () {
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'shell', 'App.jsx')],
    bundle: true,
    format: 'esm',
    outfile: path.join(OUT_DIR, 'shell.js'),
    jsx: 'automatic',
    loader: { '.js': 'jsx' },
    define: { 'process.env.NODE_ENV': '"development"' },
    logLevel: 'warning'
  });
}

module.exports = {
  PLUGIN_DIR,
  OUT_DIR,
  buildPlugin,
  buildShell
};
