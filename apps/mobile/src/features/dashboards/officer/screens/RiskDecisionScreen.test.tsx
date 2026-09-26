import React, { type ReactNode } from 'react';
import { createRequire } from 'node:module';
import { beforeEach, expect, it, vi } from 'vitest';
import type { RiskLevel } from '@safealert/contracts';
import { initialRiskAssessmentForm, parseRiskAssessmentForm } from '../riskAssessmentForm';

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (node: ReactNode) => string;
};
const state = vi.hoisted(() => ({ controls: new Map<string, { disabled?: boolean; onPress: () => void }>() }));
vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  TextInput: () => <textarea />,
  Pressable: (props: { children?: ReactNode; accessibilityLabel?: string; disabled?: boolean; onPress: () => void }) => {
    state.controls.set(props.accessibilityLabel ?? String((props.children as React.ReactElement<{ children: ReactNode }>).props.children), props);
    return <button disabled={props.disabled}>{props.children}</button>;
  },
  StyleSheet: { create: (styles: unknown) => styles }
}));
vi.mock('expo-router', () => ({ useRouter: () => ({}) }));
vi.mock('../../shared/components/DashboardScreen', () => ({ DashboardScreen: ({ children }: { children?: ReactNode }) => <main>{children}</main> }));
vi.mock('../../shared/components/PriorityBadge', () => ({ PriorityBadge: ({ priority }: { priority: string }) => <span>{priority}</span> }));

import { RiskDecisionScreen } from './RiskDecisionScreen';

beforeEach(() => state.controls.clear());
const factors = parseRiskAssessmentForm({ ...initialRiskAssessmentForm, peopleAffected: '80', vulnerablePeople: '12' });

it('lets the officer override the recommendation and save only with a valid reason', () => {
  let finalRisk: RiskLevel = 'HIGH';
  let reason = '';
  const save = vi.fn();
  const render = () => renderToStaticMarkup(<RiskDecisionScreen factors={factors}
    calculation={{ calculatedScore: 23, systemSuggestedRisk: 'HIGH' }} finalRisk={finalRisk} reason={reason}
    saving={false} onFinalRisk={(value) => { finalRisk = value; }} onReason={(value) => { reason = value; }} onEdit={() => {}} onSave={save} />);

  render();
  expect(state.controls.get('SAVE ASSESSMENT')?.disabled).toBe(false);
  state.controls.get('Final Risk Level: CRITICAL')!.onPress();
  const overridden = render();
  expect(overridden).toContain('Officer selected final risk: CRITICAL');
  expect(overridden).toContain('HIGH');
  expect(state.controls.get('SAVE ASSESSMENT')?.disabled).toBe(true);
  reason = 'Hospital access is threatened.';
  render();
  expect(state.controls.get('SAVE ASSESSMENT')?.disabled).toBe(false);
  state.controls.get('SAVE ASSESSMENT')!.onPress();
  expect(save).toHaveBeenCalledOnce();
});

it('shows the recommendation and editable decision before the long factor summary', () => {
  const markup = renderToStaticMarkup(<RiskDecisionScreen factors={factors}
    calculation={{ calculatedScore: 23, systemSuggestedRisk: 'HIGH' }} finalRisk="HIGH" reason=""
    saving={false} onFinalRisk={() => {}} onReason={() => {}} onEdit={() => {}} onSave={() => {}} />);
  expect(markup.indexOf('System suggested risk')).toBeLessThan(markup.indexOf('Final officer decision'));
  expect(markup.indexOf('SAVE ASSESSMENT')).toBeLessThan(markup.indexOf('Assessment factors'));
});

it('compares the previous decision with the new suggestion and labels reassessment save', () => {
  const markup = renderToStaticMarkup(<RiskDecisionScreen factors={factors}
    calculation={{ calculatedScore: 27, systemSuggestedRisk: 'CRITICAL' }} finalRisk="CRITICAL" reason=""
    saving={false} onFinalRisk={() => {}} onReason={() => {}} onEdit={() => {}} onSave={() => {}}
    previousAssessment={{ finalRiskLevel: 'HIGH', calculatedScore: 18 }} saveLabel="SAVE REASSESSMENT" />);

  expect(markup).toContain('Previous Risk');
  expect(markup).toContain('Calculated Score: 18');
  expect(markup).toContain('New System Suggestion');
  expect(markup).toContain('CRITICAL');
  expect(markup).toContain('SAVE REASSESSMENT');
});
