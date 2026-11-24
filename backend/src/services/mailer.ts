import nodemailer, { type Transporter } from "nodemailer";
import type { Sender } from "@prisma/client";

// One pooled SMTP transporter per sender, created on first use and reused.
// pool: true keeps SMTP connections open, so we don't pay a TCP + TLS
// handshake + login for every single email.
const transporters = new Map<string, Transporter>();

export function getTransporter(sender: Sender): Transporter {
  let transporter = transporters.get(sender.id);
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: sender.smtpHost,
      port: sender.smtpPort,
      secure: sender.smtpPort === 465, // 465 = implicit TLS; 587 (Ethereal) upgrades via STARTTLS
      auth: { user: sender.smtpUser, pass: sender.smtpPass },
      pool: true,
    });
    transporters.set(sender.id, transporter);
  }
  return transporter;
}

export function closeTransporters(): void {
  for (const transporter of transporters.values()) transporter.close();
  transporters.clear();
}

// Deterministic: the same email row always produces the same Message-ID.
// If a duplicate ever slipped through, receiving servers/clients could
// recognise it as the same message.
export function buildMessageId(emailId: string, senderAddress: string): string {
  const domain = senderAddress.split("@")[1] ?? "outbox.local";
  return `<${emailId}@${domain}>`;
}
