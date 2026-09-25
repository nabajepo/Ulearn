// lib/services/quizzes.ts

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
  writeBatch,
} from "firebase/firestore";

import {
  db,
} from "@/lib/firebase";

import {
  LIMITS,
} from "@/lib/services/limits";



import {
  getTeacher,
  updateTeacherQuiz,
} from "@/lib/services/users";

/* =========================================================
   Types
   ========================================================= */

export type QuizStatus =
  | "draft"
  | "launched"
  | "closed";

export type QuizAvailabilityMode =
  | "open_window"
  | "scheduled_session";

export type Quiz = {
  id: string;

  teacherId: string;

  /*
   * Frozen public teacher display name.
   *
   * We store it directly on the quiz so the public
   * join page does not need to read the teacher account.
   */
  createdByName: string;

  title: string;

  description: string;

  status: QuizStatus;

  /* =====================================================
     Planned quiz structure
     ===================================================== */

  targetQuestions: number;

  totalPoints: number;

  /* =====================================================
     Availability
     ===================================================== */

  timeZone: string;

  availabilityMode:
    QuizAvailabilityMode;

  availableFrom:
    string | null;

  availableUntil:
    string | null;

  timeLimitMinutes:
    number;

  /* =====================================================
     Student options
     ===================================================== */

  allowBackNavigation:
    boolean;

  shuffleQuestions:
    boolean;

  shuffleChoices:
    boolean;

  showResultsToStudents:
    boolean;

  showCorrectAnswers:
    boolean;

  /* =====================================================
     Actual question counters
     ===================================================== */

  totalQuestions:
    number;

  /*
   * Single-answer automatically graded
   * questions.
   */
  qcmQuestions:
    number;

  /*
   * Multiple-answer automatically graded
   * questions.
   */
  multipleChoiceQuestions:
    number;

  developmentQuestions:
    number;

  maxStudents:
    number;

  /* =====================================================
     Student access
     ===================================================== */

  accessCode:
    string | null;

  /* =====================================================
     Dates
     ===================================================== */

  createdAt:
    string;

  updatedAt:
    string;

  launchedAt:
    string | null;

  closedAt:
    string | null;
};

/* =========================================================
   Real quiz structure progress
   ========================================================= */

export type QuizStructureProgress = {
  totalQuestions:
    number;

  qcmQuestions:
    number;

  multipleChoiceQuestions:
    number;

  developmentQuestions:
    number;

  /*
   * QCM + MULTI.
   */
  automaticQuestions:
    number;

  assignedPoints:
    number;
};

/* =========================================================
   Create input
   ========================================================= */

export type CreateQuizInput = {
  teacherId: string;

  title: string;

  description: string;

  targetQuestions:
    number;

  totalPoints:
    number;

  timeZone:
    string;

  availabilityMode:
    QuizAvailabilityMode;

  availableFrom:
    string | null;

  availableUntil:
    string | null;

  timeLimitMinutes:
    number;

  allowBackNavigation:
    boolean;

  shuffleQuestions:
    boolean;

  shuffleChoices:
    boolean;

  showResultsToStudents:
    boolean;

  showCorrectAnswers:
    boolean;
};

/* =========================================================
   Update input
   ========================================================= */

export type UpdateQuizInput =
  Omit<
    CreateQuizInput,
    | "teacherId"
    | "targetQuestions"
    | "totalPoints"
  > & {
    targetQuestions?:
      number;

    totalPoints?:
      number;
  };

/* =========================================================
   Internal launch question representation
   ========================================================= */

/*
 * We intentionally do not import questions.ts here.
 *
 * questions.ts already imports functions from quizzes.ts.
 *
 * Importing questions.ts here would therefore create
 * a circular dependency.
 */

type LaunchQuestionType =
  | "qcm"
  | "multiple_choice"
  | "development";

type LaunchQuestion = {
  id: string;

  quizId: string;

  teacherId: string;

  type:
    LaunchQuestionType;

  text: string;

  points: number;

  choices?:
    string[];

  /*
   * QCM only.
   */
  correctChoiceIndex?:
    number;

  /*
   * Multiple choice only.
   */
  correctChoiceIndexes?:
    number[];
};

/* =========================================================
   Constants
   ========================================================= */

const QUIZZES_COLLECTION =
  "quizzes";

const QUESTIONS_COLLECTION =
  "questions";

const ATTEMPTS_COLLECTION =
  "attempts";

const STUDENT_ATTEMPT_CREDENTIALS_COLLECTION =
  "studentAttemptCredentials";

/*
 * The current application limits mean:
 *
 * MAX_QCM_QUESTIONS = maximum number of
 * automatically corrected questions.
 *
 * Therefore:
 *
 * QCM + MULTIPLE CHOICE <= MAX_QCM_QUESTIONS
 *
 * DEVELOPMENT <= MAX_DEVELOPMENT_QUESTIONS
 *
 * TOTAL <= MAX_QUESTIONS_PER_QUIZ
 */

const ACCESS_CODE_CHARACTERS =
  "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const ACCESS_CODE_LENGTH =
  6;

const ACCESS_CODE_ATTEMPTS =
  20;

/* =========================================================
   Teacher public display name
   ========================================================= */

/*
 * users.ts may evolve over time, so this helper deliberately
 * accepts unknown and supports the most common teacher-name
 * shapes without coupling quizzes.ts to one exact user type.
 *
 * The resulting value is frozen on the quiz document.
 */
