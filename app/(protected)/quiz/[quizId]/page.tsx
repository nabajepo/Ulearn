"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  useParams,
  useRouter,
} from "next/navigation";

import QRCode from "qrcode";

import AppLoading from "@/components/AppLoading";

import {
  deleteQuiz,
  getQuiz,
  getQuizStructureProgress,
  launchQuiz,
  type Quiz,
  type QuizStructureProgress,
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

type CopiedField =
  | ""
  | "code"
  | "link";

/* =========================================================
   Empty structure
   ========================================================= */

const EMPTY_STRUCTURE:
  QuizStructureProgress = {
  totalQuestions: 0,

  qcmQuestions: 0,

  developmentQuestions: 0,

  assignedPoints: 0,
};

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
      params.quizId ??
        ""
    ).trim();

  const {
    teacher,
    loading:
      teacherLoading,
  } = useTeacher();

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
    structure,
    setStructure,
  ] =
    useState<QuizStructureProgress>(
      EMPTY_STRUCTURE
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

  const [
    deleteModalOpen,
    setDeleteModalOpen,
  ] =
    useState(false);

  const [
    studentAccessOpen,
    setStudentAccessOpen,
  ] =
    useState(false);

  const [
    appOrigin,
    setAppOrigin,
  ] =
    useState("");

  const [
    copiedField,
    setCopiedField,
  ] =
    useState<CopiedField>(
      ""
    );

  const [
    qrCodeDataUrl,
    setQrCodeDataUrl,
  ] =
    useState("");

  const [
    qrCodeGenerating,
    setQrCodeGenerating,
  ] =
    useState(false);

  /*
   * Temporary values.
   *
   * Later these will come from
   * the student attempts collection.
   */
  const activeStudents =
    0;

  const finishedStudents =
    0;

  /* =========================================================
     Student URL
     
     IMPORTANT:
     This value is intentionally calculated BEFORE all
     conditional returns because the QR useEffect depends
     on it.
     
     quiz may still be null during loading, therefore
     optional chaining is required.
     ========================================================= */

  const studentUrl =
    quiz?.accessCode &&
    appOrigin
      ? `${appOrigin}/join/${quiz.accessCode}`
      : "";

  /* =========================================================
     Browser origin
     ========================================================= */

  useEffect(() => {
    setAppOrigin(
      window.location.origin
    );
  }, []);

  /* =========================================================
     Load quiz + structure
     ========================================================= */

  useEffect(() => {
    let cancelled =
      false;

    async function loadQuiz() {
      try {
        const [
          quizData,
          structureData,
        ] =
          await Promise.all([
            getQuiz(
              quizId
            ),

            getQuizStructureProgress(
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

        setStructure(
          structureData
        );
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
     Modal behavior
     ========================================================= */

  useEffect(() => {
    if (
      !deleteModalOpen &&
      !studentAccessOpen
    ) {
      return;
    }

    const previousOverflow =
      document.body.style
        .overflow;

    document.body.style
      .overflow =
      "hidden";

    function handleKeyDown(
      event:
        KeyboardEvent
    ) {
      if (
        event.key !==
        "Escape"
      ) {
        return;
      }

      /*
       * Do not allow the modal to close
       * while a destructive delete is running.
       */
      if (
        processing ===
        "delete"
      ) {
        return;
      }

      if (
        deleteModalOpen
      ) {
        setDeleteModalOpen(
          false
        );
      }

      if (
        studentAccessOpen
      ) {
        setStudentAccessOpen(
          false
        );
      }
    }

    document.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      document.body.style
        .overflow =
        previousOverflow;

      document.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
    deleteModalOpen,
    studentAccessOpen,
    processing,
  ]);

  /* =========================================================
     Copy confirmation
     ========================================================= */

  useEffect(() => {
    if (
      !copiedField
    ) {
      return;
    }

    const timer =
      window.setTimeout(
        () => {
          setCopiedField(
            ""
          );
        },
        1800
      );

    return () => {
      window.clearTimeout(
        timer
      );
    };
  }, [
    copiedField,
  ]);

  /* =========================================================
     QR code generation

     IMPORTANT:
     This Hook MUST stay before every conditional return.

     Previous problem:
     -----------------
     This effect was below:

       if (loading) return ...
       if (processing) return ...
       if (!quiz) return ...

     React therefore saw a different number/order of Hooks
     between renders.

     Now every render always reaches this Hook.
     ========================================================= */

  useEffect(() => {
    let cancelled =
      false;

    async function generateQrCode() {
      /*
       * During initial loading studentUrl is empty.
       * That is completely normal.
       */
      if (
        !studentUrl
      ) {
        if (
          !cancelled
        ) {
          setQrCodeDataUrl(
            ""
          );

          setQrCodeGenerating(
            false
          );
        }

        return;
      }

      setQrCodeGenerating(
        true
      );

      try {
        const dataUrl =
          await QRCode.toDataURL(
            studentUrl,
            {
              width:
                320,

              margin:
                2,

              errorCorrectionLevel:
                "M",
            }
          );

        if (
          !cancelled
        ) {
          setQrCodeDataUrl(
            dataUrl
          );
        }
      } catch (error) {
        console.error(
          "Unable to generate QR code:",
          error
        );

        if (
          !cancelled
        ) {
          setQrCodeDataUrl(
            ""
          );
        }
      } finally {
        if (
          !cancelled
        ) {
          setQrCodeGenerating(
            false
          );
        }
      }
    }

    generateQrCode();

    return () => {
      cancelled =
        true;
    };
  }, [
    studentUrl,
  ]);

  /* =========================================================
     IMPORTANT
     
     No React Hook may be placed below this point.
     
     From here onward we may safely use conditional returns.
     ========================================================= */

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

  /* =========================================================
     Processing
     ========================================================= */

  if (
    processing
  ) {
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
     Derived quiz information
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
     Real structure progress
     ========================================================= */

  const remainingQuestions =
    Math.max(
      0,

      quiz.targetQuestions -
        structure.totalQuestions
    );

  const remainingPoints =
    Math.max(
      0,

      quiz.totalPoints -
        structure.assignedPoints
    );

  const questionsComplete =
    structure.totalQuestions ===
    quiz.targetQuestions;

  const pointsComplete =
    structure.assignedPoints ===
    quiz.totalPoints;

  const structureComplete =
    questionsComplete &&
    pointsComplete;

  /* =========================================================
     Student access
     ========================================================= */

  const showStudentAccess =
    quiz.status !==
      "draft" &&
    Boolean(
      quiz.accessCode
    );

  /* =========================================================
     Download QR code
     ========================================================= */

  function downloadQrCode() {
    if (
      !qrCodeDataUrl ||
      !quiz.accessCode
    ) {
      return;
    }

    const link =
      document.createElement(
        "a"
      );

    link.href =
      qrCodeDataUrl;

    link.download =
      `ulearn-quiz-${quiz.accessCode}-qr.png`;

    document.body.appendChild(
      link
    );

    link.click();

    link.remove();
  }

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
     Clipboard
     ========================================================= */

  async function copyToClipboard(
    value: string,
    field: CopiedField
  ) {
    if (
      !value ||
      !field
    ) {
      return;
    }

    try {
      await navigator
        .clipboard
        .writeText(
          value
        );

      setCopiedField(
        field
      );
    } catch (error) {
      console.error(
        "Unable to copy:",
        error
      );

      setMessage(
        t(
          "quizDetails.studentAccess.copyError"
        )
      );
    }
  }

  /* =========================================================
     Launch
     ========================================================= */

  async function handleLaunch() {
    if (
      processing ||
      quiz.status !==
        "draft" ||
      !structureComplete ||
      deadlinePassed ||
      accountExpired
    ) {
      return;
    }

    setMessage(
      ""
    );

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
          result.message ||
            t(
              "quizDetails.messages.launchError"
            )
        );

        return;
      }

      const [
        updatedQuiz,
        updatedStructure,
      ] =
        await Promise.all([
          getQuiz(
            quizId
          ),

          getQuizStructureProgress(
            quizId
          ),
        ]);

      setQuiz(
        updatedQuiz
      );

      setStructure(
        updatedStructure
      );

      setMessage(
        t(
          "quizDetails.messages.launchSuccess"
        )
      );

      /*
       * Once updatedQuiz contains the generated accessCode,
       * studentUrl changes.
       *
       * The QR effect above will then automatically generate
       * the QR code.
       */
      setStudentAccessOpen(
        true
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
    /*
     * A launched or closed quiz must not
     * be deletable from this interface.
     */
    if (
      processing ||
      quiz.status !==
        "draft"
    ) {
      return;
    }

    setMessage(
      ""
    );

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
    /*
     * Second protection:
     * even if the modal somehow remained open,
     * deletion is refused if the quiz is not draft.
     */
    if (
      processing ||
      !deleteModalOpen ||
      quiz.status !==
        "draft"
    ) {
      return;
    }

    setMessage(
      ""
    );

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
          {/* =================================================
              Dashboard
              ================================================= */}

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
              Summary
              ================================================= */}

          <div
            className={
              styles.summary
            }
          >
            {/* Status */}

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

            {/* Questions */}

            <div
              className={
                styles.summaryItem
              }
            >
              <span>
                {t(
                  "quizDetails.summary.createdQuestions"
                )}
              </span>

              <strong>
                {
                  structure.totalQuestions
                }
                {" / "}
                {
                  quiz.targetQuestions
                }
              </strong>

              <small>
                {questionsComplete
                  ? t(
                      "quizDetails.structure.complete"
                    )
                  : `${remainingQuestions} ${t(
                      "quizDetails.structure.questionsRemaining"
                    )}`}
              </small>
            </div>

            {/* Points */}

            <div
              className={
                styles.summaryItem
              }
            >
              <span>
                {t(
                  "quizDetails.summary.assignedPoints"
                )}
              </span>

              <strong>
                {
                  structure.assignedPoints
                }
                {" / "}
                {
                  quiz.totalPoints
                }
              </strong>

              <small>
                {pointsComplete
                  ? t(
                      "quizDetails.structure.complete"
                    )
                  : `${remainingPoints} ${t(
                      "quizDetails.structure.pointsRemaining"
                    )}`}
              </small>
            </div>

            {/* Active students */}

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

            {/* Finished students */}

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

            {/* Structure */}

            <div
              className={
                styles.summaryItem
              }
            >
              <span>
                {t(
                  "quizDetails.structure.title"
                )}
              </span>

              <strong>
                {structureComplete
                  ? t(
                      "quizDetails.structure.ready"
                    )
                  : t(
                      "quizDetails.structure.incomplete"
                    )}
              </strong>

              <small>
                {structureComplete
                  ? t(
                      "quizDetails.structure.readyText"
                    )
                  : t(
                      "quizDetails.structure.incompleteText"
                    )}
              </small>
            </div>

            {/* Duration */}

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

            {/* Mode */}

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

            {/* Time zone */}

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

            {/* Available from */}

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

            {/* Deadline */}

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

            {/* Account expiration */}

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

            {/* Back navigation */}

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

            {/* Shuffle questions */}

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

            {/* Shuffle choices */}

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

            {/* Final score */}

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

            {/* Correct answers */}

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
              Structure warning
              ================================================= */}

          {quiz.status ===
            "draft" &&
            !structureComplete && (
              <p
                className={
                  styles.message
                }
              >
                {t(
                  "quizDetails.structure.launchBlocked"
                )}
              </p>
            )}

          {/* =================================================
              Deadline
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

          {/* =================================================
              Account expired
              ================================================= */}

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

          {/* =================================================
              Message
              ================================================= */}

          {message && (
            <p
              className={
                styles.message
              }
              role="status"
            >
              {
                message
              }
            </p>
          )}

          {/* =================================================
              Actions
              ================================================= */}

          <div
            className={
              styles.actions
            }
          >
            {/* Settings */}

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

            {/* Edit */}

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

            {/* Launch */}

            <button
              type="button"
              className="app-button"
              disabled={
                quiz.status !==
                  "draft" ||
                !structureComplete ||
                deadlinePassed ||
                accountExpired
              }
              onClick={
                handleLaunch
              }
              title={
                !structureComplete
                  ? t(
                      "quizDetails.structure.launchBlocked"
                    )
                  : undefined
              }
            >
              {t(
                "quizDetails.actions.launch"
              )}
            </button>

            {/* Students */}

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

            {/* Delete */}

            <button
              type="button"
              className="app-button app-button-secondary app-button-action"
              disabled={
                quiz.status !==
                "draft"
              }
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
          Floating Student Access
          ===================================================== */}

      {showStudentAccess &&
        quiz.accessCode && (
          <button
            type="button"
            className={
              styles.studentAccessFloatingButton
            }
            onClick={() => {
              setStudentAccessOpen(
                true
              );
            }}
            aria-haspopup="dialog"
            aria-expanded={
              studentAccessOpen
            }
          >
            <span
              className={
                styles.studentAccessFloatingIcon
              }
              aria-hidden="true"
            >
              ↗
            </span>

            <span
              className={
                styles.studentAccessFloatingText
              }
            >
              {t(
                "quizDetails.studentAccess.button"
              )}
            </span>
          </button>
        )}

      {/* =====================================================
          Student Access Modal
          ===================================================== */}

      {studentAccessOpen &&
        quiz.accessCode && (
          <div
            className={
              styles.studentAccessOverlay
            }
            onMouseDown={(
              event
            ) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                setStudentAccessOpen(
                  false
                );
              }
            }}
          >
            <section
              className={
                styles.studentAccessModal
              }
              role="dialog"
              aria-modal="true"
              aria-labelledby="student-access-title"
            >
              {/* =============================================
                  Header
                  ============================================= */}

              <header
                className={
                  styles.studentAccessModalHeader
                }
              >
                <div>
                  <span
                    className={
                      styles.studentAccessBadge
                    }
                  >
                    {t(
                      "quizDetails.studentAccess.badge"
                    )}
                  </span>

                  <h2
                    id="student-access-title"
                  >
                    {t(
                      "quizDetails.studentAccess.title"
                    )}
                  </h2>

                  <p>
                    {t(
                      "quizDetails.studentAccess.description"
                    )}
                  </p>
                </div>

                <button
                  type="button"
                  className={
                    styles.studentAccessClose
                  }
                  onClick={() => {
                    setStudentAccessOpen(
                      false
                    );
                  }}
                  aria-label={t(
                    "quizDetails.studentAccess.close"
                  )}
                >
                  ×
                </button>
              </header>

              {/* =============================================
                  Content
                  ============================================= */}

              <div
                className={
                  styles.studentAccessContent
                }
              >
                {/* ===========================================
                    Access code
                    =========================================== */}

                <div
                  className={
                    styles.studentAccessField
                  }
                >
                  <span>
                    {t(
                      "quizDetails.studentAccess.code"
                    )}
                  </span>

                  <div
                    className={
                      styles.studentAccessRow
                    }
                  >
                    <strong
                      className={
                        styles.studentAccessCode
                      }
                    >
                      {
                        quiz.accessCode
                      }
                    </strong>

                    <button
                      type="button"
                      className="app-button app-button-secondary"
                      onClick={() => {
                        copyToClipboard(
                          quiz.accessCode!,
                          "code"
                        );
                      }}
                    >
                      {copiedField ===
                      "code"
                        ? t(
                            "quizDetails.studentAccess.copied"
                          )
                        : t(
                            "quizDetails.studentAccess.copy"
                          )}
                    </button>
                  </div>

                  <small>
                    {t(
                      "quizDetails.studentAccess.codeHelp"
                    )}
                  </small>
                </div>

                {/* ===========================================
                    Student link
                    =========================================== */}

                <div
                  className={
                    styles.studentAccessField
                  }
                >
                  <span>
                    {t(
                      "quizDetails.studentAccess.link"
                    )}
                  </span>

                  <div
                    className={
                      styles.studentAccessRow
                    }
                  >
                    <div
                      className={
                        styles.studentAccessLink
                      }
                      title={
                        studentUrl
                      }
                    >
                      {studentUrl ||
                        t(
                          "quizDetails.studentAccess.preparingLink"
                        )}
                    </div>

                    <button
                      type="button"
                      className="app-button app-button-secondary"
                      disabled={
                        !studentUrl
                      }
                      onClick={() => {
                        copyToClipboard(
                          studentUrl,
                          "link"
                        );
                      }}
                    >
                      {copiedField ===
                      "link"
                        ? t(
                            "quizDetails.studentAccess.copied"
                          )
                        : t(
                            "quizDetails.studentAccess.copy"
                          )}
                    </button>
                  </div>

                  <small>
                    {t(
                      "quizDetails.studentAccess.linkHelp"
                    )}
                  </small>
                </div>

                {/* ===========================================
                    QR code
                    =========================================== */}

                <div
                  className={
                    styles.studentAccessQrSection
                  }
                >
                  <div
                    className={
                      styles.studentAccessQrHeader
                    }
                  >
                    <div>
                      <span
                        className={
                          styles.studentAccessQrLabel
                        }
                      >
                        {t(
                          "quizDetails.studentAccess.qrCode"
                        )}
                      </span>

                      <small>
                        {t(
                          "quizDetails.studentAccess.qrHelp"
                        )}
                      </small>
                    </div>
                  </div>

                  <div
                    className={
                      styles.studentAccessQrBox
                    }
                  >
                    {qrCodeGenerating ? (
                      <p
                        className={
                          styles.studentAccessQrStatus
                        }
                      >
                        {t(
                          "quizDetails.studentAccess.generatingQr"
                        )}
                      </p>
                    ) : qrCodeDataUrl ? (
                      <img
                        className={
                          styles.studentAccessQrImage
                        }
                        src={
                          qrCodeDataUrl
                        }
                        alt={t(
                          "quizDetails.studentAccess.qrAlt"
                        )}
                      />
                    ) : (
                      <p
                        className={
                          styles.studentAccessQrStatus
                        }
                      >
                        {t(
                          "quizDetails.studentAccess.qrUnavailable"
                        )}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    className="app-button app-button-secondary"
                    disabled={
                      !qrCodeDataUrl ||
                      qrCodeGenerating
                    }
                    onClick={
                      downloadQrCode
                    }
                  >
                    {t(
                      "quizDetails.studentAccess.downloadQr"
                    )}
                  </button>
                </div>

                {/* ===========================================
                    Session information
                    =========================================== */}

                <div
                  className={
                    styles.studentAccessSession
                  }
                >
                  {/* Mode */}

                  <div>
                    <span>
                      {t(
                        "quizDetails.studentAccess.mode"
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

                  {/* Starts */}

                  <div>
                    <span>
                      {quiz.availabilityMode ===
                      "scheduled_session"
                        ? t(
                            "quizDetails.studentAccess.starts"
                          )
                        : t(
                            "quizDetails.studentAccess.availableFrom"
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

                  {/* Ends */}

                  <div>
                    <span>
                      {t(
                        "quizDetails.studentAccess.ends"
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

                  {/* Duration */}

                  <div>
                    <span>
                      {quiz.availabilityMode ===
                      "open_window"
                        ? t(
                            "quizDetails.studentAccess.studentTime"
                          )
                        : t(
                            "quizDetails.studentAccess.sessionTime"
                          )}
                    </span>

                    <strong>
                      {formatQuizDuration(
                        quiz.timeLimitMinutes,
                        language
                      )}
                    </strong>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

      {/* =====================================================
          Delete Modal
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
            {/* ===============================================
                Header
                =============================================== */}

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

            {/* ===============================================
                Content
                =============================================== */}

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
                  )}
                  {" "}

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

            {/* ===============================================
                Actions
                =============================================== */}

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