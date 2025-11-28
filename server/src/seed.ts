import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from './utils/password';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create admin user
  const adminPassword = await hashPassword('admin123');
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@chat.local',
      password: adminPassword,
      fullName: 'Admin User',
      isAdmin: true,
      about: 'I am the server administrator.',
    },
  });
  console.log(`✅ Created admin user: ${admin.username}`);

  // Create regular user
  const userPassword = await hashPassword('user123');
  const regularUser = await prisma.user.upsert({
    where: { username: 'alice' },
    update: {},
    create: {
      username: 'alice',
      email: 'alice@chat.local',
      password: userPassword,
      fullName: 'Alice Smith',
      isAdmin: false,
      about: 'Hello! I love chatting.',
    },
  });
  console.log(`✅ Created regular user: ${regularUser.username}`);

  // Create another regular user
  const bobPassword = await hashPassword('user123');
  const bob = await prisma.user.upsert({
    where: { username: 'bob' },
    update: {},
    create: {
      username: 'bob',
      email: 'bob@chat.local',
      password: bobPassword,
      fullName: 'Bob Jones',
      isAdmin: false,
      about: 'Just a regular user.',
    },
  });
  console.log(`✅ Created regular user: ${bob.username}`);

  // Create general room
  const generalRoom = await prisma.room.upsert({
    where: { name: 'general' },
    update: {},
    create: {
      name: 'general',
      topic: 'General discussion for everyone',
      isPrivate: false,
      ownerId: admin.id,
    },
  });
  console.log(`✅ Created room: ${generalRoom.name}`);

  // Create help room
  const helpRoom = await prisma.room.upsert({
    where: { name: 'help' },
    update: {},
    create: {
      name: 'help',
      topic: 'Need help? Ask here!',
      isPrivate: false,
      ownerId: admin.id,
    },
  });
  console.log(`✅ Created room: ${helpRoom.name}`);

  // Add members to rooms
  await prisma.roomMember.upsert({
    where: { userId_roomId: { userId: admin.id, roomId: generalRoom.id } },
    update: {},
    create: { userId: admin.id, roomId: generalRoom.id },
  });
  await prisma.roomMember.upsert({
    where: { userId_roomId: { userId: regularUser.id, roomId: generalRoom.id } },
    update: {},
    create: { userId: regularUser.id, roomId: generalRoom.id },
  });
  await prisma.roomMember.upsert({
    where: { userId_roomId: { userId: bob.id, roomId: generalRoom.id } },
    update: {},
    create: { userId: bob.id, roomId: generalRoom.id },
  });
  console.log('✅ Added members to general room');

  // Create sample messages
  const msg1 = await prisma.message.create({
    data: {
      content: 'Welcome to the chat! 👋',
      authorId: admin.id,
      roomId: generalRoom.id,
    },
  });

  await prisma.message.create({
    data: {
      content: 'Hey everyone! Excited to be here.',
      authorId: regularUser.id,
      roomId: generalRoom.id,
    },
  });

  await prisma.message.create({
    data: {
      content: 'Hi Alice! Good to see you.',
      authorId: bob.id,
      roomId: generalRoom.id,
    },
  });
  console.log('✅ Created sample messages');

  // Add a sample reaction
  await prisma.reaction.create({
    data: {
      emoji: '👋',
      userId: regularUser.id,
      messageId: msg1.id,
    },
  });
  console.log('✅ Created sample reaction');

  console.log('🎉 Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
