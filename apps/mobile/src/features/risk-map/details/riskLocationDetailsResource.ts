import type { RiskLocationDetailsResponse } from '@safealert/contracts';

type Snapshot = { data: RiskLocationDetailsResponse | null; loading: boolean; error: string | null };
export function createRiskLocationDetailsResource(load: () => Promise<RiskLocationDetailsResponse>) {
  let snapshot: Snapshot = { data: null, loading: true, error: null };
  let generation = 0;
  let active = false;
  const listeners = new Set<() => void>();
  const publish = (next: Snapshot) => { snapshot = next; listeners.forEach(listener => listener()); };
  async function refresh() {
    if (!active) return;
    const request = ++generation;
    publish({ data: null, loading: true, error: null });
    try {
      const data = await load();
      if (!active || request !== generation) return;
      publish({ data, loading: false, error: null });
    } catch {
      if (!active || request !== generation) return;
      publish({ data: null, loading: false, error: 'Unable to load risk location details. Please retry.' });
    }
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start: () => { active = true; return refresh(); }, refresh,
    suspend: () => { active = false; generation += 1; publish({ data: null, loading: true, error: null }); }
  };
}
