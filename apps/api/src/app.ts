import cors from 'cors';
import express from 'express';

import { USER_ROLES } from '@safealert/contracts';

import type { ApiConfig } from './config/env.js';
import { errorHandler, notFoundHandler } from './shared/errorMiddleware.js';
import { createAuthRouter } from './modules/auth/routes/auth.routes.js';
import { createRbacTestRouter } from './modules/auth/routes/rbacTest.routes.js';
import { MongooseAuthRepository } from './modules/auth/repositories/mongooseAuth.repository.js';
import type { AuthRepository } from './modules/auth/repositories/auth.repository.js';
import { AuthService } from './modules/auth/services/auth.service.js';
import { createReportRouter } from './modules/reports/routes/report.routes.js';
import { MongooseReportRepository } from './modules/reports/repositories/mongooseReport.repository.js';
import type { ReportRepository } from './modules/reports/repositories/report.repository.js';
import { ReportService } from './modules/reports/services/report.service.js';

type CreateAppOptions = {
  config: ApiConfig;
  authRepository?: AuthRepository;
  reportRepository?: ReportRepository;
  enableRbacTestRoutes?: boolean;
};

export function createApp({
  config,
  authRepository,
  reportRepository,
  enableRbacTestRoutes = false
}: CreateAppOptions) {
  const app = express();
  const authService = new AuthService(authRepository ?? new MongooseAuthRepository(), config);
  const reportService = new ReportService(reportRepository ?? new MongooseReportRepository());

  app.use(cors());
  app.use(express.json());

  app.get('/api/v1/health', (_request, response) => {
    response.json({
      status: 'ok',
      service: 'safealert-api',
      roles: USER_ROLES
    });
  });

  app.use('/api/v1/auth', createAuthRouter(authService, config));
  app.use('/api/v1/reports', createReportRouter(reportService, config));

  if (enableRbacTestRoutes) {
    app.use('/api/v1/test/rbac', createRbacTestRouter(config));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
