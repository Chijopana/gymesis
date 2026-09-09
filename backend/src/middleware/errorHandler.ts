import { NextFunction, Request, Response } from 'express';
import { config } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';

/** Códigos de PostgreSQL que sabemos traducir a un error de usuario. */
const PG_ERROR_STATUS: Record<string, { status: number; message: string }> = {
  '23505': { status: 409, message: 'Ese registro ya existe' },
  '23503': { status: 400, message: 'El recurso referenciado no existe' },
  '23514': { status: 400, message: 'Los datos no cumplen las restricciones' },
  '22P02': { status: 400, message: 'Formato de identificador inválido' },
  '22001': { status: 400, message: 'Alguno de los textos es demasiado largo' },
};

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: 'Ruta no encontrada' });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (res.headersSent) return;

  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  const asRecord = typeof err === 'object' && err !== null ? (err as Record<string, unknown>) : {};

  // Errores del propio framework: body-parser (JSON mal formado, cuerpo demasiado
  // grande) y CORS ya traen su código correcto; sin esto salían todos como 500.
  if (asRecord.type === 'entity.too.large') {
    return res.status(413).json({ error: 'El contenido enviado es demasiado grande' });
  }
  if (asRecord.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es JSON válido' });
  }
  if (err instanceof Error && err.message.startsWith('Origen no permitido por CORS')) {
    return res.status(403).json({ error: 'Origen no permitido' });
  }

  const frameworkStatus = Number(asRecord.status ?? asRecord.statusCode);
  if (Number.isInteger(frameworkStatus) && frameworkStatus >= 400 && frameworkStatus < 500) {
    return res.status(frameworkStatus).json({ error: (err as Error).message || 'Petición inválida' });
  }

  const pgCode = typeof asRecord.code === 'string' ? asRecord.code : undefined;
  const known = pgCode ? PG_ERROR_STATUS[pgCode] : undefined;
  if (known) {
    // Un 4xx es culpa de la petición, no del servidor: no ensucia los logs de error.
    console.warn(`[${req.method} ${req.originalUrl}] ${pgCode}:`, (err as Error).message);
    return res.status(known.status).json({ error: known.message });
  }

  // Cualquier otra cosa es un fallo nuestro: se registra entero y se responde genérico
  // para no filtrar rutas de ficheros ni estructura de la base de datos.
  console.error(`[${req.method} ${req.originalUrl}] Error no controlado:`, err);
  return res.status(500).json({
    error: 'Error interno del servidor',
    ...(config.isProduction ? {} : { debug: err instanceof Error ? err.message : String(err) }),
  });
}
