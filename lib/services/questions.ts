// lib/services/questions.ts

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { LIMITS } from "@/lib/services/limits";
import { getQuiz, updateQuizQuestionCounters } from "@/lib/services/quizzes";

/**
 * Question types supported in ULearn V1.
 *
 * qcm:
 * Multiple-choice question corrected automatically.
 *
 * development:
 * Open-ended question corrected manually by the teacher.
 */
export type QuestionType = "qcm" | "development";

/**
 * Base question fields.
 */
type BaseQuestion = {
  id: string;
  quizId: string;
  teacherId: string;
  text: string;
  type: QuestionType;
  points: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * QCM question structure.
 */
export type QcmQuestion = BaseQuestion & {
  type: "qcm";
  choices: string[];
  correctChoiceIndex: number;
};

/**
 * Development question structure.
 */
export type DevelopmentQuestion = BaseQuestion & {
  type: "development";
};

/**
 * Union type for all question formats.
 */
export type Question = QcmQuestion | DevelopmentQuestion;

/**
 * Data needed to create a QCM question.
 */
export type CreateQcmQuestionInput = {
  quizId: string;
  text: string;
  points: number;
  choices: string[];
  correctChoiceIndex: number;
};

/**
 * Data needed to create a development question.
 */
export type CreateDevelopmentQuestionInput = {
  quizId: string;
  text: string;
  points: number;
};

const QUESTIONS_COLLECTION = "questions";

/**
 * Returns the Firestore reference for one question.
 */
function questionRef(questionId: string) {
  return doc(db, QUESTIONS_COLLECTION, questionId);
}

/**
 * Converts Firestore raw data into a safe Question object.
 */
function mapQuestion(docId: string, data: any): Question {
  const base = {
    id: docId,
    quizId: typeof data.quizId === "string" ? data.quizId : "",
    teacherId: typeof data.teacherId === "string" ? data.teacherId : "",
    text: typeof data.text === "string" ? data.text : "",
    type: data.type === "development" ? "development" : "qcm",
    points: typeof data.points === "number" ? data.points : 1,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : "",
  };

  if (base.type === "development") {
    return {
      ...base,
      type: "development",
    };
  }

  return {
    ...base,
    type: "qcm",
    choices: Array.isArray(data.choices) ? data.choices : [],
    correctChoiceIndex:
      typeof data.correctChoiceIndex === "number"
        ? data.correctChoiceIndex
        : 0,
  };
}

/**
 * Gets all questions linked to one quiz.
 */
export async function getQuizQuestions(quizId: string): Promise<Question[]> {
  const q = query(
    collection(db, QUESTIONS_COLLECTION),
    where("quizId", "==", quizId)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((docSnap) =>
    mapQuestion(docSnap.id, docSnap.data())
  );
}

/**
 * Recalculates and updates question counters inside the quiz document.
 */
export async function refreshQuizQuestionCounters(quizId: string) {
  const questions = await getQuizQuestions(quizId);

  const qcmQuestions = questions.filter((q) => q.type === "qcm").length;
  const developmentQuestions = questions.filter(
    (q) => q.type === "development"
  ).length;

  await updateQuizQuestionCounters(quizId, {
    totalQuestions: questions.length,
    qcmQuestions,
    developmentQuestions,
  });

  return {
    totalQuestions: questions.length,
    qcmQuestions,
    developmentQuestions,
  };
}

/**
 * Checks if the quiz can still be edited.
 */
async function ensureQuizCanBeEdited(quizId: string) {
  const quiz = await getQuiz(quizId);

  if (!quiz) {
    return {
      success: false,
      quiz: null,
      message: "Quiz not found.",
    };
  }

  if (quiz.status === "launched") {
    return {
      success: false,
      quiz,
      message: "A launched quiz cannot be edited.",
    };
  }

  return {
    success: true,
    quiz,
    message: "Quiz can be edited.",
  };
}

/**
 * Adds a QCM question to a quiz.
 */
export async function createQcmQuestion(input: CreateQcmQuestionInput) {
  const editable = await ensureQuizCanBeEdited(input.quizId);

  if (!editable.success || !editable.quiz) {
    return {
      success: false,
      question: null,
      message: editable.message,
    };
  }

  const counters = await refreshQuizQuestionCounters(input.quizId);

  if (counters.totalQuestions >= LIMITS.MAX_QUESTIONS_PER_QUIZ) {
    return {
      success: false,
      question: null,
      message: "Question limit reached for this quiz.",
    };
  }

  if (counters.qcmQuestions >= LIMITS.MAX_QCM_QUESTIONS) {
    return {
      success: false,
      question: null,
      message: "QCM question limit reached.",
    };
  }

  if (input.choices.length < 2) {
    return {
      success: false,
      question: null,
      message: "A QCM question must have at least 2 choices.",
    };
  }

  if (
    input.correctChoiceIndex < 0 ||
    input.correctChoiceIndex >= input.choices.length
  ) {
    return {
      success: false,
      question: null,
      message: "Correct choice index is invalid.",
    };
  }

  const now = new Date().toISOString();

  const questionData: Omit<QcmQuestion, "id"> = {
    quizId: input.quizId,
    teacherId: editable.quiz.teacherId,
    text: input.text.trim(),
    type: "qcm",
    points: input.points,
    choices: input.choices.map((choice) => choice.trim()),
    correctChoiceIndex: input.correctChoiceIndex,
    createdAt: now,
    updatedAt: now,
  };

  const questionDoc = await addDoc(
    collection(db, QUESTIONS_COLLECTION),
    questionData
  );

  await refreshQuizQuestionCounters(input.quizId);

  return {
    success: true,
    question: {
      id: questionDoc.id,
      ...questionData,
    },
    message: "QCM question created successfully.",
  };
}

/**
 * Adds a development question to a quiz.
 */
export async function createDevelopmentQuestion(
  input: CreateDevelopmentQuestionInput
) {
  const editable = await ensureQuizCanBeEdited(input.quizId);

  if (!editable.success || !editable.quiz) {
    return {
      success: false,
      question: null,
      message: editable.message,
    };
  }

  const counters = await refreshQuizQuestionCounters(input.quizId);

  if (counters.totalQuestions >= LIMITS.MAX_QUESTIONS_PER_QUIZ) {
    return {
      success: false,
      question: null,
      message: "Question limit reached for this quiz.",
    };
  }

  if (counters.developmentQuestions >= LIMITS.MAX_DEVELOPMENT_QUESTIONS) {
    return {
      success: false,
      question: null,
      message: "Development question limit reached.",
    };
  }

  const now = new Date().toISOString();

  const questionData: Omit<DevelopmentQuestion, "id"> = {
    quizId: input.quizId,
    teacherId: editable.quiz.teacherId,
    text: input.text.trim(),
    type: "development",
    points: input.points,
    createdAt: now,
    updatedAt: now,
  };

  const questionDoc = await addDoc(
    collection(db, QUESTIONS_COLLECTION),
    questionData
  );

  await refreshQuizQuestionCounters(input.quizId);

  return {
    success: true,
    question: {
      id: questionDoc.id,
      ...questionData,
    },
    message: "Development question created successfully.",
  };
}

/**
 * Deletes one question from a quiz.
 */
export async function deleteQuestion(questionId: string, quizId: string) {
  const editable = await ensureQuizCanBeEdited(quizId);

  if (!editable.success) {
    return {
      success: false,
      message: editable.message,
    };
  }

  await deleteDoc(questionRef(questionId));
  await refreshQuizQuestionCounters(quizId);

  return {
    success: true,
    message: "Question deleted successfully.",
  };
}

/**
 * Deletes all questions from a quiz.
 *
 * This will be used when deleting a quiz completely.
 */
export async function deleteQuestionsByQuizId(quizId: string) {
  const questions = await getQuizQuestions(quizId);

  await Promise.all(
    questions.map((question) => deleteDoc(questionRef(question.id)))
  );

  await refreshQuizQuestionCounters(quizId);

  return {
    success: true,
    message: "All quiz questions deleted successfully.",
  };
}