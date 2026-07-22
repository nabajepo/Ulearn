// lib/services/quizzes.ts

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { LIMITS } from "@/lib/services/limits";
import { increaseQuizStats, decreaseActiveQuizzes } from "@/lib/services/stats";
import { getTeacher, updateTeacherQuiz } from "@/lib/services/users";

export type QuizStatus = "draft" | "launched" | "closed";
export type QuizAvailabilityMode = "open_window" | "scheduled_session";

export type Quiz = {
  id: string;
  teacherId: string;
  title: string;
  description: string;
  status: QuizStatus;

  availabilityMode: QuizAvailabilityMode;
  availableFrom: string | null;
  availableUntil: string | null;
  timeLimitMinutes: number;

  allowBackNavigation: boolean;
  shuffleQuestions: boolean;
  shuffleChoices: boolean;

  totalQuestions: number;
  qcmQuestions: number;
  developmentQuestions: number;
  maxStudents: number;

  createdAt: string;
  updatedAt: string;
  launchedAt: string | null;
  closedAt: string | null;
};

export type CreateQuizInput = {
  teacherId: string;
  title: string;
  description: string;
  availabilityMode: QuizAvailabilityMode;
  availableFrom: string | null;
  availableUntil: string | null;
  timeLimitMinutes: number;
  allowBackNavigation: boolean;
  shuffleQuestions: boolean;
  shuffleChoices: boolean;
};

export type UpdateQuizInput = Omit<CreateQuizInput, "teacherId">;

const QUIZZES_COLLECTION = "quizzes";

function quizRef(quizId: string) {
  return doc(db, QUIZZES_COLLECTION, quizId);
}

function validateQuizInput(input: {
  title: string;
  availabilityMode: QuizAvailabilityMode;
  availableFrom: string | null;
  availableUntil: string | null;
  timeLimitMinutes: number;
}) {
  if (!input.title.trim()) return "Quiz title is required.";

  if (input.timeLimitMinutes <= 0) return "Time limit must be greater than 0.";

  if (input.timeLimitMinutes > 1440) {
    return "Time limit cannot be more than 24 hours.";
  }

  if (input.availabilityMode === "scheduled_session") {
    if (!input.availableFrom || !input.availableUntil) {
      return "Start date and end date are required for scheduled quizzes.";
    }

    if (new Date(input.availableUntil) <= new Date(input.availableFrom)) {
      return "End date must be after start date.";
    }
  }

  if (input.availabilityMode === "open_window" && !input.availableUntil) {
    return "Submission deadline is required.";
  }

  return null;
}

export async function getQuiz(quizId: string): Promise<Quiz | null> {
  const snapshot = await getDoc(quizRef(quizId));

  if (!snapshot.exists()) return null;

  const data = snapshot.data();

  return {
    id: snapshot.id,
    teacherId: typeof data.teacherId === "string" ? data.teacherId : "",
    title: typeof data.title === "string" ? data.title : "",
    description: typeof data.description === "string" ? data.description : "",
    status:
      data.status === "launched"
        ? "launched"
        : data.status === "closed"
        ? "closed"
        : "draft",

    availabilityMode:
      data.availabilityMode === "scheduled_session"
        ? "scheduled_session"
        : "open_window",

    availableFrom:
      typeof data.availableFrom === "string" ? data.availableFrom : null,

    availableUntil:
      typeof data.availableUntil === "string" ? data.availableUntil : null,

    timeLimitMinutes:
      typeof data.timeLimitMinutes === "number" ? data.timeLimitMinutes : 60,

    allowBackNavigation:
      typeof data.allowBackNavigation === "boolean"
        ? data.allowBackNavigation
        : true,

    shuffleQuestions:
      typeof data.shuffleQuestions === "boolean"
        ? data.shuffleQuestions
        : false,

    shuffleChoices:
      typeof data.shuffleChoices === "boolean" ? data.shuffleChoices : false,

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
    closedAt: typeof data.closedAt === "string" ? data.closedAt : null,
  };
}

