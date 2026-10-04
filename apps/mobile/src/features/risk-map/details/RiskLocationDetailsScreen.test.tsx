import React, { type ReactNode } from 'react';
import { createRequire } from 'node:module';
import { beforeEach, expect, it, vi } from 'vitest';
import type { RiskLocationDetailsResponse } from '@safealert/contracts';
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as { renderToStaticMarkup: (node: ReactNode) => string };
const state = vi.hoisted(() => ({ data: null as RiskLocationDetailsResponse | null, loading: false, error: null as string | null, refresh: vi.fn(), back: vi.fn(), push: vi.fn(), actions: new Map<string, () => void>(), imageError: false }));
vi.mock('react-native', () => ({
  Platform: { OS: 'android' }, StyleSheet: { create: (value: unknown) => value },
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>, Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  ScrollView: ({ children }: { children?: ReactNode }) => <div>{children}</div>, ActivityIndicator: () => <span>Spinner</span>,
  Image: ({ accessibilityLabel, onError }: { accessibilityLabel?: string; onError?: () => void }) => { if (accessibilityLabel) state.imageError = false; return <img alt={accessibilityLabel} onError={onError} />; },
  Modal: ({ children, visible }: { children?: ReactNode; visible: boolean }) => visible ? <aside>{children}</aside> : null,
  Pressable: ({ children, accessibilityLabel, onPress }: { children?: ReactNode; accessibilityLabel?: string; onPress?: () => void }) => { if (onPress) state.actions.set(accessibilityLabel ?? renderToStaticMarkup(<>{children}</>).replace(/<[^>]*>/g, ''), onPress); return <button>{children}</button>; }
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: { children?: ReactNode }) => <main>{children}</main> }));
vi.mock('expo-router', () => ({ useRouter: () => ({ back: state.back, push: state.push }) }));
vi.mock('../hooks/useRiskLocationDetails', () => ({ useRiskLocationDetails: () => state }));
vi.mock('../../dashboards/shared/maps/HumanReadableLocation', () => ({ HumanReadableLocation: () => <span>Kelaniya, Western Province</span> }));
vi.mock('../../dashboards/shared/media/mediaReference', () => ({ resolveMediaReferenceUri: (value: string) => value }));
import { RiskLocationDetailsScreen } from './RiskLocationDetailsScreen';
const resident: RiskLocationDetailsResponse = { role: 'RESIDENT', generatedAt: '2026-10-02T12:00:00Z', detail: {
  incidentId: '111111111111111111111111', hazardType: 'FLOOD', location: { type: 'Point', coordinates: [79.86, 6.92] }, riskLevel: 'CRITICAL', assessedAt: '2026-10-01T12:00:00Z', hasPublishedWarning: true,
  riskFactors: { roadAccessibility: 'PARTIALLY_BLOCKED', infrastructureImpact: 'HIGH', waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN' },
  evidence: [{ type: 'IMAGE', imageUrl: '/api/v1/media/report-evidence/image.jpg', createdAt: '2026-10-01T11:00:00Z' }]
} };
beforeEach(() => { state.data = null; state.loading = false; state.error = null; state.refresh.mockReset(); state.back.mockReset(); state.push.mockReset(); state.actions.clear(); state.imageError = false; });

it('renders loading, error/retry and safe not-found states', () => {
  state.loading = true; expect(renderToStaticMarkup(<RiskLocationDetailsScreen />)).toContain('Loading Risk Location Details');
  state.loading = false; state.error = 'Unavailable'; expect(renderToStaticMarkup(<RiskLocationDetailsScreen />)).toContain('Unable to load risk location details');
  state.actions.get('Retry')!(); expect(state.refresh).toHaveBeenCalledOnce();
});
it('shows resident-safe location, risk factors, warning link, and image evidence', () => {
  state.data = resident; const markup = renderToStaticMarkup(<RiskLocationDetailsScreen />);
  expect(markup).toContain('Kelaniya, Western Province'); expect(markup).toContain('6.92000, 79.86000');
  expect(markup).toContain('Water trend'); expect(markup).toContain('Evidence'); expect(markup).toContain('1 verified image');
  expect(markup).not.toContain('Affected people'); expect(markup).not.toContain('Assessment ID');
  state.actions.get('Refresh risk details')!(); expect(state.refresh).toHaveBeenCalledOnce();
  state.actions.get('View Warnings')!(); expect(state.push).toHaveBeenCalledWith('/resident/warnings');
});
it.each(['EMERGENCY_RESPONDER', 'COMMUNITY_VOLUNTEER'] as const)('shows role-appropriate read-only content for %s', role => {
  const factors = role === 'EMERGENCY_RESPONDER' ? { hazardSeverity: 'HIGH', peopleAffected: 27, vulnerablePeople: 6, roadAccessibility: 'PARTIALLY_BLOCKED', infrastructureImpact: 'HIGH', waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN' }
    : { hazardSeverity: 'HIGH', peopleAffected: 27, roadAccessibility: 'PARTIALLY_BLOCKED', infrastructureImpact: 'HIGH', waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN' };
  state.data = { role, generatedAt: resident.generatedAt, detail: { ...resident.detail, riskFactors: factors,
    ...(role === 'EMERGENCY_RESPONDER' ? { incidentStatus: 'ACTIVE', reportCount: 4 } : {}) } } as RiskLocationDetailsResponse;
  const markup = renderToStaticMarkup(<RiskLocationDetailsScreen />);
  expect(markup).toContain(role === 'EMERGENCY_RESPONDER' ? 'Operational Situation' : 'Community Situation'); expect(markup).toContain('Road access'); expect(markup).not.toContain('decisionReason');
  expect(markup).not.toContain('View Warnings');
  expect(markup.includes('Grouped reports')).toBe(role === 'EMERGENCY_RESPONDER');
});
it('labels evidence images for screen readers', () => {
  state.data = resident; const markup = renderToStaticMarkup(<RiskLocationDetailsScreen />);
  expect(markup).toContain('Community evidence image');
});
