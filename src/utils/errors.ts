export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export class ApiError extends Error {
  public statusCode: number;
  public errorCode?: number;

  constructor(message: string, statusCode: number, errorCode?: number) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

export class RateLimitError extends ApiError {
  public retryAfter: number;

  constructor(retryAfter: number) {
    super(`Rate limited. Retry after ${retryAfter}s`, 429);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestError";
  }
}

export function formatError(err: unknown): string {
  if (err instanceof AuthError) {
    return `Auth error: ${err.message}`;
  }
  if (err instanceof RateLimitError) {
    return `Rate limited — retry in ${err.retryAfter}s`;
  }
  if (err instanceof ApiError) {
    return `API error (${err.statusCode}): ${err.message}`;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
