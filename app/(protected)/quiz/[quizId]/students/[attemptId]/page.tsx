"use client";

/**
 * ============================================================================
 * ULearn - Attempt Grading Page
 * ============================================================================
 *
 * Protected teacher page used to inspect and grade one student attempt.
 *
 * Responsibilities:
 * • Verify that the authenticated teacher owns the quiz and attempt.
 * • Load the quiz, attempt and questions.
 * • Respect the frozen question order stored inside the attempt.
 * • Display student answers.
 * • Display correct answers to the teacher.
 * • Display automatic grading for QCM / multiple choice.
 * • Allow manual grading of development questions.
 * • Prevent development scores from exceeding question points.
 * • Save grading through lib/services/attempts.ts.
 * • Allow an already graded development attempt to be updated.
 *
 * IMPORTANT:
 * Firestore writes are intentionally NOT performed directly from this page.
 * Grading logic belongs to lib/services/attempts.ts.
 * ============================================================================
 */

import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";

import {
  useParams,
  useRouter,
} from "next/navigation";

import AppLoading from "@/components/AppLoading";

import {
  getQuiz,
  type Quiz,
} from "@/lib/services/quizzes";

import {
  getAttempt,
  gradeAttempt,
  type Attempt,
  type AttemptAnswer,
} from "@/lib/services/attempts";

import {
  getQuizQuestions,
  type Question,
} from "@/lib/services/questions";

import {
  useTeacher,
} from "@/hooks/useTeacher";

import {
  useLanguage,
} from "@/hooks/useLanguage";

import styles from "./AttemptGradingPage.module.css";

/* =========================================================
   Types
   ========================================================= */

type DevelopmentScores =
  Record<
    string,
    number
  >;

type ProcessingAction =
  | ""
  | "back"
  | "saving";

/* =========================================================
   Helpers
   ========================================================= */

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

function clampScore(
  value: number,
  maximum: number
) {
  return Math.max(
    0,
    Math.min(
      maximum,
      value
    )
  );
}

function getChoiceLetter(
  index: number
) {
  return String.fromCharCode(
    65 + index
  );
}

/* =========================================================
   Automatic question score
   ========================================================= */

