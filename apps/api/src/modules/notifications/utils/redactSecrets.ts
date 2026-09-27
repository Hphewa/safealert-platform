const redactedPlaceholder = '[redacted]';

export function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

/**
 * Removes credential values from provider response text before it is stored or logged.
 * Provider payloads are never persisted verbatim.
 */
export function redactSecrets(value: string, secrets: readonly (string | undefined)[]) {
  return secrets.reduce<string>((current, secret) => {
    if (!secret || secret.length < 4) return current;
    return current.split(secret).join(redactedPlaceholder);
  }, value);
}

export function sanitizeProviderText(
  value: string,
  secrets: readonly (string | undefined)[],
  maxLength = 500
) {
  return truncate(redactSecrets(value, secrets).replace(/\s+/g, ' ').trim(), maxLength);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseJsonSafely(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
