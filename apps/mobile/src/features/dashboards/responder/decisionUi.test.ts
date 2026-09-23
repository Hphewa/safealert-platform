import type { SafeResponseRequest } from '@safealert/contracts';
import { describe, expect, it } from 'vitest';

import {
  canShowResponderDecisionActions,
  decisionButtonLabel,
  isResponderDecisionBusy
} from './decisionUi';

const request = (status: SafeResponseRequest['status'], id = 'request-1'): SafeResponseRequest => ({
  id,
  residentId: 'resident-1',
  assistanceType: 'MEDICAL_ASSISTANCE',
  location: { type: 'Point', coordinates: [79.8612, 6.9271] },
  affectedPeople: 1,
  medicalNeeds: false,
  injuredPeople: 0,
  vulnerablePeople: {
    children: 0,
    elderlyPeople: 0,
    personsWithDisabilities: 0,
    pregnantPersons: 0
  },
  roadAccessibility: 'ACCESSIBLE',
  contact: { name: 'Resident User', phoneNumber: '+94-77-555-1234' },
  description: 'Assistance is needed.',
  status,
  createdAt: '2026-09-23T10:00:00.000Z',
  updatedAt: '2026-09-23T10:00:00.000Z'
});

describe('responder decision UI rules', () => {
  it('shows decisions only for valid NEW requests', () => {
    expect(canShowResponderDecisionActions(request('NEW'))).toBe(true);
    expect(canShowResponderDecisionActions(request('ASSIGNED'))).toBe(false);
    expect(canShowResponderDecisionActions(request('COMPLETED'))).toBe(false);
    expect(canShowResponderDecisionActions(request('NEW', ''))).toBe(false);
    expect(canShowResponderDecisionActions(null)).toBe(false);
  });

  it('marks both actions busy during either decision', () => {
    expect(isResponderDecisionBusy('idle')).toBe(false);
    expect(isResponderDecisionBusy('accepting')).toBe(true);
    expect(isResponderDecisionBusy('declining')).toBe(true);
  });

  it('uses clear labels for idle and processing actions', () => {
    expect(decisionButtonLabel('idle', 'accept')).toBe('Accept Request');
    expect(decisionButtonLabel('idle', 'decline')).toBe('Decline Request');
    expect(decisionButtonLabel('accepting', 'accept')).toBe('Accepting...');
    expect(decisionButtonLabel('accepting', 'decline')).toBe('Decline Request');
    expect(decisionButtonLabel('declining', 'decline')).toBe('Declining...');
  });
});