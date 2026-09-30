import { beforeEach, expect, it, vi } from 'vitest';
import type { GeoJsonPoint } from '@safealert/contracts';

const platform = vi.hoisted(() => ({ OS: 'ios' }));
const geocoder = vi.hoisted(() => ({ reverse: vi.fn(), permission: vi.fn(), request: vi.fn(), current: vi.fn() }));
vi.mock('react-native', () => ({ Platform: platform }));
vi.mock('expo-location', () => ({
  reverseGeocodeAsync: geocoder.reverse, getForegroundPermissionsAsync: geocoder.permission,
  requestForegroundPermissionsAsync: geocoder.request, getCurrentPositionAsync: geocoder.current
}));

const point: GeoJsonPoint = { type: 'Point', coordinates: [79.94201, 6.83018] };
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  platform.OS = 'ios';
  geocoder.reverse.mockReset().mockResolvedValue([]);
  geocoder.permission.mockResolvedValue({ status: 'granted' });
});

it('uses locality and region returned by the geocoder', async () => {
  const { resolveLocationLabel } = await import('./locationLabel');
  geocoder.reverse.mockResolvedValue([{ city: 'Colombo', region: 'Western Province' }]);
  await expect(resolveLocationLabel(point)).resolves.toBe('Colombo, Western Province');
  expect(geocoder.reverse).toHaveBeenCalledWith({ latitude: 6.83018, longitude: 79.94201 });
});

it.each([
  [{ city: 'Colombo' }, 'Colombo'],
  [{ district: 'Kalutara', region: 'Western Province' }, 'Kalutara, Western Province'],
  [{ subregion: 'Kalutara', region: 'Western Province' }, 'Kalutara, Western Province'],
  [{ region: 'Western Province' }, 'Western Province'],
  [{ city: ' Colombo ', region: 'colombo' }, 'Colombo'],
  [{ city: null, region: ' ' }, '6.83018, 79.94201']
])('formats incomplete geocoder data without blank or undefined labels', async (address, expected) => {
  const { resolveLocationLabel } = await import('./locationLabel');
  geocoder.reverse.mockResolvedValue([address]);
  await expect(resolveLocationLabel(point)).resolves.toBe(expected);
});

it('caches pending and failed requests and falls back to coordinates', async () => {
  const { resolveLocationLabel } = await import('./locationLabel');
  geocoder.reverse.mockRejectedValue(new Error('Offline'));
  const first = resolveLocationLabel(point);
  expect(resolveLocationLabel({ ...point, coordinates: [...point.coordinates] })).toBe(first);
  await expect(first).resolves.toBe('6.83018, 79.94201');
  await resolveLocationLabel(point);
  expect(geocoder.reverse).toHaveBeenCalledOnce();
});

it('limits simultaneous geocoder calls for a queue of distinct locations', async () => {
  const { resolveLocationLabel } = await import('./locationLabel');
  let finish!: (addresses: object[]) => void;
  geocoder.reverse.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const first = resolveLocationLabel(point);
  const second = resolveLocationLabel({ ...point, coordinates: [80, 7] });
  await vi.waitFor(() => expect(geocoder.reverse).toHaveBeenCalledOnce());
  finish([{ city: 'Colombo' }]);
  await Promise.all([first, second]);
  expect(geocoder.reverse).toHaveBeenCalledTimes(2);
});

it('uses coordinate fallback on Android without permission and never asks for current location', async () => {
  platform.OS = 'android';
  geocoder.permission.mockResolvedValue({ status: 'denied' });
  const { resolveLocationLabel } = await import('./locationLabel');
  await expect(resolveLocationLabel(point)).resolves.toBe('6.83018, 79.94201');
  expect(geocoder.reverse).not.toHaveBeenCalled();
  expect(geocoder.request).not.toHaveBeenCalled();
  expect(geocoder.current).not.toHaveBeenCalled();
});

it('avoids unsupported geocoding on web', async () => {
  platform.OS = 'web';
  const { resolveLocationLabel } = await import('./locationLabel');
  await expect(resolveLocationLabel(point)).resolves.toBe('6.83018, 79.94201');
  expect(geocoder.reverse).not.toHaveBeenCalled();
});
