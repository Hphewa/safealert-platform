import { describe, expect, it } from 'vitest';

import {
  createLeafletInjectionScript,
  createSetLocationCommand,
  parseLeafletMapMessage
} from './mapMessages';

describe('Leaflet map message protocol', () => {
  it('accepts a map_ready message', () => {
    expect(parseLeafletMapMessage(JSON.stringify({ type: 'map_ready' }))).toEqual({ type: 'map_ready' });
  });

  it('accepts a valid location_changed message', () => {
    expect(
      parseLeafletMapMessage(
        JSON.stringify({
          type: 'location_changed',
          latitude: 6.9271,
          longitude: 79.8612
        })
      )
    ).toEqual({
      type: 'location_changed',
      latitude: 6.9271,
      longitude: 79.8612
    });
  });

  it('ignores invalid JSON messages', () => {
    expect(parseLeafletMapMessage('{nope')).toBeNull();
  });

  it('ignores invalid latitude and longitude values', () => {
    expect(
      parseLeafletMapMessage(
        JSON.stringify({
          type: 'location_changed',
          latitude: 95,
          longitude: 79.8612
        })
      )
    ).toBeNull();
    expect(
      parseLeafletMapMessage(
        JSON.stringify({
          type: 'location_changed',
          latitude: 6.9271,
          longitude: 181
        })
      )
    ).toBeNull();
  });

  it('accepts map errors without exposing raw details as required fields', () => {
    expect(parseLeafletMapMessage(JSON.stringify({ type: 'map_error', message: 'boom' }))).toEqual({
      type: 'map_error',
      message: 'boom'
    });
  });

  it('creates safe set-location commands only for valid coordinates', () => {
    expect(createSetLocationCommand({ latitude: 6.9271, longitude: 79.8612 }, true)).toEqual({
      type: 'set_location',
      latitude: 6.9271,
      longitude: 79.8612,
      recenter: true
    });
    expect(createSetLocationCommand({ latitude: Number.NaN, longitude: 79.8612 }, true)).toBeNull();
  });

  it('serializes React Native to Leaflet commands as JSON payloads', () => {
    const script = createLeafletInjectionScript({
      type: 'set_location',
      latitude: 6.9271,
      longitude: 79.8612,
      recenter: false
    });

    expect(script).toContain('window.SafeAlertMap.receive');
    expect(script).toContain('"latitude":6.9271');
    expect(script).toContain('true;');
  });
});
