import { createRequire } from 'node:module';
import React, { type ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { RiskLevel } from '@safealert/contracts';

// Render the real screens with native primitives replaced by HTML; no device renderer dependency.
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (node: ReactNode) => string;
};
const state = vi.hoisted(() => {
  Object.assign(globalThis, { __DEV__: false });
  return { risk: 'HIGH' as RiskLevel, status: 'ACTIVE' as 'ACTIVE' | 'CLOSED', unavailable: false };
});
vi.mock('react-native', () => {
  const container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    View: container, Text: container, ScrollView: container, KeyboardAvoidingView: container,
    Pressable: ({ children, disabled }: { children?: ReactNode; disabled?: boolean }) => <button disabled={disabled}>{children}</button>,
    TextInput: ({ accessibilityLabel, value }: { accessibilityLabel: string; value: string }) => <input aria-label={accessibilityLabel} value={value} readOnly />,
    ActivityIndicator: () => <span>Loading</span>, Image: () => <span>Image</span>,
    Platform: { OS: 'android' }, StyleSheet: { create: (styles: unknown) => styles }
  };
});
vi.mock('expo-image-picker', () => ({
  PermissionStatus: { GRANTED: 'granted' },
  MediaTypeOptions: { Images: 'Images' },
  requestMediaLibraryPermissionsAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn()
}));
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
        status: state.status, calculatedScore: 23, assessedById: 'officer', assessedAt: '2026-09-24T00:00:00Z',
        hazardSeverity: 'HIGH', peopleAffected: 80, vulnerablePeople: 12,
        roadAccessibility: 'PARTIALLY_BLOCKED', infrastructureImpact: 'MODERATE',
        waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN'
      },
      report: { id: 'report', hazardType: 'FLOOD', severity: 'LOW', description: 'Water rising',
        status: 'VERIFIED', location: { coordinates: [79.86, 6.92] } }
    }
  })
}));

import { RiskAssessmentResultScreen } from './RiskAssessmentResultScreen';
import { CreateWarningScreen } from './CreateWarningScreen';
import { ReviewWarningScreen } from './ReviewWarningScreen';

beforeEach(() => { state.risk = 'HIGH'; state.status = 'ACTIVE'; state.unavailable = false; });
it.each(['HIGH', 'CRITICAL', 'LOW', 'MODERATE'] as const)('%s: renders correct Create Warning availability on result and reopen', (risk) => {
  state.risk = risk;
  for (let open = 0; open < 2; open += 1) {
    const markup = renderToStaticMarkup(<RiskAssessmentResultScreen />);
    expect(markup.includes('Create Warning')).toBe(risk === 'HIGH' || risk === 'CRITICAL');
  }
});
it.each(['LOW', 'MODERATE'] as const)('blocks the create form on direct navigation for %s', (risk) => {
  state.risk = risk;
  const markup = renderToStaticMarkup(<CreateWarningScreen />);
  expect(markup).toContain('Only saved HIGH or CRITICAL assessments');
  expect(markup).not.toContain('aria-label="Affected Area');
});
it.each(['HIGH', 'CRITICAL'] as const)('blocks direct warning creation for a CLOSED %s assessment', (risk) => {
  state.risk = risk;
  state.status = 'CLOSED';
  const markup = renderToStaticMarkup(<CreateWarningScreen />);
  expect(markup).toContain('Only ACTIVE assessments');
  expect(markup).not.toContain('aria-label="Affected Area');
  expect(markup).not.toContain('Review Warning');
});
it.each(['HIGH', 'CRITICAL'] as const)('renders %s form fields and read-only assessment risk', (risk) => {
  state.risk = risk;
  const markup = renderToStaticMarkup(<CreateWarningScreen />);
  for (const label of ['Affected Area', 'Required Action', 'Unsafe Roads', 'Safe Routes', 'Reason / Message']) {
    expect(markup).toContain(`aria-label="${label}`);
  }
  expect(markup).toContain('Add Photos');
  expect(markup).toContain(risk);
  expect(markup).toContain('Review Warning');
  expect(markup).not.toContain('aria-label="Risk Level');
});
it('does not offer creation before saved assessment loading completes', () => {
  state.unavailable = true;
  expect(renderToStaticMarkup(<RiskAssessmentResultScreen />)).not.toContain('Create Warning');
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
