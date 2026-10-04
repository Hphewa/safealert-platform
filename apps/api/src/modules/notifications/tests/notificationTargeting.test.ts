import { describe, expect, it } from 'vitest';
import { resolveRecipientQuery, describeRecipientQuery, matchesNotificationTarget } from '../notificationTargeting.js';
import { buildResidentFilter } from '../repositories/mongooseNotificationRecipient.repository.js';
import { publishedWarning, resident } from './notification.fixtures.js';

describe('LDFEW-127 notification targeting rules', () => {
  it('reads the scope from the persisted warning instead of accepting recipients from the client', () => {
    expect(resolveRecipientQuery(publishedWarning(), 'Sri Lanka')).toEqual({
      scope: 'AFFECTED_AREA',
      area: 'riversidevillage'
    });
    expect(resolveRecipientQuery(publishedWarning({ notificationTarget: { scope: 'DISTRICT', district: 'Nuwara Eliya' } }), 'Sri Lanka'))
      .toEqual({ scope: 'DISTRICT', district: 'nuwaraeliya' });
    expect(resolveRecipientQuery(publishedWarning({ notificationTarget: { scope: 'WHOLE_COUNTRY' } }), 'Sri Lanka'))
      .toEqual({ scope: 'WHOLE_COUNTRY', country: 'srilanka' });
  });

  it('falls back to the affected area when a published warning has no stored scope', () => {
    const warning = publishedWarning();
    delete (warning as { notificationTarget?: unknown }).notificationTarget;

    expect(resolveRecipientQuery(warning, 'Sri Lanka')).toEqual({ scope: 'AFFECTED_AREA', area: 'riversidevillage' });
  });

  it('matches an area target case-insensitively and ignores characters such as punctuation', () => {
    expect(matchesNotificationTarget(resident({ area: '  Riverside-Village ' }), { scope: 'AFFECTED_AREA', area: 'riversidevillage' })).toBe(true);
    expect(matchesNotificationTarget(resident({ area: 'Hill Town' }), { scope: 'AFFECTED_AREA', area: 'riversidevillage' })).toBe(false);
    expect(matchesNotificationTarget(resident({ area: null }), { scope: 'AFFECTED_AREA', area: 'riversidevillage' })).toBe(false);
    expect(matchesNotificationTarget(resident(), { scope: 'AFFECTED_AREA', area: null })).toBe(false);
  });

  it('matches a district target and a country target', () => {
    expect(matchesNotificationTarget(resident({ district: 'Colombo' }), { scope: 'DISTRICT', district: 'colombo' })).toBe(true);
    expect(matchesNotificationTarget(resident({ district: 'Galle' }), { scope: 'DISTRICT', district: 'colombo' })).toBe(false);
    expect(matchesNotificationTarget(resident({ country: 'Sri Lanka' }), { scope: 'WHOLE_COUNTRY', country: 'srilanka' })).toBe(true);
    expect(matchesNotificationTarget(resident({ country: null }), { scope: 'WHOLE_COUNTRY', country: 'srilanka' })).toBe(false);
    expect(matchesNotificationTarget(resident({ country: 'India' }), { scope: 'WHOLE_COUNTRY', country: 'srilanka' })).toBe(false);
  });

  it('builds resident-only filters for every scope', () => {
    expect(buildResidentFilter({ scope: 'AFFECTED_AREA', area: 'riversidevillage' }))
      .toEqual({ role: 'RESIDENT', isActive: true, area: 'riversidevillage' });
    expect(buildResidentFilter({ scope: 'DISTRICT', district: 'colombo' }))
      .toEqual({ role: 'RESIDENT', isActive: true, district: 'colombo' });
    expect(buildResidentFilter({ scope: 'WHOLE_COUNTRY', country: 'srilanka' })).toEqual({
      role: 'RESIDENT',
      isActive: true,
      country: 'srilanka'
    });
  });

  it('never matches a stored resident when a target could not be normalized', () => {
    expect(buildResidentFilter({ scope: 'AFFECTED_AREA', area: null }))
      .toEqual({ role: 'RESIDENT', isActive: true, _id: { $exists: false } });
    expect(buildResidentFilter({ scope: 'DISTRICT', district: null }))
      .toEqual({ role: 'RESIDENT', isActive: true, _id: { $exists: false } });
  });

  it('describes a target for logs without resident contact details', () => {
    expect(describeRecipientQuery({ scope: 'AFFECTED_AREA', area: 'riversidevillage' })).toBe('AFFECTED_AREA:riversidevillage');
    expect(describeRecipientQuery({ scope: 'DISTRICT', district: null })).toBe('DISTRICT:unresolved');
    expect(describeRecipientQuery({ scope: 'WHOLE_COUNTRY', country: 'srilanka' })).toBe('WHOLE_COUNTRY:srilanka');
  });
});
