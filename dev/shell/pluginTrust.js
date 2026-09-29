import { useSyncExternalStore } from 'react';
import socket from './socket';

// The plugins this account has chosen to fully trust (their payment requests
// skip the confirm dialog). The server holds the list (plugin_user_trust) and
// sends it as `pluginTrustList` whenever it's asked for or changes; this module
// keeps the latest copy so the plugin header and Settings can both read it
// without threading it through the component tree.

let trusted = [];
const listeners = new Set();

socket.on('pluginTrustList', (list) => {
  trusted = Array.isArray(list) ? list : [];
  listeners.forEach((fn) => fn());
});

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isTrusted(appname) {
  return trusted.includes(appname);
}

export function useTrustedPlugins() {
  return useSyncExternalStore(subscribe, () => trusted);
}

export function requestTrustList() {
  socket.emit('pluginTrustList');
}

export function setPluginTrusted(appname, value) {
  socket.emit('pluginTrust', { appname, trusted: value });
}
