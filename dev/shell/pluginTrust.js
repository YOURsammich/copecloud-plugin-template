import { useSyncExternalStore } from 'react';
import socket from './socket';

// The plugins this account has given wallet access: agreed to on the consent
// screen when they first opened it, after which the plugin can take coins with
// no prompt. The server holds the list (plugin_user_trust) and sends it as
// `pluginTrustList` whenever it's asked for or changes; this module keeps the
// latest copy so App, the plugin header and Settings all read the same one.
//
// `loaded` stays false until the first list arrives, so the consent screen is
// never shown to someone who has in fact already agreed.

let state = { list: [], loaded: false };
const listeners = new Set();

socket.on('pluginTrustList', (list) => {
  state = { list: Array.isArray(list) ? list : [], loaded: true };
  listeners.forEach((fn) => fn());
});

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isTrusted(appname) {
  return state.list.includes(appname);
}

export function useTrustedPlugins() {
  return useSyncExternalStore(subscribe, () => state.list);
}

export function useTrustLoaded() {
  return useSyncExternalStore(subscribe, () => state.loaded);
}

export function requestTrustList() {
  socket.emit('pluginTrustList');
}

export function setPluginTrusted(appname, value) {
  socket.emit('pluginTrust', { appname, trusted: value });
}

// What a plugin record from copecloud asks of its players.
export function wantsWallet(plugin) {
  return Array.isArray(plugin?.permissions) && plugin.permissions.includes('wallet');
}
