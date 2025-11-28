import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { User, Room } from './types';
import { getCurrentUser, getRooms } from './api';
import AuthPage from './pages/AuthPage';
import RoomList from './pages/RoomList';
import ChatRoom from './pages/ChatRoom';
import './App.css';

type Page = 'auth' | 'rooms' | 'chat';

function App() {
  const [page, setPage] = useState<Page>('auth');
  const [user, setUser] = useState<User | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      getCurrentUser()
        .then((userData) => {
          setUser(userData);
          connectSocket(token);
          setPage('rooms');
          loadRooms();
        })
        .catch(() => {
          localStorage.removeItem('token');
        });
    }
  }, []);

  const connectSocket = (token: string) => {
    const newSocket = io(window.location.origin, {
      auth: { token },
    });

    newSocket.on('connect', () => {
      console.log('Connected to server');
    });

    newSocket.on('connect_error', (err) => {
      console.error('Connection error:', err.message);
      setError('Connection failed');
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
    });

    setSocket(newSocket);
  };

  const loadRooms = async () => {
    try {
      const roomList = await getRooms();
      setRooms(roomList);
    } catch {
      setError('Failed to load rooms');
    }
  };

  const handleAuthSuccess = (userData: User, token: string) => {
    localStorage.setItem('token', token);
    setUser(userData);
    connectSocket(token);
    setPage('rooms');
    loadRooms();
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    socket?.disconnect();
    setSocket(null);
    setUser(null);
    setCurrentRoom(null);
    setPage('auth');
  };

  const handleJoinRoom = (room: Room) => {
    setCurrentRoom(room);
    setPage('chat');
  };

  const handleLeaveRoom = () => {
    setCurrentRoom(null);
    setPage('rooms');
    loadRooms();
  };

  const handleRoomCreated = (room: Room) => {
    setRooms((prev) => [...prev, room]);
  };

  return (
    <div className="app">
      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {page === 'auth' && <AuthPage onSuccess={handleAuthSuccess} />}

      {page === 'rooms' && user && (
        <RoomList
          user={user}
          rooms={rooms}
          onJoinRoom={handleJoinRoom}
          onRoomCreated={handleRoomCreated}
          onLogout={handleLogout}
        />
      )}

      {page === 'chat' && user && socket && currentRoom && (
        <ChatRoom
          user={user}
          socket={socket}
          room={currentRoom}
          onLeave={handleLeaveRoom}
        />
      )}
    </div>
  );
}

export default App;
