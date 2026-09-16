// app/api/student-attempt/start/route.ts

import "server-only";

import { createHmac } from "crypto";
import { NextResponse } from "next/server";

import { adminDb } from "@/lib/firebaseAdmin";

import {
  createStudentPinLockUntil,
  getStudentPinLockRemainingSeconds,
  hashStudentPin,
  isStudentPinLocked,
  isValidStudentPin,
  MAX_STUDENT_PIN_ATTEMPTS,
  normalizeStudentPin,
  verifyStudentPin,
} from "@/lib/studentPin";

import { startAttempt } from "@/lib/services/attempts";

/* =========================================================
   Configuration
   ========================================================= */

export const runtime = "nodejs";

const ATTEMPTS_COLLECTION = "attempts";

const CREDENTIALS_COLLECTION =
  "studentAttemptCredentials";

const MAX_STUDENT_NAME_LENGTH = 120;

const MAX_STUDENT_EMAIL_LENGTH = 200;

/* =========================================================
   Request
   ========================================================= */

type StartStudentAttemptRequest = {
  quizId?: unknown;
  studentName?: unknown;
  studentEmail?: unknown;
  pin?: unknown;
};

/* =========================================================
   Response helpers
   ========================================================= */

function errorResponse(
  messageKey: string,
  message: string,
  status: number,
  extra?: Record<string, unknown>
) {
  return NextResponse.json(
    {
      success: false,
      attemptId: null,
      resumed: false,
      messageKey,
      message,
      ...(extra ?? {}),
    },
    {
      status,
    }
  );
}

function successResponse({
  attemptId,
  resumed,
  messageKey,
  message,
}: {
  attemptId: string;
  resumed: boolean;
  messageKey: string;
  message: string;
}) {
  return NextResponse.json({
    success: true,
    attemptId,
    resumed,
    messageKey,
    message,
  });
}

/* =========================================================
   Normalization
   ========================================================= */

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeName(value: string) {
  return value.trim();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email
  );
}

/* =========================================================
   Server secret
   ========================================================= */

function getStudentVerificationSecret() {
  const secret =
    process.env.STUDENT_VERIFICATION_SECRET;

  if (!secret) {
    throw new Error(
      "STUDENT_VERIFICATION_SECRET is missing."
    );
  }

  if (secret.length < 32) {
    throw new Error(
      "STUDENT_VERIFICATION_SECRET must contain at least 32 characters."
    );
  }

  return secret;
}

/* =========================================================
   Deterministic credential ID

   Same quiz + same normalized email always produces
   the same private credential document ID.

   IMPORTANT:
   All PIN/reset routes must use the same domain:
   ulearn-student-attempt-credential-v1
   ========================================================= */

function createStudentCredentialId({
  quizId,
  studentEmail,
}: {
  quizId: string;
  studentEmail: string;
}) {
  const secret =
    getStudentVerificationSecret();

  const value = [
    "ulearn-student-attempt-credential-v1",
    quizId,
    normalizeEmail(studentEmail),
  ].join(":");

  return createHmac("sha256", secret)
    .update(value)
    .digest("hex");
}

/* =========================================================
   Credential
   ========================================================= */

type StudentAttemptCredential = {
  attemptId: string;

  quizId: string;

  studentEmailNormalized: string;

  pinHash: string;

  failedAttempts: number;

  lockedUntil: string | null;

  pinResetRequired: boolean;

  createdAt: string;

  updatedAt: string;
};

/* =========================================================
   Safe credential mapping
   ========================================================= */

function mapCredential(
  data: FirebaseFirestore.DocumentData
): StudentAttemptCredential | null {
  if (
    typeof data.attemptId !== "string" ||
    typeof data.quizId !== "string" ||
    typeof data.studentEmailNormalized !==
      "string" ||
    typeof data.pinHash !== "string"
  ) {
    return null;
  }

  return {
    attemptId: data.attemptId,

    quizId: data.quizId,

    studentEmailNormalized:
      data.studentEmailNormalized,

    pinHash: data.pinHash,

    failedAttempts:
      typeof data.failedAttempts === "number" &&
      Number.isInteger(data.failedAttempts) &&
      data.failedAttempts >= 0
        ? data.failedAttempts
        : 0,

    lockedUntil:
      typeof data.lockedUntil === "string"
        ? data.lockedUntil
        : null,

    pinResetRequired:
      data.pinResetRequired === true,

    createdAt:
      typeof data.createdAt === "string"
        ? data.createdAt
        : "",

    updatedAt:
      typeof data.updatedAt === "string"
        ? data.updatedAt
        : "",
  };
}

