"use client";

import {
  useEffect,
  useMemo,
  useRef,
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
  saveAttemptAnswer,
  submitAttempt,
  type Attempt,
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

import styles from "./QuizSessionPage.module.css";

/* =========================================================
   Types
   ========================================================= */

type OrderedQuestion = {
  question: Question;
  displayIndex: number;
};

type SavingState =
  | ""
  | "saving"
  | "saved";

type SubmissionState =
  | ""
  | "submitting"
  | "submitted";

const FIVE_MINUTES_MS =
  5 * 60 * 1000;

/* =========================================================
   Special characters
   ========================================================= */

const SPECIAL_CHARACTERS = [
  "²",
  "³",
  "√",
  "∛",
  "π",
  "∞",
  "≤",
  "≥",
  "≠",
  "≈",
  "±",
  "×",
  "÷",
  "∑",
  "∫",
  "∆",
  "α",
  "β",
  "γ",
  "δ",
  "θ",
  "λ",
  "μ",
  "σ",
  "φ",
  "Ω",
  "°",
  "℃",
  "℉",
  "→",
  "←",
  "↔",
];

const SUPERSCRIPT_MAP:
  Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "+": "⁺",
  "-": "⁻",
  "=": "⁼",
  "(": "⁽",
  ")": "⁾",
  n: "ⁿ",
};

const SUBSCRIPT_MAP:
  Record<string, string> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
  "+": "₊",
  "-": "₋",
  "=": "₌",
  "(": "₍",
  ")": "₎",
};

/* =========================================================
   Helpers
   ========================================================= */

function formatRemainingTime(
  milliseconds: number
) {
  const safe =
    Math.max(
      0,
      milliseconds
    );

  const totalSeconds =
    Math.floor(
      safe / 1000
    );

  const hours =
    Math.floor(
      totalSeconds / 3600
    );

  const minutes =
    Math.floor(
      (
        totalSeconds %
        3600
      ) /
        60
    );

  const seconds =
    totalSeconds %
    60;

  return [
    hours,
    minutes,
    seconds,
  ]
    .map(
      (value) =>
        String(
          value
        ).padStart(
          2,
          "0"
        )
    )
    .join(":");
}

function getQuestionShortLabel(
  question: Question
) {
  const clean =
    question.text.trim();

  if (
    clean.length <=
    42
  ) {
    return clean;
  }

  return `${clean.slice(
    0,
    42
  )}…`;
}

function convertToUnicode(
  value: string,
  map:
    Record<string, string>
) {
  return value
    .split("")
    .map(
      (character) =>
        map[
          character
        ] ??
        character
    )
    .join("");
}

function isChoiceQuestion(
  question:
    Question | null
) {
  return (
    question?.type ===
      "qcm" ||
    question?.type ===
      "multiple_choice"
  );
}

/* =========================================================
   Page
   ========================================================= */

