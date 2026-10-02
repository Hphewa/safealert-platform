import cors from 'cors';
import { RiskMapService } from './modules/risk-map/services/riskMap.service.js';
import { createRiskMapRouter } from './modules/risk-map/routes/riskMap.routes.js';
import type { FieldConfirmationRepository } from './modules/field-confirmations/repositories/fieldConfirmation.repository.js';
import { MongooseFieldConfirmationRepository } from './modules/field-confirmations/repositories/mongooseFieldConfirmation.repository.js';
import { FieldConfirmationService } from './modules/field-confirmations/services/fieldConfirmation.service.js';
import { createFieldConfirmationRouter } from './modules/field-confirmations/routes/fieldConfirmation.routes.js';
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
import { createMediaRouter } from './modules/media/routes/media.routes.js';
import { LocalMediaStorage } from './modules/media/services/localMediaStorage.js';
import { createRiskAssessmentRouter } from './modules/risk-assessments/routes/riskAssessment.routes.js';
import { MongooseRiskAssessmentRepository } from './modules/risk-assessments/repositories/mongooseRiskAssessment.repository.js';
import type { RiskAssessmentRepository } from './modules/risk-assessments/repositories/riskAssessment.repository.js';
import { RiskAssessmentService } from './modules/risk-assessments/services/riskAssessment.service.js';
import { createWarningRouter } from './modules/warnings/routes/warning.routes.js';
import { WarningService, type WarningPublishedHandler } from './modules/warnings/services/warning.service.js';
import { MongooseWarningRepository } from './modules/warnings/repositories/mongooseWarning.repository.js';
import { createNotificationRouter } from './modules/notifications/routes/notification.routes.js';
import { NotificationProfileService } from './modules/notifications/services/notificationProfile.service.js';
import { WarningNotificationService } from './modules/notifications/services/warningNotification.service.js';
import { MongooseNotificationProfileRepository } from './modules/notifications/repositories/mongooseNotificationProfile.repository.js';
import { MongooseNotificationRecipientRepository } from './modules/notifications/repositories/mongooseNotificationRecipient.repository.js';
import { MongooseWarningDeliveryRepository } from './modules/notifications/repositories/mongooseWarningDelivery.repository.js';
import type { NotificationProfileRepository } from './modules/notifications/repositories/notificationProfile.repository.js';
import type { NotificationRecipientRepository } from './modules/notifications/repositories/notificationRecipient.repository.js';
import type { WarningDeliveryRepository } from './modules/notifications/repositories/warningDelivery.repository.js';
import { createPushProvider, createSmsProvider } from './modules/notifications/providers/createNotificationProviders.js';
import type { PushProvider } from './modules/notifications/providers/pushProvider.js';
import type { SmsProvider } from './modules/notifications/providers/smsProvider.js';
import type { WarningRepository } from './modules/warnings/repositories/warning.repository.js';
import type { WarningAttachmentRepository } from './modules/warnings/repositories/warningAttachment.repository.js';
import { GridFsWarningAttachmentRepository } from './modules/warnings/repositories/gridFsWarningAttachment.repository.js';
import { WarningAttachmentService } from './modules/warnings/services/warningAttachment.service.js';
import { createWarningAttachmentRouter } from './modules/warnings/routes/warningAttachment.routes.js';
import type { IncidentRepository } from './modules/incidents/repositories/incident.repository.js';
import { MongooseIncidentRepository } from './modules/incidents/repositories/mongooseIncident.repository.js';
import { IncidentService } from './modules/incidents/services/incident.service.js';
import { createIncidentRouter } from './modules/incidents/routes/incident.routes.js';
import { IncidentLifecycleService } from './modules/incidents/services/incidentLifecycle.service.js';
import type { CommunityReportClusterRepository } from './modules/report-clusters/repositories/communityReportCluster.repository.js';
import { MongooseCommunityReportClusterRepository } from './modules/report-clusters/repositories/mongooseCommunityReportCluster.repository.js';
import { CommunityReportGroupingService } from './modules/report-clusters/services/communityReportGrouping.service.js';
import { createCommunityReportClusterRouter } from './modules/report-clusters/routes/communityReportCluster.routes.js';

type CreateAppOptions = {
  config: ApiConfig;
  authRepository?: AuthRepository;
  reportRepository?: ReportRepository;
  fieldConfirmationRepository?: FieldConfirmationRepository;
  responseRequestRepository?: ResponseRequestRepository;
  riskAssessmentRepository?: RiskAssessmentRepository;
  warningRepository?: WarningRepository;
  warningAttachmentRepository?: WarningAttachmentRepository;
  incidentRepository?: IncidentRepository;
  communityReportClusterRepository?: CommunityReportClusterRepository;
  warningPublishedHandler?: WarningPublishedHandler;
  warningDeliveryRepository?: WarningDeliveryRepository;
  notificationRecipientRepository?: NotificationRecipientRepository;
  notificationProfileRepository?: NotificationProfileRepository;
  smsProvider?: SmsProvider;
  pushProvider?: PushProvider;
  enableRbacTestRoutes?: boolean;
};

