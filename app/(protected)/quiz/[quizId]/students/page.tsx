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
  getQuiz,
  type Quiz,
} from "@/lib/services/quizzes";

import { useTeacher } from "@/hooks/useTeacher";

import styles from "./StudentsPage.module.css";

export default function StudentsPage() {
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

  const [navigating, setNavigating] =
    useState(false);

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
          "Unable to load quiz students:",
          error
        );
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

  if (
    teacherLoading ||
    loading
  ) {
    return (
      <AppLoading
        title="Students & Grading"
        subtitle="Loading quiz submissions..."
      />
    );
  }

  if (navigating) {
    return (
      <AppLoading
        title="ULearn"
        subtitle="Returning to your quiz..."
      />
    );
  }

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

  function handleBack() {
    setNavigating(true);

    router.push(
      `/quiz/${quizId}`
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <button
          type="button"
          className="app-button app-button-secondary"
          onClick={handleBack}
        >
          ← Back to Quiz
        </button>

        <header className={styles.header}>
          <span className={styles.badge}>
            Students & grading
          </span>

          <h1>{quiz.title}</h1>

          <p>
            Review submitted quizzes and grade
            development questions.
          </p>
        </header>

        <section className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            0
          </div>

          <h2>No submissions yet</h2>

          <p>
            Students who complete the quiz will
            appear here in submission order.
          </p>

          <div className={styles.futureInfo}>
            <strong>
              Future grading workflow
            </strong>

            <span>
              1. Students will be ordered by submission time.
            </span>

            <span>
              2. QCM questions will be corrected automatically.
            </span>

            <span>
              3. Click a student to grade development answers.
            </span>

            <span>
              4. Publish the final result when grading is complete.
            </span>
          </div>
        </section>
      </section>
    </main>
  );
}