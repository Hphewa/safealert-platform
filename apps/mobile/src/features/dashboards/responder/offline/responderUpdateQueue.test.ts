import { describe, expect, it, vi } from 'vitest';
import type { SafeResponseRequest } from '@safealert/contracts';
import { createResponderUpdateQueue, projectQueuedUpdates, type ResponderUpdate } from './responderUpdateQueue';

const request: SafeResponseRequest = {
  id: '507f1f77bcf86cd799439011', assignedResponderId: 'responder-1', status: 'ASSIGNED',
  residentId: 'resident-1', assistanceType: 'MEDICAL_ASSISTANCE', location: { type: 'Point', coordinates: [79.8, 6.9] },
  affectedPeople: 1, injuredPeople: 0, medicalNeeds: false, roadAccessibility: 'ACCESSIBLE',
  vulnerablePeople: { children: 0, elderlyPeople: 0, personsWithDisabilities: 0, pregnantPersons: 0 },
  contact: { name: 'Resident', phoneNumber: '+94771234567' }, description: 'Emergency assistance needed.',
  createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z'
};
const dispatch: ResponderUpdate = { type: 'progress', payload: { status: 'DISPATCHED' } };
const notes: ResponderUpdate = { type: 'field-update', payload: { fieldNotes: 'Road access is blocked.' } };
function storage() {
  const values = new Map<string, string>();
  return { values, getItem: vi.fn(async (key: string) => values.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { values.set(key, value); }) };
}

