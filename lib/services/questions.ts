// lib/services/questions.ts

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
  writeBatch,
} from "firebase/firestore";

import {
  db,
} from "@/lib/firebase";

import {
  getQuiz,
  updateQuizQuestionCounters,
} from "@/lib/services/quizzes";

/* =========================================================
   Types
   ========================================================= */

export type QuestionType =
  | "qcm"
  | "development";

type BaseQuestion = {
  id: string;
  quizId: string;
  teacherId: string;

  order: number;

  text: string;

  type: QuestionType;

  points: number;

  createdAt: string;
  updatedAt: string;
};

export type QcmQuestion =
  BaseQuestion & {
    type: "qcm";

    choices: string[];

    correctChoiceIndex:
      number;
  };

export type DevelopmentQuestion =
  BaseQuestion & {
    type: "development";
  };

export type Question =
  | QcmQuestion
  | DevelopmentQuestion;

/* =========================================================
   Create inputs
   ========================================================= */

export type CreateQcmQuestionInput = {
  quizId: string;

  text: string;

  points: number;

  choices: string[];

  correctChoiceIndex:
    number;
};

export type CreateDevelopmentQuestionInput =
  {
    quizId: string;

    text: string;

    points: number;
  };

/* =========================================================
   Update inputs
   ========================================================= */

export type UpdateQcmQuestionInput =
  {
    text: string;

    points: number;

    choices: string[];

    correctChoiceIndex:
      number;
  };

export type UpdateDevelopmentQuestionInput =
  {
    text: string;

    points: number;
  };

/* =========================================================
   Constants
   ========================================================= */

const QUESTIONS_COLLECTION =
  "questions";

/* =========================================================
   References
   ========================================================= */

function questionRef(
  questionId: string
) {
  return doc(
    db,
    QUESTIONS_COLLECTION,
    questionId
  );
}

/* =========================================================
   Mapping
   ========================================================= */

function mapQuestion(
  docId: string,
  data: Record<string, unknown>
): Question {
  const type:
    QuestionType =
      data.type ===
      "development"
        ? "development"
        : "qcm";

  const base = {
    id:
      docId,

    quizId:
      typeof data.quizId ===
      "string"
        ? data.quizId
        : "",

    teacherId:
      typeof data.teacherId ===
      "string"
        ? data.teacherId
        : "",

    order:
      typeof data.order ===
      "number"
        ? data.order
        : 0,

    text:
      typeof data.text ===
      "string"
        ? data.text
        : "",

    type,

    points:
      typeof data.points ===
      "number"
        ? data.points
        : 1,

    createdAt:
      typeof data.createdAt ===
      "string"
        ? data.createdAt
        : "",

    updatedAt:
      typeof data.updatedAt ===
      "string"
        ? data.updatedAt
        : "",
  };

  if (
    type ===
    "development"
  ) {
    return {
      ...base,
      type:
        "development",
    };
  }

  return {
    ...base,

    type:
      "qcm",

    choices:
      Array.isArray(
        data.choices
      )
        ? data.choices.filter(
            (
              choice
            ): choice is string =>
              typeof choice ===
              "string"
          )
        : [],

    correctChoiceIndex:
      typeof data.correctChoiceIndex ===
      "number"
        ? data.correctChoiceIndex
        : 0,
  };
}

/* =========================================================
   Get one question
   ========================================================= */

export async function getQuestion(
  questionId: string
): Promise<Question | null> {
  const snapshot =
    await getDoc(
      questionRef(
        questionId
      )
    );

  if (
    !snapshot.exists()
  ) {
    return null;
  }

  return mapQuestion(
    snapshot.id,
    snapshot.data()
  );
}

/* =========================================================
   Get all quiz questions
   ========================================================= */

export async function getQuizQuestions(
  quizId: string
): Promise<Question[]> {
  const q =
    query(
      collection(
        db,
        QUESTIONS_COLLECTION
      ),

      where(
        "quizId",
        "==",
        quizId
      )
    );

  const snapshot =
    await getDocs(q);

  const questions =
    snapshot.docs.map(
      (docSnap) =>
        mapQuestion(
          docSnap.id,
          docSnap.data()
        )
    );

  /*
   * We sort client-side so we do not
   * require a Firestore composite index.
   */
  return questions.sort(
    (
      first,
      second
    ) =>
      first.order -
      second.order
  );
}

/* =========================================================
   Question statistics
   ========================================================= */

