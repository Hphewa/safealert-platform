import { beforeEach, expect, it, vi } from 'vitest';
const hooks = vi.hoisted(() => ({ values: [] as unknown[], index: 0, focus: null as (() => () => void) | null }));
vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (index >= hooks.values.length) hooks.values[index] = initial;
    return [hooks.values[index], (next: unknown) => { hooks.values[index] = next; }];
  },
  useRef: (initial: unknown) => {
    const index = hooks.index++;
    if (index >= hooks.values.length) hooks.values[index] = { current: initial };
    return hooks.values[index];
  },
  useCallback: (callback: unknown) => callback
}));
vi.mock('expo-router', () => ({ useFocusEffect: (callback: () => () => void) => { hooks.focus = callback; } }));
import { useAssessmentResource } from './useAssessmentResource';
beforeEach(() => { hooks.values = []; hooks.index = 0; hooks.focus = null; });
function render<T>(loader: () => Promise<T>) { hooks.index = 0; return useAssessmentResource(loader); }

it('returns current reload data for a guarded navigation action', async () => {
  const load = vi.fn().mockResolvedValue('current context');
  await expect(render(load).reload()).resolves.toBe('current context');
  expect(render(load).data).toBe('current context');
});
it('does not return or store stale results after blur', async () => {
  let finish!: (value: string) => void;
  const load = () => new Promise<string>((resolve) => { finish = resolve; });
  const resource = render(load);
  const blur = hooks.focus!();
  const pending = resource.reload();
  blur();
  finish('stale context');
  await expect(pending).resolves.toBeUndefined();
  expect(render(load).data).toBeNull();
});
it('retains visible context during revalidation and returns no context on failure', async () => {
  const load = vi.fn().mockResolvedValue('visible context');
  await render(load).reload();
  load.mockRejectedValue(new Error('Offline'));
  const pending = render(load).reload({ preserveData: true });
  expect(render(load).data).toBe('visible context');
  await expect(pending).resolves.toBeUndefined();
  expect(render(load).error).toBeTruthy();
});
