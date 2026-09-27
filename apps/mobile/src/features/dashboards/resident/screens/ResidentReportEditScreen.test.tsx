import * as React from 'react';
import type { SafeReport } from '@safealert/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  Object.defineProperty(globalThis, '__DEV__', { value: false, configurable: true });
});


const lifecycle = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effectsRun: new Set<number>(),
  params: { reportId: 'report-1' } as Record<string, string | string[] | undefined>
}));
const navigation = vi.hoisted(() => ({ back: vi.fn(), replace: vi.fn() }));
const imagePicker = vi.hoisted(() => ({
  requestMediaLibraryPermissionsAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
  PermissionStatus: { GRANTED: 'granted' }
}));

let ResidentReportEditScreen: typeof import('./ResidentReportEditScreen').ResidentReportEditScreen;
let uploadReportEvidence: typeof import('../api/mediaApi').uploadReportEvidence;
let getMyReportById: typeof import('../api/reportApi').getMyReportById;
let updateMyPendingReport: typeof import('../api/reportApi').updateMyPendingReport;

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof React>(),
  useCallback: (callback: unknown) => {
    lifecycle.cursor++;
    return callback;
  },
  useEffect: (callback: () => void) => {
    const index = lifecycle.cursor++;
    if (!lifecycle.effectsRun.has(index)) {
      lifecycle.effectsRun.add(index);
      callback();
    }
  },
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
  useLocalSearchParams: () => lifecycle.params,
  useRouter: () => navigation
}));

vi.mock('expo', () => ({}));
vi.mock('expo-modules-core', () => ({}));
vi.mock('expo-image-picker', () => imagePicker);
vi.mock('expo-image-picker/build/ImagePicker', () => imagePicker);
vi.mock('expo-image-picker/src/ImagePicker', () => imagePicker);

