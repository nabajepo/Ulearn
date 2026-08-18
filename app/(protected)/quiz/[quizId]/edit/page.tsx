"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
  useParams,
  useRouter,
} from "next/navigation";

import AppLoading from "@/components/AppLoading";
import SpecialCharactersPicker from "@/components/SpecialCharactersPicker";

import {
  getQuiz,
  type Quiz,
} from "@/lib/services/quizzes";

import {
  createDevelopmentQuestion,
  createMultipleChoiceQuestion,
  createQcmQuestion,
  deleteQuestion,
  getQuizQuestions,
  updateDevelopmentQuestion,
  updateMultipleChoiceQuestion,
  updateQcmQuestion,
  type Question,
  type QuestionType,
} from "@/lib/services/questions";

import {
  LIMITS,
} from "@/lib/services/limits";

import {
  useTeacher,
} from "@/hooks/useTeacher";

import {
  useLanguage,
} from "@/hooks/useLanguage";

import styles from "./EditQuizPage.module.css";

/* =========================================================
   Types
   ========================================================= */

type EditorMode =
  | "create"
  | "edit";

type ProcessingAction =
  | ""
  | "saving"
  | "deleting"
  | "back";

type QuestionFormState = {
  type: QuestionType;

  text: string;

  points: number;

  choices: string[];

  /*
   * QCM:
   * exactly one correct answer.
   */
  correctChoiceIndex: number;

  /*
   * Multiple choice:
   * several correct answers.
   */
  correctChoiceIndexes: number[];
};

/* =========================================================
   Constants
   ========================================================= */

const EMPTY_CHOICES = [
  "",
  "",
  "",
  "",
];

const MAX_QUESTION_LENGTH =
  1000;

const MAX_CHOICE_LENGTH =
  500;

/* =========================================================
   Helpers
   ========================================================= */

function createEmptyForm():
  QuestionFormState {
  return {
    type:
      "qcm",

    text:
      "",

    points:
      1,

    choices: [
      ...EMPTY_CHOICES,
    ],

    correctChoiceIndex:
      0,

    correctChoiceIndexes:
      [],
  };
}

function buildFormFromQuestion(
  question: Question
): QuestionFormState {
  /* =====================================================
     Development
     ===================================================== */

  if (
    question.type ===
    "development"
  ) {
    return {
      type:
        "development",

      text:
        question.text,

      points:
        question.points,

      choices: [
        ...EMPTY_CHOICES,
      ],

      correctChoiceIndex:
        0,

      correctChoiceIndexes:
        [],
    };
  }

  /* =====================================================
     Choice questions
     ===================================================== */

  const choices = [
    ...question.choices,
  ];

  while (
    choices.length <
    4
  ) {
    choices.push(
      ""
    );
  }

  /* =====================================================
     Multiple choice
     ===================================================== */

  if (
    question.type ===
    "multiple_choice"
  ) {
    return {
      type:
        "multiple_choice",

      text:
        question.text,

      points:
        question.points,

      choices,

      correctChoiceIndex:
        question.correctChoiceIndexes[
          0
        ] ?? 0,

      correctChoiceIndexes: [
        ...question.correctChoiceIndexes,
      ],
    };
  }

  /* =====================================================
     QCM
     ===================================================== */

  return {
    type:
      "qcm",

    text:
      question.text,

    points:
      question.points,

    choices,

    correctChoiceIndex:
      question.correctChoiceIndex,

    correctChoiceIndexes:
      [],
  };
}

function getQuestionLabel(
  question: Question
) {
  const text =
    question.text.trim();

  if (
    !text
  ) {
    return "";
  }

  if (
    text.length <=
    42
  ) {
    return text;
  }

  return (
    text.slice(
      0,
      42
    ) +
    "…"
  );
}

function getQuestionTypeShortLabel(
  question: Question
) {
  if (
    question.type ===
    "multiple_choice"
  ) {
    return "MULTI";
  }

  if (
    question.type ===
    "development"
  ) {
    return "DEV";
  }

  return "QCM";
}

/* =========================================================
   Page
   ========================================================= */

