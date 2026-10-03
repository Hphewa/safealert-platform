import React, { type ReactNode } from 'react';
import { createRequire } from 'node:module';
import { beforeEach, expect, it, vi } from 'vitest';
import type { OfficerRiskMapIncident, RiskMapResponse, UserRole } from '@safealert/contracts';
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as { renderToStaticMarkup: (node: ReactNode) => string };
const state = vi.hoisted(() => ({ data: null as RiskMapResponse | null, loading: false, error: null as string | null, selectedId: null as string | null,
  select: vi.fn(), refresh: vi.fn(), push: vi.fn(), back: vi.fn(), actions: new Map<string, () => void>(), markers: [] as { id: string; latitude: number; longitude: number; color: string }[], markerSelect: null as ((id: string) => void) | null }));
vi.mock('react-native', () => ({
  Platform: { OS: 'android' }, StyleSheet: { create: (value: unknown) => value },
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>, Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  ScrollView: ({ children }: { children?: ReactNode }) => <div>{children}</div>, ActivityIndicator: () => <span>Spinner</span>,
  Modal: ({ children, visible }: { children?: ReactNode; visible: boolean }) => visible ? <aside>{children}</aside> : null,
  FlatList: ({ data, renderItem }: { data: { id: string }[]; renderItem: (props: { item: { id: string } }) => ReactNode }) => <div>{data.map((item) => <div key={item.id}>{renderItem({ item })}</div>)}</div>,
  Pressable: ({ children, accessibilityLabel, onPress }: { children?: ReactNode; accessibilityLabel?: string; onPress?: () => void }) => {
    const label = accessibilityLabel ?? renderToStaticMarkup(<>{children}</>).replace(/<[^>]*>/g, '');
    if (onPress) state.actions.set(label, onPress); return <button>{children}</button>;
  }
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: { children?: ReactNode }) => <main>{children}</main> }));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: state.push, back: state.back }) }));
vi.mock('../hooks/useRiskMap', () => ({ useRiskMap: () => state }));
vi.mock('../../dashboards/shared/maps/MultiMarkerLocationPreview', () => ({ MultiMarkerLocationPreview: ({ locations, onMarkerSelect }: { locations: typeof state.markers; onMarkerSelect: (id: string) => void }) => {
  state.markers = locations; state.markerSelect = onMarkerSelect; return <div>Map</div>;
} }));
vi.mock('../../dashboards/shared/maps/HumanReadableLocation', () => ({ HumanReadableLocation: () => <span>Test location</span> }));
import { RiskMapScreen } from './RiskMapScreen';
import { RiskMapDetailsCard } from '../components/RiskMapDetailsCard';
const incident: OfficerRiskMapIncident = { incidentId: 'incident-1', hazardType: 'FLOOD', location: { type: 'Point', coordinates: [79.86, 6.92] }, riskLevel: 'MODERATE', assessedAt: '2026-10-01T12:00:00Z', hasPublishedWarning: true, incidentStatus: 'ACTIVE', reportCount: 4, assessmentId: 'assessment-2', assessmentStatus: 'ACTIVE', calculatedScore: 18 };
beforeEach(() => { state.data = null; state.loading = false; state.error = null; state.selectedId = null; state.markers = []; state.markerSelect = null; state.actions.clear(); state.select.mockReset(); state.refresh.mockReset(); state.push.mockReset(); state.back.mockReset(); });
it('separates API loading, empty, and error states with retry', () => {
  state.loading = true; expect(renderToStaticMarkup(<RiskMapScreen />)).toContain('Loading risk locations');
  state.loading = false; state.error = 'Session unavailable'; expect(renderToStaticMarkup(<RiskMapScreen />)).toContain('Risk data unavailable');
  state.actions.get('Retry risk data')!(); expect(state.refresh).toHaveBeenCalledOnce();
  state.error = null; state.data = { role: 'RESIDENT', generatedAt: incident.assessedAt, incidents: [] };
  expect(renderToStaticMarkup(<RiskMapScreen />)).toContain('No active assessed risk locations'); expect(state.markers).toEqual([]);
});
it('renders canonical coordinates and Medium, selects without navigation, and provides a list', () => {
  state.data = { role: 'DISASTER_OFFICER', generatedAt: incident.assessedAt, incidents: [incident] };
  const markup = renderToStaticMarkup(<RiskMapScreen />);
  expect(state.markers).toEqual([{ id: 'incident-1', latitude: 6.92, longitude: 79.86, color: '#eab308', label: 'Flood · Medium' }]);
  expect(markup).toContain('Select from map or list'); state.markerSelect!('incident-1');
  expect(state.select).toHaveBeenCalledWith('incident-1'); expect(state.push).not.toHaveBeenCalled();
  state.actions.get('High')!(); expect(state.select).toHaveBeenLastCalledWith(null);
});
it('navigates officer actions with assessment and incident identifiers only', () => {
  state.data = { role: 'DISASTER_OFFICER', generatedAt: incident.assessedAt, incidents: [incident] }; state.selectedId = incident.incidentId;
  expect(renderToStaticMarkup(<RiskMapScreen />)).toContain('Score: 18');
  state.actions.get('View Assessment')!(); state.actions.get('Open Monitoring')!();
  expect(state.push.mock.calls).toEqual([[{ pathname: '/officer/assessments/[assessmentId]', params: { assessmentId: 'assessment-2' } }], [{ pathname: '/officer/monitoring/[incidentId]', params: { incidentId: 'incident-1' } }]]);
});
it.each(['RESIDENT', 'COMMUNITY_VOLUNTEER', 'EMERGENCY_RESPONDER'] as UserRole[])('never renders officer actions for %s', (role) => {
  const markup = renderToStaticMarkup(<RiskMapDetailsCard role={role} incident={incident} onClose={vi.fn()} />);
  expect(markup).not.toContain('View Assessment'); expect(markup).not.toContain('Open Monitoring'); expect(markup).not.toContain('Score:');
  expect(markup.includes('4 reports')).toBe(role === 'EMERGENCY_RESPONDER');
  expect(markup.includes('View published warnings')).toBe(role === 'RESIDENT');
  expect(markup).toContain(role === 'RESIDENT' ? 'View Risk Area Details' : 'View Risk Details');
  state.actions.get(role === 'RESIDENT' ? 'View Risk Area Details' : 'View Risk Details')!();
  expect(state.push).toHaveBeenCalledWith({ pathname: role === 'RESIDENT' ? '/resident/risk-locations/[incidentId]' : role === 'COMMUNITY_VOLUNTEER' ? '/volunteer/risk-locations/[incidentId]' : '/responder/risk-locations/[incidentId]', params: { incidentId: incident.incidentId } });
  if (role === 'RESIDENT') { state.actions.get('View published warnings')!(); expect(state.push).toHaveBeenLastCalledWith('/resident/warnings'); }
});
it('never leaves a details card for a removed or unvalidated incident', () => {
  state.selectedId = 'incident-1'; state.data = { role: 'RESIDENT', generatedAt: incident.assessedAt, incidents: [] };
  expect(renderToStaticMarkup(<RiskMapScreen />)).not.toContain('Close risk details');
  state.data = null; state.error = 'Unauthorized'; expect(renderToStaticMarkup(<RiskMapScreen />)).not.toContain('View Assessment');
});
