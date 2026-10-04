import { useEffect, useState } from 'react';
import type { GeoJsonPoint } from '@safealert/contracts';
import { cachedLocationLabel, locationLabelKey, resolveLocationLabel } from './locationLabel';

export function useLocationLabel(location: GeoJsonPoint) {
  const [resolved, setResolved] = useState<{ key: string; label: string } | null>(null);
  const [longitude, latitude] = location.coordinates;
  const key = locationLabelKey(location);
  useEffect(() => {
    let active = true;
    const point: GeoJsonPoint = { type: 'Point', coordinates: [longitude, latitude] };
    void resolveLocationLabel(point).then((label) => {
      if (active) setResolved({ key: locationLabelKey(point), label });
    });
    return () => { active = false; };
  }, [longitude, latitude]);
  return resolved?.key === key ? resolved.label : cachedLocationLabel(location);
}
