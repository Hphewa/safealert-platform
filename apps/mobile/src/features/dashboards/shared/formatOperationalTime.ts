export function formatOperationalTime(value: string, now: Date | number = Date.now()): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Time unavailable';

  const nowMilliseconds = typeof now === 'number' ? now : now.getTime();
  const elapsedMinutes = Math.max(0, Math.floor((nowMilliseconds - date.getTime()) / 60_000));
  if (elapsedMinutes < 1) return 'Just now';
  if (elapsedMinutes < 60) return `${elapsedMinutes} ${elapsedMinutes === 1 ? 'minute' : 'minutes'} ago`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours} ${elapsedHours === 1 ? 'hour' : 'hours'} ago`;
  return date.toLocaleString();
}
