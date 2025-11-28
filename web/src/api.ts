import { AuthResponse, Room, Message, User } from './types';

const API_URL = '/api';

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function register(
  username: string,
  email: string,
  password: string,
  fullName: string
): Promise<AuthResponse> {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password, fullName }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Registration failed');
  }

  return response.json();
}

export async function login(username: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Login failed');
  }

  return response.json();
}

export async function getCurrentUser(): Promise<User> {
  const response = await fetch(`${API_URL}/auth/me`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to get current user');
  }

  const data = await response.json();
  return data.user;
}

export async function getRooms(): Promise<Room[]> {
  const response = await fetch(`${API_URL}/rooms`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to get rooms');
  }

  const data = await response.json();
  return data.rooms;
}

export async function createRoom(name: string, topic?: string): Promise<Room> {
  const response = await fetch(`${API_URL}/rooms`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ name, topic }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create room');
  }

  const data = await response.json();
  return data.room;
}

export async function getRoomMessages(
  roomId: string,
  page = 1,
  limit = 50
): Promise<{ messages: Message[]; pagination: { page: number; pages: number } }> {
  const response = await fetch(`${API_URL}/rooms/${roomId}/messages?page=${page}&limit=${limit}`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to get messages');
  }

  return response.json();
}

export async function markMessagesRead(messageIds: string[]): Promise<void> {
  await fetch(`${API_URL}/messages/mark-read`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ messageIds }),
  });
}

export async function toggleReaction(
  messageId: string,
  emoji: string
): Promise<{ action: string }> {
  const response = await fetch(`${API_URL}/messages/${messageId}/reactions`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ emoji }),
  });

  if (!response.ok) {
    throw new Error('Failed to toggle reaction');
  }

  return response.json();
}

export async function uploadFile(file: File): Promise<{ path: string; filename: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const token = localStorage.getItem('token');
  const response = await fetch(`${API_URL}/uploads`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Failed to upload file');
  }

  return response.json();
}
