export const USER_ROLES = [
  'RESIDENT',
  'COMMUNITY_VOLUNTEER',
  'DISASTER_OFFICER',
  'EMERGENCY_RESPONDER'
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const RISK_LEVELS = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'] as const;

export type RiskLevel = (typeof RISK_LEVELS)[number];

// Officer observations are independent of the resident's reported severity.
export const HAZARD_ASSESSMENT_SEVERITIES = ['LOW', 'MODERATE', 'HIGH', 'SEVERE'] as const;
export type HazardAssessmentSeverity = (typeof HAZARD_ASSESSMENT_SEVERITIES)[number];
// More precise assessment states preserve the existing emergency-request contract.
export const ROAD_ACCESSIBILITY_OPTIONS = ['ACCESSIBLE', 'PARTIALLY_BLOCKED', 'FULLY_BLOCKED', 'UNKNOWN'] as const;
export type AssessmentRoadAccessibility = (typeof ROAD_ACCESSIBILITY_OPTIONS)[number];
export const INFRASTRUCTURE_IMPACT_LEVELS = ['NONE', 'LOW', 'MODERATE', 'HIGH', 'SEVERE'] as const;
export type InfrastructureImpact = (typeof INFRASTRUCTURE_IMPACT_LEVELS)[number];
export const WATER_LEVEL_TRENDS = ['FALLING', 'STABLE', 'RISING', 'RISING_RAPIDLY', 'NOT_APPLICABLE', 'UNKNOWN'] as const;
export type WaterLevelTrend = (typeof WATER_LEVEL_TRENDS)[number];
export const WEATHER_CONDITIONS = ['CLEAR', 'LIGHT_RAIN', 'MODERATE_RAIN', 'HEAVY_RAIN', 'STORM', 'UNKNOWN'] as const;
export type WeatherCondition = (typeof WEATHER_CONDITIONS)[number];
export const RISK_ASSESSMENT_STATUSES = ['ACTIVE', 'CLOSED', 'VOID'] as const;
export type RiskAssessmentStatus = (typeof RISK_ASSESSMENT_STATUSES)[number];
export const RISK_ASSESSMENT_MANUAL_CLOSURE_REASONS = [
  'INCIDENT_RESOLVED', 'HAZARD_NO_LONGER_ACTIVE', 'MONITORING_COMPLETED', 'OTHER'
] as const;
export type ManualRiskAssessmentClosureReason = (typeof RISK_ASSESSMENT_MANUAL_CLOSURE_REASONS)[number];
export const RISK_ASSESSMENT_CLOSURE_REASONS = ['REASSESSED', ...RISK_ASSESSMENT_MANUAL_CLOSURE_REASONS] as const;
export type RiskAssessmentClosureReason = (typeof RISK_ASSESSMENT_CLOSURE_REASONS)[number];
export const RISK_ASSESSMENT_DELETE_REASONS = [
  'CREATED_BY_MISTAKE', 'DUPLICATE_RECORD', 'INCORRECT_INFORMATION', 'OTHER'
] as const;
export type RiskAssessmentDeleteReason = (typeof RISK_ASSESSMENT_DELETE_REASONS)[number];
export const RISK_DECISION_REASON_MIN_LENGTH = 10;
export const RISK_DECISION_REASON_MAX_LENGTH = 500;

export type RiskAssessmentFactors = {
  hazardSeverity: HazardAssessmentSeverity;
  peopleAffected: number;
  vulnerablePeople: number;
  roadAccessibility: AssessmentRoadAccessibility;
  infrastructureImpact: InfrastructureImpact;
  waterLevelTrend: WaterLevelTrend;
  weatherCondition: WeatherCondition;
};
export type CalculateRiskAssessmentRequest = RiskAssessmentFactors & { incidentId: string };
export type CalculateRiskAssessmentResponse = { calculatedScore: number; systemSuggestedRisk: RiskLevel };
export type CreateRiskAssessmentRequest = CalculateRiskAssessmentRequest & {
  finalRiskLevel: RiskLevel;
  decisionReason?: string;
};
export type ReassessRiskAssessmentRequest = RiskAssessmentFactors & {
  finalRiskLevel: RiskLevel;
  decisionReason?: string;
  reassessmentReason: string;
};
export type CloseRiskAssessmentRequest = {
  closureReason: ManualRiskAssessmentClosureReason;
  closureNote?: string;
};
export type DeleteRiskAssessmentRequest = {
  deleteReason: RiskAssessmentDeleteReason;
  deleteNote?: string;
};
export type SafeRiskAssessment = CreateRiskAssessmentRequest & CalculateRiskAssessmentResponse & {
  id: string;
  assessedById: string;
  status: RiskAssessmentStatus;
  assessedAt: string;
  previousAssessmentId?: string;
  reassessmentReason?: string;
  closureReason?: RiskAssessmentClosureReason;
  closureNote?: string;
  closedAt?: string;
  closedById?: string;
  isDeleted: boolean;
  deletedAt?: string;
  deletedById?: string;
  deleteReason?: RiskAssessmentDeleteReason;
  deleteNote?: string;
  createdAt: string;
  updatedAt: string;
};
export type CloseRiskAssessmentResponse = { assessment: SafeRiskAssessment };
export type DeleteRiskAssessmentResponse = { assessment: SafeRiskAssessment };
// Report context is joined at read time, never copied into the stored assessment.
export type RiskAssessmentResponse = { assessment: SafeRiskAssessment; incident: SafeIncident; reports: SafeReport[] };
export type RiskAssessmentForIncidentResponse = { assessment: SafeRiskAssessment | null; incident: SafeIncident; reports: SafeReport[] };
export type RiskAssessmentHistoryResponse = { incidentId: string; assessments: SafeRiskAssessment[] };
export type GetVerifiedOfficerReportsResponse = { reports: SafeReport[] };

export type InitialAssessmentQueueResponse = { incidents: IncidentWithReportsResponse[] };
export type MonitoringAssessmentSummary = Pick<SafeRiskAssessment,
  'id' | 'finalRiskLevel' | 'calculatedScore' | 'status' | 'assessedAt' | 'closureReason' | 'closedAt'
>;
export type MonitoringReportSummary = Pick<SafeReport, 'id' | 'description' | 'severity' | 'verifiedAt'>;
export type MonitoringWarningSummary = Pick<SafeWarning,
  'id' | 'assessmentId' | 'status' | 'createdAt' | 'publishedAt'
>;
export type IncidentMonitoringSummary = {
  incident: SafeIncident;
  currentAssessment: MonitoringAssessmentSummary | null;
  latestAssessment: MonitoringAssessmentSummary | null;
  totalVerifiedReports: number;
  newVerifiedReportsSinceAssessment: number;
  latestVerifiedReportAt: string | null;
  hasNewVerifiedEvidence: boolean;
  warnings: MonitoringWarningSummary[];
};
export type IncidentMonitoringListResponse = { incidents: IncidentMonitoringSummary[] };
export type IncidentMonitoringDetailResponse = {
  monitoring: IncidentMonitoringSummary;
  recentVerifiedReports: MonitoringReportSummary[];
};

export const WARNING_RISK_LEVELS = ['HIGH', 'CRITICAL'] as const;
export type WarningRiskLevel = (typeof WARNING_RISK_LEVELS)[number];
export function canCreateWarning(riskLevel: RiskLevel): riskLevel is WarningRiskLevel {
  return riskLevel === 'HIGH' || riskLevel === 'CRITICAL';
}
export const WARNING_STATUSES = ['DRAFT', 'PUBLISHED'] as const;
export const WARNING_NOTIFICATION_SCOPES = ['AFFECTED_AREA', 'DISTRICT', 'WHOLE_COUNTRY'] as const;
export const NOTIFICATION_COUNTRY = 'Sri Lanka' as const;
export function normalizeNotificationLocation(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  return value.trim().normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '') || null;
}
export type WarningNotificationScope = (typeof WARNING_NOTIFICATION_SCOPES)[number];
export const WARNING_DISTRICTS = [
  'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo', 'Galle', 'Gampaha',
  'Hambantota', 'Jaffna', 'Kalutara', 'Kandy', 'Kegalle', 'Kilinochchi', 'Kurunegala',
  'Mannar', 'Matale', 'Matara', 'Monaragala', 'Mullaitivu', 'Nuwara Eliya', 'Polonnaruwa',
  'Puttalam', 'Ratnapura', 'Trincomalee', 'Vavuniya'
] as const;
export type WarningDistrict = (typeof WARNING_DISTRICTS)[number];
export type WarningNotificationTarget =
  | { scope: 'AFFECTED_AREA' }
  | { scope: 'DISTRICT'; district: WarningDistrict }
  | { scope: 'WHOLE_COUNTRY'; country?: typeof NOTIFICATION_COUNTRY };
