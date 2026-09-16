// app/api/student-attempt/approve-pin-reset/route.ts

import "server-only";

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { adminDb } from "@/lib/firebaseAdmin";

import {
  generateStudentPinResetCode,
  hashStudentPinResetCode,
  createStudentPinResetCodeExpiresAt,
} from "@/lib/studentPin";

export const runtime = "nodejs";

/* =========================================================
   Constants
   ========================================================= */

const CREDENTIALS_COLLECTION = "studentAttemptCredentials";
const ATTEMPTS_COLLECTION = "attempts";

const RESET_REQUEST_STATUS_PENDING = "pending";
const RESET_REQUEST_STATUS_APPROVED = "approved";

/* =========================================================
   Types
   ========================================================= */

type ApprovePinResetBody = {
  attemptId?: unknown;
};

type AttemptData = {
  quizId?: string;
  teacherId?: string;

  studentName?: string;
  studentEmail?: string;
  studentEmailNormalized?: string;

  status?: string;
  expiresAt?: string | null;

  pinResetRequested?: boolean;
  pinResetRequestedAt?: string | null;
  pinResetStatus?: string | null;
  pinResetApprovedAt?: string | null;
};

type CredentialData = {
  quizId?: string;
  attemptId?: string;

  studentName?: string;
  studentEmail?: string;
  studentEmailNormalized?: string;

  pinHash?: string;

  pinResetRequested?: boolean;
  pinResetRequestedAt?: string | null;
  pinResetStatus?: string | null;

  resetCodeHash?: string | null;
  resetCodeExpiresAt?: string | null;
  resetCodeFailedAttempts?: number;

  pinResetApprovedAt?: string | null;
  pinResetApprovedBy?: string | null;

  updatedAt?: string;
};

/* =========================================================
   Helpers
   ========================================================= */

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeQuizId(value: string) {
  return value.trim();
}

function normalizeAttemptId(value: string) {
  return value.trim();
}

function isAttemptExpired(
  expiresAt: string | null | undefined
) {
  if (!expiresAt) {
    return false;
  }

  const timestamp = new Date(expiresAt).getTime();

  if (Number.isNaN(timestamp)) {
    return false;
  }

  return timestamp <= Date.now();
}

