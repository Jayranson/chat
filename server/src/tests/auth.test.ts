import { hashPassword, comparePassword, generateToken, verifyToken } from '../auth';

describe('Auth utilities', () => {
  describe('Password hashing', () => {
    it('should hash a password', async () => {
      const password = 'testPassword123';
      const hash = await hashPassword(password);
      
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should verify correct password', async () => {
      const password = 'testPassword123';
      const hash = await hashPassword(password);
      
      const isValid = await comparePassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'testPassword123';
      const wrongPassword = 'wrongPassword';
      const hash = await hashPassword(password);
      
      const isValid = await comparePassword(wrongPassword, hash);
      expect(isValid).toBe(false);
    });
  });

  describe('JWT tokens', () => {
    const payload = {
      userId: 'test-user-id',
      username: 'testuser',
      role: 'user',
    };

    it('should generate a valid token', () => {
      const token = generateToken(payload);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should verify a valid token', () => {
      const token = generateToken(payload);
      const decoded = verifyToken(token);
      
      expect(decoded).toBeDefined();
      expect(decoded?.userId).toBe(payload.userId);
      expect(decoded?.username).toBe(payload.username);
      expect(decoded?.role).toBe(payload.role);
    });

    it('should return null for invalid token', () => {
      const decoded = verifyToken('invalid-token');
      expect(decoded).toBeNull();
    });

    it('should return null for tampered token', () => {
      const token = generateToken(payload);
      const tamperedToken = token.slice(0, -5) + 'xxxxx';
      
      const decoded = verifyToken(tamperedToken);
      expect(decoded).toBeNull();
    });
  });
});