vi.mock('react-native', () => ({
  ActivityIndicator: 'span',
  Image: 'img',
  Pressable: 'button',
  ScrollView: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  StyleSheet: { create: (styles: unknown) => styles },
  Text: 'span',
  TextInput: 'input',
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
vi.mock('../../shared/currentLocation', () => ({ formatCoordinate: (value: number) => value.toFixed(6) }));
vi.mock('../../shared/maps/LocationPreview', () => ({
  LocationPreview: ({ coordinates, title }: { coordinates: { latitude: number; longitude: number }; title: string }) => (
    <span>{title} {coordinates.latitude} {coordinates.longitude}</span>
  )
}));
vi.mock('../../shared/maps/LocationPicker', () => ({
  LocationPicker: ({ onCancel, onConfirm, value }: {
    onCancel: () => void;
    onConfirm: (coordinates: { latitude: number; longitude: number }) => void;
    value: { latitude: number; longitude: number };
  }) => (
    <div>
      <span>Location picker {value.latitude} {value.longitude}</span>
      {mockButton('Confirm mock location', () => onConfirm({ latitude: 7.1, longitude: 80.2 }))}
      {mockButton('Cancel mock location', onCancel)}
    </div>
  )
}));
vi.mock('../../shared/voice/VoiceNoteRecorder', () => ({
  VoiceNoteRecorder: ({ existingVoice, onChange, onRemoveExisting }: {
    existingVoice: { uri: string | null; durationSeconds: number } | null;
    onChange: (voice: { localUri: string; fileName: string; mimeType: 'audio/mp4'; durationSeconds: number; uploadedMediaReference: string | null } | null) => void;
    onRemoveExisting: () => void;
  }) => (
    <div>
      {existingVoice ? <span>Existing voice {existingVoice.durationSeconds}</span> : null}
      {mockButton('Replace voice note', () => onChange({ localUri: 'file:///new-voice.m4a', fileName: 'new-voice.m4a', mimeType: 'audio/mp4', durationSeconds: 13, uploadedMediaReference: null }))}
      {mockButton('Remove voice note', onRemoveExisting)}
    </div>
  )
}));
vi.mock('../api/mediaApi', () => ({ uploadReportEvidence: vi.fn() }));
vi.mock('../api/reportApi', () => ({ getMyReportById: vi.fn(), updateMyPendingReport: vi.fn() }));

const pendingReport: SafeReport = {
  id: 'report-1',
  residentId: 'resident-1',
  communityReportClusterId: 'cluster-1',
  hazardType: 'FLOOD',
  description: 'Water is rising near the lower bridge.',
  severity: 'HIGH',
  location: { type: 'Point', coordinates: [79.8612, 6.9271] },
  mediaReference: '/api/v1/media/report-evidence/current-photo.jpg',
  voiceEvidence: {
    mediaReference: '/api/v1/media/report-evidence/current-voice.m4a',
    contentType: 'audio/mp4',
    durationSeconds: 11
  },
  status: 'PENDING',
  createdAt: '2026-08-24T09:00:00.000Z',
  updatedAt: '2026-08-24T09:00:00.000Z'
};

beforeEach(async () => {
  ({ ResidentReportEditScreen } = await import('./ResidentReportEditScreen'));
  ({ uploadReportEvidence } = await import('../api/mediaApi'));
  ({ getMyReportById, updateMyPendingReport } = await import('../api/reportApi'));

  vi.mocked(getMyReportById).mockResolvedValue({ report: pendingReport });
  vi.mocked(updateMyPendingReport).mockResolvedValue({ report: pendingReport });
  vi.mocked(uploadReportEvidence).mockResolvedValue(uploadResponse('/api/v1/media/report-evidence/uploaded.bin'));
  imagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'granted' });
  imagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///new-photo.jpg', fileName: 'new-photo.jpg', mimeType: 'image/jpeg' }] });
});

afterEach(() => {
  lifecycle.slots = [];
  lifecycle.cursor = 0;
  lifecycle.effectsRun = new Set<number>();
  lifecycle.params = { reportId: 'report-1' };
  vi.clearAllMocks();
});

describe('ResidentReportEditScreen', () => {
  it('prefills the pending report and saves unchanged photo and voice without re-uploading', async () => {
    render();
    await waitForText('Edit Report');

    expect(screenText(render())).toContain('Existing voice');
    expect(screenText(render())).toContain('11');
    expect(descriptionInput(render())?.value).toBe('Water is rising near the lower bridge.');

    pressButton('Save Changes');

    await vi.waitFor(() => expect(updateMyPendingReport).toHaveBeenCalledTimes(1));
    expect(uploadReportEvidence).not.toHaveBeenCalled();
    expect(updateMyPendingReport).toHaveBeenCalledWith(
      'report-1',
      expect.objectContaining({
        hazardType: 'FLOOD',
        severity: 'HIGH',
        description: 'Water is rising near the lower bridge.',
        mediaReference: '/api/v1/media/report-evidence/current-photo.jpg',
        voiceEvidence: pendingReport.voiceEvidence,
        location: { type: 'Point', coordinates: [79.8612, 6.9271] }
      }),
      'resident-token'
    );
  });

  it('saves adjusted picker coordinates in backend GeoJSON coordinate order', async () => {
    render();
    await waitForText('Edit Report');

    pressButton('Adjust Location');
    pressButton('Confirm mock location');
    pressButton('Save Changes');

    await vi.waitFor(() => expect(updateMyPendingReport).toHaveBeenCalledTimes(1));
    expect(updateMyPendingReport).toHaveBeenCalledWith(
      'report-1',
      expect.objectContaining({ location: { type: 'Point', coordinates: [80.2, 7.1] } }),
      'resident-token'
    );
  });

  it('retains an uploaded replacement photo reference when retrying after PATCH fails', async () => {
    vi.mocked(uploadReportEvidence).mockResolvedValue(uploadResponse('/api/v1/media/report-evidence/new-photo.jpg'));
    vi.mocked(updateMyPendingReport)
      .mockRejectedValueOnce(new Error('temporary network failure'))
      .mockResolvedValueOnce({ report: { ...pendingReport, mediaReference: '/api/v1/media/report-evidence/new-photo.jpg' } });

    render();
    await waitForText('Edit Report');

    pressButton('Replace Photo');
    await vi.waitFor(() => expect(imagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1));
    pressButton('Save Changes');

    await waitForText('Your changes could not be saved.');
    expect(screenText(render())).toContain('Try Again');

    pressButton('Try Again');
    await vi.waitFor(() => expect(updateMyPendingReport).toHaveBeenCalledTimes(2));

    expect(uploadReportEvidence).toHaveBeenCalledTimes(1);
    expect(updateMyPendingReport).toHaveBeenNthCalledWith(
      2,
      'report-1',
      expect.objectContaining({ mediaReference: '/api/v1/media/report-evidence/new-photo.jpg' }),
      'resident-token'
    );
  });

  it('supports replacing voice evidence without uploading it again on retry', async () => {
    vi.mocked(uploadReportEvidence).mockResolvedValue(uploadResponse('/api/v1/media/report-evidence/new-voice.m4a'));
    vi.mocked(updateMyPendingReport)
      .mockRejectedValueOnce(new Error('temporary network failure'))
      .mockResolvedValueOnce({ report: { ...pendingReport, voiceEvidence: { mediaReference: '/api/v1/media/report-evidence/new-voice.m4a', contentType: 'audio/mp4', durationSeconds: 13 } } });

    render();
    await waitForText('Edit Report');

    pressButton('Replace voice note');
    pressButton('Save Changes');

    await waitForText('Your changes could not be saved.');
    pressButton('Try Again');
    await vi.waitFor(() => expect(updateMyPendingReport).toHaveBeenCalledTimes(2));

    expect(uploadReportEvidence).toHaveBeenCalledTimes(1);
    expect(updateMyPendingReport).toHaveBeenNthCalledWith(
      2,
      'report-1',
      expect.objectContaining({
        voiceEvidence: {
          mediaReference: '/api/v1/media/report-evidence/new-voice.m4a',
          contentType: 'audio/mp4',
          durationSeconds: 13
        }
      }),
      'resident-token'
    );
  });

  it('can remove existing voice evidence while keeping the rest of the edit payload intact', async () => {
    render();
    await waitForText('Edit Report');

    pressButton('Remove voice note');
    pressButton('Save Changes');

    await vi.waitFor(() => expect(updateMyPendingReport).toHaveBeenCalledTimes(1));
    expect(updateMyPendingReport).toHaveBeenCalledWith(
      'report-1',
      expect.objectContaining({ voiceEvidence: null }),
      'resident-token'
    );
  });

  it('blocks editing when the loaded report is no longer pending', async () => {
    vi.mocked(getMyReportById).mockResolvedValue({ report: { ...pendingReport, status: 'VERIFIED' } });

    render();
    await waitForText('This report can no longer be edited because its status has changed.');

    expect(screenText(render())).toContain('Verified Report');
    expect(screenText(render())).not.toContain('Save Changes');
  });

  it('refreshes and shows a clear message when save loses the pending race', async () => {
    const { ApiClientError } = await import('@/services/api/client');
    vi.mocked(getMyReportById)
      .mockResolvedValueOnce({ report: pendingReport })
      .mockResolvedValueOnce({ report: { ...pendingReport, status: 'VERIFIED' } });
    vi.mocked(updateMyPendingReport).mockRejectedValueOnce(
      new ApiClientError(409, 'INVALID_REPORT_STATE', 'Only pending reports can be changed.')
    );

    render();
    await waitForText('Edit Report');
    pressButton('Save Changes');

    await waitForText('This report can no longer be edited because its status has changed.');
    expect(screenText(render())).toContain('Verified Report');
  });
});

function mockButton(label: string, onPress: () => void) {
  return React.createElement('mock-button' as keyof React.JSX.IntrinsicElements, { accessibilityRole: 'button', onPress }, label);
}

function uploadResponse(mediaReference: string) {
  return {
    mediaReference,
    contentType: mediaReference.endsWith('.m4a') ? 'audio/mp4' : 'image/jpeg',
    size: 1234
  };
}
function render() {
  lifecycle.cursor = 0;
  return ResidentReportEditScreen();
}

async function waitForText(text: string) {
  await vi.waitFor(() => expect(screenText(render())).toContain(text));
}

type ButtonProps = {
  children?: React.ReactNode;
  accessibilityRole?: string;
  onPress: () => void;
};

type InputProps = {
  accessibilityLabel?: string;
  value?: string;
  children?: React.ReactNode;
};

function pressButton(label: string) {
  const button = screenButtons(render()).find((candidate) => screenText(candidate.children).trim() === label);
  expect(button, `button ${label}`).toBeDefined();
  button?.onPress();
}

function descriptionInput(node: React.ReactNode) {
  return screenInputs(node).find((input) => input.accessibilityLabel === 'Report description');
}

function screenButtons(node: React.ReactNode): ButtonProps[] {
  if (Array.isArray(node)) return node.flatMap(screenButtons);
  if (!React.isValidElement<ButtonProps>(node)) return [];
  if (typeof node.type === 'function') {
    return screenButtons((node.type as (props: unknown) => React.ReactNode)(node.props));
  }
  return node.props.accessibilityRole === 'button' ? [node.props] : screenButtons(node.props.children);
}

function screenInputs(node: React.ReactNode): InputProps[] {
  if (Array.isArray(node)) return node.flatMap(screenInputs);
  if (!React.isValidElement<InputProps>(node)) return [];
  if (typeof node.type === 'function') {
    return screenInputs((node.type as (props: unknown) => React.ReactNode)(node.props));
  }
  return node.type === 'input' ? [node.props] : screenInputs(node.props.children);
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