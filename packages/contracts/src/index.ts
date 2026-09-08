export const USER_ROLES = [
  'RESIDENT',
  'COMMUNITY_VOLUNTEER',
  'DISASTER_OFFICER',
  'EMERGENCY_RESPONDER'
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const RISK_LEVELS = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'] as const;

export type RiskLevel = (typeof RISK_LEVELS)[number];

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

