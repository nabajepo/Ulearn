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

import {
  increaseQuizStats,
  decreaseActiveQuizzes,
} from "@/lib/services/stats";

import {
  getTeacher,
  updateTeacherQuiz,
} from "@/lib/services/users";

export type QuizStatus = "draft" | "launched" | "closed";

export type QuizAvailabilityMode =
  | "open_window"
  | "scheduled_session";

export type Quiz = {
  id: string;
  teacherId: string;

  title: string;
  description: string;

  status: QuizStatus;

  timeZone: string;

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

  timeZone: string;

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

/* =========================================================
   Validation
   ========================================================= */

function validateQuizInput(
  input: Omit<CreateQuizInput, "teacherId">,
  teacherExpiresAt: string
) {
  const now = Date.now();
  const accountExpiration = new Date(teacherExpiresAt).getTime();

  if (!input.title.trim()) {
    return "Quiz title is required.";
  }

  if (!input.timeZone) {
    return "A time zone is required.";
  }

  if (
    !Number.isFinite(input.timeLimitMinutes) ||
    input.timeLimitMinutes < 1
  ) {
    return "Quiz duration must be greater than 0 minutes.";
  }

  if (
    input.timeLimitMinutes >
    LIMITS.MAX_QUIZ_DURATION_MINUTES
  ) {
    return `Quiz duration cannot exceed ${LIMITS.ACCOUNT_DURATION_DAYS} days.`;
  }

  if (
    Number.isNaN(accountExpiration) ||
    accountExpiration <= now
  ) {
    return "Your teacher account has expired.";
  }

  const start =
    input.availableFrom !== null
      ? new Date(input.availableFrom).getTime()
      : null;

  const end =
    input.availableUntil !== null
      ? new Date(input.availableUntil).getTime()
      : null;

  if (start !== null && Number.isNaN(start)) {
    return "The opening date is invalid.";
  }

  if (end !== null && Number.isNaN(end)) {
    return "The deadline is invalid.";
  }

  /*
   * No selected date may already be in the past.
   */

  if (start !== null && start < now) {
    return "The opening date cannot be in the past.";
  }

  if (end !== null && end <= now) {
    return "The deadline cannot be in the past.";
  }

  /*
   * Nothing can happen after teacher account expiration.
   */

  if (start !== null && start > accountExpiration) {
    return "The opening date cannot be after your account expiration.";
  }

  if (end !== null && end > accountExpiration) {
    return "The deadline cannot be after your account expiration.";
  }

  /*
   * Scheduled session
   */

  if (input.availabilityMode === "scheduled_session") {
    if (start === null || end === null) {
      return "Start and end dates are required for a scheduled session.";
    }

    if (end <= start) {
      return "The session end must be after the session start.";
    }

    const sessionDurationMinutes = Math.floor(
      (end - start) / (1000 * 60)
    );

    if (
      sessionDurationMinutes >
      LIMITS.MAX_QUIZ_DURATION_MINUTES
    ) {
      return `A scheduled session cannot exceed ${LIMITS.ACCOUNT_DURATION_DAYS} days.`;
    }
  }

  /*
   * Open window
   */

  if (input.availabilityMode === "open_window") {
    if (end === null) {
      return "A submission deadline is required.";
    }

    const effectiveStart = start ?? now;

    if (end <= effectiveStart) {
      return "The deadline must be after the opening date.";
    }

    const availableMinutes = Math.floor(
      (end - effectiveStart) / (1000 * 60)
    );

    if (input.timeLimitMinutes > availableMinutes) {
      return "The time allowed per student cannot exceed the available quiz window.";
    }
  }

  return null;
}

/* =========================================================
   Get quiz
   ========================================================= */

export async function getQuiz(
  quizId: string
): Promise<Quiz | null> {
  const snapshot = await getDoc(quizRef(quizId));

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();

  return {
    id: snapshot.id,

    teacherId:
      typeof data.teacherId === "string"
        ? data.teacherId
        : "",

    title:
      typeof data.title === "string"
        ? data.title
        : "",

    description:
      typeof data.description === "string"
        ? data.description
        : "",

    status:
      data.status === "launched"
        ? "launched"
        : data.status === "closed"
          ? "closed"
          : "draft",

    timeZone:
      typeof data.timeZone === "string"
        ? data.timeZone
        : "America/Toronto",

    availabilityMode:
      data.availabilityMode === "scheduled_session"
        ? "scheduled_session"
        : "open_window",

    availableFrom:
      typeof data.availableFrom === "string"
        ? data.availableFrom
        : null,

    availableUntil:
      typeof data.availableUntil === "string"
        ? data.availableUntil
        : null,

    timeLimitMinutes:
      typeof data.timeLimitMinutes === "number"
        ? data.timeLimitMinutes
        : 60,

    allowBackNavigation:
      typeof data.allowBackNavigation === "boolean"
        ? data.allowBackNavigation
        : true,

    shuffleQuestions:
      typeof data.shuffleQuestions === "boolean"
        ? data.shuffleQuestions
        : false,

    shuffleChoices:
      typeof data.shuffleChoices === "boolean"
        ? data.shuffleChoices
        : false,

    totalQuestions:
      typeof data.totalQuestions === "number"
        ? data.totalQuestions
        : 0,

    qcmQuestions:
      typeof data.qcmQuestions === "number"
        ? data.qcmQuestions
        : 0,

    developmentQuestions:
      typeof data.developmentQuestions === "number"
        ? data.developmentQuestions
        : 0,

    maxStudents:
      typeof data.maxStudents === "number"
        ? data.maxStudents
        : LIMITS.MAX_STUDENTS_PER_QUIZ,

    createdAt:
      typeof data.createdAt === "string"
        ? data.createdAt
        : "",

    updatedAt:
      typeof data.updatedAt === "string"
        ? data.updatedAt
        : "",

    launchedAt:
      typeof data.launchedAt === "string"
        ? data.launchedAt
        : null,

    closedAt:
      typeof data.closedAt === "string"
        ? data.closedAt
        : null,
  };
}

/* =========================================================
   Create quiz
   ========================================================= */

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
      message: "You already have one quiz.",
    };
  }

  const validationError = validateQuizInput(
    {
      title: input.title,
      description: input.description,
      timeZone: input.timeZone,
      availabilityMode: input.availabilityMode,
      availableFrom: input.availableFrom,
      availableUntil: input.availableUntil,
      timeLimitMinutes: input.timeLimitMinutes,
      allowBackNavigation: input.allowBackNavigation,
      shuffleQuestions: input.shuffleQuestions,
      shuffleChoices: input.shuffleChoices,
    },
    teacher.expiresAt
  );

  if (validationError) {
    return {
      success: false,
      quiz: null,
      message: validationError,
    };
  }

  const now = new Date().toISOString();

  const quizData: Omit<Quiz, "id"> = {
    teacherId: input.teacherId,

    title: input.title.trim(),
    description: input.description.trim(),

    status: "draft",

    timeZone: input.timeZone,

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

  const quizDoc = await addDoc(
    collection(db, QUIZZES_COLLECTION),
    quizData
  );

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

/* =========================================================
   Update quiz
   ========================================================= */

export async function updateQuiz(
  quizId: string,
  input: UpdateQuizInput
) {
  const quiz = await getQuiz(quizId);

  if (!quiz) {
    return {
      success: false,
      message: "Quiz not found.",
    };
  }

  if (quiz.status !== "draft") {
    return {
      success: false,
      message: "Only draft quizzes can be edited.",
    };
  }

  const teacher = await getTeacher(quiz.teacherId);

  if (!teacher) {
    return {
      success: false,
      message: "Teacher not found.",
    };
  }

  const validationError = validateQuizInput(
    input,
    teacher.expiresAt
  );

  if (validationError) {
    return {
      success: false,
      message: validationError,
    };
  }

  await updateDoc(quizRef(quizId), {
    title: input.title.trim(),
    description: input.description.trim(),

    timeZone: input.timeZone,

    availabilityMode: input.availabilityMode,

    availableFrom: input.availableFrom,
    availableUntil: input.availableUntil,

    timeLimitMinutes: input.timeLimitMinutes,

    allowBackNavigation: input.allowBackNavigation,
    shuffleQuestions: input.shuffleQuestions,
    shuffleChoices: input.shuffleChoices,

    updatedAt: new Date().toISOString(),
  });

  return {
    success: true,
    message: "Quiz updated successfully.",
  };
}

/* =========================================================
   Launch
   ========================================================= */

export async function launchQuiz(quizId: string) {
  const quiz = await getQuiz(quizId);

  if (!quiz) {
    return {
      success: false,
      message: "Quiz not found.",
    };
  }

  if (quiz.status !== "draft") {
    return {
      success: false,
      message: "Only draft quizzes can be launched.",
    };
  }

  if (quiz.totalQuestions <= 0) {
    return {
      success: false,
      message: "Add at least one question before launching the quiz.",
    };
  }

  const teacher = await getTeacher(quiz.teacherId);

  if (!teacher) {
    return {
      success: false,
      message: "Teacher not found.",
    };
  }

  if (
    new Date(teacher.expiresAt).getTime() <= Date.now()
  ) {
    return {
      success: false,
      message: "Your teacher account has expired.",
    };
  }

  if (
    quiz.availableUntil &&
    new Date(quiz.availableUntil).getTime() <= Date.now()
  ) {
    return {
      success: false,
      message:
        "This quiz deadline has already passed. Change the quiz settings before launching it.",
    };
  }

  const now = new Date().toISOString();

  await updateDoc(quizRef(quizId), {
    status: "launched",
    launchedAt: now,
    updatedAt: now,
  });

  return {
    success: true,
    message: "Quiz launched successfully.",
  };
}

/* =========================================================
   Close
   ========================================================= */

export async function closeQuiz(quizId: string) {
  const quiz = await getQuiz(quizId);

  if (!quiz) {
    return {
      success: false,
      message: "Quiz not found.",
    };
  }

  const now = new Date().toISOString();

  await updateDoc(quizRef(quizId), {
    status: "closed",
    closedAt: now,
    updatedAt: now,
  });

  return {
    success: true,
    message: "Quiz closed successfully.",
  };
}

/* =========================================================
   Delete
   ========================================================= */

export async function deleteQuiz(quizId: string) {
  const quiz = await getQuiz(quizId);

  if (!quiz) {
    return {
      success: true,
      message: "Quiz already deleted.",
    };
  }

  await deleteDoc(quizRef(quizId));

  await updateTeacherQuiz(
    quiz.teacherId,
    null
  );

  await decreaseActiveQuizzes();

  return {
    success: true,
    message: "Quiz deleted successfully.",
  };
}

/* =========================================================
   Question counters
   ========================================================= */

export async function updateQuizQuestionCounters(
  quizId: string,
  counters: {
    totalQuestions: number;
    qcmQuestions: number;
    developmentQuestions: number;
  }
) {
  await updateDoc(quizRef(quizId), {
    totalQuestions: counters.totalQuestions,
    qcmQuestions: counters.qcmQuestions,
    developmentQuestions: counters.developmentQuestions,
    updatedAt: new Date().toISOString(),
  });
}