/* =========================================================
   Existing attempt validation
   ========================================================= */

function validateExistingAttempt(
  data: FirebaseFirestore.DocumentData
) {
  const status =
    typeof data.status === "string"
      ? data.status
      : "";

  if (status === "submitted") {
    return {
      success: false as const,
      status: 409,
      messageKey:
        "attempts.start.alreadySubmitted",
      message:
        "You have already submitted this quiz.",
    };
  }

  if (status === "graded") {
    return {
      success: false as const,
      status: 409,
      messageKey:
        "attempts.start.alreadyGraded",
      message:
        "This quiz attempt has already been graded.",
    };
  }

  if (status !== "in_progress") {
    return {
      success: false as const,
      status: 409,
      messageKey:
        "attempts.start.invalidStatus",
      message:
        "This quiz attempt cannot be resumed.",
    };
  }

  const expiresAt =
    typeof data.expiresAt === "string"
      ? data.expiresAt
      : "";

  const expiration =
    new Date(expiresAt).getTime();

  if (
    !expiresAt ||
    Number.isNaN(expiration) ||
    expiration <= Date.now()
  ) {
    return {
      success: false as const,
      status: 410,
      messageKey:
        "attempts.start.expired",
      message:
        "Your quiz attempt has expired.",
    };
  }

  return {
    success: true as const,
  };
}

/* =========================================================
   POST
   ========================================================= */

