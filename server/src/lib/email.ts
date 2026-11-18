import nodemailer, { type Transporter } from "nodemailer";

import type { Env } from "../env.js";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

/**
 * SMTP mailer (AWS SES SMTP, Postmark, Resend, Mailgun...). Sending never
 * throws: the caller gets `false` and the user's action still succeeds,
 * exactly like the old edge function's "accepted, but the email failed".
 */
export function createMailer(env: Env, log: { warn: (o: object, m: string) => void; info: (o: object, m: string) => void }) {
  let transport: Transporter | null = null;
  if (env.SMTP_URL) {
    transport = nodemailer.createTransport({
      url: env.SMTP_URL,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    } as Parameters<typeof nodemailer.createTransport>[0]);
  }

  return {
    enabled: transport !== null,
    async send(mail: Mail): Promise<boolean> {
      if (!transport) {
        log.info({ to: mail.to, subject: mail.subject }, "email not sent: SMTP_URL is not configured");
        return false;
      }
      try {
        await transport.sendMail({ from: env.EMAIL_FROM, ...mail });
        return true;
      } catch (err) {
        log.warn({ err, subject: mail.subject }, "email send failed");
        return false;
      }
    },
  };
}

export type Mailer = ReturnType<typeof createMailer>;

/** Minimal HTML escaping for values interpolated into email bodies. */
export function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