function errorResponse({
  status,
  messageKey,
  message,
}: {
  status: number;
  messageKey: string;
  message: string;
}) {
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

/* =========================================================
   POST
   ========================================================= */

export async function POST(request: Request) {
  try {
    /* =====================================================
       Authentication
       ===================================================== */

    const { userId } = await auth();

    if (!userId) {
      return errorResponse({
        status: 401,
        messageKey: "attempts.pinReset.teacher.unauthorized",
        message: "Authentication is required.",
      });
    }

    /* =====================================================
       Request body
       ===================================================== */

    let body: ApprovePinResetBody;

    try {
      body = (await request.json()) as ApprovePinResetBody;
    } catch {
      return errorResponse({
        status: 400,
        messageKey: "attempts.pinReset.invalidRequest",
        message: "Invalid request body.",
      });
    }

    if (typeof body.attemptId !== "string") {
      return errorResponse({
        status: 400,
        messageKey: "attempts.pinReset.invalidRequest",
        message: "Attempt ID is required.",
      });
    }

    const attemptId = normalizeAttemptId(body.attemptId);

    if (!attemptId) {
      return errorResponse({
        status: 400,
        messageKey: "attempts.pinReset.invalidRequest",
        message: "Attempt ID is required.",
      });
    }

    /* =====================================================
       Firestore references
       ===================================================== */

    const attemptRef = adminDb
      .collection(ATTEMPTS_COLLECTION)
      .doc(attemptId);

    /*
     * We first load the attempt so we can determine the
     * credential that belongs to it.
     */
    const attemptSnapshot = await attemptRef.get();

    if (!attemptSnapshot.exists) {
      return errorResponse({
        status: 404,
        messageKey: "attempts.pinReset.attemptNotFound",
        message: "Quiz attempt not found.",
      });
    }

    const attempt = attemptSnapshot.data() as AttemptData;

    /* =====================================================
       Teacher ownership
       ===================================================== */

    if (
      !attempt.teacherId ||
      attempt.teacherId !== userId
    ) {
      return errorResponse({
        status: 403,
        messageKey: "attempts.pinReset.teacher.forbidden",
        message:
          "You are not allowed to reset the PIN for this quiz attempt.",
      });
    }

    /* =====================================================
       Attempt state
       ===================================================== */

    if (attempt.status !== "in_progress") {
      return errorResponse({
        status: 409,
        messageKey: "attempts.pinReset.notInProgress",
        message:
          "Only an in-progress quiz attempt can reset its PIN.",
      });
    }

    if (isAttemptExpired(attempt.expiresAt)) {
      return errorResponse({
        status: 409,
        messageKey: "attempts.pinReset.attemptExpired",
        message: "This quiz attempt has expired.",
      });
    }

    /* =====================================================
       Attempt identity
       ===================================================== */

    const quizId = normalizeQuizId(attempt.quizId ?? "");

    const studentEmail = normalizeEmail(
      attempt.studentEmailNormalized ??
        attempt.studentEmail ??
        ""
    );

    if (!quizId || !studentEmail) {
      console.error(
        "Attempt has incomplete student identity.",
        {
          attemptId,
        }
      );

      return errorResponse({
        status: 500,
        messageKey: "attempts.pinReset.invalidAttempt",
        message:
          "The quiz attempt contains incomplete student information.",
      });
    }

    /* =====================================================
       Find credential
       ===================================================== */

    const credentialQuery = await adminDb
      .collection(CREDENTIALS_COLLECTION)
      .where("attemptId", "==", attemptId)
      .limit(2)
      .get();

    if (credentialQuery.empty) {
      return errorResponse({
        status: 404,
        messageKey: "attempts.pinReset.credentialNotFound",
        message: "Student PIN credentials were not found.",
      });
    }

    if (credentialQuery.size !== 1) {
      console.error(
        "Multiple student credentials reference the same attempt.",
        {
          attemptId,
          count: credentialQuery.size,
        }
      );

      return errorResponse({
        status: 409,
        messageKey: "attempts.pinReset.credentialConflict",
        message:
          "Multiple PIN credentials were found for this quiz attempt.",
      });
    }

    const credentialSnapshot = credentialQuery.docs[0];
    const credentialRef = credentialSnapshot.ref;

    /* =====================================================
       Transaction
       ===================================================== */

    const result = await adminDb.runTransaction(
      async (transaction) => {
        /*
         * IMPORTANT:
         * all reads are performed before writes.
         */

        const freshAttemptSnapshot =
          await transaction.get(attemptRef);

        const freshCredentialSnapshot =
          await transaction.get(credentialRef);

        if (!freshAttemptSnapshot.exists) {
          return {
            type: "error" as const,
            status: 404,
            messageKey:
              "attempts.pinReset.attemptNotFound",
            message: "Quiz attempt not found.",
          };
        }

        if (!freshCredentialSnapshot.exists) {
          return {
            type: "error" as const,
            status: 404,
            messageKey:
              "attempts.pinReset.credentialNotFound",
            message:
              "Student PIN credentials were not found.",
          };
        }

        const freshAttempt =
          freshAttemptSnapshot.data() as AttemptData;

        const credential =
          freshCredentialSnapshot.data() as CredentialData;

        /* =================================================
           Recheck teacher
           ================================================= */

        if (
          !freshAttempt.teacherId ||
          freshAttempt.teacherId !== userId
        ) {
          return {
            type: "error" as const,
            status: 403,
            messageKey:
              "attempts.pinReset.teacher.forbidden",
            message:
              "You are not allowed to reset the PIN for this quiz attempt.",
          };
        }

        /* =================================================
           Recheck attempt state
           ================================================= */

        if (freshAttempt.status !== "in_progress") {
          return {
            type: "error" as const,
            status: 409,
            messageKey:
              "attempts.pinReset.notInProgress",
            message:
              "Only an in-progress quiz attempt can reset its PIN.",
          };
        }

        if (isAttemptExpired(freshAttempt.expiresAt)) {
          return {
            type: "error" as const,
            status: 409,
            messageKey:
              "attempts.pinReset.attemptExpired",
            message: "This quiz attempt has expired.",
          };
        }

        /* =================================================
           Verify credential identity
           ================================================= */

        const credentialAttemptId =
          typeof credential.attemptId === "string"
            ? credential.attemptId.trim()
            : "";

        const credentialQuizId =
          normalizeQuizId(credential.quizId ?? "");

        const credentialEmail =
          normalizeEmail(
            credential.studentEmailNormalized ??
              credential.studentEmail ??
              ""
          );

        if (
          credentialAttemptId !== attemptId ||
          credentialQuizId !== quizId ||
          credentialEmail !== studentEmail
        ) {
          console.error(
            "Student credential identity mismatch during PIN reset approval.",
            {
              attemptId,
              credentialId:
                freshCredentialSnapshot.id,
            }
          );

          return {
            type: "error" as const,
            status: 409,
            messageKey:
              "attempts.pinReset.credentialMismatch",
            message:
              "The student PIN credential does not match this quiz attempt.",
          };
        }

        /* =================================================
           Pending request required
           ================================================= */

        if (
          credential.pinResetRequested !== true ||
          credential.pinResetStatus !==
            RESET_REQUEST_STATUS_PENDING
        ) {
          if (
            credential.pinResetRequested === true &&
            credential.pinResetStatus ===
              RESET_REQUEST_STATUS_APPROVED
          ) {
            return {
              type: "error" as const,
              status: 409,
              messageKey:
                "attempts.pinReset.alreadyApproved",
              message:
                "This PIN reset request has already been approved.",
            };
          }

          return {
            type: "error" as const,
            status: 409,
            messageKey:
              "attempts.pinReset.noPendingRequest",
            message:
              "There is no pending PIN reset request for this student.",
          };
        }

        /* =================================================
           Generate temporary reset code
           ================================================= */

        const resetCode =
          generateStudentPinResetCode();

        const resetCodeHash =
          hashStudentPinResetCode({
            code: resetCode,
            quizId,
            studentEmail,
          });

        const resetCodeExpiresAt =
          createStudentPinResetCodeExpiresAt();

        const now = new Date().toISOString();

        /* =================================================
           Update PRIVATE credential
           ================================================= */

        transaction.update(credentialRef, {
          pinResetRequested: true,
          pinResetStatus:
            RESET_REQUEST_STATUS_APPROVED,

          resetCodeHash,
          resetCodeExpiresAt,
          resetCodeFailedAttempts: 0,

          pinResetApprovedAt: now,
          pinResetApprovedBy: userId,

          updatedAt: now,
        });

        /* =================================================
           IMPORTANT FIX:
           Mirror approval on PUBLIC attempt.

           StudentsPage listens to "attempts", not to
           "studentAttemptCredentials".
           ================================================= */

        transaction.update(attemptRef, {
          pinResetRequested: true,
          pinResetStatus:
            RESET_REQUEST_STATUS_APPROVED,

          pinResetRequestedAt:
            freshAttempt.pinResetRequestedAt ??
            credential.pinResetRequestedAt ??
            now,

          pinResetApprovedAt: now,

          updatedAt: now,
        });

        return {
          type: "success" as const,

          attemptId,

          studentName:
            freshAttempt.studentName ??
            credential.studentName ??
            "",

          resetCode,

          resetCodeExpiresAt,
        };
      }
    );

    /* =====================================================
       Transaction error
       ===================================================== */

    if (result.type === "error") {
      return errorResponse({
        status: result.status,
        messageKey: result.messageKey,
        message: result.message,
      });
    }

    /* =====================================================
       Success
       ===================================================== */

    return NextResponse.json(
      {
        success: true,

        status:
          RESET_REQUEST_STATUS_APPROVED,

        attemptId: result.attemptId,

        studentName:
          result.studentName,

        /*
         * Plaintext temporary code is returned exactly once.
         * Firestore only contains its hash.
         */
        resetCode:
          result.resetCode,

        expiresAt:
          result.resetCodeExpiresAt,

        messageKey:
          "attempts.pinReset.teacher.approved",

        message:
          "The temporary PIN reset code was generated successfully.",
      },
      {
        status: 200,

        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
        },
      }
    );
  } catch (error) {
    console.error(
      "Unable to approve student PIN reset:",
      error
    );

    return errorResponse({
      status: 500,
      messageKey:
        "attempts.pinReset.serverError",
      message:
        "Unable to approve the PIN reset request.",
    });
  }
}