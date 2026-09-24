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
import { createResponseRequestRouter } from './modules/response-requests/routes/responseRequest.routes.js';
import { MongooseResponseRequestRepository } from './modules/response-requests/repositories/mongooseResponseRequest.repository.js';
import type { ResponseRequestRepository } from './modules/response-requests/repositories/responseRequest.repository.js';
import { ResponseRequestService } from './modules/response-requests/services/responseRequest.service.js';
import { createRiskAssessmentRouter } from './modules/risk-assessments/routes/riskAssessment.routes.js';
import { MongooseRiskAssessmentRepository } from './modules/risk-assessments/repositories/mongooseRiskAssessment.repository.js';
import type { RiskAssessmentRepository } from './modules/risk-assessments/repositories/riskAssessment.repository.js';
import { RiskAssessmentService } from './modules/risk-assessments/services/riskAssessment.service.js';

type CreateAppOptions = {
  config: ApiConfig;
  authRepository?: AuthRepository;
  reportRepository?: ReportRepository;
  responseRequestRepository?: ResponseRequestRepository;
  riskAssessmentRepository?: RiskAssessmentRepository;
  enableRbacTestRoutes?: boolean;
};

export function createApp({
  config,
  authRepository,
  reportRepository,
  responseRequestRepository,
  riskAssessmentRepository,
  enableRbacTestRoutes = false
}: CreateAppOptions) {
  const app = express();
  const authService = new AuthService(authRepository ?? new MongooseAuthRepository(), config);
  const resolvedReportRepository = reportRepository ?? new MongooseReportRepository();
  const reportService = new ReportService(resolvedReportRepository);
  const riskAssessmentService = new RiskAssessmentService(
    riskAssessmentRepository ?? new MongooseRiskAssessmentRepository(), resolvedReportRepository
  );
  const responseRequestService = new ResponseRequestService(
    responseRequestRepository ?? new MongooseResponseRequestRepository()
  );

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
  app.use('/api/v1/risk-assessments', createRiskAssessmentRouter(riskAssessmentService, config));
  app.use('/api/v1/response-requests', createResponseRequestRouter(responseRequestService, config));

  if (enableRbacTestRoutes) {
    app.use('/api/v1/test/rbac', createRbacTestRouter(config));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
