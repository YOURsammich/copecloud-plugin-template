// The chat's websocket. Same {eventName, data} framing as the real chatroom and
// copecloud, reconnecting if the dev server restarts.

const handlers = {};
let ws = null;
let queue = [];

function connect() {
  const prefix = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(prefix + '://' + location.host + '/chat');

  ws.onopen = () => {
    queue.forEach(message => ws.send(message));
    queue = [];
    trigger('open');
  };

  ws.onmessage = (e) => {
    const { eventName, data } = JSON.parse(e.data);
    trigger(eventName, data);
  };

  ws.onclose = () => {
    trigger('close');
    setTimeout(connect, 1000);
  };
}

function trigger(eventName, data) {
  (handlers[eventName] || []).forEach(callback => callback(data));
}

const socket = {
  init: connect,
  on(eventName, callback) {
    if (!handlers[eventName]) handlers[eventName] = [];
    handlers[eventName].push(callback);
  },
  emit(eventName, data) {
    const message = JSON.stringify({ eventName, data });
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(message);
    else queue.push(message);
  },
};

export default socket;
