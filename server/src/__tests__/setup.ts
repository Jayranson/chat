import { beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';

// Use in-memory or test database
const testDbPath = path.join(process.cwd(), 'data', 'test-chat.db');

beforeAll(() => {
  // Set test environment
  process.env.DB_PATH = testDbPath;
  process.env.JWT_SECRET = 'test-secret-key';
});

afterAll(() => {
  // Clean up test database
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});
