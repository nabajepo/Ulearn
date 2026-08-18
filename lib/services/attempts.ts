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
   * one original choice index.
   */
  selectedChoiceIndex?:
    number;

  /*
   * MULTIPLE CHOICE:
   * several original choice indexes.
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
     Frozen quiz options
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
   * For QCM and MULTIPLE CHOICE:
   *
   * questionId -> ORIGINAL choice indexes
   * in the order displayed to the student.
   *
   * Example:
   *
   * Original:
   * [A, B, C, D]
   *
   * Displayed:
   * [C, A, D, B]
   *
   * Stored:
   * [2, 0, 3, 1]
   *
   * Automatic grading always uses
   * original indexes.
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

  /* =====================================================
     Dates
     ===================================================== */

  createdAt:
    string;

  updatedAt:
    string;
};

/* =========================================================
   Start attempt input
   ========================================================= */

export type StartAttemptInput = {
  quizId:
    string;

  studentName:
    string;

  studentEmail:
    string;
};

/* =========================================================
   Start attempt result
   ========================================================= */

export type StartAttemptResult = {
  success:
    boolean;

  attempt:
    Attempt | null;

  resumed:
    boolean;

  message:
    string;
};

/* =========================================================
   Submit attempt result
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

  message:
    string;
};

/* =========================================================
   Save answer input
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
   Automatic grading result
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
   Email helper
   ========================================================= */

function normalizeEmail(
  value: string
) {
  return value
    .trim()
    .toLowerCase();
}

/* =========================================================
   Email validation
   ========================================================= */

function isValidEmail(
  email: string
) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email
  );
}

/* =========================================================
   Score rounding
   ========================================================= */

/*
 * Multiple-choice questions can produce
 * fractional scores.
 *
 * Example:
 *
 * 1 point / 3 correct answers
 * = 0.333333...
 *
 * We keep up to 4 decimal places.
 */
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

/* =========================================================
   Shuffle helper
   ========================================================= */

function shuffleArray<T>(
  values: T[]
) {
  const result =
    [
      ...values,
    ];

  for (
    let index =
      result.length -
      1;

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
   Number array helper
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
   Map choice orders
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
   Map attempt answers
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
   Get attempt
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
   Find attempt by student email + quiz
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
   Quiz availability helper
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

        message:
          "The scheduled session has ended.",
      };
    }

    return {
      success:
        true,

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

      message:
        "This quiz is closed.",
    };
  }

  return {
    success:
      true,

    message:
      "The quiz is available.",
  };
}

/* =========================================================
   Calculate expiresAt
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

  /*
   * In scheduled-session mode every student
   * shares the same ending time.
   */
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

  /*
   * In open-window mode the student receives
   * timeLimitMinutes starting from now,
   * without exceeding availableUntil.
   */
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
   Build choice orders
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
   Validate questions before attempt
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
    return (
      "The quiz structure is incomplete."
    );
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
    return (
      "The quiz point structure is incomplete."
    );
  }

  for (
    const question of
    questions
  ) {
    if (
      !question.text.trim()
    ) {
      return (
        "The quiz contains an invalid question."
      );
    }

    if (
      !Number.isInteger(
        question.points
      ) ||
      question.points <
        1
    ) {
      return (
        "The quiz contains invalid question points."
      );
    }

    /* =====================================================
       Development
       ===================================================== */

    if (
      question.type ===
      "development"
    ) {
      continue;
    }

    /* =====================================================
       Choice questions
       ===================================================== */

    if (
      question.choices.length <
      2
    ) {
      return (
        "The quiz contains a choice question with fewer than 2 answers."
      );
    }

    if (
      question.choices.some(
        (
          choice
        ) =>
          !choice.trim()
      )
    ) {
      return (
        "The quiz contains an empty choice answer."
      );
    }

    /* =====================================================
       QCM
       ===================================================== */

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
        return (
          "The quiz contains an invalid QCM correct answer."
        );
      }

      continue;
    }

    /* =====================================================
       Multiple choice
       ===================================================== */

    const correctIndexes =
      question.correctChoiceIndexes;

    if (
      !Array.isArray(
        correctIndexes
      ) ||
      correctIndexes.length <
        2
    ) {
      return (
        "The quiz contains an invalid multiple-choice question."
      );
    }

    const uniqueCorrectIndexes =
      [
        ...new Set(
          correctIndexes
        ),
      ];

    if (
      uniqueCorrectIndexes.length !==
      correctIndexes.length
    ) {
      return (
        "The quiz contains duplicated multiple-choice correct answers."
      );
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
      return (
        "The quiz contains an invalid multiple-choice correct answer."
      );
    }
  }

  return null;
}

