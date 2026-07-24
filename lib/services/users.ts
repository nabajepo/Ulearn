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
 * • Detect and clean up expired teacher accounts.
 * • Maintain the quiz linked to each teacher.
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

    message:
      "Teacher created successfully.",
  };
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
 * This currently removes the Firestore profile only.
 *
 * Clerk account deletion can later be handled using
 * a secure server-side route.
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
 * If expired:
 * 1. mark the profile as expired;
 * 2. delete the Firestore profile;
 * 3. decrease the active teacher statistic.
 *
 * Important:
 * ----------
 * This cleanup currently runs when the application
 * calls this function.
 *
 * Later, automatic server-side cleanup can be added
 * so expired accounts are removed even when the
 * teacher never reconnects.
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
   * Mark first, then delete.
   *
   * This keeps the account state explicit if the deletion
   * operation fails after the status update.
   */
  await markTeacherAsExpired(
    teacherId
  );

  await deleteTeacher(
    teacherId
  );

  return {
    deleted: true,
    teacher: null,
    message:
      "Expired teacher account deleted.",
  };
}