export async function getQuizQuestionStats(
  quizId: string
) {
  const questions =
    await getQuizQuestions(
      quizId
    );

  const qcmQuestions =
    questions.filter(
      (question) =>
        question.type ===
        "qcm"
    ).length;

  const developmentQuestions =
    questions.filter(
      (question) =>
        question.type ===
        "development"
    ).length;

  const assignedPoints =
    questions.reduce(
      (
        total,
        question
      ) =>
        total +
        question.points,
      0
    );

  return {
    totalQuestions:
      questions.length,

    qcmQuestions,

    developmentQuestions,

    assignedPoints,
  };
}

/* =========================================================
   Refresh legacy quiz counters
   ========================================================= */

/*
 * We still keep these fields synchronized
 * because other existing parts of ULearn
 * may still use totalQuestions,
 * qcmQuestions and developmentQuestions.
 *
 * Later, if they are no longer needed,
 * this function can be removed.
 */
export async function refreshQuizQuestionCounters(
  quizId: string
) {
  const stats =
    await getQuizQuestionStats(
      quizId
    );

  await updateQuizQuestionCounters(
    quizId,
    {
      totalQuestions:
        stats.totalQuestions,

      qcmQuestions:
        stats.qcmQuestions,

      developmentQuestions:
        stats.developmentQuestions,
    }
  );

  return stats;
}

/* =========================================================
   Quiz edit protection
   ========================================================= */

async function ensureQuizCanBeEdited(
  quizId: string
) {
  const quiz =
    await getQuiz(
      quizId
    );

  if (!quiz) {
    return {
      success:
        false as const,

      quiz:
        null,

      message:
        "Quiz not found.",
    };
  }

  if (
    quiz.status !==
    "draft"
  ) {
    return {
      success:
        false as const,

      quiz,

      message:
        "Only draft quizzes can be edited.",
    };
  }

  return {
    success:
      true as const,

    quiz,

    message:
      "Quiz can be edited.",
  };
}

/* =========================================================
   Common question validation
   ========================================================= */

function validateQuestionText(
  text: string
) {
  const cleanText =
    text.trim();

  if (!cleanText) {
    return {
      success: false,
      message:
        "Question text is required.",
    };
  }

  return {
    success: true,
    message: "",
    cleanText,
  };
}

function validatePoints(
  points: number
) {
  if (
    !Number.isInteger(
      points
    ) ||
    points < 1
  ) {
    return {
      success: false,
      message:
        "Question points must be at least 1.",
    };
  }

  return {
    success: true,
    message: "",
  };
}

/* =========================================================
   Points validation
   ========================================================= */

async function validateQuizPoints(
  quizId: string,
  newQuestionPoints: number,
  ignoredQuestionId?: string
) {
  const quiz =
    await getQuiz(
      quizId
    );

  if (!quiz) {
    return {
      success: false,
      message:
        "Quiz not found.",
    };
  }

  const questions =
    await getQuizQuestions(
      quizId
    );

  const currentlyAssigned =
    questions.reduce(
      (
        total,
        question
      ) => {
        if (
          ignoredQuestionId &&
          question.id ===
            ignoredQuestionId
        ) {
          return total;
        }

        return (
          total +
          question.points
        );
      },
      0
    );

  if (
    currentlyAssigned +
      newQuestionPoints >
    quiz.totalPoints
  ) {
    const remaining =
      Math.max(
        0,
        quiz.totalPoints -
          currentlyAssigned
      );

    return {
      success: false,

      message:
        `This question exceeds the quiz point limit. ` +
        `Only ${remaining} point${
          remaining === 1
            ? ""
            : "s"
        } remain.`,
    };
  }

  return {
    success: true,
    message: "",
  };
}

/* =========================================================
   Planned question limit
   ========================================================= */

async function validateQuestionLimit(
  quizId: string
) {
  const quiz =
    await getQuiz(
      quizId
    );

  if (!quiz) {
    return {
      success: false,
      message:
        "Quiz not found.",
    };
  }

  const questions =
    await getQuizQuestions(
      quizId
    );

  if (
    questions.length >=
    quiz.targetQuestions
  ) {
    return {
      success: false,

      message:
        `This quiz is limited to ${quiz.targetQuestions} question${
          quiz.targetQuestions ===
          1
            ? ""
            : "s"
        }.`,
    };
  }

  return {
    success: true,
    message: "",
  };
}

/* =========================================================
   QCM validation
   ========================================================= */

