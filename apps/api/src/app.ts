import cors from 'cors';
import express from 'express';

import { USER_ROLES } from '@safealert/contracts';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/api/v1/health', (_request, response) => {
    response.json({
      status: 'ok',
      service: 'safealert-api',
      roles: USER_ROLES
    });
  });

  return app;
}
