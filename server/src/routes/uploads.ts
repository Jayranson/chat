import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

const UPLOADS_DIR = process.env.UPLOADS_DIR || './uploads';
const MAX_FILE_SIZE_REGULAR = 5 * 1024 * 1024; // 5MB for regular users
const MAX_FILE_SIZE_ADMIN = 50 * 1024 * 1024; // 50MB for admins

// Allowed image MIME types for regular users
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
];

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Storage configuration
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeName = `${uuidv4()}${ext}`;
    cb(null, safeName);
  },
});

// Create multer instance with max file size (we'll validate further in the route)
const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_ADMIN, // Set to max, we'll check per user
  },
});

// POST /api/uploads - Upload a file
router.post('/', authMiddleware, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

    const userId = req.user!.userId;
    const isAdmin = req.user!.isAdmin;
    const file = req.file;

    // Validate file size based on user role
    const maxSize = isAdmin ? MAX_FILE_SIZE_ADMIN : MAX_FILE_SIZE_REGULAR;
    if (file.size > maxSize) {
      // Delete the uploaded file
      fs.unlinkSync(file.path);
      const maxSizeMB = maxSize / (1024 * 1024);
      res.status(400).json({ error: `File size exceeds ${maxSizeMB}MB limit` });
      return;
    }

    // Validate file type for non-admin users
    if (!isAdmin && !ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      // Delete the uploaded file
      fs.unlinkSync(file.path);
      res.status(400).json({
        error: 'Only image files (jpg, jpeg, png, gif, webp) are allowed for regular users',
      });
      return;
    }

    // Save file metadata to database
    const attachment = await prisma.attachment.create({
      data: {
        filename: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        url: `/uploads/${file.filename}`,
        uploaderId: userId,
      },
    });

    res.status(201).json({
      id: attachment.id,
      filename: attachment.filename,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      size: attachment.size,
      url: attachment.url,
    });
  } catch (error) {
    // Clean up file if there was an error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
