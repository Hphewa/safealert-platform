import React, { type ReactNode } from 'react';
import { createRequire } from 'node:module';
import { expect, it, vi } from 'vitest';
import type { StoredRiskAssessmentDraft } from '../assessment-flow/riskAssessmentDraftStorage';
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as { renderToStaticMarkup: (node: ReactNode) => string };
vi.mock('react-native', () => ({
  ActivityIndicator: () => <span>Checking saved assessment</span>, Pressable: ({ children }: { children?: ReactNode }) => <button>{children}</button>,
  StyleSheet: { create: (styles: unknown) => styles }, Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>
}));
vi.mock('../../shared/theme', () => ({ dashboardTheme: { colors: { surface: '#fff', primary: '#111', text: '#222', muted: '#555', critical: '#f00', border: '#ddd' } } }));
import { AssessmentDraftRecovery } from './AssessmentDraftRecovery';

const draft = { mode: 'INITIAL', incidentId: 'incident-1', assessmentId: null, factors: {}, calculationPreview: null,
  finalRiskLevel: 'LOW', decisionReason: '', reassessmentReason: '', updatedAt: '2026-10-01T12:00:00.000Z' } as unknown as StoredRiskAssessmentDraft;

it('offers Continue and Start again for a saved draft with accessible state', () => {
  const markup = renderToStaticMarkup(<AssessmentDraftRecovery loading={false} draft={draft} busy={false} error={null}
    onContinue={() => {}} onStartAgain={() => {}} />);
  expect(markup).toContain('Continue your assessment?');
  expect(markup).toContain('Continue');
  expect(markup).toContain('Start again');
  expect(markup).toContain('risk assessment is saved on this device');
});

it('shows an accessible loading state before stored draft recovery finishes', () => {
  const markup = renderToStaticMarkup(<AssessmentDraftRecovery loading draft={null} busy={false} error={null}
    onContinue={() => {}} onStartAgain={() => {}} />);
  expect(markup).toContain('Checking saved assessment');
});
