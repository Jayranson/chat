import { test, expect } from '@playwright/test';

test.describe('Chat Application E2E Tests', () => {
  const adminUser = { username: 'admin', password: 'admin123' };
  const regularUser = { username: 'alice', password: 'user123' };

  test.beforeEach(async ({ page }) => {
    // Clear local storage before each test
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
  });

  test('should display login page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Welcome Back')).toBeVisible();
    await expect(page.getByPlaceholder('username')).toBeVisible();
    await expect(page.getByPlaceholder('••••••••')).toBeVisible();
  });

  test('should register a new user', async ({ page }) => {
    const timestamp = Date.now();
    const newUser = {
      username: `testuser${timestamp}`,
      email: `test${timestamp}@example.com`,
      password: 'password123',
      fullName: 'Test User',
    };

    await page.goto('/');
    
    // Click to switch to register
    await page.getByText("Don't have an account? Create one").click();
    await expect(page.getByText('Create Account')).toBeVisible();

    // Fill in registration form
    await page.getByPlaceholder('John Doe').fill(newUser.fullName);
    await page.getByPlaceholder('john@example.com').fill(newUser.email);
    await page.getByPlaceholder('username').fill(newUser.username);
    await page.getByPlaceholder('••••••••').fill(newUser.password);

    // Submit
    await page.getByRole('button', { name: 'Create Account' }).click();

    // Should see rooms list
    await expect(page.getByText('Chat Rooms')).toBeVisible({ timeout: 10000 });
  });

  test('should login with valid credentials', async ({ page }) => {
    await page.goto('/');

    // Fill in login form
    await page.getByPlaceholder('username').fill(regularUser.username);
    await page.getByPlaceholder('••••••••').fill(regularUser.password);

    // Submit
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Should see rooms list
    await expect(page.getByText('Chat Rooms')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(`Welcome, ${regularUser.username}`)).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/');

    // Fill in login form with wrong password
    await page.getByPlaceholder('username').fill('wronguser');
    await page.getByPlaceholder('••••••••').fill('wrongpassword');

    // Submit
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Should see error
    await expect(page.getByText('Invalid credentials')).toBeVisible({ timeout: 5000 });
  });

  test('admin should login and see Admin badge', async ({ page }) => {
    await page.goto('/');

    // Login as admin
    await page.getByPlaceholder('username').fill(adminUser.username);
    await page.getByPlaceholder('••••••••').fill(adminUser.password);
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Should see rooms list with Admin badge
    await expect(page.getByText('Chat Rooms')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Admin')).toBeVisible();
  });

  test('should join a room and send messages', async ({ page }) => {
    await page.goto('/');

    // Login
    await page.getByPlaceholder('username').fill(regularUser.username);
    await page.getByPlaceholder('••••••••').fill(regularUser.password);
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Wait for rooms list
    await expect(page.getByText('Chat Rooms')).toBeVisible({ timeout: 10000 });

    // Click on general room
    await page.getByText('#general').click();

    // Wait for chat room to load
    await expect(page.getByPlaceholder('Type a message...')).toBeVisible({ timeout: 10000 });

    // Send a message
    const testMessage = `Test message ${Date.now()}`;
    await page.getByPlaceholder('Type a message...').fill(testMessage);
    await page.getByRole('button', { name: 'Send' }).click();

    // Verify message appears
    await expect(page.getByText(testMessage)).toBeVisible({ timeout: 5000 });
  });

  test('should create a new room', async ({ page }) => {
    await page.goto('/');

    // Login
    await page.getByPlaceholder('username').fill(regularUser.username);
    await page.getByPlaceholder('••••••••').fill(regularUser.password);
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Wait for rooms list
    await expect(page.getByText('Chat Rooms')).toBeVisible({ timeout: 10000 });

    // Click create room
    await page.getByRole('button', { name: '+ Create Room' }).click();

    // Fill in room details
    const roomName = `testroom${Date.now()}`;
    await page.getByPlaceholder('Room name').fill(roomName);
    await page.getByPlaceholder('Topic (optional)').fill('A test room');

    // Create room
    await page.getByRole('button', { name: 'Create' }).click();

    // Verify room appears in list
    await expect(page.getByText(`#${roomName}`)).toBeVisible({ timeout: 5000 });
  });

  test('should logout successfully', async ({ page }) => {
    await page.goto('/');

    // Login
    await page.getByPlaceholder('username').fill(regularUser.username);
    await page.getByPlaceholder('••••••••').fill(regularUser.password);
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Wait for rooms list
    await expect(page.getByText('Chat Rooms')).toBeVisible({ timeout: 10000 });

    // Click logout
    await page.getByRole('button', { name: 'Logout' }).click();

    // Should be back at login page
    await expect(page.getByText('Welcome Back')).toBeVisible();
  });
});

test.describe('File Upload Tests', () => {
  const adminUser = { username: 'admin', password: 'admin123' };
  const regularUser = { username: 'alice', password: 'user123' };

  test('regular user can only upload images', async ({ page }) => {
    await page.goto('/');

    // Login as regular user
    await page.getByPlaceholder('username').fill(regularUser.username);
    await page.getByPlaceholder('••••••••').fill(regularUser.password);
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Wait for rooms list and join general
    await expect(page.getByText('Chat Rooms')).toBeVisible({ timeout: 10000 });
    await page.getByText('#general').click();

    // Wait for chat room
    await expect(page.getByPlaceholder('Type a message...')).toBeVisible({ timeout: 10000 });

    // The file input should have image-only accept attribute for regular users
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toHaveAttribute('accept', 'image/jpeg,image/jpg,image/png,image/gif,image/webp');
  });

  test('admin can upload any file type', async ({ page }) => {
    await page.goto('/');

    // Login as admin
    await page.getByPlaceholder('username').fill(adminUser.username);
    await page.getByPlaceholder('••••••••').fill(adminUser.password);
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Wait for rooms list and join general
    await expect(page.getByText('Chat Rooms')).toBeVisible({ timeout: 10000 });
    await page.getByText('#general').click();

    // Wait for chat room
    await expect(page.getByPlaceholder('Type a message...')).toBeVisible({ timeout: 10000 });

    // The file input should accept all files for admin users
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toHaveAttribute('accept', '*');
  });
});
