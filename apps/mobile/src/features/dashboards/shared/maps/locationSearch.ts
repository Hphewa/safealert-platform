export type LocationSearchResult = {
  id: string;
  name: string;
  description: string;
  latitude: number;
  longitude: number;
};

type LocationSearchResponse = { places: LocationSearchResult[] };
type ReverseLocationResponse = { placeName: string };

export async function searchLocationPlaces(query: string): Promise<LocationSearchResult[]> {
  const trimmedQuery = query.trim();

  if (trimmedQuery.length < 3) {
    return [];
  }

  const response = await apiRequest<LocationSearchResponse>(
    `/geocoding/search?q=${encodeURIComponent(trimmedQuery)}`
  );

  return response.places;
}

export async function reverseGeocodePlace(latitude: number, longitude: number): Promise<string | null> {
  try {
    const response = await apiRequest<ReverseLocationResponse>(
      `/geocoding/reverse?lat=${latitude}&lon=${longitude}`
    );

    return response.placeName || null;
  } catch {
    return null;
  }
}
import { apiRequest } from '../../../../services/api/client';
