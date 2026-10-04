import { beforeEach, expect, it, vi } from 'vitest';
import React from 'react';
import { createRequire } from 'node:module';

const state = vi.hoisted(() => ({ viewProps: null as Record<string, unknown> | null, text: '' }));
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (node: React.ReactNode) => string;
};
vi.mock('react-native', () => ({
  StyleSheet: { create: (styles: unknown) => styles },
  View: (props: Record<string, unknown> & { children?: React.ReactNode }) => { state.viewProps = props; return props.children; },
  Text: ({ children }: { children: string }) => { state.text = children; return null; }
}));
import { StatusBadge } from './StatusBadge';

beforeEach(() => { state.viewProps = null; state.text = ''; });

it('exposes readable status text with explicit accessibility semantics alongside its tone', () => {
  renderToStaticMarkup(<StatusBadge label="ACTIVE" tone="success" />);
  expect(state.viewProps).toMatchObject({ accessibilityRole: 'text', accessibilityLabel: 'ACTIVE', accessible: true });
  expect(state.text).toBe('ACTIVE');
});