export const WARNING_FIELD_LIMITS = {
  affectedArea: 300, requiredAction: 2000, unsafeRoads: 2000,
  safeRoutes: 2000, message: 4000, attachmentUrl: 500, attachments: 5
} as const;
export type CreateWarningRequest = {
  assessmentId: string;
  affectedArea: string;
  requiredAction: string;
  unsafeRoads: string;
  safeRoutes?: string;
  message: string;
  attachments?: string[];
};
export type SafeWarning = CreateWarningRequest & {
  id: string;
  hazardReportId: string;
  createdById: string;
  riskLevel: WarningRiskLevel;
  status: (typeof WARNING_STATUSES)[number];
  notificationTarget?: WarningNotificationTarget;
  publishedAt?: string;
  publishedById?: string;
  createdAt: string;
  updatedAt: string;
};
export type CreateWarningResponse = { warning: SafeWarning };
export type PublishWarningRequest = { notificationTarget: WarningNotificationTarget };
export type PublishWarningResponse = { warning: SafeWarning };
export type ResidentWarning = SafeWarning & { acknowledgedAt?: string; acknowledgementResponse?: WarningAcknowledgementResponse };
export type ResidentWarningsResponse = { warnings: ResidentWarning[] };
export type ResidentWarningResponse = { warning: ResidentWarning };
export const WARNING_ACKNOWLEDGEMENT_RESPONSES = ['SAFE', 'EVACUATING', 'NEED_ASSISTANCE'] as const;
export type WarningAcknowledgementResponse = (typeof WARNING_ACKNOWLEDGEMENT_RESPONSES)[number];
export type AcknowledgeWarningRequest = { response: WarningAcknowledgementResponse };
export type AcknowledgeWarningResponse = { warningId: string; response: WarningAcknowledgementResponse; acknowledgedAt: string };
export type ResidentWarningAcknowledgement = {
  warningId: string; residentId: string; response: WarningAcknowledgementResponse; acknowledgedAt: string;
  resident: { name: string; phoneNumber?: string; area?: string; district?: string; country?: string };
};
export type WarningAcknowledgementsResponse = {
  acknowledgements: ResidentWarningAcknowledgement[];
  summary: { total: number; safe: number; evacuating: number; needAssistance: number };
};
export const WARNING_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const WARNING_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type WarningImageMimeType = (typeof WARNING_IMAGE_MIME_TYPES)[number];
export const WARNING_ATTACHMENT_REFERENCE_PATTERN = /^\/api\/v1\/warning-attachments\/[a-f\d]{24}$/i;
export type UploadWarningImageRequest = { assessmentId: string; base64: string };
export type UploadWarningImageResponse = { reference: string };

