import fs from "node:fs";
import path from "node:path";
import type { ReactElement } from "react";
import { render } from "react-email";
import { getStoreEmailFrom, isStoreEmailFromFallback } from "@/lib/store";

interface SendEmailOptions {
  to: string;
  subject: string;
  react: ReactElement;
  from?: string;
}

type EmailProvider = "gmail" | "resend";

const isDev = process.env.NODE_ENV === "development";

function emailProvider(): EmailProvider | null {
  const configured = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (configured === "gmail" || configured === "resend") return configured;
  if (configured) {
    throw new Error(
      `Unsupported EMAIL_PROVIDER "${configured}". Use "gmail" or "resend".`,
    );
  }

  if (
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.GMAIL_REFRESH_TOKEN
  ) {
    return "gmail";
  }
  if (process.env.RESEND_API_KEY) return "resend";
  return null;
}

export async function sendEmail({
  to,
  subject,
  react,
  from,
}: SendEmailOptions) {
  const provider = emailProvider();

  if (isDev && !provider) {
    await sendEmailDev({ to, subject, react, from });
    return;
  }

  if (provider === "gmail") {
    await sendEmailGmail({ to, subject, react, from });
    return;
  }

  if (provider === "resend") {
    await sendEmailResend({ to, subject, react, from });
    return;
  }

  throw new Error(
    "No email provider configured. Set EMAIL_PROVIDER=gmail with Gmail OAuth secrets, or configure RESEND_API_KEY.",
  );
}

/**
 * Dev mode: render email to HTML, log summary to console,
 * and write the HTML file to .next/emails/ for browser preview.
 */
async function sendEmailDev({ to, subject, react }: SendEmailOptions) {
  const html = await render(react);

  const dir = path.join(process.cwd(), ".next", "emails");
  fs.mkdirSync(dir, { recursive: true });

  const slug = subject.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
  const timestamp = Date.now();
  const filename = `${slug}-${timestamp}.html`;
  const filepath = path.join(dir, filename);

  fs.writeFileSync(filepath, html);

  console.log("\n╭──────────────────────────────────────────────");
  console.log("│ 📧 Email Preview (dev mode — not sent)");
  console.log("├──────────────────────────────────────────────");
  console.log(`│ To:      ${to}`);
  console.log(`│ Subject: ${subject}`);
  console.log(`│ Preview: file://${filepath}`);
  console.log("╰──────────────────────────────────────────────\n");
}

function requiredGmailSecret(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing Gmail configuration: ${name}`);
  return value;
}

function safeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function encodeMimeHeader(value: string): string {
  const sanitized = safeHeader(value);
  if (/^[\x20-\x7E]*$/.test(sanitized)) return sanitized;
  return `=?UTF-8?B?${Buffer.from(sanitized, "utf8").toString("base64")}?=`;
}

function wrapBase64(value: string): string {
  return value.match(/.{1,76}/g)?.join("\r\n") ?? value;
}

async function gmailAccessToken(): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requiredGmailSecret("GMAIL_CLIENT_ID"),
      client_secret: requiredGmailSecret("GMAIL_CLIENT_SECRET"),
      refresh_token: requiredGmailSecret("GMAIL_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    const detail =
      payload.error_description || payload.error || `HTTP ${response.status}`;
    throw new Error(`Gmail OAuth refresh failed: ${detail}`);
  }

  return payload.access_token;
}

/**
 * Production Gmail transport.
 *
 * Uses the Gmail API over HTTPS and an OAuth refresh token with the minimal
 * gmail.send scope. No Gmail password is stored or used by the storefront.
 */
async function sendEmailGmail({ to, subject, react, from }: SendEmailOptions) {
  const html = await render(react);
  const fromAddress = from || getStoreEmailFrom();

  if (!from && isStoreEmailFromFallback()) {
    throw new Error(
      "EMAIL_FROM must be configured when EMAIL_PROVIDER=gmail.",
    );
  }

  const mime = [
    `From: ${safeHeader(fromAddress)}`,
    `To: ${safeHeader(to)}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(Buffer.from(html, "utf8").toString("base64")),
  ].join("\r\n");

  const accessToken = await gmailAccessToken();
  const raw = Buffer.from(mime, "utf8").toString("base64url");

  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ raw }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 800);
    throw new Error(
      `Gmail send failed (HTTP ${response.status}): ${detail}`,
    );
  }
}

/**
 * Production fallback: send via Resend API.
 */
async function sendEmailResend({ to, subject, react, from }: SendEmailOptions) {
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromAddress = from || getStoreEmailFrom();

  if (!from && isStoreEmailFromFallback()) {
    console.warn(
      "[email] EMAIL_FROM is not set — using fallback 'orders@example.com' which will likely be rejected by Resend",
    );
  }

  const { error } = await resend.emails.send({
    from: fromAddress,
    to,
    subject,
    react,
  });

  if (error) {
    console.error("[email] Failed to send:", error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
}
