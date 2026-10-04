import React, { type ReactNode } from 'react';
import { createRequire } from 'node:module';
import { beforeEach, expect, it, vi } from 'vitest';
import { officerBottomNavItems } from '../../officer/officerNavigation';

const state = vi.hoisted(() => ({ pathname: '/officer/assessments/wizard/situation', push: vi.fn(), buttons: [] as Array<Record<string, unknown>> }));
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (node: ReactNode) => string;
};
vi.mock('expo-router', () => ({ usePathname: () => state.pathname, useRouter: () => ({ push: state.push }) }));
vi.mock('react-native', () => ({
  Pressable: ({ children, onPress, accessibilityLabel, accessibilityState, style }: {
    children?: ReactNode; onPress: () => void; accessibilityLabel?: string; accessibilityState?: unknown; style?: unknown
  }) => { state.buttons.push({ accessibilityLabel, accessibilityState, style }); return <button onClick={onPress}>{children}</button>; },
  StyleSheet: { create: (value: unknown) => value },
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  View: ({ children }: { children?: ReactNode }) => <nav>{children}</nav>
}));
vi.mock('./DashboardGlyph', () => ({ DashboardGlyph: ({ name }: { name: string }) => <i>{name}</i> }));
vi.mock('expo-symbols', () => ({ SymbolView: ({ name }: { name: { ios: string; android: string; web: string } }) =>
  <i data-symbol={`${name.ios}|${name.android}|${name.web}`} /> }));
import { BottomNavigation } from './BottomNavigation';

beforeEach(() => { state.pathname = '/officer/assessments/wizard/situation'; state.push.mockReset(); state.buttons = []; });

it('uses concise officer labels and marks nested assessment and monitoring routes selected', () => {
  const markup = renderToStaticMarkup(<BottomNavigation items={officerBottomNavItems} />);
  expect(markup).toContain('Assess');
  expect(markup).toContain('Monitor');
  expect(markup).not.toContain('Assessments');
  expect(markup).not.toContain('Monitoring');
  expect(state.buttons[2]?.accessibilityLabel).toBe('Assess');
  expect(state.buttons[2]?.accessibilityState).toEqual({ selected: true });
  expect(markup).toContain('checkmark.shield|fact_check|fact_check');

  state.pathname = '/officer/monitoring/incident-1'; state.buttons = [];
  const monitoringMarkup = renderToStaticMarkup(<BottomNavigation items={officerBottomNavItems} />);
  expect(state.buttons[3]?.accessibilityState).toEqual({ selected: true });
  expect(monitoringMarkup).toContain('eye|visibility|visibility');
});

it('retains existing navigation behavior for other roles', () => {
  const residentItems = [{ label: 'My Reports', href: '/resident/reports' as const, icon: 'document-text-outline' }];
  const markup = renderToStaticMarkup(<BottomNavigation items={residentItems} />);
  expect(markup).toContain('My Reports');
  expect(markup).toContain('document-text-outline');
});

