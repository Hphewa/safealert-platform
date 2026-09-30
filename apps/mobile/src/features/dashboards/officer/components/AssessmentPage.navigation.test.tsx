import React, { type ReactNode } from 'react';
import { createRequire } from 'node:module';
import { beforeEach, expect, it, vi } from 'vitest';
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as { renderToStaticMarkup: (node: ReactNode) => string };
const state = vi.hoisted(() => ({ actions: new Map<string, () => void>(), reset: vi.fn(), dismissTo: vi.fn(), replace: vi.fn() }));
vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>, Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Pressable: ({ children, accessibilityLabel, onPress }: { children?: ReactNode; accessibilityLabel?: string; onPress: () => void }) => {
    state.actions.set(accessibilityLabel ?? 'default back', onPress); return <button>{children}</button>;
  }, ActivityIndicator: () => null, Image: () => null, StyleSheet: { create: (value: unknown) => value }
}));
vi.mock('expo-router', () => ({ useRouter: () => ({ dismissTo: state.dismissTo, replace: state.replace }) }));
vi.mock('../assessment-flow/riskAssessmentDraft', () => ({ useRiskAssessmentDraft: () => ({ resetAssessmentDraft: state.reset }) }));
vi.mock('../../shared/components/DashboardScreen', () => ({ DashboardScreen: ({ children }: { children?: ReactNode }) => <main>{children}</main> }));
vi.mock('../../shared/components/DashboardGlyph', () => ({ DashboardGlyph: () => null }));
import { AssessmentPage } from './RiskAssessmentComponents';
beforeEach(() => { state.actions.clear(); vi.clearAllMocks(); });
it('returns the initial form to its overview without resetting or duplicating the draft flow', () => {
  renderToStaticMarkup(<AssessmentPage title="Assess Risk" backToIncidentId="incident-1">Form</AssessmentPage>);
  state.actions.get('Back to Incident Overview')!();
  expect(state.dismissTo).toHaveBeenCalledWith({ pathname: '/officer/assessments/incident/[incidentId]', params: { incidentId: 'incident-1' } });
  expect(state.reset).not.toHaveBeenCalled(); expect(state.replace).not.toHaveBeenCalled();
});
it('preserves the existing default back behavior for other assessment pages', () => {
  renderToStaticMarkup(<AssessmentPage title="Reassess Risk">Form</AssessmentPage>);
  state.actions.get('default back')!();
  expect(state.reset).toHaveBeenCalledOnce();
  expect(state.replace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/officer/assessments' }));
});
