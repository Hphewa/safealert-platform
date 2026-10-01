import { expect, it } from 'vitest';
import { formatOperationalTime } from './formatOperationalTime';

const now = new Date('2026-10-02T12:00:00.000Z');

it('formats recent incident activity in short relative units', () => {
  expect(formatOperationalTime('2026-10-02T11:59:40.000Z', now)).toBe('Just now');
  expect(formatOperationalTime('2026-10-02T11:55:00.000Z', now)).toBe('5 minutes ago');
  expect(formatOperationalTime('2026-10-02T10:00:00.000Z', now)).toBe('2 hours ago');
});

it('shows a readable local date and time for activity older than one day', () => {
  expect(formatOperationalTime('2026-10-01T11:00:00.000Z', now)).toBe(
    new Date('2026-10-01T11:00:00.000Z').toLocaleString()
  );
});

it('returns a safe fallback for invalid or missing timestamps', () => {
  expect(formatOperationalTime('not a timestamp', now)).toBe('Time unavailable');
  expect(formatOperationalTime('', now)).toBe('Time unavailable');
});
