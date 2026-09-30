import { createRequire } from 'node:module';
import React, { type ComponentProps, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WarningDeliveryPanel } from './WarningDeliveryPanel';

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (node: ReactNode) => string;
};

// Follow the existing mobile tests: real presentation, lightweight native primitives,
// and a state slot so the open/close controls can be exercised without a device renderer.
const ui = vi.hoisted(() => ({
  showFailures: false,
  buttons: new Map<string, () => void>(),
  requestClose: undefined as (() => void) | undefined
}));

vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof React>(),
  useState: () => [ui.showFailures, (value: boolean) => { ui.showFailures = value; }]
}));

vi.mock('react-native', () => {
  const Container = ({ children, accessibilityLabel, accessibilityRole }: {
    children?: ReactNode; accessibilityLabel?: string; accessibilityRole?: string;
  }) => <div aria-label={accessibilityLabel} role={accessibilityRole === 'alert' ? 'alert' : undefined}>{children}</div>;
  return {
    View: Container,
    Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
    ScrollView: ({ children }: { children?: ReactNode }) => <section>{children}</section>,
    ActivityIndicator: () => <span role="progressbar" />,
    Pressable: ({ children, accessibilityLabel, onPress }: {
      children?: ReactNode; accessibilityLabel: string; onPress: () => void;
    }) => {
      ui.buttons.set(accessibilityLabel, onPress);
      return <button aria-label={accessibilityLabel}>{children}</button>;
    },
    Modal: ({ children, visible, onRequestClose }: {
      children?: ReactNode; visible: boolean; onRequestClose: () => void;
    }) => {
      ui.requestClose = onRequestClose;
      return visible ? <div role="dialog">{children}</div> : null;
    },
    Platform: { select: (options: { default: unknown }) => options.default },
    StyleSheet: { create: (styles: unknown) => styles }
  };
});

type Props = ComponentProps<typeof WarningDeliveryPanel>;
type Delivery = NonNullable<Props['delivery']>;
const noFailures: Delivery = {
  summary: { recipientCount: 1, sms: { sent: 0, failed: 0, skipped: 1 }, push: { sent: 1, failed: 0, skipped: 0 } },
  failedDeliveries: []
};
const withFailures: Delivery = {
  summary: { recipientCount: 24, sms: { sent: 21, failed: 2, skipped: 1 }, push: { sent: 20, failed: 3, skipped: 1 } },
  failedDeliveries: [{
    id: 'delivery-1', resident: 'John Perera', channel: 'SMS', status: 'FAILED',
    reason: 'Provider temporarily unavailable', phone: '*******4418', attemptCount: 2,
    lastAttemptAt: '2026-09-30T05:12:00.000Z'
  }]
};

function render(props: Partial<Props> = {}) {
  ui.buttons.clear();
  return renderToStaticMarkup(<WarningDeliveryPanel delivery={noFailures} loading={false} error={null} onRetry={vi.fn()} {...props} />);
}

function press(label: string) {
  const action = ui.buttons.get(label);
  expect(action, `${label} must be available`).toBeTypeOf('function');
  action!();
}

beforeEach(() => { ui.showFailures = false; ui.requestClose = undefined; ui.buttons.clear(); });

