import { useState, FormEvent } from 'react';
import { User, Room } from '../types';
import { createRoom } from '../api';

interface RoomListProps {
  user: User;
  rooms: Room[];
  onJoinRoom: (room: Room) => void;
  onRoomCreated: (room: Room) => void;
  onLogout: () => void;
}

function RoomList({ user, rooms, onJoinRoom, onRoomCreated, onLogout }: RoomListProps) {
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomTopic, setNewRoomTopic] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleCreateRoom = async (e: FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;

    setCreating(true);
    setError('');

    try {
      const room = await createRoom(newRoomName.trim(), newRoomTopic.trim() || undefined);
      onRoomCreated(room);
      setNewRoomName('');
      setNewRoomTopic('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="room-list-page">
      <header className="room-list-header">
        <h1 className="room-list-title">Chat Rooms</h1>
        <div className="user-info">
          <span>Welcome, {user.username}</span>
          <button className="btn btn-secondary" onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="room-list-content">
        <form className="create-room-form" onSubmit={handleCreateRoom}>
          <div className="form-group">
            <label htmlFor="roomName">Room Name</label>
            <input
              id="roomName"
              type="text"
              className="input"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              placeholder="Enter room name"
            />
          </div>
          <div className="form-group">
            <label htmlFor="roomTopic">Topic (optional)</label>
            <input
              id="roomTopic"
              type="text"
              className="input"
              value={newRoomTopic}
              onChange={(e) => setNewRoomTopic(e.target.value)}
              placeholder="Enter room topic"
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={creating || !newRoomName.trim()}>
            {creating ? 'Creating...' : 'Create Room'}
          </button>
        </form>

        {error && <div style={{ color: '#e74c3c' }}>{error}</div>}

        <div className="room-grid">
          {rooms.map((room) => (
            <div key={room.id} className="room-card" onClick={() => onJoinRoom(room)}>
              <div className="room-name">#{room.name}</div>
              <div className="room-topic">{room.topic || 'No topic'}</div>
              <div className="room-stats">
                <span>{room._count?.members || 0} members</span>
                <span>{room._count?.messages || 0} messages</span>
              </div>
            </div>
          ))}

          {rooms.length === 0 && (
            <div className="text-center text-gray p-4">
              No rooms available. Create one to get started!
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default RoomList;
