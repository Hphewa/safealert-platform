import { afterEach, expect, it, vi } from 'vitest';
import { createResidentReport } from './reportApi';

afterEach(() => vi.unstubAllGlobals());

const input = {
  hazardType: 'FLOOD' as const, severity: 'HIGH' as const, description: 'Water across the road.',
  location: { type: 'Point' as const, coordinates: [79.8612, 6.9271] as [number, number] }
};

it('sends the selected image bytes with the resident report', async () => {
  let submitted: unknown;
  vi.stubGlobal('fetch', async (_url: string, options: RequestInit) => {
    submitted = JSON.parse(options.body as string);
    return new Response(JSON.stringify({ report: { id: 'report-1' } }), { status: 201 });
  });
  await createResidentReport(input, 'resident-token', { base64: 'aW1hZ2U=' });
  expect(submitted).toEqual({ ...input, photo: { base64: 'aW1hZ2U=' } });
});

it('does not submit a report silently without its selected photo when bytes are missing', async () => {
  vi.stubGlobal('fetch', async () => { throw new Error('Should not submit'); });
  await expect(createResidentReport(input, 'resident-token', { base64: null }))
    .rejects.toMatchObject({ code: 'INVALID_PHOTO' });
});

it('rejects an oversized selected image before sending the report', async () => {
  vi.stubGlobal('fetch', async () => { throw new Error('Should not submit'); });
  await expect(createResidentReport(input, 'resident-token', { base64: 'A'.repeat(6990509) }))
    .rejects.toMatchObject({ code: 'PHOTO_TOO_LARGE' });
});
