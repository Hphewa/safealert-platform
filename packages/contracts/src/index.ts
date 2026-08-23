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
};

export type CreateReportResponse = {
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

