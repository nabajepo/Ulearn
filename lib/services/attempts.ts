// lib/services/attempts.ts

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  updateDoc,
  where,
} from "firebase/firestore";

import {
  db,
} from "@/lib/firebase";

import {
  getQuiz,
  type Quiz,
} from "@/lib/services/quizzes";

import {
  getQuizQuestions,
  type Question,
} from "@/lib/services/questions";

/* =========================================================
   Types
   ========================================================= */

export type AttemptStatus =
  | "in_progress"
  | "submitted"
  | "graded";

export type AttemptAnswer = {
  /*
   * QCM:
   * original choice index.
   */
  selectedChoiceIndex?:
    number;

  /*
   * MULTIPLE CHOICE:
   * original choice indexes.
   */
  selectedChoiceIndexes?:
    number[];

  /*
   * DEVELOPMENT:
   * free-text answer.
   */
  developmentAnswer?:
    string;

  updatedAt:
    string;
};

/*
 * Manual score assigned by the teacher
 * to each development question.
 *
 * questionId -> score
 */
export type DevelopmentScores =
  Record<
    string,
    number
  >;

export type Attempt = {
  id:
    string;

  /* =====================================================
     Quiz
     ===================================================== */

  quizId:
    string;

  teacherId:
    string;

  /* =====================================================
     Student identity
     ===================================================== */

  studentName:
    string;

  studentEmail:
    string;

  /* =====================================================
     Attempt state
     ===================================================== */

  status:
    AttemptStatus;

  startedAt:
    string;

  expiresAt:
    string;

  submittedAt:
    string | null;

  gradedAt:
    string | null;

  /* =====================================================
     Frozen student options
     ===================================================== */

  allowBackNavigation:
    boolean;

  showResultsToStudents:
    boolean;

  showCorrectAnswers:
    boolean;

  shuffleQuestions:
    boolean;

  shuffleChoices:
    boolean;

  /* =====================================================
     Frozen ordering
     ===================================================== */

  questionOrder:
    string[];

  /*
   * questionId -> original indexes
   * in displayed order.
   */
  choiceOrders:
    Record<
      string,
      number[]
    >;

  /* =====================================================
     Answers
     ===================================================== */

  answers:
    Record<
      string,
      AttemptAnswer
    >;

  /* =====================================================
     Scores
     ===================================================== */

  automaticScore:
    number;

  manualScore:
    number;

  finalScore:
    number | null;

  /*
   * Individual development question scores.
   */
  developmentScores:
    DevelopmentScores;

  /* =====================================================
     Dates
     ===================================================== */

  createdAt:
    string;

  updatedAt:
    string;
};

/* =========================================================
   Start attempt
   ========================================================= */

export type StartAttemptInput = {
  quizId:
    string;

  studentName:
    string;

  studentEmail:
    string;
};

export type StartAttemptResult = {
  success:
    boolean;

  attempt:
    Attempt | null;

  resumed:
    boolean;

  /*
   * Stable i18n key.
   *
   * UI:
   * t(result.messageKey)
   */
  messageKey:
    string;

  /*
   * Developer/debug fallback.
   *
   * Do not display this directly
   * in translated public pages.
   */
  message:
    string;
};

/* =========================================================
   Submit attempt
   ========================================================= */

export type SubmitAttemptResult = {
  success:
    boolean;

  status:
    AttemptStatus | null;

  automaticScore:
    number | null;

  finalScore:
    number | null;

  requiresManualGrading:
    boolean;

  messageKey:
    string;

  message:
    string;
};

/* =========================================================
   Save answer
   ========================================================= */

export type SaveAttemptAnswerInput = {
  selectedChoiceIndex?:
    number;

  selectedChoiceIndexes?:
    number[];

  developmentAnswer?:
    string;
};

/* =========================================================
   Save answer result
   ========================================================= */

export type AttemptActionResult = {
  success:
    boolean;

  messageKey:
    string;

  message:
    string;
};

/* =========================================================
   Teacher grading
   ========================================================= */

export type GradeAttemptInput = {
  /*
   * Authenticated teacher performing the correction.
   *
   * The correction page should pass teacher.id here.
   */
  teacherId:
    string;

  /*
   * questionId -> points assigned
   */
  developmentScores:
    DevelopmentScores;
};

export type GradeAttemptResult = {
  success:
    boolean;

  attempt:
    Attempt | null;

  automaticScore:
    number | null;

  manualScore:
    number | null;

  finalScore:
    number | null;

  messageKey:
    string;

  message:
    string;
};

/* =========================================================
   Quiz attempt statistics
   ========================================================= */

export type QuizAttemptStats = {
  total:
    number;

  inProgress:
    number;

  submitted:
    number;

  graded:
    number;

  /*
   * Students who have finished answering:
   *
   * submitted + graded
   */
  finished:
    number;

  /*
   * Students waiting for manual correction.
   */
  waitingForCorrection:
    number;
};

/* =========================================================
   Automatic grading
   ========================================================= */

type AutomaticGradingResult = {
  automaticScore:
    number;

  qcmQuestions:
    number;

  multipleChoiceQuestions:
    number;

  developmentQuestions:
    number;
};

/* =========================================================
   Constants
   ========================================================= */

const ATTEMPTS_COLLECTION =
  "attempts";

const MAX_STUDENT_NAME_LENGTH =
  120;

const MAX_STUDENT_EMAIL_LENGTH =
  200;

const MAX_DEVELOPMENT_ANSWER_LENGTH =
  5000;

/* =========================================================
   Firestore reference
   ========================================================= */

function attemptRef(
  attemptId: string
) {
  return doc(
    db,
    ATTEMPTS_COLLECTION,
    attemptId
  );
}

/* =========================================================
   Helpers
   ========================================================= */

function normalizeEmail(
  value: string
) {
  return value
    .trim()
    .toLowerCase();
}

function isValidEmail(
  email: string
) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email
  );
}

function roundScore(
  value: number
) {
  return (
    Math.round(
      (
        value +
        Number.EPSILON
      ) *
        10000
    ) /
    10000
  );
}

function safeDateMs(
  value: string | null
) {
  if (
    !value
  ) {
    return 0;
  }

  const timestamp =
    new Date(
      value
    ).getTime();

  return Number.isNaN(
    timestamp
  )
    ? 0
    : timestamp;
}