function validateQcm(
  choices: string[],
  correctChoiceIndex: number
) {
  const cleanedChoices =
    choices.map(
      (choice) =>
        choice.trim()
    );

  if (
    cleanedChoices.length <
    2
  ) {
    return {
      success: false,

      message:
        "A QCM question must have at least 2 choices.",
    };
  }

  if (
    cleanedChoices.some(
      (choice) =>
        !choice
    )
  ) {
    return {
      success: false,

      message:
        "All QCM choices must contain text.",
    };
  }

  if (
    correctChoiceIndex <
      0 ||
    correctChoiceIndex >=
      cleanedChoices.length
  ) {
    return {
      success: false,

      message:
        "Select the correct answer.",
    };
  }

  return {
    success: true,
    message: "",
    choices:
      cleanedChoices,
  };
}

/* =========================================================
   Create QCM
   ========================================================= */

export async function createQcmQuestion(
  input:
    CreateQcmQuestionInput
) {
  const editable =
    await ensureQuizCanBeEdited(
      input.quizId
    );

  if (
    !editable.success ||
    !editable.quiz
  ) {
    return {
      success: false,
      question: null,
      message:
        editable.message,
    };
  }

  const questionLimit =
    await validateQuestionLimit(
      input.quizId
    );

  if (
    !questionLimit.success
  ) {
    return {
      success: false,
      question: null,
      message:
        questionLimit.message,
    };
  }

  const textValidation =
    validateQuestionText(
      input.text
    );

  if (
    !textValidation.success
  ) {
    return {
      success: false,
      question: null,
      message:
        textValidation.message,
    };
  }

  const pointValidation =
    validatePoints(
      input.points
    );

  if (
    !pointValidation.success
  ) {
    return {
      success: false,
      question: null,
      message:
        pointValidation.message,
    };
  }

  const qcmValidation =
    validateQcm(
      input.choices,
      input.correctChoiceIndex
    );

  if (
    !qcmValidation.success
  ) {
    return {
      success: false,
      question: null,
      message:
        qcmValidation.message,
    };
  }

  const pointsValidation =
    await validateQuizPoints(
      input.quizId,
      input.points
    );

  if (
    !pointsValidation.success
  ) {
    return {
      success: false,
      question: null,
      message:
        pointsValidation.message,
    };
  }

  const existingQuestions =
    await getQuizQuestions(
      input.quizId
    );

  const nextOrder =
    existingQuestions.length +
    1;

  const now =
    new Date()
      .toISOString();

  const questionData:
    Omit<
      QcmQuestion,
      "id"
    > = {
      quizId:
        input.quizId,

      teacherId:
        editable.quiz
          .teacherId,

      order:
        nextOrder,

      text:
        textValidation
          .cleanText!,

      type:
        "qcm",

      points:
        input.points,

      choices:
        qcmValidation
          .choices!,

      correctChoiceIndex:
        input.correctChoiceIndex,

      createdAt:
        now,

      updatedAt:
        now,
    };

  const questionDoc =
    await addDoc(
      collection(
        db,
        QUESTIONS_COLLECTION
      ),

      questionData
    );

  await refreshQuizQuestionCounters(
    input.quizId
  );

  return {
    success: true,

    question: {
      id:
        questionDoc.id,

      ...questionData,
    },

    message:
      "QCM question created successfully.",
  };
}

/* =========================================================
   Create development question
   ========================================================= */

export async function createDevelopmentQuestion(
  input:
    CreateDevelopmentQuestionInput
) {
  const editable =
    await ensureQuizCanBeEdited(
      input.quizId
    );

  if (
    !editable.success ||
    !editable.quiz
  ) {
    return {
      success: false,
      question: null,
      message:
        editable.message,
    };
  }

  const questionLimit =
    await validateQuestionLimit(
      input.quizId
    );

  if (
    !questionLimit.success
  ) {
    return {
      success: false,
      question: null,
      message:
        questionLimit.message,
    };
  }

  const textValidation =
    validateQuestionText(
      input.text
    );

  if (
    !textValidation.success
  ) {
    return {
      success: false,
      question: null,
      message:
        textValidation.message,
    };
  }

  const pointValidation =
    validatePoints(
      input.points
    );

  if (
    !pointValidation.success
  ) {
    return {
      success: false,
      question: null,
      message:
        pointValidation.message,
    };
  }

  const pointsValidation =
    await validateQuizPoints(
      input.quizId,
      input.points
    );

  if (
    !pointsValidation.success
  ) {
    return {
      success: false,
      question: null,
      message:
        pointsValidation.message,
    };
  }

  const existingQuestions =
    await getQuizQuestions(
      input.quizId
    );

  const nextOrder =
    existingQuestions.length +
    1;

  const now =
    new Date()
      .toISOString();

  const questionData:
    Omit<
      DevelopmentQuestion,
      "id"
    > = {
      quizId:
        input.quizId,

      teacherId:
        editable.quiz
          .teacherId,

      order:
        nextOrder,

      text:
        textValidation
          .cleanText!,

      type:
        "development",

      points:
        input.points,

      createdAt:
        now,

      updatedAt:
        now,
    };

  const questionDoc =
    await addDoc(
      collection(
        db,
        QUESTIONS_COLLECTION
      ),

      questionData
    );

  await refreshQuizQuestionCounters(
    input.quizId
  );

  return {
    success: true,

    question: {
      id:
        questionDoc.id,

      ...questionData,
    },

    message:
      "Development question created successfully.",
  };
}