export function createApp({
  config,
  authRepository,
  reportRepository,
  fieldConfirmationRepository,
  responseRequestRepository,
  riskAssessmentRepository,
  warningRepository,
  warningAttachmentRepository,
  incidentRepository,
  communityReportClusterRepository,
  warningPublishedHandler,
  warningDeliveryRepository,
  notificationRecipientRepository,
  notificationProfileRepository,
  smsProvider,
  pushProvider,
  enableRbacTestRoutes = false
}: CreateAppOptions) {
  const app = express();
  const authService = new AuthService(authRepository ?? new MongooseAuthRepository(), config);
  const confirmations = fieldConfirmationRepository ?? new MongooseFieldConfirmationRepository();
  const resolvedReportRepository = reportRepository ?? new MongooseReportRepository();
  const resolvedIncidentRepository = incidentRepository ?? new MongooseIncidentRepository();
  const incidentService = new IncidentService(resolvedIncidentRepository, resolvedReportRepository);
  const resolvedCommunityReportClusterRepository = communityReportClusterRepository ?? new MongooseCommunityReportClusterRepository();
  const communityReportGroupingService = new CommunityReportGroupingService(
    resolvedCommunityReportClusterRepository, resolvedReportRepository, confirmations
  );
  const reportService = new ReportService(resolvedReportRepository, confirmations, incidentService, communityReportGroupingService);
  const resolvedAssessmentRepository = riskAssessmentRepository ?? new MongooseRiskAssessmentRepository();
  const riskAssessmentService = new RiskAssessmentService(resolvedAssessmentRepository, resolvedIncidentRepository, resolvedReportRepository);
  const resolvedImages = warningAttachmentRepository ?? new GridFsWarningAttachmentRepository();
  const resolvedWarningRepository = warningRepository ?? new MongooseWarningRepository();
  // LDFEW-127: publication persists first; this handler then runs targeted SMS (Notify.lk)
  // and push (Firebase Cloud Messaging) delivery without ever affecting publication.
  const warningNotificationService = new WarningNotificationService({
    recipients: notificationRecipientRepository ?? new MongooseNotificationRecipientRepository(),
    deliveries: warningDeliveryRepository ?? new MongooseWarningDeliveryRepository(),
    smsProvider: smsProvider ?? createSmsProvider(config),
    pushProvider: pushProvider ?? createPushProvider(config),
    countryName: config.notificationCountryName,
    logger: console
  });
  const resolvedWarningPublishedHandler: WarningPublishedHandler = warningPublishedHandler ??
    ((warning) => warningNotificationService.notifyPublishedWarning(warning)
      .then(() => undefined)
      .catch(() => {
        // Publication remains authoritative. This log makes an unexpected orchestration
        // failure visible without exposing provider credentials or changing warning status.
        console.error('Warning notification processing failed after publication.', {
          warningId: warning.id
        });
      }));
  const warningService = new WarningService(resolvedWarningRepository, resolvedAssessmentRepository, resolvedImages, resolvedIncidentRepository, resolvedWarningPublishedHandler);
  const warningAttachmentService = new WarningAttachmentService(resolvedImages, resolvedAssessmentRepository);
  const incidentLifecycleService = new IncidentLifecycleService(
    resolvedIncidentRepository, resolvedReportRepository, resolvedAssessmentRepository, resolvedWarningRepository
  );
  const responseRequestService = new ResponseRequestService(
    responseRequestRepository ?? new MongooseResponseRequestRepository()
  );
  const mediaStorage = new LocalMediaStorage(config);

  app.use(cors());
  app.use('/api/v1/warning-attachments', createWarningAttachmentRouter(warningAttachmentService, config));
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
  app.use('/api/v1/report-clusters', createCommunityReportClusterRouter(communityReportGroupingService, config));
  app.use('/api/v1/incidents', createIncidentRouter(incidentService, incidentLifecycleService, config));
  app.use('/api/v1/media', createMediaRouter(mediaStorage, config));
  app.use('/api/v1/field-confirmations', createFieldConfirmationRouter(
    new FieldConfirmationService(confirmations, reportService), config
  ));
  app.use('/api/v1/risk-assessments', createRiskAssessmentRouter(riskAssessmentService, config));
  app.use('/api/v1/risk-map', createRiskMapRouter(
    new RiskMapService(resolvedIncidentRepository, resolvedAssessmentRepository, resolvedWarningRepository), config
  ));
  app.use('/api/v1/warnings', createWarningRouter(warningService, config));
  app.use('/api/v1/notifications', createNotificationRouter(
    new NotificationProfileService(notificationProfileRepository ?? new MongooseNotificationProfileRepository()), config
  ));
  app.use('/api/v1/response-requests', createResponseRequestRouter(responseRequestService, config));

  if (enableRbacTestRoutes) {
    app.use('/api/v1/test/rbac', createRbacTestRouter(config));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