export const REPORT_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED', 'CANCELLED', 'RESOLVED'] as const;

export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_VERIFICATION_ACTIONS = ['VERIFY'] as const;

export type ReportVerificationAction = (typeof REPORT_VERIFICATION_ACTIONS)[number];

export const REPORT_REVIEW_ACTIONS = ['VERIFY', 'REJECT'] as const;

export type ReportReviewAction = (typeof REPORT_REVIEW_ACTIONS)[number];

export const REPORT_REJECTION_REASON_MIN_LENGTH = 10;
export const REPORT_REJECTION_REASON_MAX_LENGTH = 500;
export const REPORT_VERIFICATION_NOTE_MAX_LENGTH = 500;
export const REPORT_VOICE_MAX_DURATION_SECONDS = 180;
export const REPORT_VOICE_MAX_BYTES = 3 * 1024 * 1024;
export const REPORT_VOICE_MIME_TYPES = ['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/webm'] as const;

export type ReportVoiceMimeType = (typeof REPORT_VOICE_MIME_TYPES)[number];

export type ReportVoiceEvidence = {
  mediaReference: string;
  contentType: ReportVoiceMimeType;
  durationSeconds: number;
};

export const HAZARD_TYPES = ['FLOOD', 'BLOCKED_ROAD', 'LANDSLIDE', 'OTHER'] as const;

