import { config } from './config/env.js';

import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { closeDatabase, initializeDatabase, pool } from './database/connection.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import routineRoutes from './routes/routines.js';
import friendRoutes from './routes/friends.js';
import exerciseRoutes from './routes/exercises.js';
import trainingsRoutes from './routes/trainings.js';
import groupsRoutes from './routes/groups.js';

const app: Express = express();

// Detrás de nginx / Docker: sin esto el rate limit vería siempre la misma IP.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Cabeceras de seguridad. La API no sirve HTML, así que la CSP del frontend
// la pone nginx; aquí basta con negar el embebido y el sniffing de tipos.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  })
);

app.use(
  cors({
    origin(origin, callback) {
      // Sin Origin = misma máquina (curl, health checks, proxy inverso).
      if (!origin) return callback(null, true);
      if (config.corsOrigins.includes(origin)) return callback(null, true);

      // Desarrollo: cualquier puerto de localhost, porque el de Vite varía.
      if (config.allowAnyLocalhost && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }

      // Sin lista configurada (detrás de un proxy en el mismo dominio) no hay
      // nada que restringir: las peticiones del navegador llegan sin Origin.
      if (config.corsOrigins.length === 0 && !config.allowAnyLocalhost) return callback(null, true);

      return callback(new Error(`Origen no permitido por CORS: ${origin}`));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86_400,
  })
);

app.use(express.json({ limit: config.security.jsonBodyLimit }));

const windowMs = config.security.rateLimitWindowMinutes * 60 * 1000;

/** Registro y login: la puerta de entrada a la fuerza bruta de credenciales. */
const authLimiter = rateLimit({
  windowMs,
  limit: config.security.authRateLimit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Demasiados intentos. Espera unos minutos antes de volver a probar.' },
});

const apiLimiter = rateLimit({
  windowMs,
  limit: config.security.apiRateLimit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Estás haciendo demasiadas peticiones. Baja el ritmo un momento.' },
});

// El health check queda fuera del límite para no romper los monitores.
app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'up', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'degraded', database: 'down', timestamp: new Date().toISOString() });
  }
});

app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/routines', routineRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/exercises', exerciseRoutes);
app.use('/api/trainings', trainingsRoutes);
app.use('/api/groups', groupsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

async function start() {
  try {
    await initializeDatabase();
  } catch (err) {
    console.error('No se pudo inicializar la base de datos:', err);
    process.exit(1);
  }

  const server = app.listen(config.port, () => {
    console.log(`🏋️  Gymesis API escuchando en http://localhost:${config.port} (${config.nodeEnv})`);
  });

  // Apagado ordenado: deja terminar las peticiones en curso y cierra el pool
  // para que Docker/systemd no maten conexiones a medias.
  const shutdown = (signal: string) => {
    console.log(`\n${signal} recibido, cerrando servidor...`);
    server.close(async () => {
      await closeDatabase().catch(() => undefined);
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();

export default app;
