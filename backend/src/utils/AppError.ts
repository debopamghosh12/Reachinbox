// An "expected" error with an HTTP status. Anything else reaching the error
// handler is treated as a bug and returned as a generic 500.
export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, message: string, code = "AppError", details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