function getTeacherDisplayName(
  teacher: unknown
) {
  if (
    !teacher ||
    typeof teacher !==
      "object"
  ) {
    return "";
  }

  const data =
    teacher as Record<
      string,
      unknown
    >;

  const fullNameCandidates = [
    data.fullName,
    data.displayName,
    data.name,
  ];

  for (
    const candidate of
    fullNameCandidates
  ) {
    if (
      typeof candidate ===
        "string" &&
      candidate.trim()
    ) {
      return candidate.trim();
    }
  }

  const firstName =
    typeof data.firstName ===
    "string"
      ? data.firstName.trim()
      : "";

  const lastName =
    typeof data.lastName ===
    "string"
      ? data.lastName.trim()
      : "";

  return [
    firstName,
    lastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

/* =========================================================
   Firestore references
   ========================================================= */

function quizRef(
  quizId: string
) {
  return doc(
    db,
    QUIZZES_COLLECTION,
    quizId
  );
}

/* =========================================================
   Structural validation
   ========================================================= */

function validateQuizStructure(
  input: {
    targetQuestions:
      number;

    totalPoints:
      number;
  }
) {
  if (
    !Number.isInteger(
      input.targetQuestions
    )
  ) {
    return (
      "The number of questions must be a whole number."
    );
  }

  if (
    input.targetQuestions <
    1
  ) {
    return (
      "The quiz must contain at least 1 question."
    );
  }

  if (
    input.targetQuestions >
    LIMITS
      .MAX_QUESTIONS_PER_QUIZ
  ) {
    return (
      `The quiz cannot contain more than ` +
      `${LIMITS.MAX_QUESTIONS_PER_QUIZ} questions.`
    );
  }

  if (
    !Number.isFinite(
      input.totalPoints
    )
  ) {
    return (
      "The total number of points is invalid."
    );
  }

  if (
    input.totalPoints <
    10
  ) {
    return (
      "The quiz must be worth at least 10 points."
    );
  }

  if (
    !Number.isInteger(
      input.totalPoints
    )
  ) {
    return (
      "The total number of points must be a whole number."
    );
  }

  /*
   * Every question must be worth
   * at least one point.
   */
  if (
    input.totalPoints <
    input.targetQuestions
  ) {
    return (
      "The quiz must contain at least one point per question."
    );
  }

  return null;
}

/* =========================================================
   Settings validation
   ========================================================= */

function validateQuizInput(
  input: {
    title: string;

    timeZone: string;

    availabilityMode:
      QuizAvailabilityMode;

    availableFrom:
      string | null;

    availableUntil:
      string | null;

    timeLimitMinutes:
      number;
  },

  teacherExpiresAt:
    string
) {
  const now =
    Date.now();

  const accountExpiration =
    new Date(
      teacherExpiresAt
    ).getTime();

  if (
    !input.title.trim()
  ) {
    return (
      "Quiz title is required."
    );
  }

  if (
    !input.timeZone
  ) {
    return (
      "A time zone is required."
    );
  }

  if (
    !Number.isFinite(
      input.timeLimitMinutes
    ) ||
    input.timeLimitMinutes <
      1
  ) {
    return (
      "Quiz duration must be greater than 0 minutes."
    );
  }

  if (
    input.timeLimitMinutes >
    LIMITS
      .MAX_QUIZ_DURATION_MINUTES
  ) {
    return (
      `Quiz duration cannot exceed ` +
      `${LIMITS.ACCOUNT_DURATION_DAYS} days.`
    );
  }

  if (
    Number.isNaN(
      accountExpiration
    ) ||
    accountExpiration <=
      now
  ) {
    return (
      "Your teacher account has expired."
    );
  }

  const start =
    input.availableFrom !==
    null
      ? new Date(
          input.availableFrom
        ).getTime()
      : null;

  const end =
    input.availableUntil !==
    null
      ? new Date(
          input.availableUntil
        ).getTime()
      : null;

  if (
    start !==
      null &&
    Number.isNaN(
      start
    )
  ) {
    return (
      "The opening date is invalid."
    );
  }

  if (
    end !==
      null &&
    Number.isNaN(
      end
    )
  ) {
    return (
      "The deadline is invalid."
    );
  }

  if (
    start !==
      null &&
    start <
      now
  ) {
    return (
      "The opening date cannot be in the past."
    );
  }

  if (
    end !==
      null &&
    end <=
      now
  ) {
    return (
      "The deadline cannot be in the past."
    );
  }

  if (
    start !==
      null &&
    start >
      accountExpiration
  ) {
    return (
      "The opening date cannot be after your account expiration."
    );
  }

  if (
    end !==
      null &&
    end >
      accountExpiration
  ) {
    return (
      "The deadline cannot be after your account expiration."
    );
  }

  /* =====================================================
     Scheduled session
     ===================================================== */

  if (
    input.availabilityMode ===
    "scheduled_session"
  ) {
    if (
      start ===
        null ||
      end ===
        null
    ) {
      return (
        "Start and end dates are required for a scheduled session."
      );
    }

    if (
      end <=
      start
    ) {
      return (
        "The session end must be after the session start."
      );
    }

    const sessionDurationMinutes =
      Math.floor(
        (
          end -
          start
        ) /
          (
            1000 *
            60
          )
      );

    if (
      sessionDurationMinutes >
      LIMITS
        .MAX_QUIZ_DURATION_MINUTES
    ) {
      return (
        `A scheduled session cannot exceed ` +
        `${LIMITS.ACCOUNT_DURATION_DAYS} days.`
      );
    }
  }

  /* =====================================================
     Open window
     ===================================================== */

  if (
    input.availabilityMode ===
    "open_window"
  ) {
    if (
      end ===
      null
    ) {
      return (
        "A submission deadline is required."
      );
    }

    const effectiveStart =
      start ??
      now;

    if (
      end <=
      effectiveStart
    ) {
      return (
        "The deadline must be after the opening date."
      );
    }

    const availableMinutes =
      Math.floor(
        (
          end -
          effectiveStart
        ) /
          (
            1000 *
            60
          )
      );

    if (
      input.timeLimitMinutes >
      availableMinutes
    ) {
      return (
        "The time allowed per student cannot exceed the available quiz window."
      );
    }
  }

  return null;
}

/* =========================================================
   Launch-time settings validation
   ========================================================= */

function validateQuizForLaunch(
  quiz: Quiz,

  teacherExpiresAt:
    string
) {
  const now =
    Date.now();

  const accountExpiration =
    new Date(
      teacherExpiresAt
    ).getTime();

  if (
    Number.isNaN(
      accountExpiration
    ) ||
    accountExpiration <=
      now
  ) {
    return (
      "Your teacher account has expired."
    );
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
    return (
      "The quiz opening date is invalid."
    );
  }

  if (
    end !==
      null &&
    Number.isNaN(
      end
    )
  ) {
    return (
      "The quiz deadline is invalid."
    );
  }

  if (
    end ===
    null
  ) {
    return (
      quiz.availabilityMode ===
      "scheduled_session"
        ? "The scheduled session requires an end date."
        : "The quiz requires a submission deadline."
    );
  }

  if (
    end <=
    now
  ) {
    return (
      "This quiz deadline has already passed. Change the quiz settings before launching it."
    );
  }

  if (
    end >
    accountExpiration
  ) {
    return (
      "The quiz deadline cannot exceed your teacher account expiration."
    );
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
      return (
        "A scheduled session requires a start date."
      );
    }

    if (
      start <=
      now
    ) {
      return (
        "The scheduled session start time has already passed. Select a new session time before launching the quiz."
      );
    }

    if (
      start >=
      end
    ) {
      return (
        "The scheduled session end must be after its start."
      );
    }

    if (
      start >
      accountExpiration
    ) {
      return (
        "The scheduled session cannot start after your teacher account expiration."
      );
    }

    const sessionMinutes =
      Math.floor(
        (
          end -
          start
        ) /
          (
            1000 *
            60
          )
      );

    if (
      sessionMinutes <
      1
    ) {
      return (
        "The scheduled session must last at least one minute."
      );
    }

    if (
      sessionMinutes >
      LIMITS
        .MAX_QUIZ_DURATION_MINUTES
    ) {
      return (
        `The scheduled session cannot exceed ` +
        `${LIMITS.ACCOUNT_DURATION_DAYS} days.`
      );
    }
  }

  /* =====================================================
     Open window
     ===================================================== */

  if (
    quiz.availabilityMode ===
    "open_window"
  ) {
    const effectiveStart =
      start !==
        null &&
      start >
        now
        ? start
        : now;

    const availableMinutes =
      Math.floor(
        (
          end -
          effectiveStart
        ) /
          (
            1000 *
            60
          )
      );

    if (
      availableMinutes <
      1
    ) {
      return (
        "The quiz availability window is too short."
      );
    }

    if (
      quiz.timeLimitMinutes <
      1
    ) {
      return (
        "The student time limit must be at least one minute."
      );
    }

    if (
      quiz.timeLimitMinutes >
      LIMITS
        .MAX_QUIZ_DURATION_MINUTES
    ) {
      return (
        `The student time limit cannot exceed ` +
        `${LIMITS.ACCOUNT_DURATION_DAYS} days.`
      );
    }

    if (
      quiz.timeLimitMinutes >
      availableMinutes
    ) {
      return (
        "The remaining quiz window is shorter than the time allowed per student. Update the quiz schedule before launching it."
      );
    }
  }

  return null;
}

/* =========================================================
   Get actual quiz questions
   ========================================================= */

async function getLaunchQuestions(
  quizId: string
): Promise<
  LaunchQuestion[]
> {
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

  return snapshot.docs.map(
    (
      questionDocument
    ) => {
      const data =
        questionDocument.data();

      let type:
        LaunchQuestionType;

      if (
        data.type ===
        "development"
      ) {
        type =
          "development";
      } else if (
        data.type ===
        "multiple_choice"
      ) {
        type =
          "multiple_choice";
      } else {
        /*
         * Compatibility:
         *
         * Old choice questions are treated
         * as normal QCM.
         */
        type =
          "qcm";
      }

      const correctChoiceIndexes =
        Array.isArray(
          data.correctChoiceIndexes
        )
          ? data
              .correctChoiceIndexes
              .filter(
                (
                  value
                ): value is number =>
                  typeof value ===
                    "number" &&
                  Number.isInteger(
                    value
                  )
              )
          : undefined;

      return {
        id:
          questionDocument.id,

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

        type,

        text:
          typeof data.text ===
          "string"
            ? data.text
            : "",

        points:
          typeof data.points ===
          "number"
            ? data.points
            : 0,

        choices:
          Array.isArray(
            data.choices
          )
            ? data.choices.filter(
                (
                  value
                ): value is string =>
                  typeof value ===
                  "string"
              )
            : undefined,

        correctChoiceIndex:
          typeof data.correctChoiceIndex ===
          "number"
            ? data.correctChoiceIndex
            : undefined,

        correctChoiceIndexes,
      };
    }
  );
}

/* =========================================================
   Real quiz structure progress
   ========================================================= */

export async function getQuizStructureProgress(
  quizId: string
): Promise<
  QuizStructureProgress
> {
  const questions =
    await getLaunchQuestions(
      quizId
    );

  let qcmQuestions =
    0;

  let multipleChoiceQuestions =
    0;

  let developmentQuestions =
    0;

  let assignedPoints =
    0;

  for (
    const question of
    questions
  ) {
    if (
      question.type ===
      "qcm"
    ) {
      qcmQuestions +=
        1;
    } else if (
      question.type ===
      "multiple_choice"
    ) {
      multipleChoiceQuestions +=
        1;
    } else {
      developmentQuestions +=
        1;
    }

    if (
      Number.isFinite(
        question.points
      ) &&
      question.points >
        0
    ) {
      assignedPoints +=
        question.points;
    }
  }

  return {
    totalQuestions:
      questions.length,

    qcmQuestions,

    multipleChoiceQuestions,

    developmentQuestions,

    automaticQuestions:
      qcmQuestions +
      multipleChoiceQuestions,

    assignedPoints,
  };
}

/* =========================================================
   Validate common choice question structure
   ========================================================= */

function validateChoiceQuestion(
  question:
    LaunchQuestion,

  displayNumber:
    number
) {
  const choices =
    question.choices ??
    [];

  if (
    choices.length <
    2
  ) {
    return (
      `Question ${displayNumber} must contain at least 2 answers.`
    );
  }

  if (
    choices.some(
      (
        choice
      ) =>
        !choice.trim()
    )
  ) {
    return (
      `Question ${displayNumber} contains an empty answer.`
    );
  }

  return null;
}

/* =========================================================
   Validate actual questions before launch
   ========================================================= */

function validateQuestionsForLaunch(
  quiz: Quiz,

  questions:
    LaunchQuestion[]
) {
  /* =====================================================
     Planned total
     ===================================================== */

  if (
    questions.length !==
    quiz.targetQuestions
  ) {
    return (
      `This quiz requires ${quiz.targetQuestions} questions. ` +
      `You currently have ${questions.length}.`
    );
  }

  if (
    questions.length <
    1
  ) {
    return (
      "Add at least one question before launching the quiz."
    );
  }

  if (
    questions.length >
    LIMITS
      .MAX_QUESTIONS_PER_QUIZ
  ) {
    return (
      `The quiz cannot contain more than ` +
      `${LIMITS.MAX_QUESTIONS_PER_QUIZ} questions.`
    );
  }

  let calculatedPoints =
    0;

  let qcmCount =
    0;

  let multipleChoiceCount =
    0;

  let developmentCount =
    0;

  /* =====================================================
     Validate every question
     ===================================================== */

  for (
    let index = 0;

    index <
    questions.length;

    index +=
      1
  ) {
    const question =
      questions[
        index
      ];

    const displayNumber =
      index +
      1;

    /* ===================================================
       Ownership
       =================================================== */

    if (
      question.quizId !==
      quiz.id
    ) {
      return (
        `Question ${displayNumber} is not linked correctly to this quiz.`
      );
    }

    if (
      question.teacherId !==
      quiz.teacherId
    ) {
      return (
        `Question ${displayNumber} does not belong to this teacher.`
      );
    }

    /* ===================================================
       Text
       =================================================== */

    if (
      !question.text.trim()
    ) {
      return (
        `Question ${displayNumber} has no question text.`
      );
    }

    /* ===================================================
       Points
       =================================================== */

    if (
      !Number.isInteger(
        question.points
      ) ||
      question.points <
        1
    ) {
      return (
        `Question ${displayNumber} must be worth at least 1 point.`
      );
    }

    calculatedPoints +=
      question.points;

    /* ===================================================
       QCM
       =================================================== */

    if (
      question.type ===
      "qcm"
    ) {
      qcmCount +=
        1;

      const choicesError =
        validateChoiceQuestion(
          question,
          displayNumber
        );

      if (
        choicesError
      ) {
        return (
          choicesError
        );
      }

      const choices =
        question.choices ??
        [];

      if (
        question.correctChoiceIndex ===
          undefined ||
        !Number.isInteger(
          question.correctChoiceIndex
        ) ||
        question.correctChoiceIndex <
          0 ||
        question.correctChoiceIndex >=
          choices.length
      ) {
        return (
          `QCM question ${displayNumber} does not have a valid correct answer.`
        );
      }

      continue;
    }

    /* ===================================================
       Multiple choice
       =================================================== */

    if (
      question.type ===
      "multiple_choice"
    ) {
      multipleChoiceCount +=
        1;

      const choicesError =
        validateChoiceQuestion(
          question,
          displayNumber
        );

      if (
        choicesError
      ) {
        return (
          choicesError
        );
      }

      const choices =
        question.choices ??
        [];

      const correctIndexes =
        question
          .correctChoiceIndexes ??
        [];

      /*
       * MULTI means there must actually
       * be several correct answers.
       */
      if (
        correctIndexes.length <
        2
      ) {
        return (
          `Multiple-choice question ${displayNumber} must contain at least 2 correct answers.`
        );
      }

      /*
       * Prevent duplicated correct indexes.
       *
       * Example invalid value:
       *
       * [0, 0, 2]
       */
      const uniqueIndexes =
        new Set(
          correctIndexes
        );

      if (
        uniqueIndexes.size !==
        correctIndexes.length
      ) {
        return (
          `Multiple-choice question ${displayNumber} contains duplicated correct answers.`
        );
      }

      if (
        correctIndexes.some(
          (
            correctIndex
          ) =>
            !Number.isInteger(
              correctIndex
            ) ||
            correctIndex <
              0 ||
            correctIndex >=
              choices.length
        )
      ) {
        return (
          `Multiple-choice question ${displayNumber} contains an invalid correct answer.`
        );
      }

      continue;
    }

    /* ===================================================
       Development
       =================================================== */

    developmentCount +=
      1;
  }

  /* =====================================================
     Total points
     ===================================================== */

  if (
    calculatedPoints !==
    quiz.totalPoints
  ) {
    return (
      `The quiz must total ${quiz.totalPoints} points. ` +
      `The current questions total ${calculatedPoints} points.`
    );
  }

  /* =====================================================
     Type limits
     ===================================================== */

  const automaticQuestionCount =
    qcmCount +
    multipleChoiceCount;

  /*
   * Current ULearn rule:
   *
   * QCM + MULTI share MAX_QCM_QUESTIONS.
   */
  if (
    automaticQuestionCount >
    LIMITS
      .MAX_QCM_QUESTIONS
  ) {
    return (
      `The quiz cannot contain more than ` +
      `${LIMITS.MAX_QCM_QUESTIONS} automatically corrected questions ` +
      `(QCM + multiple choice).`
    );
  }

  if (
    developmentCount >
    LIMITS
      .MAX_DEVELOPMENT_QUESTIONS
  ) {
    return (
      `The quiz cannot contain more than ` +
      `${LIMITS.MAX_DEVELOPMENT_QUESTIONS} development questions.`
    );
  }

  return null;
}

/* =========================================================
   Access code generation
   ========================================================= */

function createAccessCodeCandidate() {
  let result =
    "";

  if (
    typeof globalThis.crypto !==
      "undefined" &&
    typeof globalThis.crypto
        .getRandomValues ===
      "function"
  ) {
    const values =
      new Uint32Array(
        ACCESS_CODE_LENGTH
      );

    globalThis.crypto
      .getRandomValues(
        values
      );

    for (
      const value of
      values
    ) {
      result +=
        ACCESS_CODE_CHARACTERS[
          value %
            ACCESS_CODE_CHARACTERS.length
        ];
    }

    return result;
  }

  /*
   * Fallback for environments where
   * crypto.getRandomValues is unavailable.
   */
  for (
    let index = 0;

    index <
    ACCESS_CODE_LENGTH;

    index +=
      1
  ) {
    const position =
      Math.floor(
        Math.random() *
          ACCESS_CODE_CHARACTERS.length
      );

    result +=
      ACCESS_CODE_CHARACTERS[
        position
      ];
  }

  return result;
}

/* =========================================================
   Access code existence
   ========================================================= */

async function accessCodeExists(
  accessCode:
    string
) {
  const accessQuery =
    query(
      collection(
        db,
        QUIZZES_COLLECTION
      ),

      where(
        "accessCode",
        "==",
        accessCode
      ),

      limit(
        1
      )
    );

  const snapshot =
    await getDocs(
      accessQuery
    );

  return (
    !snapshot.empty
  );
}

/* =========================================================
   Generate unique access code
   ========================================================= */

async function generateUniqueAccessCode() {
  for (
    let attempt = 0;

    attempt <
    ACCESS_CODE_ATTEMPTS;

    attempt +=
      1
  ) {
    const candidate =
      createAccessCodeCandidate();

    const exists =
      await accessCodeExists(
        candidate
      );

    if (
      !exists
    ) {
      return (
        candidate
      );
    }
  }

  throw new Error(
    "Unable to generate a unique quiz access code."
  );
}

/* =========================================================
   Map quiz snapshot
   ========================================================= */

function mapQuiz(
  quizId: string,

  data:
    Record<
      string,
      unknown
    >
): Quiz {
  return {
    id:
      quizId,

    teacherId:
      typeof data.teacherId ===
      "string"
        ? data.teacherId
        : "",

    createdByName:
      typeof data.createdByName ===
      "string"
        ? data.createdByName
            .trim()
        : "",

    title:
      typeof data.title ===
      "string"
        ? data.title
        : "",

    description:
      typeof data.description ===
      "string"
        ? data.description
        : "",

    status:
      data.status ===
      "launched"
        ? "launched"
        : data.status ===
            "closed"
          ? "closed"
          : "draft",

    /* =====================================================
       Planned structure
       ===================================================== */

    targetQuestions:
      typeof data.targetQuestions ===
      "number"
        ? data.targetQuestions
        : LIMITS
            .MAX_QUESTIONS_PER_QUIZ,

    totalPoints:
      typeof data.totalPoints ===
      "number"
        ? data.totalPoints
        : 100,

    /* =====================================================
       Availability
       ===================================================== */

    timeZone:
      typeof data.timeZone ===
      "string"
        ? data.timeZone
        : "America/Toronto",

    availabilityMode:
      data.availabilityMode ===
      "scheduled_session"
        ? "scheduled_session"
        : "open_window",

    availableFrom:
      typeof data.availableFrom ===
      "string"
        ? data.availableFrom
        : null,

    availableUntil:
      typeof data.availableUntil ===
      "string"
        ? data.availableUntil
        : null,

    timeLimitMinutes:
      typeof data.timeLimitMinutes ===
      "number"
        ? data.timeLimitMinutes
        : 60,

    /* =====================================================
       Student options
       ===================================================== */

    allowBackNavigation:
      typeof data.allowBackNavigation ===
      "boolean"
        ? data.allowBackNavigation
        : true,

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

    /* =====================================================
       Counters
       ===================================================== */

    totalQuestions:
      typeof data.totalQuestions ===
      "number"
        ? data.totalQuestions
        : 0,

    qcmQuestions:
      typeof data.qcmQuestions ===
      "number"
        ? data.qcmQuestions
        : 0,

    /*
     * Compatibility with quizzes created
     * before MULTI existed.
     */
    multipleChoiceQuestions:
      typeof data.multipleChoiceQuestions ===
      "number"
        ? data.multipleChoiceQuestions
        : 0,

    developmentQuestions:
      typeof data.developmentQuestions ===
      "number"
        ? data.developmentQuestions
        : 0,

    maxStudents:
      typeof data.maxStudents ===
      "number"
        ? data.maxStudents
        : LIMITS
            .MAX_STUDENTS_PER_QUIZ,

    /* =====================================================
       Access
       ===================================================== */

    accessCode:
      typeof data.accessCode ===
      "string"
        ? data.accessCode
        : null,

    /* =====================================================
       Dates
       ===================================================== */

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

    launchedAt:
      typeof data.launchedAt ===
      "string"
        ? data.launchedAt
        : null,

    closedAt:
      typeof data.closedAt ===
      "string"
        ? data.closedAt
        : null,
  };
}

/* =========================================================
   Get quiz
   ========================================================= */

export async function getQuiz(
  quizId: string
): Promise<
  Quiz | null
> {
  const snapshot =
    await getDoc(
      quizRef(
        quizId
      )
    );

  if (
    !snapshot.exists()
  ) {
    return null;
  }

  return mapQuiz(
    snapshot.id,
    snapshot.data()
  );
}

/* =========================================================
   Get quiz by student access code
   ========================================================= */

export async function getQuizByAccessCode(
  accessCode:
    string
): Promise<
  Quiz | null
> {
  const cleanCode =
    accessCode
      .trim()
      .toUpperCase();

  if (
    !cleanCode
  ) {
    return null;
  }

  const accessQuery =
    query(
      collection(
        db,
        QUIZZES_COLLECTION
      ),

      where(
        "accessCode",
        "==",
        cleanCode
      ),

      limit(
        1
      )
    );

  const snapshot =
    await getDocs(
      accessQuery
    );

  if (
    snapshot.empty
  ) {
    return null;
  }

  const quizDocument =
    snapshot.docs[
      0
    ];

  return mapQuiz(
    quizDocument.id,
    quizDocument.data()
  );
}

/* =========================================================
   Create quiz
   ========================================================= */

export async function createQuiz(
  input:
    CreateQuizInput
) {
  const teacher =
    await getTeacher(
      input.teacherId
    );

  if (
    !teacher
  ) {
    return {
      success:
        false,

      quiz:
        null,

      message:
        "Teacher not found.",
    };
  }

  if (
    teacher.quizId
  ) {
    return {
      success:
        false,

      quiz:
        null,

      message:
        "You already have one quiz.",
    };
  }

  const structureError =
    validateQuizStructure({
      targetQuestions:
        input.targetQuestions,

      totalPoints:
        input.totalPoints,
    });

  if (
    structureError
  ) {
    return {
      success:
        false,

      quiz:
        null,

      message:
        structureError,
    };
  }

  const validationError =
    validateQuizInput(
      {
        title:
          input.title,

        timeZone:
          input.timeZone,

        availabilityMode:
          input.availabilityMode,

        availableFrom:
          input.availableFrom,

        availableUntil:
          input.availableUntil,

        timeLimitMinutes:
          input.timeLimitMinutes,
      },

      teacher.expiresAt
    );

  if (
    validationError
  ) {
    return {
      success:
        false,

      quiz:
        null,

      message:
        validationError,
    };
  }

  const createdByName =
    getTeacherDisplayName(
      teacher
    );

  const now =
    new Date()
      .toISOString();

  const quizData:
    Omit<
      Quiz,
      "id"
    > = {
    teacherId:
      input.teacherId,

    createdByName,

    title:
      input.title.trim(),

    description:
      input.description.trim(),

    status:
      "draft",

    targetQuestions:
      input.targetQuestions,

    totalPoints:
      input.totalPoints,

    timeZone:
      input.timeZone,

    availabilityMode:
      input.availabilityMode,

    availableFrom:
      input.availableFrom,

    availableUntil:
      input.availableUntil,

    timeLimitMinutes:
      input.timeLimitMinutes,

    allowBackNavigation:
      input.allowBackNavigation,

    shuffleQuestions:
      input.shuffleQuestions,

    shuffleChoices:
      input.shuffleChoices,

    showResultsToStudents:
      input.showResultsToStudents,

    showCorrectAnswers:
      input.showCorrectAnswers,

    totalQuestions:
      0,

    qcmQuestions:
      0,

    multipleChoiceQuestions:
      0,

    developmentQuestions:
      0,

    maxStudents:
      LIMITS
        .MAX_STUDENTS_PER_QUIZ,

    /*
     * Generated only after a valid launch.
     */
    accessCode:
      null,

    createdAt:
      now,

    updatedAt:
      now,

    launchedAt:
      null,

    closedAt:
      null,
  };

  const quizDocument =
    await addDoc(
      collection(
        db,
        QUIZZES_COLLECTION
      ),

      quizData
    );

  await updateTeacherQuiz(
    input.teacherId,
    quizDocument.id
  );

  return {
    success:
      true,

    quiz: {
      id:
        quizDocument.id,

      ...quizData,
    },

    message:
      "Quiz created successfully.",
  };
}

/* =========================================================
   Update quiz
   ========================================================= */

export async function updateQuiz(
  quizId: string,

  input:
    UpdateQuizInput
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
        false,

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
        false,

      message:
        "Only draft quizzes can be edited.",
    };
  }

  const teacher =
    await getTeacher(
      quiz.teacherId
    );

  if (
    !teacher
  ) {
    return {
      success:
        false,

      message:
        "Teacher not found.",
    };
  }

  const targetQuestions =
    input.targetQuestions ??
    quiz.targetQuestions;

  const totalPoints =
    input.totalPoints ??
    quiz.totalPoints;

  const structureError =
    validateQuizStructure({
      targetQuestions,

      totalPoints,
    });

  if (
    structureError
  ) {
    return {
      success:
        false,

      message:
        structureError,
    };
  }

  /* =====================================================
     Read the real question collection
     ===================================================== */

  const realStructure =
    await getQuizStructureProgress(
      quizId
    );

  if (
    targetQuestions <
    realStructure.totalQuestions
  ) {
    return {
      success:
        false,

      message:
        `This quiz already contains ${realStructure.totalQuestions} questions. ` +
        `The target cannot be lower than that.`,
    };
  }

  if (
    totalPoints <
    realStructure.assignedPoints
  ) {
    return {
      success:
        false,

      message:
        `The existing questions already use ${realStructure.assignedPoints} points. ` +
        `The quiz total cannot be lower than that.`,
    };
  }

  /*
   * Service-level protection.
   *
   * This must not depend only on the UI.
   */
  if (
    realStructure
      .automaticQuestions >
    LIMITS
      .MAX_QCM_QUESTIONS
  ) {
    return {
      success:
        false,

      message:
        `This quiz contains ${realStructure.automaticQuestions} automatically corrected questions. ` +
        `The maximum is ${LIMITS.MAX_QCM_QUESTIONS}.`,
    };
  }

  if (
    realStructure
      .developmentQuestions >
    LIMITS
      .MAX_DEVELOPMENT_QUESTIONS
  ) {
    return {
      success:
        false,

      message:
        `This quiz contains ${realStructure.developmentQuestions} development questions. ` +
        `The maximum is ${LIMITS.MAX_DEVELOPMENT_QUESTIONS}.`,
    };
  }

  const validationError =
    validateQuizInput(
      {
        title:
          input.title,

        timeZone:
          input.timeZone,

        availabilityMode:
          input.availabilityMode,

        availableFrom:
          input.availableFrom,

        availableUntil:
          input.availableUntil,

        timeLimitMinutes:
          input.timeLimitMinutes,
      },

      teacher.expiresAt
    );

  if (
    validationError
  ) {
    return {
      success:
        false,

      message:
        validationError,
    };
  }

  await updateDoc(
    quizRef(
      quizId
    ),

    {
      title:
        input.title.trim(),

      description:
        input.description.trim(),

      targetQuestions,

      totalPoints,

      timeZone:
        input.timeZone,

      availabilityMode:
        input.availabilityMode,

      availableFrom:
        input.availableFrom,

      availableUntil:
        input.availableUntil,

      timeLimitMinutes:
        input.timeLimitMinutes,

      allowBackNavigation:
        input.allowBackNavigation,

      shuffleQuestions:
        input.shuffleQuestions,

      shuffleChoices:
        input.shuffleChoices,

      showResultsToStudents:
        input.showResultsToStudents,

      showCorrectAnswers:
        input.showCorrectAnswers,

      /*
       * Synchronize cached counters
       * using the real question collection.
       */
      totalQuestions:
        realStructure.totalQuestions,

      qcmQuestions:
        realStructure.qcmQuestions,

      multipleChoiceQuestions:
        realStructure
          .multipleChoiceQuestions,

      developmentQuestions:
        realStructure
          .developmentQuestions,

      updatedAt:
        new Date()
          .toISOString(),
    }
  );

  return {
    success:
      true,

    message:
      "Quiz updated successfully.",
  };
}

