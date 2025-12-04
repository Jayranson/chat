import { Server, Socket } from 'socket.io';
import { verifyToken, JWTPayload } from '../utils/jwt.js';
import { userModel } from '../models/user.js';
import { roomModel } from '../models/room.js';
import { messageModel } from '../models/message.js';

interface AuthenticatedSocket extends Socket {
  user?: JWTPayload;
  currentRoom?: string;
}

interface OnlineUser {
  socketId: string;
  userId: string;
  username: string;
  role: 'admin' | 'user';
  currentRoom?: string;
  status: 'online' | 'away' | 'dnd';
  isTyping: boolean;
}

const onlineUsers = new Map<string, OnlineUser>();

export const setupSocketHandlers = (io: Server): void => {
  // Authentication middleware
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication required'));
    }
    
    const payload = verifyToken(token);
    if (!payload) {
      return next(new Error('Invalid token'));
    }
    
    // Check if user is banned
    const user = userModel.findById(payload.userId);
    if (!user) {
      return next(new Error('User not found'));
    }
    
    if (user.is_banned) {
      return next(new Error('Account is banned'));
    }
    
    socket.user = payload;
    next();
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    if (!socket.user) return;
    
    const { userId, username, role } = socket.user;
    
    console.log(`User connected: ${username} (${socket.id})`);
    
    // Add to online users
    onlineUsers.set(socket.id, {
      socketId: socket.id,
      userId,
      username,
      role,
      status: 'online',
      isTyping: false,
    });
    
    // Send user info
    socket.emit('user:connected', {
      userId,
      username,
      role,
    });
    
    // Broadcast online users update
    io.emit('users:online', Array.from(onlineUsers.values()).map(u => ({
      id: u.userId,
      username: u.username,
      status: u.status,
      currentRoom: u.currentRoom,
    })));

    // === Room Events ===
    
    socket.on('room:join', async (roomId: string, callback?: (data: unknown) => void) => {
      try {
        const room = roomModel.findById(roomId) || roomModel.findByName(roomId);
        if (!room) {
          callback?.({ error: 'Room not found' });
          return;
        }
        
        // Leave current room if any
        if (socket.currentRoom) {
          socket.leave(socket.currentRoom);
          io.to(socket.currentRoom).emit('user:left', { userId, username });
        }
        
        // Join new room
        socket.join(room.id);
        socket.currentRoom = room.id;
        
        const user = onlineUsers.get(socket.id);
        if (user) {
          user.currentRoom = room.id;
        }
        
        // Get message history
        const messages = messageModel.getByRoom(room.id, 50);
        
        // Notify room
        io.to(room.id).emit('user:joined', { userId, username });
        
        // Send room data
        callback?.({
          room,
          messages,
          users: Array.from(onlineUsers.values())
            .filter(u => u.currentRoom === room.id)
            .map(u => ({
              id: u.userId,
              username: u.username,
              status: u.status,
              isTyping: u.isTyping,
            })),
        });
      } catch (error) {
        console.error('Join room error:', error);
        callback?.({ error: 'Failed to join room' });
      }
    });

    socket.on('room:leave', () => {
      if (socket.currentRoom) {
        socket.leave(socket.currentRoom);
        io.to(socket.currentRoom).emit('user:left', { userId, username });
        
        const user = onlineUsers.get(socket.id);
        if (user) {
          user.currentRoom = undefined;
          user.isTyping = false;
        }
        
        socket.currentRoom = undefined;
      }
    });

    // === Message Events ===
    
    socket.on('message:send', async (data: { text: string; attachmentUrl?: string; attachmentType?: string }, callback?: (msg: unknown) => void) => {
      if (!socket.currentRoom || !socket.user) return;
      
      try {
        const room = roomModel.findById(socket.currentRoom);
        if (!room) return;
        
        // Check if room is locked
        if (room.is_locked && socket.user.role !== 'admin') {
          callback?.({ error: 'Room is locked' });
          return;
        }
        
        // Check if user is muted
        const user = userModel.findById(socket.user.userId);
        if (user?.is_globally_muted) {
          callback?.({ error: 'You are muted' });
          return;
        }
        
        // Create message
        const message = messageModel.create({
          room_id: socket.currentRoom,
          user_id: socket.user.userId,
          text: data.text,
          type: 'user',
          attachment_url: data.attachmentUrl,
          attachment_type: data.attachmentType,
        });
        
        // Add username
        const fullMessage = {
          ...message,
          username: socket.user.username,
        };
        
        // Broadcast to room
        io.to(socket.currentRoom).emit('message:receive', fullMessage);
        
        // Clear typing indicator
        const onlineUser = onlineUsers.get(socket.id);
        if (onlineUser) {
          onlineUser.isTyping = false;
        }
        io.to(socket.currentRoom).emit('typing:update', getTypingUsers(socket.currentRoom));
        
        callback?.(fullMessage);
      } catch (error) {
        console.error('Send message error:', error);
        callback?.({ error: 'Failed to send message' });
      }
    });

    socket.on('message:edit', async (data: { messageId: string; text: string }, callback?: (msg: unknown) => void) => {
      if (!socket.user) return;
      
      try {
        const message = messageModel.findById(data.messageId);
        if (!message) {
          callback?.({ error: 'Message not found' });
          return;
        }
        
        // Check permission
        if (message.user_id !== socket.user.userId && socket.user.role !== 'admin') {
          callback?.({ error: 'Permission denied' });
          return;
        }
        
        const updated = messageModel.update(data.messageId, data.text);
        
        if (updated) {
          io.to(message.room_id).emit('message:updated', updated);
          callback?.(updated);
        }
      } catch (error) {
        console.error('Edit message error:', error);
        callback?.({ error: 'Failed to edit message' });
      }
    });

    socket.on('message:delete', async (messageId: string, callback?: (success: boolean) => void) => {
      if (!socket.user) return;
      
      try {
        const message = messageModel.findById(messageId);
        if (!message) {
          callback?.(false);
          return;
        }
        
        // Check permission
        if (message.user_id !== socket.user.userId && socket.user.role !== 'admin') {
          callback?.(false);
          return;
        }
        
        messageModel.softDelete(messageId);
        
        io.to(message.room_id).emit('message:deleted', { messageId });
        callback?.(true);
      } catch (error) {
        console.error('Delete message error:', error);
        callback?.(false);
      }
    });

    // === Typing Events ===
    
    socket.on('typing:start', () => {
      if (!socket.currentRoom) return;
      
      const user = onlineUsers.get(socket.id);
      if (user) {
        user.isTyping = true;
        io.to(socket.currentRoom).emit('typing:update', getTypingUsers(socket.currentRoom));
      }
    });

    socket.on('typing:stop', () => {
      if (!socket.currentRoom) return;
      
      const user = onlineUsers.get(socket.id);
      if (user) {
        user.isTyping = false;
        io.to(socket.currentRoom).emit('typing:update', getTypingUsers(socket.currentRoom));
      }
    });

    // === Read Receipts ===
    
    socket.on('message:read', (messageId: string) => {
      if (!socket.currentRoom || !socket.user) return;
      
      messageModel.markAsRead(socket.currentRoom, socket.user.userId, messageId);
      
      io.to(socket.currentRoom).emit('message:read', {
        userId: socket.user.userId,
        username: socket.user.username,
        messageId,
      });
    });

    // === Reaction Events ===
    
    socket.on('reaction:add', (data: { messageId: string; emoji: string }) => {
      if (!socket.user) return;
      
      const message = messageModel.findById(data.messageId);
      if (!message) return;
      
      messageModel.addReaction(data.messageId, socket.user.userId, data.emoji);
      
      const reactions = messageModel.getReactions(data.messageId);
      io.to(message.room_id).emit('reaction:update', {
        messageId: data.messageId,
        reactions,
      });
    });

    socket.on('reaction:remove', (data: { messageId: string; emoji: string }) => {
      if (!socket.user) return;
      
      const message = messageModel.findById(data.messageId);
      if (!message) return;
      
      messageModel.removeReaction(data.messageId, socket.user.userId, data.emoji);
      
      const reactions = messageModel.getReactions(data.messageId);
      io.to(message.room_id).emit('reaction:update', {
        messageId: data.messageId,
        reactions,
      });
    });

    // === Status Events ===
    
    socket.on('status:update', (status: 'online' | 'away' | 'dnd') => {
      const user = onlineUsers.get(socket.id);
      if (user) {
        user.status = status;
        io.emit('users:online', Array.from(onlineUsers.values()).map(u => ({
          id: u.userId,
          username: u.username,
          status: u.status,
          currentRoom: u.currentRoom,
        })));
      }
    });

    // === Disconnect ===
    
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${username} (${socket.id})`);
      
      // Leave current room
      if (socket.currentRoom) {
        io.to(socket.currentRoom).emit('user:left', { userId, username });
      }
      
      // Remove from online users
      onlineUsers.delete(socket.id);
      
      // Broadcast updated online users
      io.emit('users:online', Array.from(onlineUsers.values()).map(u => ({
        id: u.userId,
        username: u.username,
        status: u.status,
        currentRoom: u.currentRoom,
      })));
    });
  });
};

const getTypingUsers = (roomId: string): Array<{ userId: string; username: string }> => {
  return Array.from(onlineUsers.values())
    .filter(u => u.currentRoom === roomId && u.isTyping)
    .map(u => ({ userId: u.userId, username: u.username }));
};

export { onlineUsers };
