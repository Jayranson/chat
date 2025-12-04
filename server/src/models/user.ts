import db from '../db/database.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

export interface User {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  full_name: string;
  about: string;
  role: 'admin' | 'user';
  is_banned: number;
  is_globally_muted: number;
  created_at: string;
  updated_at: string;
}

export interface UserPublic {
  id: string;
  username: string;
  email: string;
  full_name: string;
  about: string;
  role: 'admin' | 'user';
  is_banned: boolean;
  is_globally_muted: boolean;
  created_at: string;
}

export interface CreateUserInput {
  username: string;
  email: string;
  password: string;
  full_name?: string;
}

const SALT_ROUNDS = 10;

export const userModel = {
  create: async (input: CreateUserInput): Promise<UserPublic> => {
    const id = uuidv4();
    const password_hash = await bcrypt.hash(input.password, SALT_ROUNDS);
    
    const stmt = db.prepare(`
      INSERT INTO users (id, username, email, password_hash, full_name)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run(id, input.username, input.email.toLowerCase(), password_hash, input.full_name || '');
    
    return userModel.findById(id) as UserPublic;
  },

  findById: (id: string): UserPublic | null => {
    const stmt = db.prepare(`
      SELECT id, username, email, full_name, about, role, is_banned, is_globally_muted, created_at
      FROM users WHERE id = ?
    `);
    const user = stmt.get(id) as User | undefined;
    if (!user) return null;
    return {
      ...user,
      is_banned: Boolean(user.is_banned),
      is_globally_muted: Boolean(user.is_globally_muted),
    };
  },

  findByUsername: (username: string): User | null => {
    const stmt = db.prepare(`SELECT * FROM users WHERE LOWER(username) = LOWER(?)`);
    return stmt.get(username) as User | null;
  },

  findByEmail: (email: string): User | null => {
    const stmt = db.prepare(`SELECT * FROM users WHERE LOWER(email) = LOWER(?)`);
    return stmt.get(email) as User | null;
  },

  validatePassword: async (user: User, password: string): Promise<boolean> => {
    return bcrypt.compare(password, user.password_hash);
  },

  getAll: (): UserPublic[] => {
    const stmt = db.prepare(`
      SELECT id, username, email, full_name, about, role, is_banned, is_globally_muted, created_at
      FROM users
    `);
    const users = stmt.all() as User[];
    return users.map(user => ({
      ...user,
      is_banned: Boolean(user.is_banned),
      is_globally_muted: Boolean(user.is_globally_muted),
    }));
  },

  update: (id: string, updates: Partial<Pick<User, 'full_name' | 'about' | 'role' | 'is_banned' | 'is_globally_muted'>>): UserPublic | null => {
    const setters: string[] = [];
    const values: unknown[] = [];

    if (updates.full_name !== undefined) {
      setters.push('full_name = ?');
      values.push(updates.full_name);
    }
    if (updates.about !== undefined) {
      setters.push('about = ?');
      values.push(updates.about);
    }
    if (updates.role !== undefined) {
      setters.push('role = ?');
      values.push(updates.role);
    }
    if (updates.is_banned !== undefined) {
      setters.push('is_banned = ?');
      values.push(updates.is_banned ? 1 : 0);
    }
    if (updates.is_globally_muted !== undefined) {
      setters.push('is_globally_muted = ?');
      values.push(updates.is_globally_muted ? 1 : 0);
    }

    if (setters.length === 0) return userModel.findById(id);

    setters.push('updated_at = datetime("now")');
    values.push(id);

    const stmt = db.prepare(`UPDATE users SET ${setters.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    return userModel.findById(id);
  },

  delete: (id: string): boolean => {
    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  },

  count: (): number => {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM users');
    const result = stmt.get() as { count: number };
    return result.count;
  },
};
