// app/api/student-attempt/approve-pin-reset/route.ts

import "server-only";

import {
  auth,
} from "@clerk/nextjs/server";

import {
  NextResponse,
} from "next/server";

import {
  adminDb,
} from "@/lib/firebaseAdmin";

import {
  generateStudentPinResetCode,
  hashStudentPinResetCode,
  createStudentPinResetCodeExpiresAt,
} from "@/lib/studentPin";

/* =========================================================
   Constants
   ========================================================= */

const CREDENTIALS_COLLECTION =
  "studentAttemptCredentials";

const ATTEMPTS_COLLECTION =
  "attempts";

const RESET_REQUEST_STATUS_PENDING =
  "pending";

const RESET_REQUEST_STATUS_APPROVED =
  "approved";

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
  pinResetStatus?: string | null;
  pinResetRequestedAt?: string | null;
  pinResetApprovedAt?: string | null;
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

  updatedAt?: string;
};

/* =========================================================
   Helpers
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

function normalizeAttemptId(
  value: string
) {
  return value.trim();
}

/* =========================================================
   Expiration
   ========================================================= */

function isDateExpired(
  value:
    | string
    | null
    | undefined
) {
  if (!value) {
    return false;
  }

  const timestamp =
    new Date(
      value
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
       Authentication
       ===================================================== */

    const {
      userId,
    } =
      await auth();

    if (
      !userId
    ) {
      return errorResponse({
        status: 401,

        messageKey:
          "attempts.pinReset.teacher.unauthorized",

        message:
          "Authentication is required.",
      });
    }

    /* =====================================================
       Body
       ===================================================== */

    let body:
      ApprovePinResetBody;

    try {
      body =
        (await request.json()) as
          ApprovePinResetBody;
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
      typeof body.attemptId !==
      "string"
    ) {
      return errorResponse({
        status: 400,

        messageKey:
          "attempts.pinReset.invalidRequest",

        message:
          "Attempt ID is required.",
      });
    }

    const attemptId =
      normalizeAttemptId(
        body.attemptId
      );

    if (
      !attemptId
    ) {
      return errorResponse({
        status: 400,

        messageKey:
          "attempts.pinReset.invalidRequest",

        message:
          "Attempt ID is required.",
      });
    }

    /* =====================================================
       Attempt
       ===================================================== */

    const attemptRef =
      adminDb
        .collection(
          ATTEMPTS_COLLECTION
        )
        .doc(
          attemptId
        );

    const initialAttemptSnapshot =
      await attemptRef.get();

    if (
      !initialAttemptSnapshot.exists
    ) {
      return errorResponse({
        status: 404,

        messageKey:
          "attempts.pinReset.attemptNotFound",

        message:
          "Quiz attempt not found.",
      });
    }

    const initialAttempt =
      initialAttemptSnapshot.data() as
        AttemptData;

    /* =====================================================
       Teacher ownership
       ===================================================== */

    if (
      !initialAttempt.teacherId ||
      initialAttempt.teacherId !==
        userId
    ) {
      return errorResponse({
        status: 403,

        messageKey:
          "attempts.pinReset.teacher.forbidden",

        message:
          "You are not allowed to reset the PIN for this quiz attempt.",
      });
    }

    if (
      initialAttempt.status !==
      "in_progress"
    ) {
      return errorResponse({
        status: 409,

        messageKey:
          "attempts.pinReset.notInProgress",

        message:
          "Only an in-progress quiz attempt can reset its PIN.",
      });
    }

    if (
      isDateExpired(
        initialAttempt.expiresAt
      )
    ) {
      return errorResponse({
        status: 409,

        messageKey:
          "attempts.pinReset.attemptExpired",

        message:
          "This quiz attempt has expired.",
      });
    }

    /* =====================================================
       Identity
       ===================================================== */

    const quizId =
      normalizeQuizId(
        initialAttempt.quizId ??
          ""
      );

    const studentEmail =
      normalizeEmail(
        initialAttempt.studentEmailNormalized ??
          initialAttempt.studentEmail ??
          ""
      );

    if (
      !quizId ||
      !studentEmail
    ) {
      console.error(
        "Attempt has incomplete student identity.",
        {
          attemptId,
        }
      );

      return errorResponse({
        status: 500,

        messageKey:
          "attempts.pinReset.invalidAttempt",

        message:
          "The quiz attempt contains incomplete student information.",
      });
    }

    /* =====================================================
       Locate credential
       ===================================================== */

    const credentialQuery =
      await adminDb
        .collection(
          CREDENTIALS_COLLECTION
        )
        .where(
          "attemptId",
          "==",
          attemptId
        )
        .limit(2)
        .get();

    if (
      credentialQuery.empty
    ) {
      return errorResponse({
        status: 404,

        messageKey:
          "attempts.pinReset.credentialNotFound",

        message:
          "Student PIN credentials were not found.",
      });
    }

    if (
      credentialQuery.size !==
      1
    ) {
      console.error(
        "Multiple student credentials reference the same attempt.",
        {
          attemptId,
          count:
            credentialQuery.size,
        }
      );

      return errorResponse({
        status: 409,

        messageKey:
          "attempts.pinReset.credentialConflict",

        message:
          "Multiple PIN credentials were found for this quiz attempt.",
      });
    }

    const credentialRef =
      credentialQuery.docs[0].ref;

    /* =====================================================
       Transaction
       ===================================================== */

    const result =
      await adminDb.runTransaction(
        async (
          transaction
        ) => {
          /*
           * Firestore requires transaction reads before
           * transaction writes.
           */

          const attemptSnapshot =
            await transaction.get(
              attemptRef
            );

          const credentialSnapshot =
            await transaction.get(
              credentialRef
            );

          /* ===============================================
             Attempt validation
             =============================================== */

          if (
            !attemptSnapshot.exists
          ) {
            return {
              type:
                "error" as const,

              status:
                404,

              messageKey:
                "attempts.pinReset.attemptNotFound",

              message:
                "Quiz attempt not found.",
            };
          }

          if (
            !credentialSnapshot.exists
          ) {
            return {
              type:
                "error" as const,

              status:
                404,

              messageKey:
                "attempts.pinReset.credentialNotFound",

              message:
                "Student PIN credentials were not found.",
            };
          }

          const attempt =
            attemptSnapshot.data() as
              AttemptData;

          const credential =
            credentialSnapshot.data() as
              CredentialData;

          /* ===============================================
             Ownership
             =============================================== */

          if (
            !attempt.teacherId ||
            attempt.teacherId !==
              userId
          ) {
            return {
              type:
                "error" as const,

              status:
                403,

              messageKey:
                "attempts.pinReset.teacher.forbidden",

              message:
                "You are not allowed to reset the PIN for this quiz attempt.",
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
            isDateExpired(
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
             Attempt identity
             =============================================== */

          const currentQuizId =
            normalizeQuizId(
              attempt.quizId ??
                ""
            );

          const currentStudentEmail =
            normalizeEmail(
              attempt.studentEmailNormalized ??
                attempt.studentEmail ??
                ""
            );

          if (
            currentQuizId !==
              quizId ||
            currentStudentEmail !==
              studentEmail
          ) {
            return {
              type:
                "error" as const,

              status:
                409,

              messageKey:
                "attempts.pinReset.credentialMismatch",

              message:
                "The student identity no longer matches this PIN reset request.",
            };
          }

          /* ===============================================
             Credential identity
             =============================================== */

          const credentialAttemptId =
            typeof credential.attemptId ===
            "string"
              ? credential.attemptId.trim()
              : "";

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
            credentialAttemptId !==
              attemptId ||
            credentialQuizId !==
              quizId ||
            credentialEmail !==
              studentEmail
          ) {
            console.error(
              "Student credential identity mismatch during PIN reset approval.",
              {
                attemptId,
                credentialId:
                  credentialSnapshot.id,
              }
            );

            return {
              type:
                "error" as const,

              status:
                409,

              messageKey:
                "attempts.pinReset.credentialMismatch",

              message:
                "The student PIN credential does not match this quiz attempt.",
            };
          }

          /* ===============================================
             Reset request
             =============================================== */

          if (
            credential.pinResetRequested !==
            true
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
                "attempts.pinReset.noPendingRequest",

              message:
                "This student has not requested a PIN reset.",
            };
          }

          /* ===============================================
             Already approved
             =============================================== */

          if (
            credential.pinResetStatus ===
            RESET_REQUEST_STATUS_APPROVED
          ) {
            const codeStillUsable =
              typeof credential.resetCodeHash ===
                "string" &&
              credential.resetCodeHash.length >
                0 &&
              typeof credential.resetCodeExpiresAt ===
                "string" &&
              !isDateExpired(
                credential.resetCodeExpiresAt
              );

            if (
              codeStillUsable
            ) {
              transaction.update(
                attemptRef,
                {
                  pinResetRequested:
                    true,

                  pinResetStatus:
                    RESET_REQUEST_STATUS_APPROVED,

                  pinResetRequestedAt:
                    credential.pinResetRequestedAt ??
                    attempt.pinResetRequestedAt ??
                    null,

                  pinResetApprovedAt:
                    credential.pinResetApprovedAt ??
                    attempt.pinResetApprovedAt ??
                    null,
                }
              );

              return {
                type:
                  "error" as const,

                status:
                  409,

                messageKey:
                  "attempts.pinReset.alreadyApproved",

                message:
                  "This PIN reset request has already been approved.",
              };
            }

            /*
             * Approved state exists but its code is no longer
             * usable. The student must request a new reset.
             */
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
                  new Date().toISOString(),
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
                "The previous temporary reset code has expired. The student must request a new PIN reset.",
            };
          }

          /* ===============================================
             Must be pending
             =============================================== */

          if (
            credential.pinResetStatus !==
            RESET_REQUEST_STATUS_PENDING
          ) {
            return {
              type:
                "error" as const,

              status:
                409,

              messageKey:
                "attempts.pinReset.noPendingRequest",

              message:
                "There is no pending PIN reset request for this student.",
            };
          }

          /* ===============================================
             Generate code
             =============================================== */

          const resetCode =
            generateStudentPinResetCode();

          const resetCodeHash =
            hashStudentPinResetCode({
              code:
                resetCode,

              quizId,

              studentEmail,
            });

          const resetCodeExpiresAt =
            createStudentPinResetCodeExpiresAt();

          const now =
            new Date().toISOString();

          /* ===============================================
             Credential update
             =============================================== */

          transaction.update(
            credentialRef,
            {
              pinResetRequested:
                true,

              pinResetStatus:
                RESET_REQUEST_STATUS_APPROVED,

              resetCodeHash,

              resetCodeExpiresAt,

              resetCodeFailedAttempts:
                0,

              pinResetApprovedAt:
                now,

              pinResetApprovedBy:
                userId,

              updatedAt:
                now,
            }
          );

          /* ===============================================
             Public attempt state
             =============================================== */

          transaction.update(
            attemptRef,
            {
              pinResetRequested:
                true,

              pinResetStatus:
                RESET_REQUEST_STATUS_APPROVED,

              pinResetRequestedAt:
                credential.pinResetRequestedAt ??
                attempt.pinResetRequestedAt ??
                now,

              pinResetApprovedAt:
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

            resetCode,

            expiresAt:
              resetCodeExpiresAt,
          };
        }
      );

    /* =====================================================
       Result
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
      });
    }

    return NextResponse.json(
      {
        success:
          true,

        status:
          RESET_REQUEST_STATUS_APPROVED,

        attemptId:
          result.attemptId,

        studentName:
          result.studentName,

        resetCode:
          result.resetCode,

        expiresAt:
          result.expiresAt,

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

          Pragma:
            "no-cache",
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