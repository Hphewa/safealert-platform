import * as React from 'react';
import type { ResponseStatus } from '@safealert/contracts';
import { describe, expect, it, vi } from 'vitest';

import { EmergencyRequestProgressTracker } from './EmergencyRequestProgressTracker';

vi.mock('react-native', () => ({
  Text: 'span', View: 'div', StyleSheet: { create: (styles: unknown) => styles }
}));

function screenText(node: React.ReactNode): string {
  if (Array.isArray(node)) return node.map(screenText).join(' ');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return React.isValidElement<{ children?: React.ReactNode }>(node) ? screenText(node.props.children) : '';
}

function accessibleStageLabels(node: React.ReactNode): string[] {
  if (Array.isArray(node)) return node.flatMap(accessibleStageLabels);
  if (!React.isValidElement<{
    children?: React.ReactNode; accessible?: boolean; accessibilityLabel?: string
  }>(node)) return [];
  if (node.props.accessible && node.props.accessibilityLabel) return [node.props.accessibilityLabel];
  return accessibleStageLabels(node.props.children);
}

describe('EmergencyRequestProgressTracker', () => {
  it('uses readable labels, visible state text and accessible stage descriptions', () => {
    const tree = EmergencyRequestProgressTracker({ status: 'IN_PROGRESS' });
    const text = screenText(tree);
    expect(text).toContain('Emergency Response Progress');
    expect(text).toContain('In Progress Current stage');
    expect(text).toContain('Completed Not yet reached');
    expect(text).not.toContain('IN_PROGRESS');
    expect(text.match(/\u2713/g)).toHaveLength(4);
    expect(accessibleStageLabels(tree)).toEqual([
      'Submitted, Reached', 'Assigned, Reached', 'Dispatched, Reached', 'Arrived, Reached',
      'In Progress, Current stage', 'Completed, Not yet reached'
    ]);
  });

  it('renders another supplied status without retaining a previous current stage', () => {
    EmergencyRequestProgressTracker({ status: 'IN_PROGRESS' });
    expect(accessibleStageLabels(EmergencyRequestProgressTracker({ status: 'DISPATCHED' }))).toEqual([
      'Submitted, Reached', 'Assigned, Reached', 'Dispatched, Current stage',
      'Arrived, Not yet reached', 'In Progress, Not yet reached', 'Completed, Not yet reached'
    ]);
  });

  it('keeps Completed as the final current stage', () => {
    const tree = EmergencyRequestProgressTracker({ status: 'COMPLETED' });
    expect(accessibleStageLabels(tree)).toEqual([
      'Submitted, Reached', 'Assigned, Reached', 'Dispatched, Reached', 'Arrived, Reached',
      'In Progress, Reached', 'Completed, Current stage'
    ]);
    expect(screenText(tree)).not.toContain('Not yet reached');
  });

  it('presents cancellation as a final outcome without normal response stages', () => {
    const tree = EmergencyRequestProgressTracker({ status: 'CANCELLED' });
    expect(screenText(tree)).toContain('Request cancelled');
    expect(screenText(tree)).toContain('This request is no longer active. Your request details remain available below.');
    expect(accessibleStageLabels(tree)).toEqual([]);
    expect(screenText(tree)).not.toMatch(/Progress unavailable|Current stage|Not yet reached|CANCELLED/);
  });

  it.each([undefined, 'UNEXPECTED_INTERNAL_STATUS'])('renders no misleading stages for %s', (status) => {
    // Simulate an unexpected API value at the typed presentation boundary.
    const tree = EmergencyRequestProgressTracker({ status: status as ResponseStatus });
    expect(screenText(tree)).toContain('Progress unavailable.');
    expect(accessibleStageLabels(tree)).toEqual([]);
    expect(screenText(tree)).not.toContain('UNEXPECTED_INTERNAL_STATUS');
    expect(screenText(tree)).not.toContain('CANCELLED');
  });
});
