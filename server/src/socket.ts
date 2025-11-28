import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { verifyToken } from './auth';
import { AuthenticatedSocket, JwtPayload, OnlineUser } from './types';

const prisma = new PrismaClient();

// Online users map: socketId -> user info
const onlineUsers = new Map<string, OnlineUser>();
// User sockets map: userId -> socketId
const userSockets = new Map<string, string>();

export function setupSocketHandlers(io: Server): void {
  // Authentication middleware
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth.token as string;
    
    if (!token) {
      return next(new Error('Authentication required'));
    }

    const payload = verifyToken(token);
    
    if (!payload) {
      return next(new Error('Invalid token'));
    }

    (socket as AuthenticatedSocket).user = payload;
    next();
  });

  io.on('connection', (socket: Socket) => {
    const authSocket = socket as AuthenticatedSocket;
    const user = authSocket.user as JwtPayload;

    console.log(`User connected: ${user.username} (${socket.id})`);

    // Register user as online
    const onlineUser: OnlineUser = {
      id: user.userId,
      username: user.username,
      role: user.role,
      currentRoom: null,
      typing: false,
      status: 'online',
    };
    
    onlineUsers.set(socket.id, onlineUser);
    userSockets.set(user.userId, socket.id);

    // Join room
    socket.on('room.join', async (roomId: string) => {
      try {
        const room = await prisma.room.findUnique({ where: { id: roomId } });
        
        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        // Leave current room
        const currentUser = onlineUsers.get(socket.id);
        if (currentUser?.currentRoom) {
          socket.leave(currentUser.currentRoom);
          io.to(currentUser.currentRoom).emit('user.left', {
            userId: user.userId,
            username: user.username,
          });
        }

        // Join new room
        socket.join(roomId);
        onlineUsers.set(socket.id, { ...currentUser!, currentRoom: roomId });

        // Notify room
        socket.to(roomId).emit('user.joined', {
          userId: user.userId,
          username: user.username,
        });

        // Get users in room
        const usersInRoom = Array.from(onlineUsers.values()).filter(
          (u) => u.currentRoom === roomId
        );

        socket.emit('room.joined', {
          roomId,
          room,
          users: usersInRoom,
        });

        // Broadcast user list update
        io.to(roomId).emit('room.users', { users: usersInRoom });
      } catch (error) {
        console.error('Room join error:', error);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // Leave room
    socket.on('room.leave', () => {
      const currentUser = onlineUsers.get(socket.id);
      
      if (currentUser?.currentRoom) {
        const roomId = currentUser.currentRoom;
        socket.leave(roomId);
        
        onlineUsers.set(socket.id, { ...currentUser, currentRoom: null });
        
        io.to(roomId).emit('user.left', {
          userId: user.userId,
          username: user.username,
        });

        // Broadcast updated user list
        const usersInRoom = Array.from(onlineUsers.values()).filter(
          (u) => u.currentRoom === roomId
        );
        io.to(roomId).emit('room.users', { users: usersInRoom });
      }
    });

    // Send message
    socket.on('message.send', async (data: { roomId: string; content: string }) => {
      try {
        const currentUser = onlineUsers.get(socket.id);
        
        if (!currentUser?.currentRoom || currentUser.currentRoom !== data.roomId) {
          socket.emit('error', { message: 'You must join the room first' });
          return;
        }

        // Create message in database
        const message = await prisma.message.create({
          data: {
            content: data.content,
            type: 'user',
            userId: user.userId,
            roomId: data.roomId,
          },
          include: {
            user: {
              select: { id: true, username: true, role: true },
            },
          },
        });

        // Broadcast to room
        io.to(data.roomId).emit('message.receive', {
          id: message.id,
          content: message.content,
          type: message.type,
          userId: message.userId,
          roomId: message.roomId,
          createdAt: message.createdAt,
          user: message.user,
          reactions: [],
        });
      } catch (error) {
        console.error('Send message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Typing indicators
    socket.on('typing.start', (roomId: string) => {
      const currentUser = onlineUsers.get(socket.id);
      if (currentUser?.currentRoom === roomId) {
        onlineUsers.set(socket.id, { ...currentUser, typing: true });
        socket.to(roomId).emit('typing.start', {
          userId: user.userId,
          username: user.username,
        });
      }
    });

    socket.on('typing.stop', (roomId: string) => {
      const currentUser = onlineUsers.get(socket.id);
      if (currentUser?.currentRoom === roomId) {
        onlineUsers.set(socket.id, { ...currentUser, typing: false });
        socket.to(roomId).emit('typing.stop', {
          userId: user.userId,
          username: user.username,
        });
      }
    });

    // Message read
    socket.on('message.read', async (data: { messageIds: string[]; roomId: string }) => {
      try {
        await prisma.messageRead.createMany({
          data: data.messageIds.map((messageId) => ({
            userId: user.userId,
            messageId,
          })),
          skipDuplicates: true,
        });

        socket.to(data.roomId).emit('message.read', {
          userId: user.userId,
          messageIds: data.messageIds,
        });
      } catch (error) {
        console.error('Message read error:', error);
      }
    });

    // Reactions
    socket.on('reaction.add', async (data: { messageId: string; emoji: string; roomId: string }) => {
      try {
        const reaction = await prisma.reaction.create({
          data: {
            emoji: data.emoji,
            userId: user.userId,
            messageId: data.messageId,
          },
        });

        io.to(data.roomId).emit('reaction.add', {
          messageId: data.messageId,
          reaction: {
            id: reaction.id,
            emoji: reaction.emoji,
            userId: user.userId,
            username: user.username,
          },
        });
      } catch (error) {
        // Reaction might already exist - try to remove it
        try {
          const existingReaction = await prisma.reaction.findUnique({
            where: {
              userId_messageId_emoji: {
                userId: user.userId,
                messageId: data.messageId,
                emoji: data.emoji,
              },
            },
          });

          if (existingReaction) {
            await prisma.reaction.delete({ where: { id: existingReaction.id } });
            io.to(data.roomId).emit('reaction.remove', {
              messageId: data.messageId,
              userId: user.userId,
              emoji: data.emoji,
            });
          }
        } catch (removeError) {
          console.error('Reaction remove error:', removeError);
        }
      }
    });

    socket.on('reaction.remove', async (data: { messageId: string; emoji: string; roomId: string }) => {
      try {
        const reaction = await prisma.reaction.findUnique({
          where: {
            userId_messageId_emoji: {
              userId: user.userId,
              messageId: data.messageId,
              emoji: data.emoji,
            },
          },
        });

        if (reaction) {
          await prisma.reaction.delete({ where: { id: reaction.id } });
          io.to(data.roomId).emit('reaction.remove', {
            messageId: data.messageId,
            userId: user.userId,
            emoji: data.emoji,
          });
        }
      } catch (error) {
        console.error('Reaction remove error:', error);
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      const currentUser = onlineUsers.get(socket.id);
      
      if (currentUser?.currentRoom) {
        io.to(currentUser.currentRoom).emit('user.left', {
          userId: user.userId,
          username: user.username,
        });

        // Broadcast updated user list
        const roomId = currentUser.currentRoom;
        setTimeout(() => {
          const usersInRoom = Array.from(onlineUsers.values()).filter(
            (u) => u.currentRoom === roomId
          );
          io.to(roomId).emit('room.users', { users: usersInRoom });
        }, 100);
      }

      onlineUsers.delete(socket.id);
      userSockets.delete(user.userId);
      console.log(`User disconnected: ${user.username} (${socket.id})`);
    });
  });
}

export function getOnlineUsers(): Map<string, OnlineUser> {
  return onlineUsers;
}
