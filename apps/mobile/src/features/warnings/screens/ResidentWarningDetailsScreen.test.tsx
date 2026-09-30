import * as React from 'react';
import type { ResidentWarning } from '@safealert/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResidentWarningDetailsScreen } from './ResidentWarningDetailsScreen';
import { acknowledgeResidentWarning, getResidentWarning } from '../../warnings/api/residentWarningApi';

// Follow the existing mobile screen tests: render the screen function directly and
// stub the native primitives, so no device or renderer runtime is required.
const lifecycle = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effectCursor: 0,
  effectDeps: [] as string[],
  params: { warningId: 'warning-1' } as Record<string, string | string[] | undefined>,
}));
const navigation = vi.hoisted(() => ({ back: vi.fn(), canGoBack: vi.fn(() => true), replace: vi.fn() }));
const gestures = vi.hoisted(() => ({
  handlers: {} as {
    onMoveShouldSetPanResponder?: (event: unknown, gesture: { dy: number; dx: number }) => boolean;
    onPanResponderMove?: (event: unknown, gesture: { dy: number }) => void;
    onPanResponderRelease?: (event: unknown, gesture: { dy: number; vy: number }) => void;
  },
}));

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof React>(),
  useCallback: (callback: unknown) => callback,
  useEffect: (callback: () => void, deps?: unknown[]) => {
    // Only re-run an effect when its dependencies change, so the real fetch
    // effect is exercised once per mount like it is on a device.
    const index = lifecycle.effectCursor++;
    const key = JSON.stringify(deps ?? null);
    if (lifecycle.effectDeps[index] === key) return;
    lifecycle.effectDeps[index] = key;
    callback();
  },
  useMemo: (factory: () => unknown) => factory(),
  useRef: (initial: unknown) => ({ current: initial }),
  useState: (initial: unknown) => {
    const index = lifecycle.cursor++;
    if (!(index in lifecycle.slots)) lifecycle.slots[index] = initial;
    return [lifecycle.slots[index], (value: unknown) => {
      lifecycle.slots[index] = typeof value === 'function' ? value(lifecycle.slots[index]) : value;
    }];
  }
}));

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => lifecycle.params,
  useRouter: () => navigation,
  useFocusEffect: (callback: () => void | (() => void)) => {
    const index = lifecycle.effectCursor++;
    const key = `focus-${index}`;
    if (lifecycle.effectDeps[index] === key) return;
    lifecycle.effectDeps[index] = key;
    callback();
  },
}));