export type HazardType = (typeof HAZARD_TYPES)[number];

export const REPORT_SEVERITIES = ['LOW', 'MODERATE', 'HIGH'] as const;

export type ReportSeverity = (typeof REPORT_SEVERITIES)[number];

export type GeoJsonPoint = {
  type: 'Point';
  coordinates: [longitude: number, latitude: number];
};

export const INCIDENT_STATUSES = ['ACTIVE', 'RESOLVED', 'CLOSED'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];
export const INCIDENT_MAX_REPORTS = 100;
// Candidate matching heuristics are intentionally centralized and configurable.
// They are product defaults, not official disaster-management standards.
export const INCIDENT_MATCH_RADIUS_METERS = 500;
export const INCIDENT_MATCH_TIME_WINDOW_HOURS = 2;

// Officers select report references; hazard, location and audit fields are server-owned.
export type CreateIncidentRequest = { reportIds: string[] };
export type AddIncidentReportRequest = { reportId: string };
export type SafeIncident = {
  id: string;
  hazardType: HazardType;
  location: GeoJsonPoint;
  reportIds: string[];
  status: IncidentStatus;
  createdById: string;
  createdAt: string;
  updatedAt: string;
};
export type IncidentResponse = { incident: SafeIncident };
export type IncidentWithReportsResponse = { incident: SafeIncident; reports: SafeReport[] };
export type GetActiveIncidentsResponse = { incidents: IncidentWithReportsResponse[] };
export type IncidentCandidate = {
  incidentId: string;
  hazardType: HazardType;
  location: GeoJsonPoint;
  reportCount: number;
  earliestReportAt: string;
  latestReportAt: string;
  distanceMeters: number;
};
export type IncidentCandidatesResponse = { candidates: IncidentCandidate[] };
export const INCIDENT_GROUPING_ACTIONS = ['CREATED', 'ATTACHED', 'ALREADY_ASSIGNED'] as const;
export type IncidentGroupingAction = (typeof INCIDENT_GROUPING_ACTIONS)[number];
export type AutomaticIncidentGrouping = {
  action: IncidentGroupingAction;
  incident: SafeIncident;
  candidate?: IncidentCandidate;
};

