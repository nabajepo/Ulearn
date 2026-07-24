"use client";

/**
 * ============================================================================
 * ULearn - Dashboard Page
 * ============================================================================
 *
 * Main protected teacher dashboard.
 *
 * Responsibilities:
 * • Prepare and display the authenticated teacher.
 * • Display the account expiration countdown.
 * • Allow the teacher to create one quiz.
 * • Allow the teacher to open the existing quiz.
 * ============================================================================
 */

import { useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

import AppLoading from "@/components/AppLoading";
import { useTeacher } from "@/hooks/useTeacher";
import { useCountdown } from "@/hooks/useCountdown";

import styles from "./DashboardPage.module.css";

export default function DashboardPage() {
  const router = useRouter();

  const { teacher, loading, blocked, message } = useTeacher();
  const timeLeft = useCountdown(teacher?.expiresAt ?? null);

  const [navigationTarget, setNavigationTarget] = useState<
    "create" | "open" | ""
  >("");

  function navigateTo(path: string, target: "create" | "open") {
    if (navigationTarget) {
      return;
    }

    setNavigationTarget(target);
    router.push(path);
  }

  if (loading) {
    return (
      <AppLoading
        title="ULearn"
        subtitle="Preparing your teacher dashboard..."
      />
    );
  }

  if (navigationTarget === "create") {
    return (
      <AppLoading
        title="Create Quiz"
        subtitle="Opening the quiz creation workspace..."
      />
    );
  }

  if (navigationTarget === "open") {
    return (
      <AppLoading
        title="Opening Quiz"
        subtitle="Loading your quiz settings..."
      />
    );
  }

  if (blocked || !teacher) {
    return (
      <main className={styles.blockedPage}>
        <section className={styles.blockedBox}>
          <h1>Access unavailable</h1>

          <p>
            {message || "Your dashboard cannot be loaded."}
          </p>
        </section>
      </main>
    );
  }

  const hasQuiz = Boolean(teacher.quizId);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <h1>ULearn</h1>
          <p>Welcome, {teacher.name} 👋</p>
        </div>

        <div className={styles.timer}>
          <span>Account expires in</span>
          <strong>{timeLeft}</strong>
        </div>

        <div className={styles.userButton}>
          <UserButton />
        </div>
      </header>

      <section className={styles.main}>
        <article
          className={`${styles.card} ${
            hasQuiz ? styles.disabled : ""
          }`}
        >
          <div className={styles.icon}>＋</div>

          <div>
            <h2>Create a Quiz</h2>

            <p>
              Create your unique quiz with up to 50 questions: 40 QCM and 10
              development questions.
            </p>

            <button
              type="button"
              className="app-button"
              disabled={hasQuiz || Boolean(navigationTarget)}
              onClick={() => navigateTo("/quiz/create", "create")}
            >
              {hasQuiz ? "Quiz Already Created" : "Create New Quiz  →"}
            </button>

            <small>
              {hasQuiz
                ? "Delete your current quiz if you want to create another one."
                : "You can create only one quiz in this version."}
            </small>
          </div>
        </article>

        <article className={styles.card}>
          <div className={styles.icon}>☰</div>

          <div>
            <h2>Quizzes</h2>

            <p>
              View your existing quiz, manage its settings, launch it, or see
              its participants.
            </p>

            <button
              type="button"
              className="app-button"
              disabled={!hasQuiz || Boolean(navigationTarget)}
              onClick={() => {
                if (teacher.quizId) {
                  navigateTo(`/quiz/${teacher.quizId}`, "open");
                }
              }}
            >
              {hasQuiz ? "Open Quiz  →" : "No Quiz Yet"}
            </button>

            <small>
              {hasQuiz
                ? "You can manage your current quiz here."
                : "Create a quiz first to activate this section."}
            </small>
          </div>
        </article>
      </section>
    </main>
  );
}