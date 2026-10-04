import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../../../shared/asyncHandler.js';
import { ApiError } from '../../../shared/apiError.js';

const nominatimUrl = 'https://nominatim.openstreetmap.org';
const geocodingQuerySchema = z.object({
  q: z.string().trim().min(3).max(120)
});
const reverseQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180)
});

type NominatimResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: Record<string, string | undefined>;
};

export function createGeocodingRouter() {
  const router = Router();

  router.get('/search', asyncHandler(async (request, response) => {
    const { q } = geocodingQuerySchema.parse(request.query);
    const results = await fetchNominatim<NominatimResult[]>(
      `/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(q)}`
    );

    response.json({ places: results.flatMap(toLocationResult) });
  }));

  router.get('/reverse', asyncHandler(async (request, response) => {
    const { lat, lon } = reverseQuerySchema.parse(request.query);
    const result = await fetchNominatim<NominatimResult>(
      `/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lon}`
    );

    response.json({ placeName: readablePlaceName(result.address, result.display_name) });
  }));

  return router;
}

async function fetchNominatim<T>(path: string): Promise<T> {
  let result: Response;

  try {
    result = await fetch(`${nominatimUrl}${path}`, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en',
        'User-Agent': 'SafeAlert/0.1 (disaster-reporting-app)'
      }
    });
  } catch {
    throw new ApiError(502, 'GEOCODING_UNAVAILABLE', 'Place lookup is temporarily unavailable.');
  }

  if (!result.ok) {
    throw new ApiError(502, 'GEOCODING_UNAVAILABLE', 'Place lookup is temporarily unavailable.');
  }

  return (await result.json()) as T;
}

function toLocationResult(result: NominatimResult) {
  const latitude = Number(result.lat);
  const longitude = Number(result.lon);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return [];
  }

  return [{
    id: String(result.place_id),
    name: readablePlaceName(result.address, result.display_name),
    description: result.display_name,
    latitude,
    longitude
  }];
}

function readablePlaceName(address: Record<string, string | undefined> | undefined, fallback: string) {
  const locality = address?.suburb ?? address?.neighbourhood ?? address?.village ?? address?.town ?? address?.city;
  const region =
    address?.city ??
    address?.town ??
    address?.municipality ??
    address?.city_district ??
    address?.state_district ??
    address?.county ??
    address?.state;
  const parts = [address?.road, locality, region].filter(
    (part, index, values): part is string => Boolean(part) && values.indexOf(part) === index
  );

  return parts.slice(0, 3).join(', ') || fallback.split(',').slice(0, 3).join(', ');
}
