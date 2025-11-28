import { useState, useEffect } from 'react';
import { AuthPage } from './pages/AuthPage';
import { RoomList } from './components/RoomList';
import { ChatRoom } from './components/ChatRoom';
import { connectSocket, disconnectSocket } from './utils/socket';
import { api } from './utils/api';
import type { User, Room } from './types';

type AppView = 'auth' | 'rooms' | 'chat';

function App() {
  const [view, setView] = useState<AppView>('auth');
  const [user, setUser] = useState<User | null>(null);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    const token = localStorage.getItem('token');
    if (token) {
      api.auth
        .me()
        .then((userData) => {
          setUser(userData);
          connectSocket(token);
          setView('rooms');
        })
        .catch(() => {
          localStorage.removeItem('token');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const handleLogin = (token: string, userData: User) => {
    setUser(userData);
    connectSocket(token);
    setView('rooms');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    disconnectSocket();
    setUser(null);
    setCurrentRoom(null);
    setView('auth');
  };

  const handleJoinRoom = (room: Room) => {
    setCurrentRoom(room);
    setView('chat');
  };

  const handleLeaveRoom = () => {
    setCurrentRoom(null);
    setView('rooms');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <p>Loading...</p>
      </div>
    );
  }

  switch (view) {
    case 'auth':
      return <AuthPage onLogin={handleLogin} />;
    case 'rooms':
      return user ? (
        <RoomList user={user} onJoinRoom={handleJoinRoom} onLogout={handleLogout} />
      ) : null;
    case 'chat':
      return user && currentRoom ? (
        <ChatRoom room={currentRoom} user={user} onBack={handleLeaveRoom} />
      ) : null;
    default:
      return null;
  }
}

export default App;