describe('persistent responder queue foundation', () => {
  it('persists FIFO across concurrent writes and a new queue instance without storing resident data', async () => {
    const disk = storage();
    const queue = createResponderUpdateQueue(disk);
    await Promise.all([queue.enqueue('responder-1', request, dispatch), queue.enqueue('responder-1', request, notes),
      queue.enqueue('responder-1', request, { type: 'progress', payload: { status: 'ARRIVED' } })]);
    const restored = createResponderUpdateQueue(disk);
    const state = await restored.load('responder-1');
    expect(state.items.map((item) => item.sequence)).toEqual([1, 2, 3]);
    expect(state.items.map((item) => item.expectedStatus)).toEqual(['ASSIGNED', 'DISPATCHED', 'DISPATCHED']);
    expect(new Set(state.items.map((item) => item.localId)).size).toBe(3);
    expect(projectQueuedUpdates(request, state.items).request).toMatchObject({ status: 'ARRIVED', fieldNotes: notes.payload.fieldNotes });
    const serialized = [...disk.values.values()][0];
    expect(serialized).not.toMatch(/accessToken|contact|location|residentId/);
    expect(request.status).toBe('ASSIGNED');
    expect((await restored.load('responder-2')).items).toEqual([]);
  });

  it('does not publish a saved update when storage fails, and supports an explicit retry', async () => {
    const disk = storage();
    disk.setItem.mockRejectedValueOnce(new Error('disk full'));
    const queue = createResponderUpdateQueue(disk);
    await expect(queue.enqueue('responder-1', request, notes)).rejects.toThrow('not saved');
    expect(queue.getSnapshot('responder-1').items).toEqual([]);
    await queue.enqueue('responder-1', request, notes);
    expect(queue.getSnapshot('responder-1').items).toHaveLength(1);
  });

  it('returns a visible read failure and can reload when storage recovers', async () => {
    const disk = storage();
    disk.getItem.mockRejectedValueOnce(new Error('denied'));
    const queue = createResponderUpdateQueue(disk);
    expect(await queue.load('responder-1')).toMatchObject({ status: 'error', items: [] });
    expect(await queue.load('responder-1')).toMatchObject({ status: 'ready', items: [] });
  });

  it.each(['{', 'null', '{}', '{"version":2,"items":[]}', '{"version":1,"items":[null]}'])('preserves corrupted/incompatible data: %s', async (raw) => {
    const disk = storage();
    disk.getItem.mockResolvedValue(raw);
    const queue = createResponderUpdateQueue(disk);
    expect(await queue.load('responder-1')).toMatchObject({ status: 'error', items: [], error: expect.stringContaining('kept') });
    await expect(queue.enqueue('responder-1', request, notes)).rejects.toThrow('could not be read');
    expect(disk.setItem).not.toHaveBeenCalled();
  });

  it.each(['owner', 'order', 'duplicate', 'payload', 'status', 'timestamp', 'unexpectedField'])('rejects corrupted queue %s safely', async (fault) => {
    const disk = storage();
    const queue = createResponderUpdateQueue(disk);
    await queue.enqueue('responder-1', request, dispatch);
    await queue.enqueue('responder-1', request, notes);
    const data = JSON.parse([...disk.values.values()][0]);
    if (fault === 'owner') data.items[0].responderId = 'other';
    if (fault === 'order') data.items.reverse();
    if (fault === 'duplicate') data.items[1].localId = data.items[0].localId;
    if (fault === 'payload') data.items[1].update.payload.fieldNotes = null;
    if (fault === 'status') data.items[1].expectedStatus = 'ASSIGNED';
    if (fault === 'timestamp') data.items[0].createdAt = 'invalid';
    if (fault === 'unexpectedField') data.items[0].update.payload.accessToken = 'must-not-be-stored';
    disk.getItem.mockResolvedValue(JSON.stringify(data));
    expect((await createResponderUpdateQueue(disk).load('responder-1')).status).toBe('error');
  });

  it('rejects lifecycle skips, invalid IDs, other owners, empty notes, and incomplete completion', async () => {
    const queue = createResponderUpdateQueue(storage());
    await expect(queue.enqueue('other', request, dispatch)).rejects.toThrow();
    await expect(queue.enqueue('responder-1', { ...request, id: 'bad' }, dispatch)).rejects.toThrow();
    await expect(queue.enqueue('responder-1', request, { type: 'progress', payload: { status: 'ARRIVED' } })).rejects.toThrow();
    await expect(queue.enqueue('responder-1', request, { type: 'field-update', payload: { fieldNotes: ' ' } })).rejects.toThrow();
    await expect(queue.enqueue('responder-1', { ...request, status: 'IN_PROGRESS' }, { type: 'progress', payload: { status: 'COMPLETED' } })).rejects.toThrow();
    expect(queue.getSnapshot('responder-1').items).toEqual([]);
  });

  it('saves completion details, rejects further updates, and detects assignment/server conflicts', async () => {
    const queue = createResponderUpdateQueue(storage());
    const active = { ...request, status: 'IN_PROGRESS' as const };
    await queue.enqueue('responder-1', active, { type: 'progress', payload: { status: 'COMPLETED', completionDetails: {
      assistanceProvided: ' Transport provided. ', completionSummary: 'Resident is safe.'
    } } });
    const { items } = queue.getSnapshot('responder-1');
    expect(projectQueuedUpdates(active, items).request).toMatchObject({ status: 'COMPLETED', assistanceProvided: 'Transport provided.' });
    await expect(queue.enqueue('responder-1', active, notes)).rejects.toThrow();
    expect(projectQueuedUpdates({ ...active, status: 'CANCELLED' }, items).conflict).toBe(true);
    expect(projectQueuedUpdates({ ...active, assignedResponderId: 'other' }, items).conflict).toBe(true);
  });

  it('removes only the acknowledged head and retains the rest through reload', async () => {
    const disk = storage();
    const queue = createResponderUpdateQueue(disk);
    const first = await queue.enqueue('responder-1', request, dispatch);
    const second = await queue.enqueue('responder-1', request, notes);
    await expect(queue.remove('responder-1', second.localId)).rejects.toThrow('order');
    await queue.remove('responder-1', first.localId);
    expect((await createResponderUpdateQueue(disk).load('responder-1')).items).toEqual([second]);
  });
});
