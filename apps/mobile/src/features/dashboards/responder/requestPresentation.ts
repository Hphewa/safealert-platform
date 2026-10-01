import type { SafeResponseRequest } from '@safealert/contracts';

export type ResponderRequestPresentation = {
  title: string;
  location: string;
  details: string[];
  status: string;
  submittedAt?: string;
};

export function presentResponderRequest(
  responseRequest: SafeResponseRequest
): ResponderRequestPresentation {
  return {
    title: formatAssistanceType(responseRequest.assistanceType),
    location: formatLocation(responseRequest),
    details: [
      `${displayNumber(responseRequest.affectedPeople)} people`,
      `${displayNumber(responseRequest.injuredPeople)} injured`
    ],
    status: responseRequest.status,
    submittedAt: formatSubmittedAt(responseRequest.createdAt)
  };
}

export function displayNumber(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : 'Not provided';
}

function formatAssistanceType(assistanceType: SafeResponseRequest['assistanceType']) {
  return assistanceType
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatLocation(responseRequest: SafeResponseRequest) {
  const coordinates = responseRequest.location?.coordinates;

  // Protect against missing, non-array, or non-finite coordinate values
  // so malformed emergency location data cannot crash queue cards or details.
  if (
    !coordinates ||
    coordinates.length !== 2 ||
    typeof coordinates[0] !== 'number' ||
    typeof coordinates[1] !== 'number' ||
    !Number.isFinite(coordinates[0]) ||
    !Number.isFinite(coordinates[1])
  ) {
    return 'Location not provided';
  }

  const [longitude, latitude] = coordinates;
  return `GPS: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
}

function formatSubmittedAt(createdAt: string) {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleString();
}