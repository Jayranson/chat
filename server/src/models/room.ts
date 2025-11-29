import db from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';

export interface Room {
  id: string;
  name: string;
  type: 'public' | 'private' | 'dm';
  topic: string;
  owner_id: string | null;
  is_locked: number;
  created_at: string;
  updated_at: string;
}

export interface RoomPublic {
  id: string;
  name: string;
  type: 'public' | 'private' | 'dm';
  topic: string;
  owner_id: string | null;
  is_locked: boolean;
  created_at: string;
  user_count?: number;
}

export interface CreateRoomInput {
  name: string;
  type?: 'public' | 'private' | 'dm';
  topic?: string;
  owner_id?: string;
}

export const roomModel = {
  create: (input: CreateRoomInput): RoomPublic => {
    const id = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO rooms (id, name, type, topic, owner_id)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(id, input.name, input.type || 'public', input.topic || '', input.owner_id || null);
    return roomModel.findById(id) as RoomPublic;
  },

  findById: (id: string): RoomPublic | null => {
    const stmt = db.prepare(`SELECT * FROM rooms WHERE id = ?`);
    const room = stmt.get(id) as Room | undefined;
    if (!room) return null;
    return {
      ...room,
      is_locked: Boolean(room.is_locked),
    };
  },

  findByName: (name: string): RoomPublic | null => {
    const stmt = db.prepare(`SELECT * FROM rooms WHERE LOWER(name) = LOWER(?)`);
    const room = stmt.get(name) as Room | undefined;
    if (!room) return null;
    return {
      ...room,
      is_locked: Boolean(room.is_locked),
    };
  },

  getAll: (type?: 'public' | 'private' | 'dm'): RoomPublic[] => {
    let query = 'SELECT * FROM rooms';
    const params: string[] = [];
    
    if (type) {
      query += ' WHERE type = ?';
      params.push(type);
    }
    
    const stmt = db.prepare(query);
    const rooms = (params.length ? stmt.all(...params) : stmt.all()) as Room[];
    return rooms.map(room => ({
      ...room,
      is_locked: Boolean(room.is_locked),
    }));
  },

  getPublicRooms: (): RoomPublic[] => {
    return roomModel.getAll('public');
  },

  update: (id: string, updates: Partial<Pick<Room, 'name' | 'topic' | 'is_locked'>>): RoomPublic | null => {
    const setters: string[] = [];
    const values: unknown[] = [];

    if (updates.name !== undefined) {
      setters.push('name = ?');
      values.push(updates.name);
    }
    if (updates.topic !== undefined) {
      setters.push('topic = ?');
      values.push(updates.topic);
    }
    if (updates.is_locked !== undefined) {
      setters.push('is_locked = ?');
      values.push(updates.is_locked ? 1 : 0);
    }

    if (setters.length === 0) return roomModel.findById(id);

    setters.push('updated_at = datetime("now")');
    values.push(id);

    const stmt = db.prepare(`UPDATE rooms SET ${setters.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    return roomModel.findById(id);
  },

  delete: (id: string): boolean => {
    const stmt = db.prepare('DELETE FROM rooms WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  },

  // Get or create DM room between two users
  getOrCreateDM: (userId1: string, userId2: string): RoomPublic => {
    const dmName = [userId1, userId2].sort().join('__DM__');
    
    let room = roomModel.findByName(dmName);
    if (!room) {
      room = roomModel.create({
        name: dmName,
        type: 'dm',
        topic: 'Direct message',
      });
      
      // Add both users as members
      const memberStmt = db.prepare(`
        INSERT INTO room_members (room_id, user_id, role) VALUES (?, ?, 'member')
      `);
      memberStmt.run(room.id, userId1);
      memberStmt.run(room.id, userId2);
    }
    
    return room;
  },

  // Add a member to a room
  addMember: (roomId: string, userId: string, role: 'member' | 'host' | 'owner' = 'member'): void => {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO room_members (room_id, user_id, role)
      VALUES (?, ?, ?)
    `);
    stmt.run(roomId, userId, role);
  },

  // Remove a member from a room
  removeMember: (roomId: string, userId: string): boolean => {
    const stmt = db.prepare('DELETE FROM room_members WHERE room_id = ? AND user_id = ?');
    const result = stmt.run(roomId, userId);
    return result.changes > 0;
  },

  // Get room members
  getMembers: (roomId: string): Array<{ user_id: string; role: string }> => {
    const stmt = db.prepare('SELECT user_id, role FROM room_members WHERE room_id = ?');
    return stmt.all(roomId) as Array<{ user_id: string; role: string }>;
  },

  // Check if user is member of room
  isMember: (roomId: string, userId: string): boolean => {
    const stmt = db.prepare('SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?');
    return stmt.get(roomId, userId) !== undefined;
  },
};
