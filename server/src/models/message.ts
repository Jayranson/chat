import db from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';

export interface Message {
  id: string;
  room_id: string;
  user_id: string;
  text: string;
  type: 'user' | 'system' | 'bot';
  is_deleted: number;
  is_edited: number;
  attachment_url: string | null;
  attachment_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessagePublic {
  id: string;
  room_id: string;
  user_id: string;
  username?: string;
  text: string;
  type: 'user' | 'system' | 'bot';
  is_deleted: boolean;
  is_edited: boolean;
  attachment_url: string | null;
  attachment_type: string | null;
  created_at: string;
  reactions?: Array<{ emoji: string; count: number; users: string[] }>;
}

export interface CreateMessageInput {
  room_id: string;
  user_id: string;
  text: string;
  type?: 'user' | 'system' | 'bot';
  attachment_url?: string;
  attachment_type?: string;
}

export const messageModel = {
  create: (input: CreateMessageInput): MessagePublic => {
    const id = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO messages (id, room_id, user_id, text, type, attachment_url, attachment_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      input.room_id,
      input.user_id,
      input.text,
      input.type || 'user',
      input.attachment_url || null,
      input.attachment_type || null
    );
    return messageModel.findById(id) as MessagePublic;
  },

  findById: (id: string): MessagePublic | null => {
    const stmt = db.prepare(`
      SELECT m.*, u.username 
      FROM messages m 
      LEFT JOIN users u ON m.user_id = u.id 
      WHERE m.id = ?
    `);
    const message = stmt.get(id) as (Message & { username: string }) | undefined;
    if (!message) return null;
    
    const reactions = messageModel.getReactions(id);
    
    return {
      ...message,
      is_deleted: Boolean(message.is_deleted),
      is_edited: Boolean(message.is_edited),
      reactions,
    };
  },

  getByRoom: (roomId: string, limit = 50, offset = 0): MessagePublic[] => {
    const stmt = db.prepare(`
      SELECT m.*, u.username 
      FROM messages m 
      LEFT JOIN users u ON m.user_id = u.id 
      WHERE m.room_id = ?
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
    `);
    const messages = stmt.all(roomId, limit, offset) as Array<Message & { username: string }>;
    
    return messages.reverse().map(message => ({
      ...message,
      is_deleted: Boolean(message.is_deleted),
      is_edited: Boolean(message.is_edited),
      reactions: messageModel.getReactions(message.id),
    }));
  },

  update: (id: string, text: string): MessagePublic | null => {
    const stmt = db.prepare(`
      UPDATE messages 
      SET text = ?, is_edited = 1, updated_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run(text, id);
    return messageModel.findById(id);
  },

  softDelete: (id: string): boolean => {
    const stmt = db.prepare(`
      UPDATE messages 
      SET is_deleted = 1, text = '[Message deleted]', updated_at = datetime('now')
      WHERE id = ?
    `);
    const result = stmt.run(id);
    return result.changes > 0;
  },

  delete: (id: string): boolean => {
    const stmt = db.prepare('DELETE FROM messages WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  },

  // Reactions
  addReaction: (messageId: string, userId: string, emoji: string): void => {
    const id = uuidv4();
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO reactions (id, message_id, user_id, emoji)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(id, messageId, userId, emoji);
  },

  removeReaction: (messageId: string, userId: string, emoji: string): boolean => {
    const stmt = db.prepare(`
      DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?
    `);
    const result = stmt.run(messageId, userId, emoji);
    return result.changes > 0;
  },

  getReactions: (messageId: string): Array<{ emoji: string; count: number; users: string[] }> => {
    const stmt = db.prepare(`
      SELECT emoji, GROUP_CONCAT(user_id) as user_ids, COUNT(*) as count
      FROM reactions
      WHERE message_id = ?
      GROUP BY emoji
    `);
    const reactions = stmt.all(messageId) as Array<{ emoji: string; user_ids: string; count: number }>;
    return reactions.map(r => ({
      emoji: r.emoji,
      count: r.count,
      users: r.user_ids.split(','),
    }));
  },

  // Read receipts
  markAsRead: (roomId: string, userId: string, messageId: string): void => {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO read_receipts (room_id, user_id, last_read_message_id, last_read_at)
      VALUES (?, ?, ?, datetime('now'))
    `);
    stmt.run(roomId, userId, messageId);
  },

  getReadReceipts: (roomId: string): Array<{ user_id: string; last_read_message_id: string; last_read_at: string }> => {
    const stmt = db.prepare(`
      SELECT user_id, last_read_message_id, last_read_at
      FROM read_receipts
      WHERE room_id = ?
    `);
    return stmt.all(roomId) as Array<{ user_id: string; last_read_message_id: string; last_read_at: string }>;
  },

  getUnreadCount: (roomId: string, userId: string): number => {
    const stmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM messages m
      WHERE m.room_id = ?
      AND m.created_at > (
        SELECT COALESCE(
          (SELECT last_read_at FROM read_receipts WHERE room_id = ? AND user_id = ?),
          '1970-01-01'
        )
      )
    `);
    const result = stmt.get(roomId, roomId, userId) as { count: number };
    return result.count;
  },
};
