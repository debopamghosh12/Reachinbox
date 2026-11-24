import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { SESSION_COOKIE, verifySessionToken } from "../services/auth.service";
import { AppError } from "../utils/AppError";
import { getUserId } from "../utils/requestUser";

// Every /api/* route goes through this. On success, req.userId is set, and
// every service filters its queries by that id. That is what keeps users
// out of each other's data.
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const userId = verifySessionToken(req.cookies?.[SESSION_COOKIE]);
  if (!userId) throw new AppError(401, "Not authenticated", "Unauthorized");

  // The cookie can be valid while the user row is gone (e.g. the database was
  // reset). One primary-key lookup turns that into a clean 401 instead of a
  // foreign-key error later on.
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new AppError(401, "Not authenticated", "Unauthorized");

  req.userId = user.id;
  next();
}

// bull-board shows (and can retry or delete) EVERY user's jobs, so it is not
// enough to be logged in: the user's email must be listed in ADMIN_EMAILS.
// Runs after requireAuth.
export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const user = await prisma.user.findUnique({ where: { id: getUserId(req) }, select: { email: true } });
  if (!user || !env.ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    throw new AppError(403, "Admins only", "Forbidden");
  }
  next();
}