/* =========================================================
   Launch quiz
   ========================================================= */

export async function launchQuiz(
  quizId:
    string
) {
  /* =====================================================
     Quiz
     ===================================================== */

  const quiz =
    await getQuiz(
      quizId
    );

  if (
    !quiz
  ) {
    return {
      success:
        false,

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
        false,

      message:
        "Only draft quizzes can be launched.",
    };
  }

  /* =====================================================
     Teacher
     ===================================================== */

  const teacher =
    await getTeacher(
      quiz.teacherId
    );

  if (
    !teacher
  ) {
    return {
      success:
        false,

      message:
        "Teacher not found.",
    };
  }

  if (
    teacher.quizId !==
    quiz.id
  ) {
    return {
      success:
        false,

      message:
        "This quiz is no longer linked to your teacher account.",
    };
  }

  /* =====================================================
     Public creator identity
     ===================================================== */

  const createdByName =
    quiz.createdByName ||
    getTeacherDisplayName(
      teacher
    );

  /* =====================================================
     Planned structure
     ===================================================== */

  const structureError =
    validateQuizStructure({
      targetQuestions:
        quiz.targetQuestions,

      totalPoints:
        quiz.totalPoints,
    });

  if (
    structureError
  ) {
    return {
      success:
        false,

      message:
        structureError,
    };
  }

  /* =====================================================
     Real questions
     ===================================================== */

  const questions =
    await getLaunchQuestions(
      quiz.id
    );

  const questionsError =
    validateQuestionsForLaunch(
      quiz,
      questions
    );

  if (
    questionsError
  ) {
    return {
      success:
        false,

      message:
        questionsError,
    };
  }

  /* =====================================================
     Availability
     ===================================================== */

  const availabilityError =
    validateQuizForLaunch(
      quiz,
      teacher.expiresAt
    );

  if (
    availabilityError
  ) {
    return {
      success:
        false,

      message:
        availabilityError,
    };
  }

  /* =====================================================
     Access code
     ===================================================== */

  let accessCode:
    string;

  try {
    accessCode =
      await generateUniqueAccessCode();
  } catch (
    error
  ) {
    console.error(
      "Unable to generate quiz access code:",
      error
    );

    return {
      success:
        false,

      message:
        "Unable to create the student access code. Please try again.",
    };
  }

  /* =====================================================
     Real counters
     ===================================================== */

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

  /*
   * Final defensive checks just before
   * writing status = launched.
   */
  if (
    automaticQuestions >
    LIMITS
      .MAX_QCM_QUESTIONS
  ) {
    return {
      success:
        false,

      message:
        `The quiz cannot contain more than ${LIMITS.MAX_QCM_QUESTIONS} ` +
        `automatically corrected questions (QCM + multiple choice).`,
    };
  }

  if (
    developmentQuestions >
    LIMITS
      .MAX_DEVELOPMENT_QUESTIONS
  ) {
    return {
      success:
        false,

      message:
        `The quiz cannot contain more than ${LIMITS.MAX_DEVELOPMENT_QUESTIONS} ` +
        `development questions.`,
    };
  }

  /* =====================================================
     Save launch
     ===================================================== */

  const now =
    new Date()
      .toISOString();

  await updateDoc(
    quizRef(
      quiz.id
    ),

    {
      status:
        "launched",

      /*
       * Backfill the creator name for quizzes that were
       * created before createdByName existed.
       */
      createdByName,

      accessCode,

      launchedAt:
        now,

      totalQuestions:
        questions.length,

      qcmQuestions,

      multipleChoiceQuestions,

      developmentQuestions,

      updatedAt:
        now,
    }
  );

  return {
    success:
      true,

    accessCode,

    message:
      "Quiz launched successfully.",
  };
}

