-- Marks emails "sent" while SMTP_DRY_RUN=true: no SMTP call was made, so the
-- UI can label them as simulated instead of implying a real delivery.
ALTER TABLE "emails" ADD COLUMN "simulated" BOOLEAN NOT NULL DEFAULT false;
