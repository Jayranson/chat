import { Router, Response } from 'express';
import { z } from 'zod';
import { roomModel } from '../models/room.js';
import { messageModel } from '../models/message.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// Validation schemas
const createRoomSchema = z.object({
  name: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/, 'Room name can only contain letters, numbers, underscores, and hyphens'),
  topic: z.string().max(200).optional(),
  type: z.enum(['public', 'private']).optional(),
});

const updateRoomSchema = z.object({
  topic: z.string().max(200).optional(),
  is_locked: z.boolean().optional(),
});

// GET /api/rooms - List all public rooms
router.get('/', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const rooms = roomModel.getPublicRooms();
    res.json(rooms);
  } catch (error) {
    console.error('Get rooms error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/rooms - Create a new room
router.post('/', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = createRoomSchema.parse(req.body);
    
    // Check if room name exists
    if (roomModel.findByName(body.name)) {
      res.status(400).json({ error: 'Room name already exists' });
      return;
    }
    
    const room = roomModel.create({
      name: body.name,
      topic: body.topic,
      type: body.type,
      owner_id: req.user?.userId,
    });
    
    // Add owner as member
    if (req.user) {
      roomModel.addMember(room.id, req.user.userId, 'owner');
    }
    
    res.status(201).json(room);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Create room error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/rooms/:roomId - Get room details
router.get('/:roomId', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const room = roomModel.findById(req.params.roomId) || roomModel.findByName(req.params.roomId);
    
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    
    res.json(room);
  } catch (error) {
    console.error('Get room error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/rooms/:roomId - Update room
router.patch('/:roomId', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = updateRoomSchema.parse(req.body);
    const room = roomModel.findById(req.params.roomId);
    
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    
    // Check permission (owner or admin)
    if (room.owner_id !== req.user?.userId && req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }
    
    const updatedRoom = roomModel.update(req.params.roomId, {
      topic: body.topic,
      is_locked: body.is_locked !== undefined ? (body.is_locked ? 1 : 0) : undefined,
    });
    res.json(updatedRoom);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Update room error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/rooms/:roomId/messages - Get message history with pagination
router.get('/:roomId/messages', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const room = roomModel.findById(req.params.roomId) || roomModel.findByName(req.params.roomId);
    
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    
    const messages = messageModel.getByRoom(room.id, limit, offset);
    
    res.json({
      messages,
      pagination: {
        limit,
        offset,
        hasMore: messages.length === limit,
      },
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/rooms/:roomId/messages/:messageId/read - Mark message as read
router.post('/:roomId/messages/:messageId/read', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const room = roomModel.findById(req.params.roomId);
    
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    
    messageModel.markAsRead(room.id, req.user.userId, req.params.messageId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/rooms/:roomId/messages/:messageId/reactions - Add reaction
router.post('/:roomId/messages/:messageId/reactions', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { emoji } = req.body;
    
    if (!emoji || typeof emoji !== 'string') {
      res.status(400).json({ error: 'Emoji is required' });
      return;
    }
    
    const message = messageModel.findById(req.params.messageId);
    if (!message) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    
    messageModel.addReaction(req.params.messageId, req.user.userId, emoji);
    
    const reactions = messageModel.getReactions(req.params.messageId);
    res.json({ reactions });
  } catch (error) {
    console.error('Add reaction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/rooms/:roomId/messages/:messageId/reactions/:emoji - Remove reaction
router.delete('/:roomId/messages/:messageId/reactions/:emoji', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    
    messageModel.removeReaction(req.params.messageId, req.user.userId, req.params.emoji);
    
    const reactions = messageModel.getReactions(req.params.messageId);
    res.json({ reactions });
  } catch (error) {
    console.error('Remove reaction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
