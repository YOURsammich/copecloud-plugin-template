//Stands in for the chatroom's copecoin wallets (eyechat-server:
//src/pluginWallet.js) so a plugin can take and pay coins locally. In memory:
//every run starts fresh.
//
//Same rules as production:
//  - a user pays a plugin only from the chat page, and only a plugin they gave
//    wallet access when they opened it (no prompt per payment);
//  - the plugin's server redeems the receipt once, with tools.wallet.claim;
//  - accepting payments is on by default, paying out is off until granted.
//    Here you grant it yourself: /pluginperm payout on
//  - a plugin can pay another plugin (yours and the stand-ins in dev-plugins/
//    each have a wallet) without payout; the one paid claims or refunds the
//    receipt like a user's payment. Fund a stand-in with /pluginfund.
//
//Every dev user starts with STARTING_COINS so there is something to spend.

const STARTING_COINS = 1000;
const MAX_AMOUNT = 1000000;
const MAX_MEMO = 200;

const balances = new Map();   //nick (lowercase) -> coins
const plugins = new Map();    //appname -> { coins, accept, payout }
const receipts = new Map();   //id -> { appname, nick, fromApp, amount, memo, time, claimed, direction }
const trusted = new Map();    //nick (lowercase) -> Set of appnames
let nextReceipt = 1;

function key (nick) {
  return String(nick).toLowerCase();
}

function balance (nick) {
  if (!balances.has(key(nick))) balances.set(key(nick), STARTING_COINS);
  return balances.get(key(nick));
}

function setBalance (nick, coins) {
  balances.set(key(nick), coins);
}

function plugin (appname) {
  if (!plugins.has(appname)) plugins.set(appname, { coins: 0, accept: true, payout: false });
  return plugins.get(appname);
}

function readAmount (amount) {
  return Number.isInteger(amount) && amount > 0 && amount <= MAX_AMOUNT ? amount : null;
}

function readMemo (memo) {
  return typeof memo === 'string' && memo ? memo.slice(0, MAX_MEMO) : null;
}

function wallet (appname) {
  const p = plugin(appname);
  return { appname, coins: p.coins, accept: p.accept, payout: p.payout };
}

function payIn (nick, appname, amount, memo) {
  const n = readAmount(amount);
  if (n === null) return { ok: false, error: `Amount must be a whole number from 1 to ${MAX_AMOUNT}.` };
  const p = plugin(appname);
  if (!p.accept) return { ok: false, error: `${appname} is not allowed to take payments.` };
  if (balance(nick) < n) return { ok: false, error: `Not enough coins. You have ₵${balance(nick)}.` };

  setBalance(nick, balance(nick) - n);
  p.coins += n;
  const receipt = String(nextReceipt++);
  receipts.set(receipt, { appname, nick, fromApp: null, amount: n, memo: readMemo(memo), time: new Date(), claimed: false, direction: 'in' });
  return { ok: true, receipt, coins: balance(nick) };
}

//users: the connected chat users, since there are no accounts here — a nick
//that isn't in the room has "no account".
function payOut (appname, nick, amount, memo, users) {
  const n = readAmount(amount);
  if (n === null) return { ok: false, error: `Amount must be a whole number from 1 to ${MAX_AMOUNT}.` };
  const p = plugin(appname);
  if (!p.payout) return { ok: false, error: 'This plugin is not allowed to pay out. Ask an admin. (Here: /pluginperm payout on)' };
  if (p.coins < n) return { ok: false, error: `The plugin wallet only has ₵${p.coins}.` };
  const user = users.find(u => key(u.nick) === key(nick));
  if (!user) return { ok: false, error: `${nick} has no account.` };

  p.coins -= n;
  setBalance(user.nick, balance(user.nick) + n);
  const receipt = String(nextReceipt++);
  receipts.set(receipt, { appname, nick: user.nick, amount: n, memo: readMemo(memo), time: new Date(), claimed: true, direction: 'out' });
  return { ok: true, receipt, nick: user.nick, coins: p.coins };
}