/* =========================================================
   Update QCM
   ========================================================= */

export async function updateQcmQuestion(
  questionId: string,
  input:
    UpdateQcmQuestionInput
) {
  const existing =
    await getQuestion(
      questionId
    );

  if (!existing) {
    return {
      success: false,
      question: null,
      message:
        "Question not found.",
    };
  }

  const editable =
    await ensureQuizCanBeEdited(
      existing.quizId
    );

  if (
    !editable.success
  ) {
    return {
      success: false,
      question: null,
      message:
        editable.message,
    };
  }

  const textValidation =
    validateQuestionText(
      input.text
    );

  if (
    !textValidation.success
  ) {
    return {
      success: false,
      question: null,
      message:
        textValidation.message,
    };
  }

  const pointValidation =
    validatePoints(
      input.points
    );

  if (
    !pointValidation.success
  ) {
    return {
      success: false,
      question: null,
      message:
        pointValidation.message,
    };
  }

  const qcmValidation =
    validateQcm(
      input.choices,
      input.correctChoiceIndex
    );

  if (
    !qcmValidation.success
  ) {
    return {
      success: false,
      question: null,
      message:
        qcmValidation.message,
    };
  }

  const pointsValidation =
    await validateQuizPoints(
      existing.quizId,
      input.points,
      questionId
    );

  if (
    !pointsValidation.success
  ) {
    return {
      success: false,
      question: null,
      message:
        pointsValidation.message,
    };
  }

  const updatedAt =
    new Date()
      .toISOString();

  await updateDoc(
    questionRef(
      questionId
    ),
    {
      text:
        textValidation
          .cleanText,

      type:
        "qcm",

      points:
        input.points,

      choices:
        qcmValidation
          .choices,

      correctChoiceIndex:
        input.correctChoiceIndex,

      updatedAt,
    }
  );

  const updated:
    QcmQuestion = {
      id:
        existing.id,

      quizId:
        existing.quizId,

      teacherId:
        existing.teacherId,

      order:
        existing.order,

      text:
        textValidation
          .cleanText!,

      type:
        "qcm",

      points:
        input.points,

      choices:
        qcmValidation
          .choices!,

      correctChoiceIndex:
        input.correctChoiceIndex,

      createdAt:
        existing.createdAt,

      updatedAt,
    };

  await refreshQuizQuestionCounters(
    existing.quizId
  );

  return {
    success: true,
    question:
      updated,
    message:
      "QCM question updated successfully.",
  };
}

/* =========================================================
   Update development question
   ========================================================= */

