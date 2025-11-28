import { useState, useEffect, useRef, useCallback, ChangeEvent } from 'react';
import { api } from '../utils/api';
import { getSocket } from '../utils/socket';
import type { Message, Room, User, Attachment, TypingUpdate } from '../types';

interface ChatRoomProps {
  room: Room;
  user: User;
  onBack: () => void;
}

export function ChatRoom({ room, user, onBack }: ChatRoomProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // Join the room
    socket.emit('room.join', room.id);

    // Load existing messages
    api.rooms.getMessages(room.id).then((data) => {
      setMessages(data.messages);
      setTimeout(scrollToBottom, 100);
    });

    // Listen for new messages
    const handleMessage = (message: Message) => {
      setMessages((prev) => [...prev, message]);
      setTimeout(scrollToBottom, 100);

      // Mark as read
      api.messages.markRead([message.id]);
    };

    // Listen for typing updates
    const handleTyping = (data: TypingUpdate) => {
      if (data.roomId === room.id) {
        setTypingUsers(data.users.filter((id) => id !== user.id));
      }
    };

    // Listen for reaction updates
    const handleReactionAdded = (data: { messageId: string; reaction: { id: string; emoji: string; user: { id: string; username: string } } }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === data.messageId
            ? { ...msg, reactions: [...msg.reactions, data.reaction] }
            : msg
        )
      );
    };

    const handleReactionRemoved = (data: { messageId: string; userId: string; emoji: string }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === data.messageId
            ? {
                ...msg,
                reactions: msg.reactions.filter(
                  (r) => !(r.user.id === data.userId && r.emoji === data.emoji)
                ),
              }
            : msg
        )
      );
    };

    socket.on('message.receive', handleMessage);
    socket.on('typing.update', handleTyping);
    socket.on('reaction.added', handleReactionAdded);
    socket.on('reaction.removed', handleReactionRemoved);

    return () => {
      socket.emit('room.leave', room.id);
      socket.off('message.receive', handleMessage);
      socket.off('typing.update', handleTyping);
      socket.off('reaction.added', handleReactionAdded);
      socket.off('reaction.removed', handleReactionRemoved);
    };
  }, [room.id, user.id, scrollToBottom]);

  const handleTypingStart = () => {
    const socket = getSocket();
    if (!socket) return;

    socket.emit('typing.start', room.id);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing.stop', room.id);
    }, 2000);
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() && !selectedFile) return;

    const socket = getSocket();
    if (!socket) return;

    let attachmentIds: string[] = [];

    if (selectedFile) {
      setUploading(true);
      setUploadError('');
      try {
        const result = await api.uploads.upload(selectedFile);
        if (result.error) {
          setUploadError(result.error);
          setUploading(false);
          return;
        }
        attachmentIds = [result.id];
      } catch (err) {
        setUploadError('Failed to upload file');
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    socket.emit('message.send', {
      roomId: room.id,
      content: newMessage.trim(),
      attachmentIds,
    });

    setNewMessage('');
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    // Stop typing indicator
    socket.emit('typing.stop', room.id);
  };

  const handleReaction = (messageId: string, emoji: string) => {
    const socket = getSocket();
    if (!socket) return;

    const message = messages.find((m) => m.id === messageId);
    const existingReaction = message?.reactions.find(
      (r) => r.emoji === emoji && r.user.id === user.id
    );

    if (existingReaction) {
      socket.emit('reaction.remove', { messageId, emoji, roomId: room.id });
    } else {
      socket.emit('reaction.add', { messageId, emoji, roomId: room.id });
    }
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError('');

    // Check file size
    const maxSize = user.isAdmin ? 50 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > maxSize) {
      const maxSizeMB = maxSize / (1024 * 1024);
      setUploadError(`File size exceeds ${maxSizeMB}MB limit`);
      return;
    }

    // Check file type for non-admin
    if (!user.isAdmin) {
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        setUploadError('Only image files (jpg, jpeg, png, gif, webp) are allowed');
        return;
      }
    }

    setSelectedFile(file);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const commonEmojis = ['👍', '❤️', '😂', '😮', '😢', '🎉'];

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ← Back
          </button>
          <div>
            <h2 className="text-xl font-bold">#{room.name}</h2>
            <p className="text-sm text-gray-400">{room.topic}</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex flex-col ${
              message.author.id === user.id ? 'items-end' : 'items-start'
            }`}
          >
            <div
              className={`max-w-[70%] rounded-lg p-3 ${
                message.author.id === user.id
                  ? 'bg-blue-600'
                  : 'bg-gray-700'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-sm">
                  {message.author.username}
                  {message.author.isAdmin && (
                    <span className="ml-1 px-1.5 py-0.5 bg-yellow-500 text-black text-xs rounded">
                      Admin
                    </span>
                  )}
                </span>
                <span className="text-xs text-gray-400">
                  {formatTime(message.createdAt)}
                </span>
              </div>
              <p className="break-words">{message.content}</p>
              
              {/* Attachments */}
              {message.attachments.map((attachment: Attachment) => (
                <div key={attachment.id} className="mt-2">
                  {attachment.mimeType.startsWith('image/') ? (
                    <img
                      src={attachment.url}
                      alt={attachment.originalName}
                      className="max-w-full max-h-64 rounded"
                    />
                  ) : (
                    <a
                      href={attachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-300 hover:underline"
                    >
                      📎 {attachment.originalName}
                    </a>
                  )}
                </div>
              ))}

              {/* Reactions */}
              {message.reactions.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {Object.entries(
                    message.reactions.reduce((acc, r) => {
                      acc[r.emoji] = acc[r.emoji] || [];
                      acc[r.emoji].push(r.user.username);
                      return acc;
                    }, {} as Record<string, string[]>)
                  ).map(([emoji, users]) => (
                    <button
                      key={emoji}
                      onClick={() => handleReaction(message.id, emoji)}
                      className={`px-2 py-0.5 rounded-full text-sm ${
                        users.includes(user.username)
                          ? 'bg-blue-500'
                          : 'bg-gray-600'
                      }`}
                      title={users.join(', ')}
                    >
                      {emoji} {users.length}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Reaction picker */}
            <div className="flex gap-1 mt-1 opacity-0 hover:opacity-100 transition-opacity">
              {commonEmojis.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleReaction(message.id, emoji)}
                  className="text-sm hover:scale-125 transition-transform"
                >
                  {emoji}
                </button>
              ))}
            </div>

            {/* Read receipts */}
            {message.author.id === user.id && message.readBy.length > 0 && (
              <span className="text-xs text-gray-500 mt-1">
                ✓✓ Read by {message.readBy.length}
              </span>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing indicator */}
      {typingUsers.length > 0 && (
        <div className="px-4 py-2 text-sm text-gray-400">
          {typingUsers.length === 1
            ? `Someone is typing...`
            : `${typingUsers.length} people are typing...`}
        </div>
      )}

      {/* Upload error */}
      {uploadError && (
        <div className="px-4 py-2 text-sm text-red-400">{uploadError}</div>
      )}

      {/* Selected file preview */}
      {selectedFile && (
        <div className="px-4 py-2 flex items-center gap-2 bg-gray-800">
          <span className="text-sm text-gray-300">📎 {selectedFile.name}</span>
          <button
            onClick={() => {
              setSelectedFile(null);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
            className="text-red-400 hover:text-red-300"
          >
            ✕
          </button>
        </div>
      )}

      {/* Message input */}
      <div className="p-4 border-t border-gray-700">
        <div className="flex gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            accept={user.isAdmin ? '*' : 'image/jpeg,image/jpg,image/png,image/gif,image/webp'}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
            title={user.isAdmin ? 'Upload any file' : 'Upload image'}
            disabled={uploading}
          >
            📎
          </button>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              handleTypingStart();
            }}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={uploading}
          />
          <button
            onClick={handleSendMessage}
            disabled={(!newMessage.trim() && !selectedFile) || uploading}
            className="px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
