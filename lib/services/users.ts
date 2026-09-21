// lib/services/users.ts

import {
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { LIMITS } from "@/lib/services/limits";

import {
  decreaseActiveTeachers,
  increaseTeacherStats,
} from "@/lib/services/stats";

/**
 * ============================================================================
 * ULearn - Teacher User Service
 * ============================================================================
 *
 * Responsibilities
 * ----------------
 * • Create and retrieve teacher profiles.
 * • Enforce the maximum number of active teacher accounts.
 * • Calculate the temporary teacher account lifetime.
 * • Detect expired teacher accounts.
 * • Maintain the quiz linked to each teacher.
 * • Track whether the teacher welcome email has been sent.
 * • Track whether the teacher expiration warning has been sent.
 *
 * Important date rule
 * -------------------
 * Teacher account dates are stored as UTC ISO timestamps.
 *
 * Example:
 * createdAt:
 * 2026-07-23T22:30:00.000Z
 *
 * expiresAt:
 * 2026-07-26T22:30:00.000Z
 *
 * The teacher account therefore lasts exactly:
 *
 * ACCOUNT_DURATION_DAYS × 24 hours
 *
 * The teacher's quiz time zone does NOT affect account expiration.
 * ============================================================================
 */

/**
 * User roles supported by ULearn V1.
 */
export type UserRole = "teacher";

/**
 * Possible teacher account states.
 */
export type TeacherStatus = "active" | "expired";

/**
 * Teacher profile stored inside Firestore.
 */
export type Teacher = {
  id: string;

  name: string;
  email: string;

  role: UserRole;

  /**
   * UTC ISO timestamp representing when the ULearn
   * teacher profile was created.
   */
  createdAt: string;

  /**
   * UTC ISO timestamp representing the exact instant
   * when the temporary ULearn account expires.
   */
  expiresAt: string;

  /**
   * In ULearn V1, each teacher may have only one quiz.
   */
  quizId: string | null;

  status: TeacherStatus;

  /**
   * UTC ISO timestamp representing when the welcome
   * email was successfully sent.
   *
   * null means that the welcome email has not yet
   * been successfully sent.
   */
  welcomeEmailSentAt: string | null;

  /**
   * UTC ISO timestamp representing when the expiration
   * warning email was successfully sent.
   *
   * null means that the expiration warning has not yet
   * been successfully sent.
   */
  expirationWarningSentAt: string | null;

  /**
 * UTC ISO timestamp representing when the final
 * expiration email/archive was successfully sent.
 *
 * null means that final expiration delivery has
 * not yet been successfully completed.
 */
 expirationArchiveSentAt:
  string | null;
};

/**
 * Data required when creating a teacher profile.
 */
export type CreateTeacherInput = {
  /**
   * Clerk authenticated user ID.
   */
  id: string;

  name: string;
  email: string;
};

/**
 * Firestore users collection.
 */
const USERS_COLLECTION = "users";

/**
 * Number of milliseconds in one day.
 */
const ONE_DAY_MS =
  24 *
  60 *
  60 *
  1000;

/**
 * Returns the Firestore reference for one teacher.
 */
function teacherRef(teacherId: string) {
  return doc(
    db,
    USERS_COLLECTION,
    teacherId
  );
}

/**
 * Calculates the teacher expiration timestamp from
 * the exact account creation instant.
 *
 * This intentionally uses milliseconds instead of Date.setDate().
 *
 * Why?
 * ----
 * ULearn accounts should exist for an exact amount of time:
 *
 * 3 days = 72 hours
 *
 * rather than 3 local calendar days that could theoretically
 * be affected by daylight-saving changes.
 */
function getExpirationDateFromCreation(
  createdAtMs: number
) {
  const accountDurationMs =
    LIMITS.ACCOUNT_DURATION_DAYS *
    ONE_DAY_MS;

  return new Date(
    createdAtMs + accountDurationMs
  ).toISOString();
}

/**
 * Checks whether an expiration timestamp has passed.
 */
export function isTeacherExpired(
  expiresAt: string
) {
  const expirationTime =
    new Date(expiresAt).getTime();

  /*
   * Invalid expiration dates should not be considered active.
   */
  if (Number.isNaN(expirationTime)) {
    return true;
  }

  return expirationTime <= Date.now();
}

/**
 * Returns the remaining teacher account lifetime
 * in milliseconds.
 *
 * Useful for quiz scheduling rules.
 */
export function getTeacherRemainingTimeMs(
  expiresAt: string
) {
  const expirationTime =
    new Date(expiresAt).getTime();

  if (Number.isNaN(expirationTime)) {
    return 0;
  }

  return Math.max(
    0,
    expirationTime - Date.now()
  );
}

/**
 * Returns the remaining teacher account lifetime
 * in complete minutes.
 */
export function getTeacherRemainingMinutes(
  expiresAt: string
) {
  return Math.floor(
    getTeacherRemainingTimeMs(expiresAt) /
      (60 * 1000)
  );
}

/**
 * Counts all teacher documents currently stored
 * in Firestore.
 */
export async function getTeacherCount() {
  const usersRef = collection(
    db,
    USERS_COLLECTION
  );

  const snapshot =
    await getCountFromServer(usersRef);

  return snapshot.data().count;
}

/**
 * Checks whether another teacher account may be created.
 */
export async function hasTeacherSlot() {
  const count = await getTeacherCount();

  return count < LIMITS.MAX_TEACHERS;
}

/**
 * Retrieves one teacher profile using the Clerk user ID.
 */
export async function getTeacher(
  teacherId: string
): Promise<Teacher | null> {
  const snapshot = await getDoc(
    teacherRef(teacherId)
  );

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();

  return {
    id: snapshot.id,

    name:
      typeof data.name === "string"
        ? data.name
        : "",

    email:
      typeof data.email === "string"
        ? data.email
        : "",

    role: "teacher",

    createdAt:
      typeof data.createdAt === "string"
        ? data.createdAt
        : "",

    expiresAt:
      typeof data.expiresAt === "string"
        ? data.expiresAt
        : "",

    quizId:
      typeof data.quizId === "string"
        ? data.quizId
        : null,

    status:
      data.status === "expired"
        ? "expired"
        : "active",

    /*
     * Backward-compatible:
     *
     * Older teacher documents created before the email
     * system was added do not contain this field.
     *
     * They are therefore treated as not having received
     * the welcome email yet.
     */
    welcomeEmailSentAt:
      typeof data.welcomeEmailSentAt === "string"
        ? data.welcomeEmailSentAt
        : null,

    /*
     * Backward-compatible:
     *
     * Existing teacher documents created before the
     * expiration-warning system do not contain this field.
     *
     * They are therefore treated as not having received
     * the expiration warning yet.
     */
    expirationWarningSentAt:
      typeof data.expirationWarningSentAt === "string"
        ? data.expirationWarningSentAt
        : null,
    expirationArchiveSentAt:
      typeof data.expirationArchiveSentAt ===
      "string"
      ? data.expirationArchiveSentAt
      : null,    
  };
}

/**
 * Checks whether a teacher already exists.
 */
export async function teacherExists(
  teacherId: string
) {
  const teacher =
    await getTeacher(teacherId);

  return teacher !== null;
}

/**
 * Creates a teacher profile.
 *
 * Rules:
 * ------
 * • Existing teachers are returned without creating a duplicate.
 * • The global teacher limit is enforced.
 * • createdAt and expiresAt are based on the same timestamp.
 * • expiresAt is exactly ACCOUNT_DURATION_DAYS × 24 hours later.
 * • New teachers begin with welcomeEmailSentAt = null.
 * • New teachers begin with expirationWarningSentAt = null.
 *
 * Important:
 * ----------
 * This function does NOT send emails itself.
 *
 * Email sending must be handled by secure server-side routes
 * because the Resend API key must never be exposed to the browser.
 */
export async function createTeacher(
  input: CreateTeacherInput
) {
  /*
   * First check whether this Clerk user already owns
   * a Firestore teacher profile.
   */
  const existingTeacher =
    await getTeacher(input.id);

  if (existingTeacher) {
    return {
      success: true,
      teacher: existingTeacher,
      created: false,
      message: "Teacher already exists.",
    };
  }

  /*
   * Check the ULearn testing account limit.
   */
  const canCreateTeacher =
    await hasTeacherSlot();

  if (!canCreateTeacher) {
    return {
      success: false,
      teacher: null,
      created: false,
      message: "Teacher limit reached.",
    };
  }

  /*
   * IMPORTANT:
   * We call Date.now() only once so createdAt and expiresAt
   * originate from exactly the same instant.
   */
  const createdAtMs = Date.now();

  const createdAt =
    new Date(createdAtMs).toISOString();

  const expiresAt =
    getExpirationDateFromCreation(
      createdAtMs
    );

  const teacher: Omit<
    Teacher,
    "id"
  > = {
    name: input.name.trim(),
    email: input.email.trim(),

    role: "teacher",

    createdAt,
    expiresAt,

    quizId: null,

    status: "active",

    /*
     * The secure welcome-email route will replace this
     * with the UTC ISO timestamp after Resend confirms
     * that the email was accepted.
     */
    welcomeEmailSentAt: null,

    /*
     * The automatic expiration-warning service will replace
     * this with the UTC ISO timestamp after the warning email
     * has been successfully accepted by the email provider.
     */
    expirationWarningSentAt: null,
    /*
 * Set only after the final expiration
 * email/archive has been accepted by
 * the email provider.
 */
    expirationArchiveSentAt: null,
  };

  /*
   * createdAtServer is stored in addition to createdAt.
   *
   * createdAt:
   * Used directly by the application as a portable ISO value.
   *
   * createdAtServer:
   * Firestore's server-side creation timestamp.
   */
  await setDoc(
    teacherRef(input.id),
    {
      ...teacher,

      createdAtServer:
        serverTimestamp(),
    }
  );

  await increaseTeacherStats();

  return {
    success: true,

    teacher: {
      id: input.id,
      ...teacher,
    },

    created: true,

    message:
      "Teacher created successfully.",
  };
}

/**
 * Marks the teacher welcome email as successfully sent.
 *
 * This should only be called after the secure server-side
 * email route receives a successful response from Resend.
 *
 * The timestamp is stored in UTC ISO format.
 */
export async function markTeacherWelcomeEmailAsSent(
  teacherId: string
) {
  const sentAt =
    new Date().toISOString();

  await updateDoc(
    teacherRef(teacherId),
    {
      welcomeEmailSentAt: sentAt,
    }
  );

  return sentAt;
}

/**
 * Marks the teacher expiration warning email as successfully sent.
 *
 * This must only be called after the warning email has been
 * successfully accepted by the email provider.
 *
 * Storing this timestamp prevents the automatic cleanup job
 * from sending the same warning again on every execution.
 */
export async function markTeacherExpirationWarningAsSent(
  teacherId: string
) {
  const sentAt =
    new Date().toISOString();

  await updateDoc(
    teacherRef(teacherId),
    {
      expirationWarningSentAt: sentAt,
    }
  );

  return sentAt;
}

/**
 * Updates the quiz associated with the teacher.
 *
 * In ULearn V1:
 * • one teacher = one quiz
 *
 * quizId = null means the teacher may create another quiz.
 */
export async function updateTeacherQuiz(
  teacherId: string,
  quizId: string | null
) {
  await updateDoc(
    teacherRef(teacherId),
    {
      quizId,
    }
  );
}

/**
 * Marks a teacher as expired.
 */
export async function markTeacherAsExpired(
  teacherId: string
) {
  await updateDoc(
    teacherRef(teacherId),
    {
      status: "expired",
    }
  );
}

/**
 * Deletes a teacher profile from Firestore.
 *
 * Important:
 * ----------
 * This removes the Firestore profile only.
 *
 * Clerk account deletion is handled separately by the
 * secure server-side expiration cleanup process.
 */
export async function deleteTeacher(
  teacherId: string
) {
  const teacher =
    await getTeacher(teacherId);

  /*
   * Makes deletion idempotent.
   */
  if (!teacher) {
    return {
      success: true,
      message:
        "Teacher does not exist.",
    };
  }

  await deleteDoc(
    teacherRef(teacherId)
  );

  await decreaseActiveTeachers();

  return {
    success: true,
    message:
      "Teacher deleted successfully.",
  };
}

/**
 * Checks whether the teacher account has expired.
 *
 * IMPORTANT:
 * ----------
 * This function deliberately does NOT delete anything.
 *
 * Expired-account deletion must be performed only by the
 * secure server-side expiration process.
 *
 * That process will:
 *
 * 1. finalize the state that must be archived;
 * 2. generate the correction ZIP;
 * 3. send the ZIP to the teacher;
 * 4. confirm that the email operation succeeded;
 * 5. delete the related ULearn data;
 * 6. delete the Clerk account.
 *
 * If archive/email delivery fails, this function must never
 * cause the teacher data to be deleted.
 */
export async function cleanupExpiredTeacher(
  teacherId: string
) {
  const teacher =
    await getTeacher(teacherId);

  if (!teacher) {
    return {
      deleted: false,
      teacher: null,
      message: "Teacher not found.",
    };
  }

  if (
    !isTeacherExpired(
      teacher.expiresAt
    )
  ) {
    return {
      deleted: false,
      teacher,
      message:
        "Teacher account is still active.",
    };
  }

  /*
   * Marking the profile as expired blocks the account state,
   * but deletion is intentionally left to the secure
   * expiration service after successful archive delivery.
   */
  if (
    teacher.status !==
    "expired"
  ) {
    await markTeacherAsExpired(
      teacherId
    );
  }

  const expiredTeacher: Teacher = {
    ...teacher,
    status: "expired",
  };

  return {
    deleted: false,
    teacher:
      expiredTeacher,
    message:
      "Teacher account expired. Secure archive cleanup is required.",
  };
}