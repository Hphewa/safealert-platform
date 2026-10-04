import React, { type ReactNode } from 'react';
import { createRequire } from 'node:module';
import { beforeEach, expect, it, vi } from 'vitest';
import type { SafeReport } from '@safealert/contracts';
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as { renderToStaticMarkup: (node: ReactNode) => string };
const state = vi.hoisted(() => ({ values: [] as unknown[], index: 0, toggle: null as (() => void) | null,
  expanded: false, locations: vi.fn(), images: vi.fn(), failImage: null as (() => void) | null }));
vi.mock('react', async (original) => ({ ...await original<typeof import('react')>(), useState: (initial: unknown) => {
  const index = state.index++;
  if (index >= state.values.length) state.values[index] = initial;
  return [state.values[index], (next: unknown) => { state.values[index] = typeof next === 'function' ? Reflect.apply(next, undefined, [state.values[index]]) : next; }];
} }));
vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children, numberOfLines }: { children?: ReactNode; numberOfLines?: number }) => <span data-lines={numberOfLines}>{children}</span>,
  Pressable: ({ children, onPress, accessibilityState }: { children?: ReactNode; onPress: () => void; accessibilityState: { expanded: boolean } }) => {
    state.toggle = onPress; state.expanded = accessibilityState.expanded; return <button aria-expanded={accessibilityState.expanded}>{children}</button>;
  },
  Image: ({ source, onError }: { source: { uri: string }; onError: () => void }) => { state.images(source); state.failImage = onError; return <span>Image evidence</span>; },
  StyleSheet: { create: (value: unknown) => value }
}));
vi.mock('../../shared/components/StatusBadge', () => ({ StatusBadge: ({ label }: { label: string }) => <span>{label}</span> }));
vi.mock('../../shared/components/DashboardGlyph', () => ({ DashboardGlyph: () => null }));
vi.mock('../../shared/maps/HumanReadableLocation', () => ({ HumanReadableLocation: ({ location }: { location: unknown }) => {
  state.locations(location); return <span>Report locality</span>;
} }));
vi.mock('../../shared/media/mediaReference', () => ({ resolveMediaReferenceUri: (value: string) => value }));
vi.mock('./RiskAssessmentComponents', () => ({
  AssessmentDetail: ({ label, value }: { label: string; value: string }) => <div>{label}: {value}</div>,
  assessmentStyles: new Proxy({}, { get: () => undefined })
}));
import { VerifiedReportAccordion } from './VerifiedReportAccordion';
const report: SafeReport = {
  id: 'technical-report-id', residentId: 'resident-id', hazardType: 'FLOOD', severity: 'HIGH',
  description: 'Flood water is covering the whole road. '.repeat(15), location: { type: 'Point', coordinates: [79.94, 6.83] },
  status: 'VERIFIED', createdAt: '2026-09-25T10:00:00Z', updatedAt: '2026-09-26T10:00:00Z', verifiedAt: '2026-09-26T10:00:00Z',
  mediaReference: 'https://example.test/evidence.jpg'
};
function render(value = report) { state.index = 0; return renderToStaticMarkup(<VerifiedReportAccordion report={value} index={1} />); }
beforeEach(() => { state.values = []; state.index = 0; state.locations.mockClear(); state.images.mockClear(); });
it('keeps a two-line preview collapsed without geocoding report locations or loading media', () => {
  const markup = render();
  expect(markup).toContain('Verified Report'); expect(markup).toContain('High');
  expect(markup).toContain('data-lines="2"'); expect(state.expanded).toBe(false);
  expect(state.locations).not.toHaveBeenCalled(); expect(state.images).not.toHaveBeenCalled();
  expect(markup).not.toContain('technical-report-id');
});
it('expands and collapses full evidence with accessible state and no technical identifiers', () => {
  render(); state.toggle!();
  const markup = render();
  expect(state.expanded).toBe(true); expect(markup).toContain(report.description);
  expect(markup).not.toContain('data-lines="2"'); expect(markup).toContain('VERIFIED');
  expect(markup).toContain('Reported at'); expect(markup).toContain('Verified at');
  expect(state.locations).toHaveBeenCalledWith(report.location);
  expect(state.images).toHaveBeenCalledWith({ uri: report.mediaReference });
  expect(markup).not.toContain('technical-report-id');
  state.toggle!(); expect(render()).toContain('data-lines="2"'); expect(state.expanded).toBe(false);
});
it('handles inaccessible image evidence without failing the report', () => {
  render(); state.toggle!(); render(); state.failImage!();
  expect(render()).toContain('Image evidence is unavailable');
});
it('does not attempt to load a resident device file on the officer device', () => {
  const local = { ...report, mediaReference: 'file:///resident/evidence.jpg' };
  render(local); state.toggle!();
  expect(render(local)).toContain('Image evidence is unavailable');
  expect(state.images).not.toHaveBeenCalled();
});