export type SafeCommunityReportClusterSummary = {
  id: string;
  hazardType: HazardType;
  centerLocation: GeoJsonPoint;
  firstReportedAt: string;
  lastReportedAt: string;
  reportCount: number;
  activeReportCount: number;
  pendingReportCount: number;
  verifiedReportCount: number;
  rejectedReportCount: number;
  cancelledReportCount: number;
  resolvedReportCount: number;
  highestSeverity: ReportSeverity;
  photoEvidenceCount: number;
  voiceEvidenceCount: number;
  fieldConfirmationCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CommunityClusterReportSummary = SafeReport & {
  fieldConfirmationCount: number;
};

export type CommunityClusterFieldConfirmationSummary = {
  id: string;
  reportId: string;
  outcome: 'CONFIRMED' | 'UNABLE_TO_CONFIRM';
  createdAt: string;
};

export type SafeCommunityReportClusterDetail = SafeCommunityReportClusterSummary & {
  reports: CommunityClusterReportSummary[];
  fieldConfirmations: CommunityClusterFieldConfirmationSummary[];
};

export type GetOfficerCommunityReportClustersResponse = {
  clusters: SafeCommunityReportClusterSummary[];
};

export type GetOfficerCommunityReportClusterResponse = {
  cluster: SafeCommunityReportClusterDetail;
};

export type CreateReportRequest = {
  hazardType: HazardType;
  otherHazardType?: string;
  description: string;
  severity: ReportSeverity;
  location: GeoJsonPoint;
  mediaReference?: string;
  voiceEvidence?: ReportVoiceEvidence;
};

export type UpdateResidentReportRequest = Partial<Omit<CreateReportRequest, 'voiceEvidence'>> & {
  voiceEvidence?: ReportVoiceEvidence | null;
};

export type SafeReport = {
  id: string;
  residentId: string;
  communityReportClusterId?: string;
  hazardType: HazardType;
  otherHazardType?: string;
  description: string;
  severity: ReportSeverity;
  location: GeoJsonPoint;
  mediaReference?: string;
  voiceEvidence?: ReportVoiceEvidence;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
  verifiedById?: string;
  verifiedAt?: string;
  verificationNote?: string;
  rejectedById?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  cancelledById?: string;
  cancelledAt?: string;
  verificationHistory?: ReportReviewEvent[];
};

export type ReportVerificationEvent = {
  action: ReportVerificationAction;
  verifiedById: string;
  verifiedAt: string;
  verificationNote?: string;
};

export type ReportRejectionEvent = {
  action: 'REJECT';
  rejectedById: string;
  rejectedAt: string;
  rejectionReason: string;
};

export type ReportReviewEvent = ReportVerificationEvent | ReportRejectionEvent;

export type ReportReviewRequest =
  | {
      action: 'VERIFY';
      verificationNote?: string | undefined;
    }
  | {
      action: 'REJECT';
      rejectionReason: string;
    };

export type CreateReportResponse = {
  report: SafeReport;
};

export type UpdateResidentReportResponse = {
  report: SafeReport;
};

export type CancelResidentReportResponse = {
  report: SafeReport;
};

export type UploadReportEvidenceResponse = {
  mediaReference: string;
  contentType: string;
  size: number;
  url?: string;
};

export type VerifyReportResponse = {
  report: SafeReport;
  grouping?: AutomaticIncidentGrouping;
};

export type ReviewReportResponse = VerifyReportResponse;

export type CommunityReportSummary = {
  id: string;
  communityReportClusterId?: string;
  hazardType: HazardType;
  description: string;
  severity: ReportSeverity;
  location: GeoJsonPoint;
  mediaReference?: string;
  voiceEvidence?: ReportVoiceEvidence;
  status: ReportStatus;
  createdAt: string;
  distanceKm?: number;
  relatedCommunityReportCount?: number;
};

export type GetCommunityReportsResponse = {
  reports: CommunityReportSummary[];
};

export type GetCommunityReportResponse = {
  report: CommunityReportSummary;
};

export type GetResidentReportsResponse = {
  reports: SafeReport[];
};

export type GetResidentReportResponse = {
  report: SafeReport;
};

export type GetPendingOfficerReportsResponse = {
  reports: SafeReport[];
};

export type GetPendingOfficerReportResponse = {
  report: SafeReport;
};

export const RESPONSE_STATUSES = [
  'NEW',
  'ASSIGNED',
  'DISPATCHED',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED'
] as const;

export type ResponseStatus = (typeof RESPONSE_STATUSES)[number];

// Cancellation branches before assignment; it is not another responder progress stage.
export const RESPONSE_CANCELLABLE_STATUS = 'NEW' satisfies ResponseStatus;

export const RESPONSE_PROGRESS_ACTIONS = {
  ASSIGNED: 'Start Dispatch',
  DISPATCHED: 'Mark as Arrived',
  ARRIVED: 'Start Assistance',
  IN_PROGRESS: 'Complete Request',
  COMPLETED: 'No further action'
} as const;

export const RESPONSE_ACTIVE_ASSIGNED_STATUSES = [
  'ASSIGNED',
  'DISPATCHED',
  'ARRIVED',
  'IN_PROGRESS'
] as const;

export type ResponseProgressActionStatus = keyof typeof RESPONSE_PROGRESS_ACTIONS;

const RESPONSE_PROGRESS_SEQUENCE_STEPS: ReadonlyArray<ResponseProgressActionStatus> = [
  'ASSIGNED',
  'DISPATCHED',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED'
];

const RESPONSE_PROGRESS_NEXT_STATUS: Record<ResponseProgressActionStatus, ResponseProgressActionStatus> = {
  ASSIGNED: 'DISPATCHED',
  DISPATCHED: 'ARRIVED',
  ARRIVED: 'IN_PROGRESS',
  IN_PROGRESS: 'COMPLETED',
  COMPLETED: 'COMPLETED'
};

export function getNextResponseProgressStatus(
  currentStatus: ResponseStatus
): ResponseStatus | null {
  if (currentStatus === 'NEW') {
    return null;
  }

  if (currentStatus === 'COMPLETED' || currentStatus === 'CANCELLED') {
    return null;
  }

  const progressStatus = currentStatus as ResponseProgressActionStatus;

  if (!(progressStatus in RESPONSE_PROGRESS_NEXT_STATUS)) {
    return null;
  }

  return RESPONSE_PROGRESS_NEXT_STATUS[progressStatus];
}

export function isValidResponseProgressTransition(
  currentStatus: ResponseStatus,
  nextStatus: ResponseStatus
): boolean {
  if (currentStatus === nextStatus) {
    return false;
  }

  if (currentStatus === 'NEW') {
    return false;
  }

  if (currentStatus === 'COMPLETED' || currentStatus === 'CANCELLED') {
    return false;
  }

  const expectedNextStatus = getNextResponseProgressStatus(currentStatus);

  return expectedNextStatus !== null && expectedNextStatus === nextStatus;
}

export function getResponseProgressAction(
  currentStatus: ResponseStatus
): { nextStatus: ResponseStatus; label: string } | null {
  if (currentStatus === 'NEW' || currentStatus === 'COMPLETED' || currentStatus === 'CANCELLED') {
    return null;
  }

  const nextStatus = getNextResponseProgressStatus(currentStatus);

  if (!nextStatus) {
    return null;
  }

  return {
    nextStatus,
    label: RESPONSE_PROGRESS_ACTIONS[currentStatus as ResponseProgressActionStatus]
  };
}

// LDFEW-121 begins after a request has already been assigned.
// NEW -> ASSIGNED is handled by LDFEW-130 accept/decline logic and is intentionally excluded here.
export const RESPONSE_PROGRESS_SEQUENCE = RESPONSE_PROGRESS_SEQUENCE_STEPS;

export const EMERGENCY_ASSISTANCE_TYPES = [
  'RESCUE_EVACUATION',
  'MEDICAL_ASSISTANCE',
  'FLOOD_ASSISTANCE',
  'SHELTER_RELOCATION',
  'OTHER'
] as const;

export type EmergencyAssistanceType = (typeof EMERGENCY_ASSISTANCE_TYPES)[number];

export const ROAD_ACCESSIBILITIES = ['ACCESSIBLE', 'LIMITED', 'BLOCKED', 'UNKNOWN'] as const;

export type RoadAccessibility = (typeof ROAD_ACCESSIBILITIES)[number];

export type VulnerablePeopleCounts = {
  children: number;
  elderlyPeople: number;
  personsWithDisabilities: number;
  pregnantPersons: number;
};

export type ResponseRequestContact = {
  name: string;
  phoneNumber: string;
  email?: string;
};

export type CreateResponseRequestRequest = {
  assistanceType: EmergencyAssistanceType;
  location: GeoJsonPoint;
  affectedPeople: number;
  medicalNeeds: boolean;
  injuredPeople: number;
  vulnerablePeople: VulnerablePeopleCounts;
  roadAccessibility: RoadAccessibility;
  contact: ResponseRequestContact;
  description: string;
  specialRequirements?: string;
};

export type SafeResponseRequest = {
  id: string;
  residentId: string;
  // Set when the emergency request is assigned to a specific responder.
  assignedResponderId?: string;
  // Keeps responder-specific declines without changing the emergency status.
  declinedByResponderIds?: string[];
  acceptedAt?: string;
  dispatchedAt?: string;
  arrivedAt?: string;
  inProgressAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  assistanceType: EmergencyAssistanceType;
  location: GeoJsonPoint;
  affectedPeople: number;
  medicalNeeds: boolean;
  injuredPeople: number;
  vulnerablePeople: VulnerablePeopleCounts;
  roadAccessibility: RoadAccessibility;
  contact: ResponseRequestContact;
  description: string;
  specialRequirements?: string;
  status: ResponseStatus;
  createdAt: string;
  updatedAt: string;
};

export type CreateResponseRequestResponse = {
  responseRequest: SafeResponseRequest;
};

export type CancelResponseRequestResponse = {
  responseRequest: SafeResponseRequest;
};

export type GetResidentResponseRequestsResponse = {
  responseRequests: SafeResponseRequest[];
};

export type GetResidentResponseRequestResponse = {
  responseRequest: SafeResponseRequest;
};

export const SYNC_OPERATION_TYPES = [
  'REPORT_CREATE',
  'FIELD_CONFIRMATION_CREATE',
  'RESPONSE_STATUS_UPDATE',
  'FIELD_UPDATE_CREATE'
] as const;

export type SyncOperationType = (typeof SYNC_OPERATION_TYPES)[number];

export type SafeUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

export type RegisterRequest = {
  name: string;
  email: string;
  password: string;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type AuthResponse = {
  user: SafeUser;
  accessToken: string;
  refreshToken: string;
};

export type RefreshRequest = {
  refreshToken: string;
};

export type LogoutRequest = {
  refreshToken: string;
};

export type MeResponse = {
  user: SafeUser;
};

export type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
  };
};

