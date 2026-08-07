"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  useParams,
  useRouter,
} from "next/navigation";

import AppLoading from "@/components/AppLoading";

import {
  deleteQuiz,
  getQuiz,
  launchQuiz,
  type Quiz,
} from "@/lib/services/quizzes";

import {
  useTeacher,
} from "@/hooks/useTeacher";

import {
  useLanguage,
} from "@/hooks/useLanguage";

import {
  formatInTimeZone,
} from "@/lib/dateTime";

import {
  formatQuizDuration,
} from "@/lib/quizDuration";

import styles from "./QuizDetailsPage.module.css";

/* =========================================================
   Types
   ========================================================= */

type ProcessingAction =
  | ""
  | "dashboard"
  | "edit"
  | "settings"
  | "students"
  | "launch"
  | "delete";

/* =========================================================
   Page
   ========================================================= */

export default function QuizDetailsPage() {
  const router =
    useRouter();

  const params =
    useParams();

  const {
    t,
    language,
  } = useLanguage();

  const quizId =
    String(
      params.quizId
    );

  const {
    teacher,
    loading:
      teacherLoading,
  } = useTeacher();

  const [
    quiz,
    setQuiz,
  ] =
    useState<Quiz | null>(
      null
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
    processing,
    setProcessing,
  ] =
    useState<ProcessingAction>(
      ""
    );

  const [
    deleteModalOpen,
    setDeleteModalOpen,
  ] =
    useState(false);

  /*
   * These values will later come from
   * student attempts/submissions.
   */
  const activeStudents =
    0;

  const finishedStudents =
    0;

  /* =========================================================
     Load quiz
     ========================================================= */

  useEffect(() => {
    let cancelled =
      false;

    async function loadQuiz() {
      try {
        const data =
          await getQuiz(
            quizId
          );

        if (
          !cancelled
        ) {
          setQuiz(
            data
          );
        }
      } catch (error) {
        console.error(
          "Error loading quiz:",
          error
        );

        if (
          !cancelled
        ) {
          setMessage(
            t(
              "quizDetails.messages.loadError"
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

    loadQuiz();

    return () => {
      cancelled =
        true;
    };
  }, [
    quizId,
    t,
  ]);

  /* =========================================================
     Delete modal:
     escape key + body scroll
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

    function handleKeyDown(
      event:
        KeyboardEvent
    ) {
      if (
        event.key ===
          "Escape" &&
        processing !==
          "delete"
      ) {
        setDeleteModalOpen(
          false
        );
      }
    }

    document.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      document.removeEventListener(
        "keydown",
        handleKeyDown
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
          "quizDetails.loading.openingTitle"
        )}
        subtitle={t(
          "quizDetails.loading.openingSubtitle"
        )}
      />
    );
  }

  if (processing) {
    let subtitle =
      t(
        "quizDetails.loading.pleaseWait"
      );

    switch (
      processing
    ) {
      case "dashboard":
        subtitle =
          t(
            "quizDetails.loading.dashboard"
          );
        break;

      case "edit":
        subtitle =
          t(
            "quizDetails.loading.edit"
          );
        break;

      case "settings":
        subtitle =
          t(
            "quizDetails.loading.settings"
          );
        break;

      case "students":
        subtitle =
          t(
            "quizDetails.loading.students"
          );
        break;

      case "launch":
        subtitle =
          t(
            "quizDetails.loading.launch"
          );
        break;

      case "delete":
        subtitle =
          t(
            "quizDetails.loading.delete"
          );
        break;
    }

    return (
      <AppLoading
        title="ULearn"
        subtitle={
          subtitle
        }
      />
    );
  }

  /* =========================================================
     Access
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
              "quizDetails.access.title"
            )}
          </h1>

          <p>
            {t(
              "quizDetails.access.text"
            )}
          </p>
        </section>
      </main>
    );
  }

  /* =========================================================
     Derived information
     ========================================================= */

  const timeZone =
    quiz.timeZone ||
    "America/Toronto";

  const now =
    Date.now();

  const deadlinePassed =
    quiz.availableUntil !==
      null &&
    new Date(
      quiz.availableUntil
    ).getTime() <=
      now;

  const accountExpired =
    new Date(
      teacher.expiresAt
    ).getTime() <=
    now;

  /* =========================================================
     Status translation
     ========================================================= */

  function getStatusLabel(
    status:
      Quiz["status"]
  ) {
    if (
      status ===
      "launched"
    ) {
      return t(
        "quizDetails.status.launched"
      );
    }

    if (
      status ===
      "closed"
    ) {
      return t(
        "quizDetails.status.closed"
      );
    }

    return t(
      "quizDetails.status.draft"
    );
  }

  /* =========================================================
     Launch
     ========================================================= */

  async function handleLaunch() {
    if (
      processing ||
      quiz.status !==
        "draft"
    ) {
      return;
    }

    setMessage("");

    setProcessing(
      "launch"
    );

    try {
      const result =
        await launchQuiz(
          quizId
        );

      if (
        !result.success
      ) {
        setMessage(
          t(
            "quizDetails.messages.launchError"
          )
        );

        setProcessing(
          ""
        );

        return;
      }

      const updated =
        await getQuiz(
          quizId
        );

      setQuiz(
        updated
      );

      setMessage(
        t(
          "quizDetails.messages.launchSuccess"
        )
      );
    } catch (error) {
      console.error(
        "Error launching quiz:",
        error
      );

      setMessage(
        t(
          "quizDetails.messages.launchError"
        )
      );
    } finally {
      setProcessing(
        ""
      );
    }
  }

  /* =========================================================
     Delete modal
     ========================================================= */

  function openDeleteModal() {
    if (
      processing
    ) {
      return;
    }

    setMessage("");

    setDeleteModalOpen(
      true
    );
  }

  function closeDeleteModal() {
    if (
      processing ===
      "delete"
    ) {
      return;
    }

    setDeleteModalOpen(
      false
    );
  }

  async function handleDelete() {
    if (
      processing ||
      !deleteModalOpen
    ) {
      return;
    }

    setMessage("");

    setProcessing(
      "delete"
    );

    try {
      const result =
        await deleteQuiz(
          quizId
        );

      if (
        !result.success
      ) {
        setMessage(
          t(
            "quizDetails.messages.deleteError"
          )
        );

        setProcessing(
          ""
        );

        setDeleteModalOpen(
          false
        );

        return;
      }

      router.push(
        "/dashboard"
      );
    } catch (error) {
      console.error(
        "Error deleting quiz:",
        error
      );

      setMessage(
        t(
          "quizDetails.messages.deleteError"
        )
      );

      setProcessing(
        ""
      );

      setDeleteModalOpen(
        false
      );
    }
  }

  /* =========================================================
     Navigation
     ========================================================= */

  function handleDashboard() {
    if (
      processing
    ) {
      return;
    }

    setProcessing(
      "dashboard"
    );

    router.push(
      "/dashboard"
    );
  }

  function handleEditQuiz() {
    if (
      processing ||
      quiz.status !==
        "draft"
    ) {
      return;
    }

    setProcessing(
      "edit"
    );

    router.push(
      `/quiz/${quiz.id}/edit`
    );
  }

  function handleQuizSettings() {
    if (
      processing ||
      quiz.status !==
        "draft"
    ) {
      return;
    }

    setProcessing(
      "settings"
    );

    router.push(
      `/quiz/${quiz.id}/settings`
    );
  }

  function handleStudents() {
    if (
      processing
    ) {
      return;
    }

    setProcessing(
      "students"
    );

    router.push(
      `/quiz/${quiz.id}/students`
    );
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
              handleDashboard
            }
          >
            ←{" "}
            {t(
              "quizDetails.backDashboard"
            )}
          </button>

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
              <h1>
                {
                  quiz.title
                }
              </h1>

              <p
                className={
                  styles.description
                }
              >
                {quiz.description ||
                  t(
                    "quizDetails.noDescription"
                  )}
              </p>
            </div>

            <span
              className={
                styles.statusBadge
              }
            >
              {getStatusLabel(
                quiz.status
              )}
            </span>
          </header>

          {/* =================================================
              SUMMARY
              ================================================= */}

          <div
            className={
              styles.summary
            }
          >
            <div
              className={
                styles.summaryItem
              }
            >
              <span>
                {t(
                  "quizDetails.summary.status"
                )}
              </span>

              <strong>
                {getStatusLabel(
                  quiz.status
                )}
              </strong>
            </div>

            <div
              className={
                styles.summaryItem
              }
            >
              <span>
                {t(
                  "quizDetails.summary.plannedQuestions"
                )}
              </span>

              <strong>
                {
                  quiz.targetQuestions
                }
              </strong>
            </div>

            <div
              className={
                styles.summaryItem
              }
            >
              <span>
                {t(
                  "quizDetails.summary.totalPoints"
                )}
              </span>

              <strong>
                {
                  quiz.totalPoints
                }
              </strong>
            </div>

            <div
              className={
                styles.summaryItem
              }
            >
              <span>
                {t(
                  "quizDetails.summary.activeStudents"
                )}
              </span>

              <strong>
                {
                  activeStudents
                }
                {" / "}
                {
                  quiz.maxStudents
                }
              </strong>
            </div>

            <div
              className={
                styles.summaryItem
              }
            >
              <span>
                {t(
                  "quizDetails.summary.finishedStudents"
                )}
              </span>

              <strong>
                {
                  finishedStudents
                }
                {" / "}
                {
                  quiz.maxStudents
                }
              </strong>
            </div>

            <div
              className={
                styles.summaryItem
              }
            >
              <span>
                {quiz.availabilityMode ===
                "open_window"
                  ? t(
                      "quizDetails.summary.timePerStudent"
                    )
                  : t(
                      "quizDetails.summary.sessionDuration"
                    )}
              </span>

              <strong>
                {formatQuizDuration(
                  quiz.timeLimitMinutes,
                  language
                )}
              </strong>
            </div>

            <div
              className={
                styles.summaryItem
              }
            >
              <span>
                {t(
                  "quizDetails.summary.mode"
                )}
              </span>

              <strong>
                {quiz.availabilityMode ===
                "open_window"
                  ? t(
                      "quizDetails.modes.openWindow"
                    )
                  : t(
                      "quizDetails.modes.scheduledSession"
                    )}
              </strong>
            </div>

            <div
              className={
                styles.summaryItem
              }
            >
              <span>
                {t(
                  "quizDetails.summary.timeZone"
                )}
              </span>

              <strong>
                {
                  timeZone
                }
              </strong>
            </div>

            <div
              className={
                styles.summaryItem
              }
            >
              <span>
                {t(
                  "quizDetails.summary.availableFrom"
                )}
              </span>

              <strong>
                {quiz.availableFrom
                  ? formatInTimeZone(
                      quiz.availableFrom,
                      timeZone
                    )
                  : t(
                      "quizDetails.summary.whenLaunched"
                    )}
              </strong>
            </div>

            <div
              className={
                styles.summaryItem
              }
            >
              <span>
                {t(
                  "quizDetails.summary.deadline"
                )}
              </span>

              <strong>
                {quiz.availableUntil
                  ? formatInTimeZone(
                      quiz.availableUntil,
                      timeZone
                    )
                  : t(
                      "quizDetails.summary.notSet"
                    )}
              </strong>
            </div>

            <div
              className={
                styles.summaryItem
              }
            >
              <span>
                {t(
                  "quizDetails.summary.accountExpires"
                )}
              </span>

              <strong>
                {formatInTimeZone(
                  teacher.expiresAt,
                  timeZone
                )}
              </strong>
            </div>

            <div
              className={
                styles.summaryItem
              }
            >
              <span>
                {t(
                  "quizDetails.summary.backNavigation"
                )}
              </span>

              <strong>
                {quiz.allowBackNavigation
                  ? t(
                      "quizDetails.values.allowed"
                    )
                  : t(
                      "quizDetails.values.disabled"
                    )}
              </strong>
            </div>

            <div
              className={
                styles.summaryItem
              }
            >
              <span>
                {t(
                  "quizDetails.summary.shuffleQuestions"
                )}
              </span>

              <strong>
                {quiz.shuffleQuestions
                  ? t(
                      "quizDetails.values.yes"
                    )
                  : t(
                      "quizDetails.values.no"
                    )}
              </strong>
            </div>

            <div
              className={
                styles.summaryItem
              }
            >
              <span>
                {t(
                  "quizDetails.summary.shuffleChoices"
                )}
              </span>

              <strong>
                {quiz.shuffleChoices
                  ? t(
                      "quizDetails.values.yes"
                    )
                  : t(
                      "quizDetails.values.no"
                    )}
              </strong>
            </div>

            <div
              className={
                styles.summaryItem
              }
            >
              <span>
                {t(
                  "quizDetails.summary.showFinalScore"
                )}
              </span>

              <strong>
                {quiz.showResultsToStudents
                  ? t(
                      "quizDetails.values.yes"
                    )
                  : t(
                      "quizDetails.values.no"
                    )}
              </strong>
            </div>

            <div
              className={
                styles.summaryItem
              }
            >
              <span>
                {t(
                  "quizDetails.summary.showCorrectAnswers"
                )}
              </span>

              <strong>
                {quiz.showCorrectAnswers
                  ? t(
                      "quizDetails.values.yes"
                    )
                  : t(
                      "quizDetails.values.no"
                    )}
              </strong>
            </div>
          </div>

          {/* =================================================
              MESSAGES
              ================================================= */}

          {deadlinePassed &&
            quiz.status ===
              "draft" && (
              <p
                className={
                  styles.message
                }
              >
                {t(
                  "quizDetails.messages.deadlinePassed"
                )}
              </p>
            )}

          {accountExpired && (
            <p
              className={
                styles.message
              }
            >
              {t(
                "quizDetails.messages.accountExpired"
              )}
            </p>
          )}

          {message && (
            <p
              className={
                styles.message
              }
            >
              {
                message
              }
            </p>
          )}

          {/* =================================================
              ACTIONS
              ================================================= */}

          <div
            className={
              styles.actions
            }
          >
            <button
              type="button"
              className="app-button"
              disabled={
                quiz.status !==
                  "draft" ||
                accountExpired
              }
              onClick={
                handleQuizSettings
              }
            >
              {t(
                "quizDetails.actions.settings"
              )}
            </button>

            <button
              type="button"
              className="app-button"
              disabled={
                quiz.status !==
                  "draft" ||
                accountExpired
              }
              onClick={
                handleEditQuiz
              }
            >
              {t(
                "quizDetails.actions.edit"
              )}
            </button>

            <button
              type="button"
              className="app-button"
              disabled={
                quiz.status !==
                  "draft" ||
                deadlinePassed ||
                accountExpired
              }
              onClick={
                handleLaunch
              }
            >
              {t(
                "quizDetails.actions.launch"
              )}
            </button>

            <button
              type="button"
              className="app-button"
              onClick={
                handleStudents
              }
            >
              {t(
                "quizDetails.actions.students"
              )}
            </button>

            <button
              type="button"
              className="app-button app-button-secondary app-button-action"
              onClick={
                openDeleteModal
              }
            >
              {t(
                "quizDetails.actions.delete"
              )}
            </button>
          </div>
        </section>
      </main>

      {/* =====================================================
          CUSTOM DELETE CONFIRMATION
          ===================================================== */}

      {deleteModalOpen && (
        <div
          className={
            styles.deleteOverlay
          }
          role="presentation"
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
            aria-labelledby="delete-quiz-title"
            aria-describedby="delete-quiz-description"
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
                    "quizDetails.deleteModal.badge"
                  )}
                </span>

                <h2
                  id="delete-quiz-title"
                >
                  {t(
                    "quizDetails.deleteModal.title"
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
                  "quizDetails.deleteModal.closeAria"
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
                <p
                  id="delete-quiz-description"
                >
                  {t(
                    "quizDetails.deleteModal.confirmBefore"
                  )}{" "}

                  <strong>
                    “{quiz.title}”
                  </strong>

                  ?
                </p>

                <p
                  className={
                    styles.deleteWarningText
                  }
                >
                  {t(
                    "quizDetails.deleteModal.warning"
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
                  handleDelete
                }
              >
                {t(
                  "quizDetails.actions.delete"
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
                  "quizDetails.actions.cancel"
                )}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}