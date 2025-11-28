import { describe, it, expect } from 'vitest';
import { generateToken, verifyToken, decodeToken } from '../utils/jwt.js';

describe('JWT Utils', () => {
  const testPayload = {
    userId: 'test-user-id',
    username: 'testuser',
    role: 'user' as const,
  };

  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const token = generateToken(testPayload);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });
  });

  describe('verifyToken', () => {
    it('should verify and return payload for valid token', () => {
      const token = generateToken(testPayload);
      const payload = verifyToken(token);
      
      expect(payload).toBeDefined();
      expect(payload?.userId).toBe(testPayload.userId);
      expect(payload?.username).toBe(testPayload.username);
      expect(payload?.role).toBe(testPayload.role);
    });

    it('should return null for invalid token', () => {
      const payload = verifyToken('invalid-token');
      expect(payload).toBeNull();
    });

    it('should return null for malformed token', () => {
      const payload = verifyToken('not.a.valid.jwt.token');
      expect(payload).toBeNull();
    });
  });

  describe('decodeToken', () => {
    it('should decode token without verification', () => {
      const token = generateToken(testPayload);
      const payload = decodeToken(token);
      
      expect(payload).toBeDefined();
      expect(payload?.userId).toBe(testPayload.userId);
    });

    it('should return null for invalid token', () => {
      const payload = decodeToken('invalid');
      expect(payload).toBeNull();
    });
  });
});