export default function EditQuizPage() {
  const router =
    useRouter();

  const params =
    useParams();

  const {
    t,
  } =
    useLanguage();

  const quizId =
    String(
      params.quizId
    );

  const {
    teacher,
    loading:
      teacherLoading,
  } =
    useTeacher();

  /* =========================================================
     Refs
     ========================================================= */

  const questionTextRef =
    useRef<
      HTMLTextAreaElement | null
    >(
      null
    );

  const choiceRefs =
    useRef<
      Array<
        HTMLInputElement | null
      >
    >(
      []
    );

  /* =========================================================
     Quiz data
     ========================================================= */

  const [
    quiz,
    setQuiz,
  ] =
    useState<
      Quiz | null
    >(
      null
    );

  const [
    questions,
    setQuestions,
  ] =
    useState<
      Question[]
    >(
      []
    );

  /* =========================================================
     Editor state
     ========================================================= */

  const [
    selectedQuestionId,
    setSelectedQuestionId,
  ] =
    useState<
      string | null
    >(
      null
    );

  const [
    editorMode,
    setEditorMode,
  ] =
    useState<
      EditorMode
    >(
      "create"
    );

  const [
    form,
    setForm,
  ] =
    useState<
      QuestionFormState
    >(
      () =>
        createEmptyForm()
    );

  /* =========================================================
     UI state
     ========================================================= */

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );

  const [
    processing,
    setProcessing,
  ] =
    useState<
      ProcessingAction
    >(
      ""
    );

  const [
    message,
    setMessage,
  ] =
    useState(
      ""
    );

  const [
    deleteModalOpen,
    setDeleteModalOpen,
  ] =
    useState(
      false
    );

  const [
    questionSymbolsOpen,
    setQuestionSymbolsOpen,
  ] =
    useState(
      false
    );

  const [
    activeChoicePickerIndex,
    setActiveChoicePickerIndex,
  ] =
    useState<
      number | null
    >(
      null
    );

  /* =========================================================
     Derived values
     ========================================================= */

  const selectedQuestion =
    useMemo(
      () =>
        questions.find(
          (
            question
          ) =>
            question.id ===
            selectedQuestionId
        ) ??
        null,
      [
        questions,
        selectedQuestionId,
      ]
    );

  const questionCount =
    questions.length;

  const qcmCount =
    useMemo(
      () =>
        questions.filter(
          (
            question
          ) =>
            question.type ===
            "qcm"
        ).length,
      [
        questions,
      ]
    );

  const multipleChoiceCount =
    useMemo(
      () =>
        questions.filter(
          (
            question
          ) =>
            question.type ===
            "multiple_choice"
        ).length,
      [
        questions,
      ]
    );

  const developmentCount =
    useMemo(
      () =>
        questions.filter(
          (
            question
          ) =>
            question.type ===
            "development"
        ).length,
      [
        questions,
      ]
    );

  /*
   * QCM + MULTI are both automatically
   * corrected questions.
   *
   * With the current LIMITS configuration,
   * they share MAX_QCM_QUESTIONS.
   */
  const automaticQuestionCount =
    qcmCount +
    multipleChoiceCount;

  const assignedPoints =
    useMemo(
      () =>
        questions.reduce(
          (
            total,
            question
          ) =>
            total +
            question.points,
          0
        ),
      [
        questions,
      ]
    );

  const remainingQuestions =
    quiz
      ? Math.max(
          0,

          quiz.targetQuestions -
            questionCount
        )
      : 0;

  const remainingPoints =
    quiz
      ? Math.max(
          0,

          quiz.totalPoints -
            assignedPoints
        )
      : 0;

  const structureComplete =
    Boolean(
      quiz &&
      questionCount ===
        quiz.targetQuestions &&
      assignedPoints ===
        quiz.totalPoints
    );

  /*
   * Respect both:
   *
   * - planned quiz target
   * - global application maximum
   */
  const belowTotalQuestionLimit =
    questionCount <
    LIMITS
      .MAX_QUESTIONS_PER_QUIZ;

  const canAddQuestion =
    Boolean(
      quiz &&
      questionCount <
        quiz.targetQuestions &&
      belowTotalQuestionLimit &&
      remainingPoints >=
        remainingQuestions
    );

  /* =========================================================
     Type limits
     ========================================================= */

  function getCountsWithoutCurrentQuestion() {
    let automatic =
      automaticQuestionCount;

    let development =
      developmentCount;

    if (
      editorMode ===
        "edit" &&
      selectedQuestion
    ) {
      if (
        selectedQuestion.type ===
          "development"
      ) {
        development =
          Math.max(
            0,
            development -
              1
          );
      } else {
        automatic =
          Math.max(
            0,
            automatic -
              1
          );
      }
    }

    return {
      automatic,
      development,
    };
  }

  function canUseQuestionType(
    type: QuestionType
  ) {
    const counts =
      getCountsWithoutCurrentQuestion();

    if (
      type ===
      "development"
    ) {
      return (
        counts.development <
        LIMITS
          .MAX_DEVELOPMENT_QUESTIONS
      );
    }

    /*
     * QCM + MULTI share the
     * automatic question limit.
     */
    return (
      counts.automatic <
      LIMITS
        .MAX_QCM_QUESTIONS
    );
  }

  const qcmTypeAvailable =
    canUseQuestionType(
      "qcm"
    );

  const multipleChoiceTypeAvailable =
    canUseQuestionType(
      "multiple_choice"
    );

  const developmentTypeAvailable =
    canUseQuestionType(
      "development"
    );

  /* =========================================================
     Maximum points
     ========================================================= */

  function getMaximumPointsForCurrentQuestion() {
    if (
      !quiz
    ) {
      return 1;
    }

    if (
      editorMode ===
        "edit" &&
      selectedQuestion
    ) {
      const pointsUsedByOthers =
        assignedPoints -
        selectedQuestion.points;

      const availablePool =
        quiz.totalPoints -
        pointsUsedByOthers;

      const futureQuestionCount =
        Math.max(
          0,

          quiz.targetQuestions -
            questionCount
        );

      const reservedPoints =
        futureQuestionCount;

      return Math.max(
        1,

        availablePool -
          reservedPoints
      );
    }

    const futureQuestionCount =
      Math.max(
        0,

        remainingQuestions -
          1
      );

    return Math.max(
      1,

      remainingPoints -
        futureQuestionCount
    );
  }

  /* =========================================================
     Load quiz + questions
     ========================================================= */

  useEffect(() => {
    let cancelled =
      false;

    async function loadEditor() {
      try {
        const [
          quizData,
          questionData,
        ] =
          await Promise.all([
            getQuiz(
              quizId
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

        setQuestions(
          questionData
        );

        if (
          questionData.length >
          0
        ) {
          const first =
            questionData[
              0
            ];

          setSelectedQuestionId(
            first.id
          );

          setEditorMode(
            "edit"
          );

          setForm(
            buildFormFromQuestion(
              first
            )
          );
        } else {
          setSelectedQuestionId(
            null
          );

          setEditorMode(
            "create"
          );

          setForm(
            createEmptyForm()
          );
        }
      } catch (
        error
      ) {
        console.error(
          "Unable to load quiz editor:",
          error
        );

        if (
          !cancelled
        ) {
          setMessage(
            t(
              "quizEdit.messages.loadError"
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

    loadEditor();

    return () => {
      cancelled =
        true;
    };
  }, [
    quizId,
    t,
  ]);

  /* =========================================================
     Delete modal behavior
     ========================================================= */

  useEffect(() => {
    if (
      !deleteModalOpen
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
        processing !==
          "deleting"
      ) {
        setDeleteModalOpen(
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
    deleteModalOpen,
    processing,
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
          "quizEdit.loading.title"
        )}
        subtitle={t(
          "quizEdit.loading.subtitle"
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
          "quizEdit.loading.returning"
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
          "quizEdit.loading.savingTitle"
        )}
        subtitle={t(
          "quizEdit.loading.savingSubtitle"
        )}
      />
    );
  }

  if (
    processing ===
    "deleting"
  ) {
    return (
      <AppLoading
        title="ULearn"
        subtitle={t(
          "quizEdit.loading.deleting"
        )}
      />
    );
  }

  /* =========================================================
     Access protection
     ========================================================= */

  if (
    !teacher ||
    !quiz ||
    quiz.teacherId !==
      teacher.id
  ) {
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
          <h1>
            {t(
              "quizEdit.access.title"
            )}
          </h1>

          <p>
            {t(
              "quizEdit.access.text"
            )}
          </p>
        </section>
      </main>
    );
  }

  if (
    quiz.status !==
    "draft"
  ) {
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
          <button
            type="button"
            className="app-button app-button-secondary"
            onClick={() =>
              router.push(
                `/quiz/${quiz.id}`
              )
            }
          >
            ←{" "}
            {t(
              "quizEdit.backQuiz"
            )}
          </button>

          <div
            className={
              styles.lockedState
            }
          >
            <h1>
              {t(
                "quizEdit.locked.title"
              )}
            </h1>

            <p>
              {t(
                "quizEdit.locked.text"
              )}
            </p>
          </div>
        </section>
      </main>
    );
  }

  /* =========================================================
     Navigation
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
      `/quiz/${quiz.id}`
    );
  }

  /* =========================================================
     Select question
     ========================================================= */

  function handleSelectQuestion(
    question:
      Question
  ) {
    if (
      processing
    ) {
      return;
    }

    setSelectedQuestionId(
      question.id
    );

    setEditorMode(
      "edit"
    );

    setForm(
      buildFormFromQuestion(
        question
      )
    );

    setQuestionSymbolsOpen(
      false
    );

    setActiveChoicePickerIndex(
      null
    );

    setMessage(
      ""
    );
  }

  /* =========================================================
     New question
     ========================================================= */

  function handleNewQuestion() {
    if (
      processing ||
      !canAddQuestion
    ) {
      return;
    }

    setSelectedQuestionId(
      null
    );

    setEditorMode(
      "create"
    );

    /*
     * Pick the first available type.
     */
    let newType:
      QuestionType =
      "qcm";

    if (
      automaticQuestionCount >=
      LIMITS
        .MAX_QCM_QUESTIONS
    ) {
      newType =
        "development";
    }

    const newForm =
      createEmptyForm();

    newForm.type =
      newType;

    setForm(
      newForm
    );

    setQuestionSymbolsOpen(
      false
    );

    setActiveChoicePickerIndex(
      null
    );

    setMessage(
      ""
    );
  }

  /* =========================================================
     Form updates
     ========================================================= */

  function updateForm<
    K extends keyof QuestionFormState,
  >(
    field: K,
    value:
      QuestionFormState[K]
  ) {
    setForm(
      (
        current
      ) => ({
        ...current,

        [field]:
          value,
      })
    );

    setMessage(
      ""
    );
  }

  function handleTypeChange(
    type:
      QuestionType
  ) {
    if (
      !canUseQuestionType(
        type
      )
    ) {
      return;
    }

    setForm(
      (
        current
      ) => {
        /* =================================================
           QCM
           ================================================= */

        if (
          type ===
          "qcm"
        ) {
          const preferredIndex =
            current.correctChoiceIndexes[
              0
            ] ??
            current.correctChoiceIndex ??
            0;

          return {
            ...current,

            type:
              "qcm",

            correctChoiceIndex:
              Math.max(
                0,
                Math.min(
                  preferredIndex,
                  current.choices.length -
                    1
                )
              ),

            correctChoiceIndexes:
              [],
          };
        }

        /* =================================================
           MULTI
           ================================================= */

        if (
          type ===
          "multiple_choice"
        ) {
          const indexes =
            current.correctChoiceIndexes.length >
            0
              ? current.correctChoiceIndexes
              : [
                  current.correctChoiceIndex,
                ];

          return {
            ...current,

            type:
              "multiple_choice",

            correctChoiceIndexes:
              Array.from(
                new Set(
                  indexes
                )
              ).filter(
                (
                  index
                ) =>
                  index >=
                    0 &&
                  index <
                    current
                      .choices
                      .length
              ),
          };
        }

        /* =================================================
           Development
           ================================================= */

        return {
          ...current,

          type:
            "development",
        };
      }
    );

    setActiveChoicePickerIndex(
      null
    );

    setMessage(
      ""
    );
  }

  function updateChoice(
    index: number,
    value: string
  ) {
    setForm(
      (
        current
      ) => {
        const nextChoices = [
          ...current.choices,
        ];

        nextChoices[
          index
        ] =
          value;

        return {
          ...current,

          choices:
            nextChoices,
        };
      }
    );

    setMessage(
      ""
    );
  }

  function addChoice() {
    setForm(
      (
        current
      ) => ({
        ...current,

        choices: [
          ...current.choices,
          "",
        ],
      })
    );

    setMessage(
      ""
    );
  }

  function toggleMultipleCorrectChoice(
    index: number
  ) {
    setForm(
      (
        current
      ) => {
        const alreadySelected =
          current
            .correctChoiceIndexes
            .includes(
              index
            );

        const nextIndexes =
          alreadySelected
            ? current
                .correctChoiceIndexes
                .filter(
                  (
                    value
                  ) =>
                    value !==
                    index
                )
            : [
                ...current.correctChoiceIndexes,
                index,
              ];

        return {
          ...current,

          correctChoiceIndexes:
            nextIndexes.sort(
              (
                first,
                second
              ) =>
                first -
                second
            ),
        };
      }
    );

    setMessage(
      ""
    );
  }

  function removeChoice(
    index: number
  ) {
    setForm(
      (
        current
      ) => {
        if (
          current.choices.length <=
          2
        ) {
          return current;
        }

        const nextChoices =
          current.choices.filter(
            (
              _,
              choiceIndex
            ) =>
              choiceIndex !==
              index
          );

        /* =================================================
           Fix single QCM index
           ================================================= */

        let nextCorrectIndex =
          current.correctChoiceIndex;

        if (
          index ===
          current.correctChoiceIndex
        ) {
          nextCorrectIndex =
            0;
        } else if (
          index <
          current.correctChoiceIndex
        ) {
          nextCorrectIndex =
            current.correctChoiceIndex -
            1;
        }

        /* =================================================
           Fix MULTI indexes
           ================================================= */

        const nextCorrectIndexes =
          current
            .correctChoiceIndexes
            .filter(
              (
                correctIndex
              ) =>
                correctIndex !==
                index
            )
            .map(
              (
                correctIndex
              ) =>
                correctIndex >
                index
                  ? correctIndex -
                      1
                  : correctIndex
            );

        return {
          ...current,

          choices:
            nextChoices,

          correctChoiceIndex:
            nextCorrectIndex,

          correctChoiceIndexes:
            nextCorrectIndexes,
        };
      }
    );

    setActiveChoicePickerIndex(
      null
    );

    setMessage(
      ""
    );
  }

  /* =========================================================
     Special characters
     ========================================================= */

  function insertQuestionCharacter(
    value: string
  ) {
    const textarea =
      questionTextRef.current;

    const currentText =
      form.text;

    if (
      currentText.length +
        value.length >
      MAX_QUESTION_LENGTH
    ) {
      return;
    }

    if (
      !textarea
    ) {
      updateForm(
        "text",
        currentText +
          value
      );

      return;
    }

    const start =
      textarea.selectionStart ??
      currentText.length;

    const end =
      textarea.selectionEnd ??
      start;

    const newLength =
      currentText.length -
      (
        end -
        start
      ) +
      value.length;

    if (
      newLength >
      MAX_QUESTION_LENGTH
    ) {
      return;
    }

    const nextText =
      currentText.slice(
        0,
        start
      ) +
      value +
      currentText.slice(
        end
      );

    updateForm(
      "text",
      nextText
    );

    window.requestAnimationFrame(
      () => {
        const nextPosition =
          start +
          value.length;

        textarea.focus();

        textarea.setSelectionRange(
          nextPosition,
          nextPosition
        );
      }
    );
  }

  function insertChoiceCharacter(
    index: number,
    value: string
  ) {
    const input =
      choiceRefs.current[
        index
      ];

    const currentText =
      form.choices[
        index
      ] ??
      "";

    if (
      !input
    ) {
      if (
        currentText.length +
          value.length <=
        MAX_CHOICE_LENGTH
      ) {
        updateChoice(
          index,
          currentText +
            value
        );
      }

      return;
    }

    const start =
      input.selectionStart ??
      currentText.length;

    const end =
      input.selectionEnd ??
      start;

    const newLength =
      currentText.length -
      (
        end -
        start
      ) +
      value.length;

    if (
      newLength >
      MAX_CHOICE_LENGTH
    ) {
      return;
    }

    const nextText =
      currentText.slice(
        0,
        start
      ) +
      value +
      currentText.slice(
        end
      );

    updateChoice(
      index,
      nextText
    );

    window.requestAnimationFrame(
      () => {
        const nextPosition =
          start +
          value.length;

        input.focus();

        input.setSelectionRange(
          nextPosition,
          nextPosition
        );
      }
    );
  }

  /* =========================================================
     Save
     ========================================================= */

  async function handleSubmit(
    event:
      FormEvent<
        HTMLFormElement
      >
  ) {
    event.preventDefault();

    if (
      processing
    ) {
      return;
    }

    if (
      !canUseQuestionType(
        form.type
      )
    ) {
      if (
        form.type ===
        "development"
      ) {
        setMessage(
          `${t(
            "quizEdit.validation.developmentLimit"
          )} ${LIMITS.MAX_DEVELOPMENT_QUESTIONS}.`
        );
      } else {
        setMessage(
          `${t(
            "quizEdit.validation.automaticLimit"
          )} ${LIMITS.MAX_QCM_QUESTIONS}.`
        );
      }

      return;
    }

    const cleanText =
      form.text.trim();

    if (
      !cleanText
    ) {
      setMessage(
        t(
          "quizEdit.validation.questionRequired"
        )
      );

      return;
    }

    if (
      !Number.isInteger(
        form.points
      ) ||
      form.points <
        1
    ) {
      setMessage(
        t(
          "quizEdit.validation.pointsMinimum"
        )
      );

      return;
    }

    const maxPoints =
      getMaximumPointsForCurrentQuestion();

    if (
      form.points >
      maxPoints
    ) {
      setMessage(
        `${t(
          "quizEdit.validation.maximumPoints"
        )} ${maxPoints}.`
      );

      return;
    }

    /* =====================================================
       Choice validation
       ===================================================== */

    if (
      form.type ===
        "qcm" ||
      form.type ===
        "multiple_choice"
    ) {
      const cleanChoices =
        form.choices.map(
          (
            choice
          ) =>
            choice.trim()
        );

      if (
        cleanChoices.length <
        2
      ) {
        setMessage(
          t(
            "quizEdit.validation.twoChoices"
          )
        );

        return;
      }

      if (
        cleanChoices.some(
          (
            choice
          ) =>
            !choice
        )
      ) {
        setMessage(
          t(
            "quizEdit.validation.emptyChoice"
          )
        );

        return;
      }

      /* ===================================================
         QCM
         =================================================== */

      if (
        form.type ===
        "qcm"
      ) {
        if (
          form.correctChoiceIndex <
            0 ||
          form.correctChoiceIndex >=
            cleanChoices.length
        ) {
          setMessage(
            t(
              "quizEdit.validation.correctAnswer"
            )
          );

          return;
        }
      }

      /* ===================================================
         MULTI
         =================================================== */

      if (
        form.type ===
        "multiple_choice"
      ) {
        if (
          form.correctChoiceIndexes.length <
          2
        ) {
          setMessage(
            t(
              "quizEdit.validation.multipleCorrectMinimum"
            )
          );

          return;
        }

        if (
          form.correctChoiceIndexes.some(
            (
              index
            ) =>
              index <
                0 ||
              index >=
                cleanChoices.length
          )
        ) {
          setMessage(
            t(
              "quizEdit.validation.multipleCorrectInvalid"
            )
          );

          return;
        }
      }
    }

    setProcessing(
      "saving"
    );

    try {
      let result;

      /* ===================================================
         Create
         =================================================== */

      if (
        editorMode ===
        "create"
      ) {
        if (
          form.type ===
          "qcm"
        ) {
          result =
            await createQcmQuestion({
              quizId,

              text:
                cleanText,

              points:
                form.points,

              choices:
                form.choices,

              correctChoiceIndex:
                form.correctChoiceIndex,
            });
        } else if (
          form.type ===
          "multiple_choice"
        ) {
          result =
            await createMultipleChoiceQuestion({
              quizId,

              text:
                cleanText,

              points:
                form.points,

              choices:
                form.choices,

              correctChoiceIndexes:
                form.correctChoiceIndexes,
            });
        } else {
          result =
            await createDevelopmentQuestion({
              quizId,

              text:
                cleanText,

              points:
                form.points,
            });
        }
      } else {
        /* =================================================
           Update
           ================================================= */

        if (
          !selectedQuestion
        ) {
          setProcessing(
            ""
          );

          return;
        }

        if (
          form.type ===
          "qcm"
        ) {
          result =
            await updateQcmQuestion(
              selectedQuestion.id,
              {
                text:
                  cleanText,

                points:
                  form.points,

                choices:
                  form.choices,

                correctChoiceIndex:
                  form.correctChoiceIndex,
              }
            );
        } else if (
          form.type ===
          "multiple_choice"
        ) {
          result =
            await updateMultipleChoiceQuestion(
              selectedQuestion.id,
              {
                text:
                  cleanText,

                points:
                  form.points,

                choices:
                  form.choices,

                correctChoiceIndexes:
                  form.correctChoiceIndexes,
              }
            );
        } else {
          result =
            await updateDevelopmentQuestion(
              selectedQuestion.id,
              {
                text:
                  cleanText,

                points:
                  form.points,
              }
            );
        }
      }

      if (
        !result.success
      ) {
        setMessage(
          t(
            "quizEdit.messages.saveError"
          )
        );

        return;
      }

      const updatedQuestions =
        await getQuizQuestions(
          quizId
        );

      setQuestions(
        updatedQuestions
      );

      const savedQuestion =
        result.question;

      if (
        savedQuestion
      ) {
        setSelectedQuestionId(
          savedQuestion.id
        );

        setEditorMode(
          "edit"
        );

        setForm(
          buildFormFromQuestion(
            savedQuestion
          )
        );
      }

      setQuestionSymbolsOpen(
        false
      );

      setActiveChoicePickerIndex(
        null
      );

      setMessage(
        t(
          "quizEdit.messages.saved"
        )
      );
    } catch (
      error
    ) {
      console.error(
        "Unable to save question:",
        error
      );

      setMessage(
        t(
          "quizEdit.messages.saveError"
        )
      );
    } finally {
      setProcessing(
        ""
      );
    }
  }

  /* =========================================================
     Delete
     ========================================================= */

  function openDeleteModal() {
    if (
      !selectedQuestion ||
      processing
    ) {
      return;
    }

    setDeleteModalOpen(
      true
    );
  }

  function closeDeleteModal() {
    if (
      processing ===
      "deleting"
    ) {
      return;
    }

    setDeleteModalOpen(
      false
    );
  }

  async function handleDeleteQuestion() {
    if (
      !selectedQuestion ||
      processing
    ) {
      return;
    }

    setProcessing(
      "deleting"
    );

    try {
      const result =
        await deleteQuestion(
          selectedQuestion.id,
          quizId
        );

      if (
        !result.success
      ) {
        setMessage(
          t(
            "quizEdit.messages.deleteError"
          )
        );

        setDeleteModalOpen(
          false
        );

        return;
      }

      const updatedQuestions =
        await getQuizQuestions(
          quizId
        );

      setQuestions(
        updatedQuestions
      );

      setDeleteModalOpen(
        false
      );

      setQuestionSymbolsOpen(
        false
      );

      setActiveChoicePickerIndex(
        null
      );

      if (
        updatedQuestions.length >
        0
      ) {
        const next =
          updatedQuestions[
            0
          ];

        setSelectedQuestionId(
          next.id
        );

        setEditorMode(
          "edit"
        );

        setForm(
          buildFormFromQuestion(
            next
          )
        );
      } else {
        setSelectedQuestionId(
          null
        );

        setEditorMode(
          "create"
        );

        setForm(
          createEmptyForm()
        );
      }

      setMessage(
        t(
          "quizEdit.messages.deleted"
        )
      );
    } catch (
      error
    ) {
      console.error(
        "Unable to delete question:",
        error
      );

      setMessage(
        t(
          "quizEdit.messages.deleteError"
        )
      );

      setDeleteModalOpen(
        false
      );
    } finally {
      setProcessing(
        ""
      );
    }
  }

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
          <button
            type="button"
            className="app-button app-button-secondary"
            onClick={
              handleBack
            }
          >
            ←{" "}
            {t(
              "quizEdit.backQuiz"
            )}
          </button>

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
                styles.titleBlock
              }
            >
              <span
                className={
                  styles.badge
                }
              >
                {t(
                  "quizEdit.badge"
                )}
              </span>

              <h1>
                {t(
                  "quizEdit.title"
                )}
              </h1>

              <p
                className={
                  styles.quizTitle
                }
              >
                {quiz.title}
              </p>

              <p
                className={
                  styles.description
                }
              >
                {t(
                  "quizEdit.subtitle"
                )}
              </p>
            </div>

            <span
              className={
                styles.statusBadge
              }
            >
              {t(
                "quizEdit.statusDraft"
              )}
            </span>
          </header>

          {/* =================================================
              Main progress
              ================================================= */}

          <section
            className={
              styles.progressGrid
            }
          >
            <article
              className={
                styles.progressCard
              }
            >
              <span>
                {t(
                  "quizEdit.progress.questions"
                )}
              </span>

              <strong>
                {questionCount}
                {" / "}
                {quiz.targetQuestions}
              </strong>

              <small>
                {remainingQuestions}
                {" "}
                {t(
                  "quizEdit.progress.questionsRemaining"
                )}
              </small>
            </article>

            <article
              className={
                styles.progressCard
              }
            >
              <span>
                {t(
                  "quizEdit.progress.points"
                )}
              </span>

              <strong>
                {assignedPoints}
                {" / "}
                {quiz.totalPoints}
              </strong>

              <small>
                {remainingPoints}
                {" "}
                {t(
                  "quizEdit.progress.pointsRemaining"
                )}
              </small>
            </article>

            <article
              className={`${styles.progressCard} ${
                structureComplete
                  ? styles.completeCard
                  : ""
              }`}
            >
              <span>
                {t(
                  "quizEdit.progress.structure"
                )}
              </span>

              <strong>
                {structureComplete
                  ? t(
                      "quizEdit.progress.complete"
                    )
                  : t(
                      "quizEdit.progress.incomplete"
                    )}
              </strong>

              <small>
                {structureComplete
                  ? t(
                      "quizEdit.progress.ready"
                    )
                  : t(
                      "quizEdit.progress.keepEditing"
                    )}
              </small>
            </article>
          </section>

          {/* =================================================
              Question type counters
              ================================================= */}

          <section
            className={
              styles.typeStatsSection
            }
          >
            <div
              className={
                styles.typeStatsHeader
              }
            >
              <div>
                <h2>
                  {t(
                    "quizEdit.typeStats.title"
                  )}
                </h2>

                <p>
                  {t(
                    "quizEdit.typeStats.description"
                  )}
                </p>
              </div>

              <span
                className={
                  styles.totalLimitBadge
                }
              >
                {questionCount}
                {" / "}
                {
                  LIMITS
                    .MAX_QUESTIONS_PER_QUIZ
                }
                {" "}
                {t(
                  "quizEdit.typeStats.total"
                )}
              </span>
            </div>

            <div
              className={
                styles.typeStatsGrid
              }
            >
              <article
                className={
                  styles.typeStatCard
                }
              >
                <span>
                  {t(
                    "quizEdit.typeStats.qcm"
                  )}
                </span>

                <strong>
                  {qcmCount}
                </strong>

                <small>
                  {t(
                    "quizEdit.typeStats.qcmHelp"
                  )}
                </small>
              </article>

              <article
                className={
                  styles.typeStatCard
                }
              >
                <span>
                  {t(
                    "quizEdit.typeStats.multipleChoice"
                  )}
                </span>

                <strong>
                  {multipleChoiceCount}
                </strong>

                <small>
                  {t(
                    "quizEdit.typeStats.multipleChoiceHelp"
                  )}
                </small>
              </article>

              <article
                className={
                  styles.typeStatCard
                }
              >
                <span>
                  {t(
                    "quizEdit.typeStats.development"
                  )}
                </span>

                <strong>
                  {developmentCount}
                  {" / "}
                  {
                    LIMITS
                      .MAX_DEVELOPMENT_QUESTIONS
                  }
                </strong>

                <small>
                  {t(
                    "quizEdit.typeStats.developmentHelp"
                  )}
                </small>
              </article>

              <article
                className={`${styles.typeStatCard} ${
                  automaticQuestionCount >=
                  LIMITS
                    .MAX_QCM_QUESTIONS
                    ? styles.limitReachedCard
                    : ""
                }`}
              >
                <span>
                  {t(
                    "quizEdit.typeStats.autoGraded"
                  )}
                </span>

                <strong>
                  {automaticQuestionCount}
                  {" / "}
                  {
                    LIMITS
                      .MAX_QCM_QUESTIONS
                  }
                </strong>

                <small>
                  {t(
                    "quizEdit.typeStats.autoGradedHelp"
                  )}
                </small>
              </article>
            </div>
          </section>

          {/* =================================================
              Editor layout
              ================================================= */}

          <div
            className={
              styles.editorLayout
            }
          >
            {/* ===============================================
                Question navigator
                =============================================== */}

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
                <div>
                  <h2>
                    {t(
                      "quizEdit.questions.title"
                    )}
                  </h2>

                  <p>
                    {questionCount}
                    {" / "}
                    {quiz.targetQuestions}
                  </p>
                </div>

                <button
                  type="button"
                  className={
                    styles.addQuestionButton
                  }
                  disabled={
                    !canAddQuestion
                  }
                  onClick={
                    handleNewQuestion
                  }
                  aria-label={t(
                    "quizEdit.questions.add"
                  )}
                >
                  ＋
                </button>
              </div>

              <div
                className={
                  styles.miniTypeCounters
                }
              >
                <span>
                  {t(
                    "quizEdit.typeStats.qcm"
                  )}{" "}
                  <strong>
                    {qcmCount}
                  </strong>
                </span>

                <span>
                  MULTI{" "}
                  <strong>
                    {multipleChoiceCount}
                  </strong>
                </span>

                <span>
                  DEV{" "}
                  <strong>
                    {developmentCount}
                  </strong>
                </span>
              </div>

              <div
                className={
                  styles.questionList
                }
              >
                {questions.map(
                  (
                    question,
                    index
                  ) => {
                    const selected =
                      question.id ===
                      selectedQuestionId;

                    return (
                      <button
                        key={
                          question.id
                        }
                        type="button"
                        className={`${styles.questionItem} ${
                          selected
                            ? styles.questionItemSelected
                            : ""
                        }`}
                        onClick={() =>
                          handleSelectQuestion(
                            question
                          )
                        }
                      >
                        <span
                          className={
                            styles.questionNumber
                          }
                        >
                          {String(
                            index +
                              1
                          ).padStart(
                            2,
                            "0"
                          )}
                        </span>

                        <span
                          className={
                            styles.questionItemContent
                          }
                        >
                          <strong>
                            {getQuestionTypeShortLabel(
                              question
                            )}
                          </strong>

                          <small>
                            {getQuestionLabel(
                              question
                            ) ||
                              t(
                                "quizEdit.questions.untitled"
                              )}
                          </small>
                        </span>

                        <span
                          className={
                            styles.questionPoints
                          }
                        >
                          {question.points}
                          {" "}
                          {t(
                            "quizEdit.questions.pointsShort"
                          )}
                        </span>
                      </button>
                    );
                  }
                )}

                {questions.length ===
                  0 && (
                  <div
                    className={
                      styles.emptyQuestions
                    }
                  >
                    <strong>
                      {t(
                        "quizEdit.questions.emptyTitle"
                      )}
                    </strong>

                    <p>
                      {t(
                        "quizEdit.questions.emptyText"
                      )}
                    </p>
                  </div>
                )}
              </div>

              <button
                type="button"
                className="app-button app-button-full"
                disabled={
                  !canAddQuestion
                }
                onClick={
                  handleNewQuestion
                }
              >
                ＋{" "}
                {t(
                  "quizEdit.questions.add"
                )}
              </button>
            </aside>

            {/* ===============================================
                Question editor
                =============================================== */}

            <section
              className={
                styles.editorPanel
              }
            >
              <div
                className={
                  styles.editorHeader
                }
              >
                <div>
                  <span
                    className={
                      styles.editorEyebrow
                    }
                  >
                    {editorMode ===
                    "create"
                      ? t(
                          "quizEdit.editor.newQuestion"
                        )
                      : t(
                          "quizEdit.editor.editQuestion"
                        )}
                  </span>

                  <h2>
                    {editorMode ===
                    "create"
                      ? t(
                          "quizEdit.editor.createTitle"
                        )
                      : selectedQuestion
                        ? `${t(
                            "quizEdit.editor.question"
                          )} ${selectedQuestion.order}`
                        : t(
                            "quizEdit.editor.question"
                          )}
                  </h2>
                </div>

                {editorMode ===
                  "edit" &&
                  selectedQuestion && (
                    <button
                      type="button"
                      className="app-button app-button-secondary"
                      onClick={
                        openDeleteModal
                      }
                    >
                      {t(
                        "quizEdit.actions.delete"
                      )}
                    </button>
                  )}
              </div>

              <form
                className={
                  styles.editorForm
                }
                onSubmit={
                  handleSubmit
                }
              >
                {/* ===========================================
                    Type
                    =========================================== */}

                <label>
                  {t(
                    "quizEdit.editor.type"
                  )}

                  <select
                    value={
                      form.type
                    }
                    onChange={(
                      event
                    ) =>
                      handleTypeChange(
                        event.target
                          .value as QuestionType
                      )
                    }
                  >
                    <option
                      value="qcm"
                      disabled={
                        !qcmTypeAvailable &&
                        form.type !==
                          "qcm"
                      }
                    >
                      {t(
                    "quizEdit.typeStats.qcm"
                  )} — {t(
                    "quizEdit.typeStats.qcmHelp"
                  )}
                    </option>

                    <option
                      value="multiple_choice"
                      disabled={
                        !multipleChoiceTypeAvailable &&
                        form.type !==
                          "multiple_choice"
                      }
                    >
                      {t(
                    "quizEdit.multipleChoice.option"
                  )}
                    </option>

                    <option
                      value="development"
                      disabled={
                        !developmentTypeAvailable &&
                        form.type !==
                          "development"
                      }
                    >
                      {t(
                        "quizEdit.editor.development"
                      )}
                    </option>
                  </select>

                  <small>
                    {form.type ===
                    "development"
                      ? `${developmentCount} / ${LIMITS.MAX_DEVELOPMENT_QUESTIONS} ${t(
                          "quizEdit.editor.developmentCounterLabel"
                        )}`
                      : `${automaticQuestionCount} / ${LIMITS.MAX_QCM_QUESTIONS} ${t(
                          "quizEdit.editor.automaticCounterLabel"
                        )}`}
                  </small>
                </label>

                {/* ===========================================
                    Question text
                    =========================================== */}

                <label>
                  {t(
                    "quizEdit.editor.questionText"
                  )}

                  <button
                    type="button"
                    className={
                      styles.symbolToggleButton
                    }
                    onClick={() =>
                      setQuestionSymbolsOpen(
                        (
                          current
                        ) =>
                          !current
                      )
                    }
                    aria-expanded={
                      questionSymbolsOpen
                    }
                  >
                    Ω{" "}
                    {t(
                      "quizEdit.editor.specialCharacters"
                    )}
                  </button>

                  {questionSymbolsOpen && (
                    <SpecialCharactersPicker
                      onInsert={
                        insertQuestionCharacter
                      }
                    />
                  )}

                  <textarea
                    ref={
                      questionTextRef
                    }
                    value={
                      form.text
                    }
                    maxLength={
                      MAX_QUESTION_LENGTH
                    }
                    placeholder={t(
                      "quizEdit.editor.questionPlaceholder"
                    )}
                    onChange={(
                      event
                    ) =>
                      updateForm(
                        "text",
                        event.target
                          .value
                      )
                    }
                  />

                  <small>
                    {form.text.length}
                    {" / "}
                    {
                      MAX_QUESTION_LENGTH
                    }{" "}
                    {t(
                      "quizEdit.editor.characters"
                    )}
                  </small>
                </label>

                {/* ===========================================
                    Points
                    =========================================== */}

                <label
                  className={
                    styles.pointsField
                  }
                >
                  {t(
                    "quizEdit.editor.points"
                  )}

                  <input
                    type="number"
                    min={1}
                    max={
                      getMaximumPointsForCurrentQuestion()
                    }
                    step={1}
                    value={
                      form.points
                    }
                    onChange={(
                      event
                    ) =>
                      updateForm(
                        "points",
                        Number(
                          event.target
                            .value
                        )
                      )
                    }
                  />

                  <small>
                    {t(
                      "quizEdit.editor.maximum"
                    )}{" "}
                    {
                      getMaximumPointsForCurrentQuestion()
                    }
                  </small>
                </label>

                {/* ===========================================
                    {t(
                    "quizEdit.typeStats.qcm"
                  )} + MULTI answers
                    =========================================== */}

                {(form.type ===
                  "qcm" ||
                  form.type ===
                    "multiple_choice") && (
                  <fieldset
                    className={
                      styles.choicesSection
                    }
                  >
                    <legend>
                      {form.type ===
                      "multiple_choice"
                        ? t(
                            "quizEdit.multipleChoice.answersTitle"
                          )
                        : t(
                            "quizEdit.editor.answers"
                          )}
                    </legend>

                    <p
                      className={
                        styles.choiceHelp
                      }
                    >
                      {form.type ===
                      "multiple_choice"
                        ? t(
                            "quizEdit.multipleChoice.answersHelp"
                          )
                        : t(
                            "quizEdit.editor.answersHelp"
                          )}
                    </p>

                    {form.type ===
                      "multiple_choice" && (
                      <div
                        className={
                          styles.multipleChoiceNotice
                        }
                      >
                        <strong>
                          {t(
                    "quizEdit.typeStats.multipleChoice"
                  )}
                        </strong>

                        <span>
                          {
                            form
                              .correctChoiceIndexes
                              .length
                          }{" "}
                          {form.correctChoiceIndexes.length ===
                          1
                            ? t(
                                "quizEdit.multipleChoice.correctAnswerSelected"
                              )
                            : t(
                                "quizEdit.multipleChoice.correctAnswersSelected"
                              )}
                        </span>
                      </div>
                    )}

                    <div
                      className={
                        styles.choiceList
                      }
                    >
                      {form.choices.map(
                        (
                          choice,
                          index
                        ) => {
                          const correct =
                            form.type ===
                            "multiple_choice"
                              ? form
                                  .correctChoiceIndexes
                                  .includes(
                                    index
                                  )
                              : form.correctChoiceIndex ===
                                index;

                          return (
                            <div
                              key={
                                index
                              }
                              className={
                                styles.choiceBlock
                              }
                            >
                              <div
                                className={`${styles.choiceRow} ${
                                  correct
                                    ? styles.correctChoice
                                    : ""
                                }`}
                              >
                                <label
                                  className={
                                    styles.correctSelector
                                  }
                                  title={
                                    form.type ===
                                    "multiple_choice"
                                      ? t(
                                          "quizEdit.editor.toggleCorrectAnswer"
                                        )
                                      : t(
                                          "quizEdit.editor.correctAnswer"
                                        )
                                  }
                                >
                                  <input
                                    type={
                                      form.type ===
                                      "multiple_choice"
                                        ? "checkbox"
                                        : "radio"
                                    }
                                    name={
                                      form.type ===
                                      "multiple_choice"
                                        ? `correct-choice-${index}`
                                        : "correct-choice"
                                    }
                                    checked={
                                      correct
                                    }
                                    onChange={() => {
                                      if (
                                        form.type ===
                                        "multiple_choice"
                                      ) {
                                        toggleMultipleCorrectChoice(
                                          index
                                        );
                                      } else {
                                        updateForm(
                                          "correctChoiceIndex",
                                          index
                                        );
                                      }
                                    }}
                                  />

                                  <span>
                                    {String.fromCharCode(
                                      65 +
                                        index
                                    )}
                                  </span>
                                </label>

                                <input
                                  ref={(
                                    element
                                  ) => {
                                    choiceRefs.current[
                                      index
                                    ] =
                                      element;
                                  }}
                                  type="text"
                                  value={
                                    choice
                                  }
                                  maxLength={
                                    MAX_CHOICE_LENGTH
                                  }
                                  placeholder={`${t(
                                    "quizEdit.editor.answer"
                                  )} ${
                                    index +
                                    1
                                  }`}
                                  onChange={(
                                    event
                                  ) =>
                                    updateChoice(
                                      index,
                                      event.target
                                        .value
                                    )
                                  }
                                />

                                <button
                                  type="button"
                                  className={
                                    styles.choiceSymbolButton
                                  }
                                  onClick={() =>
                                    setActiveChoicePickerIndex(
                                      (
                                        current
                                      ) =>
                                        current ===
                                        index
                                          ? null
                                          : index
                                    )
                                  }
                                  aria-expanded={
                                    activeChoicePickerIndex ===
                                    index
                                  }
                                  aria-label={t(
                                    "quizEdit.editor.specialCharacters"
                                  )}
                                >
                                  Ω
                                </button>

                                <button
                                  type="button"
                                  className={
                                    styles.removeChoiceButton
                                  }
                                  disabled={
                                    form
                                      .choices
                                      .length <=
                                    2
                                  }
                                  onClick={() =>
                                    removeChoice(
                                      index
                                    )
                                  }
                                  aria-label={t(
                                    "quizEdit.editor.removeAnswer"
                                  )}
                                >
                                  ×
                                </button>
                              </div>

                              {activeChoicePickerIndex ===
                                index && (
                                <SpecialCharactersPicker
                                  onInsert={(
                                    value
                                  ) =>
                                    insertChoiceCharacter(
                                      index,
                                      value
                                    )
                                  }
                                />
                              )}
                            </div>
                          );
                        }
                      )}
                    </div>

                    <button
                      type="button"
                      className={
                        styles.addChoiceButton
                      }
                      onClick={
                        addChoice
                      }
                    >
                      ＋{" "}
                      {t(
                        "quizEdit.editor.addAnswer"
                      )}
                    </button>
                  </fieldset>
                )}

                {/* ===========================================
                    Development
                    =========================================== */}

                {form.type ===
                  "development" && (
                  <div
                    className={
                      styles.developmentInfo
                    }
                  >
                    <strong>
                      {t(
                        "quizEdit.editor.developmentTitle"
                      )}
                    </strong>

                    <p>
                      {t(
                        "quizEdit.editor.developmentHelp"
                      )}
                    </p>
                  </div>
                )}

                {/* ===========================================
                    Message
                    =========================================== */}

                {message && (
                  <p
                    className={
                      styles.message
                    }
                    role="alert"
                  >
                    {message}
                  </p>
                )}

                {/* ===========================================
                    Actions
                    =========================================== */}

                <div
                  className={
                    styles.editorActions
                  }
                >
                  <button
                    type="submit"
                    className="app-button app-button-action"
                  >
                    {editorMode ===
                    "create"
                      ? t(
                          "quizEdit.actions.create"
                        )
                      : t(
                          "quizEdit.actions.save"
                        )}
                  </button>

                  {editorMode ===
                    "edit" &&
                    canAddQuestion && (
                      <button
                        type="button"
                        className="app-button app-button-secondary app-button-action"
                        onClick={
                          handleNewQuestion
                        }
                      >
                        {t(
                          "quizEdit.actions.newQuestion"
                        )}
                      </button>
                    )}
                </div>
              </form>
            </section>
          </div>
        </section>
      </main>

      {/* =====================================================
          Delete modal
          ===================================================== */}

      {deleteModalOpen &&
        selectedQuestion && (
          <div
            className={
              styles.deleteOverlay
            }
            onMouseDown={(
              event
            ) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                closeDeleteModal();
              }
            }}
          >
            <section
              className={
                styles.deleteModal
              }
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-question-title"
            >
              <header
                className={
                  styles.deleteModalHeader
                }
              >
                <div>
                  <span
                    className={
                      styles.deleteBadge
                    }
                  >
                    {t(
                      "quizEdit.deleteModal.badge"
                    )}
                  </span>

                  <h2
                    id="delete-question-title"
                  >
                    {t(
                      "quizEdit.deleteModal.title"
                    )}
                  </h2>
                </div>

                <button
                  type="button"
                  className={
                    styles.deleteCloseButton
                  }
                  onClick={
                    closeDeleteModal
                  }
                  aria-label={t(
                    "quizEdit.deleteModal.closeAria"
                  )}
                >
                  ×
                </button>
              </header>

              <div
                className={
                  styles.deleteContent
                }
              >
                <div
                  className={
                    styles.deleteWarningIcon
                  }
                  aria-hidden="true"
                >
                  !
                </div>

                <div
                  className={
                    styles.deleteText
                  }
                >
                  <p>
                    {t(
                      "quizEdit.deleteModal.confirm"
                    )}
                  </p>

                  <strong>
                    {
                      selectedQuestion.text
                    }
                  </strong>

                  <p
                    className={
                      styles.deleteWarningText
                    }
                  >
                    {t(
                      "quizEdit.deleteModal.warning"
                    )}
                  </p>
                </div>
              </div>

              <div
                className={
                  styles.deleteActions
                }
              >
                <button
                  type="button"
                  className="app-button app-button-danger app-button-action"
                  onClick={
                    handleDeleteQuestion
                  }
                >
                  {t(
                    "quizEdit.actions.delete"
                  )}
                </button>

                <button
                  type="button"
                  className="app-button app-button-secondary app-button-action"
                  onClick={
                    closeDeleteModal
                  }
                >
                  {t(
                    "quizEdit.actions.cancel"
                  )}
                </button>
              </div>
            </section>
          </div>
        )}
    </>
  );
}