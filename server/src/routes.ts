import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  hashPassword,
  comparePassword,
  generateToken,
  authMiddleware,
} from './auth';
import {
  AuthRequest,
  RegisterDto,
  LoginDto,
  CreateRoomDto,
  MarkReadDto,
  ReactionDto,
} from './types';

const prisma = new PrismaClient();
const router = Router();

// Configure multer for file uploads
const UPLOADS_DIR = process.env.UPLOADS_DIR || '../uploads';
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '5242880', 10);
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeName = `${uuidv4()}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (jpg, jpeg, png, gif, webp) are allowed'));
    }
  },
});

// Auth routes
router.post('/auth/register', async (req, res: Response) => {
  try {
    const { username, email, password, fullName }: RegisterDto = req.body;

    if (!username || !email || !password || !fullName) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ username }, { email }],
      },
    });

    if (existingUser) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    // Create user
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        fullName,
      },
    });

    // Generate token
    const token = generateToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    return res.status(201).json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        about: user.about,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/auth/login', async (req, res: Response) => {
  try {
    const { username, password }: LoginDto = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // Find user
    const user = await prisma.user.findUnique({ where: { username } });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const validPassword = await comparePassword(password, user.passwordHash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = generateToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        about: user.about,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/auth/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        about: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Room routes
router.post('/rooms', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, topic, type }: CreateRoomDto = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Room name is required' });
    }

    // Check if room exists
    const existingRoom = await prisma.room.findUnique({ where: { name } });

    if (existingRoom) {
      return res.status(409).json({ error: 'Room already exists' });
    }

    // Create room
    const room = await prisma.room.create({
      data: {
        name,
        topic: topic || null,
        type: type || 'public',
        ownerId: req.user!.userId,
      },
    });

    // Add creator as owner member
    await prisma.roomMember.create({
      data: {
        userId: req.user!.userId,
        roomId: room.id,
        role: 'owner',
      },
    });

    return res.status(201).json({ room });
  } catch (error) {
    console.error('Create room error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/rooms', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    // Get public rooms and rooms the user is a member of
    const rooms = await prisma.room.findMany({
      where: {
        OR: [
          { type: 'public' },
          { members: { some: { userId: req.user!.userId } } },
        ],
      },
      include: {
        owner: {
          select: { id: true, username: true },
        },
        _count: {
          select: { members: true, messages: true },
        },
      },
    });

    return res.json({ rooms });
  } catch (error) {
    console.error('Get rooms error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/rooms/:id/messages', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    const messages = await prisma.message.findMany({
      where: { roomId: id },
      include: {
        user: {
          select: { id: true, username: true, role: true },
        },
        reactions: {
          include: {
            user: { select: { id: true, username: true } },
          },
        },
        attachments: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    const total = await prisma.message.count({ where: { roomId: id } });

    return res.json({
      messages: messages.reverse(),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get messages error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Message routes
router.post('/messages/mark-read', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { messageIds }: MarkReadDto = req.body;

    if (!messageIds?.length) {
      return res.status(400).json({ error: 'Message IDs required' });
    }

    await prisma.messageRead.createMany({
      data: messageIds.map((messageId) => ({
        userId: req.user!.userId,
        messageId,
      })),
      skipDuplicates: true,
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/messages/:id/reactions', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { emoji }: ReactionDto = req.body;

    if (!emoji) {
      return res.status(400).json({ error: 'Emoji required' });
    }

    // Check if reaction exists
    const existingReaction = await prisma.reaction.findUnique({
      where: {
        userId_messageId_emoji: {
          userId: req.user!.userId,
          messageId: id,
          emoji,
        },
      },
    });

    if (existingReaction) {
      // Remove reaction
      await prisma.reaction.delete({ where: { id: existingReaction.id } });
      return res.json({ action: 'removed' });
    }

    // Add reaction
    const reaction = await prisma.reaction.create({
      data: {
        emoji,
        userId: req.user!.userId,
        messageId: id,
      },
    });

    return res.status(201).json({ action: 'added', reaction });
  } catch (error) {
    console.error('Reaction error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload routes
router.post('/uploads', authMiddleware, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    return res.status(201).json({
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      path: `/uploads/${req.file.filename}`,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export { router, prisma };
