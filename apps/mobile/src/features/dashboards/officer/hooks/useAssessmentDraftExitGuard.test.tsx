import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  listener: null as ((event: { preventDefault: () => void; data: { action: unknown } }) => void) | null,
  state: { index: 1, routes: [{ name: 'wizard/[step]' }, { name: 'wizard/[step]' }] },
  alertButtons: [] as Array<{ text: string; onPress?: () => void }>,
  alert: vi.fn(), preventDefault: vi.fn(), dispatch: vi.fn(), discard: vi.fn()
}));
vi.mock('react', () => ({
  useCallback: <T extends (...args: never[]) => unknown>(callback: T) => callback,
  useEffect: (effect: () => void) => { effect(); },
  useRef: (current: boolean) => ({ current })
}));
vi.mock('react-native', () => ({ Alert: { alert: (...args: unknown[]) => {
  state.alert(...args); state.alertButtons = args[2] as typeof state.alertButtons;
} } }));
vi.mock('expo-router', () => ({ useNavigation: () => ({
  addListener: (_name: string, listener: typeof state.listener) => { state.listener = listener; return vi.fn(); },
  getState: () => state.state, dispatch: state.dispatch
}) }));
import { useAssessmentDraftExitGuard } from './useAssessmentDraftExitGuard';

beforeEach(() => {
  state.listener = null; state.state = { index: 1, routes: [{ name: 'wizard/[step]' }, { name: 'wizard/[step]' }] };
  state.alertButtons = []; state.alert.mockReset(); state.preventDefault.mockReset(); state.dispatch.mockReset(); state.discard.mockReset();
  state.discard.mockResolvedValue(undefined);
});

it('lets step-to-step back navigation proceed without a discard prompt', () => {
  useAssessmentDraftExitGuard(true, state.discard);
  state.listener?.({ preventDefault: state.preventDefault, data: { action: 'POP' } });
  expect(state.preventDefault).not.toHaveBeenCalled();
  expect(state.alert).not.toHaveBeenCalled();
});

it('prompts on a dirty subtree exit and discards only after explicit confirmation', async () => {
  state.state = { index: 1, routes: [{ name: 'incident/[incidentId]' }, { name: 'wizard/[step]' }] };
  useAssessmentDraftExitGuard(true, state.discard);
  const action = { type: 'GO_BACK' };
  state.listener?.({ preventDefault: state.preventDefault, data: { action } });
  expect(state.preventDefault).toHaveBeenCalledOnce();
  expect(state.alertButtons.map(({ text }) => text)).toEqual(['Keep Editing', 'Discard']);
  state.alertButtons[0]?.onPress?.();
  expect(state.discard).not.toHaveBeenCalled();
  state.listener?.({ preventDefault: state.preventDefault, data: { action } });
  state.alertButtons[1]?.onPress?.();
  await Promise.resolve();
  expect(state.discard).toHaveBeenCalledOnce();
  expect(state.dispatch).toHaveBeenCalledWith(action);
});
it('does not prompt when the draft is clean', () => {
  state.state = { index: 1, routes: [{ name: 'monitoring/[incidentId]' }, { name: 'wizard/[step]' }] };
  useAssessmentDraftExitGuard(false, state.discard);
  state.listener?.({ preventDefault: state.preventDefault, data: { action: 'GO_BACK' } });
  expect(state.preventDefault).not.toHaveBeenCalled();
  expect(state.alert).not.toHaveBeenCalled();
});

it('allows the save-success route replacement after the draft is cleared', () => {
  state.state = { index: 1, routes: [{ name: 'monitoring/[incidentId]' }, { name: 'wizard/[step]' }] };
  const allowNextRemoval = useAssessmentDraftExitGuard(true, state.discard);
  allowNextRemoval();
  state.listener?.({ preventDefault: state.preventDefault, data: { action: 'REPLACE' } });
  expect(state.preventDefault).not.toHaveBeenCalled();
  expect(state.alert).not.toHaveBeenCalled();
});
