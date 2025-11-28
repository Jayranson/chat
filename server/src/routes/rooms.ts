import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// POST /api/rooms - Create a new room
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, topic, isPrivate } = req.body;
    const userId = req.user!.userId;

    if (!name) {
      res.status(400).json({ error: 'Room name is required' });
      return;
    }

    // Check if room already exists
    const existingRoom = await prisma.room.findUnique({
      where: { name },
    });

    if (existingRoom) {
      res.status(409).json({ error: 'Room name already exists' });
      return;
    }

    const room = await prisma.room.create({
      data: {
        name,
        topic: topic || '',
        isPrivate: isPrivate || false,
        ownerId: userId,
        members: {
          create: {
            userId,
          },
        },
      },
      include: {
        owner: {
          select: {
            id: true,
            username: true,
          },
        },
        _count: {
          select: { members: true },
        },
      },
    });

    res.status(201).json({
      id: room.id,
      name: room.name,
      topic: room.topic,
      isPrivate: room.isPrivate,
      owner: room.owner,
      memberCount: room._count.members,
      createdAt: room.createdAt,
    });
  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/rooms - List rooms for user
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    // Get rooms where user is a member or room is public
    const rooms = await prisma.room.findMany({
      where: {
        OR: [
          { isPrivate: false },
          { members: { some: { userId } } },
        ],
      },
      include: {
        owner: {
          select: {
            id: true,
            username: true,
          },
        },
        _count: {
          select: { members: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json(
      rooms.map((room) => ({
        id: room.id,
        name: room.name,
        topic: room.topic,
        isPrivate: room.isPrivate,
        owner: room.owner,
        memberCount: room._count.members,
        createdAt: room.createdAt,
      }))
    );
  } catch (error) {
    console.error('List rooms error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/rooms/:id/messages - Get messages with pagination
router.get('/:id/messages', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    const room = await prisma.room.findUnique({
      where: { id },
    });

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { roomId: id },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              isAdmin: true,
            },
          },
          reactions: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                },
              },
            },
          },
          attachments: true,
          readBy: {
            select: {
              userId: true,
              readAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.message.count({ where: { roomId: id } }),
    ]);

    res.status(200).json({
      messages: messages.reverse(), // Return in chronological order
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/rooms/:id/join - Join a room
router.post('/:id/join', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const room = await prisma.room.findUnique({
      where: { id },
    });

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    // Check if already a member
    const existingMembership = await prisma.roomMember.findUnique({
      where: {
        userId_roomId: { userId, roomId: id },
      },
    });

    if (existingMembership) {
      res.status(200).json({ message: 'Already a member' });
      return;
    }

    await prisma.roomMember.create({
      data: {
        userId,
        roomId: id,
      },
    });

    res.status(200).json({ message: 'Joined room successfully' });
  } catch (error) {
    console.error('Join room error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