export async function POST(
  request: Request
) {
  try {
    /* =====================================================
       Parse body
       ===================================================== */

    let body: StartStudentAttemptRequest;

    try {
      body =
        (await request.json()) as
          StartStudentAttemptRequest;
    } catch {
      return errorResponse(
        "attempts.start.invalidRequest",
        "Invalid request.",
        400
      );
    }

    /* =====================================================
       Basic types
       ===================================================== */

    if (
      typeof body.quizId !== "string" ||
      typeof body.studentName !== "string" ||
      typeof body.studentEmail !== "string" ||
      typeof body.pin !== "string"
    ) {
      return errorResponse(
        "attempts.start.invalidRequest",
        "Invalid request.",
        400
      );
    }

    const quizId =
      body.quizId.trim();

    const studentName =
      normalizeName(body.studentName);

    const studentEmail =
      normalizeEmail(body.studentEmail);

    const pin =
      normalizeStudentPin(body.pin);

    /* =====================================================
       Validate quiz ID
       ===================================================== */

    if (!quizId) {
      return errorResponse(
        "attempts.start.quizRequired",
        "Quiz ID is required.",
        400
      );
    }

    /* =====================================================
       Validate student name
       ===================================================== */

    if (
      !studentName ||
      studentName.length < 2
    ) {
      return errorResponse(
        "attempts.start.invalidName",
        "Please enter a valid full name.",
        400
      );
    }

    if (
      studentName.length >
      MAX_STUDENT_NAME_LENGTH
    ) {
      return errorResponse(
        "attempts.start.nameTooLong",
        "Student name is too long.",
        400
      );
    }

    /* =====================================================
       Validate email
       ===================================================== */

    if (!studentEmail) {
      return errorResponse(
        "attempts.start.emailRequired",
        "Please enter your email address.",
        400
      );
    }

    if (!isValidEmail(studentEmail)) {
      return errorResponse(
        "attempts.start.invalidEmail",
        "Please enter a valid email address.",
        400
      );
    }

    if (
      studentEmail.length >
      MAX_STUDENT_EMAIL_LENGTH
    ) {
      return errorResponse(
        "attempts.start.emailTooLong",
        "Email address is too long.",
        400
      );
    }

    /* =====================================================
       Validate PIN
       ===================================================== */

    if (!isValidStudentPin(pin)) {
      return errorResponse(
        "attempts.pin.invalidFormat",
        "PIN must contain exactly 6 digits.",
        400
      );
    }

    /* =====================================================
       Deterministic credential identity
       ===================================================== */

    const credentialId =
      createStudentCredentialId({
        quizId,
        studentEmail,
      });

    const credentialRef =
      adminDb
        .collection(
          CREDENTIALS_COLLECTION
        )
        .doc(credentialId);

    const credentialSnapshot =
      await credentialRef.get();

    /* =====================================================
       EXISTING STUDENT
       ===================================================== */

    if (credentialSnapshot.exists) {
      const credential =
        mapCredential(
          credentialSnapshot.data() ?? {}
        );

      if (!credential) {
        console.error(
          "Invalid student credential document:",
          credentialId
        );

        return errorResponse(
          "attempts.pin.credentialError",
          "Unable to verify this student attempt.",
          500
        );
      }

      /* ===================================================
         Verify credential identity
         =================================================== */

      if (
        credential.quizId !== quizId ||
        credential.studentEmailNormalized !==
          studentEmail
      ) {
        console.error(
          "Student credential identity mismatch:",
          credentialId
        );

        return errorResponse(
          "attempts.pin.credentialError",
          "Unable to verify this student attempt.",
          500
        );
      }

      /* ===================================================
         PIN reset currently active
         =================================================== */

      if (credential.pinResetRequired) {
        return errorResponse(
          "attempts.pin.resetRequired",
          "Your PIN must be reset before you can resume this quiz.",
          409
        );
      }

      /* ===================================================
         Existing lock
         =================================================== */

      if (
        isStudentPinLocked(
          credential.lockedUntil
        )
      ) {
        const lockRemainingSeconds =
          getStudentPinLockRemainingSeconds(
            credential.lockedUntil
          );

        return errorResponse(
          "attempts.pin.locked",
          "Too many incorrect PIN attempts. Please try again later.",
          429,
          {
            locked: true,
            lockedUntil:
              credential.lockedUntil,
            lockRemainingSeconds,
            attemptsRemaining: 0,
          }
        );
      }

      /* ===================================================
         Read associated attempt
         =================================================== */

      const attemptRef =
        adminDb
          .collection(
            ATTEMPTS_COLLECTION
          )
          .doc(
            credential.attemptId
          );

      const attemptSnapshot =
        await attemptRef.get();

      if (!attemptSnapshot.exists) {
        console.error(
          "Credential references a missing attempt:",
          credential.attemptId
        );

        return errorResponse(
          "attempts.start.notFound",
          "Attempt not found.",
          404
        );
      }

      const attemptData =
        attemptSnapshot.data() ?? {};

      /* ===================================================
         Verify attempt identity
         =================================================== */

      const attemptEmail =
        normalizeEmail(
          typeof attemptData.studentEmailNormalized ===
            "string"
            ? attemptData.studentEmailNormalized
            : typeof attemptData.studentEmail ===
                "string"
              ? attemptData.studentEmail
              : ""
        );

      if (
        attemptData.quizId !== quizId ||
        attemptEmail !== studentEmail
      ) {
        console.error(
          "Attempt identity mismatch:",
          credential.attemptId
        );

        return errorResponse(
          "attempts.pin.credentialError",
          "Unable to verify this student attempt.",
          500
        );
      }

      /* ===================================================
         Status / expiration
         =================================================== */

      const attemptValidation =
        validateExistingAttempt(
          attemptData
        );

      if (
        !attemptValidation.success
      ) {
        return errorResponse(
          attemptValidation.messageKey,
          attemptValidation.message,
          attemptValidation.status
        );
      }

      /* ===================================================
         Verify PIN
         =================================================== */

      const pinIsCorrect =
        verifyStudentPin({
          pin,
          quizId,
          studentEmail,
          storedHash:
            credential.pinHash,
        });

      /* ===================================================
         WRONG PIN
         =================================================== */

      if (!pinIsCorrect) {
        const now =
          new Date().toISOString();

        const nextFailedAttempts =
          credential.failedAttempts + 1;

        /* =================================================
           Fifth failure -> temporary lock
           ================================================= */

        if (
          nextFailedAttempts >=
          MAX_STUDENT_PIN_ATTEMPTS
        ) {
          const lockedUntil =
            createStudentPinLockUntil();

          const lockRemainingSeconds =
            getStudentPinLockRemainingSeconds(
              lockedUntil
            );

          await credentialRef.update({
            failedAttempts: 0,
            lockedUntil,
            updatedAt: now,
          });

          return errorResponse(
            "attempts.pin.locked",
            "Too many incorrect PIN attempts. Your access has been temporarily locked.",
            429,
            {
              locked: true,
              lockedUntil,
              lockRemainingSeconds,
              attemptsRemaining: 0,
            }
          );
        }

        /* =================================================
           Wrong PIN but not locked yet
           ================================================= */

        await credentialRef.update({
          failedAttempts:
            nextFailedAttempts,
          lockedUntil: null,
          updatedAt: now,
        });

        return errorResponse(
          "attempts.pin.incorrect",
          "Incorrect PIN.",
          401,
          {
            locked: false,

            attemptsRemaining:
              Math.max(
                0,
                MAX_STUDENT_PIN_ATTEMPTS -
                  nextFailedAttempts
              ),
          }
        );
      }

      /* ===================================================
         CORRECT PIN

         Reset failed-attempt counter.
         =================================================== */

      await credentialRef.update({
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt:
          new Date().toISOString(),
      });

      return successResponse({
        attemptId:
          credential.attemptId,

        resumed: true,

        messageKey:
          "attempts.start.resumed",

        message:
          "Your existing quiz attempt was found.",
      });
    }

    /* =====================================================
       NEW STUDENT
       ===================================================== */

    const startResult =
      await startAttempt({
        quizId,
        studentName,
        studentEmail,
      });

    /* =====================================================
       startAttempt found an existing attempt.

       This can happen if another request created the
       attempt between /lookup and /start.

       Do NOT create another attempt.
       ===================================================== */

    if (
      startResult.success &&
      startResult.attempt &&
      startResult.resumed
    ) {
      return errorResponse(
        "attempts.start.authenticationRequired",
        "An existing quiz attempt was found. Please enter your PIN to resume it.",
        409,
        {
          authenticationRequired: true,
        }
      );
    }

    if (
      !startResult.success ||
      !startResult.attempt
    ) {
      return errorResponse(
        startResult.messageKey,
        startResult.message,
        409
      );
    }

    const attempt =
      startResult.attempt;

    /* =====================================================
       Extra safety check
       ===================================================== */

    if (startResult.resumed) {
      console.error(
        "startAttempt unexpectedly resumed an attempt."
      );

      return errorResponse(
        "attempts.start.authenticationRequired",
        "An existing quiz attempt was found. Please enter your PIN to resume it.",
        409,
        {
          authenticationRequired: true,
        }
      );
    }

    /* =====================================================
       Hash PIN

       Plain PIN is never stored.
       ===================================================== */

    const pinHash =
      hashStudentPin({
        pin,
        quizId,
        studentEmail,
      });

    const now =
      new Date().toISOString();

    /* =====================================================
       Credential
       ===================================================== */

    const credentialData:
      StudentAttemptCredential = {
      attemptId:
        attempt.id,

      quizId,

      studentEmailNormalized:
        studentEmail,

      pinHash,

      failedAttempts: 0,

      lockedUntil: null,

      pinResetRequired: false,

      createdAt: now,

      updatedAt: now,
    };

    /* =====================================================
       Create credential

       create() fails if the deterministic credential
       already exists.
       ===================================================== */

    try {
      await credentialRef.create(
        credentialData
      );
    } catch (error) {
      console.error(
        "Unable to create student credential:",
        error
      );

      /* ===================================================
         Remove orphan attempt created by this request.
         =================================================== */

      try {
        await adminDb
          .collection(
            ATTEMPTS_COLLECTION
          )
          .doc(attempt.id)
          .delete();
      } catch (cleanupError) {
        console.error(
          "Unable to clean up orphan attempt:",
          attempt.id,
          cleanupError
        );
      }

      /*
       * Another request won the race.
       * The UI should now switch to the existing-attempt
       * PIN form.
       */

      return errorResponse(
        "attempts.start.authenticationRequired",
        "An existing quiz attempt was created at the same time. Please enter your PIN to resume it.",
        409,
        {
          authenticationRequired: true,
        }
      );
    }

    /* =====================================================
       Ensure normalized email exists on attempt
       ===================================================== */

    try {
      await adminDb
        .collection(
          ATTEMPTS_COLLECTION
        )
        .doc(attempt.id)
        .update({
          studentEmail,
          studentEmailNormalized:
            studentEmail,
          updatedAt: now,
        });
    } catch (updateError) {
      console.error(
        "Unable to normalize attempt email:",
        attempt.id,
        updateError
      );

      /*
       * At this point both the attempt and its credential
       * exist. Do not silently return success with a
       * partially initialized identity.
       *
       * Remove both documents created by this request.
       */

      try {
        await credentialRef.delete();
      } catch (credentialCleanupError) {
        console.error(
          "Unable to clean up credential:",
          credentialId,
          credentialCleanupError
        );
      }

      try {
        await adminDb
          .collection(
            ATTEMPTS_COLLECTION
          )
          .doc(attempt.id)
          .delete();
      } catch (attemptCleanupError) {
        console.error(
          "Unable to clean up attempt:",
          attempt.id,
          attemptCleanupError
        );
      }

      return errorResponse(
        "attempts.start.serverError",
        "Unable to start the quiz right now.",
        500
      );
    }

    /* =====================================================
       Success
       ===================================================== */

    return successResponse({
      attemptId:
        attempt.id,

      resumed: false,

      messageKey:
        "attempts.start.created",

      message:
        "Quiz attempt created successfully.",
    });
  } catch (error) {
    console.error(
      "Student attempt start API error:",
      error
    );

    return errorResponse(
      "attempts.start.serverError",
      "Unable to start the quiz right now.",
      500
    );
  }
}