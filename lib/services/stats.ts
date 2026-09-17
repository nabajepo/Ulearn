// lib/services/stats.ts

import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  increment,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

/**
 * Global statistics for the ULearn platform.
 *
 * Current statistics:
 * - activeTeachers is calculated directly from the users collection.
 * - activeQuizzes is stored as a counter.
 *
 * Historical statistics:
 * - totalTeachers counts all teacher accounts ever created.
 * - totalQuizzesCreated counts all quizzes ever created.
 */

export type AppStats = {
  activeTeachers: number;
  totalTeachers: number;
  activeQuizzes: number;
  totalQuizzesCreated: number;
};

const STATS_COLLECTION = "appStats";
const STATS_DOCUMENT_ID = "main";

const USERS_COLLECTION = "users";

/**
 * Reference to the main statistics document.
 */
const statsRef = doc(
  db,
  STATS_COLLECTION,
  STATS_DOCUMENT_ID
);

/**
 * Default statistics.
 *
 * activeTeachers is not taken from this document anymore.
 * It is calculated from the users collection.
 */
const defaultStats: AppStats = {
  activeTeachers: 0,
  totalTeachers: 0,
  activeQuizzes: 0,
  totalQuizzesCreated: 0,
};

/* =========================================================
   Stats document
   ========================================================= */

/**
 * Creates appStats/main if it does not already exist.
 */
export async function ensureStatsDocumentExists() {
  const snapshot =
    await getDoc(statsRef);

  if (!snapshot.exists()) {
    await setDoc(
      statsRef,
      defaultStats
    );
  }
}

/* =========================================================
   Active teachers
   ========================================================= */

/**
 * Returns the real number of teacher accounts
 * currently present in the users collection.
 *
 * Example:
 *
 * users/
 *   user_A
 *   user_B
 *
 * activeTeachers = 2
 */
export async function getActiveTeachersCount():
  Promise<number> {
  const usersRef =
    collection(
      db,
      USERS_COLLECTION
    );

  const snapshot =
    await getCountFromServer(
      usersRef
    );

  return snapshot.data().count;
}

/* =========================================================
   Read platform statistics
   ========================================================= */

/**
 * Gets the current platform statistics.
 *
 * activeTeachers comes directly from users.
 *
 * The other statistics continue to come from
 * appStats/main.
 */
export async function getAppStats():
  Promise<AppStats> {
  await ensureStatsDocumentExists();

  const [
    statsSnapshot,
    activeTeachers,
  ] =
    await Promise.all([
      getDoc(statsRef),
      getActiveTeachersCount(),
    ]);

  if (!statsSnapshot.exists()) {
    return {
      ...defaultStats,
      activeTeachers,
    };
  }

  const data =
    statsSnapshot.data();

  return {
    activeTeachers,

    totalTeachers:
      typeof data.totalTeachers ===
      "number"
        ? data.totalTeachers
        : 0,

    activeQuizzes:
      typeof data.activeQuizzes ===
      "number"
        ? Math.max(
            0,
            data.activeQuizzes
          )
        : 0,

    totalQuizzesCreated:
      typeof data.totalQuizzesCreated ===
      "number"
        ? data.totalQuizzesCreated
        : 0,
  };
}

/* =========================================================
   Teacher statistics
   ========================================================= */

/**
 * Called when a NEW teacher account is created.
 *
 * We only increase totalTeachers because
 * activeTeachers is calculated directly from users.
 */
export async function increaseTeacherStats() {
  await ensureStatsDocumentExists();

  await updateDoc(
    statsRef,
    {
      totalTeachers:
        increment(1),
    }
  );
}

/**
 * Kept temporarily for compatibility with existing code.
 *
 * activeTeachers is now calculated directly from
 * the users collection, so deleting a teacher does
 * not require changing an activeTeachers counter.
 */
export async function decreaseActiveTeachers() {
  return;
}

/* =========================================================
   Quiz statistics
   ========================================================= */

/**
 * Called when a quiz is created.
 *
 * activeQuizzes increases because the quiz
 * currently exists.
 *
 * totalQuizzesCreated increases because this
 * is a historical counter.
 */
export async function increaseQuizStats() {
  await ensureStatsDocumentExists();

  await updateDoc(
    statsRef,
    {
      activeQuizzes:
        increment(1),

      totalQuizzesCreated:
        increment(1),
    }
  );
}

/**
 * Called when a quiz is deleted.
 *
 * totalQuizzesCreated is NOT decreased because
 * it represents historical quiz creation.
 */
export async function decreaseActiveQuizzes() {
  await ensureStatsDocumentExists();

  await updateDoc(
    statsRef,
    {
      activeQuizzes:
        increment(-1),
    }
  );
}