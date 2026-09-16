// app/api/student-attempt/reset-pin/route.ts

import "server-only";

import {
  createHmac,
} from "crypto";

import {
  NextResponse,
} from "next/server";

import {
  adminDb,
} from "@/lib/firebaseAdmin";

import {
  hashStudentPin,
  isValidStudentPin,
  isValidStudentPinResetCode,
  verifyStudentPinResetCode,
  isStudentPinResetCodeExpired,
  MAX_STUDENT_PIN_RESET_CODE_ATTEMPTS,
} from "@/lib/studentPin";

/* =========================================================
   Constants
   ========================================================= */

const CREDENTIALS_COLLECTION =
  "studentAttemptCredentials";

const ATTEMPTS_COLLECTION =
  "attempts";

const RESET_REQUEST_STATUS_APPROVED =
  "approved";

/* =========================================================
   Types
   ========================================================= */

type ResetPinBody = {
  quizId?: unknown;
  studentEmail?: unknown;
  resetCode?: unknown;
  newPin?: unknown;
  newPinConfirmation?: unknown;
};

type CredentialData = {
  quizId?: string;
  attemptId?: string;

  studentName?: string;

  studentEmail?: string;
  studentEmailNormalized?: string;

  pinHash?: string;

  failedAttempts?: number;
  lockedUntil?: string | null;

  pinResetRequested?: boolean;
  pinResetRequestedAt?: string | null;

  pinResetStatus?: string | null;

  resetCodeHash?: string | null;
  resetCodeExpiresAt?: string | null;
  resetCodeFailedAttempts?: number;

  pinResetApprovedAt?: string | null;
  pinResetApprovedBy?: string | null;

  pinResetCompletedAt?: string | null;

  updatedAt?: string;
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
  pinResetStatus?: string | null;
  pinResetRequestedAt?: string | null;
  pinResetApprovedAt?: string | null;
  pinResetCompletedAt?: string | null;
};

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

function normalizeQuizId(
  value: string
) {
  return value.trim();
}

function normalizeResetCode(
  value: string
) {
  return value.trim();
}

function normalizePin(
  value: string
) {
  return value.trim();
}

/* =========================================================
   Secret
   ========================================================= */

function getStudentVerificationSecret() {
  const secret =
    process.env.STUDENT_VERIFICATION_SECRET;

  if (!secret) {
    throw new Error(
      "STUDENT_VERIFICATION_SECRET is missing."
    );
  }

  if (
    secret.length <
    32
  ) {
    throw new Error(
      "STUDENT_VERIFICATION_SECRET must contain at least 32 characters."
    );
  }

  return secret;
}

/* =========================================================
   Credential ID
   ========================================================= */

function getCredentialDocumentId({
  quizId,
  studentEmail,
}: {
  quizId: string;
  studentEmail: string;
}) {
  const secret =
    getStudentVerificationSecret();

  const normalizedQuizId =
    normalizeQuizId(
      quizId
    );

  const normalizedEmail =
    normalizeEmail(
      studentEmail
    );

  const value =
    [
      "ulearn-student-attempt-credential-v1",
      normalizedQuizId,
      normalizedEmail,
    ].join(":");

  return createHmac(
    "sha256",
    secret
  )
    .update(value)
    .digest("hex");
}

/* =========================================================
   Attempt expiration
   ========================================================= */

function isAttemptExpired(
  expiresAt:
    | string
    | null
    | undefined
) {
  if (!expiresAt) {
    return false;
  }

  const timestamp =
    new Date(
      expiresAt
    ).getTime();

  if (
    Number.isNaN(
      timestamp
    )
  ) {
    return false;
  }

  return (
    timestamp <=
    Date.now()
  );
}

/* =========================================================
   Error response
   ========================================================= */