/* =========================================================
   Shuffle
   ========================================================= */

function shuffleArray<T>(
  values: T[]
) {
  const result = [
    ...values,
  ];

  for (
    let index =
      result.length - 1;

    index >
    0;

    index -=
      1
  ) {
    const randomIndex =
      Math.floor(
        Math.random() *
          (
            index +
            1
          )
      );

    [
      result[index],
      result[randomIndex],
    ] = [
      result[randomIndex],
      result[index],
    ];
  }

  return result;
}

/* =========================================================
   Index arrays
   ========================================================= */

function normalizeIndexArray(
  value: unknown
): number[] {
  if (
    !Array.isArray(
      value
    )
  ) {
    return [];
  }

  const indexes =
    value.filter(
      (
        item
      ): item is number =>
        typeof item ===
          "number" &&
        Number.isInteger(
          item
        ) &&
        item >=
          0
    );

  return [
    ...new Set(
      indexes
    ),
  ];
}

/* =========================================================
   Choice orders
   ========================================================= */

function mapChoiceOrders(
  value: unknown
) {
  const result:
    Record<
      string,
      number[]
    > = {};

  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return result;
  }

  for (
    const [
      questionId,
      rawOrder,
    ] of Object.entries(
      value as Record<
        string,
        unknown
      >
    )
  ) {
    result[
      questionId
    ] =
      normalizeIndexArray(
        rawOrder
      );
  }

  return result;
}

/* =========================================================
   Attempt answers
   ========================================================= */

function mapAttemptAnswers(
  value: unknown
) {
  const result:
    Record<
      string,
      AttemptAnswer
    > = {};

  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return result;
  }

  for (
    const [
      questionId,
      rawAnswer,
    ] of Object.entries(
      value as Record<
        string,
        unknown
      >
    )
  ) {
    if (
      !rawAnswer ||
      typeof rawAnswer !==
        "object"
    ) {
      continue;
    }

    const data =
      rawAnswer as Record<
        string,
        unknown
      >;

    const answer:
      AttemptAnswer = {
      updatedAt:
        typeof data.updatedAt ===
        "string"
          ? data.updatedAt
          : "",
    };

    if (
      typeof data.selectedChoiceIndex ===
        "number" &&
      Number.isInteger(
        data.selectedChoiceIndex
      ) &&
      data.selectedChoiceIndex >=
        0
    ) {
      answer.selectedChoiceIndex =
        data.selectedChoiceIndex;
    }

    if (
      Array.isArray(
        data.selectedChoiceIndexes
      )
    ) {
      answer.selectedChoiceIndexes =
        normalizeIndexArray(
          data.selectedChoiceIndexes
        );
    }

    if (
      typeof data.developmentAnswer ===
      "string"
    ) {
      answer.developmentAnswer =
        data.developmentAnswer;
    }

    result[
      questionId
    ] =
      answer;
  }

  return result;
}

/* =========================================================
   Development scores
   ========================================================= */

function mapDevelopmentScores(
  value: unknown
): DevelopmentScores {
  const result:
    DevelopmentScores = {};

  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return result;
  }

  for (
    const [
      questionId,
      rawScore,
    ] of Object.entries(
      value as Record<
        string,
        unknown
      >
    )
  ) {
    if (
      typeof rawScore !==
        "number" ||
      !Number.isFinite(
        rawScore
      )
    ) {
      continue;
    }

    result[
      questionId
    ] =
      roundScore(
        rawScore
      );
  }

  return result;
}

/* =========================================================
   Map Firestore attempt
   ========================================================= */

