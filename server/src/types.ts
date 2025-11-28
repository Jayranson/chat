import { Request } from 'express';
import { Socket } from 'socket.io';

export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  about: string;
  role: string;
  createdAt: Date;
}

export interface Room {
  id: string;
  name: string;
  type: string;
  topic: string | null;
  isLocked: boolean;
  ownerId: string | null;
}

export interface Message {
  id: string;
  content: string;
  type: string;
  isDeleted: boolean;
  isEdited: boolean;
  userId: string;
  roomId: string;
  createdAt: Date;
}

export interface JwtPayload {
  userId: string;
  username: string;
  role: string;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export interface AuthenticatedSocket extends Socket {
  user?: JwtPayload;
}

export interface RegisterDto {
  username: string;
  email: string;
  password: string;
  fullName: string;
}

export interface LoginDto {
  username: string;
  password: string;
}

export interface CreateRoomDto {
  name: string;
  topic?: string;
  type?: string;
}

export interface SendMessageDto {
  roomId: string;
  content: string;
  type?: string;
}

export interface MarkReadDto {
  messageIds: string[];
}

export interface ReactionDto {
  emoji: string;
}

export interface OnlineUser {
  id: string;
  username: string;
  role: string;
  currentRoom: string | null;
  typing: boolean;
  status: 'online' | 'away' | 'dnd';
}
