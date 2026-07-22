"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import AppLoading from "@/components/AppLoading";
import { useTeacher } from "@/hooks/useTeacher";

import {
  deleteQuiz,
  getQuiz,
  launchQuiz,
  type Quiz,
} from "@/lib/services/quizzes";

import styles from "./QuizDetailsPage.module.css";

type ProcessingAction =
  | ""
  | "opening-dashboard"
  | "opening-editor"
  | "launching"
  | "deleting";

function formatDateTime(value: string | null) {
  if (!value) return "Not set";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return date.toLocaleString("en-CA", {
    year: "numeric",
    month: "long",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatAvailabilityMode(value: Quiz["availabilityMode"]) {
  if (value === "scheduled_session") {
    return "Scheduled session";
  }

  return "Open window";
}

function formatStatus(value: Quiz["status"]) {
  if (value === "launched") return "Launched";
  if (value === "closed") return "Closed";

  return "Draft";
}

export default function QuizDetailsPage() {
  const router = useRouter();
  const params = useParams();

  const quizId = String(params.quizId ?? "");

  const { teacher, loading: teacherLoading } = useTeacher();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [processingAction, setProcessingAction] =
    useState<ProcessingAction>("");

  useEffect(() => {
    let cancelled = false;

    async function loadQuiz() {
      if (!quizId) {
        setLoadError("Quiz identifier is missing.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setLoadError("");

        const data = await getQuiz(quizId);

        if (!cancelled) {
          setQuiz(data);
        }
      } catch (error) {
        console.error("Error loading quiz:", error);

        if (!cancelled) {
          setLoadError("Unable to load the quiz.");
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

  function getProcessingContent() {
    switch (processingAction) {
      case "opening-dashboard":
        return {
          title: "ULearn",
          subtitle: "Returning to your dashboard...",
        };

      case "opening-editor":
        return {
          title: "Opening quiz editor",
          subtitle: "Preparing the quiz settings...",
        };

      case "launching":
        return {
          title: "Launching quiz",
          subtitle: "Checking the quiz before launch...",
        };

      case "deleting":
        return {
          title: "Deleting quiz",
          subtitle: "Removing the quiz from your workspace...",
        };

      default:
        return {
          title: "ULearn",
          subtitle: "Loading your quiz...",
        };
    }
  }

  if (teacherLoading || loading) {
    return (
      <AppLoading
        title="Opening quiz"
        subtitle="Loading your quiz settings..."
      />
    );
  }

  if (processingAction) {
    const content = getProcessingContent();

    return (
      <AppLoading
        title={content.title}
        subtitle={content.subtitle}
      />
    );
  }

  if (
    loadError ||
    !teacher ||
    !quiz ||
    quiz.teacherId !== teacher.id
  ) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <h1>Access denied</h1>

          <p>
            {loadError || "Quiz not found or access denied."}
          </p>

          <button
            type="button"
            className="app-button"
            onClick={() => router.push("/dashboard")}
          >
            Back to Dashboard
          </button>
        </section>
      </main>
    );
  }

  async function handleLaunch() {
    if (!quiz || processingAction) return;

    setProcessingAction("launching");
    setMessage("");

    try {
      const result = await launchQuiz(quiz.id);

      if (!result.success) {
        setMessage(result.message);
        setProcessingAction("");
        return;
      }

      const updatedQuiz = await getQuiz(quiz.id);

      setQuiz(updatedQuiz);
      setMessage(result.message);
    } catch (error) {
      console.error("Error launching quiz:", error);
      setMessage("Unable to launch the quiz.");
    } finally {
      setProcessingAction("");
    }
  }

  async function handleDelete() {
    if (!quiz || processingAction) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this quiz?"
    );

    if (!confirmed) return;

    setProcessingAction("deleting");
    setMessage("");

    try {
      const result = await deleteQuiz(quiz.id);

      if (!result.success) {
        setMessage(result.message);
        setProcessingAction("");
        return;
      }

      router.push("/dashboard");
    } catch (error) {
      console.error("Error deleting quiz:", error);

      setMessage("Unable to delete the quiz.");
      setProcessingAction("");
    }
  }

  function handleOpenEditor() {
    if (!quiz || processingAction || quiz.status !== "draft") {
      return;
    }

    setProcessingAction("opening-editor");
    router.push(`/quiz/${quiz.id}/edit`);
  }

  function handleBackToDashboard() {
    if (processingAction) return;

    setProcessingAction("opening-dashboard");
    router.push("/dashboard");
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <button
          type="button"
          className={styles.backButton}
          onClick={handleBackToDashboard}
        >
          ← Back to Dashboard
        </button>

        <h1>{quiz.title}</h1>

        <p>{quiz.description || "No description."}</p>

        <div className={styles.summary}>
          <span>Status: {formatStatus(quiz.status)}</span>

          <span>
            Questions: {quiz.totalQuestions} / 50
          </span>

          <span>
            QCM questions: {quiz.qcmQuestions} / 40
          </span>

          <span>
            Development questions: {quiz.developmentQuestions} / 10
          </span>

          <span>
            Students: 0 / {quiz.maxStudents}
          </span>

          <span>
            Time limit: {quiz.timeLimitMinutes} minutes
          </span>

          <span>
            Mode: {formatAvailabilityMode(quiz.availabilityMode)}
          </span>

          <span>
            Available from: {formatDateTime(quiz.availableFrom)}
          </span>

          <span>
            Deadline: {formatDateTime(quiz.availableUntil)}
          </span>

          <span>
            Back navigation:{" "}
            {quiz.allowBackNavigation ? "Allowed" : "Not allowed"}
          </span>

          <span>
            Shuffle questions: {quiz.shuffleQuestions ? "Yes" : "No"}
          </span>

          <span>
            Shuffle choices: {quiz.shuffleChoices ? "Yes" : "No"}
          </span>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className="app-button"
            onClick={handleOpenEditor}
            disabled={quiz.status !== "draft"}
          >
            Edit Quiz
          </button>

          <button
            type="button"
            className="app-button"
            onClick={handleLaunch}
            disabled={quiz.status !== "draft"}
          >
            Launch Quiz
          </button>

          <button
            type="button"
            className="app-button app-button-danger"
            onClick={handleDelete}
          >
            Delete Quiz
          </button>
        </div>

        {message && (
          <p className={styles.message}>{message}</p>
        )}
      </section>
    </main>
  );
}