//ping -> pong. The pong goes back to whoever pinged, carrying their own
//timestamp so the client can work out the round trip. Everyone else just
//hears that a ping happened, plus the running total.

let totalPings = 0;

tools.on('ping', (user, data) => {
  totalPings++;

  tools.privateEmit(user.nick, 'pong', {
    sentAt: data && data.sentAt,
    serverTime: Date.now()
  });

  tools.roomEmit('pinged', {
    nick: user.nick,
    totalPings
  });
});

tools.on('getstats', (user) => {
  tools.privateEmit(user.nick, 'stats', { totalPings });
});
