import "server-only";

import {
  clerkClient,
} from "@clerk/nextjs/server";

import type {
  DocumentData,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import {
  adminDb,
} from "@/lib/firebaseAdmin";

import {
  sendEmail,
} from "@/lib/email/mailer";

import {
  generateExpirationArchive,
} from "@/lib/server/expiration/archive";

import {
  calculateAutomaticScore,
  type Attempt,
} from "@/lib/services/attempts";

import type {
  Question,
} from "@/lib/services/questions";

import type {
  Quiz,
} from "@/lib/services/quizzes";

/* =========================================================
   Constants
   ========================================================= */

const WARNING_BEFORE_EXPIRATION_MS =
  3 * 60 * 60 * 1000;

const USERS_COLLECTION =
  "users";

const QUIZZES_COLLECTION =
  "quizzes";

const QUESTIONS_COLLECTION =
  "questions";

const ATTEMPTS_COLLECTION =
  "attempts";

const STUDENT_ATTEMPT_CREDENTIALS_COLLECTION =
  "studentAttemptCredentials";

/* =========================================================
   Internal teacher representation
   ========================================================= */

type ExpirationTeacher = {
  id: string;

  name: string;
  email: string;

  expiresAt: string;

  quizId: string | null;

  status:
    | "active"
    | "expired";

  expirationWarningSentAt:
    string | null;
};

/* =========================================================
   Cleanup result
   ========================================================= */

export type ExpirationCleanupResult = {
  checkedTeachers: number;

  warningsSent: number;

  expiredTeachers: number;

  archivesSent: number;

  deletedTeachers: number;

  errors: Array<{
    teacherId: string;
    message: string;
  }>;
};

/* =========================================================
   Helpers
   ========================================================= */

function getString(
  value: unknown
) {
  return typeof value === "string"
    ? value
    : "";
}

function getNullableString(
  value: unknown
) {
  return typeof value === "string"
    ? value
    : null;
}

function mapTeacher(
  snapshot: QueryDocumentSnapshot<DocumentData>
): ExpirationTeacher {
  const data =
    snapshot.data();

  return {
    id:
      snapshot.id,

    name:
      getString(
        data.name
      ),

    email:
      getString(
        data.email
      )
        .trim()
        .toLowerCase(),

    expiresAt:
      getString(
        data.expiresAt
      ),

    quizId:
      getNullableString(
        data.quizId
      ),

    status:
      data.status === "expired"
        ? "expired"
        : "active",

    expirationWarningSentAt:
      getNullableString(
        data.expirationWarningSentAt
      ),
  };
}

function getExpirationTime(
  teacher: ExpirationTeacher
) {
  return new Date(
    teacher.expiresAt
  ).getTime();
}

function getErrorMessage(
  error: unknown
) {
  if (
    error instanceof Error
  ) {
    return error.message;
  }

  return "Unknown cleanup error.";
}

/* =========================================================
   HTML escaping
   ========================================================= */

function escapeHtml(
  value: string
) {
  return value
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}

/* =========================================================
   Warning email
   ========================================================= */

async function sendExpirationWarning(
  teacher: ExpirationTeacher
) {
  if (!teacher.email) {
    throw new Error(
      "Teacher email is missing."
    );
  }

  const expiresAt =
    new Date(
      teacher.expiresAt
    );

  const expirationText =
    Number.isNaN(
      expiresAt.getTime()
    )
      ? teacher.expiresAt
      : expiresAt.toLocaleString(
          "en-CA",
          {
            timeZone:
              "America/Toronto",

            dateStyle:
              "medium",

            timeStyle:
              "short",
          }
        );

  /*
   * Stable idempotency key:
   * if the cleanup is retried, Resend should treat this
   * as the same warning email.
   */
  await sendEmail({
    to:
      teacher.email,

    subject:
      "ULearn account expiration reminder",

    text:
      `Hello ${teacher.name || "Professor"},\n\n` +
      `Your temporary ULearn teacher account will expire soon.\n\n` +
      `Expiration: ${expirationText}\n\n` +
      `Please complete any remaining grading before the account expires.\n\n` +
      `When the account expires, ULearn will automatically prepare and email your final correction archive.\n\n` +
      `ULearn`,

    html:
      `<p>Hello ${escapeHtml(
        teacher.name || "Professor"
      )},</p>` +
      `<p>Your temporary ULearn teacher account will expire soon.</p>` +
      `<p><strong>Expiration:</strong> ${escapeHtml(
        expirationText
      )}</p>` +
      `<p>Please complete any remaining grading before the account expires.</p>` +
      `<p>When the account expires, ULearn will automatically prepare and email your final correction archive.</p>` +
      `<p>ULearn</p>`,

    idempotencyKey:
      `teacher-expiration-warning-${teacher.id}`,
  });

  /*
   * Mark the warning only AFTER the email succeeds.
   */
  await adminDb
    .collection(
      USERS_COLLECTION
    )
    .doc(
      teacher.id
    )
    .update({
      expirationWarningSentAt:
        new Date()
          .toISOString(),
    });
}

/* =========================================================
   Firestore loading
   ========================================================= */

async function getQuizForTeacher(
  teacher: ExpirationTeacher
): Promise<Quiz | null> {
  /*
   * Normal case:
   * the teacher document already contains quizId.
   */
  if (teacher.quizId) {
    const snapshot =
      await adminDb
        .collection(
          QUIZZES_COLLECTION
        )
        .doc(
          teacher.quizId
        )
        .get();

    if (
      snapshot.exists
    ) {
      return {
        id:
          snapshot.id,

        ...snapshot.data(),
      } as Quiz;
    }
  }

  /*
   * Fallback for an older/inconsistent teacher document.
   */
  const snapshot =
    await adminDb
      .collection(
        QUIZZES_COLLECTION
      )
      .where(
        "teacherId",
        "==",
        teacher.id
      )
      .limit(1)
      .get();

  if (
    snapshot.empty
  ) {
    return null;
  }

  const quizDocument =
    snapshot.docs[0];

  return {
    id:
      quizDocument.id,

    ...quizDocument.data(),
  } as Quiz;
}

async function getQuestions(
  quizId: string
): Promise<Question[]> {
  const snapshot =
    await adminDb
      .collection(
        QUESTIONS_COLLECTION
      )
      .where(
        "quizId",
        "==",
        quizId
      )
      .get();

  return snapshot.docs
    .map(
      (
        document
      ) => ({
        id:
          document.id,

        ...document.data(),
      } as Question)
    )
    .sort(
      (
        first,
        second
      ) =>
        first.order -
        second.order
    );
}

async function getAttempts(
  quizId: string
): Promise<Attempt[]> {
  const snapshot =
    await adminDb
      .collection(
        ATTEMPTS_COLLECTION
      )
      .where(
        "quizId",
        "==",
        quizId
      )
      .get();

  return snapshot.docs.map(
    (
      document
    ) => ({
      id:
        document.id,

      ...document.data(),
    } as Attempt)
  );
}

/* =========================================================
   Expired in-progress attempts
   ========================================================= */

/**
 * Finalizes expired student attempts before creating
 * the final teacher archive.
 *
 * The same calculateAutomaticScore() function used by the
 * normal attempt submission flow is reused here.
 *
 * We never invent development grades.
 */
async function finalizeExpiredInProgressAttempts(
  quizId: string,
  questions: Question[]
) {
  const snapshot =
    await adminDb
      .collection(
        ATTEMPTS_COLLECTION
      )
      .where(
        "quizId",
        "==",
        quizId
      )
      .where(
        "status",
        "==",
        "in_progress"
      )
      .get();

  if (
    snapshot.empty
  ) {
    return;
  }

  const now =
    new Date()
      .toISOString();

  const nowMs =
    Date.now();

  const batch =
    adminDb.batch();

  let hasUpdates =
    false;

  for (
    const document of
    snapshot.docs
  ) {
    const data =
      document.data();

    const attempt =
      {
        id:
          document.id,

        ...data,
      } as Attempt;

    const expiresAt =
      new Date(
        attempt.expiresAt
      ).getTime();

    /*
     * Ignore invalid expiration dates and attempts whose
     * personal quiz timer has not expired yet.
     */
    if (
      Number.isNaN(
        expiresAt
      ) ||
      expiresAt >
        nowMs
    ) {
      continue;
    }

    /*
     * Exact same automatic scoring algorithm used by
     * the normal submitAttempt() flow.
     */
    const grading =
      calculateAutomaticScore(
        attempt,
        questions
      );

    const automaticScore =
      grading.automaticScore;

    const requiresManualGrading =
      grading.developmentQuestions >
      0;

    /* =====================================================
       Quiz containing only automatically graded questions
       ===================================================== */

    if (
      !requiresManualGrading
    ) {
      batch.update(
        document.ref,
        {
          status:
            "graded",

          automaticScore,

          manualScore:
            0,

          finalScore:
            automaticScore,

          developmentScores:
            {},

          submittedAt:
            attempt.submittedAt ??
            now,

          gradedAt:
            now,

          updatedAt:
            now,
        }
      );

      hasUpdates =
        true;

      continue;
    }

    /* =====================================================
       Quiz containing development questions
       ===================================================== */

    batch.update(
      document.ref,
      {
        status:
          "submitted",

        automaticScore,

        /*
         * No teacher grade is invented.
         *
         * AttemptCorrectionPdf in expirationArchive mode
         * will display the development part as not graded
         * and the final score as unavailable.
         */
        manualScore:
          0,

        finalScore:
          null,

        developmentScores:
          {},

        submittedAt:
          attempt.submittedAt ??
          now,

        gradedAt:
          null,

        updatedAt:
          now,
      }
    );

    hasUpdates =
      true;
  }

  /*
   * Avoid committing an empty batch.
   */
  if (
    hasUpdates
  ) {
    await batch.commit();
  }
}

/* =========================================================
   Archive email
   ========================================================= */

async function sendExpirationArchive(
  teacher: ExpirationTeacher,
  quiz: Quiz,
  attempts: Attempt[],
  questions: Question[]
) {
  if (!teacher.email) {
    throw new Error(
      "Teacher email is missing."
    );
  }

  const archive =
    await generateExpirationArchive({
      quiz,
      attempts,
      questions,

      /*
       * Teacher language is not currently stored in the
       * teacher document, so the automatic archive defaults
       * to English for now.
       */
      language:
        "en",
    });

  await sendEmail({
    to:
      teacher.email,

    subject:
      `ULearn final corrections - ${quiz.title}`,

    text:
      `Hello ${teacher.name || "Professor"},\n\n` +
      `Your ULearn teacher account has reached its expiration date.\n\n` +
      `Attached is the final archive containing the student correction PDFs for "${quiz.title}".\n\n` +
      `Number of copies: ${archive.pdfCount}\n\n` +
      `ULearn`,

    html:
      `<p>Hello ${escapeHtml(
        teacher.name || "Professor"
      )},</p>` +
      `<p>Your ULearn teacher account has reached its expiration date.</p>` +
      `<p>Attached is the final archive containing the student correction PDFs for <strong>${escapeHtml(
        quiz.title
      )}</strong>.</p>` +
      `<p><strong>Number of copies:</strong> ${archive.pdfCount}</p>` +
      `<p>ULearn</p>`,

    attachments: [
      {
        filename:
          archive.filename,

        content:
          archive.buffer,

        contentType:
          "application/zip",
      },
    ],

    /*
     * Stable idempotency key.
     *
     * If Resend accepted the email but cleanup failed
     * afterwards, the next cleanup execution uses the same
     * logical email key.
     */
    idempotencyKey:
      `teacher-expiration-archive-${teacher.id}`,
  });

  return archive;
}

/* =========================================================
   Firestore deletion helper
   ========================================================= */

async function deleteQueryInBatches(
  collectionName: string,
  field: string,
  value: string
) {
  const BATCH_SIZE =
    400;

  while (true) {
    const snapshot =
      await adminDb
        .collection(
          collectionName
        )
        .where(
          field,
          "==",
          value
        )
        .limit(
          BATCH_SIZE
        )
        .get();

    if (
      snapshot.empty
    ) {
      return;
    }

    const batch =
      adminDb.batch();

    snapshot.docs.forEach(
      (
        document
      ) => {
        batch.delete(
          document.ref
        );
      }
    );

    await batch.commit();

    if (
      snapshot.size <
      BATCH_SIZE
    ) {
      return;
    }
  }
}

/* =========================================================
   Delete quiz-related Firestore data
   ========================================================= */

async function deleteQuizData(
  quiz: Quiz
) {
  /*
   * Delete child documents first.
   */
  await deleteQueryInBatches(
    QUESTIONS_COLLECTION,
    "quizId",
    quiz.id
  );

  await deleteQueryInBatches(
    ATTEMPTS_COLLECTION,
    "quizId",
    quiz.id
  );

  await deleteQueryInBatches(
    STUDENT_ATTEMPT_CREDENTIALS_COLLECTION,
    "quizId",
    quiz.id
  );

  /*
   * Delete the quiz itself.
   */
  await adminDb
    .collection(
      QUIZZES_COLLECTION
    )
    .doc(
      quiz.id
    )
    .delete();
}

/* =========================================================
   Clerk deletion
   ========================================================= */

async function deleteClerkTeacher(
  teacherId: string
) {
  const client =
    await clerkClient();

  await client.users.deleteUser(
    teacherId
  );
}

/* =========================================================
   Delete teacher Firestore profile
   ========================================================= */

async function deleteTeacherProfile(
  teacherId: string
) {
  await adminDb
    .collection(
      USERS_COLLECTION
    )
    .doc(
      teacherId
    )
    .delete();
}

/* =========================================================
   Final account deletion
   ========================================================= */

/**
 * The teacher Firestore document is deliberately deleted LAST.
 *
 * Why?
 *
 * If Clerk deletion fails after quiz data was removed,
 * the teacher document remains available so the next cleanup
 * can find the expired teacher and retry Clerk deletion.
 */
async function deleteExpiredTeacher(
  teacher: ExpirationTeacher,
  quiz: Quiz | null
) {
  if (quiz) {
    await deleteQuizData(
      quiz
    );
  }

  /*
   * Remove authentication account before removing the final
   * Firestore teacher record.
   */
  await deleteClerkTeacher(
    teacher.id
  );

  /*
   * Delete the teacher document only after Clerk succeeds.
   */
  await deleteTeacherProfile(
    teacher.id
  );
}

/* =========================================================
   Process expired teacher
   ========================================================= */

async function processExpiredTeacher(
  teacher: ExpirationTeacher
) {
  /*
   * Mark the account expired immediately.
   *
   * This does NOT delete teacher data.
   */
  if (
    teacher.status !==
    "expired"
  ) {
    await adminDb
      .collection(
        USERS_COLLECTION
      )
      .doc(
        teacher.id
      )
      .update({
        status:
          "expired",

        updatedAt:
          new Date()
            .toISOString(),
      });
  }

  const quiz =
    await getQuizForTeacher(
      teacher
    );

  /* =======================================================
     No quiz
     ======================================================= */

  if (!quiz) {
    /*
     * There are no correction PDFs to archive.
     */
    await deleteExpiredTeacher(
      teacher,
      null
    );

    return {
      archiveSent:
        false,

      deleted:
        true,
    };
  }

  /* =======================================================
     Load questions FIRST
     ======================================================= */

  const questions =
    await getQuestions(
      quiz.id
    );

  /*
   * Finalize expired in-progress attempts using exactly
   * the same automatic scoring algorithm as submitAttempt().
   */
  await finalizeExpiredInProgressAttempts(
    quiz.id,
    questions
  );

  /*
   * Reload attempts AFTER finalization so the archive gets
   * the updated automatic scores and statuses.
   */
  const attempts =
    await getAttempts(
      quiz.id
    );

  /* =======================================================
     No students
     ======================================================= */

  if (
    attempts.length ===
    0
  ) {
    /*
     * Nothing exists to archive.
     */
    await deleteExpiredTeacher(
      teacher,
      quiz
    );

    return {
      archiveSent:
        false,

      deleted:
        true,
    };
  }

  /* =======================================================
     Final archive
     ======================================================= */

  /*
   * CRITICAL RULE:
   *
   * From this point onward, teacher data must NOT be deleted
   * unless the archive email succeeds.
   */
  await sendExpirationArchive(
    teacher,
    quiz,
    attempts,
    questions
  );

  /*
   * sendExpirationArchive() returned successfully.
   *
   * Resend therefore accepted the archive email.
   *
   * Only now can deletion begin.
   */
  await deleteExpiredTeacher(
    teacher,
    quiz
  );

  return {
    archiveSent:
      true,

    deleted:
      true,
  };
}

/* =========================================================
   Main cleanup
   ========================================================= */

/**
 * Runs one complete teacher expiration scan.
 *
 * Later:
 *
 * app/api/cleanup/route.ts
 *
 * will call this function after validating CLEANUP_SECRET.
 */
export async function runExpirationCleanup(): Promise<ExpirationCleanupResult> {
  const result:
    ExpirationCleanupResult = {
    checkedTeachers:
      0,

    warningsSent:
      0,

    expiredTeachers:
      0,

    archivesSent:
      0,

    deletedTeachers:
      0,

    errors:
      [],
  };

  const teachersSnapshot =
    await adminDb
      .collection(
        USERS_COLLECTION
      )
      .get();

  const teachers =
    teachersSnapshot.docs.map(
      mapTeacher
    );

  result.checkedTeachers =
    teachers.length;

  /*
   * Process sequentially.
   *
   * ULearn has a very small teacher limit, so this keeps
   * PDF generation and email sending predictable.
   */
  for (
    const teacher of
    teachers
  ) {
    try {
      const expirationTime =
        getExpirationTime(
          teacher
        );

      if (
        Number.isNaN(
          expirationTime
        )
      ) {
        throw new Error(
          "Teacher expiration date is invalid."
        );
      }

      const now =
        Date.now();

      const remainingTime =
        expirationTime -
        now;

      /* ===================================================
         Account expired
         =================================================== */

      if (
        remainingTime <=
        0
      ) {
        result.expiredTeachers +=
          1;

        const expirationResult =
          await processExpiredTeacher(
            teacher
          );

        if (
          expirationResult.archiveSent
        ) {
          result.archivesSent +=
            1;
        }

        if (
          expirationResult.deleted
        ) {
          result.deletedTeachers +=
            1;
        }

        continue;
      }

      /* ===================================================
         Three-hour warning window
         =================================================== */

      if (
        remainingTime <=
          WARNING_BEFORE_EXPIRATION_MS &&
        !teacher.expirationWarningSentAt
      ) {
        await sendExpirationWarning(
          teacher
        );

        result.warningsSent +=
          1;
      }
    } catch (
      error
    ) {
      /*
       * Failure for one teacher must not prevent other
       * teacher accounts from being processed.
       */
      console.error(
        `Expiration cleanup failed for teacher ${teacher.id}:`,
        error
      );

      result.errors.push({
        teacherId:
          teacher.id,

        message:
          getErrorMessage(
            error
          ),
      });
    }
  }

  return result;
}