/* =========================================================
   Start or resume attempt
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
    !cleanName
  ) {
    return {
      success:
        false,

      attempt:
        null,

      resumed:
        false,

      message:
        "Please enter your full name.",
    };
  }

  if (
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

      message:
        "Email address is too long.",
    };
  }

  /* =====================================================
     Load quiz
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

      message:
        availability.message,
    };
  }

  /* =====================================================
     Load questions
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

      message:
        questionError,
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

      message:
        "There is not enough time remaining to start this quiz.",
    };
  }

  /* =====================================================
     Frozen ordering
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
     * Student options are frozen here.
     *
     * Therefore changing the quiz later
     * cannot unexpectedly change an
     * already-started attempt.
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
) {
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

      message:
        "Question does not belong to this attempt.",
    };
  }

  /* =====================================================
     Load real question
     ===================================================== */

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
    if (
      answer.selectedChoiceIndex ===
      undefined
    ) {
      return {
        success:
          false,

        message:
          "No QCM answer was provided.",
      };
    }

    if (
      !Number.isInteger(
        answer.selectedChoiceIndex
      ) ||
      answer.selectedChoiceIndex <
        0 ||
      answer.selectedChoiceIndex >=
        question.choices.length
    ) {
      return {
        success:
          false,

        message:
          "Invalid selected answer.",
      };
    }

    nextAnswer = {
      selectedChoiceIndex:
        answer.selectedChoiceIndex,

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

        message:
          "No multiple-choice answer was provided.",
      };
    }

    /*
     * Empty array is valid.
     *
     * It allows a student to uncheck
     * all currently selected answers.
     */
    const selectedIndexes =
      [
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

        message:
          "Invalid development answer.",
      };
    }

    const safeDevelopmentAnswer =
      answer
        .developmentAnswer
        .slice(
          0,
          MAX_DEVELOPMENT_ANSWER_LENGTH
        );

    nextAnswer = {
      developmentAnswer:
        safeDevelopmentAnswer,

      updatedAt:
        now,
    };
  }

  /* =====================================================
     Save
     ===================================================== */

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

    message:
      "Answer saved successfully.",
  };
}

/* =========================================================
   Grade QCM
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

  if (
    answer.selectedChoiceIndex ===
    question.correctChoiceIndex
  ) {
    return question.points;
  }

  return 0;
}

/* =========================================================
   Grade multiple choice
   ========================================================= */

/*
 * ULearn multiple-choice rule:
 *
 * STEP 1
 * ------
 * Divide the question points by the
 * number of correct choices.
 *
 * Example:
 *
 * Question = 4 points
 *
 * Correct answers:
 * A, C, D, E
 *
 * 4 / 4 = 1 point per correct answer.
 *
 *
 * STEP 2
 * ------
 * Each correct selected choice:
 *
 * +1 share
 *
 * Each incorrect selected choice:
 *
 * -1 share
 *
 *
 * Example:
 *
 * Correct:
 * A, C, D, E
 *
 * Student:
 * A + D
 *
 * Score:
 * +1 +1 = 2
 *
 *
 * Student:
 * A + D + B
 *
 * Score:
 * +1 +1 -1 = 1
 *
 *
 * STEP 3
 * ------
 * Score cannot be:
 *
 * < 0
 *
 * or
 *
 * > question.points
 */
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

  const correctIndexes =
    [
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

  const selectedIndexes =
    [
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

  /*
   * Score cannot become negative.
   *
   * It also cannot exceed the maximum
   * configured points for the question.
   */
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

    /* =====================================================
       Development
       ===================================================== */

    if (
      question.type ===
      "development"
    ) {
      developmentQuestions +=
        1;

      continue;
    }

    /* =====================================================
       QCM
       ===================================================== */

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

    /* =====================================================
       Multiple choice
       ===================================================== */

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
   Validate attempt before submission
   ========================================================= */

function validateAttemptForSubmission(
  attempt: Attempt,

  quiz: Quiz,

  questions:
    Question[]
) {
  if (
    attempt.quizId !==
    quiz.id
  ) {
    return (
      "This attempt is not linked correctly to the quiz."
    );
  }

  if (
    attempt.teacherId !==
    quiz.teacherId
  ) {
    return (
      "This attempt is not linked correctly to the teacher."
    );
  }

  if (
    attempt.questionOrder.length !==
    questions.length
  ) {
    return (
      "The attempt question structure is invalid."
    );
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
    return (
      "The attempt contains duplicate questions."
    );
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
      return (
        "The attempt contains an invalid question."
      );
    }
  }

  return null;
}

/* =========================================================
   Merge final development answers
   ========================================================= */

/*
 * Development answers use autosave.
 *
 * A student can however click Submit before
 * the final autosave timeout completes.
 *
 * Therefore QuizSessionPage can provide its
 * current development drafts directly to
 * submitAttempt().
 */
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
        "development"
    ) {
      continue;
    }

    if (
      typeof value !==
      "string"
    ) {
      continue;
    }

    const safeValue =
      value.slice(
        0,
        MAX_DEVELOPMENT_ANSWER_LENGTH
      );

    nextAnswers[
      questionId
    ] = {
      developmentAnswer:
        safeValue,

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
  /* =====================================================
     Attempt
     ===================================================== */

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

      message:
        "Attempt not found.",
    };
  }

  /* =====================================================
     Already graded
     ===================================================== */

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

      message:
        "Attempt has already been graded.",
    };
  }

  /* =====================================================
     Already submitted
     ===================================================== */

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
        attempt.finalScore ===
        null,

      message:
        "Attempt has already been submitted.",
    };
  }

  /* =====================================================
     Quiz
     ===================================================== */

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

      message:
        "Quiz not found.",
    };
  }

  /* =====================================================
     Questions
     ===================================================== */

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

      message:
        "Quiz questions could not be loaded.",
    };
  }

  /* =====================================================
     Validate structure
     ===================================================== */

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

      message:
        attemptError,
    };
  }

  /* =====================================================
     Merge final development drafts
     ===================================================== */

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

  /* =====================================================
     Automatic grading
     ===================================================== */

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
     Fully automatic quiz
     ===================================================== */

  /*
   * If the quiz contains only:
   *
   * - QCM
   * - MULTIPLE CHOICE
   *
   * then the quiz can immediately
   * become graded.
   */
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

      message:
        "Quiz submitted and graded successfully.",
    };
  }

  /* =====================================================
     Development questions require teacher correction
     ===================================================== */

  /*
   * QCM + MULTIPLE CHOICE have already
   * been graded automatically.
   *
   * Development questions still require
   * teacher grading.
   */
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

    message:
      "Quiz submitted successfully. Development questions are waiting for teacher grading.",
  };
}