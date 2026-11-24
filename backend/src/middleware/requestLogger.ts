import type { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  // bull-board's UI polls its API every few seconds - logging it would drown everything else.
  if (req.originalUrl.startsWith("/admin/queues")) return next();

  const start = Date.now();
  // "finish" fires after the response is sent, so we know the status code and duration.
  res.on("finish", () => {
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
}