vi.mock('react-native', () => ({
  ActivityIndicator: 'span',
  Animated: {
    Value: class MockAnimatedValue { setValue(): void {} },
    View: 'div',
    timing: () => ({ start: () => undefined }),
  },
  Modal: ({ children, visible }: { children?: React.ReactNode; visible?: boolean }) =>
    (visible ? <div>{children}</div> : null),
  PanResponder: {
    create: (handlers: typeof gestures.handlers) => {
      gestures.handlers = handlers;
      return { panHandlers: {} };
    },
  },
  Pressable: ({ children, onPress, disabled, accessibilityLabel }: {
    children?: React.ReactNode; onPress?: () => void; disabled?: boolean; accessibilityLabel?: string;
  }) => <button aria-label={accessibilityLabel} disabled={disabled} onClick={onPress}>{children}</button>,
  ScrollView: ({ children }: { children?: React.ReactNode }) => <section>{children}</section>,
  Platform: { select: (options: { default?: unknown }) => options.default },
  StyleSheet: { create: (styles: unknown) => styles },
  Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  View: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

// The screen imports this module by relative path, so mock that exact specifier.
vi.mock('../../auth/hooks/useAuth', () => ({
  useAuth: () => ({ accessToken: 'resident-token' }),
}));

vi.mock('../../warnings/api/residentWarningApi', () => ({
  getResidentWarning: vi.fn(),
  acknowledgeResidentWarning: vi.fn(),
}));

const baseWarning: ResidentWarning = {
  id: 'warning-1',
  assessmentId: 'assessment-1',
  hazardReportId: 'report-1',
  createdById: 'officer-1',
  riskLevel: 'HIGH',
  status: 'PUBLISHED',
  affectedArea: 'Riverside Village',
  message: 'Flood waters are rising rapidly in the lower valley.',
  requiredAction: 'Evacuate immediately to the nearest relief center.',
  unsafeRoads: 'River Road, Valley Bridge, Low-lying roads near the canal.',
  safeRoutes: 'Highland Road via Route 5, Main Road elevated section.',
  createdAt: '2026-09-01T06:00:00.000Z',
  updatedAt: '2026-09-01T06:00:00.000Z',
};

beforeEach(() => {
  vi.mocked(getResidentWarning).mockResolvedValue({ warning: baseWarning });
});

afterEach(() => {
  lifecycle.slots = [];
  lifecycle.cursor = 0;
  lifecycle.effectCursor = 0;
  lifecycle.effectDeps = [];
  lifecycle.params = { warningId: 'warning-1' };
  vi.clearAllMocks();
});

describe('ResidentWarningDetailsScreen – Safety Guidance (LDFEW-116)', () => {
  it('keeps the warning details and the Safety Guidance entry point visible while the sheet is closed', async () => {
    await renderLoaded();

    const text = screenText(render());
    expect(text).toContain('HIGH WARNING');
    expect(text).toContain('Riverside Village');
    expect(text).toContain('Warning Message');
    expect(text).toContain(baseWarning.message);
    expect(text).toContain('Required Action');
    expect(text).toContain(baseWarning.requiredAction);
    expect(text).toContain('⚠️ Safety Guidance');
    expect(text).toContain('View important actions, roads to avoid, and recommended safe routes.');
    expect(text).toContain('View Safety Guidance');
    expect(text).toContain('Not yet acknowledged');
    expect(text).toContain('I am Safe');
    expect(text).toContain('I am Evacuating');
    expect(text).toContain('I Need Assistance');
    // The sheet is closed, so none of its sections are rendered yet.
    expect(text).not.toContain('Recommended Safe Routes');
    expect(text).not.toContain('Roads to Avoid');
    expect(text).not.toContain('Risk / Affected Area');
  });

  it('opens a sheet that lists every guidance section in priority order', async () => {
    await openSheet();

    const text = screenText(render());
    expect(text).toContain('Safety Guidance');
    expect(text).toContain('Close');
    expect(text).toContain('❗ Required Action');
    expect(text).toContain(baseWarning.requiredAction);
    expect(text).toContain('🚧 Roads to Avoid');
    expect(text).toContain(baseWarning.unsafeRoads);
    expect(text).toContain('✅ Recommended Safe Routes');
    expect(text).toContain(baseWarning.safeRoutes);
    expect(text).toContain('📢 Warning Message');
    expect(text).toContain('Risk / Affected Area');
    expect(text).toContain('Riverside Village');

    const order = [
      text.indexOf('❗ Required Action'),
      text.indexOf('🚧 Roads to Avoid'),
      text.indexOf('✅ Recommended Safe Routes'),
      text.indexOf('📢 Warning Message'),
      text.indexOf('Risk / Affected Area'),
    ];
    expect(order.every((position) => position >= 0)).toBe(true);
    expect([...order].sort((left, right) => left - right)).toEqual(order);
  });

  it('renders the sheet body inside a scrollable container so long guidance stays reachable', async () => {
    const longSafeRoutes = `Highland Road via Route 5. ${'Elevated Main Road section. '.repeat(40)}`;
    vi.mocked(getResidentWarning).mockResolvedValue({
      warning: { ...baseWarning, safeRoutes: longSafeRoutes },
    });

    await renderLoaded();
    expect(collectElements(render()).filter((element) => element.type === 'section')).toHaveLength(1);

    await openSheet();

    expect(screenText(render())).toContain(longSafeRoutes);
    expect(collectElements(render()).filter((element) => element.type === 'section')).toHaveLength(2);
  });

  it('shows the CRITICAL risk level on the warning screen and inside the sheet', async () => {
    vi.mocked(getResidentWarning).mockResolvedValue({
      warning: { ...baseWarning, riskLevel: 'CRITICAL' },
    });
    await openSheet();

    const text = screenText(render());
    expect(text).toContain('CRITICAL WARNING');
    expect(text).toContain('Riverside Village');
  });

  it('closes the sheet from the Close control and returns to the warning screen', async () => {
    await openSheet();
    press(render(), 'Close');

    const text = screenText(render());
    expect(text).not.toContain('Recommended Safe Routes');
    expect(text).not.toContain('Risk / Affected Area');
    expect(text).toContain('View Safety Guidance');
    expect(text).toContain('Riverside Village');
  });

  it('closes the sheet when the dimmed backdrop is pressed', async () => {
    await openSheet();
    press(render(), 'Dismiss safety guidance');

    expect(screenText(render())).not.toContain('Recommended Safe Routes');
  });

  it('closes the sheet when it is swiped down past the dismiss threshold', async () => {
    await openSheet();
    expect(screenText(render())).toContain('Recommended Safe Routes');

    const release = { dy: 140, dx: 4, vy: 1.1 };
    expect(gestures.handlers.onMoveShouldSetPanResponder?.(null, release)).toBe(true);
    gestures.handlers.onPanResponderMove?.(null, release);
    gestures.handlers.onPanResponderRelease?.(null, release);

    expect(screenText(render())).not.toContain('Recommended Safe Routes');
  });

  it('keeps the sheet open when the drag is too small to dismiss', async () => {
    await openSheet();

    const release = { dy: 20, dx: 2, vy: 0.1 };
    gestures.handlers.onMoveShouldSetPanResponder?.(null, release);
    gestures.handlers.onPanResponderMove?.(null, release);
    gestures.handlers.onPanResponderRelease?.(null, release);

    expect(screenText(render())).toContain('Recommended Safe Routes');
  });

  it('does not claim sideways or upward drags so the sheet body keeps scrolling normally', async () => {
    await openSheet();

    expect(gestures.handlers.onMoveShouldSetPanResponder?.(null, { dy: 2, dx: 60 })).toBe(false);
    expect(gestures.handlers.onMoveShouldSetPanResponder?.(null, { dy: 60, dx: 90 })).toBe(false);
    expect(gestures.handlers.onMoveShouldSetPanResponder?.(null, { dy: 60, dx: 4 })).toBe(true);
  });

  it.each([undefined, '', '   '])(
    'shows the safe-routes fallback (%j) without hiding the rest of the guidance',
    async (safeRoutes) => {
      vi.mocked(getResidentWarning).mockResolvedValue({
        warning: { ...baseWarning, safeRoutes },
      });
      await openSheet();

      const text = screenText(render());
      expect(text).toContain('No recommended safe routes are currently available.');
      // The guidance sheet itself is never hidden when safe routes are missing.
      expect(text).toContain('❗ Required Action');
      expect(text).toContain('🚧 Roads to Avoid');
      expect(text).toContain('📢 Warning Message');
    }
  );

  it('shows the unavailable message gracefully when all guidance fields are missing', async () => {
    vi.mocked(getResidentWarning).mockResolvedValue({
      warning: {
        ...baseWarning,
        message: '',
        requiredAction: '',
        unsafeRoads: '',
        safeRoutes: undefined,
      },
    });
    await openSheet();

    const text = screenText(render());
    expect(text).toContain('Safety guidance is currently unavailable for this warning.');
    // The resident can still tell which warning the sheet belongs to.
    expect(text).toContain('Risk / Affected Area');
    expect(text).toContain('HIGH WARNING');
    expect(text).toContain('Riverside Village');
    expect(text).not.toContain('🚧 Roads to Avoid');
  });

  it('shows the acknowledgement response card when not yet acknowledged', async () => {
    await renderLoaded();

    const text = screenText(render());
    expect(text).toContain('How are you responding?');
    expect(text).toContain('I am Safe');
    expect(text).toContain('I am Evacuating');
    expect(text).toContain('I Need Assistance');
    expect(text).toContain('Submit response');
  });

  it('keeps the existing acknowledgement submission without refetching or reopening the sheet', async () => {
    vi.mocked(acknowledgeResidentWarning).mockResolvedValue({
      warningId: baseWarning.id,
      response: 'EVACUATING',
      acknowledgedAt: '2026-09-01T08:00:00.000Z',
    });
    await renderLoaded();

    press(render(), 'I am Evacuating');
    press(render(), 'Submit response');
    await vi.waitFor(() => expect(acknowledgeResidentWarning).toHaveBeenCalledExactlyOnceWith(
      baseWarning.id,
      { response: 'EVACUATING' },
      'resident-token'
    ));

    // Opening and closing the guidance sheet must not fetch the warning again.
    press(render(), 'View Safety Guidance');
    press(render(), 'Close');
    expect(getResidentWarning).toHaveBeenCalledTimes(1);

    const text = screenText(render());
    expect(text).toContain('Acknowledged');
    expect(text).not.toContain('How are you responding?');
  });

  it('hides the acknowledgement card after the warning has been acknowledged', async () => {
    vi.mocked(getResidentWarning).mockResolvedValue({
      warning: {
        ...baseWarning,
        acknowledgedAt: '2026-09-01T07:00:00.000Z',
        acknowledgementResponse: 'SAFE',
      },
    });
    render();
    await vi.waitFor(() => {
      const text = screenText(render());
      expect(text).not.toContain('How are you responding?');
      expect(text).not.toContain('Submit response');
      expect(text).toContain('Acknowledged');
    });
  });

  it('shows a loading state while fetching', () => {
    vi.mocked(getResidentWarning).mockReturnValueOnce(new Promise(() => undefined));
    render();
    // Before the promise resolves, warning is null so the entry point is not rendered yet.
    const text = screenText(render());
    expect(text).not.toContain('Safety Guidance');
    expect(text).not.toContain('View Safety Guidance');
  });

  it('shows an error state if the API call fails', async () => {
    vi.mocked(getResidentWarning).mockRejectedValueOnce(new Error('Network error'));
    render();
    await vi.waitFor(() => {
      const text = screenText(render());
      expect(text).toContain('This warning is unavailable.');
      expect(text).not.toContain('View Safety Guidance');
    });
  });
});

function render() {
  lifecycle.cursor = 0;
  lifecycle.effectCursor = 0;
  return ResidentWarningDetailsScreen();
}

async function renderLoaded() {
  render();
  await vi.waitFor(() => expect(screenText(render())).toContain('View Safety Guidance'));
}

async function openSheet() {
  await renderLoaded();
  press(render(), 'View Safety Guidance');
  // "Risk / Affected Area" is only rendered inside the sheet, so it proves the
  // sheet is open even when every guidance field is unavailable.
  expect(screenText(render())).toContain('Risk / Affected Area');
}

type TestElement = React.ReactElement<{
  children?: React.ReactNode;
  onClick?: () => void;
  'aria-label'?: string;
}>;

function press(node: React.ReactNode, label: string) {
  const target = collectElements(node).find((element) =>
    element.type === 'button' &&
    (screenText(element).includes(label) || element.props['aria-label'] === label)
  );

  if (!target) throw new Error(`No pressable labelled "${label}" was found.`);
  target.props.onClick?.();
}

function collectElements(node: React.ReactNode, found: TestElement[] = []): TestElement[] {
  if (Array.isArray(node)) {
    for (const child of node) collectElements(child, found);
    return found;
  }
  if (!React.isValidElement(node)) return found;

  const element = node as TestElement;
  found.push(element);

  if (typeof element.type === 'function') {
    collectElements((element.type as (props: unknown) => React.ReactNode)(element.props), found);
    return found;
  }

  collectElements(element.props.children, found);
  return found;
}

function screenText(node: React.ReactNode): string {
  if (Array.isArray(node)) return node.map(screenText).join(' ');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return '';
  if (typeof node.type === 'function') {
    return screenText((node.type as (props: unknown) => React.ReactNode)(node.props));
  }
  return screenText(node.props.children);
}