describe('Officer warning delivery presentation', () => {
  it('renders the actual 0/0/1 SMS and 1/0/0 Push counts in labelled rows', () => {
    const markup = render();
    expect(markup).toContain('NOTIFICATION DELIVERY');
    expect(markup).toContain('Delivery summary for this warning');
    for (const [channel, counts] of [['SMS', [0, 0, 1]], ['PUSH NOTIFICATIONS', [1, 0, 0]]] as const) {
      ['Sent', 'Failed', 'Skipped'].forEach((label, index) => {
        expect(markup).toContain(`aria-label="${channel}: ${label}, ${counts[index]}"`);
      });
    }
    // Counts are their own text elements instead of concatenated status strings.
    expect(markup).toContain('<span>Skipped</span><span>1</span>');
    expect(markup).toContain('<span>Sent</span><span>0</span>');
    expect(markup).toContain('Notifications that were not sent because delivery requirements were not met.');
  });

  it('shows reassurance and no failure/retry actions with no failed notifications', () => {
    const markup = render();
    expect(markup).toContain('No failed notifications require attention.');
    expect(markup).not.toContain('View Failed Notifications');
    expect(markup).not.toContain('Retry');
    expect(markup).not.toContain('role="dialog"');
  });

  it('preserves all six API counts and totals failures from both channels, not the record-list length', () => {
    const markup = render({ delivery: withFailures });
    for (const [channel, counts] of [['SMS', [21, 2, 1]], ['PUSH NOTIFICATIONS', [20, 3, 1]]] as const) {
      ['Sent', 'Failed', 'Skipped'].forEach((label, index) => {
        expect(markup).toContain(`aria-label="${channel}: ${label}, ${counts[index]}"`);
      });
    }
    expect(markup).toContain('5 notifications failed');
    expect(markup).toContain('View Failed Notifications');
    expect(markup).not.toContain('No failed notifications require attention.');
    expect(markup).not.toContain('Retry All');
  });

  it.each(['sms', 'push'] as const)('shows issues for a single failed %s notification', channel => {
    const delivery = structuredClone(noFailures);
    delivery.summary[channel].failed = 1;
    const markup = render({ delivery });
    expect(markup).toContain('1 notification failed');
    expect(markup).toContain('View Failed Notifications');
  });

  it('opens existing failed records with real reasons and masked contacts, then closes back to the summary', () => {
    expect(render({ delivery: withFailures })).not.toContain('John Perera');
    press('View Failed Notifications');
    const markup = render({ delivery: withFailures });
    for (const text of ['role="dialog"', 'John Perera', 'SMS', 'FAILED', 'Provider temporarily unavailable', '*******4418', 'Attempts: 2', 'Last attempt:']) {
      expect(markup).toContain(text);
    }
    expect(markup).not.toContain('Retry SMS');
    press('Close failed notifications');
    const closed = render({ delivery: withFailures });
    expect(closed).not.toContain('role="dialog"');
    expect(closed).toContain('5 notifications failed');
  });

  it.each(['android-back', 'backdrop'])('dismisses failed records using %s', method => {
    render({ delivery: withFailures });
    press('View Failed Notifications');
    render({ delivery: withFailures });
    if (method === 'android-back') ui.requestClose!();
    else press('Dismiss failed notifications');
    expect(render({ delivery: withFailures })).not.toContain('role="dialog"');
  });

  it('shows a clear message when counts exist without individual failed records', () => {
    const delivery = { ...withFailures, failedDeliveries: [] };
    render({ delivery });
    press('View Failed Notifications');
    expect(render({ delivery })).toContain('Individual failed notification details are not available.');
  });

  it('shows loading without stale counts or success feedback', () => {
    const markup = render({ loading: true, delivery: withFailures });
    expect(markup).toContain('Loading delivery status...');
    expect(markup).not.toContain('SMS: Sent');
    expect(markup).not.toContain('View Failed Notifications');
    expect(markup).not.toContain('No failed notifications require attention.');
  });

  it('retains the existing API reload callback only for load errors', () => {
    const reload = vi.fn();
    const markup = render({ error: 'Unable to load delivery status.', onRetry: reload });
    expect(markup).toContain('Unable to load delivery status.');
    expect(markup).not.toContain('SMS: Sent');
    expect(markup).not.toContain('No failed notifications require attention.');
    press('Retry loading delivery status');
    expect(reload).toHaveBeenCalledOnce();
  });

  it('distinguishes unavailable data from a summary with zero failures', () => {
    const markup = render({ delivery: null });
    expect(markup).toContain('No delivery data is available for this warning.');
    expect(markup).not.toContain('No failed notifications require attention.');
    expect(markup).not.toContain('SMS: Sent');
  });

  it('renders updated API counts when new data arrives, without making up retry results', () => {
    render({ delivery: withFailures });
    press('View Failed Notifications');
    const updated = render({ delivery: noFailures });
    expect(updated).toContain('SMS: Sent, 0');
    expect(updated).toContain('PUSH NOTIFICATIONS: Sent, 1');
    expect(updated).toContain('No failed notifications require attention.');
    expect(updated).not.toContain('role="dialog"');
    expect(updated).not.toContain('View Failed Notifications');
  });
});
