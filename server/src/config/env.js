import dotenv from 'dotenv';

dotenv.config();

const numberOrDefault = (value, fallback) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: numberOrDefault(process.env.PORT, 5000),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  clientOrigins: (process.env.CLIENT_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: numberOrDefault(process.env.DB_PORT, 3306),
    user: process.env.DB_USER ?? 'carpool_app',
    password: process.env.DB_PASSWORD ?? 'carpool_password',
    database: process.env.DB_NAME ?? 'carpooling_db'
  },
  jwtSecret: process.env.JWT_SECRET ?? 'development-only-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '1d',
  admin: {
    id: 1,
    fullName: process.env.ADMIN_NAME ?? 'Project Administrator',
    email: process.env.ADMIN_EMAIL ?? 'admin@carpool.local',
    password: process.env.ADMIN_PASSWORD ?? 'admin_password'
  }
};

if (env.nodeEnv === 'production' && env.jwtSecret === 'development-only-secret') {
  throw new Error('JWT_SECRET must be configured in production.');
}
