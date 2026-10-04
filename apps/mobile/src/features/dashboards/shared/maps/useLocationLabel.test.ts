import { beforeEach, expect, it, vi } from 'vitest';
import type { GeoJsonPoint } from '@safealert/contracts';
const state = vi.hoisted(() => ({ value: null as unknown, deps: undefined as readonly unknown[] | undefined,
  cleanup: undefined as (() => void) | undefined, geocode: vi.fn() }));
vi.mock('react', () => ({
  useState: () => [state.value, (value: unknown) => { state.value = value; }],
  useEffect: (effect: () => () => void, deps: readonly unknown[]) => {
    if (!state.deps || deps.some((value, index) => state.deps![index] !== value)) {
      state.cleanup?.(); state.cleanup = effect(); state.deps = deps;
    }
  }
}));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('expo-location', () => ({ reverseGeocodeAsync: state.geocode }));
const point: GeoJsonPoint = { type: 'Point', coordinates: [79.94, 6.83] };
beforeEach(() => {
  state.cleanup?.(); state.value = null; state.deps = undefined; state.cleanup = undefined;
  state.geocode.mockReset(); vi.resetModules();
});
it('renders coordinates immediately, resolves the label, and avoids requests on repeated renders', async () => {
  const { useLocationLabel } = await import('./useLocationLabel');
  let finish!: (value: object[]) => void;
  state.geocode.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  expect(useLocationLabel(point)).toBe('6.83000, 79.94000');
  useLocationLabel({ ...point, coordinates: [...point.coordinates] });
  await vi.waitFor(() => expect(state.geocode).toHaveBeenCalledOnce());
  finish([{ city: 'Colombo', region: 'Western Province' }]);
  await vi.waitFor(() => expect(useLocationLabel(point)).toBe('Colombo, Western Province'));
  useLocationLabel(point); expect(state.geocode).toHaveBeenCalledOnce();
});
it('does not display a previous coordinate label after a late resolution', async () => {
  const { useLocationLabel } = await import('./useLocationLabel');
  let finish!: (value: object[]) => void;
  state.geocode.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; })).mockResolvedValueOnce([{ city: 'Kandy' }]);
  useLocationLabel(point);
  const other: GeoJsonPoint = { type: 'Point', coordinates: [80.63, 7.29] };
  expect(useLocationLabel(other)).toBe('7.29000, 80.63000');
  finish([{ city: 'Colombo' }]);
  await vi.waitFor(() => expect(useLocationLabel(other)).toBe('Kandy'));
});
it('ignores completion after unmount', async () => {
  const { useLocationLabel } = await import('./useLocationLabel');
  let finish!: (value: object[]) => void;
  state.geocode.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  useLocationLabel(point); state.cleanup!();
  finish([{ city: 'Colombo' }]);
  await vi.waitFor(() => expect(state.geocode).toHaveBeenCalledOnce());
  expect(state.value).toBeNull();
});