export async function createQuiz(input: CreateQuizInput) {
  const teacher = await getTeacher(input.teacherId);

  if (!teacher) {
    return { success: false, quiz: null, message: "Teacher not found." };
  }

  if (teacher.quizId) {
    return {
      success: false,
      quiz: null,
      message: "You already have one quiz.",
    };
  }

  const validationError = validateQuizInput(input);

  if (validationError) {
    return { success: false, quiz: null, message: validationError };
  }

  const now = new Date().toISOString();

  const quizData: Omit<Quiz, "id"> = {
    teacherId: input.teacherId,
    title: input.title.trim(),
    description: input.description.trim(),
    status: "draft",

    availabilityMode: input.availabilityMode,
    availableFrom: input.availableFrom,
    availableUntil: input.availableUntil,
    timeLimitMinutes: input.timeLimitMinutes,

    allowBackNavigation: input.allowBackNavigation,
    shuffleQuestions: input.shuffleQuestions,
    shuffleChoices: input.shuffleChoices,

    totalQuestions: 0,
    qcmQuestions: 0,
    developmentQuestions: 0,
    maxStudents: LIMITS.MAX_STUDENTS_PER_QUIZ,

    createdAt: now,
    updatedAt: now,
    launchedAt: null,
    closedAt: null,
  };

  const quizDoc = await addDoc(collection(db, QUIZZES_COLLECTION), quizData);

  await updateTeacherQuiz(input.teacherId, quizDoc.id);
  await increaseQuizStats();

  return {
    success: true,
    quiz: { id: quizDoc.id, ...quizData },
    message: "Quiz created successfully.",
  };
}

export async function updateQuiz(quizId: string, input: UpdateQuizInput) {
  const quiz = await getQuiz(quizId);

  if (!quiz) {
    return { success: false, message: "Quiz not found." };
  }

  if (quiz.status !== "draft") {
    return {
      success: false,
      message: "Only draft quizzes can be edited.",
    };
  }

  const validationError = validateQuizInput(input);

  if (validationError) {
    return { success: false, message: validationError };
  }

  await updateDoc(quizRef(quizId), {
    title: input.title.trim(),
    description: input.description.trim(),
    availabilityMode: input.availabilityMode,
    availableFrom: input.availableFrom,
    availableUntil: input.availableUntil,
    timeLimitMinutes: input.timeLimitMinutes,
    allowBackNavigation: input.allowBackNavigation,
    shuffleQuestions: input.shuffleQuestions,
    shuffleChoices: input.shuffleChoices,
    updatedAt: new Date().toISOString(),
  });

  return { success: true, message: "Quiz updated successfully." };
}

export async function launchQuiz(quizId: string) {
  const quiz = await getQuiz(quizId);

  if (!quiz) {
    return { success: false, message: "Quiz not found." };
  }

  if (quiz.status !== "draft") {
    return { success: false, message: "Only draft quizzes can be launched." };
  }

  if (quiz.totalQuestions <= 0) {
    return {
      success: false,
      message: "Add at least one question before launching the quiz.",
    };
  }

  await updateDoc(quizRef(quizId), {
    status: "launched",
    launchedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return { success: true, message: "Quiz launched successfully." };
}

export async function closeQuiz(quizId: string) {
  const quiz = await getQuiz(quizId);

  if (!quiz) {
    return { success: false, message: "Quiz not found." };
  }

  await updateDoc(quizRef(quizId), {
    status: "closed",
    closedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return { success: true, message: "Quiz closed successfully." };
}

export async function deleteQuiz(quizId: string) {
  const quiz = await getQuiz(quizId);

  if (!quiz) {
    return { success: true, message: "Quiz already deleted." };
  }

  await deleteDoc(quizRef(quizId));
  await updateTeacherQuiz(quiz.teacherId, null);
  await decreaseActiveQuizzes();

  return { success: true, message: "Quiz deleted successfully." };
}