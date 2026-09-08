import '../config/loadEnv.js';

import bcrypt from 'bcryptjs';

import type { UserRole } from '@safealert/contracts';

import { connectToDatabase, disconnectFromDatabase } from '../config/database.js';
import { loadConfig } from '../config/env.js';
import { UserModel } from '../modules/users/models/user.model.js';

type SeedAccount = {
  name: string;
  email: string;
  password: string | undefined;
  role: UserRole;
};

const seedAccounts: SeedAccount[] = [
  {
    name: 'Development Volunteer',
    email: process.env.SEED_VOLUNTEER_EMAIL ?? 'volunteer@example.com',
    password: process.env.SEED_VOLUNTEER_PASSWORD,
    role: 'COMMUNITY_VOLUNTEER'
  },
  {
    name: 'Development Officer',
    email: process.env.SEED_OFFICER_EMAIL ?? 'officer@example.com',
    password: process.env.SEED_OFFICER_PASSWORD,
    role: 'DISASTER_OFFICER'
  },
  {
    name: 'Development Responder',
    email: process.env.SEED_RESPONDER_EMAIL ?? 'responder@example.com',
    password: process.env.SEED_RESPONDER_PASSWORD,
    role: 'EMERGENCY_RESPONDER'
  }
];

async function seed() {
  const config = loadConfig();

  if (config.nodeEnv === 'production') {
    throw new Error('Refusing to seed development auth accounts when NODE_ENV=production.');
  }

  if (!config.mongodbUri) {
    throw new Error('MONGODB_URI is required to seed development auth accounts.');
  }

  for (const account of seedAccounts) {
    if (!account.password || account.password.length < 8) {
      throw new Error(`${account.role} seed password must be set and at least 8 characters.`);
    }
  }

  await connectToDatabase(config.mongodbUri);

  for (const account of seedAccounts) {
    const password = account.password;

    if (!password) {
      throw new Error(`${account.role} seed password must be set.`);
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await UserModel.updateOne(
      { email: account.email.toLowerCase() },
      {
        $setOnInsert: {
          name: account.name,
          email: account.email.toLowerCase(),
          role: account.role,
          isActive: true
        },
        $set: {
          passwordHash
        }
      },
      { upsert: true }
    ).exec();

    console.log(`Seeded ${account.role} account: ${account.email.toLowerCase()}`);
  }

  await disconnectFromDatabase();
}

seed().catch(async (error) => {
  await disconnectFromDatabase();
  console.error(error instanceof Error ? error.message : 'Failed to seed development auth accounts.');
  process.exit(1);
});
