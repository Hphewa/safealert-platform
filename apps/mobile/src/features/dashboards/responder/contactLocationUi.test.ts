import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Linking, Platform } from 'react-native';

import {
  extractEmergencyCoordinates, formatCoordinate, formatTelUrl,
  initiateResidentCall, initiateViewLocationRoute, isValidPhoneNumber
} from './contactLocationUi';

vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  Linking: { canOpenURL: vi.fn(), openURL: vi.fn() }
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(Linking.openURL).mockResolvedValue(undefined);
  Platform.OS = 'android';
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('contact/location validation', () => {
  it('maps GeoJSON longitude/latitude explicitly', () => {
    expect(extractEmergencyCoordinates({ type: 'Point', coordinates: [79.8612, 6.9271] }))
      .toEqual({ latitude: 6.9271, longitude: 79.8612, isValid: true });
  });

  it.each([[180, 90], [-180, -90], [0, 0]])('accepts boundary and zero coordinates %s, %s', (longitude, latitude) => {
    expect(extractEmergencyCoordinates({ type: 'Point', coordinates: [longitude, latitude] }).isValid).toBe(true);
  });

  it.each([
    undefined, null, {}, 'location', { type: 'Point' },
    { type: 'Point', coordinates: null }, { type: 'Point', coordinates: [] },
    { type: 'Point', coordinates: [79] }, { type: 'Point', coordinates: [undefined, 6] },
    { type: 'Point', coordinates: [79, undefined] }, { type: 'Point', coordinates: [79, null] },
    { type: 'Point', coordinates: ['79', 6] }, { type: 'Point', coordinates: [79, '6'] },
    { type: 'Point', coordinates: [NaN, 6] }, { type: 'Point', coordinates: [79, Infinity] },
    { type: 'Point', coordinates: [-Infinity, 6] }, { type: 'Point', coordinates: [181, 6] },
    { type: 'Point', coordinates: [-181, 6] }, { type: 'Point', coordinates: [79, 91] },
    { type: 'Point', coordinates: [79, -91] }, { type: 'LineString', coordinates: [79, 6] }
  ])('rejects malformed location %j', location => {
    expect(extractEmergencyCoordinates(location)).toEqual({ latitude: null, longitude: null, isValid: false });
  });

  it.each([null, undefined, NaN, Infinity, '6.9', {}])('formats unavailable coordinate %j safely', value => {
    expect(formatCoordinate(value)).toBe('Not provided');
  });
  it('formats valid numbers without changing their sign or precision', () => {
    expect(formatCoordinate(-6.9271)).toBe('-6.9271');
    expect(formatCoordinate(0)).toBe('0');
  });

  it.each([
    ['+94 77 555 1234', 'tel:+94775551234'],
    ['+94-77-555-1234', 'tel:+94775551234'],
    [' (077) 123-4567 ', 'tel:0771234567'],
    ['0771234567', 'tel:0771234567']
  ])('validates and formats phone %s', (phone, expected) => {
    expect(isValidPhoneNumber(phone)).toBe(expected !== null);
    expect(formatTelUrl(phone)).toBe(expected);
  });

  it.each([undefined, null, '', '  ', 'undefined', 'null', 'NaN', {}, 771234567,
    '--', '123', 'call0771234567', '0771234567;ext=123', '+94771234567?x=1',
    '*1234567#', '++94771234567', '0'.repeat(33)])('never launches an invalid phone %j', async phone => {
    expect(isValidPhoneNumber(phone)).toBe(false);
    expect(formatTelUrl(phone)).toBeNull();
    expect(await initiateResidentCall(phone)).toBe(false);
    expect(Linking.openURL).not.toHaveBeenCalled();
  });
});

describe('native external actions', () => {
  it.each(['android', 'ios'] as const)('opens the selected phone and destination on %s', async platform => {
    Platform.OS = platform;
    expect(await initiateResidentCall('+94 (77) 555-1234')).toBe(true);
    expect(Linking.openURL).toHaveBeenNthCalledWith(1, 'tel:+94775551234');
    expect(await initiateViewLocationRoute(6.9271, 79.8612)).toBe(true);
    expect(Linking.openURL).toHaveBeenNthCalledWith(2,
      'https://www.google.com/maps/dir/?api=1&destination=6.9271%2C79.8612');
  });

  it('does not mistake native URL query restrictions for an unavailable handler', async () => {
    vi.mocked(Linking.canOpenURL).mockResolvedValue(false);
    expect(await initiateViewLocationRoute(0, -180)).toBe(true);
    expect(await initiateResidentCall('0771234567')).toBe(true);
    expect(Linking.canOpenURL).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, 79], [6, undefined], [null, 79], [6, null], ['6', 79], [6, '79'],
    [NaN, 79], [6, NaN], [Infinity, 79], [6, -Infinity],
    [90.1, 79], [-90.1, 79], [6, 180.1], [6, -180.1]
  ])('does not launch invalid destination %j, %j', async (latitude, longitude) => {
    expect(await initiateViewLocationRoute(latitude, longitude)).toBe(false);
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it.each(['No application found', 'Unexpected platform error'])('reports a failed dialer/map handoff: %s', async message => {
    vi.mocked(Linking.openURL).mockRejectedValue(new Error(message));
    await expect(initiateResidentCall('0771234567')).resolves.toBe(false);
    await expect(initiateViewLocationRoute(6, 79)).resolves.toBe(false);
  });

  it('handles synchronous platform exceptions', async () => {
    vi.mocked(Linking.openURL).mockImplementation(() => { throw new Error('native unavailable'); });
    await expect(initiateViewLocationRoute(6, 79)).resolves.toBe(false);
    await expect(initiateResidentCall('0771234567')).resolves.toBe(false);
  });
});

describe('localhost/browser actions', () => {
  beforeEach(() => { Platform.OS = 'web'; });

  it('opens the destination synchronously in a separate tab and removes opener access', async () => {
    const tab = { opener: 'original-window' };
    const open = vi.fn().mockReturnValue(tab);
    vi.stubGlobal('window', { open });
    const launch = initiateViewLocationRoute(-6.9, 79.8);
    expect(open).toHaveBeenCalledExactlyOnceWith(
      'https://www.google.com/maps/dir/?api=1&destination=-6.9%2C79.8', '_blank');
    expect(tab.opener).toBeNull();
    expect(await launch).toBe(true);
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('reports blocked popups', async () => {
    vi.stubGlobal('window', { open: vi.fn().mockReturnValue(null) });
    expect(await initiateViewLocationRoute(6, 79)).toBe(false);
  });

  it('reports browser exceptions', async () => {
    vi.stubGlobal('window', { open: vi.fn(() => { throw new Error('blocked'); }) });
    expect(await initiateViewLocationRoute(6, 79)).toBe(false);
  });

  it('does not launch from a non-browser environment', async () => {
    vi.stubGlobal('window', undefined);
    expect(await initiateViewLocationRoute(6, 79)).toBe(false);
  });

  it('delegates tel to the existing browser Linking handler', async () => {
    expect(await initiateResidentCall('0771234567')).toBe(true);
    expect(Linking.openURL).toHaveBeenCalledExactlyOnceWith('tel:0771234567');
    vi.mocked(Linking.openURL).mockRejectedValue(new Error('no phone handler'));
    expect(await initiateResidentCall('0771234567')).toBe(false);
  });
});
