import type { RiskMapResponse } from '@safealert/contracts';

type Snapshot = { data: RiskMapResponse | null; loading: boolean; error: string | null; selectedId: string | null };
/** One resource per auth session. Request generations prevent late responses restoring stale actions. */
export function createRiskMapResource(load: () => Promise<RiskMapResponse>) {
  let snapshot: Snapshot = { data: null, loading: true, error: null, selectedId: null };
  let generation = 0;
  let active = false;
  let selection: string | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: Snapshot) => { snapshot = next; listeners.forEach((listener) => listener()); };
  async function refresh() {
    if (!active) return;
    const request = ++generation;
    publish({ data: null, loading: true, error: null, selectedId: null });
    try {
      const data = await load();
      if (!active || generation !== request) return;
      if (!data.incidents.some((item) => item.incidentId === selection)) selection = null;
      publish({ data, loading: false, error: null, selectedId: selection });
    } catch {
      if (!active || generation !== request) return;
      selection = null;
      publish({ data: null, loading: false, error: 'Unable to load risk locations. Sign in again if your session has expired, or retry.', selectedId: null });
    }
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start: () => { active = true; return refresh(); },
    suspend: () => { active = false; generation += 1; selection = null; publish({ data: null, loading: true, error: null, selectedId: null }); },
    refresh,
    select: (id: string | null) => {
      selection = id && snapshot.data?.incidents.some((item) => item.incidentId === id) ? id : null;
      publish({ ...snapshot, selectedId: selection });
    }
  };
}
