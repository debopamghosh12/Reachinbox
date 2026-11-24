import { z } from "zod";

const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address"));

// bcrypt only uses the first 72 bytes of a password and silently ignores the
// rest, so longer passwords are rejected instead of being cut short.
const newPassword = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .refine((p) => Buffer.byteLength(p, "utf8") <= 72, "Password must be at most 72 bytes");

export const signupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(100, "Name is too long"),
  email,
  password: newPassword,
});

export const loginSchema = z.object({
  email,
  // No length rules on login: any wrong value just gets "Invalid email or password".
  password: z.string().min(1, "Enter your password").max(1024),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
