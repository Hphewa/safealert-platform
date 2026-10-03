import { createRequire } from 'node:module';
import React, { type ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { GetPendingOfficerReportsResponse, IncidentMonitoringSummary, IncidentWithReportsResponse, SafeReport } from '@safealert/contracts';

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (node: ReactNode) => string;
};
type DashboardData = {
  pendingReports: GetPendingOfficerReportsResponse;
  assessmentQueue: IncidentWithReportsResponse[];
  monitoring: IncidentMonitoringSummary[];
};
const state = vi.hoisted(() => ({
  data: null as DashboardData | null,
  loading: false,
  error: null as string | null,
  accessToken: 'officer-token' as string | null,
  loader: null as (() => Promise<DashboardData>) | null,
  actions: new Map<string, () => void>(),
  reload: vi.fn(),
  fetchReports: vi.fn(),
  fetchAssessmentQueue: vi.fn(),
  fetchMonitoring: vi.fn()
}));
vi.mock('react-native', () => {
  const container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    View: container, Text: container, ScrollView: container,
    useWindowDimensions: () => ({ width: 390, height: 844, scale: 1, fontScale: 1 }),
    Platform: { select: (values: { web?: unknown; default?: unknown }) => values.default ?? values.web },
    Pressable: ({ children, disabled, accessibilityLabel, onPress }: {
      children?: ReactNode; disabled?: boolean; accessibilityLabel?: string; onPress?: () => void;
    }) => {
      if (accessibilityLabel && onPress) state.actions.set(accessibilityLabel, onPress);
      return <button aria-label={accessibilityLabel} disabled={disabled}>{children}</button>;
    },
    ActivityIndicator: () => <span>Loading</span>,
    StyleSheet: { create: (styles: unknown) => styles }
  };
});
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ accessToken: state.accessToken, logout: vi.fn() })
}));
vi.mock('../../shared/components/DashboardScreen', () => ({
  DashboardScreen: ({ children }: { children: ReactNode }) => <main>{children}</main>
}));
vi.mock('../hooks/useAssessmentResource', () => ({
  useAssessmentResource: (loader: () => Promise<DashboardData>) => {
    state.loader = loader;
    return { data: state.data, loading: state.loading, error: state.error, reload: state.reload };
  }
}));
vi.mock('../api/incidentApi', () => ({
  listInitialAssessmentQueue: state.fetchAssessmentQueue,
  listIncidentMonitoring: state.fetchMonitoring
}));
vi.mock('../api/officerReportsApi', () => ({
  listPendingOfficerReports: state.fetchReports
}));
vi.mock('../reports', () => ({
  mapSafeReportToOfficerGroupedReportSummary: (value: SafeReport) => ({
    id: value.id,
    hazardLabel: value.hazardType,
    locationLabel: `${value.location.coordinates[1]}, ${value.location.coordinates[0]}`,
    latestUpdateLabel: value.createdAt,
    descriptionPreview: value.description,
    href: '/officer/reports',
    icon: 'document-text-outline',
    statusLabel: 'Pending Review',
    tone: 'info'
  })
}));

import { OfficerDashboardScreen } from './OfficerDashboardScreen';

const report: SafeReport = {
  id: 'report-from-api', residentId: 'resident', hazardType: 'FLOOD', severity: 'HIGH',
  description: 'Water across the bridge', status: 'PENDING',
  location: { type: 'Point', coordinates: [79.8612, 6.9271] },
  createdAt: '2026-09-25T09:00:00.000Z', updatedAt: '2026-09-25T09:00:00.000Z'
};

beforeEach(() => {
  vi.clearAllMocks();
  state.data = null;
  state.loading = false;
  state.error = null;
  state.accessToken = 'officer-token';
  state.loader = null;
  state.actions.clear();
  state.fetchAssessmentQueue.mockReset();
  state.fetchMonitoring.mockReset();
});

function dashboardData(reports: SafeReport[] = []): DashboardData {
  return { pendingReports: { reports }, assessmentQueue: [], monitoring: [] };
}

it('shows the API total and only the three newest pending reports', () => {
  state.data = dashboardData([1, 4, 2, 3].map((day) => ({
    ...report, id: `report-${day}`, description: `Bridge observation ${day}`,
    createdAt: `2026-09-0${day}T09:00:00.000Z`
  })));
  const markup = renderToStaticMarkup(<OfficerDashboardScreen />);
  expect(markup).toContain('>4<');
  expect(markup).toContain('Pending Reports');
  expect(markup).not.toContain('Bridge observation 1');
  expect(markup.indexOf('Bridge observation 4')).toBeLessThan(markup.indexOf('Bridge observation 3'));
  expect(markup.indexOf('Bridge observation 3')).toBeLessThan(markup.indexOf('Bridge observation 2'));
  for (const label of ['Field Updates', 'Verified Today', 'Riverbend']) {
    expect(markup).not.toContain(label);
  }
});

it('shows zero and an empty state only after a successful empty response', () => {
  state.data = dashboardData();
  const markup = renderToStaticMarkup(<OfficerDashboardScreen />);
  expect(markup).toContain('>0<');
  expect(markup).toContain('No pending reports');
  expect(markup).toContain('Review Reports');
  expect(markup).toContain('Assess Risk');
});

it('shows loading without reporting a false zero or empty result', () => {
  state.loading = true;
  const markup = renderToStaticMarkup(<OfficerDashboardScreen />);
  expect(markup).toContain('Loading');
  expect(markup).not.toContain('>0<');
  expect(markup).not.toContain('No pending reports');
});

it('shows API errors with retry instead of sample reports or a zero count', () => {
  state.error = 'Unable to reach the server';
  const markup = renderToStaticMarkup(<OfficerDashboardScreen />);
  expect(markup).toContain('Unable to reach the server');
  expect(markup).toContain('Retry');
  expect(markup).not.toContain('>0<');
  expect(markup).not.toContain('No pending reports');
});

it('loads reports with the authenticated token and rejects an unavailable session', async () => {
  state.fetchReports.mockResolvedValue({ reports: [report] });
  state.fetchAssessmentQueue.mockResolvedValue({ incidents: [] });
  state.fetchMonitoring.mockResolvedValue({ incidents: [] });
  renderToStaticMarkup(<OfficerDashboardScreen />);
  await expect(state.loader!()).resolves.toEqual(dashboardData([report]));
  expect(state.fetchReports).toHaveBeenCalledWith('officer-token');
  expect(state.fetchAssessmentQueue).toHaveBeenCalledWith('officer-token');
  expect(state.fetchMonitoring).toHaveBeenCalledWith('officer-token');
  state.fetchReports.mockClear();
  state.accessToken = null;
  renderToStaticMarkup(<OfficerDashboardScreen />);
  await expect(state.loader!()).rejects.toThrow(/session/i);
  expect(state.fetchReports).not.toHaveBeenCalled();
});

it('retries a failed load and lets the officer refresh successful results', () => {
  state.error = 'Offline';
  renderToStaticMarkup(<OfficerDashboardScreen />);
  state.actions.get('Retry officer dashboard')!();
  expect(state.reload).toHaveBeenCalledTimes(1);
  state.error = null;
  state.data = dashboardData();
  renderToStaticMarkup(<OfficerDashboardScreen />);
  state.actions.get('Refresh officer dashboard')!();
  expect(state.reload).toHaveBeenCalledTimes(2);
});
