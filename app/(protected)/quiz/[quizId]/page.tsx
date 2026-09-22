"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  useParams,
  useRouter,
} from "next/navigation";

import {
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";

import QRCode from "qrcode";

import AppLoading from "@/components/AppLoading";

import {
  db,
} from "@/lib/firebase";

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
    launchModalOpen,
    setLaunchModalOpen,
  ] =
    useState(false);

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

  /* =========================================================
     Real-time student counters
     ========================================================= */

  const [
    activeStudents,
    setActiveStudents,
  ] =
    useState(0);

  const [
    finishedStudents,
    setFinishedStudents,
  ] =
    useState(0);

  /* =========================================================
     Student URL

     This must remain above conditional returns because
     the QR-code effect depends on it.
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
     Initial quiz + structure load
     ========================================================= */

  useEffect(() => {
    let cancelled =
      false;

    async function loadQuiz() {
      try {
        setLoading(
          true
        );

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

    if (
      quizId
    ) {
      loadQuiz();
    } else {
      setLoading(
        false
      );
    }

    return () => {
      cancelled =
        true;
    };
  }, [
    quizId,
    t,
  ]);

  /* =========================================================
     REAL-TIME QUIZ LISTENER

     This is important for status changes.

     Example:

     launched
        ↓
     deadline reached / system closes quiz
        ↓
     closed
        ↓
     this listener immediately updates quiz.status
        ↓
     delete button becomes available automatically

     No browser refresh required.
     ========================================================= */

  useEffect(() => {
    if (
      !quizId
    ) {
      return;
    }

    const quizDocument =
      doc(
        db,
        "quizzes",
        quizId
      );

    const unsubscribe =
      onSnapshot(
        quizDocument,

        (snapshot) => {
          /*
           * The document was deleted.
           */
          if (
            !snapshot.exists()
          ) {
            setQuiz(
              null
            );

            return;
          }

          /*
           * We still use getQuiz() instead of manually
           * rebuilding the Quiz object here.
           *
           * This keeps all Firestore -> Quiz mapping logic
           * centralized inside quizzes.ts.
           *
           * onSnapshot tells us WHEN something changed;
           * getQuiz gives us the correctly mapped object.
           */
          void getQuiz(
            quizId
          )
            .then(
              (
                updatedQuiz
              ) => {
                setQuiz(
                  updatedQuiz
                );
              }
            )
            .catch(
              (error) => {
                console.error(
                  "Unable to refresh realtime quiz data:",
                  error
                );
              }
            );
        },

        (error) => {
          console.error(
            "Unable to listen to quiz in real time:",
            error
          );
        }
      );

    return () => {
      unsubscribe();
    };
  }, [
    quizId,
  ]);

  /* =========================================================
     AUTOMATIC QUIZ CLOSURE

     A launched quiz must become "closed" as soon as its
     deadline is reached.

     Why this effect exists:
     - the public/student page can already know that a quiz
       is over from availableUntil;
     - however, Firestore may still contain status="launched";
     - deleteQuiz() correctly refuses to delete a launched quiz;
     - therefore we persist status="closed" at the deadline.

     The realtime quiz listener above receives that Firestore
     update immediately, so:
     - the status badge changes to CLOSED;
     - the Delete quiz button becomes enabled;
     - no browser refresh is required.

     If the teacher opens the page after the deadline, the
     update happens immediately.
     ========================================================= */

  useEffect(() => {
    if (
      !quizId ||
      !quiz ||
      quiz.status !==
        "launched" ||
      !quiz.availableUntil
    ) {
      return;
    }

    const deadlineMs =
      new Date(
        quiz.availableUntil
      ).getTime();

    if (
      Number.isNaN(
        deadlineMs
      )
    ) {
      return;
    }

    let cancelled =
      false;

    let timer:
      ReturnType<
        typeof setTimeout
      > | null =
      null;

    const MAX_TIMEOUT_MS =
      2_147_000_000;

    async function closeQuizIfExpired() {
      if (
        cancelled
      ) {
        return;
      }

      const remainingMs =
        deadlineMs -
        Date.now();

      if (
        remainingMs >
        0
      ) {
        timer =
          window.setTimeout(
            () => {
              void closeQuizIfExpired();
            },
            Math.min(
              remainingMs,
              MAX_TIMEOUT_MS
            )
          );

        return;
      }

      try {
        const latestQuiz =
          await getQuiz(
            quizId
          );

        if (
          cancelled ||
          !latestQuiz ||
          latestQuiz.status !==
            "launched"
        ) {
          return;
        }

        const latestDeadlineMs =
          latestQuiz.availableUntil
            ? new Date(
                latestQuiz.availableUntil
              ).getTime()
            : Number.NaN;

        if (
          Number.isNaN(
            latestDeadlineMs
          ) ||
          latestDeadlineMs >
            Date.now()
        ) {
          return;
        }

        await updateDoc(
          doc(
            db,
            "quizzes",
            quizId
          ),
          {
            status:
              "closed",

            updatedAt:
              new Date()
                .toISOString(),
          }
        );
      } catch (error) {
        console.error(
          "Unable to automatically close expired quiz:",
          error
        );
      }
    }

    void closeQuizIfExpired();

    return () => {
      cancelled =
        true;

      if (
        timer !==
        null
      ) {
        window.clearTimeout(
          timer
        );
      }
    };
  }, [
    quizId,
    quiz,
  ]);

  /* =========================================================
     REAL-TIME STUDENT ATTEMPTS

     Firestore updates the counters immediately whenever
     an attempt changes.

     in_progress -> active student

     submitted
     graded      -> finished student
     ========================================================= */

  useEffect(() => {
    if (
      !quizId
    ) {
      setActiveStudents(
        0
      );

      setFinishedStudents(
        0
      );

      return;
    }

    const attemptsQuery =
      query(
        collection(
          db,
          "attempts"
        ),

        where(
          "quizId",
          "==",
          quizId
        )
      );

    const unsubscribe =
      onSnapshot(
        attemptsQuery,

        (snapshot) => {
          let nextActiveStudents =
            0;

          let nextFinishedStudents =
            0;

          snapshot.forEach(
            (
              attemptDocument
            ) => {
              const data =
                attemptDocument.data();

              const status =
                typeof data.status ===
                "string"
                  ? data.status
                  : "";

              if (
                status ===
                "in_progress"
              ) {
                nextActiveStudents +=
                  1;

                return;
              }

              if (
                status ===
                  "submitted" ||
                status ===
                  "graded"
              ) {
                nextFinishedStudents +=
                  1;
              }
            }
          );

          setActiveStudents(
            nextActiveStudents
          );

          setFinishedStudents(
            nextFinishedStudents
          );
        },

        (error) => {
          console.error(
            "Unable to listen to quiz attempts in real time:",
            error
          );

          setActiveStudents(
            0
          );

          setFinishedStudents(
            0
          );
        }
      );

    return () => {
      unsubscribe();
    };
  }, [
    quizId,
  ]);

  /* =========================================================
     Modal behavior
     ========================================================= */

  useEffect(() => {
    if (
      !launchModalOpen &&
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

      if (
        processing ===
        "delete"
      ) {
        return;
      }

      if (
        launchModalOpen
      ) {
        setLaunchModalOpen(
          false
        );
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
    launchModalOpen,
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
     QR code
     ========================================================= */

  useEffect(() => {
    let cancelled =
      false;

    async function generateQrCode() {
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
     No React Hooks below this point
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
     Structure
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
     DELETE PERMISSION

     draft    -> yes
     launched -> no
     closed   -> yes
     ========================================================= */

  const canDeleteQuiz =
    quiz.status ===
      "draft" ||
    quiz.status ===
      "closed";

  /* =========================================================
     Download QR
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

  function openLaunchModal() {
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

    setLaunchModalOpen(
      true
    );
  }

  function closeLaunchModal() {
    if (
      processing ===
      "launch"
    ) {
      return;
    }

    setLaunchModalOpen(
      false
    );
  }

  async function handleLaunch() {
    if (
      processing ||
      !launchModalOpen ||
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
        setLaunchModalOpen(
          false
        );

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

      setLaunchModalOpen(
        false
      );

      setMessage(
        t(
          "quizDetails.messages.launchSuccess"
        )
      );

      setStudentAccessOpen(
        true
      );
    } catch (error) {
      console.error(
        "Error launching quiz:",
        error
      );

      setLaunchModalOpen(
        false
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
      processing ||
      !canDeleteQuiz
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
     * Important:
     *
     * We verify canDeleteQuiz again here.
     *
     * Even if the modal was opened while the quiz was
     * deletable and Firestore changes its status before
     * confirmation, deletion remains protected.
     */
    if (
      processing ||
      !deleteModalOpen ||
      !canDeleteQuiz
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
        setProcessing(
          ""
        );

        setDeleteModalOpen(
          false
        );

        setMessage(
          t(
            "quizDetails.messages.deleteError"
          )
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

      setProcessing(
        ""
      );

      setDeleteModalOpen(
        false
      );

      setMessage(
        t(
          "quizDetails.messages.deleteError"
        )
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

            {/* Teacher expiration */}

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

            {/* Shuffle answers */}

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

            {/* Score visibility */}

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

            {/* Correction visibility */}

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
              Account
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
                !structureComplete ||
                deadlinePassed ||
                accountExpired
              }
              onClick={
                openLaunchModal
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

            {/* ===============================================
                DELETE

                draft    -> enabled
                launched -> disabled
                closed   -> enabled

                Because quiz.status is listened to with
                onSnapshot(), this button changes automatically.
                =============================================== */}

            <button
              type="button"
              className="app-button app-button-secondary app-button-action"
              disabled={
                !canDeleteQuiz
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
          Launch confirmation modal
          ===================================================== */}

      {launchModalOpen && (
        <div
          className={
            styles.launchOverlay
          }
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeLaunchModal();
            }
          }}
        >
          <section
            className={
              styles.launchModal
            }
            role="dialog"
            aria-modal="true"
            aria-labelledby="launch-confirmation-title"
            aria-describedby="launch-confirmation-description"
          >
            <header
              className={
                styles.launchModalHeader
              }
            >
              <div>
                <span
                  className={
                    styles.launchBadge
                  }
                >
                  {t(
                    "quizDetails.launchConfirmation.badge"
                  )}
                </span>

                <h2
                  id="launch-confirmation-title"
                >
                  {t(
                    "quizDetails.launchConfirmation.title"
                  )}
                </h2>
              </div>

              <button
                type="button"
                className={
                  styles.launchCloseButton
                }
                onClick={
                  closeLaunchModal
                }
                aria-label={t(
                  "quizDetails.launchConfirmation.close"
                )}
              >
                ×
              </button>
            </header>

            <div
              className={
                styles.launchContent
              }
            >
              <div
                className={
                  styles.launchWarningIcon
                }
                aria-hidden="true"
              >
                !
              </div>

              <div
                className={
                  styles.launchText
                }
              >
                <p
                  id="launch-confirmation-description"
                >
                  {t(
                    "quizDetails.launchConfirmation.description"
                  )}
                </p>

                <div
                  className={
                    styles.launchLockedBlock
                  }
                >
                  <strong>
                    {t(
                      "quizDetails.launchConfirmation.lockedTitle"
                    )}
                  </strong>

                  <ul>
                    <li>
                      {t(
                        "quizDetails.launchConfirmation.questionsLocked"
                      )}
                    </li>

                    <li>
                      {t(
                        "quizDetails.launchConfirmation.settingsLocked"
                      )}
                    </li>

                    <li>
                      {t(
                        "quizDetails.launchConfirmation.deleteLocked"
                      )}
                    </li>
                  </ul>
                </div>

                <p
                  className={
                    styles.launchFinalWarning
                  }
                >
                  {t(
                    "quizDetails.launchConfirmation.finalWarning"
                  )}
                </p>
              </div>
            </div>

            <div
              className={
                styles.launchActions
              }
            >
              <button
                type="button"
                className="app-button"
                onClick={
                  handleLaunch
                }
              >
                {t(
                  "quizDetails.launchConfirmation.confirm"
                )}
              </button>

                    <button
                type="button"
                className="app-button app-button-secondary"
                onClick={
                  closeLaunchModal
                }
              >
                {t(
                  "quizDetails.launchConfirmation.cancel"
                )}
              </button>
            </div>
          </section>
        </div>
      )}

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

              <div
                className={
                  styles.studentAccessContent
                }
              >
                {/* Access code */}

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

                {/* Link */}

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

                {/* QR */}

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

                {/* Session */}

                <div
                  className={
                    styles.studentAccessSession
                  }
                >
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