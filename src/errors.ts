import { ErrorRequestHandler, RequestHandler } from 'express';

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Record<string, unknown> = {}, // extra fields placed inside `error`
  ) {
    super(message);
  }
}

export const validationError = (message: string) => new AppError(422, 'VALIDATION', message);
export const notFound = (message: string) => new AppError(404, 'NOT_FOUND', message);

export const unknownRoute: RequestHandler = (req, _res, next) => {
  next(notFound(`No route for ${req.method} ${req.path}`));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, ...err.details } });
    return;
  }
  // thrown by express.json() on a body that is not valid JSON
  if (err.type === 'entity.parse.failed') {
    res.status(422).json({ error: { code: 'VALIDATION', message: 'Body is not valid JSON' } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Unexpected error' } });
};