export async function updateDevelopmentQuestion(
  questionId: string,
  input:
    UpdateDevelopmentQuestionInput
) {
  const existing =
    await getQuestion(
      questionId
    );

  if (!existing) {
    return {
      success: false,
      question: null,
      message:
        "Question not found.",
    };
  }

  const editable =
    await ensureQuizCanBeEdited(
      existing.quizId
    );

  if (
    !editable.success
  ) {
    return {
      success: false,
      question: null,
      message:
        editable.message,
    };
  }

  const textValidation =
    validateQuestionText(
      input.text
    );

  if (
    !textValidation.success
  ) {
    return {
      success: false,
      question: null,
      message:
        textValidation.message,
    };
  }

  const pointValidation =
    validatePoints(
      input.points
    );

  if (
    !pointValidation.success
  ) {
    return {
      success: false,
      question: null,
      message:
        pointValidation.message,
    };
  }

  const pointsValidation =
    await validateQuizPoints(
      existing.quizId,
      input.points,
      questionId
    );

  if (
    !pointsValidation.success
  ) {
    return {
      success: false,
      question: null,
      message:
        pointsValidation.message,
    };
  }

  const updatedAt =
    new Date()
      .toISOString();

  /*
   * Firestore updateDoc does not remove old
   * QCM-only fields by itself.
   *
   * For the editor, it is acceptable to keep
   * them ignored because type=development
   * determines the actual question format.
   */
  await updateDoc(
    questionRef(
      questionId
    ),
    {
      text:
        textValidation
          .cleanText,

      type:
        "development",

      points:
        input.points,

      updatedAt,
    }
  );

  const updated:
    DevelopmentQuestion = {
      id:
        existing.id,

      quizId:
        existing.quizId,

      teacherId:
        existing.teacherId,

      order:
        existing.order,

      text:
        textValidation
          .cleanText!,

      type:
        "development",

      points:
        input.points,

      createdAt:
        existing.createdAt,

      updatedAt,
    };

  await refreshQuizQuestionCounters(
    existing.quizId
  );

  return {
    success: true,
    question:
      updated,
    message:
      "Development question updated successfully.",
  };
}

/* =========================================================
   Delete one question
   ========================================================= */

export async function deleteQuestion(
  questionId: string,
  quizId: string
) {
  const editable =
    await ensureQuizCanBeEdited(
      quizId
    );

  if (
    !editable.success
  ) {
    return {
      success: false,
      message:
        editable.message,
    };
  }

  const question =
    await getQuestion(
      questionId
    );

  if (
    !question ||
    question.quizId !==
      quizId
  ) {
    return {
      success: false,
      message:
        "Question not found.",
    };
  }

  await deleteDoc(
    questionRef(
      questionId
    )
  );

  /*
   * Re-number remaining questions.
   */
  const remainingQuestions =
    await getQuizQuestions(
      quizId
    );

  const batch =
    writeBatch(db);

  remainingQuestions.forEach(
    (
      remainingQuestion,
      index
    ) => {
      batch.update(
        questionRef(
          remainingQuestion.id
        ),
        {
          order:
            index + 1,

          updatedAt:
            new Date()
              .toISOString(),
        }
      );
    }
  );

  await batch.commit();

  await refreshQuizQuestionCounters(
    quizId
  );

  return {
    success: true,
    message:
      "Question deleted successfully.",
  };
}

/* =========================================================
   Reorder questions
   ========================================================= */

export async function reorderQuestions(
  quizId: string,
  orderedQuestionIds:
    string[]
) {
  const editable =
    await ensureQuizCanBeEdited(
      quizId
    );

  if (
    !editable.success
  ) {
    return {
      success: false,
      message:
        editable.message,
    };
  }

  const questions =
    await getQuizQuestions(
      quizId
    );

  const validIds =
    new Set(
      questions.map(
        (question) =>
          question.id
      )
    );

  if (
    orderedQuestionIds.length !==
      questions.length ||
    orderedQuestionIds.some(
      (questionId) =>
        !validIds.has(
          questionId
        )
    )
  ) {
    return {
      success: false,
      message:
        "The question order is invalid.",
    };
  }

  const now =
    new Date()
      .toISOString();

  const batch =
    writeBatch(db);

  orderedQuestionIds.forEach(
    (
      questionId,
      index
    ) => {
      batch.update(
        questionRef(
          questionId
        ),
        {
          order:
            index + 1,
          updatedAt:
            now,
        }
      );
    }
  );

  await batch.commit();

  return {
    success: true,
    message:
      "Question order updated successfully.",
  };
}

/* =========================================================
   Delete all quiz questions
   ========================================================= */

export async function deleteQuestionsByQuizId(
  quizId: string
) {
  const questions =
    await getQuizQuestions(
      quizId
    );

  if (
    questions.length ===
    0
  ) {
    return {
      success: true,
      message:
        "No quiz questions to delete.",
    };
  }

  const batch =
    writeBatch(db);

  questions.forEach(
    (question) => {
      batch.delete(
        questionRef(
          question.id
        )
      );
    }
  );

  await batch.commit();

  await updateQuizQuestionCounters(
    quizId,
    {
      totalQuestions:
        0,

      qcmQuestions:
        0,

      developmentQuestions:
        0,
    }
  );

  return {
    success: true,
    message:
      "All quiz questions deleted successfully.",
  };
}