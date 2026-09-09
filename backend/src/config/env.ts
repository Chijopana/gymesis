import 'dotenv/config';

/**
 * Configuración centralizada y validada.
 * Si falta algo crítico el proceso muere aquí, con un mensaje claro,
 * en lugar de fallar más tarde con un 500 opaco en producción.
 */

const isProduction = process.env.NODE_ENV === 'production';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Falta la variable de entorno ${name}. Revisa tu archivo .env (usa .env.example como plantilla).`);
  }
  return value;
}

function toInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`La variable ${name} debe ser un número entero (valor recibido: "${raw}").`);
  }
  return parsed;
}

const jwtSecret = required('JWT_SECRET', isProduction ? undefined : 'gymesis-dev-secret-not-for-production');

// Un secreto corto hace el token trivial de romper por fuerza bruta.
if (isProduction && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET debe tener al menos 32 caracteres en producción.');
}
if (isProduction && jwtSecret.includes('dev-secret')) {
  throw new Error('Estás usando el JWT_SECRET de desarrollo en producción. Genera uno nuevo.');
}

/** Orígenes permitidos por CORS. Vacío = mismo origen (proxy nginx/vite). */
const corsOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

/**
 * En desarrollo se acepta cualquier puerto de localhost.
 *
 * El proxy de Vite reenvía la cabecera `Origin` original, así que el backend ve
 * el puerto real del servidor de desarrollo. Ese puerto no es fijo: si el 5173
 * está ocupado, Vite salta al 5174, 5175... y una lista blanca cerrada rompía
 * el login (los GET no mandan `Origin`, pero los POST sí).
 *
 * En producción esto queda desactivado: manda `CORS_ORIGINS` y punto.
 */
const allowAnyLocalhost = !isProduction;

export const config = {
  isProduction,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: toInt('PORT', 3000),
  corsOrigins,
  allowAnyLocalhost,
  jwt: {
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRY ?? '7d',
  },
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: toInt('DB_PORT', 5432),
    database: process.env.DB_NAME ?? 'gymesis',
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    maxConnections: toInt('DB_POOL_MAX', 10),
  },
  security: {
    bcryptRounds: toInt('BCRYPT_ROUNDS', 12),
    jsonBodyLimit: process.env.JSON_BODY_LIMIT ?? '100kb',
    /** Peticiones por ventana para endpoints de autenticación. */
    authRateLimit: toInt('AUTH_RATE_LIMIT', 20),
    /** Peticiones por ventana para el resto de la API. */
    apiRateLimit: toInt('API_RATE_LIMIT', 600),
    rateLimitWindowMinutes: toInt('RATE_LIMIT_WINDOW_MINUTES', 15),
  },
  /** Se rellena la biblioteca de ejercicios si hay menos filas que esto. */
  exerciseLibraryTarget: toInt('EXERCISE_LIBRARY_TARGET', 1400),
} as const;
