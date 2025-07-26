// Client‑side script for chat functionality

let socket;
let currentUserId;
let currentUserRole;

function initChat() {
  const container = document.getElementById('room-container');
  if (!container) return;
  const roomId = container.dataset.roomId;
  currentUserId = parseInt(container.dataset.userId, 10);
  currentUserRole = container.dataset.role;
  const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/${roomId}`?user_id=${currentUserId};
  socket = new WebSocket(wsUrl);

  socket.addEventListener('open', () => {
    console.log('Connected to WebSocket');
  });

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

  // Hide context menu on global click
  document.addEventListener('click', () => {
    hideContextMenu();
.  });

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
      alert(`You have been kicked from the room. ${data.reason || ''}`);
      window.location.href = '/rooms';
      break;
    case 'warn':
      alert(`Warning: ${data.reason}`);
      break;
    case 'error':
      alert(data.message);
      break;
    default:
      console.log('Unhandled message', data);
  }
}

function addChatMessage({ username, message, timestamp }) {
  const messages = document.getElementById('chat-messages');
  const msgDiv = document.createElement('div');
  msgDiv.classList.add('message');
  const senderSpan = document.createElement('span');
  senderSpan.classList.add('sender');
  senderSpan.textContent = username;
  const textSpan = document.createElement('span');
  textSpan.classList.add('text');
  textSpan.textContent = `: ${message}`;
  const timeSpan = document.createElement('span');
  timeSpan.classList.add('timestamp');
  timeSpan.textContent = formatTimestamp(timestamp);
  msgDiv.appendChild(senderSpan);
  msgDiv.appendChild(textSpan);
  msgDiv.appendChild(timeSpan);
  messages.appendChild(msgDiv);
  messages.scrollTop = messages.scrollHeight;
}

function addImageMessage({ username, url, timestamp }) {
  const messages = document.getElementById('chat-messages');
  const msgDiv = document.createElement('div');
  msgDiv.classList.add('message');
  const senderSpan = document.createElement('span');
  senderSpan.classList.add('sender');
  senderSpan.textContent = username;
  const textSpan = document.createElement('span');
  textSpan.classList.add('text');
  textSpan.textContent = ' sent an image:';
  const timeSpan = document.createElement('span');
  timeSpan.classList.add('timestamp');
  timeSpan.textContent = formatTimestamp(timestamp);
  const img = document.createElement('img');
  img.src = url;
  img.onload = () => {
    messages.scrollTop = messages.scrollHeight;
  };
  msgDiv.appendChild(senderSpan);
  msgDiv.appendChild(textSpan);
  msgDiv.appendChild(timeSpan);
  msgDiv.appendChild(document.createElement('br'));
  msgDiv.appendChild(img);
  messages.appendChild(msgDiv);
  messages.scrollTop = messages.scrollHeight;
}

function updateUserList(users) {
  const list = document.getElementById('user-list');
  list.innerHTML = '';
  users.forEach(u => {
    const li = document.createElement('li');
    li.textContent = `${u.username}` + (u.role !== 'user' ? ` [${u.role}]` : '');
    li.dataset.userId = u.user_id;
    li.dataset.role = u.role;
    // Right click handler
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, u);
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
  fetch('/upload', {
    method: 'POST',
    body: formData
  }).then(res => {
    if (!res.ok) throw new Error('Upload failed');
    return res.text();
  }).then(url => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'image_message', url }));
    }
  }).catch(err => {
    alert('Failed to upload image: ' + err.message);
  }).finally(() => {
    input.value = '';
  });
}

function showContextMenu(x, y, targetUser) {
  // Hide if clicking on yourself
  if (targetUser.user_id === currentUserId) return;
  const menu = document.getElementById('context-menu');
  menu.innerHTML = '';
  menu.style.display = 'block';
  menu.style.top = y + 'px';
  menu.style.left = x + 'px';
  // Determine actions based on role
  const actions = [];
  // Everyone with moderation privileges can warn or kick
  if (['sysop', 'owner', 'host'].includes(currentUserRole)) {
    actions.push({ label: 'Kick', command: 'kick' });
    actions.push({ label: 'Warn', command: 'warn' });
  }
  // Only owners and sysops can assign hosts/owners
  if (['sysop', 'owner'].includes(currentUserRole)) {
    actions.push({ label: 'Make Host', command: 'assign_host' });
    actions.push({ label: 'Make Owner', command: 'assign_owner' });
  }
  actions.forEach(act => {
    const li = document.createElement('li');
    li.textContent = act.label;
    li.addEventListener('click', () => {
      hideContextMenu();
      const reason = act.command === 'kick' || act.command === 'warn' ? prompt('Reason (optional):', '') : '';
      sendCommand(act.command, targetUser.user_id, reason);
    });
    menu.appendChild(li);
  });
}

function hideContextMenu() {
  const menu = document.getElementById('context-menu');
  if (menu) {
    menu.style.display = 'none';
  }
}

function sendCommand(command, targetId, reason) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'command', command, target_id: targetId, reason }));
  }
}

function formatTimestamp(ts) {
  // Format ISO timestamp into HH:MM
  try {
    const date = new Date(ts);
    return `(${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')})`;
  } catch (e) {
    return '';
  }
}
