export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  about: string;
  role: string;
}

export interface Room {
  id: string;
  name: string;
  type: string;
  topic: string | null;
  isLocked: boolean;
  owner?: { id: string; username: string };
  _count?: { members: number; messages: number };
}

export interface Message {
  id: string;
  content: string;
  type: string;
  userId: string;
  roomId: string;
  createdAt: string;
  isDeleted: boolean;
  isEdited: boolean;
  user: {
    id: string;
    username: string;
    role: string;
  };
  reactions: Reaction[];
}

export interface Reaction {
  id: string;
  emoji: string;
  userId: string;
  user?: { id: string; username: string };
}

export interface OnlineUser {
  id: string;
  username: string;
  role: string;
  currentRoom: string | null;
  typing: boolean;
  status: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}
