import { useState, useEffect, useRef, useCallback, FormEvent, ChangeEvent } from 'react';
import { io, Socket } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || '';

// Types
interface User {
  id: string;
  username: string;
  email?: string;
  full_name?: string;
  role: 'admin' | 'user';
  is_banned?: boolean;
  is_globally_muted?: boolean;
}

interface Room {
  id: string;
  name: string;
  type: 'public' | 'private' | 'dm';
  topic: string;
  is_locked: boolean;
  user_count?: number;
}

interface Reaction {
  emoji: string;
  count: number;
  users: string[];
}

interface Message {
  id: string;
  room_id: string;
  user_id: string;
  username?: string;
  text: string;
  type: 'user' | 'system' | 'bot';
  is_deleted: boolean;
  is_edited: boolean;
  attachment_url?: string | null;
  attachment_type?: string | null;
  created_at: string;
  reactions?: Reaction[];
}

interface OnlineUser {
  id: string;
  username: string;
  status: 'online' | 'away' | 'dnd';
  currentRoom?: string;
  isTyping?: boolean;
}

// API functions
const api = {
  async register(data: { username: string; email: string; password: string; full_name?: string }) {
    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Registration failed');
    }
    return res.json();
  },

  async login(data: { username: string; password: string }) {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Login failed');
    }
    return res.json();
  },

  async getMe(token: string) {
    const res = await fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Not authenticated');
    return res.json();
  },

  async getRooms(token: string) {
    const res = await fetch(`${API_URL}/api/rooms`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },

  async createRoom(token: string, data: { name: string; topic?: string }) {
    const res = await fetch(`${API_URL}/api/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create room');
    }
    return res.json();
  },

  async uploadFile(token: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    
    const res = await fetch(`${API_URL}/api/uploads`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Upload failed');
    }
    return res.json();
  },
};

// Auth Component
function Auth({ onAuth }: { onAuth: (token: string, user: User) => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = isLogin
        ? await api.login({ username, password })
        : await api.register({ username, email, password, full_name: fullName });

      localStorage.setItem('token', result.token);
      onAuth(result.token, result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
      <div className="w-full max-w-md bg-gray-800 rounded-lg shadow-xl p-8">
        <h1 className="text-3xl font-bold text-center mb-2 bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
          Chat App
        </h1>
        <p className="text-gray-400 text-center mb-6">
          {isLogin ? 'Welcome back!' : 'Create your account'}
        </p>

        <div className="flex mb-6 bg-gray-700 rounded-lg p-1">
          <button
            onClick={() => setIsLogin(true)}
            className={`flex-1 py-2 rounded-md transition ${isLogin ? 'bg-blue-600 text-white' : 'text-gray-400'}`}
          >
            Login
          </button>
          <button
            onClick={() => setIsLogin(false)}
            className={`flex-1 py-2 rounded-md transition ${!isLogin ? 'bg-blue-600 text-white' : 'text-gray-400'}`}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <input
              type="text"
              placeholder="Full Name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full p-3 bg-gray-700 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
            />
          )}
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full p-3 bg-gray-700 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
            required
          />
          {!isLogin && (
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 bg-gray-700 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
              required
            />
          )}
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-3 bg-gray-700 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
            required
          />

          {error && <p className="text-red-500 text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {loading ? 'Loading...' : isLogin ? 'Login' : 'Register'}
          </button>
        </form>
      </div>
    </div>
  );
}

// Room List Component
function RoomList({
  rooms,
  currentRoom,
  onJoinRoom,
  onCreateRoom,
}: {
  rooms: Room[];
  currentRoom: Room | null;
  onJoinRoom: (room: Room) => void;
  onCreateRoom: (name: string) => void;
}) {
  const [newRoomName, setNewRoomName] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (newRoomName.trim()) {
      onCreateRoom(newRoomName.trim());
      setNewRoomName('');
      setShowCreate(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-800 border-r border-gray-700">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold">Rooms</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {rooms.map((room) => (
          <button
            key={room.id}
            onClick={() => onJoinRoom(room)}
            className={`w-full text-left p-3 rounded-lg mb-1 transition ${
              currentRoom?.id === room.id
                ? 'bg-blue-600 text-white'
                : 'hover:bg-gray-700'
            }`}
          >
            <div className="font-medium">#{room.name}</div>
            <div className="text-sm text-gray-400 truncate">{room.topic}</div>
          </button>
        ))}
      </div>
      <div className="p-2 border-t border-gray-700">
        {showCreate ? (
          <form onSubmit={handleCreate} className="space-y-2">
            <input
              type="text"
              placeholder="Room name"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              className="w-full p-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none text-sm"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 py-1 bg-blue-600 rounded text-sm hover:bg-blue-700"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="flex-1 py-1 bg-gray-700 rounded text-sm hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full py-2 bg-gray-700 rounded-lg text-sm hover:bg-gray-600"
          >
            + Create Room
          </button>
        )}
      </div>
    </div>
  );
}

// User List Component
function UserList({ users, currentUserId }: { users: OnlineUser[]; currentUserId: string }) {
  return (
    <div className="h-full flex flex-col bg-gray-800 border-l border-gray-700">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold">Online ({users.length})</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {users.map((user) => (
          <div
            key={user.id}
            className={`p-2 rounded-lg mb-1 flex items-center gap-2 ${
              user.id === currentUserId ? 'bg-gray-700' : ''
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                user.status === 'online'
                  ? 'bg-green-500'
                  : user.status === 'away'
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
              }`}
            />
            <span className="flex-1 truncate">
              {user.username}
              {user.id === currentUserId && ' (you)'}
            </span>
            {user.isTyping && (
              <span className="text-gray-400 text-sm animate-pulse">typing...</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Message Component
function MessageItem({
  message,
  currentUserId,
  onReaction,
  onDelete,
  onEdit,
}: {
  message: Message;
  currentUserId: string;
  onReaction: (emoji: string) => void;
  onDelete: () => void;
  onEdit: (text: string) => void;
}) {
  const [showReactions, setShowReactions] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.text);
  const isOwn = message.user_id === currentUserId;
  const emojis = ['👍', '❤️', '😂', '😮', '😢', '🎉'];

  const handleEdit = () => {
    if (editText.trim() && editText !== message.text) {
      onEdit(editText);
    }
    setEditing(false);
  };

  if (message.type === 'system') {
    return (
      <div className="text-center text-gray-500 text-sm py-2">{message.text}</div>
    );
  }

  return (
    <div
      className={`group p-3 rounded-lg mb-2 ${
        isOwn ? 'bg-blue-600/20 ml-8' : 'bg-gray-700 mr-8'
      } ${message.is_deleted ? 'opacity-50 italic' : ''}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="font-semibold text-sm">
          {message.username || 'Unknown'}
        </span>
        <span className="text-gray-500 text-xs">
          {new Date(message.created_at).toLocaleTimeString()}
        </span>
        {message.is_edited && (
          <span className="text-gray-500 text-xs">(edited)</span>
        )}
      </div>

      {editing ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="flex-1 p-2 bg-gray-600 rounded border-none focus:outline-none"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleEdit()}
          />
          <button onClick={handleEdit} className="px-3 py-1 bg-green-600 rounded text-sm">
            Save
          </button>
          <button onClick={() => setEditing(false)} className="px-3 py-1 bg-gray-600 rounded text-sm">
            Cancel
          </button>
        </div>
      ) : (
        <p className="break-words">{message.text}</p>
      )}

      {message.attachment_url && (
        <div className="mt-2">
          {message.attachment_type?.startsWith('image/') ? (
            <img
              src={message.attachment_url}
              alt="attachment"
              className="max-w-xs rounded-lg"
            />
          ) : (
            <a
              href={message.attachment_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 underline"
            >
              📎 Download attachment
            </a>
          )}
        </div>
      )}

      {message.reactions && message.reactions.length > 0 && (
        <div className="flex gap-1 mt-2 flex-wrap">
          {message.reactions.map((reaction) => (
            <button
              key={reaction.emoji}
              onClick={() => onReaction(reaction.emoji)}
              className={`px-2 py-1 rounded-full text-sm ${
                reaction.users.includes(currentUserId)
                  ? 'bg-blue-600'
                  : 'bg-gray-600 hover:bg-gray-500'
              }`}
            >
              {reaction.emoji} {reaction.count}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition">
        <button
          onClick={() => setShowReactions(!showReactions)}
          className="text-gray-400 hover:text-white text-sm"
        >
          😀
        </button>
        {isOwn && !message.is_deleted && (
          <>
            <button
              onClick={() => setEditing(true)}
              className="text-gray-400 hover:text-white text-sm"
            >
              ✏️
            </button>
            <button
              onClick={onDelete}
              className="text-gray-400 hover:text-red-500 text-sm"
            >
              🗑️
            </button>
          </>
        )}
      </div>

      {showReactions && (
        <div className="flex gap-1 mt-2">
          {emojis.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                onReaction(emoji);
                setShowReactions(false);
              }}
              className="p-1 hover:bg-gray-600 rounded"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Chat Component
function Chat({
  token,
  user,
  socket,
  currentRoom,
  messages,
  users,
  typingUsers,
  onSendMessage,
  onReaction,
  onDeleteMessage,
  onEditMessage,
  onTyping,
  onLeaveRoom,
  onUpload,
}: {
  token: string;
  user: User;
  socket: Socket | null;
  currentRoom: Room;
  messages: Message[];
  users: OnlineUser[];
  typingUsers: Array<{ userId: string; username: string }>;
  onSendMessage: (text: string, attachment?: { url: string; type: string }) => void;
  onReaction: (messageId: string, emoji: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onEditMessage: (messageId: string, text: string) => void;
  onTyping: (isTyping: boolean) => void;
  onLeaveRoom: () => void;
  onUpload: (file: File) => Promise<{ url: string; mime_type: string }>;
}) {
  const [input, setInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    
    onTyping(true);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      onTyping(false);
    }, 2000);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSendMessage(input.trim());
      setInput('');
      onTyping(false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const result = await onUpload(file);
      onSendMessage(`📎 ${file.name}`, { url: result.url, type: result.mime_type });
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const otherTyping = typingUsers.filter((t) => t.userId !== user.id);

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">#{currentRoom.name}</h2>
          <p className="text-sm text-gray-400">{currentRoom.topic}</p>
        </div>
        <button
          onClick={onLeaveRoom}
          className="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600"
        >
          Leave
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            currentUserId={user.id}
            onReaction={(emoji) => onReaction(message.id, emoji)}
            onDelete={() => onDeleteMessage(message.id)}
            onEdit={(text) => onEditMessage(message.id, text)}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing indicator */}
      {otherTyping.length > 0 && (
        <div className="px-4 py-1 text-gray-400 text-sm">
          {otherTyping.map((t) => t.username).join(', ')}{' '}
          {otherTyping.length === 1 ? 'is' : 'are'} typing...
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-700">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 disabled:opacity-50"
          >
            📎
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
          />
          <input
            type="text"
            value={input}
            onChange={handleInputChange}
            placeholder="Type a message..."
            className="flex-1 p-3 bg-gray-700 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="px-6 py-2 bg-blue-600 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

// Main App Component
export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<User | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [roomUsers, setRoomUsers] = useState<OnlineUser[]>([]);
  const [typingUsers, setTypingUsers] = useState<Array<{ userId: string; username: string }>>([]);
  const [loading, setLoading] = useState(true);

  // Check auth on mount
  useEffect(() => {
    const checkAuth = async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const userData = await api.getMe(token);
        setUser(userData);
        const roomsData = await api.getRooms(token);
        setRooms(roomsData);
      } catch {
        localStorage.removeItem('token');
        setToken(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [token]);

  // Setup socket connection
  useEffect(() => {
    if (!token || !user) return;

    const newSocket = io(API_URL || window.location.origin, {
      auth: { token },
    });

    newSocket.on('connect', () => {
      console.log('Connected to server');
    });

    newSocket.on('connect_error', (err) => {
      console.error('Connection error:', err.message);
      if (err.message.includes('banned')) {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
      }
    });

    newSocket.on('users:online', (users: OnlineUser[]) => {
      setOnlineUsers(users);
    });

    newSocket.on('user:joined', ({ userId, username }) => {
      setRoomUsers((prev) =>
        prev.some((u) => u.id === userId)
          ? prev
          : [...prev, { id: userId, username, status: 'online', isTyping: false }]
      );
    });

    newSocket.on('user:left', ({ userId }) => {
      setRoomUsers((prev) => prev.filter((u) => u.id !== userId));
    });

    newSocket.on('message:receive', (message: Message) => {
      setMessages((prev) => [...prev, message]);
    });

    newSocket.on('message:updated', (message: Message) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? message : m))
      );
    });

    newSocket.on('message:deleted', ({ messageId }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, is_deleted: true, text: '[Message deleted]' } : m
        )
      );
    });

    newSocket.on('typing:update', (users: Array<{ userId: string; username: string }>) => {
      setTypingUsers(users);
    });

    newSocket.on('message:read', ({ userId, username, messageId }) => {
      // Handle read receipts - could show indicators on messages
      console.log(`${username} read message ${messageId}`);
    });

    newSocket.on('reaction:update', ({ messageId, reactions }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions } : m))
      );
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [token, user]);

  const handleAuth = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    api.getRooms(newToken).then(setRooms);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    socket?.disconnect();
    setSocket(null);
  };

  const handleJoinRoom = useCallback(
    (room: Room) => {
      if (!socket) return;

      socket.emit('room:join', room.id, (data: {
        room?: Room;
        messages?: Message[];
        users?: OnlineUser[];
        error?: string;
      }) => {
        if (data.error) {
          console.error('Failed to join room:', data.error);
          return;
        }
        setCurrentRoom(room);
        setMessages(data.messages || []);
        setRoomUsers(data.users || []);
      });
    },
    [socket]
  );

  const handleLeaveRoom = useCallback(() => {
    if (!socket) return;
    socket.emit('room:leave');
    setCurrentRoom(null);
    setMessages([]);
    setRoomUsers([]);
    setTypingUsers([]);
  }, [socket]);

  const handleCreateRoom = useCallback(
    async (name: string) => {
      if (!token) return;
      try {
        const room = await api.createRoom(token, { name });
        setRooms((prev) => [...prev, room]);
        handleJoinRoom(room);
      } catch (err) {
        console.error('Failed to create room:', err);
      }
    },
    [token, handleJoinRoom]
  );

  const handleSendMessage = useCallback(
    (text: string, attachment?: { url: string; type: string }) => {
      if (!socket) return;
      socket.emit('message:send', {
        text,
        attachmentUrl: attachment?.url,
        attachmentType: attachment?.type,
      });
    },
    [socket]
  );

  const handleReaction = useCallback(
    (messageId: string, emoji: string) => {
      if (!socket || !user) return;
      
      const message = messages.find((m) => m.id === messageId);
      const hasReaction = message?.reactions?.some(
        (r) => r.emoji === emoji && r.users.includes(user.id)
      );
      
      if (hasReaction) {
        socket.emit('reaction:remove', { messageId, emoji });
      } else {
        socket.emit('reaction:add', { messageId, emoji });
      }
    },
    [socket, user, messages]
  );

  const handleDeleteMessage = useCallback(
    (messageId: string) => {
      if (!socket) return;
      socket.emit('message:delete', messageId);
    },
    [socket]
  );

  const handleEditMessage = useCallback(
    (messageId: string, text: string) => {
      if (!socket) return;
      socket.emit('message:edit', { messageId, text });
    },
    [socket]
  );

  const handleTyping = useCallback(
    (isTyping: boolean) => {
      if (!socket) return;
      socket.emit(isTyping ? 'typing:start' : 'typing:stop');
    },
    [socket]
  );

  const handleUpload = useCallback(
    async (file: File) => {
      if (!token) throw new Error('Not authenticated');
      return api.uploadFile(token, file);
    },
    [token]
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!token || !user) {
    return <Auth onAuth={handleAuth} />;
  }

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
          Chat App
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-gray-400">
            <span
              className={`inline-block w-2 h-2 rounded-full mr-2 ${
                socket?.connected ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            {user.username}
          </span>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Room list */}
        <div className="w-64">
          <RoomList
            rooms={rooms}
            currentRoom={currentRoom}
            onJoinRoom={handleJoinRoom}
            onCreateRoom={handleCreateRoom}
          />
        </div>

        {/* Chat area */}
        {currentRoom ? (
          <>
            <Chat
              token={token}
              user={user}
              socket={socket}
              currentRoom={currentRoom}
              messages={messages}
              users={roomUsers}
              typingUsers={typingUsers}
              onSendMessage={handleSendMessage}
              onReaction={handleReaction}
              onDeleteMessage={handleDeleteMessage}
              onEditMessage={handleEditMessage}
              onTyping={handleTyping}
              onLeaveRoom={handleLeaveRoom}
              onUpload={handleUpload}
            />
            {/* User list */}
            <div className="w-56">
              <UserList users={roomUsers} currentUserId={user.id} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-400">
              <p className="text-2xl mb-2">👋 Welcome!</p>
              <p>Select a room to start chatting</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
