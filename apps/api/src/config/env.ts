import { readFileSync } from 'node:fs';

const defaultDevelopmentAccessSecret = 'development-access-secret-change-me';
const defaultDevelopmentRefreshSecret = 'development-refresh-secret-change-me';
const defaultNotifyLkSenderId = 'NotifyDEMO';
const defaultNotificationCountryName = 'Sri Lanka';

export type NotifyLkConfig = {
  userId: string | undefined;
  apiKey: string | undefined;
  senderId: string;
};

export type FirebaseConfig = {
  projectId: string | undefined;
  clientEmail: string | undefined;
  privateKey: string | undefined;
};

export type ApiConfig = {
  nodeEnv: string;
  port: number;
  mongodbUri: string | undefined;
  jwtAccessSecret: string;
  jwtAccessExpiresIn: string;
  jwtRefreshSecret: string;
  jwtRefreshExpiresIn: string;
  mediaUploadDir: string;
  mediaPublicPath: string;
  // LDFEW-127 notification delivery. Secrets stay in the backend environment only.
  smsProvider: string;
  notificationSmsMockEnabled: boolean;
  notifyLk: NotifyLkConfig;
  firebase: FirebaseConfig;
  notificationCountryName: string;
};

function readPort(value: string | undefined) {
  const parsed = Number.parseInt(value ?? '4000', 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('PORT must be a positive number.');
  }

  return parsed;
}

function readBoolean(value: string | undefined, fallback = false) {
  if (value === undefined || value.trim() === '') return fallback;
  return value.trim().toLowerCase() === 'true';
}

function readOptionalSecret(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  // Treat documentation placeholders as missing configuration. This prevents the FCM
  // provider from attempting authentication with values such as "your-project-id".
  if (/^(your[-_]|example[-_]|<.*>$|change[-_]me$)/i.test(trimmed)) return undefined;

  return trimmed;
}

type FirebaseFileCredentials = {
  projectId: string | undefined;
  clientEmail: string | undefined;
  privateKey: string | undefined;
};

// Firebase Admin credentials are never committed. Either the three FIREBASE_* values are
// provided, or FIREBASE_SERVICE_ACCOUNT_PATH points at a local service-account JSON file.
function readFirebaseFileCredentials(filePath: string | undefined): FirebaseFileCredentials {
  if (!filePath) return { projectId: undefined, clientEmail: undefined, privateKey: undefined };

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
    const read = (key: string) => (typeof parsed[key] === 'string' ? (parsed[key] as string) : undefined);
    return {
      projectId: read('project_id') ?? read('projectId'),
      clientEmail: read('client_email') ?? read('clientEmail'),
      privateKey: read('private_key') ?? read('privateKey')
    };
  } catch {
    // A missing or malformed file is reported as "not configured" instead of crashing the API.
    return { projectId: undefined, clientEmail: undefined, privateKey: undefined };
  }
}

function requireProductionValue(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`${name} is required when NODE_ENV=production.`);
  }
}

export function loadConfig(): ApiConfig {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const firebaseFile = readFirebaseFileCredentials(readOptionalSecret(process.env.FIREBASE_SERVICE_ACCOUNT_PATH));

  if (nodeEnv === 'production') {
    requireProductionValue('MONGODB_URI', process.env.MONGODB_URI);
    requireProductionValue('JWT_ACCESS_SECRET', process.env.JWT_ACCESS_SECRET);
    requireProductionValue('JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET);
  }

  return {
    nodeEnv,
    port: readPort(process.env.PORT),
    mongodbUri: process.env.MONGODB_URI,
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? defaultDevelopmentAccessSecret,
    jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? defaultDevelopmentRefreshSecret,
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
    mediaUploadDir: process.env.MEDIA_UPLOAD_DIR ?? 'uploads',
    mediaPublicPath: process.env.MEDIA_PUBLIC_PATH ?? '/api/v1/media',
    smsProvider: (readOptionalSecret(process.env.SMS_PROVIDER) ?? 'notifylk').toLowerCase(),
    // Mocking is opt-in only. Production must use the real Notify.lk provider.
    notificationSmsMockEnabled: readBoolean(process.env.NOTIFICATION_SMS_MOCK_ENABLED),
    notifyLk: {
      userId: readOptionalSecret(process.env.NOTIFY_LK_USER_ID),
      apiKey: readOptionalSecret(process.env.NOTIFY_LK_API_KEY),
      senderId: readOptionalSecret(process.env.NOTIFY_LK_SENDER_ID) ?? defaultNotifyLkSenderId
    },
    firebase: {
      projectId: readOptionalSecret(process.env.FIREBASE_PROJECT_ID) ?? firebaseFile.projectId,
      clientEmail: readOptionalSecret(process.env.FIREBASE_CLIENT_EMAIL) ?? firebaseFile.clientEmail,
      privateKey: readOptionalSecret(process.env.FIREBASE_PRIVATE_KEY) ?? firebaseFile.privateKey
    },
    notificationCountryName: readOptionalSecret(process.env.NOTIFICATION_COUNTRY_NAME) ?? defaultNotificationCountryName
  };
}
