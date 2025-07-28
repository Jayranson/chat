// Client-side chat script

let socket;
let currentUserId;
let currentUserRole;

function initChat() {
  const container = document.getElementById('room-container');
  if (!container) return;

  currentUserId = parseInt(container.dataset.userId, 10);
  currentUserRole = container.dataset.role;
  const roomId = container.dataset.roomId;

  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = `${protocol}://${location.host}/ws/${roomId}?user_id=${currentUserId}`;

  console.log('Connecting to:', wsUrl);

  socket = new WebSocket(wsUrl);

  socket.addEventListener('open', () => console.log('WebSocket connection established'));

  socket.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    handleSocketMessage(data);
  });

  socket.addEventListener('close', (event) => {
    if (event.wasClean) {
      console.log('WebSocket closed cleanly');
    } else {
      alert('Disconnected from server');
    }
  });

  socket.addEventListener('error', (event) => {
    console.error('WebSocket error:', event);
  });

  document.addEventListener('click', hideContextMenu);
}

function handleSocketMessage(data) {
  switch (data.type) {
    case 'user_joined':
    case 'user_left':
    case 'role_update':
      updateUserList(data.users);
      break;
    case 'chat_message':
      addChatMessage(data);
      break;
    case 'image_message':
      addImageMessage(data);
      break;
    case 'kicked':
      alert(`You have been kicked. ${data.reason || ''}`);
      window.location.href = '/rooms';
      break;
    case 'warn':
      alert(`Warning: ${data.reason}`);
      break;
    case 'error':
      alert(data.message);
      break;
    default:
      console.warn('Unhandled socket message:', data);
  }
}

function addChatMessage({ username, message, timestamp }) {
  const container = document.getElementById('chat-messages');
  const msg = document.createElement('div');
  msg.className = 'message';

  const sender = document.createElement('span');
  sender.className = 'sender';
  sender.textContent = username;

  const text = document.createElement('span');
  text.className = 'text';
  text.textContent = `: ${message}`;

  const time = document.createElement('span');
  time.className = 'timestamp';
  time.textContent = formatTimestamp(timestamp);

  msg.append(sender, text, time);
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function addImageMessage({ username, url, timestamp }) {
  const container = document.getElementById('chat-messages');
  const msg = document.createElement('div');
  msg.className = 'message';

  const sender = document.createElement('span');
  sender.className = 'sender';
  sender.textContent = username;

  const text = document.createElement('span');
  text.className = 'text';
  text.textContent = ' sent an image:';

  const time = document.createElement('span');
  time.className = 'timestamp';
  time.textContent = formatTimestamp(timestamp);

  const image = document.createElement('img');
  image.src = url;
  image.onload = () => {
    container.scrollTop = container.scrollHeight;
  };

  msg.append(sender, text, time, document.createElement('br'), image);
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function updateUserList(users) {
  const list = document.getElementById('user-list');
  list.innerHTML = '';
  users.forEach(user => {
    const li = document.createElement('li');
    li.textContent = `${user.username}${user.role !== 'user' ? ` [${user.role}]` : ''}`;
    li.dataset.userId = user.user_id;
    li.dataset.role = user.role;

    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, user);
    });

    list.appendChild(li);
  });
}

function sendMessage(event) {
  event.preventDefault();
  const input = document.getElementById('message-input');
  const message = input.value.trim();
  if (!message) return false;

  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'chat_message', message }));
  }
  input.value = '';
  return false;
}

function uploadImage(input) {
  const file = input.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  fetch('/upload', { method: 'POST', body: formData })
    .then(res => res.ok ? res.text() : Promise.reject('Upload failed'))
    .then(url => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'image_message', url }));
      }
    })
    .catch(err => alert(`Image upload failed: ${err}`))
    .finally(() => input.value = '');
}

function showContextMenu(x, y, user) {
  if (user.user_id === currentUserId) return;

  const menu = document.getElementById('context-menu');
  menu.innerHTML = '';
  menu.style.display = 'block';
  menu.style.top = `${y}px`;
  menu.style.left = `${x}px`;

  const actions = [];
  if (['sysop', 'owner', 'host'].includes(currentUserRole)) {
    actions.push({ label: 'Kick', command: 'kick' });
    actions.push({ label: 'Warn', command: 'warn' });
  }
  if (['sysop', 'owner'].includes(currentUserRole)) {
    actions.push({ label: 'Make Host', command: 'assign_host' });
    actions.push({ label: 'Make Owner', command: 'assign_owner' });
  }

  actions.forEach(({ label, command }) => {
    const li = document.createElement('li');
    li.textContent = label;
    li.addEventListener('click', () => {
      hideContextMenu();
      const reason = ['kick', 'warn'].includes(command) ? prompt('Reason (optional):') : '';
      sendCommand(command, user.user_id, reason);
    });
    menu.appendChild(li);
  });
}

function hideContextMenu() {
  const menu = document.getElementById('context-menu');
  if (menu) menu.style.display = 'none';
}

function sendCommand(command, targetId, reason) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'command', command, target_id: targetId, reason }));
  }
}

function formatTimestamp(ts) {
  try {
    const date = new Date(ts);
    return `(${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')})`;
  } catch {
    return '';
  }
}
