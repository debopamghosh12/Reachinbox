-- Email/password login next to Google: password-only users have no google_id.
ALTER TABLE "users" ALTER COLUMN "google_id" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN "password_hash" TEXT;
