import { describe, expect, it } from 'vitest';

import { readDevicePushToken } from './pushNotifications';

describe('Device push token', () => {
  it('reads the FCM device token from an Expo device token response', () => {
    expect(readDevicePushToken({ type: 'android', data: 'fcm-token-from-device' })).toBe('fcm-token-from-device');
    expect(readDevicePushToken({ type: 'ios', data: '  fcm-token-with-space  ' })).toBe('fcm-token-with-space');
  });

  it.each([
    null,
    undefined,
    {},
    { type: 'android' },
    { type: 'android', data: '' },
    { type: 'android', data: '   ' },
    { type: 'android', data: 42 }
  ])('never returns an undeliverable token for %j', (deviceToken) => {
    expect(readDevicePushToken(deviceToken as { data?: unknown } | null)).toBeNull();
  });
});