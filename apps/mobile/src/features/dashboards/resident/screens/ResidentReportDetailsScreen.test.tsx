import * as React from 'react';
import type { ResidentFieldConfirmation, SafeReport } from '@safealert/contracts';
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
  Platform: { OS: 'ios', select: (value: Record<string, unknown>) => value.ios ?? value.default },
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
vi.mock('../../shared/maps/LocationPreview', () => ({
  LocationPreview: ({ title }: { title: string }) => <span>{title}</span>
}));
vi.mock('../../shared/voice/VoiceNotePlayer', () => ({
  VoiceNotePlayer: ({ title }: { title: string }) => <span>{title}</span>
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

    expect(cancelMyPendingReport).not.toHaveBeenCalled();
    expect(alertMock.alert).toHaveBeenCalledWith(
      'Cancel this report?',
      'Your report will no longer be considered active for review. This action cannot be undone.',
      expect.arrayContaining([
        expect.objectContaining({ text: 'Keep Report', style: 'cancel' }),
        expect.objectContaining({ text: 'Cancel Report', style: 'destructive' })
      ])
    );

    const destructive = alertMock.alert.mock.calls[0]?.[2]?.find((button: { text?: string }) => button.text === 'Cancel Report');
    destructive?.onPress();

    await vi.waitFor(() => expect(cancelMyPendingReport).toHaveBeenCalledWith('report-1', 'resident-token'));
    expect(screenText(render())).toContain('Cancelled report');
  });

  it('shows a safe cancel failure message and retries without marking the report cancelled locally', async () => {
    const cancelledReport: SafeReport = {
      ...pendingReport,
      status: 'CANCELLED',
      cancelledById: 'resident-1',
      cancelledAt: '2026-08-24T09:30:00.000Z'
    };
    vi.mocked(getMyReportById).mockResolvedValue({ report: pendingReport });
    vi.mocked(cancelMyPendingReport)
      .mockRejectedValueOnce(new Error('Network failure with private details'))
      .mockResolvedValueOnce({ report: cancelledReport });

    render();
    await lifecycle.focus();
    await vi.waitFor(() => expect(screenText(render())).toContain('Cancel Report'));
    screenButtons(render()).find((button) => screenText(button.children).trim() === 'Cancel Report')?.onPress();
    alertMock.alert.mock.calls[0]?.[2]?.find((button: { text?: string }) => button.text === 'Cancel Report')?.onPress();

    await vi.waitFor(() => expect(screenText(render())).toContain('Your report could not be cancelled.'));
    expect(screenText(render())).toContain('Try Again');
    expect(screenText(render())).not.toContain('Cancelled report');

    screenButtons(render()).find((button) => screenText(button.children).trim() === 'Try Again')?.onPress();

    await vi.waitFor(() => expect(cancelMyPendingReport).toHaveBeenCalledTimes(2));
    expect(screenText(render())).toContain('Cancelled report');
  });

  it('refreshes and explains when cancel loses the pending status race', async () => {
    const { ApiClientError } = await import('@/services/api/client');
    vi.mocked(getMyReportById)
      .mockResolvedValueOnce({ report: pendingReport })
      .mockResolvedValueOnce({ report: { ...pendingReport, status: 'VERIFIED' } });
    vi.mocked(cancelMyPendingReport).mockRejectedValueOnce(
      new ApiClientError(409, 'INVALID_REPORT_STATE', 'Only pending reports can be cancelled.')
    );

    render();
    await lifecycle.focus();
    await vi.waitFor(() => expect(screenText(render())).toContain('Cancel Report'));
    screenButtons(render()).find((button) => screenText(button.children).trim() === 'Cancel Report')?.onPress();
    alertMock.alert.mock.calls[0]?.[2]?.find((button: { text?: string }) => button.text === 'Cancel Report')?.onPress();

    await vi.waitFor(() => expect(screenText(render())).toContain('This report can no longer be cancelled because its status has changed.'));
    expect(screenText(render())).toContain('Verified');
    expect(screenText(render())).not.toContain('Try Again');
    expect(screenText(render())).not.toContain('Cancel Report');
  });
  it('shows an API error and retries the same report id', async () => {
    vi.mocked(getMyReportById)
      .mockRejectedValueOnce(new Error('Report not found.'))
      .mockResolvedValueOnce({ report: pendingReport });

    render();
    await lifecycle.focus();
    await vi.waitFor(() => expect(screenText(render())).toContain('Report could not be loaded.'));

    const retry = screenButtons(render()).find((button) => screenText(button.children).trim() === 'Retry');
    expect(retry).toBeDefined();
    retry?.onPress();

    await vi.waitFor(() => expect(screenText(render())).toContain('A disaster officer has not completed the official review yet.'));
    expect(getMyReportById).toHaveBeenCalledTimes(2);
    expect(getMyReportById).toHaveBeenNthCalledWith(1, 'report-1', 'resident-token');
    expect(getMyReportById).toHaveBeenNthCalledWith(2, 'report-1', 'resident-token');
  });

  it('separates official status from community field checks without exposing raw identifiers or media paths', async () => {
    vi.mocked(getMyReportById).mockResolvedValue({
      report: {
        ...pendingReport,
        mediaReference: '/api/v1/media/report-evidence/photo.jpg'
      }
    });

    render();
    await lifecycle.focus();
    await vi.waitFor(() => expect(screenText(render())).toContain('Official Review'));

    const text = screenText(render());
    expect(text).toContain('Community Field Check');
    expect(text).toContain('Community volunteer checks are separate from the official review.');
    expect(text).toContain('Not reviewed');
    expect(text).toContain('Not reviewed by a community volunteer yet.');
    expect(text).toContain('Selected location');
    expect(text).not.toContain('Report ID');
    expect(text).not.toContain('/api/v1/media/report-evidence/photo.jpg');
  });

  it.each([
    ['PENDING', 'Pending', 'A disaster officer has not completed the official review yet.'],
    ['VERIFIED', 'Verified', 'A disaster officer verified this report.'],
    ['REJECTED', 'Rejected', 'A disaster officer reviewed this report and did not verify it.'],
    ['CANCELLED', 'Cancelled', 'You cancelled this report before official review.'],
    ['RESOLVED', 'Resolved', 'This report is no longer active.']
  ] as const)('shows the %s official review section from Report.status only', async (status, label, detail) => {
    vi.mocked(getMyReportById).mockResolvedValue({
      report: {
        ...pendingReport,
        status
      }
    });

    render();
    await lifecycle.focus();
    await vi.waitFor(() => expect(screenText(render())).toContain('Official Review'));

    const text = screenText(render());
    expect(text).toContain(label);
    expect(text).toContain(detail);
  });

  it('shows the rejection reason only for rejected reports', async () => {
    vi.mocked(getMyReportById).mockResolvedValue({
      report: {
        ...pendingReport,
        status: 'REJECTED',
        rejectionReason: 'Location could not be verified.'
      }
    });

    render();
    await lifecycle.focus();
    await vi.waitFor(() => expect(screenText(render())).toContain('Reason for rejection'));

    let text = screenText(render());
    expect(text).toContain('Location could not be verified.');

    vi.mocked(getMyReportById).mockResolvedValue({
      report: {
        ...pendingReport,
        status: 'VERIFIED',
        rejectionReason: 'Should not be shown.'
      }
    });
    lifecycle.slots = [];

    render();
    await lifecycle.focus();

    text = screenText(render());
    expect(text).not.toContain('Reason for rejection');
    expect(text).not.toContain('Should not be shown.');
  });

  it('keeps volunteer confirmed outcomes separate from the official report status', async () => {
    vi.mocked(getMyReportById).mockResolvedValue({ report: pendingReport });
    vi.mocked(listMyReportFieldConfirmations).mockResolvedValue({
      confirmations: [fieldConfirmation('CONFIRMED')]
    });

    render();
    await lifecycle.focus();
    await vi.waitFor(() => expect(screenText(render())).toContain('Community field check confirmed'));

    const text = screenText(render());
    expect(text).toContain('Official Review');
    expect(text).toContain('Pending');
    expect(text).toContain('A disaster officer has not completed the official review yet.');
    expect(text).toContain('A community volunteer reported that the current situation matched this report.');
    expect(text).not.toContain('A disaster officer verified this report.');
  });

  it('keeps volunteer unable-to-confirm outcomes separate from official rejection', async () => {
    vi.mocked(getMyReportById).mockResolvedValue({ report: pendingReport });
    vi.mocked(listMyReportFieldConfirmations).mockResolvedValue({
      confirmations: [fieldConfirmation('UNABLE_TO_CONFIRM')]
    });

    render();
    await lifecycle.focus();
    await vi.waitFor(() => expect(screenText(render())).toContain('Unable to confirm'));

    const text = screenText(render());
    expect(text).toContain('Official Review');
    expect(text).toContain('Pending');
    expect(text).toContain('Unable to confirm');
    expect(text).toContain('A community volunteer could not confirm that the current situation matched this report.');
    expect(text).toContain('Reason');
    expect(text).toContain('Unable to access location');
    expect(text).not.toContain('Reason for rejection');
    expect(text).not.toContain('A disaster officer reviewed this report and did not verify it.');
  });

  it('shows unable-to-confirm reason details when they are safe for the resident response', async () => {
    vi.mocked(getMyReportById).mockResolvedValue({ report: { ...pendingReport, status: 'VERIFIED' } });
    vi.mocked(listMyReportFieldConfirmations).mockResolvedValue({
      confirmations: [
        fieldConfirmation('UNABLE_TO_CONFIRM', {
          reason: 'Location does not match',
          reasonDetails: 'The volunteer found the hazard one street away.'
        })
      ]
    });

    render();
    await lifecycle.focus();
    await vi.waitFor(() => expect(screenText(render())).toContain('Location does not match'));

    const text = screenText(render());
    expect(text).toContain('Official Review');
    expect(text).toContain('Verified');
    expect(text).toContain('A disaster officer verified this report.');
    expect(text).toContain('Unable to confirm');
    expect(text).toContain('The volunteer found the hazard one street away.');
    expect(text).not.toContain('Reason for rejection');
  });

  it('shows multiple field checks without implying all volunteers agreed', async () => {
    vi.mocked(getMyReportById).mockResolvedValue({ report: { ...pendingReport, status: 'REJECTED' } });
    vi.mocked(listMyReportFieldConfirmations).mockResolvedValue({
      confirmations: [
        fieldConfirmation('CONFIRMED'),
        fieldConfirmation('UNABLE_TO_CONFIRM', { id: 'confirmation-unable-2', reason: 'Report information is incorrect' })
      ]
    });

    render();
    await lifecycle.focus();
    await vi.waitFor(() => expect(screenText(render())).toContain('community field checks are shown below.'));

    const text = screenText(render());
    expect(text).toContain('Official Review');
    expect(text).toContain('Rejected');
    expect(text).toContain('Community field check confirmed');
    expect(text).toContain('Unable to confirm');
    expect(text).toContain('Report information is incorrect');
    expect(text).not.toContain('volunteer-1');
    expect(text).not.toContain('@');
  });

  it('shows loading and safe error copy without exposing raw response details', async () => {
    vi.mocked(getMyReportById).mockReturnValueOnce(new Promise(() => undefined));

    render();
    void lifecycle.focus();
    expect(screenText(render())).toContain('Loading report...');

    lifecycle.slots = [];
    vi.mocked(getMyReportById).mockRejectedValueOnce(new Error('HTTP 404 private report object'));

    render();
    await lifecycle.focus();
    await vi.waitFor(() => expect(screenText(render())).toContain('Report could not be loaded.'));

    const text = screenText(render());
    expect(text).not.toContain('HTTP 404 private report object');
    expect(screenButtons(render()).some((button) => screenText(button.children).trim() === 'Retry')).toBe(true);
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

function fieldConfirmation(
  outcome: 'CONFIRMED',
  overrides?: Partial<Extract<ResidentFieldConfirmation, { outcome: 'CONFIRMED' }>>
): ResidentFieldConfirmation;
function fieldConfirmation(
  outcome: 'UNABLE_TO_CONFIRM',
  overrides?: Partial<Extract<ResidentFieldConfirmation, { outcome: 'UNABLE_TO_CONFIRM' }>>
): ResidentFieldConfirmation;
function fieldConfirmation(
  outcome: ResidentFieldConfirmation['outcome'],
  overrides: Partial<ResidentFieldConfirmation> = {}
): ResidentFieldConfirmation {
  const base = {
    id: `confirmation-${outcome}`,
    reportId: 'report-1',
    status: 'PENDING',
    createdAt: '2026-08-24T09:10:00.000Z',
    updatedAt: '2026-08-24T09:10:00.000Z'
  } as const;

  if (outcome === 'CONFIRMED') {
    return {
      ...base,
      outcome,
      verificationChecklist: {
        locationMatches: true,
        photoMatches: true,
        situationStillExists: true,
        severityAppearsCorrect: true
      },
      ...overrides
    } as ResidentFieldConfirmation;
  }

  return {
    ...base,
    outcome,
    reason: 'Unable to access location',
    ...overrides
  } as ResidentFieldConfirmation;
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

