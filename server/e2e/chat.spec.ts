import { test, expect } from '@playwright/test';

test.describe('Chat Application E2E', () => {
  const user1 = { username: 'e2e_alice', email: 'e2e_alice@test.com', password: 'password123', fullName: 'E2E Alice' };
  const user2 = { username: 'e2e_bob', email: 'e2e_bob@test.com', password: 'password123', fullName: 'E2E Bob' };

  test('should allow two users to register and exchange messages', async ({ page, context }) => {
    // Register user 1
    const response1 = await page.request.post('/api/auth/register', {
      data: user1,
    });
    expect(response1.ok()).toBeTruthy();
    const data1 = await response1.json();
    const token1 = data1.token;
    expect(token1).toBeDefined();

    // Register user 2
    const response2 = await page.request.post('/api/auth/register', {
      data: user2,
    });
    expect(response2.ok()).toBeTruthy();
    const data2 = await response2.json();
    const token2 = data2.token;
    expect(token2).toBeDefined();

    // Create a room with user 1
    const roomResponse = await page.request.post('/api/rooms', {
      headers: { Authorization: `Bearer ${token1}` },
      data: { name: 'e2e-test-room', topic: 'E2E Test Room' },
    });
    expect(roomResponse.ok()).toBeTruthy();
    const roomData = await roomResponse.json();
    const roomId = roomData.room.id;

    // Get rooms for user 2 (should include public room)
    const roomsResponse = await page.request.get('/api/rooms', {
      headers: { Authorization: `Bearer ${token2}` },
    });
    expect(roomsResponse.ok()).toBeTruthy();
    const roomsData = await roomsResponse.json();
    expect(roomsData.rooms.some((r: { name: string }) => r.name === 'e2e-test-room')).toBeTruthy();

    // Verify both users can see the room
    expect(roomId).toBeDefined();
    expect(roomData.room.name).toBe('e2e-test-room');
  });

  test('should authenticate and return user info', async ({ page }) => {
    // Login as user 1 (created in previous test)
    const loginResponse = await page.request.post('/api/auth/login', {
      data: { username: user1.username, password: user1.password },
    });
    
    // If user doesn't exist yet, register first
    if (!loginResponse.ok()) {
      await page.request.post('/api/auth/register', { data: user1 });
    }
    
    const response = await page.request.post('/api/auth/login', {
      data: { username: user1.username, password: user1.password },
    });
    
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.token).toBeDefined();
    expect(data.user.username).toBe(user1.username);

    // Get current user
    const meResponse = await page.request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${data.token}` },
    });
    expect(meResponse.ok()).toBeTruthy();
    const meData = await meResponse.json();
    expect(meData.user.username).toBe(user1.username);
  });

  test('health endpoint should be accessible', async ({ page }) => {
    const response = await page.request.get('/health');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.status).toBe('ok');
  });
});
