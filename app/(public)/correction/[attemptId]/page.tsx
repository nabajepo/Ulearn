"use client";

/**
 * ============================================================================
 * ULearn - Student Correction Page
 * ============================================================================
 *
 * Public page allowing a student to review a completed quiz attempt.
 *
 * Rules:
 *
 * • in_progress:
 *   Correction is unavailable.
 *
 * • submitted:
 *   The student is waiting for teacher grading.
 *
 * • graded:
 *   The correction page becomes available.
 *
 * • showResultsToStudents:
 *   Controls whether the student can see the final score.
 *
 * • showCorrectAnswers:
 *   Controls whether correct answers are revealed.
 *
 * The student can always see:
 * • their own answers
 * • question text
 * • question type
 *
 * after the attempt has been graded.
 * ============================================================================
 */

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useParams,
  useRouter,
} from "next/navigation";

import AppLoading from "@/components/AppLoading";
import HelpSupport from "@/components/HelpSupport";

import {
  getAttempt,
  type Attempt,
  type AttemptAnswer,
} from "@/lib/services/attempts";

import {
  getQuiz,
  type Quiz,
} from "@/lib/services/quizzes";

import {
  getQuizQuestions,
  type Question,
} from "@/lib/services/questions";

import {
  useLanguage,
} from "@/hooks/useLanguage";

import styles from "./CorrectionPage.module.css";

/* =========================================================
   Types
   ========================================================= */

type DevelopmentScores =
  Record<
    string,
    number
  >;

type AttemptWithDevelopmentScores =
  Attempt & {
    developmentScores?:
      DevelopmentScores;
  };

type ProcessingAction =
  | ""
  | "back"
  | "feedback";

/* =========================================================
   Helpers
   ========================================================= */

function getChoiceLetter(
  index: number
) {
  return String.fromCharCode(
    65 + index
  );
}

function getStudentInitials(
  name: string
) {
  const words =
    name
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
      words.length - 1
    ].charAt(0)
  ).toUpperCase();
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

/* =========================================================
   Automatic score by question
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

  let correctSelected =
    0;

  let incorrectSelected =
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
      correctSelected +=
        1;
    } else {
      incorrectSelected +=
        1;
    }
  }

  const pointsPerCorrectAnswer =
    question.points /
    correctIndexes.length;

  const earned =
    correctSelected *
    pointsPerCorrectAnswer;

  const penalty =
    incorrectSelected *
    pointsPerCorrectAnswer;

  return roundScore(
    Math.max(
      0,
      Math.min(
        question.points,
        earned -
          penalty
      )
    )
  );
}

/* =========================================================
   Page
   ========================================================= */

