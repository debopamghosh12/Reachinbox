import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";

// Express 5 forwards errors thrown in async handlers here automatically,
// so routes can just `throw` - no try/catch or asyncHandler wrapper needed.
// Every error response has the same shape: { error, message, details? }.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "ValidationError",
      message: "Invalid request",
      details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }

  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.code, message: err.message, details: err.details });
  }

  // express.json() errors (malformed JSON, body too large) carry a 4xx status.
  const status = (err as { status?: unknown })?.status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    return res.status(status).json({ error: "BadRequest", message: (err as Error).message });
  }

  logger.error("Unhandled error", err);
  return res.status(500).json({ error: "InternalError", message: "Something went wrong" });
}

export function notFound(req: Request, res: Response) {
  res.status(404).json({ error: "NotFound", message: `No route for ${req.method} ${req.originalUrl}` });
}
