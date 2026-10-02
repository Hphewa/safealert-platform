export type MultiMarkerMessage = { type: 'MARKER_SELECTED'; id: string } | { type: 'MAP_READY' | 'MAP_ERROR' | 'TILE_ERROR' };
export function parseMultiMarkerMessage(raw: string): MultiMarkerMessage | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const item = value as Record<string, unknown>;
    if (item.type === 'MARKER_SELECTED' && Object.keys(item).length === 2 && typeof item.id === 'string' && item.id.length > 0) return { type: item.type, id: item.id };
    if (Object.keys(item).length === 1 && (item.type === 'MAP_READY' || item.type === 'MAP_ERROR' || item.type === 'TILE_ERROR')) return { type: item.type };
    return null;
  } catch { return null; }
}
