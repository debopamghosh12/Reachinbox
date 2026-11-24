// Email/password signup and login. Uses the same session cookie as Google login.
// SECURITY: passwords and hashes are never logged or returned.
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";
import type { LoginInput, SignupInput } from "../schemas/auth.schemas";

const INVALID = () => new AppError(401, "Invalid email or password", "InvalidCredentials");

// When the email is unknown (or the account has no password), we still run one
// bcrypt comparison against this throwaway hash, so the response takes about
// as long as a real wrong password. Otherwise timing would reveal which emails exist.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= bcrypt.hash("not-a-real-password", env.BCRYPT_COST));

export async function signup({ name, email, password }: SignupInput) {
  const existing = await prisma.user.findUnique({ where: { email }, select: { googleId: true } });
  if (existing?.googleId) {
    // Never attach a password to a Google account: that would let whoever
    // knows the email take it over. The owner logs in with Google instead.
    throw new AppError(409, 'This email is registered with Google. Use "Login with Google".', "GoogleAccount");
  }
  if (existing) throw new AppError(409, "An account with this email already exists. Log in instead.", "EmailTaken");

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_COST);
  try {
    return await prisma.user.create({ data: { name, email, passwordHash } });
  } catch (err) {
    // Two signups for the same email at the same moment: the unique index decides.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, "An account with this email already exists. Log in instead.", "EmailTaken");
    }
    throw err;
  }
}

export async function login({ email, password }: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email } });
  // Unknown email, Google-only account and wrong password all get the same
  // answer (and roughly the same timing): no user enumeration.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? (await getDummyHash()));
  if (!user?.passwordHash || !ok) throw INVALID();
  return user;
}
