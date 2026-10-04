export const SRI_LANKA_COUNTRY_CODE = '94';

// Notify.lk requires the recipient in the 9471XXXXXXX format.
const sriLankanMobilePattern = /^7\d{8}$/;

/**
 * Normalizes a stored Sri Lankan mobile number to the Notify.lk recipient format.
 * Accepts +9471XXXXXXX, 009471XXXXXXX, 9471XXXXXXX, 071XXXXXXX, and 71XXXXXXX.
 * Numbers that are already normalized are not prefixed with a second country code.
 * Returns null for missing, malformed, or non-mobile numbers.
 */
export function toNotifyLkRecipient(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;

  let digits = value.replace(/\D/g, '');

  if (digits.length === 0) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);

  let localNumber: string;

  if (digits.length === 11 && digits.startsWith(SRI_LANKA_COUNTRY_CODE)) {
    localNumber = digits.slice(SRI_LANKA_COUNTRY_CODE.length);
  } else if (digits.length === 10 && digits.startsWith('0')) {
    localNumber = digits.slice(1);
  } else if (digits.length === 9) {
    localNumber = digits;
  } else {
    return null;
  }

  return sriLankanMobilePattern.test(localNumber) ? `${SRI_LANKA_COUNTRY_CODE}${localNumber}` : null;
}

export function hasSendablePhoneNumber(value: string | null | undefined) {
  return toNotifyLkRecipient(value) !== null;
}

// Delivery records and logs must never contain a full resident phone number.
export function maskPhoneNumber(value: string | null | undefined): string {
  if (typeof value !== 'string') return 'unknown';

  const digits = value.replace(/\D/g, '');

  return digits.length <= 3 ? '***' : `***${digits.slice(-3)}`;
}