function errorResponse({
  status,
  messageKey,
  message,
  attemptsRemaining,
}: {
  status: number;
  messageKey: string;
  message: string;
  attemptsRemaining?: number;
}) {
  return NextResponse.json(
    {
      success: false,

      messageKey,
      message,

      ...(typeof attemptsRemaining ===
      "number"
        ? {
            attemptsRemaining,
          }
        : {}),
    },
    {
      status,

      headers: {
        "Cache-Control":
          "no-store, no-cache, must-revalidate",

        Pragma:
          "no-cache",
      },
    }
  );
}

/* =========================================================
   POST
   ========================================================= */

export async function POST(
  request: Request
) {
  try {
    /* =====================================================
       Body
       ===================================================== */

    let body:
      ResetPinBody;

    try {
      body =
        (await request.json()) as
          ResetPinBody;
    } catch {
      return errorResponse({
        status: 400,

        messageKey:
          "attempts.pinReset.invalidRequest",

        message:
          "Invalid request body.",
      });
    }

    if (
      typeof body.quizId !==
        "string" ||
      typeof body.studentEmail !==
        "string" ||
      typeof body.resetCode !==
        "string" ||
      typeof body.newPin !==
        "string" ||
      typeof body.newPinConfirmation !==
        "string"
    ) {
      return errorResponse({
        status: 400,

        messageKey:
          "attempts.pinReset.invalidRequest",

        message:
          "Quiz ID, email, reset code, new PIN and PIN confirmation are required.",
      });
    }

    const quizId =
      normalizeQuizId(
        body.quizId
      );

    const studentEmail =
      normalizeEmail(
        body.studentEmail
      );

    const resetCode =
      normalizeResetCode(
        body.resetCode
      );

    const newPin =
      normalizePin(
        body.newPin
      );

    const newPinConfirmation =
      normalizePin(
        body.newPinConfirmation
      );

    if (
      !quizId ||
      !studentEmail ||
      !resetCode ||
      !newPin ||
      !newPinConfirmation
    ) {
      return errorResponse({
        status: 400,

        messageKey:
          "attempts.pinReset.invalidRequest",

        message:
          "All PIN reset fields are required.",
      });
    }

    /* =====================================================
       Email
       ===================================================== */

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        studentEmail
      )
    ) {
      return errorResponse({
        status: 400,

        messageKey:
          "attempts.pinReset.invalidEmail",

        message:
          "A valid student email address is required.",
      });
    }

    /* =====================================================
       Temporary code
       ===================================================== */

    if (
      !isValidStudentPinResetCode(
        resetCode
      )
    ) {
      return errorResponse({
        status: 400,

        messageKey:
          "attempts.pinReset.invalidCodeFormat",

        message:
          "The temporary reset code must contain exactly 6 digits.",
      });
    }

    /* =====================================================
       New PIN
       ===================================================== */

    if (
      !isValidStudentPin(
        newPin
      )
    ) {
      return errorResponse({
        status: 400,

        messageKey:
          "attempts.pinReset.invalidNewPin",

        message:
          "The new PIN must contain exactly 6 digits.",
      });
    }

    if (
      newPin !==
      newPinConfirmation
    ) {
      return errorResponse({
        status: 400,

        messageKey:
          "attempts.pinReset.pinMismatch",

        message:
          "The new PIN and its confirmation do not match.",
      });
    }

    /* =====================================================
       Credential
       ===================================================== */

    const credentialId =
      getCredentialDocumentId({
        quizId,
        studentEmail,
      });

    const credentialRef =
      adminDb
        .collection(
          CREDENTIALS_COLLECTION
        )
        .doc(
          credentialId
        );

    /* =====================================================
       Transaction
       ===================================================== */

    const result =
      await adminDb.runTransaction(
        async (
          transaction
        ) => {
          const credentialSnapshot =
            await transaction.get(
              credentialRef
            );

          if (
            !credentialSnapshot.exists
          ) {
            return {
              type:
                "error" as const,

              status:
                404,

              messageKey:
                "attempts.pinReset.noActiveAttempt",

              message:
                "No active quiz attempt was found for this email address.",
            };
          }

          const credential =
            credentialSnapshot.data() as
              CredentialData;

          /* ===============================================
             Credential identity
             =============================================== */

          const credentialQuizId =
            normalizeQuizId(
              credential.quizId ??
                ""
            );

          const credentialEmail =
            normalizeEmail(
              credential.studentEmailNormalized ??
                credential.studentEmail ??
                ""
            );

          if (
            credentialQuizId !==
              quizId ||
            credentialEmail !==
              studentEmail
          ) {
            return {
              type:
                "error" as const,

              status:
                404,

              messageKey:
                "attempts.pinReset.noActiveAttempt",

              message:
                "No active quiz attempt was found for this email address.",
            };
          }

          const attemptId =
            typeof credential.attemptId ===
            "string"
              ? credential.attemptId.trim()
              : "";

          if (
            !attemptId
          ) {
            return {
              type:
                "error" as const,

              status:
                404,

              messageKey:
                "attempts.pinReset.noActiveAttempt",

              message:
                "No active quiz attempt was found for this email address.",
            };
          }

          const attemptRef =
            adminDb
              .collection(
                ATTEMPTS_COLLECTION
              )
              .doc(
                attemptId
              );

          const attemptSnapshot =
            await transaction.get(
              attemptRef
            );

          if (
            !attemptSnapshot.exists
          ) {
            return {
              type:
                "error" as const,

              status:
                404,

              messageKey:
                "attempts.pinReset.noActiveAttempt",

              message:
                "No active quiz attempt was found for this email address.",
            };
          }

          const attempt =
            attemptSnapshot.data() as
              AttemptData;

          /* ===============================================
             Attempt identity
             =============================================== */

          const attemptQuizId =
            normalizeQuizId(
              attempt.quizId ??
                ""
            );

          const attemptEmail =
            normalizeEmail(
              attempt.studentEmailNormalized ??
                attempt.studentEmail ??
                ""
            );

          if (
            attemptQuizId !==
              quizId ||
            attemptEmail !==
              studentEmail
          ) {
            return {
              type:
                "error" as const,

              status:
                404,

              messageKey:
                "attempts.pinReset.noActiveAttempt",

              message:
                "No active quiz attempt was found for this email address.",
            };
          }

          /* ===============================================
             Attempt state
             =============================================== */

          if (
            attempt.status !==
            "in_progress"
          ) {
            return {
              type:
                "error" as const,

              status:
                409,

              messageKey:
                "attempts.pinReset.notInProgress",

              message:
                "Only an in-progress quiz attempt can reset its PIN.",
            };
          }

          if (
            isAttemptExpired(
              attempt.expiresAt
            )
          ) {
            return {
              type:
                "error" as const,

              status:
                409,

              messageKey:
                "attempts.pinReset.attemptExpired",

              message:
                "This quiz attempt has expired.",
            };
          }

          /* ===============================================
             Approved request required
             =============================================== */

          if (
            credential.pinResetRequested !==
              true ||
            credential.pinResetStatus !==
              RESET_REQUEST_STATUS_APPROVED
          ) {
            if (
              attempt.pinResetRequested ||
              attempt.pinResetStatus ||
              attempt.pinResetRequestedAt ||
              attempt.pinResetApprovedAt
            ) {
              transaction.update(
                attemptRef,
                {
                  pinResetRequested:
                    false,

                  pinResetStatus:
                    null,

                  pinResetRequestedAt:
                    null,

                  pinResetApprovedAt:
                    null,
                }
              );
            }

            return {
              type:
                "error" as const,

              status:
                409,

              messageKey:
                "attempts.pinReset.notApproved",

              message:
                "The professor has not approved this PIN reset request.",
            };
          }

          /* ===============================================
             Code data
             =============================================== */

          const resetCodeHash =
            typeof credential.resetCodeHash ===
            "string"
              ? credential.resetCodeHash
              : "";

          const resetCodeExpiresAt =
            typeof credential.resetCodeExpiresAt ===
            "string"
              ? credential.resetCodeExpiresAt
              : null;

          /* ===============================================
             Missing code
             =============================================== */

          if (
            !resetCodeHash ||
            !resetCodeExpiresAt
          ) {
            const now =
              new Date().toISOString();

            transaction.update(
              credentialRef,
              {
                pinResetRequested:
                  false,

                pinResetRequestedAt:
                  null,

                pinResetStatus:
                  null,

                resetCodeHash:
                  null,

                resetCodeExpiresAt:
                  null,

                resetCodeFailedAttempts:
                  0,

                pinResetApprovedAt:
                  null,

                pinResetApprovedBy:
                  null,

                updatedAt:
                  now,
              }
            );

            transaction.update(
              attemptRef,
              {
                pinResetRequested:
                  false,

                pinResetStatus:
                  null,

                pinResetRequestedAt:
                  null,

                pinResetApprovedAt:
                  null,
              }
            );

            return {
              type:
                "error" as const,

              status:
                409,

              messageKey:
                "attempts.pinReset.codeUnavailable",

              message:
                "No valid temporary reset code is available.",
            };
          }

          /* ===============================================
             Expired code
             =============================================== */

          if (
            isStudentPinResetCodeExpired(
              resetCodeExpiresAt
            )
          ) {
            const now =
              new Date().toISOString();

            transaction.update(
              credentialRef,
              {
                pinResetRequested:
                  false,

                pinResetRequestedAt:
                  null,

                pinResetStatus:
                  null,

                resetCodeHash:
                  null,

                resetCodeExpiresAt:
                  null,

                resetCodeFailedAttempts:
                  0,

                pinResetApprovedAt:
                  null,

                pinResetApprovedBy:
                  null,

                updatedAt:
                  now,
              }
            );

            transaction.update(
              attemptRef,
              {
                pinResetRequested:
                  false,

                pinResetStatus:
                  null,

                pinResetRequestedAt:
                  null,

                pinResetApprovedAt:
                  null,
              }
            );

            return {
              type:
                "error" as const,

              status:
                410,

              messageKey:
                "attempts.pinReset.codeExpired",

              message:
                "The temporary reset code has expired.",
            };
          }

          /* ===============================================
             Failed attempts
             =============================================== */

          const failedAttempts =
            typeof credential.resetCodeFailedAttempts ===
              "number" &&
            Number.isFinite(
              credential.resetCodeFailedAttempts
            )
              ? Math.max(
                  0,
                  Math.floor(
                    credential.resetCodeFailedAttempts
                  )
                )
              : 0;

          if (
            failedAttempts >=
            MAX_STUDENT_PIN_RESET_CODE_ATTEMPTS
          ) {
            const now =
              new Date().toISOString();

            transaction.update(
              credentialRef,
              {
                pinResetRequested:
                  false,

                pinResetRequestedAt:
                  null,

                pinResetStatus:
                  null,

                resetCodeHash:
                  null,

                resetCodeExpiresAt:
                  null,

                resetCodeFailedAttempts:
                  failedAttempts,

                pinResetApprovedAt:
                  null,

                pinResetApprovedBy:
                  null,

                updatedAt:
                  now,
              }
            );

            transaction.update(
              attemptRef,
              {
                pinResetRequested:
                  false,

                pinResetStatus:
                  null,

                pinResetRequestedAt:
                  null,

                pinResetApprovedAt:
                  null,
              }
            );

            return {
              type:
                "error" as const,

              status:
                429,

              messageKey:
                "attempts.pinReset.tooManyCodeAttempts",

              message:
                "Too many incorrect temporary code attempts.",

              attemptsRemaining:
                0,
            };
          }

          /* ===============================================
             Verify code
             =============================================== */

          const codeIsValid =
            verifyStudentPinResetCode({
              code:
                resetCode,

              quizId,

              studentEmail,

              storedHash:
                resetCodeHash,
            });

          if (
            !codeIsValid
          ) {
            const nextFailedAttempts =
              failedAttempts +
              1;

            const attemptsRemaining =
              Math.max(
                0,

                MAX_STUDENT_PIN_RESET_CODE_ATTEMPTS -
                  nextFailedAttempts
              );

            /* =============================================
               Maximum reached
               ============================================= */

            if (
              nextFailedAttempts >=
              MAX_STUDENT_PIN_RESET_CODE_ATTEMPTS
            ) {
              const now =
                new Date().toISOString();

              transaction.update(
                credentialRef,
                {
                  pinResetRequested:
                    false,

                  pinResetRequestedAt:
                    null,

                  pinResetStatus:
                    null,

                  resetCodeHash:
                    null,

                  resetCodeExpiresAt:
                    null,

                  resetCodeFailedAttempts:
                    nextFailedAttempts,

                  pinResetApprovedAt:
                    null,

                  pinResetApprovedBy:
                    null,

                  updatedAt:
                    now,
                }
              );

              transaction.update(
                attemptRef,
                {
                  pinResetRequested:
                    false,

                  pinResetStatus:
                    null,

                  pinResetRequestedAt:
                    null,

                  pinResetApprovedAt:
                    null,
                }
              );

              return {
                type:
                  "error" as const,

                status:
                  429,

                messageKey:
                  "attempts.pinReset.tooManyCodeAttempts",

                message:
                  "Too many incorrect temporary code attempts.",

                attemptsRemaining:
                  0,
              };
            }

            /* =============================================
               Incorrect code, attempts remain
               ============================================= */

            transaction.update(
              credentialRef,
              {
                resetCodeFailedAttempts:
                  nextFailedAttempts,

                updatedAt:
                  new Date().toISOString(),
              }
            );

            return {
              type:
                "error" as const,

              status:
                401,

              messageKey:
                "attempts.pinReset.incorrectCode",

              message:
                "The temporary reset code is incorrect.",

              attemptsRemaining,
            };
          }

          /* ===============================================
             New PIN hash
             =============================================== */

          const newPinHash =
            hashStudentPin({
              pin:
                newPin,

              quizId,

              studentEmail,
            });

          const now =
            new Date().toISOString();

          /* ===============================================
             Credential update
             =============================================== */

          transaction.update(
            credentialRef,
            {
              pinHash:
                newPinHash,

              failedAttempts:
                0,

              lockedUntil:
                null,

              pinResetRequested:
                false,

              pinResetRequestedAt:
                null,

              pinResetStatus:
                null,

              resetCodeHash:
                null,

              resetCodeExpiresAt:
                null,

              resetCodeFailedAttempts:
                0,

              pinResetApprovedAt:
                null,

              pinResetApprovedBy:
                null,

              pinResetCompletedAt:
                now,

              updatedAt:
                now,
            }
          );

          /* ===============================================
             Public attempt cleanup
             =============================================== */

          transaction.update(
            attemptRef,
            {
              pinResetRequested:
                false,

              pinResetStatus:
                null,

              pinResetRequestedAt:
                null,

              pinResetApprovedAt:
                null,

              pinResetCompletedAt:
                now,
            }
          );

          return {
            type:
              "success" as const,

            attemptId,

            studentName:
              attempt.studentName ??
              credential.studentName ??
              "",
          };
        }
      );

    /* =====================================================
       Error
       ===================================================== */

    if (
      result.type ===
      "error"
    ) {
      return errorResponse({
        status:
          result.status,

        messageKey:
          result.messageKey,

        message:
          result.message,

        attemptsRemaining:
          "attemptsRemaining" in
          result
            ? result.attemptsRemaining
            : undefined,
      });
    }

    /* =====================================================
       Success
       ===================================================== */

    return NextResponse.json(
      {
        success:
          true,

        attemptId:
          result.attemptId,

        studentName:
          result.studentName,

        messageKey:
          "attempts.pinReset.completed",

        message:
          "Your PIN was reset successfully. You can resume your quiz.",
      },
      {
        status: 200,

        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate",

          Pragma:
            "no-cache",
        },
      }
    );
  } catch (error) {
    console.error(
      "Unable to reset student PIN:",
      error
    );

    return errorResponse({
      status: 500,

      messageKey:
        "attempts.pinReset.serverError",

      message:
        "Unable to reset the student PIN.",
    });
  }
}