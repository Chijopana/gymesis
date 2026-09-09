/**
 * Error con código HTTP. Lanzarlo desde cualquier handler: Express 5 propaga
 * automáticamente los rechazos de promesas al middleware de errores.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, message, details);
export const unauthorized = (message = 'No autorizado') => new HttpError(401, message);
export const forbidden = (message = 'No tienes permiso para hacer esto') => new HttpError(403, message);
export const notFound = (message = 'Recurso no encontrado') => new HttpError(404, message);
export const conflict = (message: string) => new HttpError(409, message);
