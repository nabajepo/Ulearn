"use client";

/**
 * ============================================================================
 * ULearn - Dashboard Page
 * ============================================================================
 *
 * Purpose
 * -------
 * This page is the main teacher dashboard after authentication.
 *
 * Why does this file exist?
 * -------------------------
 * After a teacher signs in with Clerk, this page prepares the teacher profile,
 * checks account access, displays the remaining account time, and shows the
 * main quiz actions.
 *
 * Responsibilities
 * ----------------
 * • Show a loading screen while the dashboard is being prepared.
 * • Display teacher information.
 * • Display the account expiration countdown.
 * • Show the quiz creation and quiz management cards.
 *
 * Used by
 * -------
 * Protected teacher area.
 * ============================================================================
 */

import { UserButton } from "@clerk/nextjs";
import DashboardLoading from "@/components/DashboardLoading";
import { useTeacher } from "@/hooks/useTeacher";
import { useCountdown } from "@/hooks/useCountdown";

export default function DashboardPage() {
  const { teacher, loading, blocked, message } = useTeacher();
  const timeLeft = useCountdown(teacher?.expiresAt ?? null);

  if (loading) {
    return <DashboardLoading />;
  }

  if (blocked || !teacher) {
    return (
      <main className="dashboard-blocked-page">
        <div className="dashboard-blocked-box">
          <h1>Access unavailable</h1>
          <p>{message || "Your dashboard cannot be loaded."}</p>
        </div>
      </main>
    );
  }

  const hasQuiz = Boolean(teacher.quizId);

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
             <div className="dashboard-brand">
                 <h1>ULearn</h1>
                 <p>Welcome, {teacher.name} 👋</p>
             </div>

             <div className="dashboard-timer">
                 <span>Account expires in</span>
                 <strong>{timeLeft}</strong>
             </div>

             <UserButton />
      </header>

      <section className="dashboard-main">
        <article className={`dashboard-card ${hasQuiz ? "is-disabled" : ""}`}>
          <div className="dashboard-icon">＋</div>

          <div>
            <h2>Create a Quiz</h2>
            <p>
              Create your unique quiz with up to 50 questions:
              40 QCM and 10 development questions.
            </p>

            <button className="dashboard-btn" disabled={hasQuiz}>
              {hasQuiz ? "Quiz Already Created" : "Create New Quiz"}
            </button>

            <small>
              {hasQuiz
                ? "Delete your current quiz if you want to create another one."
                : "You can create only one quiz in this version."}
            </small>
          </div>
        </article>

        <article className="dashboard-card">
          <div className="dashboard-icon">☰</div>

          <div>
            <h2>Quizzes</h2>
            <p>
              View your existing quiz, manage it, launch it, or see
              participants.
            </p>

            <button className="dashboard-btn" disabled={!hasQuiz}>
              {hasQuiz ? "View My Quiz" : "No Quiz Yet"}
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