/* =========================================================
   Close quiz
   ========================================================= */

export async function closeQuiz(
  quizId:
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
        false,

      message:
        "Quiz not found.",
    };
  }

  if (
    quiz.status ===
    "closed"
  ) {
    return {
      success:
        true,

      message:
        "Quiz is already closed.",
    };
  }

  if (
    quiz.status !==
    "launched"
  ) {
    return {
      success:
        false,

      message:
        "Only a launched quiz can be closed.",
    };
  }

  const now =
    new Date()
      .toISOString();

  await updateDoc(
    quizRef(
      quizId
    ),

    {
      status:
        "closed",

      closedAt:
        now,

      updatedAt:
        now,
    }
  );

  return {
    success:
      true,

    message:
      "Quiz closed successfully.",
  };
}

/* =========================================================
   Delete quiz
   ========================================================= */

/* =========================================================
   Delete quiz
   ========================================================= */

export async function deleteQuiz(
  quizId: string
) {
  const quiz =
    await getQuiz(
      quizId
    );

  /* =====================================================
     Idempotent deletion
     ===================================================== */

  if (
    !quiz
  ) {
    return {
      success:
        true,

      message:
        "Quiz already deleted.",
    };
  }

  /* =====================================================
     Deletion protection
     ===================================================== */

  /*
   * Deletion rules:
   *
   * draft    -> allowed
   * launched -> forbidden
   * closed   -> allowed
   *
   * A launched quiz may currently have students
   * completing their attempts, so it must not be
   * deleted while active.
   */

  if (
    quiz.status ===
    "launched"
  ) {
    return {
      success:
        false,

      message:
        "An active quiz cannot be deleted.",
    };
  }

  /* =====================================================
     Load linked questions
     ===================================================== */

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

  const questionsSnapshot =
    await getDocs(
      questionsQuery
    );

  /* =====================================================
     Load linked attempts
     ===================================================== */

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
      )
    );

  const attemptsSnapshot =
    await getDocs(
      attemptsQuery
    );

  /* =====================================================
     Load linked student attempt credentials
     ===================================================== */

  const credentialsQuery =
    query(
      collection(
        db,
        STUDENT_ATTEMPT_CREDENTIALS_COLLECTION
      ),

      where(
        "quizId",
        "==",
        quizId
      )
    );

  const credentialsSnapshot =
    await getDocs(
      credentialsQuery
    );

  /* =====================================================
     Delete linked data + quiz
     ===================================================== */

  const batch =
    writeBatch(
      db
    );

  /* -----------------------------------------------------
     Questions
     ----------------------------------------------------- */

  questionsSnapshot.docs.forEach(
    (
      questionDocument
    ) => {
      batch.delete(
        questionDocument.ref
      );
    }
  );

  /* -----------------------------------------------------
     Attempts
     ----------------------------------------------------- */

  attemptsSnapshot.docs.forEach(
    (
      attemptDocument
    ) => {
      batch.delete(
        attemptDocument.ref
      );
    }
  );

  /* -----------------------------------------------------
     Student attempt credentials
     ----------------------------------------------------- */

  credentialsSnapshot.docs.forEach(
    (
      credentialDocument
    ) => {
      batch.delete(
        credentialDocument.ref
      );
    }
  );

  /* -----------------------------------------------------
     Quiz
     ----------------------------------------------------- */

  batch.delete(
    quizRef(
      quizId
    )
  );

  await batch.commit();

  /* =====================================================
     Release teacher quiz slot
     ===================================================== */

  await updateTeacherQuiz(
    quiz.teacherId,
    null
  );

  

  return {
    success:
      true,

    message:
      quiz.status ===
      "draft"
        ? "Draft quiz deleted successfully."
        : "Completed quiz and associated data deleted successfully.",
  };
}


