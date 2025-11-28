import request from 'supertest';
import { app } from '../index';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../utils/password';

const prisma = new PrismaClient();

// Set test environment
process.env.JWT_SECRET = 'test-secret-key';

describe('Auth API', () => {
  const testUser = {
    username: 'testuser',
    email: 'test@test.com',
    password: 'testpassword123',
    fullName: 'Test User',
  };

  beforeEach(async () => {
    // Clean up test data
    await prisma.reaction.deleteMany();
    await prisma.messageRead.deleteMany();
    await prisma.attachment.deleteMany();
    await prisma.message.deleteMany();
    await prisma.roomMember.deleteMany();
    await prisma.room.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user and return token', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(testUser)
        .expect(201);

      expect(res.body.token).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.username).toBe(testUser.username);
      expect(res.body.user.email).toBe(testUser.email);
      expect(res.body.user.fullName).toBe(testUser.fullName);
      expect(res.body.user.isAdmin).toBe(false);
      expect(res.body.user.password).toBeUndefined();
    });

    it('should fail if username already exists', async () => {
      // Create user first
      await prisma.user.create({
        data: {
          username: testUser.username,
          email: 'other@test.com',
          password: await hashPassword(testUser.password),
          fullName: testUser.fullName,
        },
      });

      const res = await request(app)
        .post('/api/auth/register')
        .send(testUser)
        .expect(409);

      expect(res.body.error).toBeDefined();
    });

    it('should fail if required fields are missing', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'test' })
        .expect(400);

      expect(res.body.error).toBeDefined();
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Create test user
      await prisma.user.create({
        data: {
          username: testUser.username,
          email: testUser.email,
          password: await hashPassword(testUser.password),
          fullName: testUser.fullName,
        },
      });
    });

    it('should login and return token', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          username: testUser.username,
          password: testUser.password,
        })
        .expect(200);

      expect(res.body.token).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.username).toBe(testUser.username);
    });

    it('should fail with invalid password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          username: testUser.username,
          password: 'wrongpassword',
        })
        .expect(401);

      expect(res.body.error).toBeDefined();
    });

    it('should fail with non-existent username', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'nonexistent',
          password: 'password',
        })
        .expect(401);

      expect(res.body.error).toBeDefined();
    });
  });

  describe('GET /api/auth/me', () => {
    let token: string;

    beforeEach(async () => {
      // Create and login user
      await prisma.user.create({
        data: {
          username: testUser.username,
          email: testUser.email,
          password: await hashPassword(testUser.password),
          fullName: testUser.fullName,
        },
      });

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          username: testUser.username,
          password: testUser.password,
        });

      token = loginRes.body.token;
    });

    it('should return current user with valid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.username).toBe(testUser.username);
      expect(res.body.email).toBe(testUser.email);
    });

    it('should fail without token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expect(res.body.error).toBeDefined();
    });

    it('should fail with invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(res.body.error).toBeDefined();
    });
  });
});
