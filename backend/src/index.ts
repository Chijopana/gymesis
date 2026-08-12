import 'dotenv/config'          // ← SIEMPRE la primera línea, antes que cualquier otro import

import express, { Express, NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { initializeDatabase } from './database/connection.js';

// Routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import routineRoutes from './routes/routines.js';
import friendRoutes from './routes/friends.js';
import exerciseRoutes from './routes/exercises.js';
import trainingsRoutes from './routes/trainings.js';
import groupsRoutes from './routes/groups.js';

const app: Express = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/routines', routineRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/exercises', exerciseRoutes);
app.use('/api/trainings', trainingsRoutes);
app.use('/api/groups', groupsRoutes);

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler — para rutas que no matchean nada
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handling middleware — 4 parámetros es OBLIGATORIO para que Express lo reconozca como tal
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

// Arranca el servidor SOLO cuando la base de datos está lista
async function start() {
  try {
    await initializeDatabase();
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();