export default function CorrectionPage() {
  const params =
    useParams();

  const router =
    useRouter();

  const {
    t,
  } =
    useLanguage();

  const attemptId =
    String(
      params.attemptId ??
      ""
    ).trim();

  /* =========================================================
     Data
     ========================================================= */

  const [
    attempt,
    setAttempt,
  ] =
    useState<AttemptWithDevelopmentScores | null>(
      null
    );

  const [
    quiz,
    setQuiz,
  ] =
    useState<Quiz | null>(
      null
    );

  const [
    questions,
    setQuestions,
  ] =
    useState<Question[]>(
      []
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
    message,
    setMessage,
  ] =
    useState("");

  const [
    processing,
    setProcessing,
  ] =
    useState<ProcessingAction>(
      ""
    );

  /* =========================================================
     Load attempt + quiz + questions
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

        if (
          !attemptId
        ) {
          setMessage(
            t(
              "correction.messages.invalidAttempt"
            )
          );

          return;
        }

        const attemptData =
          await getAttempt(
            attemptId
          );

        if (
          cancelled
        ) {
          return;
        }

        if (
          !attemptData
        ) {
          setMessage(
            t(
              "correction.messages.attemptNotFound"
            )
          );

          return;
        }

        const [
          quizData,
          questionsData,
        ] =
          await Promise.all([
            getQuiz(
              attemptData.quizId
            ),

            getQuizQuestions(
              attemptData.quizId
            ),
          ]);

        if (
          cancelled
        ) {
          return;
        }

        if (
          !quizData
        ) {
          setMessage(
            t(
              "correction.messages.quizNotFound"
            )
          );

          return;
        }

        if (
          attemptData.quizId !==
            quizData.id ||
          attemptData.teacherId !==
            quizData.teacherId
        ) {
          setMessage(
            t(
              "correction.messages.invalidAttempt"
            )
          );

          return;
        }

        setAttempt(
          attemptData as AttemptWithDevelopmentScores
        );

        setQuiz(
          quizData
        );

        setQuestions(
          questionsData
        );
      } catch (error) {
        console.error(
          "Unable to load student correction:",
          error
        );

        if (
          !cancelled
        ) {
          setMessage(
            t(
              "correction.messages.loadError"
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

    loadPage();

    return () => {
      cancelled =
        true;
    };
  }, [
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
     Student initials
     ========================================================= */

  const studentInitials =
    useMemo(() => {
      if (
        !attempt
      ) {
        return "S";
      }

      return getStudentInitials(
        attempt.studentName
      );
    }, [
      attempt,
    ]);

  /* =========================================================
     Percentage
     ========================================================= */

  const percentage =
    useMemo(() => {
      if (
        !quiz ||
        !attempt ||
        attempt.finalScore ===
          null ||
        quiz.totalPoints <=
          0
      ) {
        return null;
      }

      return Math.round(
        (
          attempt.finalScore /
          quiz.totalPoints
        ) *
          100
      );
    }, [
      quiz,
      attempt,
    ]);

  /* =========================================================
     Loading
     ========================================================= */

  if (
    loading
  ) {
    return (
      <>
        <AppLoading
          title={t(
            "correction.loading.title"
          )}
          subtitle={t(
            "correction.loading.subtitle"
          )}
        />

        <HelpSupport
          context="anonymous"
        />
      </>
    );
  }

  /* =========================================================
     Navigation loading
     ========================================================= */

  if (
    processing
  ) {
    return (
      <>
        <AppLoading
          title="ULearn"
          subtitle={
            processing ===
            "feedback"
              ? t(
                  "correction.loading.feedback"
                )
              : t(
                  "correction.loading.returning"
                )
          }
        />

        <HelpSupport
          context={
            attempt
              ? "student"
              : "anonymous"
          }
          studentIdentity={
            attempt
              ? {
                  name:
                    attempt.studentName,

                  email:
                    attempt.studentEmail,

                  attemptId:
                    attempt.id,

                  quizId:
                    attempt.quizId,
                }
              : null
          }
        />
      </>
    );
  }

  /* =========================================================
     Error
     ========================================================= */

  if (
    message ||
    !attempt ||
    !quiz
  ) {
    return (
      <>
        <main
          className={
            styles.page
          }
        >
          <section
            className={`${styles.card} ${styles.stateCard}`}
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
                styles.stateIcon
              }
              aria-hidden="true"
            >
              !
            </div>

            <h1>
              {t(
                "correction.error.title"
              )}
            </h1>

            <p>
              {message ||
                t(
                  "correction.messages.loadError"
                )}
            </p>

            <button
              type="button"
              className="app-button app-button-secondary app-button-action"
              onClick={() =>
                router.push(
                  "/"
                )
              }
            >
              {t(
                "correction.actions.home"
              )}
            </button>
          </section>
        </main>

        <HelpSupport
          context="anonymous"
        />
      </>
    );
  }

  /* =========================================================
     Attempt still running
     ========================================================= */

  if (
    attempt.status ===
    "in_progress"
  ) {
    return (
      <>
        <main
          className={
            styles.page
          }
        >
          <section
            className={`${styles.card} ${styles.stateCard}`}
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
                styles.stateIcon
              }
              aria-hidden="true"
            >
              …
            </div>

            <h1>
              {t(
                "correction.inProgress.title"
              )}
            </h1>

            <p>
              {t(
                "correction.inProgress.text"
              )}
            </p>

            <button
              type="button"
              className="app-button app-button-action"
              onClick={() => {
                router.push(
                  `/quiz-session/${attempt.id}`
                );
              }}
            >
              {t(
                "correction.actions.returnQuiz"
              )}
            </button>
          </section>
        </main>

        <HelpSupport
          context="student"
          studentIdentity={{
            name:
              attempt.studentName,

            email:
              attempt.studentEmail,

            attemptId:
              attempt.id,

            quizId:
              attempt.quizId,
          }}
        />
      </>
    );
  }

  /* =========================================================
     Waiting for teacher correction
     ========================================================= */

  if (
    attempt.status ===
    "submitted"
  ) {
    return (
      <>
        <main
          className={
            styles.page
          }
        >
          <section
            className={`${styles.card} ${styles.stateCard}`}
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
                styles.stateIcon
              }
              aria-hidden="true"
            >
              ⏳
            </div>

            <h1>
              {t(
                "correction.waiting.title"
              )}
            </h1>

            <p>
              {t(
                "correction.waiting.text"
              )}
            </p>

            <div
              className={
                styles.waitingStudent
              }
            >
              <div
                className={
                  styles.studentAvatar
                }
              >
                {
                  studentInitials
                }
              </div>

              <div>
                <strong>
                  {
                    attempt.studentName
                  }
                </strong>

                <span>
                  {
                    attempt.studentEmail
                  }
                </span>
              </div>
            </div>
          </section>
        </main>

        <HelpSupport
          context="student"
          studentIdentity={{
            name:
              attempt.studentName,

            email:
              attempt.studentEmail,

            attemptId:
              attempt.id,

            quizId:
              attempt.quizId,
          }}
        />
      </>
    );
  }

  /* =========================================================
     Navigation
     ========================================================= */

  function handleBackToResult() {
    if (
      processing
    ) {
      return;
    }

    setProcessing(
      "back"
    );

    router.push(
      `/quiz-session/${attempt.id}`
    );
  }

  function handleFeedback() {
    if (
      processing
    ) {
      return;
    }

    setProcessing(
      "feedback"
    );

    router.push(
      `/feedback/${attempt.id}`
    );
  }

  /* =========================================================
     Student options
     ========================================================= */

  const showScore =
    attempt.showResultsToStudents;

  const showCorrectAnswers =
    attempt.showCorrectAnswers;

  /* =========================================================
     UI
     ========================================================= */

  return (
    <>
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
              Top
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
                handleBackToResult
              }
            >
              ←{" "}
              {t(
                "correction.actions.backResult"
              )}
            </button>

            <span
              className={
                styles.statusBadge
              }
            >
              {t(
                "correction.status.graded"
              )}
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
            <span
              className={
                styles.badge
              }
            >
              {t(
                "correction.badge"
              )}
            </span>

            <h1>
              {t(
                "correction.title"
              )}
            </h1>

            <p>
              {
                quiz.title
              }
            </p>
          </header>

          {/* =================================================
              Student identity
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
                  "correction.student.label"
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
                  "correction.summary.questions"
                )}
              </span>

              <strong>
                {
                  orderedQuestions.length
                }
              </strong>
            </article>

            <article>
              <span>
                {t(
                  "correction.summary.status"
                )}
              </span>

              <strong>
                {t(
                  "correction.status.graded"
                )}
              </strong>
            </article>

            {showScore &&
              attempt.finalScore !==
                null && (
                <>
                  <article>
                    <span>
                      {t(
                        "correction.summary.score"
                      )}
                    </span>

                    <strong>
                      {
                        attempt.finalScore
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
                        "correction.summary.percentage"
                      )}
                    </span>

                    <strong>
                      {
                        percentage ??
                        0
                      }
                      %
                    </strong>
                  </article>
                </>
              )}
          </section>

          {/* =================================================
              Hidden score notice
              ================================================= */}

          {!showScore && (
            <div
              className={
                styles.infoMessage
              }
            >
              <strong>
                {t(
                  "correction.scoreHidden.title"
                )}
              </strong>

              <p>
                {t(
                  "correction.scoreHidden.text"
                )}
              </p>
            </div>
          )}

          {/* =================================================
              Hidden correct answers notice
              ================================================= */}

          {!showCorrectAnswers && (
            <div
              className={
                styles.infoMessage
              }
            >
              <strong>
                {t(
                  "correction.answersHidden.title"
                )}
              </strong>

              <p>
                {t(
                  "correction.answersHidden.text"
                )}
              </p>
            </div>
          )}

          {/* =================================================
              Questions header
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
              <span
                className={
                  styles.sectionBadge
                }
              >
                {t(
                  "correction.questions.badge"
                )}
              </span>

              <h2>
                {t(
                  "correction.questions.title"
                )}
              </h2>

              <p>
                {t(
                  "correction.questions.description"
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
                  questionIndex
                ) => {
                  const answer =
                    attempt.answers[
                      question.id
                    ];

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

                    const awardedScore =
                      attempt
                        .developmentScores
                        ?.[
                          question.id
                        ] ??
                      0;

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
                                "correction.questions.question"
                              )}{" "}
                              {
                                questionIndex +
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
                              styles.pointsBadge
                            }
                          >
                            {
                              question.points
                            }{" "}
                            {t(
                              question.points ===
                                1
                                ? "correction.questions.point"
                                : "correction.questions.points"
                            )}
                          </span>
                        </div>

                        <span
                          className={
                            styles.typeBadge
                          }
                        >
                          {t(
                            "correction.questions.types.development"
                          )}
                        </span>

                        <div
                          className={
                            styles.answerBlock
                          }
                        >
                          <span>
                            {t(
                              "correction.questions.yourAnswer"
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
                                "correction.questions.noAnswer"
                              )}
                            </p>
                          )}
                        </div>

                        {showScore && (
                          <div
                            className={
                              styles.questionResult
                            }
                          >
                            <span>
                              {t(
                                "correction.questions.pointsReceived"
                              )}
                            </span>

                            <strong>
                              {
                                awardedScore
                              }
                              {" / "}
                              {
                                question.points
                              }
                            </strong>
                          </div>
                        )}
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

                  const automaticScore =
                    calculateQuestionAutomaticScore(
                      question,
                      answer
                    );

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
                              "correction.questions.question"
                            )}{" "}
                            {
                              questionIndex +
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
                            styles.pointsBadge
                          }
                        >
                          {
                            question.points
                          }{" "}
                          {t(
                            question.points ===
                              1
                              ? "correction.questions.point"
                              : "correction.questions.points"
                          )}
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
                              "correction.questions.types.qcm"
                            )
                          : t(
                              "correction.questions.types.multipleChoice"
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

                            /*
                             * Correct-answer styling is only
                             * enabled when the teacher allowed it.
                             */
                            const revealCorrect =
                              showCorrectAnswers &&
                              correct;

                            return (
                              <div
                                key={
                                  choiceIndex
                                }
                                className={`${styles.choiceItem} ${
                                  selected
                                    ? styles.choiceSelected
                                    : ""
                                } ${
                                  revealCorrect
                                    ? styles.choiceCorrect
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
                                    <span
                                      className={
                                        styles.selectedLabel
                                      }
                                    >
                                      {t(
                                        "correction.questions.yourChoice"
                                      )}
                                    </span>
                                  )}

                                  {revealCorrect && (
                                    <strong
                                      className={
                                        styles.correctLabel
                                      }
                                    >
                                      {t(
                                        "correction.questions.correct"
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
                            "correction.questions.noAnswer"
                          )}
                        </p>
                      )}

                      {showScore && (
                        <div
                          className={
                            styles.questionResult
                          }
                        >
                          <span>
                            {t(
                              "correction.questions.pointsReceived"
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
                      )}
                    </article>
                  );
                }
              )}
            </div>
          </section>

          {/* =================================================
              Final result
              ================================================= */}

          {showScore &&
            attempt.finalScore !==
              null && (
              <section
                className={
                  styles.finalSection
                }
              >
                <div>
                  <span>
                    {t(
                      "correction.final.label"
                    )}
                  </span>

                  <strong>
                    {
                      attempt.finalScore
                    }
                    {" / "}
                    {
                      quiz.totalPoints
                    }
                  </strong>

                  <small>
                    {
                      percentage ??
                      0
                    }
                    %
                  </small>
                </div>
              </section>
            )}

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
              className="app-button app-button-secondary app-button-action"
              onClick={
                handleBackToResult
              }
            >
              ←{" "}
              {t(
                "correction.actions.backResult"
              )}
            </button>

            <button
              type="button"
              className="app-button app-button-action"
              onClick={
                handleFeedback
              }
            >
              {t(
                "correction.actions.feedback"
              )}
            </button>
          </footer>
        </section>
      </main>

      <HelpSupport
        context="student"
        studentIdentity={{
          name:
            attempt.studentName,

          email:
            attempt.studentEmail,

          attemptId:
            attempt.id,

          quizId:
            attempt.quizId,
        }}
      />
    </>
  );
}