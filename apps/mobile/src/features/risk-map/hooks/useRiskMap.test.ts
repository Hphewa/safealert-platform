import { beforeEach, expect, it, vi } from 'vitest';
import type { RiskMapResponse } from '@safealert/contracts';
const state = vi.hoisted(() => ({
  auth: { accessToken: 'token-a' as string | null, user: { id: 'user-a', role: 'RESIDENT' } },
  memo: null as { deps: unknown[]; value: unknown } | null,
  focus: null as (() => () => void) | null, appChange: null as ((value: string) => void) | null,
  get: vi.fn(), remove: vi.fn()
}));
vi.mock('react', () => ({
  useMemo: (factory: () => unknown, deps: unknown[]) => {
    if (!state.memo || deps.some((value, index) => value !== state.memo!.deps[index])) state.memo = { value: factory(), deps };
    return state.memo.value;
  }, useCallback: (callback: unknown) => callback,
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot()
}));
vi.mock('expo-router', () => ({ useFocusEffect: (callback: () => () => void) => { state.focus = callback; } }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: (_event: string, callback: (value: string) => void) => { state.appChange = callback; return { remove: state.remove }; } } }));
vi.mock('../../auth/hooks/useAuth', () => ({ useAuth: () => state.auth }));
vi.mock('../api/riskMapApi', () => ({ getRiskMap: state.get }));
import { useRiskMap } from './useRiskMap';
const response: RiskMapResponse = { role: 'RESIDENT', generatedAt: '2026-10-02T12:00:00Z', incidents: [] };
beforeEach(() => { state.memo = null; state.focus = null; state.appChange = null; state.auth = { accessToken: 'token-a', user: { id: 'user-a', role: 'RESIDENT' } }; state.get.mockReset().mockResolvedValue(response); state.remove.mockReset(); });
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

it('loads on focus, clears in background, reloads on resume, and cleans up on blur', async () => {
  useRiskMap(); const blur = state.focus!(); await settle();
  expect(state.get).toHaveBeenCalledWith('token-a', 'RESIDENT'); expect(useRiskMap().data).toEqual(response);
  state.appChange!('background'); expect(useRiskMap().data).toBeNull();
  state.appChange!('active'); await settle(); expect(state.get).toHaveBeenCalledTimes(2);
  blur(); expect(state.remove).toHaveBeenCalledOnce(); expect(useRiskMap().data).toBeNull();
});
it('never shows data from the old token/user even before effect cleanup', async () => {
  let resolve!: (value: RiskMapResponse) => void;
  state.get.mockReturnValueOnce(new Promise<RiskMapResponse>((finish) => { resolve = finish; }));
  useRiskMap(); const oldBlur = state.focus!();
  state.auth = { accessToken: 'token-b', user: { id: 'user-b', role: 'RESIDENT' } };
  expect(useRiskMap().data).toBeNull(); oldBlur(); state.focus!();
  await settle(); resolve({ ...response, generatedAt: '2020-01-01T00:00:00Z' }); await settle();
  expect(useRiskMap().data).toEqual(response);
  state.auth.accessToken = null; expect(useRiskMap().data).toBeNull(); state.focus!(); await settle();
  expect(useRiskMap().error).toBeTruthy(); expect(state.get).toHaveBeenCalledTimes(2);
});
