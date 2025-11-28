import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import db from '../db/database.js';

const router = Router();

// Allowed file types
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_FILE_TYPES = [...ALLOWED_IMAGE_TYPES, 'application/pdf', 'text/plain', 'application/json'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Ensure uploads directory exists
const uploadsDir = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueId = uuidv4();
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uniqueId}${ext}`);
  },
});

// File filter
const fileFilter = (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (ALLOWED_FILE_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
});

// POST /api/uploads - Upload a file
router.post('/', authMiddleware, upload.single('file'), (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    
    const { filename, originalname, mimetype, size } = req.file;
    const id = uuidv4();
    const url = `/uploads/${filename}`;
    
    // Store in database
    const stmt = db.prepare(`
      INSERT INTO attachments (id, user_id, filename, original_name, mime_type, size, url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, req.user.userId, filename, originalname, mimetype, size, url);
    
    res.status(201).json({
      id,
      filename,
      original_name: originalname,
      mime_type: mimetype,
      size,
      url,
      is_image: ALLOWED_IMAGE_TYPES.includes(mimetype),
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/uploads/:filename - Get upload info
router.get('/:filename', (req, res: Response) => {
  try {
    const stmt = db.prepare('SELECT * FROM attachments WHERE filename = ?');
    const attachment = stmt.get(req.params.filename);
    
    if (!attachment) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    
    res.json(attachment);
  } catch (error) {
    console.error('Get upload error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Error handling for multer
router.use((err: Error, _req: AuthenticatedRequest, res: Response, _next: () => void) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
      return;
    }
    res.status(400).json({ error: err.message });
    return;
  }
  if (err.message.includes('not allowed')) {
    res.status(400).json({ error: err.message });
    return;
  }
  console.error('Upload middleware error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default router;
