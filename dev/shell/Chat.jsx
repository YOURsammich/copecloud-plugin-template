import { useState, useRef, useEffect } from 'react';

import UploadButton from './UploadButton';

// The chat itself, cut down to what a plugin author needs around their panel:
// messages, an input, and who is here. Commands are handled by the dev server
// (/help lists them).
function Chat({ socket, userlist, user, connected }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    socket.on('history', (entries) => setMessages(entries));
    socket.on('message', (entry) => setMessages(prev => [...prev, entry].slice(-200)));
  }, []);

  // stay pinned to the newest message
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  function submit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    socket.emit('message', text);
    setText('');
  }

  return (
    <div className='chat'>
      <div className='chatMain'>
        <div className='chatHeader'>
          <span className='chatChannel'>#main</span>
          <div className='chatHeaderRight'>
            <span className={'chatStatus' + (connected ? '' : ' chatStatusOff')}>
              {connected ? 'dev chatroom' : 'reconnecting…'}
            </span>
            <UploadButton />
          </div>
        </div>

        <div className='chatMessages' ref={listRef}>
          {messages.length === 0 ? (
            <div className='chatEmpty'>No messages yet. Type /help for dev commands.</div>
          ) : messages.map((entry, i) => (
            <div key={i} className={'message' + (entry.system ? ' messageSystem' : '')}>
              {entry.system ? null : <span className='messageNick'>{entry.nick}</span>}
              <span className='messageText'>{entry.message}</span>
            </div>
          ))}
        </div>

        <form className='chatInput' onSubmit={submit}>
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={user ? `Message as ${user.nick}` : 'Connecting…'}
            aria-label='Message'
            autoFocus
          />
        </form>
      </div>

      <div className='chatUsers'>
        <div className='chatUsersTitle'>{userlist.length} here</div>
        {userlist.map(u => (
          <div key={u.id} className={'chatUser' + (u.id === user?.id ? ' chatUserMe' : '')}>
            <span>{u.nick}</span>
            <span className='chatUserTrust' title='trust'>{u.trust}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Chat;
