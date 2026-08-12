import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthToken } from '../types/index.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthToken;
    }
  }
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET no está definido. Configúralo en tu .env antes de arrancar el servidor.');
  }
  return secret;
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid token' });
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as AuthToken;
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function generateToken(userId: string, email: string): string {
  const expiresIn = (process.env.JWT_EXPIRY || '7d') as jwt.SignOptions['expiresIn'];

  return jwt.sign(
    { userId, email },
    getJwtSecret(),
    { expiresIn }
  );
}