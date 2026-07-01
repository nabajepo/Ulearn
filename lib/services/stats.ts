// lib/services/stats.ts

import { doc, getDoc, increment, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * This file manages global statistics for the ULearn platform.
 *
 * Instead of reading all users, quizzes, or submissions every time,
 * we store simple counters in one Firestore document:
 *
 * appStats/main
 *
 * This helps reduce Firestore reads and protects the free quota.
 */

export type AppStats = {
  activeTeachers: number;
  totalTeachers: number;
  activeQuizzes: number;
  totalQuizzesCreated: number;
};

const STATS_COLLECTION = "appStats";
const STATS_DOCUMENT_ID = "main";

/**
 * Reference to the main statistics document.
 */
const statsRef = doc(db, STATS_COLLECTION, STATS_DOCUMENT_ID);

/**
 * Default stats used when the document does not exist yet.
 */
const defaultStats: AppStats = {
  activeTeachers: 0,
  totalTeachers: 0,
  activeQuizzes: 0,
  totalQuizzesCreated: 0,
};

/**
 * Creates the stats document if it does not already exist.
 * This should be called before reading or updating stats.
 */
export async function ensureStatsDocumentExists() {
  const snapshot = await getDoc(statsRef);

  if (!snapshot.exists()) {
    await setDoc(statsRef, defaultStats);
  }
}

/**
 * Gets the current platform statistics.
 */
export async function getAppStats(): Promise<AppStats> {
  await ensureStatsDocumentExists();

  const snapshot = await getDoc(statsRef);

  if (!snapshot.exists()) {
    return defaultStats;
  }

  const data = snapshot.data();

  return {
    activeTeachers:
      typeof data.activeTeachers === "number" ? data.activeTeachers : 0,

    totalTeachers:
      typeof data.totalTeachers === "number" ? data.totalTeachers : 0,

    activeQuizzes:
      typeof data.activeQuizzes === "number" ? data.activeQuizzes : 0,

    totalQuizzesCreated:
      typeof data.totalQuizzesCreated === "number"
        ? data.totalQuizzesCreated
        : 0,
  };
}

/**
 * Called when a new teacher account is created.
 *
 * activeTeachers increases because the account is currently active.
 * totalTeachers increases because this is a new teacher who used the platform.
 */
export async function increaseTeacherStats() {
  await ensureStatsDocumentExists();

  await updateDoc(statsRef, {
    activeTeachers: increment(1),
    totalTeachers: increment(1),
  });
}

/**
 * Called when a teacher account expires or is deleted.
 *
 * activeTeachers decreases because the teacher is no longer active.
 */
export async function decreaseActiveTeachers() {
  await ensureStatsDocumentExists();

  await updateDoc(statsRef, {
    activeTeachers: increment(-1),
  });
}

/**
 * Called when a quiz is created.
 *
 * activeQuizzes increases because the quiz currently exists.
 * totalQuizzesCreated increases because a new quiz was created historically.
 */
export async function increaseQuizStats() {
  await ensureStatsDocumentExists();

  await updateDoc(statsRef, {
    activeQuizzes: increment(1),
    totalQuizzesCreated: increment(1),
  });
}

/**
 * Called when a quiz is deleted.
 *
 * activeQuizzes decreases because the quiz no longer exists.
 */
export async function decreaseActiveQuizzes() {
  await ensureStatsDocumentExists();

  await updateDoc(statsRef, {
    activeQuizzes: increment(-1),
  });
}