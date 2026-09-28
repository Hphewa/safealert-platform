import { describe, expect, it } from 'vitest';
import { hasSendablePhoneNumber, maskPhoneNumber, toNotifyLkRecipient } from '../utils/phoneNumber.js';

describe('Notify.lk recipient phone normalization', () => {
  it.each([
    ['0771234567', '94771234567'],
    ['+94771234567', '94771234567'],
    ['0094771234567', '94771234567'],
    ['94771234567', '94771234567'],
    ['771234567', '94771234567'],
    ['077-123 4567', '94771234567'],
    [' 077 123 4567 ', '94771234567'],
    ['+94 (77) 123-4567', '94771234567'],
    ['0781234567', '94781234567']
  ])('normalizes %s to %s', (value, expected) => {
    expect(toNotifyLkRecipient(value)).toBe(expected);
  });

  it('never concatenates a second country code onto an already normalized number', () => {
    expect(toNotifyLkRecipient('94771234567')).toBe('94771234567');
    expect(toNotifyLkRecipient('+94771234567')).toBe('94771234567');
  });

  it.each([
    [null],
    [undefined],
    [''],
    ['   '],
    ['not-a-number'],
    ['0112345678'],
    ['+94112345678'],
    ['12345'],
    ['07712345678901'],
    ['9471234567890']
  ])('rejects %s as unsupported', (value) => {
    expect(toNotifyLkRecipient(value)).toBeNull();
    expect(hasSendablePhoneNumber(value)).toBe(false);
  });

  it('masks phone numbers for logs', () => {
    expect(maskPhoneNumber('0771234567')).toBe('***567');
    expect(maskPhoneNumber(null)).toBe('unknown');
  });
});