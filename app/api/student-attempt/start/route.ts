// app/api/student-attempt/start/route.ts

import "server-only";

import { createHmac } from "crypto";
import { NextResponse } from "next/server";

import { adminDb } from "@/lib/firebaseAdmin";

import {
  createStudentPinLockUntil,
  getStudentPinLockRemainingSeconds,
  isStudentPinLocked,
  isValidStudentPin,
  MAX_STUDENT_PIN_ATTEMPTS,
  normalizeStudentPin,
  verifyStudentPin,
} from "@/lib/studentPin";

import {
  startAttempt,
} from "@/lib/services/attempts";

/* =========================================================
   Configuration
   ========================================================= */

export const runtime = "nodejs";

const ATTEMPTS_COLLECTION =
  "attempts";

const CREDENTIALS_COLLECTION =
  "studentAttemptCredentials";

const MAX_STUDENT_NAME_LENGTH =
  120;

const MAX_STUDENT_EMAIL_LENGTH =
  200;

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

function normalizeEmail(
  value: string
) {
  return value
    .trim()
    .toLowerCase();
}

function normalizeName(
  value: string
) {
  return value.trim();
}

function isValidEmail(
  email: string
) {
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
   Deterministic student identity

   We do NOT use the student's email directly as a
   Firestore document ID.

   Same quiz + same normalized email always produces
   the same credential document ID.
   ========================================================= */

function createStudentIdentityId({
  quizId,
  studentEmail,
}: {
  quizId: string;
  studentEmail: string;
}) {
  const secret =
    getStudentVerificationSecret();

  const value = [
    "ulearn-student-attempt-identity-v1",
    quizId,
    normalizeEmail(studentEmail),
  ].join(":");

  return createHmac(
    "sha256",
    secret
  )
    .update(value)
    .digest("hex");
}

/* =========================================================
   Credential type

   This document is SERVER ONLY.
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
    attemptId:
      data.attemptId,

    quizId:
      data.quizId,

    studentEmailNormalized:
      data.studentEmailNormalized,

    pinHash:
      data.pinHash,

    failedAttempts:
      typeof data.failedAttempts ===
        "number" &&
      Number.isInteger(
        data.failedAttempts
      ) &&
      data.failedAttempts >= 0
        ? data.failedAttempts
        : 0,

    lockedUntil:
      typeof data.lockedUntil ===
      "string"
        ? data.lockedUntil
        : null,

    pinResetRequired:
      data.pinResetRequired === true,

    createdAt:
      typeof data.createdAt ===
      "string"
        ? data.createdAt
        : "",

    updatedAt:
      typeof data.updatedAt ===
      "string"
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
    new Date(
      expiresAt
    ).getTime();

  if (
    !expiresAt ||
    Number.isNaN(
      expiration
    ) ||
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

    let body:
      StartStudentAttemptRequest;

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
      typeof body.quizId !==
        "string" ||
      typeof body.studentName !==
        "string" ||
      typeof body.studentEmail !==
        "string" ||
      typeof body.pin !==
        "string"
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
      normalizeName(
        body.studentName
      );

    const studentEmail =
      normalizeEmail(
        body.studentEmail
      );

    const pin =
      normalizeStudentPin(
        body.pin
      );

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

    if (
      !isValidEmail(
        studentEmail
      )
    ) {
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

    if (
      !isValidStudentPin(
        pin
      )
    ) {
      return errorResponse(
        "attempts.pin.invalidFormat",
        "PIN must contain exactly 6 digits.",
        400
      );
    }

    /* =====================================================
       Deterministic identity
       ===================================================== */

    const identityId =
      createStudentIdentityId({
        quizId,
        studentEmail,
      });

    const credentialRef =
      adminDb
        .collection(
          CREDENTIALS_COLLECTION
        )
        .doc(
          identityId
        );

    /* =====================================================
       Look for an existing credential
       ===================================================== */

    const credentialSnapshot =
      await credentialRef.get();

    /* =====================================================
       EXISTING STUDENT

       If the credential exists, this is a resume attempt.
       The student MUST prove knowledge of the PIN.
       ===================================================== */

    if (
      credentialSnapshot.exists
    ) {
      const credential =
        mapCredential(
          credentialSnapshot.data() ??
            {}
        );

      if (!credential) {
        console.error(
          "Invalid student credential document:",
          identityId
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
        credential.quizId !==
          quizId ||
        credential.studentEmailNormalized !==
          studentEmail
      ) {
        console.error(
          "Student credential identity mismatch:",
          identityId
        );

        return errorResponse(
          "attempts.pin.credentialError",
          "Unable to verify this student attempt.",
          500
        );
      }

      /* ===================================================
         PIN reset requested by teacher

         Later, the dedicated reset flow will handle this.
         We DO NOT allow normal PIN verification while
         resetRequired is true.
         =================================================== */

      if (
        credential.pinResetRequired
      ) {
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
        const remainingSeconds =
          getStudentPinLockRemainingSeconds(
            credential.lockedUntil
          );

        return errorResponse(
          "attempts.pin.locked",
          "Too many incorrect PIN attempts. Please try again later.",
          429,
          {
            lockedUntil:
              credential.lockedUntil,

            remainingSeconds,
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

      if (
        !attemptSnapshot.exists
      ) {
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
        attemptSnapshot.data() ??
        {};

      /* ===================================================
         Make sure credential and attempt match
         =================================================== */

      if (
        attemptData.quizId !==
          quizId ||
        normalizeEmail(
          typeof attemptData.studentEmailNormalized ===
            "string"
            ? attemptData.studentEmailNormalized
            : typeof attemptData.studentEmail ===
                "string"
              ? attemptData.studentEmail
              : ""
        ) !== studentEmail
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
          new Date()
            .toISOString();

        const nextFailedAttempts =
          credential.failedAttempts +
          1;

        /* =================================================
           Fifth failure -> 15-minute lock
           ================================================= */

        if (
          nextFailedAttempts >=
          MAX_STUDENT_PIN_ATTEMPTS
        ) {
          const lockedUntil =
            createStudentPinLockUntil();

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
              lockedUntil,

              remainingSeconds:
                getStudentPinLockRemainingSeconds(
                  lockedUntil
                ),

              attemptsRemaining: 0,
            }
          );
        }

        /* =================================================
           Failure but not locked yet
           ================================================= */

        await credentialRef.update({
          failedAttempts:
            nextFailedAttempts,

          lockedUntil:
            null,

          updatedAt:
            now,
        });

        return errorResponse(
          "attempts.pin.incorrect",
          "Incorrect PIN.",
          401,
          {
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

         Reset failure counter and lock.
         =================================================== */

      await credentialRef.update({
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt:
          new Date()
            .toISOString(),
      });

      return successResponse({
        attemptId:
          credential.attemptId,

        resumed:
          true,

        messageKey:
          "attempts.start.resumed",

        message:
          "Your existing quiz attempt was found.",
      });
    }

    /* =====================================================
       NEW STUDENT

       There is no credential for this quiz + email.

       startAttempt() creates the normal attempt.

       Our modified attempts.ts must NOT automatically
       resume another attempt here.
       ===================================================== */

    const startResult =
      await startAttempt({
        quizId,
        studentName,
        studentEmail,
      });

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
       Important safety check

       This route creates NEW attempts only in this branch.
       ===================================================== */

    if (
      startResult.resumed
    ) {
      console.error(
        "startAttempt unexpectedly resumed an attempt."
      );

      return errorResponse(
        "attempts.pin.credentialError",
        "Unable to create the student PIN.",
        500
      );
    }

    /* =====================================================
       PIN hash

       studentPin.ts uses:
       - HMAC-SHA256
       - STUDENT_VERIFICATION_SECRET
       - quizId
       - normalized email
       - PIN

       Plain PIN is NEVER stored.
       ===================================================== */

    const {
      hashStudentPin,
    } = await import(
      "@/lib/studentPin"
    );

    const pinHash =
      hashStudentPin({
        pin,
        quizId,
        studentEmail,
      });

    const now =
      new Date()
        .toISOString();

    /* =====================================================
       Credential data
       ===================================================== */

    const credentialData:
      StudentAttemptCredential = {
      attemptId:
        attempt.id,

      quizId,

      studentEmailNormalized:
        studentEmail,

      pinHash,

      failedAttempts:
        0,

      lockedUntil:
        null,

      pinResetRequired:
        false,

      createdAt:
        now,

      updatedAt:
        now,
    };

    /* =====================================================
       Create private credential

       create() is intentionally used instead of set():
       it FAILS if another request already created the same
       deterministic identity document.
       ===================================================== */

    try {
      await credentialRef.create(
        credentialData
      );
    } catch (error) {
      /*
       * A concurrent request may have created the credential
       * after our initial credentialRef.get().
       *
       * We must NOT return the newly-created attempt because
       * that could create two usable attempts for one email.
       */

      console.error(
        "Unable to create student credential:",
        error
      );

      /*
       * Remove the orphan attempt that THIS request created.
       *
       * The winning request keeps its own attempt.
       */

      try {
        await adminDb
          .collection(
            ATTEMPTS_COLLECTION
          )
          .doc(
            attempt.id
          )
          .delete();
      } catch (
        cleanupError
      ) {
        console.error(
          "Unable to clean up orphan attempt:",
          attempt.id,
          cleanupError
        );
      }

      return errorResponse(
        "attempts.start.concurrentRequest",
        "Another request is already creating or resuming this quiz attempt. Please try again.",
        409
      );
    }

    /* =====================================================
       Ensure normalized email exists on attempt

       This keeps new documents consistent even if an older
       attempts.ts implementation did not include the field.
       ===================================================== */

    await adminDb
      .collection(
        ATTEMPTS_COLLECTION
      )
      .doc(
        attempt.id
      )
      .update({
        studentEmail:
          studentEmail,

        studentEmailNormalized:
          studentEmail,

        updatedAt:
          now,
      });

    /* =====================================================
       Success
       ===================================================== */

    return successResponse({
      attemptId:
        attempt.id,

      resumed:
        false,

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