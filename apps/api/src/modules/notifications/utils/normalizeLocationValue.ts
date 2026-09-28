// Location values are matched exactly after normalization, so stored profile values and
// warning targets always go through the same normalizer. Unicode letters and numbers are
// kept so Sinhala/Tamil area names still match.
export { normalizeNotificationLocation as normalizeLocationValue } from '@safealert/contracts';
import { normalizeNotificationLocation as normalizeLocationValue } from '@safealert/contracts';

export function locationValuesMatch(left: string | null | undefined, right: string | null | undefined) {
  const normalizedLeft = normalizeLocationValue(left);
  const normalizedRight = normalizeLocationValue(right);

  return normalizedLeft !== null && normalizedLeft === normalizedRight;
}
