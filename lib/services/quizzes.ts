// lib/services/quizzes.ts

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { LIMITS } from "@/lib/services/limits";
import { decreaseActiveQuizzes, increaseQuizStats } from "@/lib/services/stats";
import { getTeacher, updateTeacherQuiz } from "@/lib/services/users";

/**
 * Quiz status for ULearn V1.
 *
 * draft:
 * The teacher can still edit the quiz.
 *
 * launched:
 * The quiz is active and students can answer.
 * Once launched, the quiz cannot be edited.
 */
export type QuizStatus = "draft" | "launched";

/**
 * Quiz structure stored in Firestore.
 */
export type Quiz = {
  id: string;
  teacherId: string;
  title: string;
  description: string;
  status: QuizStatus;
  totalQuestions: number;
  qcmQuestions: number;
  developmentQuestions: number;
  maxStudents: number;
  createdAt: string;
  updatedAt: string;
  launchedAt: string | null;
};

/**
 * Data needed to create a quiz.
 */
export type CreateQuizInput = {
  teacherId: string;
  title: string;
  description: string;
};

const QUIZZES_COLLECTION = "quizzes";

/**
 * Returns the Firestore reference for one quiz.
 */
function quizRef(quizId: string) {
  return doc(db, QUIZZES_COLLECTION, quizId);
}

/**
 * Gets one quiz by quiz ID.
 */
export async function getQuiz(quizId: string): Promise<Quiz | null> {
  const snapshot = await getDoc(quizRef(quizId));

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();

  return {
    id: snapshot.id,
    teacherId: typeof data.teacherId === "string" ? data.teacherId : "",
    title: typeof data.title === "string" ? data.title : "",
    description: typeof data.description === "string" ? data.description : "",
    status: data.status === "launched" ? "launched" : "draft",
    totalQuestions:
      typeof data.totalQuestions === "number" ? data.totalQuestions : 0,
    qcmQuestions:
      typeof data.qcmQuestions === "number" ? data.qcmQuestions : 0,
    developmentQuestions:
      typeof data.developmentQuestions === "number"
        ? data.developmentQuestions
        : 0,
    maxStudents:
      typeof data.maxStudents === "number"
        ? data.maxStudents
        : LIMITS.MAX_STUDENTS_PER_QUIZ,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : "",
    launchedAt: typeof data.launchedAt === "string" ? data.launchedAt : null,
  };
}

/**
 * Gets the active quiz linked to a teacher.
 */
export async function getTeacherQuiz(teacherId: string): Promise<Quiz | null> {
  const teacher = await getTeacher(teacherId);

  if (!teacher || !teacher.quizId) {
    return null;
  }

  return await getQuiz(teacher.quizId);
}

/**
 * Checks if a teacher already has a quiz.
 */
export async function teacherHasQuiz(teacherId: string) {
  const teacher = await getTeacher(teacherId);
  return Boolean(teacher?.quizId);
}

/**
 * Creates a quiz for a teacher.
 *
 * In ULearn V1:
 * - one teacher can only create one quiz
 * - the quiz starts as draft
 * - the teacher can edit it before launching
 */
export async function createQuiz(input: CreateQuizInput) {
  const teacher = await getTeacher(input.teacherId);

  if (!teacher) {
    return {
      success: false,
      quiz: null,
      message: "Teacher not found.",
    };
  }

  if (teacher.quizId) {
    return {
      success: false,
      quiz: null,
      message: "This teacher already has a quiz.",
    };
  }

  const now = new Date().toISOString();

  const quizData: Omit<Quiz, "id"> = {
    teacherId: input.teacherId,
    title: input.title.trim(),
    description: input.description.trim(),
    status: "draft",
    totalQuestions: 0,
    qcmQuestions: 0,
    developmentQuestions: 0,
    maxStudents: LIMITS.MAX_STUDENTS_PER_QUIZ,
    createdAt: now,
    updatedAt: now,
    launchedAt: null,
  };

  const quizDoc = await addDoc(collection(db, QUIZZES_COLLECTION), quizData);

  await updateTeacherQuiz(input.teacherId, quizDoc.id);
  await increaseQuizStats();

  return {
    success: true,
    quiz: {
      id: quizDoc.id,
      ...quizData,
    },
    message: "Quiz created successfully.",
  };
}

