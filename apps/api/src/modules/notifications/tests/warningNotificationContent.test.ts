import { describe, expect, it } from 'vitest';
import { NOTIFICATION_SMS_MAX_LENGTH } from '@safealert/contracts';
import { buildWarningPushMessage, buildWarningSmsMessage } from '../warningNotificationContent.js';
import { publishedWarning } from './notification.fixtures.js';

describe('LDFEW-127 notification content', () => {
  it('builds concise SMS content from persisted warning fields only', () => {
    const warning = publishedWarning();

    expect(buildWarningSmsMessage(warning)).toBe([
      'SAFEALERT - HIGH WARNING',
      'Affected Area: Riverside village',
      'Flood water is rising near homes.',
      'Required Action:\nMove to the community hall.',
      'Unsafe Roads:\nRiver Road bridge',
      'Safe Routes:\nHill Road'
    ].join('\n\n'));
  });

  it('uses the persisted risk level in the title', () => {
    expect(buildWarningSmsMessage(publishedWarning({ riskLevel: 'CRITICAL' }))).toContain('SAFEALERT - CRITICAL WARNING');
    expect(buildWarningPushMessage(publishedWarning({ riskLevel: 'CRITICAL' })).title).toBe('SAFEALERT - CRITICAL WARNING');
  });

  it('omits safe routes when the warning does not have them', () => {
    const warning = publishedWarning();
    delete (warning as { safeRoutes?: string }).safeRoutes;

    expect(buildWarningSmsMessage(warning)).not.toContain('Safe Routes');
  });

  it('keeps a long emergency message inside the documented provider limit', () => {
    const warning = publishedWarning({ message: 'x'.repeat(4000) });

    const message = buildWarningSmsMessage(warning);

    expect(message.length).toBe(NOTIFICATION_SMS_MAX_LENGTH);
  });

  it('builds the push payload with title, body and navigation data', () => {
    const warning = publishedWarning();

    expect(buildWarningPushMessage(warning)).toEqual({
      title: 'SAFEALERT - HIGH WARNING',
      body: 'Riverside village\nFlood water is rising near homes.\nMove to the community hall.',
      data: { warningId: warning.id, riskLevel: 'HIGH', affectedArea: 'Riverside village' }
    });
  });
});