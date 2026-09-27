import * as React from 'react';
import type { ReportStatus, SafeReport } from '@safealert/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResidentReportsScreen } from './ResidentReportsScreen';
import { listMyReports } from '../api/reportApi';

const lifecycle = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  focus: (() => undefined) as () => (() => void) | Promise<void> | undefined
}));
const navigation = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn() }));

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof React>(),
  useCallback: (callback: unknown) => callback,
  useEffect: (callback: () => void) => { callback(); },
  useRef: (initial: unknown) => {
    const index = lifecycle.cursor++;
    lifecycle.slots[index] ??= { current: initial };
    return lifecycle.slots[index];
  },
  useState: (initial: unknown) => {
    const index = lifecycle.cursor++;
    if (!(index in lifecycle.slots)) lifecycle.slots[index] = initial;
    return [lifecycle.slots[index], (value: unknown) => {
      lifecycle.slots[index] = typeof value === 'function' ? value(lifecycle.slots[index]) : value;
    }];
  }
}));

vi.mock('expo-router', () => ({
  useFocusEffect: (callback: typeof lifecycle.focus) => { lifecycle.focus = callback; },
  useRouter: () => navigation
}));

vi.mock('react-native', () => ({
  ActivityIndicator: 'span',
  FlatList: ({
    data,
    ListEmptyComponent,
    ListHeaderComponent,
    renderItem
  }: {
    data: SafeReport[];
    ListEmptyComponent?: React.ReactNode;
    ListHeaderComponent?: React.ReactNode;
    renderItem: ({ item }: { item: SafeReport }) => React.ReactNode;
  }) => (
    <div>
      {ListHeaderComponent}
      {data.length ? data.map((item) => <React.Fragment key={item.id}>{renderItem({ item })}</React.Fragment>) : ListEmptyComponent}
    </div>
  ),
  Pressable: 'button',
  RefreshControl: 'refresh',
  StyleSheet: { create: (styles: unknown) => styles },
  Text: 'span',
  View: 'div'
}));

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
}));

vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ accessToken: 'resident-token' })
}));

vi.mock('../../shared/components/BottomNavigation', () => ({ BottomNavigation: () => null }));
vi.mock('../../shared/components/DashboardGlyph', () => ({ DashboardGlyph: () => null }));
vi.mock('../../shared/components/StatusBadge', () => ({
  StatusBadge: ({ label }: { label: string }) => <span>{label}</span>
}));
vi.mock('../api/reportApi', () => ({ listMyReports: vi.fn() }));

const baseReport: SafeReport = {
  id: 'pending-report',
  residentId: 'resident-1',
  hazardType: 'FLOOD',
  description: 'Water is rising near the lower bridge.',
  severity: 'HIGH',
  location: { type: 'Point', coordinates: [79.8612, 6.9271] },
  status: 'PENDING',
  createdAt: '2026-08-24T09:00:00.000Z',
  updatedAt: '2026-08-24T09:00:00.000Z'
};

const statusReports: SafeReport[] = [
  makeReport('pending-report', 'PENDING', { mediaReference: '/api/v1/media/report-evidence/photo.jpg' }),
  makeReport('verified-report', 'VERIFIED', { voiceEvidence: { mediaReference: '/api/v1/media/report-evidence/voice.m4a', contentType: 'audio/m4a', durationSeconds: 11 } }),
  makeReport('rejected-report', 'REJECTED'),
  makeReport('cancelled-report', 'CANCELLED'),
  makeReport('resolved-report', 'RESOLVED')
];

beforeEach(() => {
  vi.mocked(listMyReports).mockResolvedValue({ reports: statusReports });
});

afterEach(() => {
  lifecycle.slots = [];
  lifecycle.cursor = 0;
  lifecycle.focus = () => undefined;
  vi.clearAllMocks();
});

