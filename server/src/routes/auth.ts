import { Router, Response } from 'express';
import { z } from 'zod';
import { userModel } from '../models/user.js';
import { generateToken } from '../utils/jwt.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// Validation schemas
const registerSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  email: z.string().email(),
  password: z.string().min(6),
  full_name: z.string().max(100).optional(),
});

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

// POST /api/auth/register
router.post('/register', async (req, res: Response) => {
  try {
    const body = registerSchema.parse(req.body);
    
    // Check if username exists
    if (userModel.findByUsername(body.username)) {
      res.status(400).json({ error: 'Username already exists' });
      return;
    }
    
    // Check if email exists
    if (userModel.findByEmail(body.email)) {
      res.status(400).json({ error: 'Email already exists' });
      return;
    }
    
    // Create user
    const user = await userModel.create({
      username: body.username,
      email: body.email,
      password: body.password,
      full_name: body.full_name,
    });
    
    // Generate token
    const token = generateToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });
    
    res.status(201).json({
      token,
      user,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res: Response) => {
  try {
    const body = loginSchema.parse(req.body);
    
    // Find user
    const user = userModel.findByUsername(body.username);
    if (!user) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }
    
    // Check if banned
    if (user.is_banned) {
      res.status(403).json({ error: 'Account is banned' });
      return;
    }
    
    // Validate password
    const isValid = await userModel.validatePassword(user, body.password);
    if (!isValid) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }
    
    // Generate token
    const token = generateToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });
    
    // Get public user data
    const publicUser = userModel.findById(user.id);
    
    res.json({
      token,
      user: publicUser,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    
    const user = userModel.findById(req.user.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    
    res.json(user);
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