export const UNABLE_TO_CONFIRM_REASONS = [
  'Situation no longer exists',
  'Location does not match',
  'Report information is incorrect',
  'Unable to access location',
  'Other'
] as const;
export const FIELD_CONFIRMATION_REASON_MAX_LENGTH = 500;
export const FIELD_CONFIRMATION_OBSERVATION_MAX_LENGTH = 1000;
export type UnableToConfirmReason = (typeof UNABLE_TO_CONFIRM_REASONS)[number];
export type FieldVerificationChecklist = {
  locationMatches: boolean;
  photoMatches: boolean;
  situationStillExists: boolean;
  severityAppearsCorrect: boolean;
};
export type CreateFieldConfirmationRequest =
  | {
      outcome: 'CONFIRMED';
      verificationChecklist: FieldVerificationChecklist;
      observation?: string;
      mediaReference?: string;
    }
  | { outcome: 'UNABLE_TO_CONFIRM'; reason: UnableToConfirmReason; reasonDetails?: string };
export type FieldConfirmation = CreateFieldConfirmationRequest & {
  id: string;
  reportId: string;
  volunteerId: string;
  status: 'PENDING';
  createdAt: string;
  updatedAt: string;
};
export type CreateFieldConfirmationResponse = { confirmation: FieldConfirmation };
export type GetFieldConfirmationsResponse = { confirmations: FieldConfirmation[] };
export type ResidentFieldConfirmation = FieldConfirmation extends infer T
  ? T extends FieldConfirmation
    ? Omit<T, 'volunteerId'>
    : never
  : never;
