import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// POST /api/messages/mark-read - Mark messages as read
router.post('/mark-read', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { messageIds } = req.body;
    const userId = req.user!.userId;

    if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
      res.status(400).json({ error: 'Message IDs are required' });
      return;
    }

    // Create read records for each message
    const readRecords = messageIds.map((messageId: string) => ({
      userId,
      messageId,
    }));

    // Use createMany with skipDuplicates to handle already-read messages
    await prisma.messageRead.createMany({
      data: readRecords,
      skipDuplicates: true,
    });

    res.status(200).json({ message: 'Messages marked as read' });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/messages/:id/reactions - Add or remove reaction
router.post('/:id/reactions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { emoji } = req.body;
    const userId = req.user!.userId;

    if (!emoji) {
      res.status(400).json({ error: 'Emoji is required' });
      return;
    }

    // Check if message exists
    const message = await prisma.message.findUnique({
      where: { id },
    });

    if (!message) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    // Check if reaction already exists
    const existingReaction = await prisma.reaction.findUnique({
      where: {
        userId_messageId_emoji: { userId, messageId: id, emoji },
      },
    });

    if (existingReaction) {
      // Remove the reaction (toggle off)
      await prisma.reaction.delete({
        where: { id: existingReaction.id },
      });

      res.status(200).json({ action: 'removed', emoji });
      return;
    }

    // Add new reaction
    const reaction = await prisma.reaction.create({
      data: {
        userId,
        messageId: id,
        emoji,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    res.status(201).json({
      action: 'added',
      reaction: {
        id: reaction.id,
        emoji: reaction.emoji,
        user: reaction.user,
      },
    });
  } catch (error) {
    console.error('Reaction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
