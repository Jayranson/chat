import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import path from 'path';
import authRoutes from './routes/auth';
import roomRoutes from './routes/rooms';
import messageRoutes from './routes/messages';
import uploadRoutes from './routes/uploads';
import { setupSocketIO } from './services/socket';

const app = express();
const httpServer = createServer(app);

const PORT = parseInt(process.env.PORT || '4000', 10);
const UPLOADS_DIR = process.env.UPLOADS_DIR || './uploads';

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'http://localhost:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  credentials: true,
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files for uploads
app.use('/uploads', express.static(path.resolve(UPLOADS_DIR)));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/uploads', uploadRoutes);

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Setup Socket.IO
const io = setupSocketIO(httpServer);

// Export for testing
export { app, httpServer, io };

// Start server if this is the main module
if (require.main === module) {
  httpServer.listen(PORT, () => {
    console.log(`🚀 Chat server running on port ${PORT}`);
    console.log(`   API: http://localhost:${PORT}/api`);
    console.log(`   Socket.IO: ws://localhost:${PORT}`);
  });
}
