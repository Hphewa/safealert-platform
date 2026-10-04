import { NOTIFICATION_COUNTRY, type SafeWarning } from '@safealert/contracts';
import type {
  NotificationRecipient,
  NotificationRecipientQuery
} from './repositories/notificationRecipient.repository.js';
import { normalizeLocationValue } from './utils/normalizeLocationValue.js';

/**
 * Maps the persisted notification scope stored on the warning to a recipient query.
 * The contract calls the country-wide scope WHOLE_COUNTRY (the LDFEW-127 brief's COUNTRY).
 * Recipients are never accepted from the client; the scope always comes from the warning.
 */
export function resolveRecipientQuery(warning: SafeWarning, _countryName: string): NotificationRecipientQuery {
  void _countryName; // Kept for existing callers; country is fixed by this deployment.
  const target = warning.notificationTarget;

  if (target?.scope === 'DISTRICT') {
    return { scope: 'DISTRICT', district: normalizeLocationValue(target.district) };
  }

  if (target?.scope === 'WHOLE_COUNTRY') {
    return { scope: 'WHOLE_COUNTRY', country: normalizeLocationValue(target.country ?? NOTIFICATION_COUNTRY)! };
  }

  return { scope: 'AFFECTED_AREA', area: normalizeLocationValue(warning.affectedArea) };
}

/**
 * Pure matching rule shared by the in-memory repository and tests. The Mongoose repository
 * expresses the same rule as a database filter.
 */
export function matchesNotificationTarget(recipient: NotificationRecipient, query: NotificationRecipientQuery) {
  if (query.scope === 'WHOLE_COUNTRY') {
    const country = normalizeLocationValue(recipient.country);

    // Missing country is not evidence of residence in the selected country.
    return country !== null && country === query.country;
  }

  const expected = query.scope === 'AFFECTED_AREA' ? query.area : query.district;
  const actual = normalizeLocationValue(
    query.scope === 'AFFECTED_AREA' ? recipient.area : recipient.district
  );

  return expected !== null && actual !== null && expected === actual;
}

// Log-safe description of a target. Resident contact details are never included.
export function describeRecipientQuery(query: NotificationRecipientQuery) {
  if (query.scope === 'AFFECTED_AREA') return `AFFECTED_AREA:${query.area ?? 'unresolved'}`;
  if (query.scope === 'DISTRICT') return `DISTRICT:${query.district ?? 'unresolved'}`;

  return `WHOLE_COUNTRY:${query.country || 'unresolved'}`;
}