/* =========================================================
   Question counters
   ========================================================= */

export async function updateQuizQuestionCounters(
  quizId: string,

  counters: {
    totalQuestions:
      number;

    qcmQuestions:
      number;

    multipleChoiceQuestions:
      number;

    developmentQuestions:
      number;
  }
) {
  const quiz =
    await getQuiz(
      quizId
    );

  if (
    !quiz
  ) {
    throw new Error(
      "Quiz not found."
    );
  }

  if (
    quiz.status !==
    "draft"
  ) {
    throw new Error(
      "Question counters are locked after the quiz is launched."
    );
  }


  const automaticQuestions =
    counters.qcmQuestions +
    counters.multipleChoiceQuestions;

  /*
   * Defensive validation.
   *
   * Even if a calling service has a bug,
   * do not synchronize impossible counters.
   */
  if (
    counters.totalQuestions <
      0 ||
    counters.qcmQuestions <
      0 ||
    counters.multipleChoiceQuestions <
      0 ||
    counters.developmentQuestions <
      0
  ) {
    throw new Error(
      "Quiz question counters cannot be negative."
    );
  }

  if (
    counters.totalQuestions >
    LIMITS
      .MAX_QUESTIONS_PER_QUIZ
  ) {
    throw new Error(
      `A quiz cannot contain more than ${LIMITS.MAX_QUESTIONS_PER_QUIZ} questions.`
    );
  }

  if (
    automaticQuestions >
    LIMITS
      .MAX_QCM_QUESTIONS
  ) {
    throw new Error(
      `A quiz cannot contain more than ${LIMITS.MAX_QCM_QUESTIONS} automatically corrected questions.`
    );
  }

  if (
    counters.developmentQuestions >
    LIMITS
      .MAX_DEVELOPMENT_QUESTIONS
  ) {
    throw new Error(
      `A quiz cannot contain more than ${LIMITS.MAX_DEVELOPMENT_QUESTIONS} development questions.`
    );
  }

  /*
   * Ensure the category sum matches
   * the total.
   */
  const calculatedTotal =
    counters.qcmQuestions +
    counters.multipleChoiceQuestions +
    counters.developmentQuestions;

  if (
    calculatedTotal !==
    counters.totalQuestions
  ) {
    throw new Error(
      "Quiz question counters are inconsistent."
    );
  }

  await updateDoc(
    quizRef(
      quizId
    ),

    {
      totalQuestions:
        counters.totalQuestions,

      qcmQuestions:
        counters.qcmQuestions,

      multipleChoiceQuestions:
        counters
          .multipleChoiceQuestions,

      developmentQuestions:
        counters
          .developmentQuestions,

      updatedAt:
        new Date()
          .toISOString(),
    }
  );
}