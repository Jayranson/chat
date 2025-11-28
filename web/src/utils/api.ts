const API_URL = import.meta.env.VITE_API_URL || '';

interface FetchOptions extends RequestInit {
  body?: string;
}

async function fetchWithAuth(url: string, options: FetchOptions = {}): Promise<Response> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return fetch(`${API_URL}${url}`, {
    ...options,
    headers,
  });
}

export const api = {
  auth: {
    async register(data: { username: string; email: string; password: string; fullName: string }) {
      const res = await fetchWithAuth('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.json();
    },

    async login(data: { username: string; password: string }) {
      const res = await fetchWithAuth('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.json();
    },

    async me() {
      const res = await fetchWithAuth('/api/auth/me');
      if (!res.ok) throw new Error('Not authenticated');
      return res.json();
    },
  },

  rooms: {
    async list() {
      const res = await fetchWithAuth('/api/rooms');
      return res.json();
    },

    async create(data: { name: string; topic?: string; isPrivate?: boolean }) {
      const res = await fetchWithAuth('/api/rooms', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.json();
    },

    async getMessages(roomId: string, page = 1, limit = 50) {
      const res = await fetchWithAuth(`/api/rooms/${roomId}/messages?page=${page}&limit=${limit}`);
      return res.json();
    },

    async join(roomId: string) {
      const res = await fetchWithAuth(`/api/rooms/${roomId}/join`, { method: 'POST' });
      return res.json();
    },
  },

  messages: {
    async markRead(messageIds: string[]) {
      const res = await fetchWithAuth('/api/messages/mark-read', {
        method: 'POST',
        body: JSON.stringify({ messageIds }),
      });
      return res.json();
    },

    async toggleReaction(messageId: string, emoji: string) {
      const res = await fetchWithAuth(`/api/messages/${messageId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      });
      return res.json();
    },
  },

  uploads: {
    async upload(file: File) {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_URL}/api/uploads`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });
      return res.json();
    },
  },
};
