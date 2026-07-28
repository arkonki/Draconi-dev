import { ZodError } from 'zod';
import { HttpError } from '../http.js';

export class HelperError extends HttpError {
  constructor(status, code, message, details) {
    super(status, message, code);
    this.details = details;
  }
}

export function validationError(error) {
  if (!(error instanceof ZodError)) return error;
  return new HelperError(
    400,
    'VALIDATION_ERROR',
    'Request validation failed',
    error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  );
}

export function asHelperError(error) {
  if (error instanceof HelperError) return error;
  if (error instanceof ZodError) return validationError(error);
  if (error instanceof HttpError) {
    return new HelperError(error.status, error.code || 'APP_ERROR', error.message);
  }
  return new HelperError(500, 'INTERNAL_ERROR', 'Internal server error');
}

