# Chat Application

A full-stack real-time chat application with user authentication, persistent messages, WebSocket communication, typing indicators, read receipts, message reactions, and file uploads.

## Features

- **User Authentication**: JWT-based authentication with bcrypt password hashing
- **Persistent Storage**: SQLite database for users, rooms, messages, and reactions
- **Real-time Messaging**: WebSocket communication using Socket.IO
- **Typing Indicators**: See when other users are typing
- **Read Receipts**: Track message read status
- **Message Reactions**: React to messages with emojis
- **File/Image Uploads**: Share files and images in chat
- **Room/Channel Support**: Create and join public chat rooms

## Tech Stack

### Backend
- Node.js with TypeScript
- Express.js for REST API
- Socket.IO for real-time communication
- better-sqlite3 for database
- JWT for authentication
- bcryptjs for password hashing
- multer for file uploads
- Zod for validation

### Frontend
- React 18 with TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- Socket.IO client

## Project Structure

```
├── server/                 # Backend server
│   ├── src/
│   │   ├── db/            # Database schema and initialization
│   │   ├── middleware/    # Express middleware (auth)
│   │   ├── models/        # Data models (user, room, message)
│   │   ├── routes/        # REST API routes
│   │   ├── socket/        # Socket.IO handlers
│   │   ├── utils/         # Utility functions (JWT)
│   │   └── index.ts       # Server entry point
│   └── package.json
│
├── client/                # Frontend React app
│   ├── src/
│   │   ├── App.tsx       # Main application component
│   │   └── main.tsx      # Entry point
│   └── package.json
│
├── uploads/              # File upload storage
└── package.json          # Root package.json
```

## Prerequisites

- Node.js 18 or higher
- npm or yarn

## Installation

1. Clone the repository:
```bash
git clone https://github.com/Jayranson/chat.git
cd chat
```

2. Install dependencies:
```bash
# Install root dependencies
npm install

# Install server dependencies
cd server && npm install && cd ..

# Install client dependencies
cd client && npm install && cd ..
```

## Running the Application

### Development Mode

Run both server and client in development mode:

```bash
npm run dev
```

Or run them separately:

```bash
# Terminal 1 - Server
cd server && npm run dev

# Terminal 2 - Client
cd client && npm run dev
```

The server will run on `http://localhost:4000` and the client on `http://localhost:5173`.

### Production Build

Build both server and client:

```bash
npm run build
```

Start the production server (serves both API and client):

```bash
npm start
```

## Environment Variables

### Server (.env)

```env
PORT=4000
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=7d
DB_PATH=./data/chat.db
UPLOADS_DIR=./uploads
CLIENT_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

### Client (.env)

```env
VITE_API_URL=http://localhost:4000
```

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register a new user |
| POST | `/api/auth/login` | Login and get JWT token |
| GET | `/api/auth/me` | Get current user (requires auth) |

### Rooms

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/rooms` | List all public rooms |
| POST | `/api/rooms` | Create a new room |
| GET | `/api/rooms/:roomId` | Get room details |
| PATCH | `/api/rooms/:roomId` | Update room |
| GET | `/api/rooms/:roomId/messages` | Get message history (paginated) |
| POST | `/api/rooms/:roomId/messages/:messageId/read` | Mark message as read |
| POST | `/api/rooms/:roomId/messages/:messageId/reactions` | Add reaction |
| DELETE | `/api/rooms/:roomId/messages/:messageId/reactions/:emoji` | Remove reaction |

### Uploads

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/uploads` | Upload a file (multipart/form-data) |
| GET | `/api/uploads/:filename` | Get upload info |

## WebSocket Events

### Client to Server

| Event | Payload | Description |
|-------|---------|-------------|
| `room:join` | `roomId` | Join a room |
| `room:leave` | - | Leave current room |
| `message:send` | `{ text, attachmentUrl?, attachmentType? }` | Send a message |
| `message:edit` | `{ messageId, text }` | Edit a message |
| `message:delete` | `messageId` | Delete a message |
| `message:read` | `messageId` | Mark message as read |
| `typing:start` | - | Start typing indicator |
| `typing:stop` | - | Stop typing indicator |
| `reaction:add` | `{ messageId, emoji }` | Add reaction |
| `reaction:remove` | `{ messageId, emoji }` | Remove reaction |
| `status:update` | `'online' \| 'away' \| 'dnd'` | Update user status |

### Server to Client

| Event | Payload | Description |
|-------|---------|-------------|
| `user:connected` | `{ userId, username, role }` | Connection successful |
| `users:online` | `OnlineUser[]` | Online users update |
| `user:joined` | `{ userId, username }` | User joined room |
| `user:left` | `{ userId, username }` | User left room |
| `message:receive` | `Message` | New message |
| `message:updated` | `Message` | Message edited |
| `message:deleted` | `{ messageId }` | Message deleted |
| `message:read` | `{ userId, username, messageId }` | Read receipt |
| `typing:update` | `{ userId, username }[]` | Typing users |
| `reaction:update` | `{ messageId, reactions }` | Reaction updated |

## Running Tests

```bash
# Run all tests
npm test

# Run server tests only
cd server && npm test

# Run tests with coverage
cd server && npm run test:coverage
```

## Linting and Formatting

```bash
# Lint all code
npm run lint

# Format code with Prettier
npm run format

# Check formatting
npm run format:check

# Type check
npm run typecheck
```

## Default Admin Account

On first run, a default admin account is created:
- **Username**: admin
- **Password**: admin123

⚠️ **Important**: Change this password in production!

## License

MIT
