import React, { type ReactNode } from 'react';
import { createRequire } from 'node:module';
import { expect, it, vi } from 'vitest';
import type { RiskActivityEvent } from '@safealert/contracts';
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as { renderToStaticMarkup: (node: ReactNode) => string };
vi.mock('react-native', () => ({ View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>, StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock('./RiskAssessmentComponents', () => ({ AssessmentButton: ({ label }: { label: string }) => <button>{label}</button>,
  assessmentStyles: new Proxy({}, { get: () => undefined }) }));
vi.mock('../../shared/theme', () => ({ dashboardTheme: { colors: { primary: '#111', text: '#222' } } }));
import { IncidentActivityTimeline } from './IncidentActivityTimeline';

it('shows activity text and time without exposing linked record identifiers', () => {
  const events: RiskActivityEvent[] = [{ id: 'internal-id', type: 'REPORT_VERIFIED', timestamp: '2026-09-26T11:00:00.000Z',
    title: 'Report verified', relatedRecordId: 'database-record-id' }];
  const markup = renderToStaticMarkup(<IncidentActivityTimeline events={events} loading={false} error={null} onRetry={() => {}} />);
  expect(markup).toContain('Incident Activity');
  expect(markup).toContain('Report verified');
  expect(markup).not.toContain('database-record-id');
});
