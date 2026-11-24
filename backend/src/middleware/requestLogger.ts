import type { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  // bull-board's UI polls its API every few seconds - logging it would drown everything else.
  if (req.originalUrl.startsWith("/admin/queues")) return next();

  const start = Date.now();
  // OAuth callbacks carry one-time codes and state tokens in the query string:
  // log only the path for /auth/* so credentials never land in logs.
  const url = req.originalUrl.startsWith("/auth/") ? req.originalUrl.split("?")[0] : req.originalUrl;
  // "finish" fires after the response is sent, so we know the status code and duration.
  res.on("finish", () => {
    logger.info(`${req.method} ${url} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
}
