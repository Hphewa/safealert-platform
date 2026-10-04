import type { SafeWarning, WarningNotificationTarget } from '@safealert/contracts';

export type CreateWarningInput = Omit<SafeWarning, 'id' | 'createdAt' | 'updatedAt'>;
// LDFEW-115: only these content fields may ever be updated. Relationships,
// risk level, status, creator, and publication data are excluded by type.
export type UpdateWarningInput = Partial<Pick<SafeWarning,
  'affectedArea' | 'requiredAction' | 'unsafeRoads' | 'safeRoutes' | 'message' | 'attachments'>>;
export interface WarningRepository {
  create(input: CreateWarningInput): Promise<SafeWarning>;
  findById(id: string): Promise<SafeWarning | null>;
  findByAssessmentIds(assessmentIds: string[]): Promise<SafeWarning[]>;
  findByAssessmentId(assessmentId: string): Promise<SafeWarning | null>;
  publish(id: string, publishedById: string, publishedAt: string, notificationTarget: WarningNotificationTarget): Promise<SafeWarning | null>;
  update(id: string, changes: UpdateWarningInput): Promise<SafeWarning | null>;
  cancel(id: string, cancelledById: string, cancelledAt: string): Promise<SafeWarning | null>;
  archive(id: string, archivedById: string, archivedAt: string): Promise<SafeWarning | null>;
}

