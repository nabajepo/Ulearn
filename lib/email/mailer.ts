import "server-only";

import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;

if (!apiKey) {
  throw new Error("RESEND_API_KEY is missing.");
}

const resend = new Resend(apiKey);

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
  idempotencyKey?: string;
};

function normalizeRecipients(recipients: string | string[]) {
  const values = Array.isArray(recipients) ? recipients : [recipients];

  return values
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  attachments = [],
  idempotencyKey,
}: SendEmailInput) {
  const recipients = normalizeRecipients(to);

  if (recipients.length === 0) {
    throw new Error("At least one recipient email is required.");
  }

  const { data, error } = await resend.emails.send(
    {
      // Temporary sender while developing ULearn.
      // Later we will replace this with your verified ULearn domain.
      from: "ULearn <onboarding@resend.dev>",
      to: recipients,
      subject,
      html,
      text,
      attachments:
        attachments.length > 0
          ? attachments
          : undefined,
    },
    idempotencyKey
      ? {
          idempotencyKey,
        }
      : undefined
  );

  if (error) {
    console.error("Resend email error:", error);

    throw new Error(
      error.message || "Unable to send email."
    );
  }

  return {
    success: true,
    id: data?.id ?? null,
  };
}