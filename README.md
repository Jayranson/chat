# Chat Application

A full-featured real-time chat application with user authentication, persistent messages, WebSocket-based real-time communication, and a React frontend.

## Features

- **User Authentication**: Registration and login with JWT tokens (7-day expiry)
- **Persistent Messages**: SQLite database with Prisma ORM
- **Real-time Messaging**: Socket.io for instant message delivery
- **Typing Indicators**: See when other users are typing
- **Read Receipts**: Track message read status
- **Message Reactions**: React to messages with emojis
- **File/Image Uploads**: Upload images (jpg, jpeg, png, gif, webp up to 5MB)
- **Room/Channel Support**: Create and join public chat rooms
- **Group Chat**: Multiple users in the same room

## Tech Stack

- **Backend**: Express.js + TypeScript + Socket.io
- **Database**: SQLite with Prisma ORM
- **Authentication**: bcrypt for password hashing, JWT for tokens
- **Frontend**: React + TypeScript + Vite
- **Real-time**: socket.io-client

## Project Structure

```
chat/
├── server/                 # Backend server
│   ├── src/
│   │   ├── index.ts       # Main server entry
│   │   ├── routes.ts      # REST API routes
│   │   ├── socket.ts      # Socket.io handlers
│   │   ├── auth.ts        # Authentication utilities
│   │   └── types.ts       # TypeScript types
│   ├── prisma/
│   │   ├── schema.prisma  # Database schema
│   │   └── seed.ts        # Database seeding
│   └── e2e/               # Playwright E2E tests
├── web/                    # React frontend
│   ├── src/
│   │   ├── App.tsx        # Main app component
│   │   ├── api.ts         # API utilities
│   │   ├── types.ts       # TypeScript types
│   │   └── pages/         # Page components
│   └── public/
├── uploads/                # Uploaded files
└── .github/workflows/     # CI configuration
```

## Environment Variables

Create a `.env` file in the `server/` directory:

```env
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# Database
DATABASE_URL=file:./dev.db

# Server
PORT=4000

# Uploads
UPLOADS_DIR=../uploads
MAX_FILE_SIZE=5242880
```

## Setup & Installation

### Prerequisites

- Node.js 18+
- npm

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd chat
   ```

2. Install dependencies:
   ```bash
   npm run install:all
   ```

3. Set up the database:
   ```bash
   npm run db:migrate
   ```

4. (Optional) Seed the database with sample data:
   ```bash
   npm run db:seed
   ```

## Running Locally

### Development Mode

Start both server and frontend in development mode:
```bash
npm run dev
```

Or run them separately:
```bash
# Terminal 1 - Server
npm run dev:server

# Terminal 2 - Frontend
npm run dev:web
```

### Production Build

Build both server and frontend:
```bash
npm run build
```

Start the production server:
```bash
npm start
```

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user (protected)

### Rooms

- `POST /api/rooms` - Create a room (protected)
- `GET /api/rooms` - List rooms (protected)
- `GET /api/rooms/:id/messages` - Get room messages with pagination

### Messages

- `POST /api/messages/mark-read` - Mark messages as read
- `POST /api/messages/:id/reactions` - Add/remove reaction

### Uploads

- `POST /api/uploads` - Upload an image file

## Socket.io Events

### Client → Server

- `room.join` - Join a room
- `room.leave` - Leave current room
- `message.send` - Send a message
- `typing.start` - Start typing indicator
- `typing.stop` - Stop typing indicator
- `message.read` - Mark messages as read
- `reaction.add` - Add reaction to message
- `reaction.remove` - Remove reaction from message

### Server → Client

- `room.joined` - Successfully joined room
- `room.users` - Updated user list for room
- `message.receive` - New message received
- `user.joined` - User joined room
- `user.left` - User left room
- `typing.start` - User started typing
- `typing.stop` - User stopped typing
- `reaction.add` - Reaction added to message
- `reaction.remove` - Reaction removed from message
- `message.read` - Messages marked as read

## Testing

### Unit & Integration Tests

```bash
npm test
```

### E2E Tests

```bash
npm run e2e
```

## Linting & Formatting

```bash
# Lint all code
npm run lint

# Format all code
npm run format

# Type checking
npm run typecheck
```

## CI/CD

The project includes a GitHub Actions workflow that runs:
1. Linting and type checking
2. Building server and frontend
3. Running unit and integration tests
4. Running Playwright E2E tests

## Default Users (after seeding)

| Username | Password     | Role  |
|----------|--------------|-------|
| admin    | admin123     | admin |
| alice    | password123  | user  |
| bob      | password123  | user  |

## License

MIT
