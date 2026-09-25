"use client";

/**
 * ============================================================================
 * ULearn - Attempt Grading Page
 * ============================================================================
 *
 * Protected teacher page used to inspect and grade one student attempt.
 *
 * Search added:
 * • Search by question text or displayed question number.
 * • Filter by All / Development / QCM / Multiple choice.
 * • Search/filter only changes what is displayed; grading calculations still
 *   use the complete frozen question order.
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

import {
  pdf,
} from "@react-pdf/renderer";

import AppLoading from "@/components/AppLoading";

import AttemptCorrectionPdf, {
  type PdfLanguage,
} from "@/components/AttemptCorrectionPdf";

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
  Record<string, number>;

type ProcessingAction =
  | ""
  | "back"
  | "saving"
  | "pdf";

type QuestionFilter =
  | "all"
  | "development"
  | "qcm"
  | "multiple_choice";

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
   PDF helpers
   ========================================================= */

function sanitizeFileName(
  value: string
) {
  const sanitized =
    value
      .normalize(
        "NFD"
      )
      .replace(
        /[\u0300-\u036f]/g,
        ""
      )
      .replace(
        /[^a-zA-Z0-9-_ ]/g,
        ""
      )
      .trim()
      .replace(
        /\s+/g,
        "-"
      );

  return (
    sanitized ||
    "document"
  );
}

function getPdfLanguage(
  language: string
): PdfLanguage {
  if (
    language ===
    "fr"
  ) {
    return "fr";
  }

  if (
    language ===
    "rn"
  ) {
    return "rn";
  }

  return "en";
}

/* =========================================================
   Automatic question score
   ========================================================= */

