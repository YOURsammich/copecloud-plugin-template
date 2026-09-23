//The client-side `tools` a plugin gets, copied from copecloud's
//modules/plugin_runner.js (pluginClientTools). The only change is the socket
//URL. Keep it otherwise identical so the plugin sees exactly what it will get
//in production, quirks included.

const pluginClientTools = {
  getTools (appName) {
    const tools = {
      appName: appName,
      _serverEvents: {
        [appName]: {}
      },
      _initWebSocket () {

        const wssprefix = location.protocol === 'https:' ? 'wss' : 'ws';

        //copecloud connects to its own :8080; here the plugin host is wherever
        //this page was served from
        const ws = this.ws = new WebSocket(wssprefix + '://' + location.host);

        ws.onopen = function () {
          console.log('WebSocket Client Connected');
        };

        //the /v page shows a disconnected notice on this
        ws.onclose = function () {
          window.dispatchEvent(new Event('pluginSocketClosed'));
        };

        ws.onmessage = (e) => {
          const message = JSON.parse(e.data);
          if (message.eventName === 'pluginEvent') {
            const { eventName, data } = message.data;

            const events = tools._serverEvents[this.appName][eventName];

            if (events) {
              for (let callback of events) {
                callback(data);
              }
            }
          } else if (message.eventName === 'userData') {
            tools._user = message.data;
            console.log('user data received', tools._user);

            const event = new Event('userDataReady');
            window.dispatchEvent(event);

          }

        }

      },

      getNick () {
        return new Promise((resolve, reject) => {
          window.top.postMessage('requestnick', '*')
   
          window.onmessage = function(e) {
            const eventName = e.data.slice(0,4);
        
            if (eventName == 'nick') {
              resolve(
                e.data.split(' ')[1]
              )
            }
          };
        });

      },
      getTrust () {
        return new Promise((resolve, reject) => {
          window.top.postMessage('requesttrust', '*')
   
          window.onmessage = function(e) {
            if (typeof e.data != 'string') return;

            const eventName = e.data.slice(0,5);
        
            if (eventName == 'trust') {
              resolve(
                e.data.split(' ')[1]
              )
            }
          };
        });
      },
      emit (eventName, data) {
        const pluginEventData = {eventName,data, appname: this.appName};
        this.ws.send(JSON.stringify({ eventName: 'pluginEvent', data: pluginEventData }));
      },
      on (eventName, callback) {
        console.log('ON', eventName);
        if (!tools._serverEvents[this.appName][eventName]) tools._serverEvents[this.appName][eventName] = [];
        tools._serverEvents[this.appName][eventName].push(callback);
      },
      get (key) {
        return this._user[key];
      },
    };

    return tools;
  },
  getToolsString (appName) {
    const tools = this.getTools(appName);

    let toolsString = 'tools = {';
    toolsString += Object.keys(tools).map(key => {
      if (typeof tools[key] === 'function') {

        return tools[key].toString();
      } else {
        return key + ':' + JSON.stringify(tools[key]);
      }
    }).join(',');

    toolsString += '};'

    return toolsString;

  }
};

module.exports = pluginClientTools;
