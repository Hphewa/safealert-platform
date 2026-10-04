import { NOTIFICATION_SMS_MAX_LENGTH, type SafeWarning, type WarningRiskLevel } from '@safealert/contracts';
import { truncate } from './utils/redactSecrets.js';

const pushBodyMaxLength = 500;

export function buildWarningNotificationTitle(riskLevel: WarningRiskLevel) {
  return `SAFEALERT - ${riskLevel} WARNING`;
}

/**
 * SMS content is generated from persisted warning data only. Nothing is invented and no
 * officer-supplied value is transformed beyond trimming.
 */
export function buildWarningSmsMessage(warning: SafeWarning): string {
  const safeRoutes = warning.safeRoutes?.trim();
  const sections = [
    buildWarningNotificationTitle(warning.riskLevel),
    `Affected Area: ${warning.affectedArea.trim()}`,
    warning.message.trim(),
    `Required Action:\n${warning.requiredAction.trim()}`,
    `Unsafe Roads:\n${warning.unsafeRoads.trim()}`,
    ...(safeRoutes ? [`Safe Routes:\n${safeRoutes}`] : [])
  ];

  return truncate(sections.join('\n\n'), NOTIFICATION_SMS_MAX_LENGTH);
}

export type WarningPushMessage = {
  title: string;
  body: string;
  data: {
    warningId: string;
    riskLevel: WarningRiskLevel;
    affectedArea: string;
  };
};

export function buildWarningPushMessage(warning: SafeWarning): WarningPushMessage {
  return {
    title: buildWarningNotificationTitle(warning.riskLevel),
    body: truncate(
      [warning.affectedArea.trim(), warning.message.trim(), warning.requiredAction.trim()].join('\n'),
      pushBodyMaxLength
    ),
    data: {
      warningId: warning.id,
      riskLevel: warning.riskLevel,
      affectedArea: warning.affectedArea.trim()
    }
  };
}