export type GetResidentFieldConfirmationsResponse = { confirmations: ResidentFieldConfirmation[] };

// LDFEW-127: targeted SMS (Notify.lk) and push (Firebase Cloud Messaging) delivery for
// published HIGH/CRITICAL warnings. Channels are independent; each attempt is recorded
// separately so one provider failure never affects the other.
export const NOTIFICATION_CHANNELS = ['SMS', 'PUSH'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_DELIVERY_STATUSES = ['SENT', 'FAILED', 'SKIPPED'] as const;
export type NotificationDeliveryStatus = (typeof NOTIFICATION_DELIVERY_STATUSES)[number];

export const NOTIFICATION_PROVIDERS = ['NOTIFY_LK', 'FCM', 'MOCK'] as const;
export type NotificationProvider = (typeof NOTIFICATION_PROVIDERS)[number];

export const NOTIFICATION_SKIP_REASONS = [
  'INVALID_OR_MISSING_PHONE',
  'MISSING_PUSH_TOKEN',
  'PROVIDER_NOT_CONFIGURED'
] as const;
export type NotificationSkipReason = (typeof NOTIFICATION_SKIP_REASONS)[number];

// Notification delivery is only attempted for these persisted warning risk levels.
export const NOTIFIABLE_WARNING_RISK_LEVELS = WARNING_RISK_LEVELS;
export type NotifiableWarningRiskLevel = (typeof NOTIFIABLE_WARNING_RISK_LEVELS)[number];

export type SafeWarningNotificationDelivery = {
  id: string;
  warningId: string;
  recipientId: string;
  channel: NotificationChannel;
  status: NotificationDeliveryStatus;
  provider?: NotificationProvider;
  providerMessageId?: string;
  providerStatus?: string;
  skipReason?: NotificationSkipReason;
  errorCode?: string;
  errorMessage?: string;
  sentAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type WarningNotificationChannelSummary = {
  sent: number;
  failed: number;
  skipped: number;
};

export type WarningNotificationSummary = {
  warningId: string;
  riskLevel: WarningRiskLevel;
  scope: WarningNotificationScope;
  recipientCount: number;
  sms: WarningNotificationChannelSummary;
  push: WarningNotificationChannelSummary;
};

// Notify.lk accepts up to 621 characters; SafeAlert keeps emergency SMS shorter than that.
export const NOTIFICATION_SMS_MAX_LENGTH = 621;

export const NOTIFICATION_PROFILE_FIELD_LIMITS = {
  area: 300,
  district: 120,
  country: 120,
  phoneNumber: 24,
  pushToken: 4096
} as const;

// Own-profile notification contact details. Location values are stored normalized by the
// backend (trimmed, lowercased, punctuation removed) so scope targeting can match them.
export type NotificationProfile = {
  area?: string;
  district?: string;
  country?: string;
  phoneNumber?: string;
  pushToken?: string;
};

// Undefined is included explicitly so parsed request bodies can be passed straight through
// with `exactOptionalPropertyTypes` enabled.
export type UpdateNotificationProfileRequest = {
  area?: string | null | undefined;
  district?: string | null | undefined;
  country?: string | null | undefined;
  phoneNumber?: string | null | undefined;
  pushToken?: string | null | undefined;
};

export type NotificationProfileResponse = { profile: NotificationProfile };
