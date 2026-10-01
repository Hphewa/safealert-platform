import React, { type ReactNode } from 'react';
import { createRequire } from 'node:module';
import { beforeEach, expect, it, vi } from 'vitest';
import type { RiskFactorContribution } from '@safealert/contracts';

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as { renderToStaticMarkup: (node: ReactNode) => string };
const state = vi.hoisted(() => ({ expanded: false, toggle: null as (() => void) | null }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: () => [state.expanded, (next: boolean | ((current: boolean) => boolean)) => {
    state.expanded = typeof next === 'function' ? next(state.expanded) : next;
  }] };
});
vi.mock('react-native', () => ({
  Pressable: ({ children, onPress }: { children?: ReactNode; onPress: () => void }) => { state.toggle = onPress; return <button>{children}</button>; },
  StyleSheet: { create: (styles: unknown) => styles }, Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>
}));
vi.mock('../../shared/theme', () => ({ dashboardTheme: { colors: { border: '#ddd', primary: '#111' } } }));
vi.mock('./RiskAssessmentComponents', () => ({ assessmentStyles: new Proxy({}, { get: () => undefined }) }));
import { RiskFactorContributionDetails } from './RiskFactorContributionDetails';

const contributions: RiskFactorContribution[] = [
  { key: 'hazardSeverity', label: 'Hazard severity', selectedValue: 'HIGH', points: 6 },
  { key: 'peopleAffected', label: 'People affected', selectedValue: 11, points: 2 }
];
beforeEach(() => { state.expanded = false; state.toggle = null; });

it('keeps contribution details collapsed, then expands server values and their total', () => {
  const render = () => renderToStaticMarkup(<RiskFactorContributionDetails title="Why this recommendation?"
    contributions={contributions} score={8} version="risk-v1" />);
  expect(render()).not.toContain('Hazard severity: HIGH');
  state.toggle?.();
  const markup = render();
  expect(markup).toContain('Hazard severity: HIGH');
  expect(markup).toContain('People affected: 11');
  expect(markup).toContain('Total: 8 points (score 8)');
  expect(markup).toContain('Calculation rules: risk-v1');
});

it('reports unavailable details for legacy assessments without a snapshot', () => {
  const markup = renderToStaticMarkup(<RiskFactorContributionDetails title="Calculation Details" score={18} />);
  expect(markup).toContain('Calculation details unavailable');
  expect(markup).not.toContain('Show details');
});
