import { Server as SocketServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { PrismaClient } from '@prisma/client';
import { verifyToken, JwtPayload } from '../utils/jwt';

const prisma = new PrismaClient();

interface AuthenticatedSocket extends Socket {
  user?: JwtPayload;
}

interface TypingState {
  [roomId: string]: Set<string>;
}

const typingUsers: TypingState = {};

export function setupSocketIO(httpServer: HttpServer): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || ['http://localhost:3000', 'http://localhost:5173'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Authentication middleware
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const payload = verifyToken(token);
      socket.user = payload;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket: AuthenticatedSocket) => {
    const user = socket.user!;
    console.log(`User connected: ${user.username} (${socket.id})`);

    // Join user's personal room for direct messaging
    socket.join(`user:${user.userId}`);

    // Handle joining a room
    socket.on('room.join', async (roomId: string) => {
      try {
        const room = await prisma.room.findUnique({ where: { id: roomId } });
        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        socket.join(`room:${roomId}`);
        
        // Ensure user is a member
        await prisma.roomMember.upsert({
          where: { userId_roomId: { userId: user.userId, roomId } },
          create: { userId: user.userId, roomId },
          update: {},
        });

        // Notify others in the room
        socket.to(`room:${roomId}`).emit('user.joined', {
          userId: user.userId,
          username: user.username,
          roomId,
        });

        console.log(`${user.username} joined room ${room.name}`);
      } catch (error) {
        console.error('Room join error:', error);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // Handle leaving a room
    socket.on('room.leave', (roomId: string) => {
      socket.leave(`room:${roomId}`);
      socket.to(`room:${roomId}`).emit('user.left', {
        userId: user.userId,
        username: user.username,
        roomId,
      });
      
      // Clean up typing state
      if (typingUsers[roomId]) {
        typingUsers[roomId].delete(user.userId);
      }
      
      console.log(`${user.username} left room ${roomId}`);
    });

    // Handle sending a message
    socket.on('message.send', async (data: { roomId: string; content: string; attachmentIds?: string[] }) => {
      try {
        const { roomId, content, attachmentIds } = data;

        if (!content?.trim() && (!attachmentIds || attachmentIds.length === 0)) {
          socket.emit('error', { message: 'Message content is required' });
          return;
        }

        const message = await prisma.message.create({
          data: {
            content: content?.trim() || '',
            authorId: user.userId,
            roomId,
            attachments: attachmentIds?.length
              ? { connect: attachmentIds.map((id) => ({ id })) }
              : undefined,
          },
          include: {
            author: {
              select: {
                id: true,
                username: true,
                isAdmin: true,
              },
            },
            attachments: true,
            reactions: {
              include: {
                user: { select: { id: true, username: true } },
              },
            },
          },
        });

        // Broadcast to room
        io.to(`room:${roomId}`).emit('message.receive', message);

        // Clear typing state
        if (typingUsers[roomId]) {
          typingUsers[roomId].delete(user.userId);
          io.to(`room:${roomId}`).emit('typing.update', {
            roomId,
            users: Array.from(typingUsers[roomId]),
          });
        }
      } catch (error) {
        console.error('Message send error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle marking messages as read
    socket.on('message.read', async (data: { messageIds: string[]; roomId: string }) => {
      try {
        const { messageIds, roomId } = data;

        await prisma.messageRead.createMany({
          data: messageIds.map((messageId) => ({
            userId: user.userId,
            messageId,
          })),
          skipDuplicates: true,
        });

        // Broadcast read receipt
        socket.to(`room:${roomId}`).emit('message.read', {
          userId: user.userId,
          username: user.username,
          messageIds,
          roomId,
        });
      } catch (error) {
        console.error('Message read error:', error);
      }
    });

    // Handle typing indicators
    socket.on('typing.start', (roomId: string) => {
      if (!typingUsers[roomId]) {
        typingUsers[roomId] = new Set();
      }
      typingUsers[roomId].add(user.userId);
      
      socket.to(`room:${roomId}`).emit('typing.update', {
        roomId,
        users: Array.from(typingUsers[roomId]),
      });
    });

    socket.on('typing.stop', (roomId: string) => {
      if (typingUsers[roomId]) {
        typingUsers[roomId].delete(user.userId);
        socket.to(`room:${roomId}`).emit('typing.update', {
          roomId,
          users: Array.from(typingUsers[roomId]),
        });
      }
    });

    // Handle reactions
    socket.on('reaction.add', async (data: { messageId: string; emoji: string; roomId: string }) => {
      try {
        const { messageId, emoji, roomId } = data;

        const reaction = await prisma.reaction.upsert({
          where: {
            userId_messageId_emoji: {
              userId: user.userId,
              messageId,
              emoji,
            },
          },
          create: {
            userId: user.userId,
            messageId,
            emoji,
          },
          update: {},
          include: {
            user: { select: { id: true, username: true } },
          },
        });

        io.to(`room:${roomId}`).emit('reaction.added', {
          messageId,
          reaction: {
            id: reaction.id,
            emoji: reaction.emoji,
            user: reaction.user,
          },
        });
      } catch (error) {
        console.error('Reaction add error:', error);
      }
    });

    socket.on('reaction.remove', async (data: { messageId: string; emoji: string; roomId: string }) => {
      try {
        const { messageId, emoji, roomId } = data;

        await prisma.reaction.deleteMany({
          where: {
            userId: user.userId,
            messageId,
            emoji,
          },
        });

        io.to(`room:${roomId}`).emit('reaction.removed', {
          messageId,
          userId: user.userId,
          emoji,
        });
      } catch (error) {
        console.error('Reaction remove error:', error);
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${user.username} (${socket.id})`);
      
      // Clean up typing state for all rooms
      Object.keys(typingUsers).forEach((roomId) => {
        if (typingUsers[roomId].has(user.userId)) {
          typingUsers[roomId].delete(user.userId);
          io.to(`room:${roomId}`).emit('typing.update', {
            roomId,
            users: Array.from(typingUsers[roomId]),
          });
        }
      });
    });
  });

  return io;
}
