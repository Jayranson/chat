import { useState, useEffect, useRef, FormEvent, ChangeEvent } from 'react';
import { Socket } from 'socket.io-client';
import { User, Room, Message, OnlineUser } from '../types';
import { getRoomMessages, uploadFile } from '../api';

interface ChatRoomProps {
  user: User;
  socket: Socket;
  room: Room;
  onLeave: () => void;
}

function ChatRoom({ user, socket, room, onLeave }: ChatRoomProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [users, setUsers] = useState<OnlineUser[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const emojis = ['👍', '❤️', '😂', '😮', '😢', '👏', '🔥', '🎉'];

  useEffect(() => {
    // Load initial messages
    getRoomMessages(room.id).then(({ messages: msgs }) => {
      setMessages(msgs);
    });

    // Join room via socket
    socket.emit('room.join', room.id);

    // Socket event listeners
    socket.on('room.joined', (data: { users: OnlineUser[] }) => {
      setUsers(data.users);
    });

    socket.on('room.users', (data: { users: OnlineUser[] }) => {
      setUsers(data.users);
    });

    socket.on('message.receive', (message: Message) => {
      setMessages((prev) => [...prev, message]);
    });

    socket.on('user.joined', (data: { username: string }) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `system-${Date.now()}`,
          content: `${data.username} joined the room`,
          type: 'system',
          userId: '',
          roomId: room.id,
          createdAt: new Date().toISOString(),
          isDeleted: false,
          isEdited: false,
          user: { id: '', username: 'System', role: 'system' },
          reactions: [],
        },
      ]);
    });

    socket.on('user.left', (data: { username: string }) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `system-${Date.now()}`,
          content: `${data.username} left the room`,
          type: 'system',
          userId: '',
          roomId: room.id,
          createdAt: new Date().toISOString(),
          isDeleted: false,
          isEdited: false,
          user: { id: '', username: 'System', role: 'system' },
          reactions: [],
        },
      ]);
    });

    socket.on('typing.start', (data: { username: string }) => {
      setTypingUsers((prev) => [...new Set([...prev, data.username])]);
    });

    socket.on('typing.stop', (data: { username: string }) => {
      setTypingUsers((prev) => prev.filter((u) => u !== data.username));
    });

    socket.on('reaction.add', (data: { messageId: string; reaction: { emoji: string; userId: string } }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === data.messageId
            ? { ...msg, reactions: [...msg.reactions, data.reaction as Message['reactions'][0]] }
            : msg
        )
      );
    });

    socket.on('reaction.remove', (data: { messageId: string; userId: string; emoji: string }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === data.messageId
            ? {
                ...msg,
                reactions: msg.reactions.filter(
                  (r) => !(r.userId === data.userId && r.emoji === data.emoji)
                ),
              }
            : msg
        )
      );
    });

    socket.on('message.read', (data: { userId: string; messageIds: string[] }) => {
      console.log('Messages read by', data.userId, data.messageIds);
    });

    return () => {
      socket.emit('room.leave');
      socket.off('room.joined');
      socket.off('room.users');
      socket.off('message.receive');
      socket.off('user.joined');
      socket.off('user.left');
      socket.off('typing.start');
      socket.off('typing.stop');
      socket.off('reaction.add');
      socket.off('reaction.remove');
      socket.off('message.read');
    };
  }, [socket, room.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = (e: FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    socket.emit('message.send', {
      roomId: room.id,
      content: newMessage.trim(),
    });

    setNewMessage('');
    socket.emit('typing.stop', room.id);
  };

  const handleTyping = () => {
    socket.emit('typing.start', room.id);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing.stop', room.id);
    }, 2000);
  };

  const handleReaction = (messageId: string, emoji: string) => {
    socket.emit('reaction.add', { messageId, emoji, roomId: room.id });
    setShowEmojiPicker(null);
  };

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await uploadFile(file);
      socket.emit('message.send', {
        roomId: room.id,
        content: `[Image: ${result.path}]`,
      });
    } catch (error) {
      console.error('Upload failed:', error);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="chat-room">
      <header className="chat-header">
        <div className="chat-header-info">
          <h1 className="room-title">#{room.name}</h1>
          <span className="room-topic-small">{room.topic || 'No topic'}</span>
        </div>
        <button className="btn btn-secondary" onClick={onLeave}>
          Leave Room
        </button>
      </header>

      <div className="chat-main">
        <div className="chat-content">
          <div className="messages-container">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`message ${message.type === 'system' ? 'system' : ''} ${
                  message.userId === user.id ? 'own' : ''
                }`}
              >
                {message.type !== 'system' && (
                  <div className="message-header">
                    <span className="message-author">{message.user.username}</span>
                    <span className="message-time">{formatTime(message.createdAt)}</span>
                  </div>
                )}
                <div className="message-content">{message.content}</div>
                {message.type !== 'system' && (
                  <div className="message-reactions">
                    {message.reactions.map((reaction, idx) => (
                      <button
                        key={`${reaction.emoji}-${idx}`}
                        className={`reaction-btn ${reaction.userId === user.id ? 'active' : ''}`}
                        onClick={() => handleReaction(message.id, reaction.emoji)}
                      >
                        {reaction.emoji}
                      </button>
                    ))}
                    <button
                      className="reaction-btn"
                      onClick={() => setShowEmojiPicker(showEmojiPicker === message.id ? null : message.id)}
                    >
                      +
                    </button>
                    {showEmojiPicker === message.id && (
                      <div className="emoji-picker">
                        {emojis.map((emoji) => (
                          <button
                            key={emoji}
                            className="emoji-btn"
                            onClick={() => handleReaction(message.id, emoji)}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {typingUsers.length > 0 && (
            <div className="typing-indicator">
              {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
            </div>
          )}

          <form className="chat-input-container" onSubmit={handleSendMessage}>
            <input
              type="file"
              ref={fileInputRef}
              className="file-input"
              accept="image/*"
              onChange={handleFileSelect}
            />
            <label className="file-input-label" onClick={() => fileInputRef.current?.click()}>
              📎
            </label>
            <input
              type="text"
              className="chat-input"
              value={newMessage}
              onChange={(e) => {
                setNewMessage(e.target.value);
                handleTyping();
              }}
              placeholder="Type a message..."
            />
            <button type="submit" className="send-btn" disabled={!newMessage.trim()}>
              Send
            </button>
          </form>
        </div>

        <aside className="user-sidebar">
          <h2 className="sidebar-title">Online ({users.length})</h2>
          <div className="user-list">
            {users.map((u) => (
              <div key={u.id} className="user-item">
                <span className="user-status" />
                <span className="user-name">{u.username}</span>
                {u.typing && <span className="text-sm text-gray">typing...</span>}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default ChatRoom;
