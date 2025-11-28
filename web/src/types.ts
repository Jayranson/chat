export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  isAdmin: boolean;
  about: string;
  createdAt: string;
}

export interface Room {
  id: string;
  name: string;
  topic: string;
  isPrivate: boolean;
  owner: {
    id: string;
    username: string;
  };
  memberCount: number;
  createdAt: string;
}

export interface Message {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    username: string;
    isAdmin: boolean;
  };
  roomId: string;
  reactions: Reaction[];
  attachments: Attachment[];
  readBy: ReadReceipt[];
}

export interface Reaction {
  id: string;
  emoji: string;
  user: {
    id: string;
    username: string;
  };
}

export interface Attachment {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
}

export interface ReadReceipt {
  userId: string;
  readAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface TypingUpdate {
  roomId: string;
  users: string[];
}
