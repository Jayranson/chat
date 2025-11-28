import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import express from 'express';
import { router } from '../routes';
import { hashPassword, generateToken } from '../auth';

const prisma = new PrismaClient();
const app = express();
app.use(express.json());
app.use('/api', router);

describe('REST API', () => {
  let testUser: { id: string; username: string; token: string };

  beforeAll(async () => {
    // Create a test user
    const passwordHash = await hashPassword('testpass123');
    const user = await prisma.user.create({
      data: {
        username: 'testuser',
        email: 'test@test.com',
        passwordHash,
        fullName: 'Test User',
      },
    });

    const token = generateToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    testUser = { id: user.id, username: user.username, token };
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'newuser',
          email: 'newuser@test.com',
          password: 'password123',
          fullName: 'New User',
        });

      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.username).toBe('newuser');
    });

    it('should reject duplicate username', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser',
          email: 'another@test.com',
          password: 'password123',
          fullName: 'Another User',
        });

      expect(res.status).toBe(409);
    });

    it('should reject missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'incomplete',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'testpass123',
        });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.username).toBe('testuser');
    });

    it('should reject invalid password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'wrongpassword',
        });

      expect(res.status).toBe(401);
    });

    it('should reject non-existent user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'nonexistent',
          password: 'password123',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user with valid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${testUser.token}`);

      expect(res.status).toBe(200);
      expect(res.body.user.username).toBe('testuser');
    });

    it('should reject without token', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
    });

    it('should reject invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/rooms', () => {
    it('should create a room', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({
          name: 'test-room',
          topic: 'Test room topic',
        });

      expect(res.status).toBe(201);
      expect(res.body.room.name).toBe('test-room');
    });

    it('should reject duplicate room name', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({
          name: 'test-room',
        });

      expect(res.status).toBe(409);
    });
  });

  describe('GET /api/rooms', () => {
    it('should list rooms', async () => {
      const res = await request(app)
        .get('/api/rooms')
        .set('Authorization', `Bearer ${testUser.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.rooms)).toBe(true);
    });
  });

  describe('GET /api/rooms/:id/messages', () => {
    let roomId: string;

    beforeAll(async () => {
      const room = await prisma.room.findUnique({ where: { name: 'test-room' } });
      roomId = room!.id;

      // Create some messages
      await prisma.message.createMany({
        data: [
          { content: 'Message 1', userId: testUser.id, roomId, type: 'user' },
          { content: 'Message 2', userId: testUser.id, roomId, type: 'user' },
        ],
      });
    });

    it('should get messages with pagination', async () => {
      const res = await request(app)
        .get(`/api/rooms/${roomId}/messages`)
        .set('Authorization', `Bearer ${testUser.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.messages)).toBe(true);
      expect(res.body.pagination).toBeDefined();
    });
  });

  describe('POST /api/messages/:id/reactions', () => {
    let messageId: string;

    beforeAll(async () => {
      const message = await prisma.message.findFirst();
      messageId = message!.id;
    });

    it('should add a reaction', async () => {
      const res = await request(app)
        .post(`/api/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({ emoji: '👍' });

      expect(res.status).toBe(201);
      expect(res.body.action).toBe('added');
    });

    it('should remove existing reaction', async () => {
      const res = await request(app)
        .post(`/api/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({ emoji: '👍' });

      expect(res.status).toBe(200);
      expect(res.body.action).toBe('removed');
    });
  });
});
