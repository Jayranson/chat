# Wibali Chat Network

A full-stack real-time chat application with user authentication, AI-powered moderation, age verification for UK compliance, and advanced admin features.

## Features

### Core Features
- **User Authentication**: Login/Register with password protection
- **Real-time Messaging**: WebSocket communication using Socket.IO
- **Typing Indicators**: See when other users are typing
- **Direct Messages (Whispers)**: Private messaging between users
- **Room/Channel Support**: Create and join public chat rooms

### AI-Powered Features
- **AI Moderation Bot**: Intelligent moderation with toxicity detection
- **Sentiment Analysis**: Real-time sentiment tracking
- **Context-Aware Responses**: AI bot that learns room culture
- **Autonomous Thoughts**: AI shares relevant insights

### Age Verification (UK Compliance)
- **Face Detection**: Client-side face detection using face-api.js
- **Age Estimation**: AI-powered age estimation
- **Privacy-First**: No facial data stored or transmitted
- **Compliant**: Meets UK Online Safety Act requirements

### Admin Features
- **Admin Panel**: Comprehensive user management
- **User Controls**: Ban, mute, warn, and edit users
- **Reports & Tickets**: Handle user reports and ban appeals
- **Room Configuration**: Mood and safety settings per room
- **Live Moderation**: Real-time user monitoring

## Tech Stack

### Backend
- Node.js with ES Modules
- Express.js for REST API
- Socket.IO for real-time communication

### Frontend
- React 18 with TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- Socket.IO client
- face-api.js for age verification

## Project Structure

```
├── server.js              # Backend server (Express + Socket.IO)
├── roomEngine.js          # Room configuration and analytics
├── client/                # Frontend React app
│   ├── src/
│   │   ├── App.tsx       # Main application component
│   │   ├── AgeVerification.tsx  # Age verification component
│   │   └── main.tsx      # Entry point
│   └── package.json
├── uploads/              # File upload storage
└── package.json          # Root package.json
```

## Prerequisites

- Node.js 18 or higher
- npm or yarn
- Modern browser with webcam (for age verification)

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
npm run dev:server

# Terminal 2 - Client
cd client && npm run dev
```

The server will run on `http://localhost:4000` and the client on `http://localhost:5173`.

### Production Build

Build and start:

```bash
npm run build
npm start
```

## Environment Variables

```env
PORT=4000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

## Age Verification

The app includes face-based age verification to comply with UK regulations:

1. **Local Processing**: All face detection runs in the browser
2. **Privacy**: No images or facial data are stored or transmitted
3. **Accuracy**: Uses multiple readings for reliable estimation
4. **Compliance**: Meets UK Online Safety Act requirements for 18+ platforms

To skip age verification (for testing):
- Click "Skip verification" on the age verification page
- Set `localStorage.setItem('ageVerified', 'true')` in browser console

## Default Accounts

| Username | Password | Role |
|----------|----------|------|
| Admin | Changeme25 | Admin |
| Alice | password123 | User |

⚠️ **Important**: Change these passwords in production!

## Running Tests

```bash
# Run client tests
npm run test

# Run with watch mode
cd client && npm run test:watch
```

## Linting and Formatting

```bash
# Lint all code
npm run lint

# Format code with Prettier
npm run format

# Type check
npm run typecheck
```

## License

MIT
