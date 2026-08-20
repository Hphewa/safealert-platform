const fallbackApiUrl = 'http://localhost:4000/api/v1';

export const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? fallbackApiUrl;
