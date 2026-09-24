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
export type CalculateRiskAssessmentRequest = RiskAssessmentFactors & { hazardReportId: string };
export type CalculateRiskAssessmentResponse = { calculatedScore: number; systemSuggestedRisk: RiskLevel };
export type CreateRiskAssessmentRequest = CalculateRiskAssessmentRequest & {
  finalRiskLevel: RiskLevel;
  decisionReason?: string;
};
export type SafeRiskAssessment = CreateRiskAssessmentRequest & CalculateRiskAssessmentResponse & {
  id: string;
  assessedById: string;
  status: RiskAssessmentStatus;
  assessedAt: string;
  createdAt: string;
  updatedAt: string;
};
// Report context is joined at read time, never copied into the stored assessment.
export type RiskAssessmentResponse = { assessment: SafeRiskAssessment; report: SafeReport };
export type RiskAssessmentForReportResponse = { assessment: SafeRiskAssessment | null; report: SafeReport };
export type GetVerifiedOfficerReportsResponse = { reports: SafeReport[] };

export const REPORT_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED', 'RESOLVED'] as const;

export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_VERIFICATION_ACTIONS = ['VERIFY'] as const;

export type ReportVerificationAction = (typeof REPORT_VERIFICATION_ACTIONS)[number];

export const REPORT_REVIEW_ACTIONS = ['VERIFY', 'REJECT'] as const;

export type ReportReviewAction = (typeof REPORT_REVIEW_ACTIONS)[number];

export const REPORT_REJECTION_REASON_MIN_LENGTH = 10;
export const REPORT_REJECTION_REASON_MAX_LENGTH = 500;

export const HAZARD_TYPES = ['FLOOD', 'BLOCKED_ROAD', 'LANDSLIDE', 'OTHER'] as const;

export type HazardType = (typeof HAZARD_TYPES)[number];

export const REPORT_SEVERITIES = ['LOW', 'MODERATE', 'HIGH'] as const;

export type ReportSeverity = (typeof REPORT_SEVERITIES)[number];

export type GeoJsonPoint = {
  type: 'Point';
  coordinates: [longitude: number, latitude: number];
};

export type CreateReportRequest = {
  hazardType: HazardType;
  description: string;
  severity: ReportSeverity;
  location: GeoJsonPoint;
  mediaReference?: string;
};

export type SafeReport = {
  id: string;
  residentId: string;
  hazardType: HazardType;
  description: string;
  severity: ReportSeverity;
  location: GeoJsonPoint;
  mediaReference?: string;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
  verifiedById?: string;
  verifiedAt?: string;
  rejectedById?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  verificationHistory?: ReportReviewEvent[];
};

export type ReportVerificationEvent = {
  action: ReportVerificationAction;
  verifiedById: string;
  verifiedAt: string;
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
    }
  | {
      action: 'REJECT';
      rejectionReason: string;
    };

export type CreateReportResponse = {
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
};

export type ReviewReportResponse = VerifyReportResponse;

export type CommunityReportSummary = {
  id: string;
  hazardType: HazardType;
  description: string;
  severity: ReportSeverity;
  location: GeoJsonPoint;
  mediaReference?: string;
  status: ReportStatus;
  createdAt: string;
  distanceKm?: number;
};

export type GetCommunityReportsResponse = {
  reports: CommunityReportSummary[];
};

export type GetCommunityReportResponse = {
  report: CommunityReportSummary;
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
  'COMPLETED'
] as const;

export type ResponseStatus = (typeof RESPONSE_STATUSES)[number];

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

  if (currentStatus === 'COMPLETED') {
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

  if (currentStatus === 'COMPLETED') {
    return false;
  }

  const expectedNextStatus = getNextResponseProgressStatus(currentStatus);

  return expectedNextStatus !== null && expectedNextStatus === nextStatus;
}

export function getResponseProgressAction(
  currentStatus: ResponseStatus
): { nextStatus: ResponseStatus; label: string } | null {
  if (currentStatus === 'NEW' || currentStatus === 'COMPLETED') {
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
export type UnableToConfirmReason = (typeof UNABLE_TO_CONFIRM_REASONS)[number];
export type CreateFieldConfirmationRequest =
  | { outcome: 'CONFIRMED' }
  | { outcome: 'UNABLE_TO_CONFIRM'; reason: UnableToConfirmReason; reasonDetails?: string };
export type FieldConfirmation = CreateFieldConfirmationRequest & {
  id: string;
  reportId: string;
  volunteerId: string;
  status: 'PENDING';
  createdAt: string;
};
export type CreateFieldConfirmationResponse = { confirmation: FieldConfirmation };
export type GetFieldConfirmationsResponse = { confirmations: FieldConfirmation[] };
