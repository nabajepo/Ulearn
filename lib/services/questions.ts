// lib/services/questions.ts

import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
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
  LIMITS,
} from "@/lib/services/limits";

import {
  getQuiz,
  updateQuizQuestionCounters,
} from "@/lib/services/quizzes";

/* =========================================================
   Types
   ========================================================= */

export type QuestionType =
  | "qcm"
  | "multiple_choice"
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

/* =========================================================
   QCM
   One correct answer
   ========================================================= */

export type QcmQuestion =
  BaseQuestion & {
    type: "qcm";

    choices: string[];

    correctChoiceIndex: number;
  };

/* =========================================================
   Multiple choice
   Several correct answers
   ========================================================= */

export type MultipleChoiceQuestion =
  BaseQuestion & {
    type: "multiple_choice";

    choices: string[];

    correctChoiceIndexes:
      number[];
  };

/* =========================================================
   Development
   ========================================================= */

export type DevelopmentQuestion =
  BaseQuestion & {
    type: "development";
  };

/* =========================================================
   Question union
   ========================================================= */

export type Question =
  | QcmQuestion
  | MultipleChoiceQuestion
  | DevelopmentQuestion;

/* =========================================================
   Create inputs
   ========================================================= */

export type CreateQcmQuestionInput = {
  quizId: string;

  text: string;

  points: number;

  choices: string[];

  correctChoiceIndex: number;
};

export type CreateMultipleChoiceQuestionInput = {
  quizId: string;

  text: string;

  points: number;

  choices: string[];

  correctChoiceIndexes:
    number[];
};

export type CreateDevelopmentQuestionInput = {
  quizId: string;

  text: string;

  points: number;
};

/* =========================================================
   Update inputs
   ========================================================= */

export type UpdateQcmQuestionInput = {
  text: string;

  points: number;

  choices: string[];

  correctChoiceIndex: number;
};

export type UpdateMultipleChoiceQuestionInput = {
  text: string;

  points: number;

  choices: string[];

  correctChoiceIndexes:
    number[];
};

export type UpdateDevelopmentQuestionInput = {
  text: string;

  points: number;
};

/* =========================================================
   Statistics
   ========================================================= */