function mapAttempt(
  attemptId: string,

  data:
    Record<
      string,
      unknown
    >
): Attempt {
  return {
    id:
      attemptId,

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

    studentName:
      typeof data.studentName ===
      "string"
        ? data.studentName
        : "",

    studentEmail:
      typeof data.studentEmail ===
      "string"
        ? data.studentEmail
        : "",

    status:
      data.status ===
      "submitted"
        ? "submitted"
        : data.status ===
            "graded"
          ? "graded"
          : "in_progress",

    startedAt:
      typeof data.startedAt ===
      "string"
        ? data.startedAt
        : "",

    expiresAt:
      typeof data.expiresAt ===
      "string"
        ? data.expiresAt
        : "",

    submittedAt:
      typeof data.submittedAt ===
      "string"
        ? data.submittedAt
        : null,

    gradedAt:
      typeof data.gradedAt ===
      "string"
        ? data.gradedAt
        : null,

    allowBackNavigation:
      typeof data.allowBackNavigation ===
      "boolean"
        ? data.allowBackNavigation
        : true,

    showResultsToStudents:
      typeof data.showResultsToStudents ===
      "boolean"
        ? data.showResultsToStudents
        : false,

    showCorrectAnswers:
      typeof data.showCorrectAnswers ===
      "boolean"
        ? data.showCorrectAnswers
        : false,

    shuffleQuestions:
      typeof data.shuffleQuestions ===
      "boolean"
        ? data.shuffleQuestions
        : false,

    shuffleChoices:
      typeof data.shuffleChoices ===
      "boolean"
        ? data.shuffleChoices
        : false,

    questionOrder:
      Array.isArray(
        data.questionOrder
      )
        ? data.questionOrder.filter(
            (
              value
            ): value is string =>
              typeof value ===
              "string"
          )
        : [],

    choiceOrders:
      mapChoiceOrders(
        data.choiceOrders
      ),

    answers:
      mapAttemptAnswers(
        data.answers
      ),

    automaticScore:
      typeof data.automaticScore ===
      "number"
        ? data.automaticScore
        : 0,

    manualScore:
      typeof data.manualScore ===
      "number"
        ? data.manualScore
        : 0,

    finalScore:
      typeof data.finalScore ===
      "number"
        ? data.finalScore
        : null,

    developmentScores:
      mapDevelopmentScores(
        data.developmentScores
      ),

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
}

/* =========================================================
   Get one attempt
   ========================================================= */

export async function getAttempt(
  attemptId: string
): Promise<
  Attempt | null
> {
  const snapshot =
    await getDoc(
      attemptRef(
        attemptId
      )
    );

  if (
    !snapshot.exists()
  ) {
    return null;
  }

  return mapAttempt(
    snapshot.id,
    snapshot.data()
  );
}

/* =========================================================
   Get all attempts belonging to a quiz
   ========================================================= */

/*
 * We deliberately sort client-side.
 *
 * This avoids requiring an additional
 * Firestore composite index for:
 *
 * where("quizId", "==", ...)
 * + orderBy(...)
 */
export async function getQuizAttempts(
  quizId: string
): Promise<
  Attempt[]
> {
  const cleanQuizId =
    quizId.trim();

  if (
    !cleanQuizId
  ) {
    return [];
  }

  const attemptsQuery =
    query(
      collection(
        db,
        ATTEMPTS_COLLECTION
      ),

      where(
        "quizId",
        "==",
        cleanQuizId
      )
    );

  const snapshot =
    await getDocs(
      attemptsQuery
    );

  const attempts =
    snapshot.docs.map(
      (
        attemptDocument
      ) =>
        mapAttempt(
          attemptDocument.id,
          attemptDocument.data()
        )
    );

  /*
   * Latest participant first.
   */
  return attempts.sort(
    (
      first,
      second
    ) =>
      safeDateMs(
        second.createdAt ||
          second.startedAt
      ) -
      safeDateMs(
        first.createdAt ||
          first.startedAt
      )
  );
}

/* =========================================================
   Quiz attempt statistics
   ========================================================= */

export async function getQuizAttemptStats(
  quizId: string
): Promise<
  QuizAttemptStats
> {
  const attempts =
    await getQuizAttempts(
      quizId
    );

  let inProgress =
    0;

  let submitted =
    0;

  let graded =
    0;

  for (
    const attempt of
    attempts
  ) {
    if (
      attempt.status ===
      "in_progress"
    ) {
      inProgress +=
        1;

      continue;
    }

    if (
      attempt.status ===
      "submitted"
    ) {
      submitted +=
        1;

      continue;
    }

    graded +=
      1;
  }

  return {
    total:
      attempts.length,

    inProgress,

    submitted,

    graded,

    finished:
      submitted +
      graded,

    waitingForCorrection:
      submitted,
  };
}

/* =========================================================
   Find attempt by email + quiz
   ========================================================= */

export async function getAttemptByStudentEmail(
  quizId: string,

  studentEmail: string
): Promise<
  Attempt | null
> {
  const normalizedEmail =
    normalizeEmail(
      studentEmail
    );

  const attemptsQuery =
    query(
      collection(
        db,
        ATTEMPTS_COLLECTION
      ),

      where(
        "quizId",
        "==",
        quizId
      ),

      where(
        "studentEmail",
        "==",
        normalizedEmail
      ),

      limit(
        1
      )
    );

  const snapshot =
    await getDocs(
      attemptsQuery
    );

  if (
    snapshot.empty
  ) {
    return null;
  }

  const first =
    snapshot.docs[
      0
    ];

  return mapAttempt(
    first.id,
    first.data()
  );
}

/* =========================================================
   Quiz availability
   ========================================================= */

function validateQuizAvailabilityForStudent(
  quiz: Quiz
) {
  const now =
    Date.now();

  if (
    quiz.status !==
    "launched"
  ) {
    return {
      success:
        false,

      messageKey:
        "attempts.availability.unavailable",

      message:
        "This quiz is not currently available.",
    };
  }

  const start =
    quiz.availableFrom
      ? new Date(
          quiz.availableFrom
        ).getTime()
      : null;

  const end =
    quiz.availableUntil
      ? new Date(
          quiz.availableUntil
        ).getTime()
      : null;

  if (
    start !==
      null &&
    Number.isNaN(
      start
    )
  ) {
    return {
      success:
        false,

      messageKey:
        "attempts.availability.invalidStart",

      message:
        "The quiz start time is invalid.",
    };
  }

  if (
    end !==
      null &&
    Number.isNaN(
      end
    )
  ) {
    return {
      success:
        false,

      messageKey:
        "attempts.availability.invalidEnd",

      message:
        "The quiz deadline is invalid.",
    };
  }

  if (
    end ===
    null
  ) {
    return {
      success:
        false,

      messageKey:
        "attempts.availability.missingDeadline",

      message:
        "The quiz does not have a valid deadline.",
    };
  }

  /* =====================================================
     Scheduled session
     ===================================================== */

  if (
    quiz.availabilityMode ===
    "scheduled_session"
  ) {
    if (
      start ===
      null
    ) {
      return {
        success:
          false,

        messageKey:
          "attempts.availability.missingScheduledStart",

        message:
          "The scheduled session does not have a valid start time.",
      };
    }

    if (
      now <
      start
    ) {
      return {
        success:
          false,

        messageKey:
          "attempts.availability.notStarted",

        message:
          "The scheduled session has not started yet.",
      };
    }

    if (
      now >=
      end
    ) {
      return {
        success:
          false,

        messageKey:
          "attempts.availability.ended",

        message:
          "The scheduled session has ended.",
      };
    }

    return {
      success:
        true,

      messageKey:
        "attempts.availability.available",

      message:
        "The scheduled session is available.",
    };
  }

  /* =====================================================
     Open window
     ===================================================== */

  if (
    start !==
      null &&
    now <
      start
  ) {
    return {
      success:
        false,

      messageKey:
        "attempts.availability.notStarted",

      message:
        "This quiz is not open yet.",
    };
  }

  if (
    now >=
    end
  ) {
    return {
      success:
        false,

      messageKey:
        "attempts.availability.ended",

      message:
        "This quiz is closed.",
    };
  }

  return {
    success:
      true,

    messageKey:
      "attempts.availability.available",

    message:
      "The quiz is available.",
  };
}

/* =========================================================
   Calculate attempt expiration
   ========================================================= */

function calculateAttemptExpiration(
  quiz: Quiz
) {
  const now =
    Date.now();

  const deadline =
    quiz.availableUntil
      ? new Date(
          quiz.availableUntil
        ).getTime()
      : null;

  if (
    deadline ===
      null ||
    Number.isNaN(
      deadline
    )
  ) {
    return null;
  }

  /* =====================================================
     Scheduled session
     ===================================================== */

  if (
    quiz.availabilityMode ===
    "scheduled_session"
  ) {
    return new Date(
      deadline
    ).toISOString();
  }

  /* =====================================================
     Open window
     ===================================================== */

  const personalExpiration =
    now +
    quiz.timeLimitMinutes *
      60 *
      1000;

  const finalExpiration =
    Math.min(
      personalExpiration,
      deadline
    );

  return new Date(
    finalExpiration
  ).toISOString();
}

/* =========================================================
   Build question order
   ========================================================= */

function buildQuestionOrder(
  questions: Question[],

  shuffleQuestions:
    boolean
) {
  const questionIds =
    questions.map(
      (
        question
      ) =>
        question.id
    );

  return shuffleQuestions
    ? shuffleArray(
        questionIds
      )
    : questionIds;
}

/* =========================================================
   Build choice order
   ========================================================= */

function buildChoiceOrders(
  questions: Question[],

  shuffleChoices:
    boolean
) {
  const orders:
    Record<
      string,
      number[]
    > = {};

  for (
    const question of
    questions
  ) {
    if (
      question.type ===
      "development"
    ) {
      continue;
    }

    const indexes =
      question.choices.map(
        (
          _,
          index
        ) =>
          index
      );

    orders[
      question.id
    ] =
      shuffleChoices
        ? shuffleArray(
            indexes
          )
        : indexes;
  }

  return orders;
}

/* =========================================================
   Validate quiz questions
   ========================================================= */

function validateQuizQuestionsForStudent(
  quiz: Quiz,

  questions:
    Question[]
) {
  if (
    questions.length !==
    quiz.targetQuestions
  ) {
    return {
      messageKey:
        "attempts.structure.questionsIncomplete",

      message:
        "The quiz structure is incomplete.",
    };
  }

  const totalPoints =
    questions.reduce(
      (
        total,
        question
      ) =>
        total +
        question.points,

      0
    );

  if (
    totalPoints !==
    quiz.totalPoints
  ) {
    return {
      messageKey:
        "attempts.structure.pointsIncomplete",

      message:
        "The quiz point structure is incomplete.",
    };
  }

  for (
    const question of
    questions
  ) {
    if (
      !question.text.trim()
    ) {
      return {
        messageKey:
          "attempts.structure.invalidQuestion",

        message:
          "The quiz contains an invalid question.",
      };
    }

    if (
      !Number.isInteger(
        question.points
      ) ||
      question.points <
        1
    ) {
      return {
        messageKey:
          "attempts.structure.invalidPoints",

        message:
          "The quiz contains invalid question points.",
      };
    }

    if (
      question.type ===
      "development"
    ) {
      continue;
    }

    if (
      question.choices.length <
      2
    ) {
      return {
        messageKey:
          "attempts.structure.notEnoughChoices",

        message:
          "The quiz contains a choice question with fewer than 2 answers.",
      };
    }

    if (
      question.choices.some(
        (
          choice
        ) =>
          !choice.trim()
      )
    ) {
      return {
        messageKey:
          "attempts.structure.emptyChoice",

        message:
          "The quiz contains an empty choice answer.",
      };
    }

    if (
      question.type ===
      "qcm"
    ) {
      if (
        !Number.isInteger(
          question.correctChoiceIndex
        ) ||
        question.correctChoiceIndex <
          0 ||
        question.correctChoiceIndex >=
          question.choices.length
      ) {
        return {
          messageKey:
            "attempts.structure.invalidQcmAnswer",

          message:
            "The quiz contains an invalid QCM correct answer.",
        };
      }

      continue;
    }

    const correctIndexes =
      question.correctChoiceIndexes;

    if (
      !Array.isArray(
        correctIndexes
      ) ||
      correctIndexes.length <
        2
    ) {
      return {
        messageKey:
          "attempts.structure.invalidMultipleChoice",

        message:
          "The quiz contains an invalid multiple-choice question.",
      };
    }

    const uniqueCorrectIndexes = [
      ...new Set(
        correctIndexes
      ),
    ];

    if (
      uniqueCorrectIndexes.length !==
      correctIndexes.length
    ) {
      return {
        messageKey:
          "attempts.structure.duplicateCorrectAnswers",

        message:
          "The quiz contains duplicated multiple-choice correct answers.",
      };
    }

    if (
      correctIndexes.some(
        (
          index
        ) =>
          !Number.isInteger(
            index
          ) ||
          index <
            0 ||
          index >=
            question.choices.length
      )
    ) {
      return {
        messageKey:
          "attempts.structure.invalidMultipleChoiceAnswer",

        message:
          "The quiz contains an invalid multiple-choice correct answer.",
      };
    }
  }

  return null;
}

/* =========================================================
   Start / resume attempt
   ========================================================= */

export async function startAttempt(
  input:
    StartAttemptInput
): Promise<
  StartAttemptResult
> {
  const cleanName =
    input.studentName
      .trim();

  const cleanEmail =
    normalizeEmail(
      input.studentEmail
    );

  /* =====================================================
     Identity validation
     ===================================================== */

  if (
    !cleanName ||
    cleanName.length <
      2
  ) {
    return {
      success:
        false,

      attempt:
        null,

      resumed:
        false,

      messageKey:
        "attempts.start.invalidName",

      message:
        "Please enter a valid full name.",
    };
  }

  if (
    cleanName.length >
    MAX_STUDENT_NAME_LENGTH
  ) {
    return {
      success:
        false,

      attempt:
        null,

      resumed:
        false,

      messageKey:
        "attempts.start.nameTooLong",

      message:
        "Student name is too long.",
    };
  }

  if (
    !cleanEmail
  ) {
    return {
      success:
        false,

      attempt:
        null,

      resumed:
        false,

      messageKey:
        "attempts.start.emailRequired",

      message:
        "Please enter your email address.",
    };
  }

  if (
    !isValidEmail(
      cleanEmail
    )
  ) {
    return {
      success:
        false,

      attempt:
        null,

      resumed:
        false,

      messageKey:
        "attempts.start.invalidEmail",

      message:
        "Please enter a valid email address.",
    };
  }

  if (
    cleanEmail.length >
    MAX_STUDENT_EMAIL_LENGTH
  ) {
    return {
      success:
        false,

      attempt:
        null,

      resumed:
        false,

      messageKey:
        "attempts.start.emailTooLong",

      message:
        "Email address is too long.",
    };
  }

  /* =====================================================
     Quiz
     ===================================================== */

  const quiz =
    await getQuiz(
      input.quizId
    );

  if (
    !quiz
  ) {
    return {
      success:
        false,

      attempt:
        null,

      resumed:
        false,

      messageKey:
        "attempts.start.quizNotFound",

      message:
        "Quiz not found.",
    };
  }

  /* =====================================================
     Existing attempt
     ===================================================== */

  const existingAttempt =
    await getAttemptByStudentEmail(
      quiz.id,
      cleanEmail
    );

  if (
    existingAttempt
  ) {
    if (
      existingAttempt.status ===
      "submitted"
    ) {
      return {
        success:
          false,

        attempt:
          existingAttempt,

        resumed:
          false,

        messageKey:
          "attempts.start.alreadySubmitted",

        message:
          "You have already submitted this quiz.",
      };
    }

    if (
      existingAttempt.status ===
      "graded"
    ) {
      return {
        success:
          false,

        attempt:
          existingAttempt,

        resumed:
          false,

        messageKey:
          "attempts.start.alreadyGraded",

        message:
          "This quiz attempt has already been graded.",
      };
    }

    const attemptExpiration =
      new Date(
        existingAttempt.expiresAt
      ).getTime();

    if (
      Number.isNaN(
        attemptExpiration
      ) ||
      attemptExpiration <=
        Date.now()
    ) {
      return {
        success:
          false,

        attempt:
          existingAttempt,

        resumed:
          false,

        messageKey:
          "attempts.start.expired",

        message:
          "Your quiz attempt has expired.",
      };
    }

    return {
      success:
        true,

      attempt:
        existingAttempt,

      resumed:
        true,

      messageKey:
        "attempts.start.resumed",

      message:
        "Your existing quiz attempt was found.",
    };
  }

  /* =====================================================
     Availability
     ===================================================== */

  const availability =
    validateQuizAvailabilityForStudent(
      quiz
    );

  if (
    !availability.success
  ) {
    return {
      success:
        false,

      attempt:
        null,

      resumed:
        false,

      messageKey:
        availability.messageKey,

      message:
        availability.message,
    };
  }

  /* =====================================================
     Questions
     ===================================================== */

  const questions =
    await getQuizQuestions(
      quiz.id
    );

  const questionError =
    validateQuizQuestionsForStudent(
      quiz,
      questions
    );

  if (
    questionError
  ) {
    return {
      success:
        false,

      attempt:
        null,

      resumed:
        false,

      messageKey:
        questionError.messageKey,

      message:
        questionError.message,
    };
  }

  /* =====================================================
     Expiration
     ===================================================== */

  const expiresAt =
    calculateAttemptExpiration(
      quiz
    );

  if (
    !expiresAt
  ) {
    return {
      success:
        false,

      attempt:
        null,

      resumed:
        false,

      messageKey:
        "attempts.start.expirationError",

      message:
        "Unable to calculate the quiz expiration time.",
    };
  }

  const expirationMs =
    new Date(
      expiresAt
    ).getTime();

  if (
    Number.isNaN(
      expirationMs
    ) ||
    expirationMs <=
      Date.now()
  ) {
    return {
      success:
        false,

      attempt:
        null,

      resumed:
        false,

      messageKey:
        "attempts.start.notEnoughTime",

      message:
        "There is not enough time remaining to start this quiz.",
    };
  }

  /* =====================================================
     Ordering
     ===================================================== */

  const questionOrder =
    buildQuestionOrder(
      questions,
      quiz.shuffleQuestions
    );

  const choiceOrders =
    buildChoiceOrders(
      questions,
      quiz.shuffleChoices
    );

  /* =====================================================
     Create attempt
     ===================================================== */

  const now =
    new Date()
      .toISOString();

  const attemptData:
    Omit<
      Attempt,
      "id"
    > = {
    quizId:
      quiz.id,

    teacherId:
      quiz.teacherId,

    studentName:
      cleanName,

    studentEmail:
      cleanEmail,

    status:
      "in_progress",

    startedAt:
      now,

    expiresAt,

    submittedAt:
      null,

    gradedAt:
      null,

    /*
     * Freeze options at attempt creation.
     */
    allowBackNavigation:
      quiz.allowBackNavigation,

    showResultsToStudents:
      quiz.showResultsToStudents,

    showCorrectAnswers:
      quiz.showCorrectAnswers,

    shuffleQuestions:
      quiz.shuffleQuestions,

    shuffleChoices:
      quiz.shuffleChoices,

    questionOrder,

    choiceOrders,

    answers:
      {},

    automaticScore:
      0,

    manualScore:
      0,

    finalScore:
      null,

    developmentScores:
      {},

    createdAt:
      now,

    updatedAt:
      now,
  };

  const attemptDocument =
    await addDoc(
      collection(
        db,
        ATTEMPTS_COLLECTION
      ),

      attemptData
    );

  const attempt:
    Attempt = {
    id:
      attemptDocument.id,

    ...attemptData,
  };

  return {
    success:
      true,

    attempt,

    resumed:
      false,

    messageKey:
      "attempts.start.created",

    message:
      "Quiz attempt created successfully.",
  };
}

/* =========================================================
   Save answer
   ========================================================= */

export async function saveAttemptAnswer(
  attemptId: string,

  questionId: string,

  answer:
    SaveAttemptAnswerInput
): Promise<
  AttemptActionResult
> {
  const attempt =
    await getAttempt(
      attemptId
    );

  if (
    !attempt
  ) {
    return {
      success:
        false,

      messageKey:
        "attempts.save.notFound",

      message:
        "Attempt not found.",
    };
  }

  if (
    attempt.status !==
    "in_progress"
  ) {
    return {
      success:
        false,

      messageKey:
        "attempts.save.notEditable",

      message:
        "This attempt is no longer editable.",
    };
  }

  const expiration =
    new Date(
      attempt.expiresAt
    ).getTime();

  if (
    Number.isNaN(
      expiration
    ) ||
    expiration <=
      Date.now()
  ) {
    return {
      success:
        false,

      messageKey:
        "attempts.save.expired",

      message:
        "This attempt has expired.",
    };
  }

  if (
    !attempt.questionOrder.includes(
      questionId
    )
  ) {
    return {
      success:
        false,

      messageKey:
        "attempts.save.invalidQuestion",

      message:
        "Question does not belong to this attempt.",
    };
  }

  const questions =
    await getQuizQuestions(
      attempt.quizId
    );

  const question =
    questions.find(
      (
        item
      ) =>
        item.id ===
        questionId
    );

  if (
    !question
  ) {
    return {
      success:
        false,

      messageKey:
        "attempts.save.questionNotFound",

      message:
        "Question not found.",
    };
  }

  const now =
    new Date()
      .toISOString();

  let nextAnswer:
    AttemptAnswer;

  /* =====================================================
     QCM
     ===================================================== */

  if (
    question.type ===
    "qcm"
  ) {
    const selected =
      answer.selectedChoiceIndex;

    if (
      selected ===
      undefined ||
      !Number.isInteger(
        selected
      ) ||
      selected <
        0 ||
      selected >=
        question.choices.length
    ) {
      return {
        success:
          false,

        messageKey:
          "attempts.save.invalidChoice",

        message:
          "Invalid selected answer.",
      };
    }

    nextAnswer = {
      selectedChoiceIndex:
        selected,

      updatedAt:
        now,
    };
  }

  /* =====================================================
     Multiple choice
     ===================================================== */

  else if (
    question.type ===
    "multiple_choice"
  ) {
    if (
      !Array.isArray(
        answer.selectedChoiceIndexes
      )
    ) {
      return {
        success:
          false,

        messageKey:
          "attempts.save.invalidMultipleChoice",

        message:
          "No multiple-choice answer was provided.",
      };
    }

    const selectedIndexes = [
      ...new Set(
        answer.selectedChoiceIndexes
      ),
    ];

    if (
      selectedIndexes.some(
        (
          index
        ) =>
          !Number.isInteger(
            index
          ) ||
          index <
            0 ||
          index >=
            question.choices.length
      )
    ) {
      return {
        success:
          false,

        messageKey:
          "attempts.save.invalidMultipleChoice",

        message:
          "One or more selected answers are invalid.",
      };
    }

    nextAnswer = {
      selectedChoiceIndexes:
        selectedIndexes,

      updatedAt:
        now,
    };
  }

  /* =====================================================
     Development
     ===================================================== */

  else {
    if (
      typeof answer.developmentAnswer !==
      "string"
    ) {
      return {
        success:
          false,

        messageKey:
          "attempts.save.invalidDevelopment",

        message:
          "Invalid development answer.",
      };
    }

    nextAnswer = {
      developmentAnswer:
        answer
          .developmentAnswer
          .slice(
            0,
            MAX_DEVELOPMENT_ANSWER_LENGTH
          ),

      updatedAt:
        now,
    };
  }

  const nextAnswers = {
    ...attempt.answers,

    [questionId]:
      nextAnswer,
  };

  await updateDoc(
    attemptRef(
      attemptId
    ),

    {
      answers:
        nextAnswers,

      updatedAt:
        now,
    }
  );

  return {
    success:
      true,

    messageKey:
      "attempts.save.success",

    message:
      "Answer saved successfully.",
  };
}

/* =========================================================
   QCM grading
   ========================================================= */

function calculateQcmScore(
  question:
    Extract<
      Question,
      {
        type:
          "qcm";
      }
    >,

  answer:
    AttemptAnswer | undefined
) {
  if (
    !answer ||
    typeof answer.selectedChoiceIndex !==
      "number"
  ) {
    return 0;
  }

  return answer.selectedChoiceIndex ===
    question.correctChoiceIndex
    ? question.points
    : 0;
}

/* =========================================================
   Multiple-choice grading
   ========================================================= */

function calculateMultipleChoiceScore(
  question:
    Extract<
      Question,
      {
        type:
          "multiple_choice";
      }
    >,

  answer:
    AttemptAnswer | undefined
) {
  if (
    !answer ||
    !Array.isArray(
      answer.selectedChoiceIndexes
    )
  ) {
    return 0;
  }

  const correctIndexes = [
    ...new Set(
      question.correctChoiceIndexes
    ),
  ];

  if (
    correctIndexes.length ===
    0
  ) {
    return 0;
  }

  const selectedIndexes = [
    ...new Set(
      answer.selectedChoiceIndexes
    ),
  ];

  if (
    selectedIndexes.length ===
    0
  ) {
    return 0;
  }

  const correctSet =
    new Set(
      correctIndexes
    );

  let correctlySelected =
    0;

  let wronglySelected =
    0;

  for (
    const selectedIndex of
    selectedIndexes
  ) {
    if (
      correctSet.has(
        selectedIndex
      )
    ) {
      correctlySelected +=
        1;
    } else {
      wronglySelected +=
        1;
    }
  }

  const pointsPerCorrectAnswer =
    question.points /
    correctIndexes.length;

  const earnedPoints =
    correctlySelected *
    pointsPerCorrectAnswer;

  const penalty =
    wronglySelected *
    pointsPerCorrectAnswer;

  const rawScore =
    earnedPoints -
    penalty;

  const finalQuestionScore =
    Math.max(
      0,
      Math.min(
        question.points,
        rawScore
      )
    );

  return roundScore(
    finalQuestionScore
  );
}

/* =========================================================
   Automatic grading
   ========================================================= */

function calculateAutomaticScore(
  attempt: Attempt,

  questions:
    Question[]
): AutomaticGradingResult {
  let automaticScore =
    0;

  let qcmQuestions =
    0;

  let multipleChoiceQuestions =
    0;

  let developmentQuestions =
    0;

  const questionMap =
    new Map(
      questions.map(
        (
          question
        ) => [
          question.id,
          question,
        ]
      )
    );

  for (
    const questionId of
    attempt.questionOrder
  ) {
    const question =
      questionMap.get(
        questionId
      );

    if (
      !question
    ) {
      continue;
    }

    const answer =
      attempt.answers[
        question.id
      ];

    if (
      question.type ===
      "development"
    ) {
      developmentQuestions +=
        1;

      continue;
    }

    if (
      question.type ===
      "qcm"
    ) {
      qcmQuestions +=
        1;

      automaticScore +=
        calculateQcmScore(
          question,
          answer
        );

      continue;
    }

    multipleChoiceQuestions +=
      1;

    automaticScore +=
      calculateMultipleChoiceScore(
        question,
        answer
      );
  }

  return {
    automaticScore:
      roundScore(
        automaticScore
      ),

    qcmQuestions,

    multipleChoiceQuestions,

    developmentQuestions,
  };
}

/* =========================================================
   Validate attempt
   ========================================================= */

function validateAttemptForSubmission(
  attempt: Attempt,

  quiz: Quiz,

  questions:
    Question[]
) {
  if (
    attempt.quizId !==
    quiz.id ||
    attempt.teacherId !==
    quiz.teacherId
  ) {
    return {
      messageKey:
        "attempts.submit.invalidAttempt",

      message:
        "This attempt is not linked correctly to the quiz.",
    };
  }

  if (
    attempt.questionOrder.length !==
    questions.length
  ) {
    return {
      messageKey:
        "attempts.submit.invalidStructure",

      message:
        "The attempt question structure is invalid.",
    };
  }

  const questionIds =
    new Set(
      questions.map(
        (
          question
        ) =>
          question.id
      )
    );

  const uniqueQuestionIds =
    new Set(
      attempt.questionOrder
    );

  if (
    uniqueQuestionIds.size !==
    attempt.questionOrder.length
  ) {
    return {
      messageKey:
        "attempts.submit.duplicateQuestions",

      message:
        "The attempt contains duplicate questions.",
    };
  }

  for (
    const questionId of
    attempt.questionOrder
  ) {
    if (
      !questionIds.has(
        questionId
      )
    ) {
      return {
        messageKey:
          "attempts.submit.invalidQuestion",

        message:
          "The attempt contains an invalid question.",
      };
    }
  }

  return null;
}

/* =========================================================
   Merge final development answers
   ========================================================= */

function mergeFinalDevelopmentAnswers(
  attempt: Attempt,

  questions:
    Question[],

  developmentAnswers:
    Record<
      string,
      string
    >
) {
  const questionMap =
    new Map(
      questions.map(
        (
          question
        ) => [
          question.id,
          question,
        ]
      )
    );

  const now =
    new Date()
      .toISOString();

  const nextAnswers:
    Record<
      string,
      AttemptAnswer
    > = {
    ...attempt.answers,
  };

  for (
    const [
      questionId,
      value,
    ] of Object.entries(
      developmentAnswers
    )
  ) {
    if (
      !attempt.questionOrder.includes(
        questionId
      )
    ) {
      continue;
    }

    const question =
      questionMap.get(
        questionId
      );

    if (
      !question ||
      question.type !==
        "development" ||
      typeof value !==
        "string"
    ) {
      continue;
    }

    nextAnswers[
      questionId
    ] = {
      developmentAnswer:
        value.slice(
          0,
          MAX_DEVELOPMENT_ANSWER_LENGTH
        ),

      updatedAt:
        now,
    };
  }

  return nextAnswers;
}

/* =========================================================
   Submit attempt
   ========================================================= */

export async function submitAttempt(
  attemptId: string,

  finalDevelopmentAnswers:
    Record<
      string,
      string
    > = {}
): Promise<
  SubmitAttemptResult
> {
  const attempt =
    await getAttempt(
      attemptId
    );

  if (
    !attempt
  ) {
    return {
      success:
        false,

      status:
        null,

      automaticScore:
        null,

      finalScore:
        null,

      requiresManualGrading:
        false,

      messageKey:
        "attempts.submit.notFound",

      message:
        "Attempt not found.",
    };
  }

  if (
    attempt.status ===
    "graded"
  ) {
    return {
      success:
        true,

      status:
        "graded",

      automaticScore:
        attempt.automaticScore,

      finalScore:
        attempt.finalScore,

      requiresManualGrading:
        false,

      messageKey:
        "attempts.submit.alreadyGraded",

      message:
        "Attempt has already been graded.",
    };
  }

  if (
    attempt.status ===
    "submitted"
  ) {
    return {
      success:
        true,

      status:
        "submitted",

      automaticScore:
        attempt.automaticScore,

      finalScore:
        attempt.finalScore,

      requiresManualGrading:
        true,

      messageKey:
        "attempts.submit.alreadySubmitted",

      message:
        "Attempt has already been submitted.",
    };
  }

  const quiz =
    await getQuiz(
      attempt.quizId
    );

  if (
    !quiz
  ) {
    return {
      success:
        false,

      status:
        null,

      automaticScore:
        null,

      finalScore:
        null,

      requiresManualGrading:
        false,

      messageKey:
        "attempts.submit.quizNotFound",

      message:
        "Quiz not found.",
    };
  }

  const questions =
    await getQuizQuestions(
      quiz.id
    );

  if (
    questions.length ===
    0
  ) {
    return {
      success:
        false,

      status:
        null,

      automaticScore:
        null,

      finalScore:
        null,

      requiresManualGrading:
        false,

      messageKey:
        "attempts.submit.questionsUnavailable",

      message:
        "Quiz questions could not be loaded.",
    };
  }

  const attemptError =
    validateAttemptForSubmission(
      attempt,
      quiz,
      questions
    );

  if (
    attemptError
  ) {
    return {
      success:
        false,

      status:
        null,

      automaticScore:
        null,

      finalScore:
        null,

      requiresManualGrading:
        false,

      messageKey:
        attemptError.messageKey,

      message:
        attemptError.message,
    };
  }

  const finalAnswers =
    mergeFinalDevelopmentAnswers(
      attempt,
      questions,
      finalDevelopmentAnswers
    );

  const finalAttempt:
    Attempt = {
    ...attempt,

    answers:
      finalAnswers,
  };

  const grading =
    calculateAutomaticScore(
      finalAttempt,
      questions
    );

  const automaticScore =
    grading.automaticScore;

  const requiresManualGrading =
    grading.developmentQuestions >
    0;

  const now =
    new Date()
      .toISOString();

  /* =====================================================
     Automatic quiz
     ===================================================== */

  if (
    !requiresManualGrading
  ) {
    const finalScore =
      roundScore(
        automaticScore
      );

    await updateDoc(
      attemptRef(
        attempt.id
      ),

      {
        answers:
          finalAnswers,

        status:
          "graded",

        automaticScore,

        manualScore:
          0,

        finalScore,

        developmentScores:
          {},

        submittedAt:
          now,

        gradedAt:
          now,

        updatedAt:
          now,
      }
    );

    return {
      success:
        true,

      status:
        "graded",

      automaticScore,

      finalScore,

      requiresManualGrading:
        false,

      messageKey:
        "attempts.submit.graded",

      message:
        "Quiz submitted and graded successfully.",
    };
  }

  /* =====================================================
     Manual correction required
     ===================================================== */

  await updateDoc(
    attemptRef(
      attempt.id
    ),

    {
      answers:
        finalAnswers,

      status:
        "submitted",

      automaticScore,

      manualScore:
        0,

      finalScore:
        null,

      developmentScores:
        {},

      submittedAt:
        now,

      gradedAt:
        null,

      updatedAt:
        now,
    }
  );

  return {
    success:
      true,

    status:
      "submitted",

    automaticScore,

    finalScore:
      null,

    requiresManualGrading:
      true,

    messageKey:
      "attempts.submit.waitingForCorrection",

    message:
      "Quiz submitted successfully. Development questions are waiting for teacher grading.",
  };
}

/* =========================================================
   Teacher manual grading
   ========================================================= */

/*
 * Grades every development question and
 * finalizes the attempt.
 *
 * Important:
 * ----------
 * The caller must also verify that the
 * authenticated teacher owns this quiz.
 *
 * The protected correction page will do this
 * using useTeacher() + quiz.teacherId.
 */
export async function gradeAttempt(
  attemptId: string,

  input:
    GradeAttemptInput
): Promise<
  GradeAttemptResult
> {
  const attempt =
    await getAttempt(
      attemptId
    );

  if (
    !attempt
  ) {
    return {
      success:
        false,

      attempt:
        null,

      automaticScore:
        null,

      manualScore:
        null,

      finalScore:
        null,

      messageKey:
        "attempts.grading.notFound",

      message:
        "Attempt not found.",
    };
  }

  if (
    attempt.status ===
    "in_progress"
  ) {
    return {
      success:
        false,

      attempt,

      automaticScore:
        attempt.automaticScore,

      manualScore:
        attempt.manualScore,

      finalScore:
        attempt.finalScore,

      messageKey:
        "attempts.grading.notSubmitted",

      message:
        "The student has not submitted this attempt yet.",
    };
  }

  const quiz =
    await getQuiz(
      attempt.quizId
    );

  if (
    !quiz
  ) {
    return {
      success:
        false,

      attempt,

      automaticScore:
        attempt.automaticScore,

      manualScore:
        attempt.manualScore,

      finalScore:
        attempt.finalScore,

      messageKey:
        "attempts.grading.quizNotFound",

      message:
        "Quiz not found.",
    };
  }

  const cleanTeacherId =
    input.teacherId
      .trim();

  if (
    !cleanTeacherId ||
    quiz.teacherId !==
      cleanTeacherId ||
    attempt.teacherId !==
      cleanTeacherId
  ) {
    return {
      success:
        false,

      attempt,

      automaticScore:
        attempt.automaticScore,

      manualScore:
        attempt.manualScore,

      finalScore:
        attempt.finalScore,

      messageKey:
        "attempts.grading.unauthorized",

      message:
        "You are not authorized to grade this attempt.",
    };
  }

  const questions =
    await getQuizQuestions(
      quiz.id
    );

  const automaticGrading =
    calculateAutomaticScore(
      attempt,
      questions
    );

  const automaticScore =
    automaticGrading.automaticScore;

  const developmentQuestions =
    questions.filter(
      (
        question
      ) =>
        question.type ===
        "development"
    );

  if (
    developmentQuestions.length ===
    0
  ) {
    return {
      success:
        false,

      attempt,

      automaticScore:
        attempt.automaticScore,

      manualScore:
        attempt.manualScore,

      finalScore:
        attempt.finalScore,

      messageKey:
        "attempts.grading.noDevelopment",

      message:
        "This quiz has no development questions to grade.",
    };
  }

  const safeScores:
    DevelopmentScores = {};

  let manualScore =
    0;

  for (
    const question of
    developmentQuestions
  ) {
    const score =
      input.developmentScores[
        question.id
      ];

    if (
      typeof score !==
        "number" ||
      !Number.isFinite(
        score
      )
    ) {
      return {
        success:
          false,

        attempt,

        automaticScore:
          attempt.automaticScore,

        manualScore:
          attempt.manualScore,

        finalScore:
          attempt.finalScore,

        messageKey:
          "attempts.grading.missingScore",

        message:
          "Every development question must receive a score.",
      };
    }

    if (
      score <
        0 ||
      score >
        question.points
    ) {
      return {
        success:
          false,

        attempt,

        automaticScore:
          attempt.automaticScore,

        manualScore:
          attempt.manualScore,

        finalScore:
          attempt.finalScore,

        messageKey:
          "attempts.grading.invalidScore",

        message:
          "One or more development scores are invalid.",
      };
    }

    const roundedScore =
      roundScore(
        score
      );

    safeScores[
      question.id
    ] =
      roundedScore;

    manualScore +=
      roundedScore;
  }

  manualScore =
    roundScore(
      manualScore
    );

  const finalScore =
    roundScore(
      automaticScore +
      manualScore
    );

  /*
   * Defensive validation.
   */
  if (
    finalScore <
      0 ||
    finalScore >
      quiz.totalPoints
  ) {
    return {
      success:
        false,

      attempt,

      automaticScore:
        attempt.automaticScore,

      manualScore:
        attempt.manualScore,

      finalScore:
        attempt.finalScore,

      messageKey:
        "attempts.grading.invalidFinalScore",

      message:
        "The calculated final score is invalid.",
    };
  }

  const now =
    new Date()
      .toISOString();

  await updateDoc(
    attemptRef(
      attempt.id
    ),

    {
      status:
        "graded",

      automaticScore,

      developmentScores:
        safeScores,

      manualScore,

      finalScore,

      gradedAt:
        now,

      updatedAt:
        now,
    }
  );

  const updatedAttempt =
    await getAttempt(
      attempt.id
    );

  return {
    success:
      true,

    attempt:
      updatedAttempt,

    automaticScore,

    manualScore,

    finalScore,

    messageKey:
      "attempts.grading.success",

    message:
      "Attempt graded successfully.",
  };
}