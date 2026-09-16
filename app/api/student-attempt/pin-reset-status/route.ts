import "server-only";

import { createHmac } from "crypto";
import { NextResponse } from "next/server";

import { adminDb } from "@/lib/firebaseAdmin";

type RequestBody = {
  quizId?: unknown;
  studentEmail?: unknown;
};

type CredentialData = {
  quizId?: string;
  studentEmailNormalized?: string;
  attemptId?: string;
  pinResetStatus?: "pending" | "approved" | null;
  resetCodeHash?: string | null;
  resetCodeExpiresAt?: string | null;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function getSecret() {
  const secret = process.env.STUDENT_VERIFICATION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "STUDENT_VERIFICATION_SECRET is missing or too short."
    );
  }

  return secret;
}

function getCredentialId(quizId: string, studentEmail: string) {
  return createHmac("sha256", getSecret())
    .update(
      `ulearn-student-attempt-credential-v1:${quizId}:${studentEmail}`
    )
    .digest("hex");
}

function noStoreJson(
  body: Record<string, unknown>,
  status = 200
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;

    const quizId =
      typeof body.quizId === "string"
        ? body.quizId.trim()
        : "";

    const studentEmail =
      typeof body.studentEmail === "string"
        ? normalizeEmail(body.studentEmail)
        : "";

    if (
      !quizId ||
      !studentEmail ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(studentEmail)
    ) {
      return noStoreJson(
        {
          success: false,
          messageKey: "attempts.pinReset.invalidIdentity",
          message: "Invalid quiz or student email.",
        },
        400
      );
    }

    const credentialId = getCredentialId(
      quizId,
      studentEmail
    );

    const credentialRef = adminDb
      .collection("studentAttemptCredentials")
      .doc(credentialId);

    const credentialSnapshot = await credentialRef.get();

    if (!credentialSnapshot.exists) {
      return noStoreJson(
        {
          success: false,
          messageKey: "attempts.pinReset.noActiveAttempt",
          message: "No active attempt was found.",
        },
        404
      );
    }

    const credential =
      credentialSnapshot.data() as CredentialData;

    if (
      credential.quizId !== quizId ||
      credential.studentEmailNormalized !== studentEmail ||
      !credential.attemptId
    ) {
      return noStoreJson(
        {
          success: false,
          messageKey: "attempts.pinReset.noActiveAttempt",
          message: "No active attempt was found.",
        },
        404
      );
    }

    const attemptRef = adminDb
      .collection("attempts")
      .doc(credential.attemptId);

    const attemptSnapshot = await attemptRef.get();

    if (!attemptSnapshot.exists) {
      return noStoreJson(
        {
          success: false,
          messageKey: "attempts.pinReset.noActiveAttempt",
          message: "No active attempt was found.",
        },
        404
      );
    }

    const attempt = attemptSnapshot.data() as {
      quizId?: string;
      studentEmail?: string;
      studentEmailNormalized?: string;
      status?: string;
      expiresAt?: string | null;
    };

    const attemptEmail = normalizeEmail(
      attempt.studentEmailNormalized ??
        attempt.studentEmail ??
        ""
    );

    if (
      attempt.quizId !== quizId ||
      attemptEmail !== studentEmail
    ) {
      return noStoreJson(
        {
          success: false,
          messageKey: "attempts.pinReset.noActiveAttempt",
          message: "No active attempt was found.",
        },
        404
      );
    }

    if (attempt.status !== "in_progress") {
      return noStoreJson(
        {
          success: false,
          messageKey: "attempts.pinReset.notInProgress",
          message: "This attempt is no longer in progress.",
        },
        409
      );
    }

    if (
      attempt.expiresAt &&
      new Date(attempt.expiresAt).getTime() <= Date.now()
    ) {
      return noStoreJson(
        {
          success: false,
          messageKey: "attempts.pinReset.attemptExpired",
          message: "This attempt has expired.",
        },
        410
      );
    }

    let status =
      credential.pinResetStatus === "pending" ||
      credential.pinResetStatus === "approved"
        ? credential.pinResetStatus
        : null;

    if (status === "approved") {
      const expiresAt = credential.resetCodeExpiresAt;
      const usableCode =
        Boolean(credential.resetCodeHash) &&
        Boolean(expiresAt) &&
        new Date(expiresAt as string).getTime() > Date.now();

      if (!usableCode) {
        status = null;
      }
    }

    return noStoreJson({
      success: true,
      status,
      attemptId: credential.attemptId,
    });
  } catch (error) {
    console.error("Unable to read PIN reset status:", error);

    return noStoreJson(
      {
        success: false,
        messageKey: "attempts.pinReset.error",
        message: "Unable to read PIN reset status.",
      },
      500
    );
  }
}
