import type { Request } from "express";
import { AppError } from "./AppError";

// Route handlers call this instead of reading req.userId directly, so a missing
// auth middleware results in a clean 401 rather than queries with userId=undefined.
export function getUserId(req: Request): string {
  if (!req.userId) throw new AppError(401, "Not authenticated", "Unauthorized");
  return req.userId;
}
