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

import {
  useTeacher,
} from "@/hooks/useTeacher";

import {
  useLanguage,
} from "@/hooks/useLanguage";

import styles from "./StudentsPage.module.css";

export default function StudentsPage() {
  const router =
    useRouter();

  const params =
    useParams();

  const {
    t,
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
    navigating,
    setNavigating,
  ] =
    useState(false);

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
          "Unable to load quiz students:",
          error
        );
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
          "students.loading.title"
        )}
        subtitle={t(
          "students.loading.subtitle"
        )}
      />
    );
  }

  if (
    navigating
  ) {
    return (
      <AppLoading
        title="ULearn"
        subtitle={t(
          "students.loading.returning"
        )}
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
              "students.access.title"
            )}
          </h1>

          <p>
            {t(
              "students.access.text"
            )}
          </p>
        </section>
      </main>
    );
  }

  /* =========================================================
     Navigation
     ========================================================= */

  function handleBack() {
    if (
      navigating
    ) {
      return;
    }

    setNavigating(
      true
    );

    router.push(
      `/quiz/${quizId}`
    );
  }

  /* =========================================================
     UI
     ========================================================= */

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
          onClick={
            handleBack
          }
        >
          ←{" "}
          {t(
            "students.backQuiz"
          )}
        </button>

        <header
          className={
            styles.header
          }
        >
          <span
            className={
              styles.badge
            }
          >
            {t(
              "students.badge"
            )}
          </span>

          <h1>
            {quiz.title}
          </h1>

          <p>
            {t(
              "students.description"
            )}
          </p>
        </header>

        <section
          className={
            styles.emptyState
          }
        >
          <div
            className={
              styles.emptyIcon
            }
            aria-hidden="true"
          >
            0
          </div>

          <h2>
            {t(
              "students.empty.title"
            )}
          </h2>

          <p>
            {t(
              "students.empty.text"
            )}
          </p>

          <div
            className={
              styles.futureInfo
            }
          >
            <strong>
              {t(
                "students.future.title"
              )}
            </strong>

            <span>
              {t(
                "students.future.step1"
              )}
            </span>

            <span>
              {t(
                "students.future.step2"
              )}
            </span>

            <span>
              {t(
                "students.future.step3"
              )}
            </span>

            <span>
              {t(
                "students.future.step4"
              )}
            </span>
          </div>
        </section>
      </section>
    </main>
  );
}