//Plugin -> plugin. Whether `to` exists is runtime.js's check, as copecloud
//makes it before asking the chatroom.
function sendToPlugin (appname, to, amount, memo) {
  if (to === appname) return { ok: false, error: 'A plugin can\'t pay itself.' };
  const n = readAmount(amount);
  if (n === null) return { ok: false, error: `Amount must be a whole number from 1 to ${MAX_AMOUNT}.` };
  const from = plugin(appname);
  const dest = plugin(to);
  if (!dest.accept) return { ok: false, error: `${to} is not allowed to take payments.` };
  if (from.coins < n) return { ok: false, error: `The plugin wallet only has ₵${from.coins}.` };

  from.coins -= n;
  dest.coins += n;
  const receipt = String(nextReceipt++);
  receipts.set(receipt, { appname: to, nick: null, fromApp: appname, amount: n, memo: readMemo(memo), time: new Date(), claimed: false, direction: 'app' });
  return { ok: true, receipt, app: to, amount: n, coins: from.coins };
}

//A payment into this plugin, from a user (nick) or a plugin (fromApp).
function claim (appname, receipt) {
  const r = receipts.get(String(receipt));
  if (!r || r.appname !== appname || r.claimed || !['in', 'app'].includes(r.direction)) {
    return { ok: false, error: 'No such receipt, or it was already claimed.' };
  }
  r.claimed = true;
  return { ok: true, nick: r.nick, fromApp: r.fromApp, amount: r.amount, memo: r.memo, time: r.time };
}

//Back to whoever paid it, user or plugin, once, claimed or not. No payout
//permission needed.
function refund (appname, receipt) {
  const r = receipts.get(String(receipt));
  if (!r || r.appname !== appname || !['in', 'app'].includes(r.direction)) return { ok: false, error: 'No such receipt.' };
  if (r.refunded) return { ok: false, error: 'That payment was already refunded.' };
  const p = plugin(appname);
  if (p.coins < r.amount) return { ok: false, error: `The plugin wallet only has ₵${p.coins}.` };

  p.coins -= r.amount;
  if (r.fromApp) plugin(r.fromApp).coins += r.amount;
  else setBalance(r.nick, balance(r.nick) + r.amount);
  r.refunded = true;
  r.claimed = true;
  const id = String(nextReceipt++);
  if (r.fromApp) {
    receipts.set(id, { appname: r.fromApp, nick: null, fromApp: appname, amount: r.amount, memo: 'refund of #' + receipt, time: new Date(), claimed: true, direction: 'app-refund' });
  } else {
    receipts.set(id, { appname, nick: r.nick, fromApp: null, amount: r.amount, memo: 'refund of #' + receipt, time: new Date(), claimed: true, direction: 'out' });
  }
  return { ok: true, receipt: id, nick: r.nick, fromApp: r.fromApp, amount: r.amount, coins: p.coins };
}

//The admin wallets panel's funding, for /pluginfund: '+500', '-200' or '750'.
function fund (appname, change) {
  const m = /^([+-])?(\d{1,10})$/.exec(String(change || '').trim());
  if (!m) return null;
  const p = plugin(appname);
  const n = Number(m[2]);
  const coins = m[1] === '+' ? p.coins + n : m[1] === '-' ? p.coins - n : n;
  if (coins < 0) return null;
  p.coins = coins;
  return wallet(appname);
}

function setPermission (appname, perm, allowed) {
  plugin(appname)[perm] = allowed;
  return wallet(appname);
}

function trustedPlugins (nick) {
  return [...(trusted.get(key(nick)) || [])].sort();
}

function setTrusted (nick, appname, value) {
  if (!trusted.has(key(nick))) trusted.set(key(nick), new Set());
  if (value) trusted.get(key(nick)).add(appname);
  else trusted.get(key(nick)).delete(appname);
}

module.exports = {
  balance,
  setBalance,
  wallet,
  payIn,
  payOut,
  sendToPlugin,
  claim,
  fund,
  refund,
  setPermission,
  trustedPlugins,
  setTrusted
};