function calculateQuestionAutomaticScore(
  question: Question,

  answer:
    AttemptAnswer | undefined
) {
  /* =====================================================
     Development
     ===================================================== */

  if (
    question.type ===
    "development"
  ) {
    return 0;
  }

  /* =====================================================
     QCM
     ===================================================== */

  if (
    question.type ===
    "qcm"
  ) {
    if (
      typeof answer
        ?.selectedChoiceIndex !==
      "number"
    ) {
      return 0;
    }

    return answer
      .selectedChoiceIndex ===
      question.correctChoiceIndex
      ? question.points
      : 0;
  }

  /* =====================================================
     Multiple choice
     ===================================================== */

  if (
    !Array.isArray(
      answer
        ?.selectedChoiceIndexes
    )
  ) {
    return 0;
  }

  const correctIndexes =
    [
      ...new Set(
        question
          .correctChoiceIndexes
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
        answer
          .selectedChoiceIndexes
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
    const index of
    selectedIndexes
  ) {
    if (
      correctSet.has(
        index
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

  return roundScore(
    Math.max(
      0,
      Math.min(
        question.points,
        earnedPoints -
          penalty
      )
    )
  );
}

/* =========================================================
   Page
   ========================================================= */

export default function AttemptGradingPage() {
  const router =
    useRouter();

  const params =
    useParams();

  const {
    t,
  } =
    useLanguage();

  const {
    teacher,
    loading:
      teacherLoading,
  } =
    useTeacher();

  const quizId =
    String(
      params.quizId ??
      ""
    ).trim();

  const attemptId =
    String(
      params.attemptId ??
      ""
    ).trim();

  /* =========================================================
     Data
     ========================================================= */

  const [
    quiz,
    setQuiz,
  ] =
    useState<Quiz | null>(
      null
    );

  const [
    attempt,
    setAttempt,
  ] =
    useState<Attempt | null>(
      null
    );

  const [
    questions,
    setQuestions,
  ] =
    useState<Question[]>(
      []
    );

  const [
    developmentScores,
    setDevelopmentScores,
  ] =
    useState<DevelopmentScores>(
      {}
    );

  /* =========================================================
     UI
     ========================================================= */

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    processing,
    setProcessing,
  ] =
    useState<ProcessingAction>(
      ""
    );

  const [
    message,
    setMessage,
  ] =
    useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] =
    useState("");

  /* =========================================================
     Load page
     ========================================================= */

  useEffect(() => {
    let cancelled =
      false;

    async function loadPage() {
      try {
        setLoading(
          true
        );

        setMessage(
          ""
        );

        setSuccessMessage(
          ""
        );

        const [
          quizData,
          attemptData,
          questionData,
        ] =
          await Promise.all([
            getQuiz(
              quizId
            ),

            getAttempt(
              attemptId
            ),

            getQuizQuestions(
              quizId
            ),
          ]);

        if (
          cancelled
        ) {
          return;
        }

        setQuiz(
          quizData
        );

        setAttempt(
          attemptData
        );

        setQuestions(
          questionData
        );

        /* ===================================================
           Existing manual development scores
           =================================================== */

        const loadedScores:
          DevelopmentScores =
          {};

        if (
          attemptData
        ) {
          const existingScores =
            attemptData
              .developmentScores ??
            {};

          for (
            const [
              questionId,
              score,
            ] of Object.entries(
              existingScores
            )
          ) {
            if (
              typeof score ===
                "number" &&
              Number.isFinite(
                score
              )
            ) {
              loadedScores[
                questionId
              ] =
                score;
            }
          }
        }

        setDevelopmentScores(
          loadedScores
        );
      } catch (error) {
        console.error(
          "Unable to load grading page:",
          error
        );

        if (
          !cancelled
        ) {
          setMessage(
            t(
              "attemptGrading.messages.loadError"
            )
          );
        }
      } finally {
        if (
          !cancelled
        ) {
          setLoading(
            false
          );
        }
      }
    }

    if (
      quizId &&
      attemptId
    ) {
      loadPage();
    } else {
      setLoading(
        false
      );

      setMessage(
        t(
          "attemptGrading.messages.loadError"
        )
      );
    }

    return () => {
      cancelled =
        true;
    };
  }, [
    quizId,
    attemptId,
    t,
  ]);

  /* =========================================================
     Frozen question order
     ========================================================= */

  const orderedQuestions =
    useMemo(() => {
      if (
        !attempt
      ) {
        return [];
      }

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

      return attempt
        .questionOrder
        .map(
          (
            questionId
          ) =>
            questionMap.get(
              questionId
            )
        )
        .filter(
          (
            question
          ): question is Question =>
            Boolean(
              question
            )
        );
    }, [
      attempt,
      questions,
    ]);

  /* =========================================================
     Development questions
     ========================================================= */

  const developmentQuestions =
    useMemo(
      () =>
        orderedQuestions.filter(
          (
            question
          ) =>
            question.type ===
            "development"
        ),
      [
        orderedQuestions,
      ]
    );

  /* =========================================================
     Automatic question scores
     ========================================================= */

  const automaticQuestionScores =
    useMemo(() => {
      const result:
        Record<
          string,
          number
        > = {};

      if (
        !attempt
      ) {
        return result;
      }

      for (
        const question of
        orderedQuestions
      ) {
        if (
          question.type ===
          "development"
        ) {
          continue;
        }

        result[
          question.id
        ] =
          calculateQuestionAutomaticScore(
            question,
            attempt.answers[
              question.id
            ]
          );
      }

      return result;
    }, [
      attempt,
      orderedQuestions,
    ]);

  /* =========================================================
     Automatic score
     ========================================================= */

  const calculatedAutomaticScore =
    useMemo(() => {
      return roundScore(
        Object.values(
          automaticQuestionScores
        ).reduce(
          (
            total,
            score
          ) =>
            total +
            score,
          0
        )
      );
    }, [
      automaticQuestionScores,
    ]);

  /* =========================================================
     Manual score
     ========================================================= */

  const calculatedManualScore =
    useMemo(() => {
      return roundScore(
        developmentQuestions.reduce(
          (
            total,
            question
          ) => {
            const score =
              developmentScores[
                question.id
              ] ??
              0;

            return (
              total +
              clampScore(
                score,
                question.points
              )
            );
          },
          0
        )
      );
    }, [
      developmentQuestions,
      developmentScores,
    ]);

  /* =========================================================
     Final score
     ========================================================= */

  const calculatedFinalScore =
    useMemo(() => {
      if (
        !quiz
      ) {
        return 0;
      }

      return roundScore(
        Math.min(
          quiz.totalPoints,

          calculatedAutomaticScore +
            calculatedManualScore
        )
      );
    }, [
      quiz,
      calculatedAutomaticScore,
      calculatedManualScore,
    ]);

  /* =========================================================
     Percentage
     ========================================================= */

  const percentage =
    useMemo(() => {
      if (
        !quiz ||
        quiz.totalPoints <=
          0
      ) {
        return 0;
      }

      return Math.round(
        (
          calculatedFinalScore /
          quiz.totalPoints
        ) *
          100
      );
    }, [
      quiz,
      calculatedFinalScore,
    ]);

  /* =========================================================
     Grading permission
     ========================================================= */

  const canEditGrading =
    Boolean(
      attempt &&
      (
        attempt.status ===
          "submitted" ||
        attempt.status ===
          "graded"
      )
    );

  /* =========================================================
     Student initials
     ========================================================= */

  const studentInitials =
    useMemo(() => {
      if (
        !attempt
      ) {
        return "S";
      }

      const words =
        attempt.studentName
          .trim()
          .split(/\s+/)
          .filter(Boolean);

      if (
        words.length ===
        0
      ) {
        return "S";
      }

      if (
        words.length ===
        1
      ) {
        return words[0]
          .charAt(0)
          .toUpperCase();
      }

      return (
        words[0]
          .charAt(0) +
        words[
          words.length -
          1
        ].charAt(0)
      ).toUpperCase();
    }, [
      attempt,
    ]);

  /* =========================================================
     Loading
     ========================================================= */

  if (
    teacherLoading ||
    loading
  ) {
    return (
      <AppLoading
        title={t(
          "attemptGrading.loading.title"
        )}
        subtitle={t(
          "attemptGrading.loading.subtitle"
        )}
      />
    );
  }

  if (
    processing ===
    "back"
  ) {
    return (
      <AppLoading
        title="ULearn"
        subtitle={t(
          "attemptGrading.loading.returning"
        )}
      />
    );
  }

  if (
    processing ===
    "saving"
  ) {
    return (
      <AppLoading
        title={t(
          "attemptGrading.loading.savingTitle"
        )}
        subtitle={t(
          "attemptGrading.loading.savingSubtitle"
        )}
      />
    );
  }

  /* =========================================================
     Access
     ========================================================= */

  const accessAllowed =
    Boolean(
      teacher &&
      quiz &&
      attempt &&
      quiz.teacherId ===
        teacher.id &&
      attempt.teacherId ===
        teacher.id &&
      attempt.quizId ===
        quiz.id
    );

  if (
    !accessAllowed ||
    !teacher ||
    !quiz ||
    !attempt
  ) {
    return (
      <main
        className={
          styles.page
        }
      >
        <section
          className={`${styles.card} ${styles.accessCard}`}
        >
          <span
            className={
              styles.badge
            }
          >
            ULearn
          </span>

          <div
            className={
              styles.accessIcon
            }
            aria-hidden="true"
          >
            !
          </div>

          <h1>
            {t(
              "attemptGrading.access.title"
            )}
          </h1>

          <p>
            {message ||
              t(
                "attemptGrading.access.text"
              )}
          </p>

          <button
            type="button"
            className="app-button app-button-secondary"
            onClick={() => {
              router.push(
                `/quiz/${quizId}/students`
              );
            }}
          >
            ←{" "}
            {t(
              "attemptGrading.actions.backStudents"
            )}
          </button>
        </section>
      </main>
    );
  }

  /* =========================================================
     Status
     ========================================================= */

  function getStatusLabel() {
    if (
      attempt.status ===
      "graded"
    ) {
      return t(
        "attemptGrading.status.graded"
      );
    }

    if (
      attempt.status ===
      "submitted"
    ) {
      return t(
        "attemptGrading.status.submitted"
      );
    }

    return t(
      "attemptGrading.status.inProgress"
    );
  }

  /* =========================================================
     Development score change
     ========================================================= */

  function handleDevelopmentScoreChange(
    question: Question,

    event:
      ChangeEvent<HTMLInputElement>
  ) {
    if (
      question.type !==
      "development" ||
      !canEditGrading
    ) {
      return;
    }

    setMessage(
      ""
    );

    setSuccessMessage(
      ""
    );

    const raw =
      event.target.value;

    if (
      raw ===
      ""
    ) {
      setDevelopmentScores(
        (
          previous
        ) => ({
          ...previous,

          [question.id]:
            0,
        })
      );

      return;
    }

    const parsed =
      Number(
        raw
      );

    if (
      !Number.isFinite(
        parsed
      )
    ) {
      return;
    }

    setDevelopmentScores(
      (
        previous
      ) => ({
        ...previous,

        [question.id]:
          roundScore(
            clampScore(
              parsed,
              question.points
            )
          ),
      })
    );
  }

  /* =========================================================
     Validate development scores
     ========================================================= */

  function validateDevelopmentScores() {
    for (
      const question of
      developmentQuestions
    ) {
      const score =
        developmentScores[
          question.id
        ];

      if (
        typeof score !==
          "number" ||
        !Number.isFinite(
          score
        )
      ) {
        return false;
      }

      if (
        score <
          0 ||
        score >
          question.points
      ) {
        return false;
      }
    }

    return true;
  }

  /* =========================================================
     Save grading
     ========================================================= */

  async function handleSaveGrading() {
    if (
      processing ||
      !canEditGrading
    ) {
      return;
    }

    setMessage(
      ""
    );

    setSuccessMessage(
      ""
    );

    if (
      !validateDevelopmentScores()
    ) {
      setMessage(
        t(
          "attemptGrading.messages.invalidDevelopmentScore"
        )
      );

      return;
    }

    setProcessing(
      "saving"
    );

    try {
      const normalizedScores:
        DevelopmentScores =
        {};

      for (
        const question of
        developmentQuestions
      ) {
        normalizedScores[
          question.id
        ] =
          roundScore(
            clampScore(
              developmentScores[
                question.id
              ] ??
                0,

              question.points
            )
          );
      }

      const result =
        await gradeAttempt({
          attemptId:
            attempt.id,

          teacherId:
            teacher.id,

          developmentScores:
            normalizedScores,
        });

      if (
        !result.success ||
        !result.attempt
      ) {
        setMessage(
          result.messageKey
            ? t(
                result.messageKey
              )
            : t(
                "attemptGrading.messages.saveError"
              )
        );

        return;
      }

      setAttempt(
        result.attempt
      );

      setDevelopmentScores(
        result.attempt
          .developmentScores ??
          normalizedScores
      );

      setSuccessMessage(
        t(
          "attemptGrading.messages.saved"
        )
      );
    } catch (error) {
      console.error(
        "Unable to save attempt grading:",
        error
      );

      setMessage(
        t(
          "attemptGrading.messages.saveError"
        )
      );
    } finally {
      setProcessing(
        ""
      );
    }
  }

  /* =========================================================
     Back
     ========================================================= */

  function handleBack() {
    if (
      processing
    ) {
      return;
    }

    setProcessing(
      "back"
    );

    router.push(
      `/quiz/${quiz.id}/students`
    );
  }

  /* =========================================================
     UI
     ========================================================= */

  return (
    <main
      className={
        styles.page
      }
    >
      <section
        className={
          styles.card
        }
      >
        {/* =================================================
            Top bar
            ================================================= */}

        <div
          className={
            styles.topBar
          }
        >
          <button
            type="button"
            className="app-button app-button-secondary"
            onClick={
              handleBack
            }
          >
            ←{" "}
            {t(
              "attemptGrading.actions.backStudents"
            )}
          </button>

          <span
            className={
              styles.statusBadge
            }
          >
            {getStatusLabel()}
          </span>
        </div>

        {/* =================================================
            Header
            ================================================= */}

        <header
          className={
            styles.header
          }
        >
          <div>
            <span
              className={
                styles.badge
              }
            >
              {t(
                "attemptGrading.badge"
              )}
            </span>

            <h1>
              {t(
                "attemptGrading.title"
              )}
            </h1>

            <p>
              {
                quiz.title
              }
            </p>
          </div>
        </header>

        {/* =================================================
            Student
            ================================================= */}

        <section
          className={
            styles.studentCard
          }
        >
          <div
            className={
              styles.studentAvatar
            }
            aria-hidden="true"
          >
            {
              studentInitials
            }
          </div>

          <div
            className={
              styles.studentInfo
            }
          >
            <span>
              {t(
                "attemptGrading.student.label"
              )}
            </span>

            <strong>
              {
                attempt.studentName
              }
            </strong>

            <small>
              {
                attempt.studentEmail
              }
            </small>
          </div>
        </section>

        {/* =================================================
            Summary
            ================================================= */}

        <section
          className={
            styles.summary
          }
        >
          <article>
            <span>
              {t(
                "attemptGrading.summary.status"
              )}
            </span>

            <strong>
              {getStatusLabel()}
            </strong>
          </article>

          <article>
            <span>
              {t(
                "attemptGrading.summary.automaticScore"
              )}
            </span>

            <strong>
              {
                calculatedAutomaticScore
              }
              {" / "}
              {
                quiz.totalPoints
              }
            </strong>
          </article>

          <article>
            <span>
              {t(
                "attemptGrading.summary.manualScore"
              )}
            </span>

            <strong>
              {
                calculatedManualScore
              }
            </strong>
          </article>

          <article>
            <span>
              {t(
                "attemptGrading.summary.finalScore"
              )}
            </span>

            <strong>
              {
                calculatedFinalScore
              }
              {" / "}
              {
                quiz.totalPoints
              }
            </strong>
          </article>

          <article>
            <span>
              {t(
                "attemptGrading.summary.percentage"
              )}
            </span>

            <strong>
              {
                percentage
              }
              %
            </strong>
          </article>

          <article>
            <span>
              {t(
                "attemptGrading.summary.questions"
              )}
            </span>

            <strong>
              {
                orderedQuestions.length
              }
            </strong>
          </article>
        </section>

        {/* =================================================
            Attempt not submitted
            ================================================= */}

        {!canEditGrading && (
          <p
            className={
              styles.warningMessage
            }
          >
            {t(
              "attemptGrading.messages.notSubmitted"
            )}
          </p>
        )}

        {/* =================================================
            Questions
            ================================================= */}

        <section
          className={
            styles.questionsSection
          }
        >
          <div
            className={
              styles.sectionHeading
            }
          >
            <h2>
              {t(
                "attemptGrading.questions.title"
              )}
            </h2>

            <p>
              {t(
                "attemptGrading.questions.description"
              )}
            </p>
          </div>

          <div
            className={
              styles.questionList
            }
          >
            {orderedQuestions.map(
              (
                question,
                index
              ) => {
                const answer =
                  attempt.answers[
                    question.id
                  ];

                const automaticScore =
                  automaticQuestionScores[
                    question.id
                  ] ??
                  0;

                /* =========================================
                   Development
                   ========================================= */

                if (
                  question.type ===
                  "development"
                ) {
                  const studentAnswer =
                    answer
                      ?.developmentAnswer
                      ?.trim() ||
                    "";

                  return (
                    <article
                      key={
                        question.id
                      }
                      className={
                        styles.questionCard
                      }
                    >
                      <div
                        className={
                          styles.questionHeader
                        }
                      >
                        <div>
                          <span
                            className={
                              styles.questionNumber
                            }
                          >
                            {t(
                              "attemptGrading.questions.question"
                            )}{" "}
                            {
                              index +
                              1
                            }
                          </span>

                          <h3>
                            {
                              question.text
                            }
                          </h3>
                        </div>

                        <span
                          className={
                            styles.questionPoints
                          }
                        >
                          {
                            developmentScores[
                              question.id
                            ] ??
                            0
                          }
                          {" / "}
                          {
                            question.points
                          }
                        </span>
                      </div>

                      <span
                        className={
                          styles.typeBadge
                        }
                      >
                        {t(
                          "attemptGrading.questions.types.development"
                        )}
                      </span>

                      <div
                        className={
                          styles.answerBlock
                        }
                      >
                        <span>
                          {t(
                            "attemptGrading.questions.studentAnswer"
                          )}
                        </span>

                        {studentAnswer ? (
                          <p
                            className={
                              styles.developmentAnswer
                            }
                          >
                            {
                              studentAnswer
                            }
                          </p>
                        ) : (
                          <p
                            className={
                              styles.noAnswer
                            }
                          >
                            {t(
                              "attemptGrading.questions.noAnswer"
                            )}
                          </p>
                        )}
                      </div>

                      <div
                        className={
                          styles.gradingBox
                        }
                      >
                        <div>
                          <label
                            htmlFor={`grade-${question.id}`}
                          >
                            {t(
                              "attemptGrading.questions.manualGrade"
                            )}
                          </label>

                          <small>
                            {t(
                              "attemptGrading.questions.maximum"
                            )}{" "}
                            {
                              question.points
                            }
                          </small>
                        </div>

                        <div
                          className={
                            styles.gradeInputRow
                          }
                        >
                          <input
                            id={`grade-${question.id}`}
                            type="number"
                            min={
                              0
                            }
                            max={
                              question.points
                            }
                            step="0.01"
                            value={
                              developmentScores[
                                question.id
                              ] ??
                              0
                            }
                            disabled={
                              !canEditGrading
                            }
                            onChange={(
                              event
                            ) =>
                              handleDevelopmentScoreChange(
                                question,
                                event
                              )
                            }
                          />

                          <span>
                            /{" "}
                            {
                              question.points
                            }
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                }

                /* =========================================
                   QCM / Multiple choice
                   ========================================= */

                const selectedIndexes =
                  question.type ===
                  "qcm"
                    ? typeof answer
                        ?.selectedChoiceIndex ===
                      "number"
                      ? [
                          answer
                            .selectedChoiceIndex,
                        ]
                      : []
                    : Array.isArray(
                          answer
                            ?.selectedChoiceIndexes
                        )
                      ? answer
                          .selectedChoiceIndexes
                      : [];

                const correctIndexes =
                  question.type ===
                  "qcm"
                    ? [
                        question
                          .correctChoiceIndex,
                      ]
                    : question
                        .correctChoiceIndexes;

                return (
                  <article
                    key={
                      question.id
                    }
                    className={
                      styles.questionCard
                    }
                  >
                    <div
                      className={
                        styles.questionHeader
                      }
                    >
                      <div>
                        <span
                          className={
                            styles.questionNumber
                          }
                        >
                          {t(
                            "attemptGrading.questions.question"
                          )}{" "}
                          {
                            index +
                            1
                          }
                        </span>

                        <h3>
                          {
                            question.text
                          }
                        </h3>
                      </div>

                      <span
                        className={
                          styles.questionPoints
                        }
                      >
                        {
                          automaticScore
                        }
                        {" / "}
                        {
                          question.points
                        }
                      </span>
                    </div>

                    <span
                      className={
                        styles.typeBadge
                      }
                    >
                      {question.type ===
                      "qcm"
                        ? t(
                            "attemptGrading.questions.types.qcm"
                          )
                        : t(
                            "attemptGrading.questions.types.multipleChoice"
                          )}
                    </span>

                    <div
                      className={
                        styles.choiceList
                      }
                    >
                      {question.choices.map(
                        (
                          choice,
                          choiceIndex
                        ) => {
                          const selected =
                            selectedIndexes.includes(
                              choiceIndex
                            );

                          const correct =
                            correctIndexes.includes(
                              choiceIndex
                            );

                          return (
                            <div
                              key={
                                choiceIndex
                              }
                              className={`${styles.choiceItem} ${
                                correct
                                  ? styles.choiceCorrect
                                  : ""
                              } ${
                                selected
                                  ? styles.choiceSelected
                                  : ""
                              }`}
                            >
                              <span
                                className={
                                  styles.choiceLetter
                                }
                              >
                                {getChoiceLetter(
                                  choiceIndex
                                )}
                              </span>

                              <span
                                className={
                                  styles.choiceText
                                }
                              >
                                {
                                  choice
                                }
                              </span>

                              <div
                                className={
                                  styles.choiceLabels
                                }
                              >
                                {selected && (
                                  <span>
                                    {t(
                                      "attemptGrading.questions.selected"
                                    )}
                                  </span>
                                )}

                                {correct && (
                                  <strong>
                                    {t(
                                      "attemptGrading.questions.correct"
                                    )}
                                  </strong>
                                )}
                              </div>
                            </div>
                          );
                        }
                      )}
                    </div>

                    {selectedIndexes.length ===
                      0 && (
                      <p
                        className={
                          styles.noAnswer
                        }
                      >
                        {t(
                          "attemptGrading.questions.noAnswer"
                        )}
                      </p>
                    )}

                    <div
                      className={
                        styles.automaticResult
                      }
                    >
                      <span>
                        {t(
                          "attemptGrading.questions.automaticGrade"
                        )}
                      </span>

                      <strong>
                        {
                          automaticScore
                        }
                        {" / "}
                        {
                          question.points
                        }
                      </strong>
                    </div>
                  </article>
                );
              }
            )}
          </div>
        </section>

        {/* =================================================
            Messages
            ================================================= */}

        {message && (
          <p
            className={
              styles.errorMessage
            }
            role="alert"
          >
            {
              message
            }
          </p>
        )}

        {successMessage && (
          <p
            className={
              styles.successMessage
            }
            role="status"
          >
            {
              successMessage
            }
          </p>
        )}

        {/* =================================================
            Final score
            ================================================= */}

        <section
          className={
            styles.finalSection
          }
        >
          <div
            className={
              styles.finalScoreBlock
            }
          >
            <span>
              {t(
                "attemptGrading.final.title"
              )}
            </span>

            <strong>
              {
                calculatedFinalScore
              }
              {" / "}
              {
                quiz.totalPoints
              }
            </strong>

            <small>
              {
                percentage
              }
              %
            </small>
          </div>

          <div
            className={
              styles.finalBreakdown
            }
          >
            <div>
              <span>
                {t(
                  "attemptGrading.summary.automaticScore"
                )}
              </span>

              <strong>
                {
                  calculatedAutomaticScore
                }
              </strong>
            </div>

            <div>
              <span>
                {t(
                  "attemptGrading.summary.manualScore"
                )}
              </span>

              <strong>
                {
                  calculatedManualScore
                }
              </strong>
            </div>
          </div>
        </section>

        {/* =================================================
            Actions
            ================================================= */}

        <footer
          className={
            styles.actions
          }
        >
          <button
            type="button"
            className="app-button app-button-secondary"
            onClick={
              handleBack
            }
          >
            ←{" "}
            {t(
              "attemptGrading.actions.backStudents"
            )}
          </button>

          {developmentQuestions.length >
            0 && (
            <button
              type="button"
              className="app-button app-button-action"
              disabled={
                !canEditGrading
              }
              onClick={
                handleSaveGrading
              }
            >
              {attempt.status ===
              "graded"
                ? t(
                    "attemptGrading.actions.updateGrade"
                  )
                : t(
                    "attemptGrading.actions.finalizeGrade"
                  )}
            </button>
          )}
        </footer>
      </section>
    </main>
  );
}