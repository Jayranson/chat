import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import type { Room, User } from '../types';

interface RoomListProps {
  user: User;
  onJoinRoom: (room: Room) => void;
  onLogout: () => void;
}

export function RoomList({ user, onJoinRoom, onLogout }: RoomListProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomTopic, setNewRoomTopic] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadRooms();
  }, []);

  const loadRooms = async () => {
    try {
      const data = await api.rooms.list();
      setRooms(data);
    } catch (err) {
      setError('Failed to load rooms');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRoom = async () => {
    if (!newRoomName.trim()) return;

    setCreating(true);
    setError('');

    try {
      const room = await api.rooms.create({
        name: newRoomName.trim(),
        topic: newRoomTopic.trim(),
      });

      if (room.error) {
        setError(room.error);
      } else {
        setRooms([room, ...rooms]);
        setNewRoomName('');
        setNewRoomTopic('');
        setShowCreateForm(false);
      }
    } catch (err) {
      setError('Failed to create room');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinRoom = async (room: Room) => {
    try {
      await api.rooms.join(room.id);
      onJoinRoom(room);
    } catch (err) {
      setError('Failed to join room');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <p>Loading rooms...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div>
          <h1 className="text-2xl font-bold">Chat Rooms</h1>
          <p className="text-gray-400">
            Welcome, {user.username}
            {user.isAdmin && (
              <span className="ml-2 px-2 py-0.5 bg-yellow-500 text-black text-xs rounded">
                Admin
              </span>
            )}
          </p>
        </div>
        <button
          onClick={onLogout}
          className="px-4 py-2 bg-red-600 rounded-lg hover:bg-red-500 transition-colors"
        >
          Logout
        </button>
      </div>

      <div className="max-w-4xl mx-auto p-4">
        {/* Create room button */}
        <div className="mb-6">
          {!showCreateForm ? (
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors"
            >
              + Create Room
            </button>
          ) : (
            <div className="bg-gray-800 p-4 rounded-lg space-y-3">
              <h3 className="font-semibold">Create New Room</h3>
              <input
                type="text"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="Room name"
                className="w-full px-3 py-2 bg-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                value={newRoomTopic}
                onChange={(e) => setNewRoomTopic(e.target.value)}
                placeholder="Topic (optional)"
                className="w-full px-3 py-2 bg-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreateRoom}
                  disabled={!newRoomName.trim() || creating}
                  className="px-4 py-2 bg-green-600 rounded hover:bg-green-500 transition-colors disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
                <button
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewRoomName('');
                    setNewRoomTopic('');
                  }}
                  className="px-4 py-2 bg-gray-600 rounded hover:bg-gray-500 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-600/20 border border-red-600 rounded text-red-400">
            {error}
          </div>
        )}

        {/* Room list */}
        <div className="space-y-3">
          {rooms.length === 0 ? (
            <p className="text-gray-400 text-center py-8">
              No rooms available. Create one to get started!
            </p>
          ) : (
            rooms.map((room) => (
              <div
                key={room.id}
                className="bg-gray-800 p-4 rounded-lg hover:bg-gray-750 transition-colors cursor-pointer"
                onClick={() => handleJoinRoom(room)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">
                      #{room.name}
                      {room.isPrivate && (
                        <span className="ml-2 text-xs text-gray-400">🔒 Private</span>
                      )}
                    </h3>
                    <p className="text-gray-400 text-sm">{room.topic || 'No topic set'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-400">
                      {room.memberCount} member{room.memberCount !== 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-gray-500">
                      by {room.owner.username}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