export type QuizQuestionStats = {
  totalQuestions: number;

  qcmQuestions: number;

  multipleChoiceQuestions:
    number;

  developmentQuestions:
    number;

  automaticQuestions:
    number;

  assignedPoints: number;
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
   Mapping helpers
   ========================================================= */

function mapChoices(
  value: unknown
): string[] {
  if (
    !Array.isArray(
      value
    )
  ) {
    return [];
  }

  return value.filter(
    (
      choice
    ): choice is string =>
      typeof choice ===
      "string"
  );
}

function mapCorrectChoiceIndexes(
  value: unknown,
  choicesLength: number
): number[] {
  if (
    !Array.isArray(
      value
    )
  ) {
    return [];
  }

  return Array.from(
    new Set(
      value.filter(
        (
          index
        ): index is number =>
          typeof index ===
            "number" &&
          Number.isInteger(
            index
          ) &&
          index >= 0 &&
          index <
            choicesLength
      )
    )
  ).sort(
    (
      first,
      second
    ) =>
      first -
      second
  );
}

/* =========================================================
   Mapping
   ========================================================= */

function mapQuestion(
  docId: string,

  data:
    Record<
      string,
      unknown
    >
): Question {
  const type:
    QuestionType =
    data.type ===
    "development"
      ? "development"
      : data.type ===
          "multiple_choice"
        ? "multiple_choice"
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

  /* =====================================================
     Development
     ===================================================== */

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

  const choices =
    mapChoices(
      data.choices
    );

  /* =====================================================
     Multiple choice
     ===================================================== */

  if (
    type ===
    "multiple_choice"
  ) {
    return {
      ...base,

      type:
        "multiple_choice",

      choices,

      correctChoiceIndexes:
        mapCorrectChoiceIndexes(
          data.correctChoiceIndexes,
          choices.length
        ),
    };
  }

  /* =====================================================
     QCM
     ===================================================== */

  const correctChoiceIndex =
    typeof data.correctChoiceIndex ===
      "number" &&
    Number.isInteger(
      data.correctChoiceIndex
    )
      ? data.correctChoiceIndex
      : 0;

  return {
    ...base,

    type:
      "qcm",

    choices,

    correctChoiceIndex,
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
  const questionsQuery =
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
    await getDocs(
      questionsQuery
    );

  const questions =
    snapshot.docs.map(
      (
        documentSnapshot
      ) =>
        mapQuestion(
          documentSnapshot.id,
          documentSnapshot.data()
        )
    );

  /*
   * Client-side ordering avoids requiring
   * another Firestore index.
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
): Promise<QuizQuestionStats> {
  const questions =
    await getQuizQuestions(
      quizId
    );

  const qcmQuestions =
    questions.filter(
      (
        question
      ) =>
        question.type ===
        "qcm"
    ).length;

  const multipleChoiceQuestions =
    questions.filter(
      (
        question
      ) =>
        question.type ===
        "multiple_choice"
    ).length;

  const developmentQuestions =
    questions.filter(
      (
        question
      ) =>
        question.type ===
        "development"
    ).length;

  const automaticQuestions =
    qcmQuestions +
    multipleChoiceQuestions;

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

    multipleChoiceQuestions,

    developmentQuestions,

    automaticQuestions,

    assignedPoints,
  };
}

/* =========================================================
   Refresh quiz counters
   ========================================================= */

/*
 * Keep the counters stored in the quiz
 * synchronized with the real questions
 * stored in Firestore.
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

      multipleChoiceQuestions:
        stats.multipleChoiceQuestions,

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

  if (
    !quiz
  ) {
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
   Question text validation
   ========================================================= */

function validateQuestionText(
  text: string
) {
  const cleanText =
    text.trim();

  if (
    !cleanText
  ) {
    return {
      success:
        false as const,

      message:
        "Question text is required.",

      cleanText:
        "",
    };
  }

  return {
    success:
      true as const,

    message:
      "",

    cleanText,
  };
}

/* =========================================================
   Points validation
   ========================================================= */

function validatePoints(
  points: number
) {
  if (
    !Number.isInteger(
      points
    ) ||
    points <
      1
  ) {
    return {
      success:
        false as const,

      message:
        "Question points must be at least 1.",
    };
  }

  return {
    success:
      true as const,

    message:
      "",
  };
}

/* =========================================================
   Quiz points validation
   ========================================================= */

async function validateQuizPoints(
  quizId: string,

  newQuestionPoints: number,

  ignoredQuestionId?:
    string
) {
  const quiz =
    await getQuiz(
      quizId
    );

  if (
    !quiz
  ) {
    return {
      success:
        false as const,

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
      success:
        false as const,

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
    success:
      true as const,

    message:
      "",
  };
}

/* =========================================================
   Total question limit
   ========================================================= */

async function validateQuestionLimit(
  quizId: string
) {
  const quiz =
    await getQuiz(
      quizId
    );

  if (
    !quiz
  ) {
    return {
      success:
        false as const,

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
    LIMITS.MAX_QUESTIONS_PER_QUIZ
  ) {
    return {
      success:
        false as const,

      message:
        `A quiz cannot contain more than ${LIMITS.MAX_QUESTIONS_PER_QUIZ} questions.`,
    };
  }

  if (
    questions.length >=
    quiz.targetQuestions
  ) {
    return {
      success:
        false as const,

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
    success:
      true as const,

    message:
      "",
  };
}

/* =========================================================
   Question type limits
   ========================================================= */

/*
 * ULearn limits:
 *
 * QCM + Multiple Choice <= MAX_QCM_QUESTIONS
 *
 * Development <= MAX_DEVELOPMENT_QUESTIONS
 *
 * ignoredQuestionId is used while editing.
 * It prevents the current question from being
 * counted twice when its type changes.
 */

async function validateQuestionTypeLimit(
  quizId: string,

  targetType:
    QuestionType,

  ignoredQuestionId?:
    string
) {
  const questions =
    await getQuizQuestions(
      quizId
    );

  const otherQuestions =
    questions.filter(
      (
        question
      ) =>
        !ignoredQuestionId ||
        question.id !==
          ignoredQuestionId
    );

  const qcmQuestions =
    otherQuestions.filter(
      (
        question
      ) =>
        question.type ===
        "qcm"
    ).length;

  const multipleChoiceQuestions =
    otherQuestions.filter(
      (
        question
      ) =>
        question.type ===
        "multiple_choice"
    ).length;

  const developmentQuestions =
    otherQuestions.filter(
      (
        question
      ) =>
        question.type ===
        "development"
    ).length;

  const automaticQuestions =
    qcmQuestions +
    multipleChoiceQuestions;

  /* =====================================================
     Development limit
     ===================================================== */

  if (
    targetType ===
    "development"
  ) {
    if (
      developmentQuestions >=
      LIMITS.MAX_DEVELOPMENT_QUESTIONS
    ) {
      return {
        success:
          false as const,

        message:
          `The quiz cannot contain more than ${LIMITS.MAX_DEVELOPMENT_QUESTIONS} development questions.`,
      };
    }

    return {
      success:
        true as const,

      message:
        "",
    };
  }

  /* =====================================================
     Automatic question limit
     ===================================================== */

  if (
    automaticQuestions >=
    LIMITS.MAX_QCM_QUESTIONS
  ) {
    return {
      success:
        false as const,

      message:
        `The quiz cannot contain more than ${LIMITS.MAX_QCM_QUESTIONS} automatically graded questions.`,
    };
  }

  return {
    success:
      true as const,

    message:
      "",
  };
}

/* =========================================================
   Answer choices validation
   ========================================================= */

function validateChoices(
  choices: string[]
) {
  const cleanedChoices =
    choices.map(
      (
        choice
      ) =>
        choice.trim()
    );

  if (
    cleanedChoices.length <
    2
  ) {
    return {
      success:
        false as const,

      message:
        "A choice question must have at least 2 choices.",

      choices:
        [] as string[],
    };
  }

  if (
    cleanedChoices.some(
      (
        choice
      ) =>
        !choice
    )
  ) {
    return {
      success:
        false as const,

      message:
        "All answer choices must contain text.",

      choices:
        [] as string[],
    };
  }

  return {
    success:
      true as const,

    message:
      "",

    choices:
      cleanedChoices,
  };
}

/* =========================================================
   QCM validation
   ========================================================= */

function validateQcm(
  choices: string[],

  correctChoiceIndex:
    number
) {
  const choicesValidation =
    validateChoices(
      choices
    );

  if (
    !choicesValidation.success
  ) {
    return {
      success:
        false as const,

      message:
        choicesValidation.message,

      choices:
        [] as string[],
    };
  }

  if (
    !Number.isInteger(
      correctChoiceIndex
    ) ||
    correctChoiceIndex <
      0 ||
    correctChoiceIndex >=
      choicesValidation
        .choices.length
  ) {
    return {
      success:
        false as const,

      message:
        "Select the correct answer.",

      choices:
        [] as string[],
    };
  }

  return {
    success:
      true as const,

    message:
      "",

    choices:
      choicesValidation.choices,
  };
}

/* =========================================================
   Multiple-choice validation
   ========================================================= */

function validateMultipleChoice(
  choices: string[],

  correctChoiceIndexes:
    number[]
) {
  const choicesValidation =
    validateChoices(
      choices
    );

  if (
    !choicesValidation.success
  ) {
    return {
      success:
        false as const,

      message:
        choicesValidation.message,

      choices:
        [] as string[],

      correctChoiceIndexes:
        [] as number[],
    };
  }

  const uniqueIndexes =
    Array.from(
      new Set(
        correctChoiceIndexes
      )
    ).sort(
      (
        first,
        second
      ) =>
        first -
        second
    );

  /*
   * Multiple-choice means several
   * correct answers.
   *
   * One correct answer should use QCM.
   */
  if (
    uniqueIndexes.length <
    2
  ) {
    return {
      success:
        false as const,

      message:
        "A multiple-choice question must have at least 2 correct answers.",

      choices:
        [] as string[],

      correctChoiceIndexes:
        [] as number[],
    };
  }

  if (
    uniqueIndexes.some(
      (
        index
      ) =>
        !Number.isInteger(
          index
        ) ||
        index <
          0 ||
        index >=
          choicesValidation
            .choices.length
    )
  ) {
    return {
      success:
        false as const,

      message:
        "One or more selected correct answers are invalid.",

      choices:
        [] as string[],

      correctChoiceIndexes:
        [] as number[],
    };
  }

  return {
    success:
      true as const,

    message:
      "",

    choices:
      choicesValidation.choices,

    correctChoiceIndexes:
      uniqueIndexes,
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
      success:
        false,

      question:
        null,

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
      success:
        false,

      question:
        null,

      message:
        questionLimit.message,
    };
  }

  const typeLimit =
    await validateQuestionTypeLimit(
      input.quizId,
      "qcm"
    );

  if (
    !typeLimit.success
  ) {
    return {
      success:
        false,

      question:
        null,

      message:
        typeLimit.message,
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
      success:
        false,

      question:
        null,

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
      success:
        false,

      question:
        null,

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
      success:
        false,

      question:
        null,

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
      success:
        false,

      question:
        null,

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
      editable.quiz.teacherId,

    order:
      nextOrder,

    text:
      textValidation.cleanText,

    type:
      "qcm",

    points:
      input.points,

    choices:
      qcmValidation.choices,

    correctChoiceIndex:
      input.correctChoiceIndex,

    createdAt:
      now,

    updatedAt:
      now,
  };

  const questionDocument =
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
    success:
      true,

    question: {
      id:
        questionDocument.id,

      ...questionData,
    },

    message:
      "QCM question created successfully.",
  };
}

/* =========================================================
   Create multiple-choice question
   ========================================================= */

export async function createMultipleChoiceQuestion(
  input:
    CreateMultipleChoiceQuestionInput
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
      success:
        false,

      question:
        null,

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
      success:
        false,

      question:
        null,

      message:
        questionLimit.message,
    };
  }

  const typeLimit =
    await validateQuestionTypeLimit(
      input.quizId,
      "multiple_choice"
    );

  if (
    !typeLimit.success
  ) {
    return {
      success:
        false,

      question:
        null,

      message:
        typeLimit.message,
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
      success:
        false,

      question:
        null,

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
      success:
        false,

      question:
        null,

      message:
        pointValidation.message,
    };
  }

  const multipleValidation =
    validateMultipleChoice(
      input.choices,
      input.correctChoiceIndexes
    );

  if (
    !multipleValidation.success
  ) {
    return {
      success:
        false,

      question:
        null,

      message:
        multipleValidation.message,
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
      success:
        false,

      question:
        null,

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
      MultipleChoiceQuestion,
      "id"
    > = {
    quizId:
      input.quizId,

    teacherId:
      editable.quiz.teacherId,

    order:
      nextOrder,

    text:
      textValidation.cleanText,

    type:
      "multiple_choice",

    points:
      input.points,

    choices:
      multipleValidation.choices,

    correctChoiceIndexes:
      multipleValidation
        .correctChoiceIndexes,

    createdAt:
      now,

    updatedAt:
      now,
  };

  const questionDocument =
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
    success:
      true,

    question: {
      id:
        questionDocument.id,

      ...questionData,
    },

    message:
      "Multiple-choice question created successfully.",
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
      success:
        false,

      question:
        null,

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
      success:
        false,

      question:
        null,

      message:
        questionLimit.message,
    };
  }

  const typeLimit =
    await validateQuestionTypeLimit(
      input.quizId,
      "development"
    );

  if (
    !typeLimit.success
  ) {
    return {
      success:
        false,

      question:
        null,

      message:
        typeLimit.message,
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
      success:
        false,

      question:
        null,

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
      success:
        false,

      question:
        null,

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
      success:
        false,

      question:
        null,

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
      editable.quiz.teacherId,

    order:
      nextOrder,

    text:
      textValidation.cleanText,

    type:
      "development",

    points:
      input.points,

    createdAt:
      now,

    updatedAt:
      now,
  };

  const questionDocument =
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
    success:
      true,

    question: {
      id:
        questionDocument.id,

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

  if (
    !existing
  ) {
    return {
      success:
        false,

      question:
        null,

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
      success:
        false,

      question:
        null,

      message:
        editable.message,
    };
  }

  const typeLimit =
    await validateQuestionTypeLimit(
      existing.quizId,
      "qcm",
      questionId
    );

  if (
    !typeLimit.success
  ) {
    return {
      success:
        false,

      question:
        null,

      message:
        typeLimit.message,
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
      success:
        false,

      question:
        null,

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
      success:
        false,

      question:
        null,

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
      success:
        false,

      question:
        null,

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
      success:
        false,

      question:
        null,

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
        textValidation.cleanText,

      type:
        "qcm",

      points:
        input.points,

      choices:
        qcmValidation.choices,

      correctChoiceIndex:
        input.correctChoiceIndex,

      correctChoiceIndexes:
        deleteField(),

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
      textValidation.cleanText,

    type:
      "qcm",

    points:
      input.points,

    choices:
      qcmValidation.choices,

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
    success:
      true,

    question:
      updated,

    message:
      "QCM question updated successfully.",
  };
}

/* =========================================================
   Update multiple-choice
   ========================================================= */

export async function updateMultipleChoiceQuestion(
  questionId: string,

  input:
    UpdateMultipleChoiceQuestionInput
) {
  const existing =
    await getQuestion(
      questionId
    );

  if (
    !existing
  ) {
    return {
      success:
        false,

      question:
        null,

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
      success:
        false,

      question:
        null,

      message:
        editable.message,
    };
  }

  const typeLimit =
    await validateQuestionTypeLimit(
      existing.quizId,
      "multiple_choice",
      questionId
    );

  if (
    !typeLimit.success
  ) {
    return {
      success:
        false,

      question:
        null,

      message:
        typeLimit.message,
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
      success:
        false,

      question:
        null,

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
      success:
        false,

      question:
        null,

      message:
        pointValidation.message,
    };
  }

  const multipleValidation =
    validateMultipleChoice(
      input.choices,
      input.correctChoiceIndexes
    );

  if (
    !multipleValidation.success
  ) {
    return {
      success:
        false,

      question:
        null,

      message:
        multipleValidation.message,
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
      success:
        false,

      question:
        null,

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
        textValidation.cleanText,

      type:
        "multiple_choice",

      points:
        input.points,

      choices:
        multipleValidation.choices,

      correctChoiceIndexes:
        multipleValidation
          .correctChoiceIndexes,

      correctChoiceIndex:
        deleteField(),

      updatedAt,
    }
  );

  const updated:
    MultipleChoiceQuestion = {
    id:
      existing.id,

    quizId:
      existing.quizId,

    teacherId:
      existing.teacherId,

    order:
      existing.order,

    text:
      textValidation.cleanText,

    type:
      "multiple_choice",

    points:
      input.points,

    choices:
      multipleValidation.choices,

    correctChoiceIndexes:
      multipleValidation
        .correctChoiceIndexes,

    createdAt:
      existing.createdAt,

    updatedAt,
  };

  await refreshQuizQuestionCounters(
    existing.quizId
  );

  return {
    success:
      true,

    question:
      updated,

    message:
      "Multiple-choice question updated successfully.",
  };
}

/* =========================================================
   Update development
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

  if (
    !existing
  ) {
    return {
      success:
        false,

      question:
        null,

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
      success:
        false,

      question:
        null,

      message:
        editable.message,
    };
  }

  const typeLimit =
    await validateQuestionTypeLimit(
      existing.quizId,
      "development",
      questionId
    );

  if (
    !typeLimit.success
  ) {
    return {
      success:
        false,

      question:
        null,

      message:
        typeLimit.message,
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
      success:
        false,

      question:
        null,

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
      success:
        false,

      question:
        null,

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
      success:
        false,

      question:
        null,

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
        textValidation.cleanText,

      type:
        "development",

      points:
        input.points,

      choices:
        deleteField(),

      correctChoiceIndex:
        deleteField(),

      correctChoiceIndexes:
        deleteField(),

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
      textValidation.cleanText,

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
    success:
      true,

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
      success:
        false,

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
      success:
        false,

      message:
        "Question not found.",
    };
  }

  await deleteDoc(
    questionRef(
      questionId
    )
  );

  const remainingQuestions =
    await getQuizQuestions(
      quizId
    );

  const batch =
    writeBatch(
      db
    );

  const now =
    new Date()
      .toISOString();

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
            index +
            1,

          updatedAt:
            now,
        }
      );
    }
  );

  await batch.commit();

  await refreshQuizQuestionCounters(
    quizId
  );

  return {
    success:
      true,

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
      success:
        false,

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
        (
          question
        ) =>
          question.id
      )
    );

  const uniqueOrderedIds =
    new Set(
      orderedQuestionIds
    );

  if (
    orderedQuestionIds.length !==
      questions.length ||
    uniqueOrderedIds.size !==
      orderedQuestionIds.length ||
    orderedQuestionIds.some(
      (
        questionId
      ) =>
        !validIds.has(
          questionId
        )
    )
  ) {
    return {
      success:
        false,

      message:
        "The question order is invalid.",
    };
  }

  const now =
    new Date()
      .toISOString();

  const batch =
    writeBatch(
      db
    );

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
            index +
            1,

          updatedAt:
            now,
        }
      );
    }
  );

  await batch.commit();

  return {
    success:
      true,

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
    questions.length >
    0
  ) {
    const batch =
      writeBatch(
        db
      );

    questions.forEach(
      (
        question
      ) => {
        batch.delete(
          questionRef(
            question.id
          )
        );
      }
    );

    await batch.commit();
  }

  /*
   * IMPORTANT:
   * Reset ALL four stored counters.
   */

  await updateQuizQuestionCounters(
    quizId,
    {
      totalQuestions:
        0,

      qcmQuestions:
        0,

      multipleChoiceQuestions:
        0,

      developmentQuestions:
        0,
    }
  );

  return {
    success:
      true,

    message:
      questions.length ===
      0
        ? "No quiz questions to delete."
        : "All quiz questions deleted successfully.",
  };
}

/* =========================================================
   Development questions
   ========================================================= */

/**
 * Returns only development questions for one quiz.
 *
 * Useful for teacher grading.
 */
export async function getDevelopmentQuestionsByQuizId(
  quizId: string
): Promise<DevelopmentQuestion[]> {
  const questions =
    await getQuizQuestions(
      quizId
    );

  return questions.filter(
    (
      question
    ): question is DevelopmentQuestion =>
      question.type ===
      "development"
  );
}

/* =========================================================
   Question map
   ========================================================= */

/**
 * Returns the quiz questions indexed by their ID.
 *
 * This is useful when an attempt contains a frozen
 * questionOrder and we need to rebuild the student's
 * exact quiz order.
 */
export async function getQuizQuestionMap(
  quizId: string
): Promise<
  Map<
    string,
    Question
  >
> {
  const questions =
    await getQuizQuestions(
      quizId
    );

  return new Map(
    questions.map(
      (
        question
      ) => [
        question.id,
        question,
      ]
    )
  );
}