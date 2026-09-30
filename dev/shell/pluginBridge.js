// The object half of the chat <-> plugin postMessage bridge: coins.
//
// A plugin's iframe (copecloud's /v page) posts { copecloud: <type>, id, ... }
// to the chat page. It is the least trusted thing on the page, so everything
// about a payment that matters is decided here, not taken from the message:
//
//  - which plugin is asking is the one the chat itself has open in that iframe
//    (the message's own idea of its name is ignored),
//  - who pays is whoever is logged in on the chat's socket,
//  - and the user confirms in the chat's own dialog unless they chose to fully
//    trust that plugin — which the server checks again (see pluginPay in
//    handleConnection.js).
//
// The string messages ('requestnick' / 'requesttrust') predate this and are
// still answered in App.jsx.

export const MAX_AMOUNT = 1_000_000;
const MAX_MEMO = 200;

// A well-formed request from a plugin, or null for anything else (strings,
// other windows' traffic, junk). `id` is the plugin's own correlation id and
// is only ever echoed back.
export function parsePluginRequest(data) {
  if (!data || typeof data !== 'object' || typeof data.copecloud !== 'string') return null;
  const id = typeof data.id === 'string' || typeof data.id === 'number' ? data.id : null;

  if (data.copecloud === 'requestCoins') return { type: 'requestCoins', id };
  if (data.copecloud === 'requestIdentity') return { type: 'requestIdentity', id };

  if (data.copecloud === 'requestPayment') {
    const amount = data.amount;
    if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) {
      return { type: 'invalid', id, error: `Amount must be a whole number from 1 to ${MAX_AMOUNT}.` };
    }
    const memo = typeof data.memo === 'string' ? data.memo.slice(0, MAX_MEMO) : '';
    return { type: 'requestPayment', id, amount, memo };
  }

  return null;
}

// The origin replies are addressed to, so a plugin iframe that navigated away
// from copecloud never receives them.
export function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return '*';
  }
}
