import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create users
  const adminPassword = await bcrypt.hash('admin123', 10);
  const userPassword = await bcrypt.hash('password123', 10);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@chat.local',
      passwordHash: adminPassword,
      fullName: 'Admin User',
      about: 'Server administrator',
      role: 'admin',
    },
  });

  const alice = await prisma.user.upsert({
    where: { username: 'alice' },
    update: {},
    create: {
      username: 'alice',
      email: 'alice@chat.local',
      passwordHash: userPassword,
      fullName: 'Alice Smith',
      about: 'Hello! I love music.',
      role: 'user',
    },
  });

  const bob = await prisma.user.upsert({
    where: { username: 'bob' },
    update: {},
    create: {
      username: 'bob',
      email: 'bob@chat.local',
      passwordHash: userPassword,
      fullName: 'Bob Jones',
      about: 'Tech enthusiast',
      role: 'user',
    },
  });

  console.log('Created users:', { admin, alice, bob });

  // Create rooms
  const general = await prisma.room.upsert({
    where: { name: 'general' },
    update: {},
    create: {
      name: 'general',
      type: 'public',
      topic: 'Welcome to the general chat!',
      ownerId: admin.id,
    },
  });

  const music = await prisma.room.upsert({
    where: { name: 'music' },
    update: {},
    create: {
      name: 'music',
      type: 'public',
      topic: 'Discuss your favorite tunes',
      ownerId: alice.id,
    },
  });

  const help = await prisma.room.upsert({
    where: { name: 'help' },
    update: {},
    create: {
      name: 'help',
      type: 'public',
      topic: 'Need help? Ask here!',
      ownerId: admin.id,
    },
  });

  console.log('Created rooms:', { general, music, help });

  // Add room memberships
  await prisma.roomMember.upsert({
    where: { userId_roomId: { userId: admin.id, roomId: general.id } },
    update: {},
    create: {
      userId: admin.id,
      roomId: general.id,
      role: 'owner',
    },
  });

  await prisma.roomMember.upsert({
    where: { userId_roomId: { userId: alice.id, roomId: general.id } },
    update: {},
    create: {
      userId: alice.id,
      roomId: general.id,
      role: 'member',
    },
  });

  await prisma.roomMember.upsert({
    where: { userId_roomId: { userId: bob.id, roomId: general.id } },
    update: {},
    create: {
      userId: bob.id,
      roomId: general.id,
      role: 'member',
    },
  });

  // Add some sample messages
  await prisma.message.create({
    data: {
      content: 'Welcome to the chat!',
      type: 'system',
      userId: admin.id,
      roomId: general.id,
    },
  });

  await prisma.message.create({
    data: {
      content: 'Hey everyone!',
      type: 'user',
      userId: alice.id,
      roomId: general.id,
    },
  });

  await prisma.message.create({
    data: {
      content: 'Hello Alice!',
      type: 'user',
      userId: bob.id,
      roomId: general.id,
    },
  });

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
