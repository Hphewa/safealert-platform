import { createRequire } from 'node:module';
import React, { type ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { RiskLevel } from '@safealert/contracts';

// Render the real screens with native primitives replaced by HTML; no device renderer dependency.
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (node: ReactNode) => string;
};
const state = vi.hoisted(() => ({ risk: 'HIGH' as RiskLevel, unavailable: false, missingSource: false }));
vi.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: vi.fn(), launchImageLibraryAsync: vi.fn(),
  PermissionStatus: { GRANTED: 'granted' }, MediaTypeOptions: { Images: 'Images' }
}));
vi.mock('react-native', () => {
  const container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    View: container, Text: container, ScrollView: container, KeyboardAvoidingView: container,
    Pressable: ({ children, disabled }: { children?: ReactNode; disabled?: boolean }) => <button disabled={disabled}>{children}</button>,
    TextInput: ({ accessibilityLabel, value }: { accessibilityLabel: string; value: string }) => <input aria-label={accessibilityLabel} value={value} readOnly />,
    ActivityIndicator: () => <span>Loading</span>, Image: () => <span>Image</span>,
    Platform: { OS: 'android', select: (options: { android?: unknown; default?: unknown }) => options.android ?? options.default },
    StyleSheet: { create: (styles: unknown) => styles }
  };
});
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useLocalSearchParams: () => ({ assessmentId: '123456789012345678901234' }),
  useFocusEffect: vi.fn()
}));
vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ accessToken: 'token', user: { id: 'officer', name: 'Officer' } })
}));
vi.mock('../../shared/components/DashboardScreen', () => ({
  DashboardScreen: ({ children }: { children: ReactNode }) => <main>{children}</main>
}));
vi.mock('../hooks/useAssessmentResource', () => ({
  useAssessmentResource: () => ({ loading: state.unavailable, error: null, reload: vi.fn(),
    data: state.unavailable ? null : {
      assessment: {
        id: '123456789012345678901234', finalRiskLevel: state.risk, systemSuggestedRisk: 'HIGH',
        status: 'ACTIVE', calculatedScore: 23, assessedById: 'officer', assessedAt: '2026-09-24T00:00:00Z',
        hazardSeverity: 'HIGH', peopleAffected: 80, vulnerablePeople: 12,
        roadAccessibility: 'PARTIALLY_BLOCKED', infrastructureImpact: 'MODERATE',
        waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN'
      },
      incident: { id: 'incident', hazardType: 'FLOOD', reportIds: ['report'],
        location: { type: 'Point', coordinates: [79.86, 6.92] } },
      reports: state.missingSource ? [] : [{ id: 'report', hazardType: 'FLOOD', severity: 'LOW', description: 'Water rising',
        status: 'VERIFIED', location: { type: 'Point', coordinates: [79.86, 6.92] } }]
    }
  })
}));

import { CreateWarningScreen } from './CreateWarningScreen';
import { ReviewWarningScreen } from './ReviewWarningScreen';

beforeEach(() => { state.risk = 'HIGH'; state.unavailable = false; state.missingSource = false; });
it.each(['LOW', 'MODERATE'] as const)('blocks the create form on direct navigation for %s', (risk) => {
  state.risk = risk;
  const markup = renderToStaticMarkup(<CreateWarningScreen />);
  expect(markup).toContain('Only saved HIGH or CRITICAL assessments');
  expect(markup).not.toContain('aria-label="Affected Area');
});
it.each(['HIGH', 'CRITICAL'] as const)('renders %s form fields and read-only assessment risk', (risk) => {
  state.risk = risk;
  const markup = renderToStaticMarkup(<CreateWarningScreen />);
  for (const label of ['Required Action', 'Unsafe Roads', 'Safe Routes', 'Reason / Message']) {
    expect(markup).toContain(`aria-label="${label}`);
  }
  expect(markup).toContain(risk);
  expect(markup).toContain('Review Warning');
  expect(markup).not.toContain('aria-label="Risk Level');
  expect(markup).toContain('Affected Area');
  expect(markup).toContain('6.92000, 79.86000');
  expect(markup).toContain('FROM REPORT');
  expect(markup).not.toContain('aria-label="Affected Area');
  expect(markup).not.toContain('Riverside village, lower valley');
});
it('blocks review when the saved source report location is missing', () => {
  state.missingSource = true;
  const markup = renderToStaticMarkup(<CreateWarningScreen />);
  expect(markup).toContain('The source report location is unavailable');
  expect(markup).toContain('<button disabled=""><div>Review Warning');
  expect(markup).not.toContain('6.92000, 79.86000');
});
it('does not offer creation before saved assessment loading completes', () => {
  state.unavailable = true;
  expect(renderToStaticMarkup(<CreateWarningScreen />)).not.toContain('aria-label="Affected Area');
});
it('renders the full review summary and disables edit/save while saving', () => {
  const warning = { assessmentId: 'assessment', affectedArea: 'Riverside', requiredAction: 'Evacuate',
    unsafeRoads: 'River Road', safeRoutes: 'Hill Road', message: 'Water is rising.', attachments: ['https://example.com/photo.jpg'] };
  const markup = renderToStaticMarkup(<ReviewWarningScreen warning={warning} riskLevel="CRITICAL" busy={false} onEdit={vi.fn()} onSave={vi.fn()} />);
  for (const value of ['Riverside', 'CRITICAL', 'Evacuate', 'River Road', 'Hill Road', 'Water is rising.', 'https://example.com/photo.jpg', 'Edit Warning', 'Save Warning Draft']) {
    expect(markup).toContain(value);
  }
  const saving = renderToStaticMarkup(<ReviewWarningScreen warning={warning} riskLevel="CRITICAL" busy onEdit={vi.fn()} onSave={vi.fn()} />);
  expect(saving.match(/disabled=""/g)).toHaveLength(2);
  expect(saving).toContain('Saving Warning');
});