export default function QuizSessionPage() {
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
      params.attemptId
    );

  const [
    attempt,
    setAttempt,
  ] =
    useState<Attempt | null>(
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
    currentIndex,
    setCurrentIndex,
  ] =
    useState(0);

  const [
    now,
    setNow,
  ] =
    useState(
      Date.now()
    );

  const [
    savingState,
    setSavingState,
  ] =
    useState<SavingState>(
      ""
    );

  const [
    submissionState,
    setSubmissionState,
  ] =
    useState<SubmissionState>(
      ""
    );

  const [
    submitModalOpen,
    setSubmitModalOpen,
  ] =
    useState(false);

  const [
    developmentDrafts,
    setDevelopmentDrafts,
  ] =
    useState<
      Record<string, string>
    >({});

  const [
    showSymbols,
    setShowSymbols,
  ] =
    useState(false);

  const [
    customSuperscript,
    setCustomSuperscript,
  ] =
    useState("");

  const [
    customSubscript,
    setCustomSubscript,
  ] =
    useState("");

  const [
    fractionTop,
    setFractionTop,
  ] =
    useState("");

  const [
    fractionBottom,
    setFractionBottom,
  ] =
    useState("");

  const saveTimeoutRef =
    useRef<
      ReturnType<
        typeof setTimeout
      > |
      null
    >(null);

  const autoSubmittedRef =
    useRef(false);

  const textareaRef =
    useRef<
      HTMLTextAreaElement |
      null
    >(null);

  const developmentDraftsRef =
    useRef<
      Record<string, string>
    >({});

  /* =========================================================
     Load attempt + quiz + questions
     ========================================================= */

  useEffect(() => {
    let cancelled =
      false;

    async function loadSession() {
      try {
        const attemptData =
          await getAttempt(
            attemptId
          );

        if (
          !attemptData
        ) {
          if (
            !cancelled
          ) {
            setMessage(
              t(
                "quizSession.access.notFound"
              )
            );

            setLoading(
              false
            );
          }

          return;
        }

        const [
          quizData,
          questionData,
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

        setAttempt(
          attemptData
        );

        setQuiz(
          quizData
        );

        setQuestions(
          questionData
        );

        const initialDrafts:
          Record<string, string> =
          {};

        for (
          const questionId of
          attemptData.questionOrder
        ) {
          const answer =
            attemptData.answers[
              questionId
            ];

          if (
            typeof answer
              ?.developmentAnswer ===
            "string"
          ) {
            initialDrafts[
              questionId
            ] =
              answer.developmentAnswer;
          }
        }

        setDevelopmentDrafts(
          initialDrafts
        );

        developmentDraftsRef.current =
          initialDrafts;
      } catch (error) {
        console.error(
          "Unable to load quiz session:",
          error
        );

        if (
          !cancelled
        ) {
          setMessage(
            t(
              "quizSession.access.loadError"
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

    loadSession();

    return () => {
      cancelled =
        true;
    };
  }, [
    attemptId,
    t,
  ]);

  /* =========================================================
     Timer
     ========================================================= */

  useEffect(() => {
    const interval =
      window.setInterval(
        () => {
          setNow(
            Date.now()
          );
        },
        1000
      );

    return () => {
      window.clearInterval(
        interval
      );
    };
  }, []);

  /* =========================================================
     Ordered questions
     ========================================================= */

  const orderedQuestions =
    useMemo<
      OrderedQuestion[]
    >(() => {
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
            questionId,
            index
          ) => {
            const question =
              questionMap.get(
                questionId
              );

            if (
              !question
            ) {
              return null;
            }

            return {
              question,
              displayIndex:
                index,
            };
          }
        )
        .filter(
          (
            item
          ): item is OrderedQuestion =>
            item !==
            null
        );
    }, [
      attempt,
      questions,
    ]);

  const currentEntry =
    orderedQuestions[
      currentIndex
    ] ??
    null;

  const currentQuestion =
    currentEntry
      ?.question ??
    null;

  /* =========================================================
     Remaining time
     ========================================================= */

  const remainingMs =
    useMemo(() => {
      if (
        !attempt
      ) {
        return 0;
      }

      const expiration =
        new Date(
          attempt.expiresAt
        ).getTime();

      if (
        Number.isNaN(
          expiration
        )
      ) {
        return 0;
      }

      return Math.max(
        0,
        expiration -
          now
      );
    }, [
      attempt,
      now,
    ]);

  const remainingLabel =
    formatRemainingTime(
      remainingMs
    );

  const showFiveMinuteWarning =
    attempt.status ===
      "in_progress" &&
    remainingMs > 0 &&
    remainingMs <=
      FIVE_MINUTES_MS;

  /* =========================================================
     Answered count
     ========================================================= */

  const answeredCount =
    useMemo(() => {
      if (
        !attempt
      ) {
        return 0;
      }

      let count =
        0;

      for (
        const questionId of
        attempt.questionOrder
      ) {
        const answer =
          attempt.answers[
            questionId
          ];

        const localDraft =
          developmentDrafts[
            questionId
          ];

        if (
          typeof answer
            ?.selectedChoiceIndex ===
          "number"
        ) {
          count +=
            1;

          continue;
        }

        if (
          Array.isArray(
            answer
              ?.selectedChoiceIndexes
          ) &&
          answer
            .selectedChoiceIndexes
            .length >
            0
        ) {
          count +=
            1;

          continue;
        }

        if (
          typeof localDraft ===
            "string" &&
          localDraft.trim()
        ) {
          count +=
            1;

          continue;
        }

        if (
          typeof answer
            ?.developmentAnswer ===
            "string" &&
          answer
            .developmentAnswer
            .trim()
        ) {
          count +=
            1;
        }
      }

      return count;
    }, [
      attempt,
      developmentDrafts,
    ]);

  /* =========================================================
     Current answer
     ========================================================= */

  const currentAnswer =
    currentQuestion &&
    attempt
      ? attempt.answers[
          currentQuestion.id
        ]
      : undefined;

  /* =========================================================
     Development draft
     ========================================================= */

  function updateDevelopmentDraft(
    questionId: string,
    value: string
  ) {
    setDevelopmentDrafts(
      (
        current
      ) => {
        const next = {
          ...current,

          [questionId]:
            value,
        };

        developmentDraftsRef.current =
          next;

        return next;
      }
    );
  }

  function handleDevelopmentChange(
    value: string
  ) {
    if (
      !attempt ||
      !currentQuestion ||
      currentQuestion.type !==
        "development" ||
      attempt.status !==
        "in_progress"
    ) {
      return;
    }

    const questionId =
      currentQuestion.id;

    updateDevelopmentDraft(
      questionId,
      value
    );

    if (
      saveTimeoutRef.current
    ) {
      clearTimeout(
        saveTimeoutRef.current
      );
    }

    setSavingState(
      "saving"
    );

    saveTimeoutRef.current =
      setTimeout(
        async () => {
          try {
            const result =
              await saveAttemptAnswer(
                attempt.id,
                questionId,
                {
                  developmentAnswer:
                    value,
                }
              );

            if (
              !result.success
            ) {
              setMessage(
                t(
                  "quizSession.messages.saveError"
                )
              );

              setSavingState(
                ""
              );

              return;
            }

            const updatedAt =
              new Date()
                .toISOString();

            setAttempt(
              (
                current
              ) => {
                if (
                  !current
                ) {
                  return current;
                }

                return {
                  ...current,

                  answers: {
                    ...current.answers,

                    [questionId]: {
                      developmentAnswer:
                        value,

                      updatedAt,
                    },
                  },
                };
              }
            );

            setSavingState(
              "saved"
            );

            window.setTimeout(
              () => {
                setSavingState(
                  ""
                );
              },
              1000
            );
          } catch (error) {
            console.error(
              "Unable to save development answer:",
              error
            );

            setMessage(
              t(
                "quizSession.messages.saveError"
              )
            );

            setSavingState(
              ""
            );
          }
        },
        600
      );
  }

  /* =========================================================
     Insert into development answer
     ========================================================= */

  function insertIntoDevelopmentAnswer(
    insertedText: string
  ) {
    if (
      !currentQuestion ||
      currentQuestion.type !==
        "development"
    ) {
      return;
    }

    const questionId =
      currentQuestion.id;

    const currentValue =
      developmentDrafts[
        questionId
      ] ??
      "";

    const textarea =
      textareaRef.current;

    if (
      !textarea
    ) {
      handleDevelopmentChange(
        currentValue +
          insertedText
      );

      return;
    }

    const start =
      textarea.selectionStart;

    const end =
      textarea.selectionEnd;

    const nextValue =
      currentValue.slice(
        0,
        start
      ) +
      insertedText +
      currentValue.slice(
        end
      );

    handleDevelopmentChange(
      nextValue
    );

    window.requestAnimationFrame(
      () => {
        textarea.focus();

        const nextPosition =
          start +
          insertedText.length;

        textarea.setSelectionRange(
          nextPosition,
          nextPosition
        );
      }
    );
  }

  /* =========================================================
     Superscript
     ========================================================= */

  function insertSuperscript() {
    const clean =
      customSuperscript.trim();

    if (
      !clean
    ) {
      return;
    }

    insertIntoDevelopmentAnswer(
      convertToUnicode(
        clean,
        SUPERSCRIPT_MAP
      )
    );

    setCustomSuperscript(
      ""
    );
  }

  /* =========================================================
     Subscript
     ========================================================= */

  function insertSubscript() {
    const clean =
      customSubscript.trim();

    if (
      !clean
    ) {
      return;
    }

    insertIntoDevelopmentAnswer(
      convertToUnicode(
        clean,
        SUBSCRIPT_MAP
      )
    );

    setCustomSubscript(
      ""
    );
  }

  /* =========================================================
     Fraction
     ========================================================= */

  function insertFraction() {
    const numerator =
      fractionTop.trim();

    const denominator =
      fractionBottom.trim();

    if (
      !numerator ||
      !denominator
    ) {
      return;
    }

    insertIntoDevelopmentAnswer(
      `${numerator}⁄${denominator}`
    );

    setFractionTop(
      ""
    );

    setFractionBottom(
      ""
    );
  }

  /* =========================================================
     QCM answer
     ========================================================= */

  async function handleQcmAnswer(
    originalChoiceIndex:
      number
  ) {
    if (
      !attempt ||
      !currentQuestion ||
      currentQuestion.type !==
        "qcm" ||
      attempt.status !==
        "in_progress"
    ) {
      return;
    }

    setSavingState(
      "saving"
    );

    setMessage(
      ""
    );

    try {
      const result =
        await saveAttemptAnswer(
          attempt.id,
          currentQuestion.id,
          {
            selectedChoiceIndex:
              originalChoiceIndex,
          }
        );

      if (
        !result.success
      ) {
        setMessage(
          t(
            "quizSession.messages.saveError"
          )
        );

        setSavingState(
          ""
        );

        return;
      }

      const updatedAt =
        new Date()
          .toISOString();

      setAttempt(
        (
          current
        ) => {
          if (
            !current
          ) {
            return current;
          }

          return {
            ...current,

            answers: {
              ...current.answers,

              [
                currentQuestion.id
              ]: {
                selectedChoiceIndex:
                  originalChoiceIndex,

                updatedAt,
              },
            },
          };
        }
      );

      setSavingState(
        "saved"
      );

      window.setTimeout(
        () => {
          setSavingState(
            ""
          );
        },
        1000
      );
    } catch (error) {
      console.error(
        "Unable to save QCM answer:",
        error
      );

      setMessage(
        t(
          "quizSession.messages.saveError"
        )
      );

      setSavingState(
        ""
      );
    }
  }

  /* =========================================================
     Multiple-choice answer
     ========================================================= */

  async function handleMultipleChoiceAnswer(
    originalChoiceIndex:
      number
  ) {
    if (
      !attempt ||
      !currentQuestion ||
      currentQuestion.type !==
        "multiple_choice" ||
      attempt.status !==
        "in_progress"
    ) {
      return;
    }

    const existingIndexes =
      Array.isArray(
        currentAnswer
          ?.selectedChoiceIndexes
      )
        ? currentAnswer
            .selectedChoiceIndexes
        : [];

    const nextIndexes =
      existingIndexes.includes(
        originalChoiceIndex
      )
        ? existingIndexes.filter(
            (
              index
            ) =>
              index !==
              originalChoiceIndex
          )
        : [
            ...existingIndexes,
            originalChoiceIndex,
          ];

    nextIndexes.sort(
      (
        first,
        second
      ) =>
        first -
        second
    );

    setSavingState(
      "saving"
    );

    setMessage(
      ""
    );

    try {
      const result =
        await saveAttemptAnswer(
          attempt.id,
          currentQuestion.id,
          {
            selectedChoiceIndexes:
              nextIndexes,
          }
        );

      if (
        !result.success
      ) {
        setMessage(
          t(
            "quizSession.messages.saveError"
          )
        );

        setSavingState(
          ""
        );

        return;
      }

      const updatedAt =
        new Date()
          .toISOString();

      setAttempt(
        (
          current
        ) => {
          if (
            !current
          ) {
            return current;
          }

          return {
            ...current,

            answers: {
              ...current.answers,

              [
                currentQuestion.id
              ]: {
                selectedChoiceIndexes:
                  nextIndexes,

                updatedAt,
              },
            },
          };
        }
      );

      setSavingState(
        "saved"
      );

      window.setTimeout(
        () => {
          setSavingState(
            ""
          );
        },
        1000
      );
    } catch (error) {
      console.error(
        "Unable to save multiple-choice answer:",
        error
      );

      setMessage(
        t(
          "quizSession.messages.saveError"
        )
      );

      setSavingState(
        ""
      );
    }
  }

  /* =========================================================
     Navigation
     ========================================================= */

  function goToQuestion(
    index: number
  ) {
    if (
      !attempt ||
      index <
        0 ||
      index >=
        orderedQuestions.length
    ) {
      return;
    }

    if (
      !attempt
        .allowBackNavigation &&
      index <
        currentIndex
    ) {
      return;
    }

    setCurrentIndex(
      index
    );

    setShowSymbols(
      false
    );
  }

  function goPrevious() {
    if (
      !attempt
        ?.allowBackNavigation ||
      currentIndex <=
        0
    ) {
      return;
    }

    goToQuestion(
      currentIndex -
        1
    );
  }

  function goNext() {
    if (
      currentIndex >=
      orderedQuestions.length -
        1
    ) {
      return;
    }

    goToQuestion(
      currentIndex +
        1
    );
  }

  /* =========================================================
     Submission
     ========================================================= */

  async function performSubmission() {
    if (
      !attempt ||
      attempt.status !==
        "in_progress"
    ) {
      return;
    }

    if (
      saveTimeoutRef.current
    ) {
      clearTimeout(
        saveTimeoutRef.current
      );

      saveTimeoutRef.current =
        null;
    }

    const result =
      await submitAttempt(
        attempt.id,
        developmentDraftsRef.current
      );

    if (
      !result.success
    ) {
      throw new Error(
        result.message
      );
    }

    const submittedAt =
      new Date()
        .toISOString();

    setAttempt(
      (
        current
      ) => {
        if (
          !current ||
          !result.status
        ) {
          return current;
        }

        return {
          ...current,

          status:
            result.status,

          automaticScore:
            result.automaticScore ??
            current.automaticScore,

          finalScore:
            result.finalScore,

          submittedAt,

          gradedAt:
            result.status ===
            "graded"
              ? submittedAt
              : null,
        };
      }
    );

    setSubmissionState(
      "submitted"
    );
  }

  /* =========================================================
     Auto submit
     ========================================================= */

  useEffect(() => {
    if (
      !attempt ||
      attempt.status !==
        "in_progress" ||
      remainingMs >
        0 ||
      autoSubmittedRef.current
    ) {
      return;
    }

    autoSubmittedRef.current =
      true;

    async function autoSubmit() {
      setSubmissionState(
        "submitting"
      );

      try {
        await performSubmission();
      } catch (error) {
        console.error(
          "Unable to auto-submit quiz:",
          error
        );

        setMessage(
          t(
            "quizSession.messages.submitError"
          )
        );

        setSubmissionState(
          ""
        );
      }
    }

    autoSubmit();
  }, [
    attempt,
    remainingMs,
    t,
  ]);

  /* =========================================================
     Submit modal
     ========================================================= */

  function openSubmitModal() {
    if (
      !attempt ||
      attempt.status !==
        "in_progress"
    ) {
      return;
    }

    setSubmitModalOpen(
      true
    );
  }

  function closeSubmitModal() {
    if (
      submissionState ===
      "submitting"
    ) {
      return;
    }

    setSubmitModalOpen(
      false
    );
  }

  async function handleSubmitQuiz() {
    if (
      !attempt ||
      submissionState ===
        "submitting"
    ) {
      return;
    }

    setSubmissionState(
      "submitting"
    );

    setMessage(
      ""
    );

    try {
      await performSubmission();

      setSubmitModalOpen(
        false
      );
    } catch (error) {
      console.error(
        "Unable to submit quiz:",
        error
      );

      setMessage(
        t(
          "quizSession.messages.submitError"
        )
      );

      setSubmissionState(
        ""
      );
    }
  }

  /* =========================================================
     Modal behavior
     ========================================================= */

  useEffect(() => {
    if (
      !submitModalOpen
    ) {
      return;
    }

    const previousOverflow =
      document.body.style
        .overflow;

    document.body.style.overflow =
      "hidden";

    function handleEscape(
      event:
        KeyboardEvent
    ) {
      if (
        event.key ===
          "Escape" &&
        submissionState !==
          "submitting"
      ) {
        setSubmitModalOpen(
          false
        );
      }
    }

    document.addEventListener(
      "keydown",
      handleEscape
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      document.removeEventListener(
        "keydown",
        handleEscape
      );
    };
  }, [
    submitModalOpen,
    submissionState,
  ]);

  /* =========================================================
     Cleanup
     ========================================================= */

  useEffect(() => {
    return () => {
      if (
        saveTimeoutRef.current
      ) {
        clearTimeout(
          saveTimeoutRef.current
        );
      }
    };
  }, []);

  /* =========================================================
     Loading
     ========================================================= */

  if (
    loading
  ) {
    return (
      <>
        <AppLoading
          title="ULearn"
          subtitle={t(
            "quizSession.loading"
          )}
        />

        <HelpSupport
          context="student"
        />
      </>
    );
  }

  /* =========================================================
     Access error
     ========================================================= */

  if (
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
            className={
              styles.errorCard
            }
          >
            <h1>
              {t(
                "quizSession.access.title"
              )}
            </h1>

            <p>
              {message ||
                t(
                  "quizSession.access.text"
                )}
            </p>
          </section>
        </main>

        <HelpSupport
          context="student"
        />
      </>
    );
  }

  /* =========================================================
     Submitted / graded result
     ========================================================= */

  if (
    attempt.status ===
      "submitted" ||
    attempt.status ===
      "graded" ||
    submissionState ===
      "submitted"
  ) {
    const isGraded =
      attempt.status ===
      "graded";

    const finalScore =
      attempt.finalScore ??
      attempt.automaticScore ??
      0;

    const safeTotalPoints =
      Math.max(
        0,
        quiz.totalPoints
      );

    const percentage =
      safeTotalPoints > 0
        ? Math.round(
            (
              finalScore /
              safeTotalPoints
            ) * 100
          )
        : 0;

    const showScore =
      isGraded &&
      attempt.showResultsToStudents;

    const showCorrection =
      isGraded &&
      attempt.showCorrectAnswers;

    return (
      <>
        <main
          className={
            styles.page
          }
        >
          <section
            className={
              styles.submittedCard
            }
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
                styles.submittedIcon
              }
              aria-hidden="true"
            >
              ✓
            </div>

            <h1>
              {isGraded
                ? t(
                    "quizSession.result.completedTitle"
                  )
                : t(
                    "quizSession.result.submittedTitle"
                  )}
            </h1>

            <p>
              {isGraded
                ? showScore
                  ? t(
                      "quizSession.result.completedText"
                    )
                  : t(
                      "quizSession.result.scoreHiddenText"
                    )
                : t(
                    "quizSession.result.pendingText"
                  )}
            </p>

            {isGraded ? (
              <div
                className={
                  styles.resultSummary
                }
              >
                <div
                  className={
                    styles.resultStudent
                  }
                >
                  <span>
                    {t(
                      "quizSession.submitted.student"
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

                {showScore && (
                  <>
                    <div>
                      <span>
                        {t(
                          "quizSession.result.score"
                        )}
                      </span>

                      <strong>
                        {finalScore}
                        {" / "}
                        {safeTotalPoints}
                      </strong>
                    </div>

                    <div>
                      <span>
                        {t(
                          "quizSession.result.percentage"
                        )}
                      </span>

                      <strong>
                        {percentage}%
                      </strong>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div
                className={
                  styles.resultSummary
                }
              >
                <div>
                  <span>
                    {t(
                      "quizSession.result.status"
                    )}
                  </span>

                  <strong>
                    {t(
                      "quizSession.result.pending"
                    )}
                  </strong>
                </div>

                <div
                  className={
                    styles.resultStudent
                  }
                >
                  <span>
                    {t(
                      "quizSession.submitted.student"
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
              </div>
            )}

            <div
              className={
                styles.resultActions
              }
            >
              {showCorrection && (
                <button
                  type="button"
                  className="app-button app-button-action"
                  onClick={() => {
                    router.push(
                      `/correction/${attempt.id}`
                    );
                  }}
                >
                  {t(
                    "quizSession.result.viewCorrection"
                  )}
                </button>
              )}

              {!isGraded && (
                <button
                  type="button"
                  className="app-button app-button-secondary app-button-action"
                  disabled
                  aria-disabled="true"
                >
                  {t(
                    "quizSession.result.correctionPending"
                  )}
                </button>
              )}

              <button
                type="button"
                className="app-button app-button-secondary app-button-action"
                onClick={() => {
                  router.push(
                    `/feedback/${attempt.id}`
                  );
                }}
              >
                {t(
                  "quizSession.result.leaveFeedback"
                )}
              </button>
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
     Active attempt question structure
     ========================================================= */

  if (
    orderedQuestions.length ===
    0
  ) {
    return (
      <>
        <main
          className={
            styles.page
          }
        >
          <section
            className={
              styles.errorCard
            }
          >
            <h1>
              {t(
                "quizSession.access.title"
              )}
            </h1>

            <p>
              {message ||
                t(
                  "quizSession.access.text"
                )}
            </p>
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
     Displayed choices
     ========================================================= */

  const displayedChoices =
    currentQuestion &&
    isChoiceQuestion(
      currentQuestion
    )
      ? (
          attempt.choiceOrders[
            currentQuestion.id
          ] ??
          currentQuestion.choices.map(
            (
              _,
              index
            ) =>
              index
          )
        )
      : [];

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
              Header
              ================================================= */}

          <header
            className={
              styles.header
            }
          >
            <div
              className={
                styles.brandBlock
              }
            >
              <span
                className={
                  styles.brandIcon
                }
              >
                U
              </span>

              <div>
                <strong>
                  ULearn
                </strong>

                <small>
                  {
                    quiz.title
                  }
                </small>
              </div>
            </div>

            {/* Student identity */}

            <div
              className={
                styles.studentIdentity
              }
            >
              <div
                className={
                  styles.studentAvatar
                }
              >
                {attempt.studentName
                  .charAt(
                    0
                  )
                  .toUpperCase()}
              </div>

              <div
                className={
                  styles.studentIdentityText
                }
              >
                <span>
                  {
                    attempt.studentName
                  }
                </span>

                <small>
                  {
                    attempt.studentEmail
                  }
                </small>
              </div>
            </div>

            <div
              className={
                styles.headerStats
              }
            >
              <div
                className={
                  styles.timerBox
                }
              >
                <span>
                  {t(
                    "quizSession.header.timeRemaining"
                  )}
                </span>

                <strong>
                  {
                    remainingLabel
                  }
                </strong>
              </div>

              <div
                className={
                  styles.progressBox
                }
              >
                <span>
                  {t(
                    "quizSession.header.answered"
                  )}
                </span>

                <strong>
                  {
                    answeredCount
                  }
                  {" / "}
                  {
                    orderedQuestions.length
                  }
                </strong>
              </div>
            </div>
          </header>

          {showFiveMinuteWarning && (
            <section
              className={
                styles.timeWarning
              }
              role="status"
              aria-live="polite"
            >
              <div
                className={
                  styles.timeWarningIcon
                }
                aria-hidden="true"
              >
                !
              </div>

              <div
                className={
                  styles.timeWarningContent
                }
              >
                <strong>
                  {t(
                    "quizSession.timeWarning.title"
                  )}
                </strong>

                <p>
                  {t(
                    "quizSession.timeWarning.text"
                  )}
                </p>
              </div>

              <span
                className={
                  styles.timeWarningTimer
                }
              >
                {
                  remainingLabel
                }
              </span>
            </section>
          )}

          {/* =================================================
              Main layout
              ================================================= */}

          <div
            className={
              styles.layout
            }
          >
            {/* =================================================
                Question navigation
                ================================================= */}

            <aside
              className={
                styles.questionPanel
              }
            >
              <div
                className={
                  styles.questionPanelHeader
                }
              >
                <h2>
                  {t(
                    "quizSession.questions.title"
                  )}
                </h2>

                <span>
                  {
                    orderedQuestions.length
                  }
                </span>
              </div>

              <div
                className={
                  styles.questionList
                }
              >
                {orderedQuestions.map(
                  (
                    entry,
                    index
                  ) => {
                    const question =
                      entry.question;

                    const answer =
                      attempt.answers[
                        question.id
                      ];

                    const localDraft =
                      developmentDrafts[
                        question.id
                      ];

                    const hasQcmAnswer =
                      typeof answer
                        ?.selectedChoiceIndex ===
                      "number";

                    const hasMultipleAnswer =
                      Array.isArray(
                        answer
                          ?.selectedChoiceIndexes
                      ) &&
                      answer
                        .selectedChoiceIndexes
                        .length >
                        0;

                    const hasDevelopmentAnswer =
                      Boolean(
                        localDraft
                          ?.trim()
                      ) ||
                      Boolean(
                        answer
                          ?.developmentAnswer
                          ?.trim()
                      );

                    const answered =
                      hasQcmAnswer ||
                      hasMultipleAnswer ||
                      hasDevelopmentAnswer;

                    const selected =
                      index ===
                      currentIndex;

                    const locked =
                      !attempt
                        .allowBackNavigation &&
                      index <
                        currentIndex;

                    let questionTypeLabel =
                      t(
                        "quizSession.questionTypes.development"
                      );

                    if (
                      question.type ===
                      "qcm"
                    ) {
                      questionTypeLabel =
                        t(
                          "quizSession.questionTypes.qcm"
                        );
                    }

                    if (
                      question.type ===
                      "multiple_choice"
                    ) {
                      questionTypeLabel =
                        t(
                          "quizSession.questionTypes.multipleChoice"
                        );
                    }

                    return (
                      <button
                        key={
                          question.id
                        }
                        type="button"
                        disabled={
                          locked
                        }
                        className={`${styles.questionItem} ${
                          selected
                            ? styles.questionItemSelected
                            : ""
                        } ${
                          answered
                            ? styles.questionItemAnswered
                            : ""
                        } ${
                          locked
                            ? styles.questionItemLocked
                            : ""
                        }`}
                        onClick={() =>
                          goToQuestion(
                            index
                          )
                        }
                      >
                        <span
                          className={
                            styles.questionNumber
                          }
                        >
                          {
                            index +
                            1
                          }
                        </span>

                        <span
                          className={
                            styles.questionContent
                          }
                        >
                          <strong>
                            {
                              questionTypeLabel
                            }
                          </strong>

                          <small>
                            {getQuestionShortLabel(
                              question
                            )}
                          </small>
                        </span>

                        <span
                          className={
                            styles.questionStatus
                          }
                        >
                          {answered
                            ? "✓"
                            : "•"}
                        </span>
                      </button>
                    );
                  }
                )}
              </div>
            </aside>

            {/* =================================================
                Current question
                ================================================= */}

            <section
              className={
                styles.questionArea
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
                      styles.questionEyebrow
                    }
                  >
                    {t(
                      "quizSession.question.label"
                    )}{" "}
                    {
                      currentIndex +
                      1
                    }
                    {" / "}
                    {
                      orderedQuestions.length
                    }
                  </span>

                  <h1>
                    {
                      currentQuestion
                        ?.text
                    }
                  </h1>
                </div>

                <span
                  className={
                    styles.pointsBadge
                  }
                >
                  {
                    currentQuestion
                      ?.points
                  }{" "}
                  {t(
                    "quizSession.question.points"
                  )}
                </span>
              </div>

              {/* Saving */}

              <div
                className={
                  styles.saveStatus
                }
              >
                {savingState ===
                  "saving" &&
                  t(
                    "quizSession.saving.saving"
                  )}

                {savingState ===
                  "saved" &&
                  t(
                    "quizSession.saving.saved"
                  )}
              </div>

              {/* =================================================
                  QCM
                  ================================================= */}

              {currentQuestion?.type ===
                "qcm" && (
                <>
                  <div
                    className={
                      styles.choiceInstruction
                    }
                  >
                    <strong>
                      {t(
                        "quizSession.choiceInstructions.singleTitle"
                      )}
                    </strong>

                    <span>
                      {t(
                        "quizSession.choiceInstructions.singleText"
                      )}
                    </span>
                  </div>

                  <div
                    className={
                      styles.choices
                    }
                  >
                    {displayedChoices.map(
                      (
                        originalIndex,
                        visualIndex
                      ) => {
                        const selected =
                          currentAnswer
                            ?.selectedChoiceIndex ===
                          originalIndex;

                        return (
                          <button
                            key={
                              originalIndex
                            }
                            type="button"
                            className={`${styles.choiceButton} ${
                              selected
                                ? styles.choiceButtonSelected
                                : ""
                            }`}
                            onClick={() =>
                              handleQcmAnswer(
                                originalIndex
                              )
                            }
                          >
                            <span
                              className={
                                styles.choiceLetter
                              }
                            >
                              {String.fromCharCode(
                                65 +
                                  visualIndex
                              )}
                            </span>

                            <span
                              className={
                                styles.choiceText
                              }
                            >
                              {
                                currentQuestion
                                  .choices[
                                  originalIndex
                                ]
                              }
                            </span>
                          </button>
                        );
                      }
                    )}
                  </div>
                </>
              )}

              {/* =================================================
                  MULTIPLE CHOICE
                  ================================================= */}

              {currentQuestion?.type ===
                "multiple_choice" && (
                <>
                  <div
                    className={
                      styles.multipleChoiceNotice
                    }
                  >
                    <div
                      className={
                        styles.multipleChoiceNoticeIcon
                      }
                      aria-hidden="true"
                    >
                      ✓
                    </div>

                    <div>
                      <strong>
                        {t(
                          "quizSession.choiceInstructions.multipleTitle"
                        )}
                      </strong>

                      <p>
                        {t(
                          "quizSession.choiceInstructions.multipleText"
                        )}
                      </p>
                    </div>
                  </div>

                  <div
                    className={
                      styles.choices
                    }
                  >
                    {displayedChoices.map(
                      (
                        originalIndex,
                        visualIndex
                      ) => {
                        const selectedIndexes =
                          Array.isArray(
                            currentAnswer
                              ?.selectedChoiceIndexes
                          )
                            ? currentAnswer
                                .selectedChoiceIndexes
                            : [];

                        const selected =
                          selectedIndexes.includes(
                            originalIndex
                          );

                        return (
                          <button
                            key={
                              originalIndex
                            }
                            type="button"
                            role="checkbox"
                            aria-checked={
                              selected
                            }
                            className={`${styles.choiceButton} ${styles.multipleChoiceButton} ${
                              selected
                                ? styles.choiceButtonSelected
                                : ""
                            }`}
                            onClick={() =>
                              handleMultipleChoiceAnswer(
                                originalIndex
                              )
                            }
                          >
                            <span
                              className={
                                styles.multipleChoiceCheck
                              }
                              aria-hidden="true"
                            >
                              {selected
                                ? "✓"
                                : ""}
                            </span>

                            <span
                              className={
                                styles.choiceLetter
                              }
                            >
                              {String.fromCharCode(
                                65 +
                                  visualIndex
                              )}
                            </span>

                            <span
                              className={
                                styles.choiceText
                              }
                            >
                              {
                                currentQuestion
                                  .choices[
                                  originalIndex
                                ]
                              }
                            </span>
                          </button>
                        );
                      }
                    )}
                  </div>
                </>
              )}

              {/* =================================================
                  DEVELOPMENT
                  ================================================= */}

              {currentQuestion?.type ===
                "development" && (
                <div
                  className={
                    styles.developmentBox
                  }
                >
                  <div
                    className={
                      styles.developmentHeader
                    }
                  >
                    <label
                      htmlFor={`development-${currentQuestion.id}`}
                    >
                      {t(
                        "quizSession.question.developmentAnswer"
                      )}
                    </label>

                    <button
                      type="button"
                      className={
                        styles.symbolToggleButton
                      }
                      aria-expanded={
                        showSymbols
                      }
                      onClick={() =>
                        setShowSymbols(
                          (
                            current
                          ) =>
                            !current
                        )
                      }
                    >
                      Ω{" "}
                      {showSymbols
                        ? t(
                            "quizSession.symbols.close"
                          )
                        : t(
                            "quizSession.symbols.open"
                          )}
                    </button>
                  </div>

                  {showSymbols && (
                    <section
                      className={
                        styles.specialCharactersPanel
                      }
                      aria-label={t(
                        "quizSession.symbols.panelAria"
                      )}
                    >
                      <div
                        className={
                          styles.specialCharacterButtons
                        }
                      >
                        {SPECIAL_CHARACTERS.map(
                          (
                            symbol,
                            index
                          ) => (
                            <button
                              key={`${symbol}-${index}`}
                              type="button"
                              className={
                                styles.specialCharacterButton
                              }
                              aria-label={`${t(
                                "quizSession.symbols.insertSymbol"
                              )} ${symbol}`}
                              onClick={() =>
                                insertIntoDevelopmentAnswer(
                                  symbol
                                )
                              }
                            >
                              {
                                symbol
                              }
                            </button>
                          )
                        )}
                      </div>

                      <div
                        className={
                          styles.specialTools
                        }
                      >
                        {/* Superscript */}

                        <div
                          className={
                            styles.specialTool
                          }
                        >
                          <span>
                            {t(
                              "quizSession.symbols.superscript"
                            )}
                          </span>

                          <div
                            className={
                              styles.specialToolRow
                            }
                          >
                            <input
                              type="text"
                              value={
                                customSuperscript
                              }
                              aria-label={t(
                                "quizSession.symbols.superscript"
                              )}
                              placeholder={t(
                                "quizSession.symbols.superscriptPlaceholder"
                              )}
                              onChange={(
                                event
                              ) =>
                                setCustomSuperscript(
                                  event.target.value
                                )
                              }
                            />

                            <button
                              type="button"
                              aria-label={t(
                                "quizSession.symbols.insertSuperscript"
                              )}
                              onClick={
                                insertSuperscript
                              }
                            >
                              xⁿ
                            </button>
                          </div>
                        </div>

                        {/* Subscript */}

                        <div
                          className={
                            styles.specialTool
                          }
                        >
                          <span>
                            {t(
                              "quizSession.symbols.subscript"
                            )}
                          </span>

                          <div
                            className={
                              styles.specialToolRow
                            }
                          >
                            <input
                              type="text"
                              value={
                                customSubscript
                              }
                              aria-label={t(
                                "quizSession.symbols.subscript"
                              )}
                              placeholder={t(
                                "quizSession.symbols.subscriptPlaceholder"
                              )}
                              onChange={(
                                event
                              ) =>
                                setCustomSubscript(
                                  event.target.value
                                )
                              }
                            />

                            <button
                              type="button"
                              aria-label={t(
                                "quizSession.symbols.insertSubscript"
                              )}
                              onClick={
                                insertSubscript
                              }
                            >
                              xₙ
                            </button>
                          </div>
                        </div>

                        {/* Fraction */}

                        <div
                          className={
                            styles.specialTool
                          }
                        >
                          <span>
                            {t(
                              "quizSession.symbols.fraction"
                            )}
                          </span>

                          <div
                            className={
                              styles.fractionRow
                            }
                          >
                            <input
                              type="text"
                              value={
                                fractionTop
                              }
                              aria-label={t(
                                "quizSession.symbols.numerator"
                              )}
                              placeholder={t(
                                "quizSession.symbols.numeratorPlaceholder"
                              )}
                              onChange={(
                                event
                              ) =>
                                setFractionTop(
                                  event.target.value
                                )
                              }
                            />

                            <span
                              aria-hidden="true"
                            >
                              /
                            </span>

                            <input
                              type="text"
                              value={
                                fractionBottom
                              }
                              aria-label={t(
                                "quizSession.symbols.denominator"
                              )}
                              placeholder={t(
                                "quizSession.symbols.denominatorPlaceholder"
                              )}
                              onChange={(
                                event
                              ) =>
                                setFractionBottom(
                                  event.target.value
                                )
                              }
                            />

                            <button
                              type="button"
                              onClick={
                                insertFraction
                              }
                            >
                              {t(
                                "quizSession.symbols.insert"
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </section>
                  )}

                  <textarea
                    ref={
                      textareaRef
                    }
                    id={`development-${currentQuestion.id}`}
                    value={
                      developmentDrafts[
                        currentQuestion.id
                      ] ??
                      ""
                    }
                    maxLength={
                      5000
                    }
                    placeholder={t(
                      "quizSession.question.developmentPlaceholder"
                    )}
                    onChange={(
                      event
                    ) =>
                      handleDevelopmentChange(
                        event.target.value
                      )
                    }
                  />

                  <small>
                    {
                      (
                        developmentDrafts[
                          currentQuestion.id
                        ] ??
                        ""
                      ).length
                    }
                    {" / "}
                    5000
                  </small>
                </div>
              )}

              {/* =================================================
                  Message
                  ================================================= */}

              {message && (
                <p
                  className={
                    styles.message
                  }
                  role="alert"
                >
                  {
                    message
                  }
                </p>
              )}

              {/* =================================================
                  Navigation
                  ================================================= */}

              <div
                className={
                  styles.actions
                }
              >
                <button
                  type="button"
                  className="app-button app-button-secondary"
                  disabled={
                    !attempt
                      .allowBackNavigation ||
                    currentIndex ===
                      0
                  }
                  onClick={
                    goPrevious
                  }
                >
                  ←{" "}
                  {t(
                    "quizSession.actions.previous"
                  )}
                </button>

                {currentIndex <
                orderedQuestions.length -
                  1 ? (
                  <button
                    type="button"
                    className="app-button"
                    onClick={
                      goNext
                    }
                  >
                    {t(
                      "quizSession.actions.next"
                    )}{" "}
                    →
                  </button>
                ) : (
                  <button
                    type="button"
                    className="app-button"
                    onClick={
                      openSubmitModal
                    }
                  >
                    {t(
                      "quizSession.actions.submit"
                    )}
                  </button>
                )}
              </div>
            </section>
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

      {/* =====================================================
          Submit modal
          ===================================================== */}

      {submitModalOpen && (
        <div
          className={
            styles.submitOverlay
          }
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeSubmitModal();
            }
          }}
        >
          <section
            className={
              styles.submitModal
            }
            role="dialog"
            aria-modal="true"
            aria-labelledby="submit-quiz-title"
          >
            <header
              className={
                styles.submitModalHeader
              }
            >
              <div>
                <span
                  className={
                    styles.badge
                  }
                >
                  {t(
                    "quizSession.submit.badge"
                  )}
                </span>

                <h2
                  id="submit-quiz-title"
                >
                  {t(
                    "quizSession.submit.title"
                  )}
                </h2>
              </div>

              <button
                type="button"
                className={
                  styles.submitClose
                }
                onClick={
                  closeSubmitModal
                }
                disabled={
                  submissionState ===
                  "submitting"
                }
                aria-label={t(
                  "quizSession.submit.closeAria"
                )}
              >
                ×
              </button>
            </header>

            <div
              className={
                styles.submitContent
              }
            >
              <p>
                {t(
                  "quizSession.submit.text"
                )}
              </p>

              <div
                className={
                  styles.submitStudent
                }
              >
                <span>
                  {
                    attempt.studentName
                  }
                </span>

                <small>
                  {
                    attempt.studentEmail
                  }
                </small>
              </div>

              <div
                className={
                  styles.submitSummary
                }
              >
                <div>
                  <span>
                    {t(
                      "quizSession.header.answered"
                    )}
                  </span>

                  <strong>
                    {
                      answeredCount
                    }
                    {" / "}
                    {
                      orderedQuestions.length
                    }
                  </strong>
                </div>

                <div>
                  <span>
                    {t(
                      "quizSession.header.timeRemaining"
                    )}
                  </span>

                  <strong>
                    {
                      remainingLabel
                    }
                  </strong>
                </div>
              </div>
            </div>

            <div
              className={
                styles.submitActions
              }
            >
              <button
                type="button"
                className="app-button app-button-action"
                disabled={
                  submissionState ===
                  "submitting"
                }
                onClick={
                  handleSubmitQuiz
                }
              >
                {submissionState ===
                "submitting"
                  ? t(
                      "quizSession.submit.submitting"
                    )
                  : t(
                      "quizSession.actions.submit"
                    )}
              </button>

              <button
                type="button"
                className="app-button app-button-secondary app-button-action"
                disabled={
                  submissionState ===
                  "submitting"
                }
                onClick={
                  closeSubmitModal
                }
              >
                {t(
                  "quizSession.actions.cancel"
                )}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}