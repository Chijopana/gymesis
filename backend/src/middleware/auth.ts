import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { AuthToken } from '../types/index.js';
import { unauthorized } from '../utils/httpError.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthToken;
    }
  }
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(unauthorized('Falta el token de acceso'));
  }

  const token = authHeader.slice(7).trim();

  try {
    const decoded = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] }) as AuthToken;
    req.user = decoded;
    return next();
  } catch (err) {
    const expired = err instanceof jwt.TokenExpiredError;
    return next(unauthorized(expired ? 'Tu sesión ha caducado, vuelve a entrar' : 'Token inválido'));
  }
}

/**
 * Id del usuario autenticado. Los handlers van siempre detrás de `authMiddleware`,
 * así que esto evita repetir `req.user?.userId` y el `if (!userId)` en cada ruta.
 */
export function currentUserId(req: Request): string {
  const userId = req.user?.userId;
  if (!userId) {
    throw unauthorized();
  }
  return userId;
}

export function generateToken(userId: string, email: string): string {
  return jwt.sign({ userId, email }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'],
    algorithm: 'HS256',
  });
}
