/**
 * Generic HTTP error that carries an HTTP status code.
 *
 * Throw this from services or route handlers; the global error handler in
 * src/index.ts will catch it and return the correct status code instead of
 * defaulting to 500.
 */
export class HttpError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.details = details;
  }
}
