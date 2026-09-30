import { describe, expect, it, vi } from 'vitest';
import { Linking } from 'react-native';
import type { GeoJsonPoint } from '@safealert/contracts';

import {
  extractEmergencyCoordinates,
  formatCoordinate,
  formatTelUrl,
  initiateResidentCall,
  initiateViewLocationRoute,
  isValidPhoneNumber
} from './contactLocationUi';

vi.mock('react-native', () => ({
  Linking: {
    canOpenURL: vi.fn(),
    openURL: vi.fn()
  }
}));

describe('contactLocationUi', () => {
  describe('extractEmergencyCoordinates', () => {
    it('correctly maps GeoJSON [longitude, latitude] to latitude and longitude', () => {
      const location: GeoJsonPoint = {
        type: 'Point',
        coordinates: [79.8612, 6.9271]
      };

      const result = extractEmergencyCoordinates(location);
      expect(result).toEqual({
        latitude: 6.9271,
        longitude: 79.8612,
        isValid: true
      });
    });

    it('accepts geographic boundary values', () => {
      const northPole: GeoJsonPoint = { type: 'Point', coordinates: [180, 90] };
      expect(extractEmergencyCoordinates(northPole).isValid).toBe(true);

      const southPole: GeoJsonPoint = { type: 'Point', coordinates: [-180, -90] };
      expect(extractEmergencyCoordinates(southPole).isValid).toBe(true);

      const equatorPrimeMeridian: GeoJsonPoint = { type: 'Point', coordinates: [0, 0] };
      expect(extractEmergencyCoordinates(equatorPrimeMeridian).isValid).toBe(true);
    });

    it('rejects out-of-bounds latitude values', () => {
      const outOfBoundsLat: GeoJsonPoint = {
        type: 'Point',
        coordinates: [79.8612, 90.0001]
      };
      expect(extractEmergencyCoordinates(outOfBoundsLat)).toEqual({
        latitude: null,
        longitude: null,
        isValid: false
      });
    });

    it('rejects out-of-bounds longitude values', () => {
      const outOfBoundsLon: GeoJsonPoint = {
        type: 'Point',
        coordinates: [180.0001, 6.9271]
      };
      expect(extractEmergencyCoordinates(outOfBoundsLon)).toEqual({
        latitude: null,
        longitude: null,
        isValid: false
      });
    });

    it('rejects non-numeric or NaN coordinates', () => {
      const nanLocation: GeoJsonPoint = {
        type: 'Point',
        coordinates: [Number.NaN, 6.9271]
      };
      expect(extractEmergencyCoordinates(nanLocation).isValid).toBe(false);

      const infiniteLocation: GeoJsonPoint = {
        type: 'Point',
        coordinates: [79.8612, Number.POSITIVE_INFINITY]
      };
      expect(extractEmergencyCoordinates(infiniteLocation).isValid).toBe(false);
    });

    it('safely handles missing or malformed location objects without crashing', () => {
      expect(extractEmergencyCoordinates(null)).toEqual({
        latitude: null,
        longitude: null,
        isValid: false
      });
      expect(extractEmergencyCoordinates(undefined)).toEqual({
        latitude: null,
        longitude: null,
        isValid: false
      });
      expect(
        extractEmergencyCoordinates({ type: 'Point', coordinates: [] as unknown as [number, number] })
      ).toEqual({
        latitude: null,
        longitude: null,
        isValid: false
      });
      expect(
        extractEmergencyCoordinates({ type: 'Point', coordinates: [79.8612] as unknown as [number, number] })
      ).toEqual({
        latitude: null,
        longitude: null,
        isValid: false
      });
    });
  });

  describe('formatCoordinate', () => {
    it('formats valid coordinate numbers as strings', () => {
      expect(formatCoordinate(6.9271)).toBe('6.9271');
      expect(formatCoordinate(-79.8612)).toBe('-79.8612');
      expect(formatCoordinate(0)).toBe('0');
    });

    it('returns "Not provided" for missing or invalid coordinate values', () => {
      expect(formatCoordinate(null)).toBe('Not provided');
      expect(formatCoordinate(undefined)).toBe('Not provided');
      expect(formatCoordinate(Number.NaN)).toBe('Not provided');
      expect(formatCoordinate(Number.POSITIVE_INFINITY)).toBe('Not provided');
    });
  });

  describe('isValidPhoneNumber', () => {
    it('validates usable phone numbers', () => {
      expect(isValidPhoneNumber('+94-77-555-1234')).toBe(true);
      expect(isValidPhoneNumber('+94 77 555 1234')).toBe(true);
      expect(isValidPhoneNumber('0771234567')).toBe(true);
      expect(isValidPhoneNumber('+14155552671')).toBe(true);
    });

    it('rejects missing or empty phone numbers', () => {
      expect(isValidPhoneNumber(null)).toBe(false);
      expect(isValidPhoneNumber(undefined)).toBe(false);
      expect(isValidPhoneNumber('')).toBe(false);
      expect(isValidPhoneNumber('   ')).toBe(false);
    });

    it('rejects literal placeholder strings and non-dialable values', () => {
      expect(isValidPhoneNumber('undefined')).toBe(false);
      expect(isValidPhoneNumber('null')).toBe(false);
      expect(isValidPhoneNumber('NaN')).toBe(false);
      expect(isValidPhoneNumber('--')).toBe(false);
    });
  });

  describe('formatTelUrl', () => {
    it('creates tel: URI with whitespace stripped', () => {
      expect(formatTelUrl('+94 77 555 1234')).toBe('tel:+94775551234');
      expect(formatTelUrl('+94-77-555-1234')).toBe('tel:+94-77-555-1234');
    });
  });

  describe('initiateResidentCall', () => {
    it('invokes native Linking with tel: URI for a valid phone number', async () => {
      vi.mocked(Linking.canOpenURL).mockResolvedValueOnce(true);
      vi.mocked(Linking.openURL).mockResolvedValueOnce(undefined as never);

      const result = await initiateResidentCall('+94-77-555-1234');
      expect(result).toBe(true);
      expect(Linking.openURL).toHaveBeenCalledWith('tel:+94-77-555-1234');
    });

    it('does not invoke Linking when phone number is invalid', async () => {
      vi.clearAllMocks();

      const result = await initiateResidentCall('undefined');
      expect(result).toBe(false);
      expect(Linking.openURL).not.toHaveBeenCalled();
    });

    it('does not crash when phone number is null or undefined', async () => {
      vi.clearAllMocks();

      expect(await initiateResidentCall(null)).toBe(false);
      expect(await initiateResidentCall(undefined)).toBe(false);
      expect(Linking.openURL).not.toHaveBeenCalled();
    });

    it('catches and handles dialer rejection safely without throwing', async () => {
      vi.mocked(Linking.canOpenURL).mockResolvedValueOnce(true);
      vi.mocked(Linking.openURL).mockRejectedValueOnce(new Error('Dialer unavailable in simulator'));

      const result = await initiateResidentCall('+94-77-555-1234');
      expect(result).toBe(false);
    });
  });

  describe('initiateViewLocationRoute', () => {
    it('returns true when valid coordinates are provided', () => {
      expect(initiateViewLocationRoute(6.9271, 79.8612)).toBe(true);
    });

    it('returns false when latitude or longitude is invalid or out of range', () => {
      expect(initiateViewLocationRoute(null, 79.8612)).toBe(false);
      expect(initiateViewLocationRoute(6.9271, undefined)).toBe(false);
      expect(initiateViewLocationRoute(Number.NaN, 79.8612)).toBe(false);
      expect(initiateViewLocationRoute(95, 79.8612)).toBe(false);
      expect(initiateViewLocationRoute(6.9271, 190)).toBe(false);
    });
  });
});
