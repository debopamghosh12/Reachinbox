// =====================================================================
// TODO(Phase 4): DELETE THIS FILE. Temporary stand-in for Google OAuth.
// Every request is treated as one hardcoded dev user so the schedule/list
// APIs can be built and tested before real auth exists.
// =====================================================================
import type { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma";

const DEV_USER = {
  googleId: "dev-user",
  email: "dev@outbox.local",
  name: "Dev User",
};

let devUserId: string | null = null;

// Called once on server boot.
export async function ensureDevUser(): Promise<void> {
  const user = await prisma.user.upsert({
    where: { googleId: DEV_USER.googleId },
    update: {},
    create: DEV_USER,
  });
  devUserId = user.id;
}

export function devUser(req: Request, _res: Response, next: NextFunction) {
  if (devUserId) req.userId = devUserId;
  next();
}
