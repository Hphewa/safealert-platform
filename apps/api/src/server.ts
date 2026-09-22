import './config/loadEnv.js';

import { createApp } from './app.js';
import { connectToDatabase } from './config/database.js';
import { loadConfig } from './config/env.js';

const config = loadConfig();

async function startServer() {
  if (!config.mongodbUri) {
    throw new Error('MONGODB_URI is required to start the API server.');
  }

  await connectToDatabase(config.mongodbUri);

  const app = createApp({ config });

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(config.port, () => resolve());
    server.once('error', (error: NodeJS.ErrnoException) => {
      reject(error.code === 'EADDRINUSE'
        ? new Error(`Port ${config.port} is already in use. Stop the other API instance, then restart SafeAlert.`)
        : error);
    });
  });
  console.log(`SafeAlert API listening on http://localhost:${config.port}`);
}

startServer().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Failed to start SafeAlert API.');
  process.exit(1);
});
