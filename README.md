# Wibali Chat Network

A full-stack real-time chat application with user authentication, AI-powered moderation, age verification for UK compliance, embedded RPG game, and advanced admin features.

## Features

### Core Features
- **User Authentication**: Login/Register with password protection
- **Real-time Messaging**: WebSocket communication using Socket.IO
- **Typing Indicators**: See when other users are typing
- **Direct Messages (Whispers)**: Private messaging between users with pulsating notifications
- **Room/Channel Support**: Create and join public chat rooms

### ChatRPG - Embedded Game 🎮
An embedded Runescape-style RPG game within chat rooms:
- **Character Creation**: Customize your avatar with skin tones, hair styles, outfits
- **Persistent Progress**: Character stats saved per user account
- **Skills System**: Attack, Defense, Mining, Fishing, Woodcutting, Crafting, Cooking
- **Multiplayer**: See other players in the same room in real-time
- **Resource Gathering**: Chop trees, mine ore, catch fish to level up
- **Gold Economy**: Earn gold from activities
- **Network-wide Progress**: Your character travels with you across all rooms
- **Keyboard Controls**: WASD/Arrow keys to move, click to interact

### AI-Powered Features
- **AI Moderation Bot**: Intelligent moderation with toxicity detection
- **Sentiment Analysis**: Real-time sentiment tracking
- **Context-Aware Responses**: AI bot that learns room culture
- **Autonomous Thoughts**: AI shares relevant insights

### Age Verification (UK Compliance)
- **Face Detection**: Client-side face detection using face-api.js
- **Age Estimation**: AI-powered age estimation
- **QR Code Mobile Verification**: For users without webcam
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
- qrcode.react for QR code generation

## Project Structure

```
├── server.js              # Backend server (Express + Socket.IO + RPG events)
├── roomEngine.js          # Room configuration and analytics
├── client/                # Frontend React app
│   ├── src/
│   │   ├── App.tsx       # Main application component
│   │   ├── ChatRPG.tsx   # Embedded RPG game component
│   │   ├── AgeVerification.tsx  # Age verification component
│   │   ├── MobileAgeVerification.tsx  # Mobile verification page
│   │   └── main.tsx      # Entry point
│   └── package.json
├── uploads/              # File upload storage
└── package.json          # Root package.json
```

## Prerequisites

- Node.js 18 or higher
- npm or yarn
- Modern browser with webcam (for age verification)

## Clean Install Instructions

### Option 1: Clone the PR branch directly

```bash
# Clone with the PR branch
git clone -b copilot/make-chat-application-functional https://github.com/Jayranson/chat.git
cd chat

# Install root dependencies (server)
npm install

# Install client dependencies
cd client
npm install
cd ..

# Build the client for production
npm run build

# Start the server
npm start
```

The application will be available at `http://localhost:4000`

### Option 2: If you already cloned, switch to the PR branch

```bash
cd chat
git fetch origin
git checkout copilot/make-chat-application-functional

# Install dependencies
npm install
cd client && npm install && cd ..

# Build and run
npm run build
npm start
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
VITE_FACE_API_MODEL_URL=https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model
```

## Age Verification

The app includes face-based age verification to comply with UK regulations:

### Webcam Verification (Desktop)
1. **Local Processing**: All face detection runs in the browser
2. **Privacy**: No images or facial data are stored or transmitted
3. **Accuracy**: Uses multiple readings for reliable estimation
4. **Compliance**: Meets UK Online Safety Act requirements for 18+ platforms

### QR Code Mobile Verification (No Webcam)
For users without a webcam on their PC/laptop:
1. Click "No webcam? Verify with mobile phone" button
2. Scan the QR code displayed on screen with your mobile phone
3. Complete face verification on your mobile device
4. Desktop automatically progresses once mobile verification is complete

**Note**: Mobile QR verification only works when deployed to a public URL (not localhost).

The QR code flow uses a session-based system:
- Sessions expire after 10 minutes
- Desktop polls server for verification status
- Mobile notifies server when verification completes

To skip age verification (for testing):
- Click "Skip verification" on the age verification page
- Set `localStorage.setItem('ageVerified', 'true')` in browser console

## ChatRPG Game

The embedded game appears in chat rooms when you click the "🎮 Game" button:

1. **First Time**: Create your character with custom appearance
2. **Move**: Use WASD or arrow keys to navigate the world
3. **Gather Resources**: Walk near trees, ore, or fishing spots and click them
4. **Level Up**: Gain XP and gold from gathering activities
5. **Multiplayer**: See other players in the same room in real-time
6. **Persistent**: Your character saves automatically

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
