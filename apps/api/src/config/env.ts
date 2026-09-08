const defaultDevelopmentAccessSecret = 'development-access-secret-change-me';
const defaultDevelopmentRefreshSecret = 'development-refresh-secret-change-me';

export type ApiConfig = {
  nodeEnv: string;
  port: number;
  mongodbUri: string | undefined;
  jwtAccessSecret: string;
  jwtAccessExpiresIn: string;
  jwtRefreshSecret: string;
  jwtRefreshExpiresIn: string;
};

function readPort(value: string | undefined) {
  const parsed = Number.parseInt(value ?? '4000', 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('PORT must be a positive number.');
  }

  return parsed;
}

function requireProductionValue(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`${name} is required when NODE_ENV=production.`);
  }
}

export function loadConfig(): ApiConfig {
  const nodeEnv = process.env.NODE_ENV ?? 'development';

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
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d'
  };
}
