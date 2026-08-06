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

import { useTeacher } from "@/hooks/useTeacher";

import {
  formatInTimeZone,
} from "@/lib/dateTime";

import {
  formatQuizDuration,
} from "@/lib/quizDuration";

import styles from "./QuizDetailsPage.module.css";

type ProcessingAction =
  | ""
  | "dashboard"
  | "edit"
  | "settings"
  | "students"
  | "launch"
  | "delete";

export default function QuizDetailsPage() {
  const router = useRouter();
  const params = useParams();

  const quizId = String(params.quizId);

  const {
    teacher,
    loading: teacherLoading,
  } = useTeacher();

  const [quiz, setQuiz] =
    useState<Quiz | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [message, setMessage] =
    useState("");

  const [processing, setProcessing] =
    useState<ProcessingAction>("");

  const [
    deleteModalOpen,
    setDeleteModalOpen,
  ] = useState(false);

  /* =========================================================
     Load quiz
     ========================================================= */

  useEffect(() => {
    let cancelled = false;

    async function loadQuiz() {
      try {
        const data =
          await getQuiz(quizId);

        if (!cancelled) {
          setQuiz(data);
        }
      } catch (error) {
        console.error(
          "Error loading quiz:",
          error
        );

        if (!cancelled) {
          setMessage(
            "Unable to load the quiz."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadQuiz();

    return () => {
      cancelled = true;
    };
  }, [quizId]);

  /* =========================================================
     Delete modal keyboard and body behavior
     ========================================================= */

  useEffect(() => {
    if (!deleteModalOpen) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    function handleKeyDown(
      event: KeyboardEvent
    ) {
      if (
        event.key === "Escape" &&
        processing !== "delete"
      ) {
        setDeleteModalOpen(false);
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
    deleteModalOpen,
    processing,
  ]);

  /* =========================================================
     Loading states
     ========================================================= */

  if (
    teacherLoading ||
    loading
  ) {
    return (
      <AppLoading
        title="Opening Quiz"
        subtitle="Loading your quiz information..."
      />
    );
  }

  if (processing) {
    let subtitle =
      "Please wait...";

    switch (processing) {
      case "dashboard":
        subtitle =
          "Returning to your dashboard...";
        break;

      case "edit":
        subtitle =
          "Opening the quiz editor...";
        break;

      case "settings":
        subtitle =
          "Opening quiz settings...";
        break;

      case "students":
        subtitle =
          "Opening students and grading...";
        break;

      case "launch":
        subtitle =
          "Launching your quiz...";
        break;

      case "delete":
        subtitle =
          "Deleting your quiz...";
        break;
    }

    return (
      <AppLoading
        title="ULearn"
        subtitle={subtitle}
      />
    );
  }

  /* =========================================================
     Access validation
     ========================================================= */

  if (
    !teacher ||
    !quiz ||
    quiz.teacherId !== teacher.id
  ) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <h1>Access denied</h1>

          <p>
            Quiz not found or access denied.
          </p>
        </section>
      </main>
    );
  }

  const timeZone =
    quiz.timeZone ||
    "America/Toronto";

  const now = Date.now();

  const deadlinePassed =
    quiz.availableUntil !== null &&
    new Date(
      quiz.availableUntil
    ).getTime() <= now;

  const accountExpired =
    new Date(
      teacher.expiresAt
    ).getTime() <= now;

  /* =========================================================
     Launch quiz
     ========================================================= */

  async function handleLaunch() {
    if (
      processing ||
      quiz.status !== "draft"
    ) {
      return;
    }

    setMessage("");
    setProcessing("launch");

    try {
      const result =
        await launchQuiz(quizId);

      if (!result.success) {
        setMessage(result.message);
        setProcessing("");
        return;
      }

      const updated =
        await getQuiz(quizId);

      setQuiz(updated);
      setMessage(result.message);
    } catch (error) {
      console.error(
        "Error launching quiz:",
        error
      );

      setMessage(
        "Unable to launch the quiz."
      );
    } finally {
      setProcessing("");
    }
  }

  /* =========================================================
     Delete modal
     ========================================================= */

  function openDeleteModal() {
    if (processing) {
      return;
    }

    setMessage("");
    setDeleteModalOpen(true);
  }

  function closeDeleteModal() {
    if (processing === "delete") {
      return;
    }

    setDeleteModalOpen(false);
  }

  async function handleDeleteConfirm() {
    if (
      processing ||
      !deleteModalOpen
    ) {
      return;
    }

    setDeleteModalOpen(false);
    setMessage("");
    setProcessing("delete");

    try {
      const result =
        await deleteQuiz(quizId);

      if (!result.success) {
        setMessage(result.message);
        setProcessing("");
        return;
      }

      router.push("/dashboard");
    } catch (error) {
      console.error(
        "Error deleting quiz:",
        error
      );

      setMessage(
        "Unable to delete the quiz."
      );

      setProcessing("");
    }
  }

  /* =========================================================
     Navigation
     ========================================================= */

  function handleDashboard() {
    if (processing) {
      return;
    }

    setProcessing("dashboard");
    router.push("/dashboard");
  }

  function handleEditQuiz() {
    if (
      processing ||
      quiz.status !== "draft"
    ) {
      return;
    }

    setProcessing("edit");

    router.push(
      `/quiz/${quiz.id}/edit`
    );
  }

  function handleQuizSettings() {
    if (
      processing ||
      quiz.status !== "draft"
    ) {
      return;
    }

    setProcessing("settings");

    router.push(
      `/quiz/${quiz.id}/settings`
    );
  }

  function handleStudents() {
    if (processing) {
      return;
    }

    setProcessing("students");

    router.push(
      `/quiz/${quiz.id}/students`
    );
  }

  /* =========================================================
     UI
     ========================================================= */

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <button
          type="button"
          className="app-button app-button-secondary"
          onClick={handleDashboard}
        >
          ← Back to Dashboard
        </button>

        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <h1>{quiz.title}</h1>

            <p className={styles.description}>
              {quiz.description ||
                "No description provided."}
            </p>
          </div>

          <span className={styles.statusBadge}>
            {quiz.status.toUpperCase()}
          </span>
        </header>

        <div className={styles.summary}>
          <div className={styles.summaryItem}>
            <span>Status</span>
            <strong>{quiz.status}</strong>
          </div>

          <div className={styles.summaryItem}>
            <span>Questions</span>

            <strong>
              {quiz.totalQuestions} / 50
            </strong>
          </div>

          <div className={styles.summaryItem}>
            <span>QCM questions</span>

            <strong>
              {quiz.qcmQuestions} / 40
            </strong>
          </div>

          <div className={styles.summaryItem}>
            <span>
              Development questions
            </span>

            <strong>
              {quiz.developmentQuestions} / 10
            </strong>
          </div>

          <div className={styles.summaryItem}>
            <span>Students</span>

            <strong>
              0 / {quiz.maxStudents}
            </strong>
          </div>

          <div className={styles.summaryItem}>
            <span>
              {quiz.availabilityMode ===
              "open_window"
                ? "Time per student"
                : "Session duration"}
            </span>

            <strong>
              {formatQuizDuration(
                quiz.timeLimitMinutes
              )}
            </strong>
          </div>

          <div className={styles.summaryItem}>
            <span>Mode</span>

            <strong>
              {quiz.availabilityMode ===
              "open_window"
                ? "Open window"
                : "Scheduled session"}
            </strong>
          </div>

          <div className={styles.summaryItem}>
            <span>Quiz time zone</span>
            <strong>{timeZone}</strong>
          </div>

          <div className={styles.summaryItem}>
            <span>Available from</span>

            <strong>
              {quiz.availableFrom
                ? formatInTimeZone(
                    quiz.availableFrom,
                    timeZone
                  )
                : "When launched"}
            </strong>
          </div>

          <div className={styles.summaryItem}>
            <span>Deadline</span>

            <strong>
              {quiz.availableUntil
                ? formatInTimeZone(
                    quiz.availableUntil,
                    timeZone
                  )
                : "Not set"}
            </strong>
          </div>

          <div className={styles.summaryItem}>
            <span>
              Teacher account expires
            </span>

            <strong>
              {formatInTimeZone(
                teacher.expiresAt,
                timeZone
              )}
            </strong>
          </div>

          <div className={styles.summaryItem}>
            <span>Back navigation</span>

            <strong>
              {quiz.allowBackNavigation
                ? "Allowed"
                : "Disabled"}
            </strong>
          </div>

          <div className={styles.summaryItem}>
            <span>Shuffle questions</span>

            <strong>
              {quiz.shuffleQuestions
                ? "Yes"
                : "No"}
            </strong>
          </div>

          <div className={styles.summaryItem}>
            <span>Shuffle choices</span>

            <strong>
              {quiz.shuffleChoices
                ? "Yes"
                : "No"}
            </strong>
          </div>

          <div className={styles.summaryItem}>
            <span>Show final score</span>

            <strong>
              {quiz.showResultsToStudents
                ? "Yes"
                : "No"}
            </strong>
          </div>

          <div className={styles.summaryItem}>
            <span>
              Show correct answers
            </span>

            <strong>
              {quiz.showCorrectAnswers
                ? "Yes"
                : "No"}
            </strong>
          </div>
        </div>

        {deadlinePassed &&
          quiz.status === "draft" && (
            <p className={styles.message}>
              This quiz deadline has passed.
              Open Quiz Settings and select
              a new deadline before launching it.
            </p>
          )}

        {accountExpired && (
          <p className={styles.message}>
            Your teacher account has expired.
            This quiz can no longer be launched.
          </p>
        )}

        {message && (
          <p
            className={styles.message}
            role="alert"
          >
            {message}
          </p>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            className="app-button"
            disabled={
              quiz.status !== "draft" ||
              accountExpired
            }
            onClick={handleQuizSettings}
          >
            Quiz Settings
          </button>

          <button
            type="button"
            className="app-button"
            disabled={
              quiz.status !== "draft" ||
              accountExpired
            }
            onClick={handleEditQuiz}
          >
            Edit Quiz
          </button>

          <button
            type="button"
            className="app-button"
            onClick={handleStudents}
          >
            Students & Grading
          </button>

          <button
            type="button"
            className="app-button"
            disabled={
              quiz.status !== "draft" ||
              deadlinePassed ||
              accountExpired
            }
            onClick={handleLaunch}
          >
            Launch Quiz
          </button>

          <button
            type="button"
            className="app-button app-button-secondary app-button-action"
            onClick={openDeleteModal}
          >
            Delete Quiz
          </button>
        </div>
      </section>

      {deleteModalOpen && (
        <div
          className={styles.deleteOverlay}
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeDeleteModal();
            }
          }}
        >
          <section
            className={styles.deleteModal}
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
                  Danger zone
                </span>

                <h2 id="delete-quiz-title">
                  Delete quiz
                </h2>
              </div>

              <button
                type="button"
                className={
                  styles.deleteCloseButton
                }
                aria-label="Close delete confirmation"
                onClick={closeDeleteModal}
              >
                ×
              </button>
            </header>

            <div
              className={
                styles.deleteModalContent
              }
            >
              <div
                className={
                  styles.deleteIcon
                }
                aria-hidden="true"
              >
                !
              </div>

              <div>
                <p id="delete-quiz-description">
                  Are you sure you want to
                  delete{" "}
                  <strong>
                    “{quiz.title}”
                  </strong>
                  ?
                </p>

                <p
                  className={
                    styles.deleteWarning
                  }
                >
                  This action cannot be undone.
                  The quiz and all related data
                  will be permanently removed.
                </p>
              </div>
            </div>

            <div
              className={
                styles.deleteModalActions
              }
            >
              <button
                type="button"
                className="app-button app-button-secondary app-button-action"
                onClick={closeDeleteModal}
              >
                Cancel
              </button>

              <button
                type="button"
                className="app-button app-button-danger app-button-action"
                onClick={handleDeleteConfirm}
              >
                Delete Quiz
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}