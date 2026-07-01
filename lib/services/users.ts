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
import { decreaseActiveTeachers, increaseTeacherStats } from "@/lib/services/stats";

/**
 * User role supported in ULearn V1.
 * For now, we mainly create teacher accounts.
 */
export type UserRole = "teacher";

/**
 * Teacher profile stored in Firestore.
 */
export type Teacher = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  expiresAt: string;
  quizId: string | null;
  status: "active" | "expired";
};

/**
 * Data needed to create a teacher profile.
 */
export type CreateTeacherInput = {
  id: string; // Clerk user ID
  name: string;
  email: string;
};

/**
 * Firestore collection name.
 */
const USERS_COLLECTION = "users";

/**
 * Returns the Firestore reference for one teacher.
 */
function teacherRef(teacherId: string) {
  return doc(db, USERS_COLLECTION, teacherId);
}

/**
 * Adds 3 days to the current date.
 */
function getExpirationDate() {
  const now = new Date();
  now.setDate(now.getDate() + LIMITS.ACCOUNT_DURATION_DAYS);
  return now.toISOString();
}

/**
 * Checks if a teacher expiration date is already passed.
 */
export function isTeacherExpired(expiresAt: string) {
  return new Date(expiresAt).getTime() <= Date.now();
}

/**
 * Counts all teacher documents in Firestore.
 */
export async function getTeacherCount() {
  const usersRef = collection(db, USERS_COLLECTION);
  const snapshot = await getCountFromServer(usersRef);

  return snapshot.data().count;
}

/**
 * Checks if we can create one more teacher account.
 */
export async function hasTeacherSlot() {
  const count = await getTeacherCount();
  return count < LIMITS.MAX_TEACHERS;
}

/**
 * Gets one teacher profile by Clerk user ID.
 */
export async function getTeacher(teacherId: string): Promise<Teacher | null> {
  const snapshot = await getDoc(teacherRef(teacherId));

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();

  return {
    id: snapshot.id,
    name: typeof data.name === "string" ? data.name : "",
    email: typeof data.email === "string" ? data.email : "",
    role: "teacher",
    createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
    expiresAt: typeof data.expiresAt === "string" ? data.expiresAt : "",
    quizId: typeof data.quizId === "string" ? data.quizId : null,
    status: data.status === "expired" ? "expired" : "active",
  };
}

/**
 * Checks if a teacher already exists.
 */
export async function teacherExists(teacherId: string) {
  const teacher = await getTeacher(teacherId);
  return teacher !== null;
}

/**
 * Creates a teacher profile if:
 * - the teacher does not already exist
 * - the platform still has available teacher slots
 */
export async function createTeacher(input: CreateTeacherInput) {
  const existingTeacher = await getTeacher(input.id);

  if (existingTeacher) {
    return {
      success: true,
      teacher: existingTeacher,
      message: "Teacher already exists.",
    };
  }

  const canCreateTeacher = await hasTeacherSlot();

  if (!canCreateTeacher) {
    return {
      success: false,
      teacher: null,
      message: "Teacher limit reached.",
    };
  }

  const now = new Date().toISOString();
  const expiresAt = getExpirationDate();

  const teacher: Omit<Teacher, "id"> = {
    name: input.name,
    email: input.email,
    role: "teacher",
    createdAt: now,
    expiresAt,
    quizId: null,
    status: "active",
  };

  await setDoc(teacherRef(input.id), {
    ...teacher,
    createdAtServer: serverTimestamp(),
  });

  await increaseTeacherStats();

  return {
    success: true,
    teacher: {
      id: input.id,
      ...teacher,
    },
    message: "Teacher created successfully.",
  };
}

/**
 * Updates the quiz linked to a teacher.
 *
 * In ULearn V1, one teacher can only have one active quiz.
 * quizId = null means the teacher can create a new quiz again.
 */
export async function updateTeacherQuiz(teacherId: string, quizId: string | null) {
  await updateDoc(teacherRef(teacherId), {
    quizId,
  });
}

/**
 * Marks a teacher as expired.
 *
 * This can be useful before deleting the account,
 * especially if deletion fails or must be delayed.
 */
export async function markTeacherAsExpired(teacherId: string) {
  await updateDoc(teacherRef(teacherId), {
    status: "expired",
  });
}

/**
 * Deletes a teacher profile from Firestore.
 *
 * Important:
 * This deletes the Firestore profile only.
 * Clerk account deletion will be handled later from a server route.
 */
export async function deleteTeacher(teacherId: string) {
  const teacher = await getTeacher(teacherId);

  if (!teacher) {
    return {
      success: true,
      message: "Teacher does not exist.",
    };
  }

  await deleteDoc(teacherRef(teacherId));
  await decreaseActiveTeachers();

  return {
    success: true,
    message: "Teacher deleted successfully.",
  };
}

/**
 * Checks if a teacher account is expired.
 * If it is expired, the teacher is deleted from Firestore.
 */
export async function cleanupExpiredTeacher(teacherId: string) {
  const teacher = await getTeacher(teacherId);

  if (!teacher) {
    return {
      deleted: false,
      teacher: null,
      message: "Teacher not found.",
    };
  }

  if (!isTeacherExpired(teacher.expiresAt)) {
    return {
      deleted: false,
      teacher,
      message: "Teacher account is still active.",
    };
  }

  await markTeacherAsExpired(teacherId);
  await deleteTeacher(teacherId);

  return {
    deleted: true,
    teacher: null,
    message: "Expired teacher account deleted.",
  };
}