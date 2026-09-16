// app/api/student-attempt/request-pin-reset/route.ts
import "server-only";

import { createHmac } from "crypto";
import { NextResponse } from "next/server";

import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

const CREDENTIALS_COLLECTION = "studentAttemptCredentials";
const ATTEMPTS_COLLECTION = "attempts";

const CANONICAL_CREDENTIAL_DOMAIN =
  "ulearn-student-attempt-credential-v1";

/**
 * Compatibility only:
 * the old start route used this domain. Existing local test credentials
 * can therefore still be found and migrated automatically.
 */
const LEGACY_CREDENTIAL_DOMAIN =
  "ulearn-student-attempt-identity-v1";

const RESET_PENDING = "pending";
const RESET_APPROVED = "approved";

type RequestPinResetBody = {
  quizId?: unknown;
  studentEmail?: unknown;
};

type CredentialData = {
  quizId?: string;
  attemptId?: string;
  studentEmail?: string;
  studentEmailNormalized?: string;
  pinHash?: string;
  failedAttempts?: number;
  lockedUntil?: string | null;
  pinResetRequired?: boolean;
  pinResetRequested?: boolean;
  pinResetRequestedAt?: string | null;
  pinResetStatus?: string | null;
  resetCodeHash?: string | null;
  resetCodeExpiresAt?: string | null;
  resetCodeFailedAttempts?: number;
  pinResetApprovedAt?: string | null;
  pinResetApprovedBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type AttemptData = {
  quizId?: string;
  studentEmail?: string;
  studentEmailNormalized?: string;
  status?: string;
  expiresAt?: string | null;
  pinResetRequested?: boolean;
  pinResetStatus?: string | null;
  pinResetRequestedAt?: string | null;
  pinResetApprovedAt?: string | null;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeQuizId(value: string) {
  return value.trim();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getStudentVerificationSecret() {
  const secret = process.env.STUDENT_VERIFICATION_SECRET;

  if (!secret) {
    throw new Error("STUDENT_VERIFICATION_SECRET is missing.");
  }

  if (secret.length < 32) {
    throw new Error(
      "STUDENT_VERIFICATION_SECRET must contain at least 32 characters."
    );
  }

  return secret;
}

function getCredentialDocumentId({
  domain,
  quizId,
  studentEmail,
}: {
  domain: string;
  quizId: string;
  studentEmail: string;
}) {
  const value = [
    domain,
    normalizeQuizId(quizId),
    normalizeEmail(studentEmail),
  ].join(":");

  return createHmac("sha256", getStudentVerificationSecret())
    .update(value)
    .digest("hex");
}

function isDateExpired(value: string | null | undefined) {
  if (!value) return false;

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) return false;

  return timestamp <= Date.now();
}

function errorResponse(
  status: number,
  messageKey: string,
  message: string
) {
  return NextResponse.json(
    {
      success: false,
      messageKey,
      message,
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    }
  );
}

function successResponse({
  status,
  attemptId,
  messageKey,
  message,
}: {
  status: typeof RESET_PENDING | typeof RESET_APPROVED;
  attemptId: string;
  messageKey: string;
  message: string;
}) {
  return NextResponse.json(
    {
      success: true,
      status,
      attemptId,
      messageKey,
      message,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    }
  );
}

export async function POST(request: Request) {
  try {
    let body: RequestPinResetBody;

    try {
      body = (await request.json()) as RequestPinResetBody;
    } catch {
      return errorResponse(
        400,
        "attempts.pinReset.invalidRequest",
        "Invalid request body."
      );
    }

    if (
      typeof body.quizId !== "string" ||
      typeof body.studentEmail !== "string"
    ) {
      return errorResponse(
        400,
        "attempts.pinReset.invalidRequest",
        "Quiz ID and student email are required."
      );
    }

    const quizId = normalizeQuizId(body.quizId);
    const studentEmail = normalizeEmail(body.studentEmail);

    if (!quizId || !studentEmail) {
      return errorResponse(
        400,
        "attempts.pinReset.invalidRequest",
        "Quiz ID and student email are required."
      );
    }

    if (!isValidEmail(studentEmail)) {
      return errorResponse(
        400,
        "attempts.pinReset.invalidEmail",
        "A valid student email address is required."
      );
    }

    const canonicalId = getCredentialDocumentId({
      domain: CANONICAL_CREDENTIAL_DOMAIN,
      quizId,
      studentEmail,
    });

    const legacyId = getCredentialDocumentId({
      domain: LEGACY_CREDENTIAL_DOMAIN,
      quizId,
      studentEmail,
    });

    const canonicalRef = adminDb
      .collection(CREDENTIALS_COLLECTION)
      .doc(canonicalId);

    const legacyRef = adminDb
      .collection(CREDENTIALS_COLLECTION)
      .doc(legacyId);

    const result = await adminDb.runTransaction(async (transaction) => {
      /*
       * Firestore transactions require reads before writes.
       * Read both possible credential IDs first.
       */
      const canonicalSnapshot = await transaction.get(canonicalRef);
      const legacySnapshot =
        canonicalId === legacyId
          ? canonicalSnapshot
          : await transaction.get(legacyRef);

      let credentialRef = canonicalRef;
      let credentialSnapshot = canonicalSnapshot;
      let mustMigrateLegacyCredential = false;

      if (!canonicalSnapshot.exists && legacySnapshot.exists) {
        credentialRef = legacyRef;
        credentialSnapshot = legacySnapshot;
        mustMigrateLegacyCredential = true;
      }

      if (!credentialSnapshot.exists) {
        return {
          type: "error" as const,
          httpStatus: 404,
          messageKey: "attempts.pinReset.noActiveAttempt",
          message:
            "No active quiz attempt was found for this email address.",
        };
      }

      const credential =
        credentialSnapshot.data() as CredentialData;

      const credentialQuizId = normalizeQuizId(
        credential.quizId ?? ""
      );

      const credentialEmail = normalizeEmail(
        credential.studentEmailNormalized ??
          credential.studentEmail ??
          ""
      );

      if (
        credentialQuizId !== quizId ||
        credentialEmail !== studentEmail
      ) {
        return {
          type: "error" as const,
          httpStatus: 404,
          messageKey: "attempts.pinReset.noActiveAttempt",
          message:
            "No active quiz attempt was found for this email address.",
        };
      }

      const attemptId =
        typeof credential.attemptId === "string"
          ? credential.attemptId.trim()
          : "";

      if (!attemptId) {
        return {
          type: "error" as const,
          httpStatus: 404,
          messageKey: "attempts.pinReset.noActiveAttempt",
          message:
            "No active quiz attempt was found for this email address.",
        };
      }

      const attemptRef = adminDb
        .collection(ATTEMPTS_COLLECTION)
        .doc(attemptId);

      const attemptSnapshot = await transaction.get(attemptRef);

      if (!attemptSnapshot.exists) {
        return {
          type: "error" as const,
          httpStatus: 404,
          messageKey: "attempts.pinReset.noActiveAttempt",
          message:
            "No active quiz attempt was found for this email address.",
        };
      }

      const attempt = attemptSnapshot.data() as AttemptData;

      const attemptQuizId = normalizeQuizId(attempt.quizId ?? "");
      const attemptEmail = normalizeEmail(
        attempt.studentEmailNormalized ??
          attempt.studentEmail ??
          ""
      );

      if (
        attemptQuizId !== quizId ||
        attemptEmail !== studentEmail
      ) {
        return {
          type: "error" as const,
          httpStatus: 404,
          messageKey: "attempts.pinReset.noActiveAttempt",
          message:
            "No active quiz attempt was found for this email address.",
        };
      }

      if (attempt.status !== "in_progress") {
        return {
          type: "error" as const,
          httpStatus: 409,
          messageKey: "attempts.pinReset.notInProgress",
          message:
            "Only an in-progress quiz attempt can request a PIN reset.",
        };
      }

      if (isDateExpired(attempt.expiresAt)) {
        return {
          type: "error" as const,
          httpStatus: 409,
          messageKey: "attempts.pinReset.attemptExpired",
          message: "This quiz attempt has expired.",
        };
      }

      const now = new Date().toISOString();

      let nextStatus: typeof RESET_PENDING | typeof RESET_APPROVED =
        RESET_PENDING;
      let nextRequestedAt =
        credential.pinResetRequestedAt ??
        attempt.pinResetRequestedAt ??
        now;
      let nextApprovedAt: string | null = null;

      const approvedCodeIsUsable =
        credential.pinResetRequested === true &&
        credential.pinResetStatus === RESET_APPROVED &&
        typeof credential.resetCodeHash === "string" &&
        credential.resetCodeHash.length > 0 &&
        typeof credential.resetCodeExpiresAt === "string" &&
        !isDateExpired(credential.resetCodeExpiresAt);

      if (approvedCodeIsUsable) {
        nextStatus = RESET_APPROVED;
        nextApprovedAt =
          credential.pinResetApprovedAt ??
          attempt.pinResetApprovedAt ??
          null;
      } else if (
        !(
          credential.pinResetRequested === true &&
          credential.pinResetStatus === RESET_PENDING
        )
      ) {
        nextRequestedAt = now;
      }

      const nextCredential: CredentialData = {
        ...credential,
        quizId,
        attemptId,
        studentEmailNormalized: studentEmail,
        pinResetRequested: true,
        pinResetRequestedAt: nextRequestedAt,
        pinResetStatus: nextStatus,
        resetCodeHash:
          nextStatus === RESET_APPROVED
            ? credential.resetCodeHash ?? null
            : null,
        resetCodeExpiresAt:
          nextStatus === RESET_APPROVED
            ? credential.resetCodeExpiresAt ?? null
            : null,
        resetCodeFailedAttempts:
          nextStatus === RESET_APPROVED
            ? credential.resetCodeFailedAttempts ?? 0
            : 0,
        pinResetApprovedAt: nextApprovedAt,
        pinResetApprovedBy:
          nextStatus === RESET_APPROVED
            ? credential.pinResetApprovedBy ?? null
            : null,
        updatedAt: now,
      };

      /*
       * Migration of credentials created by the old start route.
       * After this request all other reset routes can use the canonical ID.
       */
      if (mustMigrateLegacyCredential) {
        transaction.set(canonicalRef, nextCredential);
        transaction.delete(legacyRef);
      } else {
        transaction.set(canonicalRef, nextCredential, { merge: true });
      }

      transaction.update(attemptRef, {
        studentEmailNormalized: studentEmail,
        pinResetRequested: true,
        pinResetStatus: nextStatus,
        pinResetRequestedAt: nextRequestedAt,
        pinResetApprovedAt: nextApprovedAt,
        updatedAt: now,
      });

      if (nextStatus === RESET_APPROVED) {
        return {
          type: "success" as const,
          status: RESET_APPROVED,
          attemptId,
          messageKey: "attempts.pinReset.alreadyApproved",
          message:
            "The professor has already approved this PIN reset request.",
        };
      }

      const alreadyPending =
        credential.pinResetRequested === true &&
        credential.pinResetStatus === RESET_PENDING;

      return {
        type: "success" as const,
        status: RESET_PENDING,
        attemptId,
        messageKey: alreadyPending
          ? "attempts.pinReset.alreadyPending"
          : "attempts.pinReset.requested",
        message: alreadyPending
          ? "A PIN reset request is already waiting for the professor."
          : "The PIN reset request was sent to the professor.",
      };
    });

    if (result.type === "error") {
      return errorResponse(
        result.httpStatus,
        result.messageKey,
        result.message
      );
    }

    return successResponse({
      status: result.status,
      attemptId: result.attemptId,
      messageKey: result.messageKey,
      message: result.message,
    });
  } catch (error) {
    console.error("Unable to request student PIN reset:", error);

    return errorResponse(
      500,
      "attempts.pinReset.serverError",
      "Unable to request a PIN reset."
    );
  }
}