function calculateQuestionAutomaticScore(
  question: Question,
  answer:
    AttemptAnswer | undefined
) {
  if (
    question.type ===
    "development"
  ) {
    return 0;
  }

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
    language,
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

  const [
    questionSearch,
    setQuestionSearch,
  ] =
    useState("");

  const [
    questionFilter,
    setQuestionFilter,
  ] =
    useState<QuestionFilter>(
      "all"
    );

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
            const question of
            questionData
          ) {
            if (
              question.type !==
              "development"
            ) {
              continue;
            }

            const existingScore =
              existingScores[
                question.id
              ];

            if (
              typeof existingScore ===
                "number" &&
              Number.isFinite(
                existingScore
              )
            ) {
              loadedScores[
                question.id
              ] =
                roundScore(
                  clampScore(
                    existingScore,
                    question.points
                  )
                );
            } else {
              loadedScores[
                question.id
              ] =
                0;
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
     Search / filter
     ========================================================= */

  const visibleQuestions =
    useMemo(() => {
      const normalizedSearch =
        questionSearch
          .trim()
          .toLocaleLowerCase();

      return orderedQuestions.filter(
        (
          question,
          index
        ) => {
          const matchesType =
            questionFilter ===
              "all" ||
            question.type ===
              questionFilter;

          if (
            !matchesType
          ) {
            return false;
          }

          if (
            !normalizedSearch
          ) {
            return true;
          }

          const questionNumber =
            String(
              index +
                1
            );

          const searchableText =
            `${questionNumber} ${question.text}`
              .toLocaleLowerCase();

          return searchableText.includes(
            normalizedSearch
          );
        }
      );
    }, [
      orderedQuestions,
      questionSearch,
      questionFilter,
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

  const canDownloadPdf =
    Boolean(
      attempt &&
      attempt.status ===
        "graded" &&
      typeof attempt.finalScore ===
        "number"
    );

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
          .filter(
            Boolean
          );

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
          .charAt(
            0
          )
          .toUpperCase();
      }

      return (
        words[0]
          .charAt(
            0
          ) +
        words[
          words.length -
            1
        ].charAt(
          0
        )
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

  if (
    processing ===
    "pdf"
  ) {
    return (
      <AppLoading
        title={t(
          "attemptGrading.loading.pdfTitle"
        )}
        subtitle={t(
          "attemptGrading.loading.pdfSubtitle"
        )}
      />
    );
  }

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

    const safeScore =
      roundScore(
        clampScore(
          parsed,
          question.points
        )
      );

    setDevelopmentScores(
      (
        previous
      ) => ({
        ...previous,
        [question.id]:
          safeScore,
      })
    );
  }

  function validateDevelopmentScores() {
    for (
      const question of
      developmentQuestions
    ) {
      const score =
        developmentScores[
          question.id
        ] ??
        0;

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
        const score =
          developmentScores[
            question.id
          ] ??
          0;

        normalizedScores[
          question.id
        ] =
          roundScore(
            clampScore(
              score,
              question.points
            )
          );
      }

      const result =
        await gradeAttempt(
          attempt.id,
          {
            teacherId:
              teacher.id,
            developmentScores:
              normalizedScores,
          }
        );

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

  async function handleDownloadPdf() {
    if (
      processing ||
      !canDownloadPdf
    ) {
      return;
    }

    setMessage(
      ""
    );

    setSuccessMessage(
      ""
    );

    setProcessing(
      "pdf"
    );

    try {
      const pdfLanguage =
        getPdfLanguage(
          String(
            language
          )
        );

      const pdfDocument =
        (
          <AttemptCorrectionPdf
            quiz={quiz}
            attempt={attempt}
            questions={questions}
            language={pdfLanguage}
          />
        );

      const blob =
        await pdf(
          pdfDocument
        ).toBlob();

      const fileUrl =
        URL.createObjectURL(
          blob
        );

      const studentFileName =
        sanitizeFileName(
          attempt.studentName
        );

      const quizFileName =
        sanitizeFileName(
          quiz.title
        );

      const fileName =
        `ULearn-${quizFileName}-${studentFileName}-correction.pdf`;

      const link =
        documentCreateDownloadLink(
          fileUrl,
          fileName
        );

      link.click();
      link.remove();

      window.setTimeout(
        () => {
          URL.revokeObjectURL(
            fileUrl
          );
        },
        1000
      );
    } catch (error) {
      console.error(
        "Unable to generate correction PDF:",
        error
      );

      setMessage(
        t(
          "attemptGrading.messages.pdfError"
        )
      );
    } finally {
      setProcessing(
        ""
      );
    }
  }

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
              styles.questionSearchPanel
            }
          >
            <label
              className={
                styles.searchField
              }
            >
              <span
                className={
                  styles.searchLabel
                }
              >
                {t(
                  "attemptGrading.search.label"
                )}
              </span>

              <div
                className={
                  styles.searchInputWrapper
                }
              >
                <span
                  className={
                    styles.searchIcon
                  }
                  aria-hidden="true"
                >
                  ⌕
                </span>

                <input
                  type="search"
                  value={
                    questionSearch
                  }
                  onChange={(
                    event
                  ) => {
                    setQuestionSearch(
                      event.target.value
                    );
                  }}
                  placeholder={t(
                    "attemptGrading.search.placeholder"
                  )}
                  aria-label={t(
                    "attemptGrading.search.label"
                  )}
                />

                {questionSearch && (
                  <button
                    type="button"
                    className={
                      styles.clearSearchButton
                    }
                    onClick={() => {
                      setQuestionSearch(
                        ""
                      );
                    }}
                    aria-label={t(
                      "attemptGrading.search.clear"
                    )}
                    title={t(
                      "attemptGrading.search.clear"
                    )}
                  >
                    ×
                  </button>
                )}
              </div>
            </label>

            <div
              className={
                styles.filterGroup
              }
              role="group"
              aria-label={t(
                "attemptGrading.search.filterLabel"
              )}
            >
              {(
                [
                  [
                    "all",
                    "attemptGrading.search.filters.all",
                  ],
                  [
                    "development",
                    "attemptGrading.search.filters.development",
                  ],
                  [
                    "qcm",
                    "attemptGrading.search.filters.qcm",
                  ],
                  [
                    "multiple_choice",
                    "attemptGrading.search.filters.multipleChoice",
                  ],
                ] as const
              ).map(
                ([
                  value,
                  labelKey,
                ]) => (
                  <button
                    key={
                      value
                    }
                    type="button"
                    className={`${styles.filterButton} ${
                      questionFilter ===
                      value
                        ? styles.filterButtonActive
                        : ""
                    }`}
                    onClick={() => {
                      setQuestionFilter(
                        value
                      );
                    }}
                    aria-pressed={
                      questionFilter ===
                      value
                    }
                  >
                    {t(
                      labelKey
                    )}
                  </button>
                )
              )}
            </div>

            <div
              className={
                styles.searchResultInfo
              }
              aria-live="polite"
            >
              <span>
                {t(
                  "attemptGrading.search.results"
                )}{" "}
                <strong>
                  {
                    visibleQuestions.length
                  }
                  {" / "}
                  {
                    orderedQuestions.length
                  }
                </strong>
              </span>

              {(questionSearch ||
                questionFilter !==
                  "all") && (
                <button
                  type="button"
                  className={
                    styles.resetSearchButton
                  }
                  onClick={() => {
                    setQuestionSearch(
                      ""
                    );
                    setQuestionFilter(
                      "all"
                    );
                  }}
                >
                  {t(
                    "attemptGrading.search.reset"
                  )}
                </button>
              )}
            </div>
          </div>

          {visibleQuestions.length ===
          0 ? (
            <div
              className={
                styles.noSearchResults
              }
            >
              <strong>
                {t(
                  "attemptGrading.search.noResultsTitle"
                )}
              </strong>

              <p>
                {t(
                  "attemptGrading.search.noResultsText"
                )}
              </p>
            </div>
          ) : (
            <div
              className={
                styles.questionList
              }
            >
              {visibleQuestions.map(
                (
                  question
                ) => {
                  const originalIndex =
                    orderedQuestions.findIndex(
                      (
                        item
                      ) =>
                        item.id ===
                        question.id
                    );

                  const answer =
                    attempt.answers[
                      question.id
                    ];

                  const automaticScore =
                    automaticQuestionScores[
                      question.id
                    ] ??
                    0;

                  if (
                    question.type ===
                    "development"
                  ) {
                    const studentAnswer =
                      answer
                        ?.developmentAnswer
                        ?.trim() ||
                      "";

                    const developmentScore =
                      developmentScores[
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
                                "attemptGrading.questions.question"
                              )}{" "}
                              {
                                originalIndex +
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
                              developmentScore
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
                                developmentScore
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
                              originalIndex +
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
          )}
        </section>

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

          <div
            className={
              styles.gradingActions
            }
          >
            <button
              type="button"
              className="app-button app-button-secondary"
              disabled={
                !canDownloadPdf
              }
              onClick={
                handleDownloadPdf
              }
              title={
                canDownloadPdf
                  ? t(
                      "attemptGrading.actions.downloadPdf"
                    )
                  : t(
                      "attemptGrading.pdf.notReady"
                    )
              }
            >
              ↓{" "}
              {t(
                "attemptGrading.actions.downloadPdf"
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
          </div>
        </footer>
      </section>
    </main>
  );
}

/* =========================================================
   Browser download helper
   ========================================================= */

function documentCreateDownloadLink(
  url: string,
  fileName: string
) {
  const link =
    document.createElement(
      "a"
    );

  link.href =
    url;

  link.download =
    fileName;

  link.style.display =
    "none";

  document.body.appendChild(
    link
  );

  return link;
}