describe('ResidentReportsScreen', () => {
  it('renders real reports returned from /reports/mine without raw ids or media paths', async () => {
    render();
    await lifecycle.focus();
    await vi.waitFor(() => expect(screenText(render())).toContain('Flood'));

    const text = screenText(render());
    expect(listMyReports).toHaveBeenCalledWith('resident-token');
    expect(text).toContain('5 submitted reports');
    expect(text).toContain('Flood');
    expect(text).toContain('Verified');
    expect(text).toContain('Rejected');
    expect(text).toContain('Cancelled');
    expect(text).toContain('Resolved');
    expect(screenButtons(render()).some((button) => screenText(button.children).trim() === 'Resolved')).toBe(false);
    expect(text).toContain('Location:');
    expect(text).toContain('6.9271, 79.8612');
    expect(text).toContain('Photo evidence');
    expect(text).toContain('Voice note');
    expect(text).not.toContain('pending-report');
    expect(text).not.toContain('/api/v1/media');
  });

  it('shows a loading state while the real query is in flight', async () => {
    vi.mocked(listMyReports).mockReturnValue(new Promise(() => undefined));

    render();
    void lifecycle.focus();

    expect(screenText(render())).toContain('Loading your reports...');
  });

  it('shows the all-reports empty state with a Report Hazard action', async () => {
    vi.mocked(listMyReports).mockResolvedValue({ reports: [] });

    render();
    await lifecycle.focus();
    await vi.waitFor(() => expect(screenText(render())).toContain("You haven't submitted any hazard reports yet."));

    const reportHazard = screenButtons(render()).find((button) => screenText(button.children).trim() === 'Report Hazard');
    expect(reportHazard).toBeDefined();
    reportHazard?.onPress();
    expect(navigation.push).toHaveBeenCalledWith('/resident/report-hazard');
  });

  it('shows an empty filtered state when another status filter has no matches', async () => {
    vi.mocked(listMyReports).mockResolvedValue({ reports: [makeReport('pending-only', 'PENDING')] });

    render();
    await lifecycle.focus();
    await vi.waitFor(() => expect(screenText(render())).toContain('1 submitted report'));
    pressButton('Verified');

    const text = screenText(render());
    expect(text).toContain('0 verified reports');
    expect(text).toContain('No reports match this filter.');
    expect(text).not.toContain("You haven't submitted any hazard reports yet.");
  });

  it('shows a safe error state and retries the real query', async () => {
    vi.mocked(listMyReports)
      .mockRejectedValueOnce(new Error('HTTP 500 with stack trace'))
      .mockResolvedValueOnce({ reports: [makeReport('retry-report', 'PENDING')] });

    render();
    await lifecycle.focus();
    await vi.waitFor(() => expect(screenText(render())).toContain('Your reports could not be loaded.'));

    expect(screenText(render())).not.toContain('HTTP 500');
    pressButton('Try Again');

    await vi.waitFor(() => expect(listMyReports).toHaveBeenCalledTimes(2));
    expect(screenText(render())).toContain('Flood');
  });

  it.each([
    ['Pending', 'Waiting for official verification'],
    ['Verified', 'A disaster officer verified this report.'],
    ['Rejected', 'A disaster officer reviewed this report and did not verify it.'],
    ['Cancelled', 'You cancelled this report before official review.'],
    ['Resolved', 'This report is no longer active.']
  ])('renders the %s card with resident-facing status wording', async (statusLabel, statusDescription) => {
    render();
    await lifecycle.focus();
    await vi.waitFor(() => expect(screenText(render())).toContain(statusLabel));

    const text = screenText(render());
    expect(text).toContain(statusLabel);
    expect(text).toContain(statusDescription);
  });

  it('filters by official report status and opens the real report details route', async () => {
    render();
    await lifecycle.focus();
    await vi.waitFor(() => expect(screenText(render())).toContain('5 submitted reports'));

    pressButton('Rejected');
    let text = screenText(render());
    expect(text).toContain('1 rejected report');
    expect(text).toContain('Rejected');
    expect(text).not.toContain('A disaster officer verified this report.');

    const openReport = screenButtons(render()).find((item) => item.accessibilityLabel === 'Open Flood report details');
    expect(openReport).toBeDefined();
    openReport?.onPress();
    expect(navigation.push).toHaveBeenCalledWith({
      pathname: '/resident/report-status',
      params: { reportId: 'rejected-report' }
    });

    pressButton('All');
    text = screenText(render());
    expect(text).toContain('5 submitted reports');
  });
});

function render() {
  lifecycle.cursor = 0;
  return ResidentReportsScreen();
}

type ButtonProps = {
  children?: React.ReactNode;
  accessibilityLabel?: string;
  accessibilityRole?: string;
  onPress: () => void;
};

function pressButton(label: string) {
  const button = screenButtons(render()).find((item) => screenText(item.children).trim() === label);
  expect(button).toBeDefined();
  button?.onPress();
}

function screenButtons(node: React.ReactNode): ButtonProps[] {
  if (Array.isArray(node)) return node.flatMap(screenButtons);
  if (!React.isValidElement<ButtonProps>(node)) return [];
  if (typeof node.type === 'function') {
    return screenButtons((node.type as (props: unknown) => React.ReactNode)(node.props));
  }
  return node.props.accessibilityRole === 'button' ? [node.props] : screenButtons(node.props.children);
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

function makeReport(id: string, status: ReportStatus, overrides: Partial<SafeReport> = {}): SafeReport {
  return {
    ...baseReport,
    id,
    status,
    ...overrides
  };
}
