import { userModel } from '../models/user.js';
import { roomModel } from '../models/room.js';

export const seedDatabase = async (): Promise<void> => {
  // Check if admin exists
  if (!userModel.findByUsername('admin')) {
    console.log('Creating default admin user...');
    const admin = await userModel.create({
      username: 'admin',
      email: 'admin@chat.local',
      password: 'admin123',
      full_name: 'Administrator',
    });
    
    // Make admin
    userModel.update(admin.id, { role: 'admin' });
    console.log('Admin user created (username: admin, password: admin123)');
  }

  // Create default rooms
  const defaultRooms = [
    { name: 'general', topic: 'General discussion' },
    { name: 'random', topic: 'Random chat' },
    { name: 'help', topic: 'Need help? Ask here!' },
  ];

  for (const room of defaultRooms) {
    if (!roomModel.findByName(room.name)) {
      console.log(`Creating room: ${room.name}`);
      roomModel.create({
        name: room.name,
        topic: room.topic,
        type: 'public',
      });
    }
  }
};