/**
 * Updates quiz basic information.
 *
 * A launched quiz cannot be edited.
 */
export async function updateQuizInfo(
  quizId: string,
  data: {
    title?: string;
    description?: string;
  }
) {
  const quiz = await getQuiz(quizId);

  if (!quiz) {
    return {
      success: false,
      message: "Quiz not found.",
    };
  }

  if (quiz.status === "launched") {
    return {
      success: false,
      message: "A launched quiz cannot be edited.",
    };
  }

  await updateDoc(quizRef(quizId), {
    ...(data.title !== undefined && { title: data.title.trim() }),
    ...(data.description !== undefined && {
      description: data.description.trim(),
    }),
    updatedAt: new Date().toISOString(),
  });

  return {
    success: true,
    message: "Quiz updated successfully.",
  };
}

/**
 * Updates question counters inside the quiz document.
 *
 * This will be used by questions.ts whenever a question is added or deleted.
 */
export async function updateQuizQuestionCounters(
  quizId: string,
  counters: {
    totalQuestions: number;
    qcmQuestions: number;
    developmentQuestions: number;
  }
) {
  await updateDoc(quizRef(quizId), {
    ...counters,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Launches a quiz.
 *
 * Rules:
 * - the quiz must exist
 * - the quiz must be in draft mode
 * - the quiz must have at least one question
 * - after launch, it cannot be edited
 */
export async function launchQuiz(quizId: string) {
  const quiz = await getQuiz(quizId);

  if (!quiz) {
    return {
      success: false,
      message: "Quiz not found.",
    };
  }

  if (quiz.status === "launched") {
    return {
      success: false,
      message: "Quiz is already launched.",
    };
  }

  if (quiz.totalQuestions <= 0) {
    return {
      success: false,
      message: "You must add at least one question before launching the quiz.",
    };
  }

  await updateDoc(quizRef(quizId), {
    status: "launched",
    launchedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return {
    success: true,
    message: "Quiz launched successfully.",
  };
}

/**
 * Deletes a quiz.
 *
 * Important:
 * This deletes the quiz document only.
 * Later, questions.ts will also help delete questions linked to the quiz.
 */
export async function deleteQuiz(quizId: string) {
  const quiz = await getQuiz(quizId);

  if (!quiz) {
    return {
      success: true,
      message: "Quiz does not exist.",
    };
  }

  await deleteDoc(quizRef(quizId));
  await updateTeacherQuiz(quiz.teacherId, null);
  await decreaseActiveQuizzes();

  return {
    success: true,
    message: "Quiz deleted successfully.",
  };
}

/**
 * Finds quizzes by teacher ID.
 *
 * This is useful if the teacher document loses quizId
 * or if we later allow more than one quiz per teacher.
 */
export async function getQuizzesByTeacherId(teacherId: string): Promise<Quiz[]> {
  const q = query(
    collection(db, QUIZZES_COLLECTION),
    where("teacherId", "==", teacherId)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();

    return {
      id: docSnap.id,
      teacherId: typeof data.teacherId === "string" ? data.teacherId : "",
      title: typeof data.title === "string" ? data.title : "",
      description: typeof data.description === "string" ? data.description : "",
      status: data.status === "launched" ? "launched" : "draft",
      totalQuestions:
        typeof data.totalQuestions === "number" ? data.totalQuestions : 0,
      qcmQuestions:
        typeof data.qcmQuestions === "number" ? data.qcmQuestions : 0,
      developmentQuestions:
        typeof data.developmentQuestions === "number"
          ? data.developmentQuestions
          : 0,
      maxStudents:
        typeof data.maxStudents === "number"
          ? data.maxStudents
          : LIMITS.MAX_STUDENTS_PER_QUIZ,
      createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : "",
      launchedAt: typeof data.launchedAt === "string" ? data.launchedAt : null,
    };
  });
}