import * as React from 'react';
import type { SafeReport } from '@safealert/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResidentReportDetailsScreen } from './ResidentReportDetailsScreen';
import { cancelMyPendingReport, getMyReportById, listMyReportFieldConfirmations } from '../api/reportApi';

const lifecycle = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  params: { reportId: 'report-1' } as Record<string, string | string[] | undefined>,
  focus: (() => undefined) as () => (() => void) | undefined
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
  useLocalSearchParams: () => lifecycle.params,
  useRouter: () => navigation
}));

const alertMock = vi.hoisted(() => ({ alert: vi.fn() }));

vi.mock('react-native', () => ({
  ActivityIndicator: 'span',
  Alert: alertMock,
  FlatList: 'div',
  Image: 'img',
  Pressable: 'button',
  RefreshControl: 'refresh',
  ScrollView: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
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

vi.mock('@/services/api/client', () => ({
  ApiClientError: class ApiClientError extends Error {
    constructor(
      public readonly status: number,
      public readonly code: string,
      message: string
    ) {
      super(message);
    }
  },
  apiBaseUrl: 'http://localhost:4000/api/v1'
}));

vi.mock('../../shared/components/BottomNavigation', () => ({ BottomNavigation: () => null }));
vi.mock('../../shared/components/DashboardGlyph', () => ({ DashboardGlyph: () => null }));
vi.mock('../../shared/components/StatusBadge', () => ({
  StatusBadge: ({ label }: { label: string }) => <span>{label}</span>
}));
vi.mock('../api/reportApi', () => ({ cancelMyPendingReport: vi.fn(), getMyReportById: vi.fn(), listMyReportFieldConfirmations: vi.fn() }));

const pendingReport: SafeReport = {
  id: 'report-1',
  residentId: 'resident-1',
  hazardType: 'FLOOD',
  description: 'Water is rising near the lower bridge.',
  severity: 'HIGH',
  location: { type: 'Point', coordinates: [79.8612, 6.9271] },
  status: 'PENDING',
  createdAt: '2026-08-24T09:00:00.000Z',
  updatedAt: '2026-08-24T09:00:00.000Z'
};

beforeEach(() => {
  vi.mocked(listMyReportFieldConfirmations).mockResolvedValue({ confirmations: [] });
});

afterEach(() => {
  lifecycle.slots = [];
  lifecycle.cursor = 0;
  lifecycle.params = { reportId: 'report-1' };
  lifecycle.focus = () => undefined;
  vi.clearAllMocks();
});

describe('ResidentReportDetailsScreen', () => {
  it('shows edit and cancel actions for pending reports and navigates to edit by report id', async () => {
    vi.mocked(getMyReportById).mockResolvedValue({ report: pendingReport });

    render();
    await lifecycle.focus();
    await vi.waitFor(() => expect(screenText(render())).toContain('Edit Report'));

    const edit = screenButtons(render()).find((button) => screenText(button.children).trim() === 'Edit Report');
    const cancel = screenButtons(render()).find((button) => screenText(button.children).trim() === 'Cancel Report');

    expect(edit).toBeDefined();
    expect(cancel).toBeDefined();
    edit?.onPress();
    expect(navigation.push).toHaveBeenCalledWith({
      pathname: '/resident/report-edit',
      params: { reportId: 'report-1' }
    });
  });

  it.each(['VERIFIED', 'REJECTED', 'CANCELLED', 'RESOLVED'] as const)(
    'hides edit and cancel actions for %s reports',
    async (status) => {
      vi.mocked(getMyReportById).mockResolvedValue({ report: { ...pendingReport, status } });

      render();
      await lifecycle.focus();
      await vi.waitFor(() => expect(screenText(render())).toContain(status === 'CANCELLED' ? 'Cancelled' : status === 'VERIFIED' ? 'Verified' : status === 'REJECTED' ? 'Rejected' : 'Resolved'));

      expect(screenText(render())).not.toContain('Edit Report');
      expect(screenText(render())).not.toContain('Cancel Report');
    }
  );

  it('confirms before cancelling and displays the cancelled state after success', async () => {
    const cancelledReport: SafeReport = {
      ...pendingReport,
      status: 'CANCELLED',
      cancelledById: 'resident-1',
      cancelledAt: '2026-08-24T09:30:00.000Z'
    };
    vi.mocked(getMyReportById).mockResolvedValue({ report: pendingReport });
    vi.mocked(cancelMyPendingReport).mockResolvedValue({ report: cancelledReport });

    render();
    await lifecycle.focus();
    await vi.waitFor(() => expect(screenText(render())).toContain('Cancel Report'));
    const cancel = screenButtons(render()).find((button) => screenText(button.children).trim() === 'Cancel Report');
    cancel?.onPress();

    expect(alertMock.alert).toHaveBeenCalledWith(
      'Cancel this report?',
      expect.any(String),
      expect.arrayContaining([expect.objectContaining({ text: 'Cancel Report' })])
    );

    const destructive = alertMock.alert.mock.calls[0]?.[2]?.find((button: { text?: string }) => button.text === 'Cancel Report');
    destructive?.onPress();

    await vi.waitFor(() => expect(cancelMyPendingReport).toHaveBeenCalledWith('report-1', 'resident-token'));
    expect(screenText(render())).toContain('Cancelled report');
  });

  it('shows an API error and retries the same report id', async () => {
    vi.mocked(getMyReportById)
      .mockRejectedValueOnce(new Error('Report not found.'))
      .mockResolvedValueOnce({ report: pendingReport });

    render();
    await lifecycle.focus();
    await vi.waitFor(() => expect(screenText(render())).toContain('Report not found.'));

    const retry = screenButtons(render()).find((button) => screenText(button.children).trim() === 'Retry');
    expect(retry).toBeDefined();
    retry?.onPress();

    await vi.waitFor(() => expect(screenText(render())).toContain('Waiting for verification'));
    expect(getMyReportById).toHaveBeenCalledTimes(2);
    expect(getMyReportById).toHaveBeenNthCalledWith(1, 'report-1', 'resident-token');
    expect(getMyReportById).toHaveBeenNthCalledWith(2, 'report-1', 'resident-token');
  });
});

function render() {
  lifecycle.cursor = 0;
  return ResidentReportDetailsScreen();
}

type ButtonProps = {
  children?: React.ReactNode;
  accessibilityRole?: string;
  onPress: () => void;
};

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

