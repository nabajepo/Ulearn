"use client";

/**
 * ============================================================================
 * ULearn - Student Feedback Page
 * ============================================================================
 *
 * Public feedback page linked to a student quiz attempt.
 *
 * Desktop:
 * • Left column  -> student identity + introduction.
 * • Right column -> feedback form.
 *
 * Mobile:
 * • Single vertical column.
 *
 * Feedback submission logic remains inside:
 * components/FeedbackForm.tsx
 * ============================================================================
 */

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useParams,
  useRouter,
} from "next/navigation";

import AppLoading from "@/components/AppLoading";
import FeedbackForm from "@/components/FeedbackForm";
import HelpSupport from "@/components/HelpSupport";

import {
  getAttempt,
  type Attempt,
} from "@/lib/services/attempts";

import {
  useLanguage,
} from "@/hooks/useLanguage";

import styles from "./FeedbackPage.module.css";

/* =========================================================
   Page
   ========================================================= */

export default function StudentFeedbackPage() {
  const params =
    useParams();

  const router =
    useRouter();

  const {
    t,
  } =
    useLanguage();

  const attemptId =
    String(
      params.attemptId ??
      ""
    ).trim();

  const [
    attempt,
    setAttempt,
  ] =
    useState<Attempt | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    returning,
    setReturning,
  ] =
    useState(false);

  /* =========================================================
     Load attempt
     ========================================================= */

  useEffect(() => {
    let cancelled =
      false;

    async function loadAttempt() {
      try {
        setLoading(
          true
        );

        setError(
          ""
        );

        if (
          !attemptId
        ) {
          if (
            !cancelled
          ) {
            setError(
              t(
                "studentFeedback.access.invalidAttempt"
              )
            );
          }

          return;
        }

        const data =
          await getAttempt(
            attemptId
          );

        if (
          cancelled
        ) {
          return;
        }

        if (
          !data
        ) {
          setAttempt(
            null
          );

          setError(
            t(
              "studentFeedback.access.notFound"
            )
          );

          return;
        }

        setAttempt(
          data
        );
      } catch (error) {
        console.error(
          "Unable to load student feedback attempt:",
          error
        );

        if (
          !cancelled
        ) {
          setError(
            t(
              "studentFeedback.access.loadError"
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

    loadAttempt();

    return () => {
      cancelled =
        true;
    };
  }, [
    attemptId,
    t,
  ]);

  /* =========================================================
     Student initials
     ========================================================= */

  const studentInitials =
    useMemo(() => {
      if (
        !attempt
      ) {
        return "U";
      }

      const words =
        attempt.studentName
          .trim()
          .split(/\s+/)
          .filter(Boolean);

      if (
        words.length ===
        0
      ) {
        return "U";
      }

      if (
        words.length ===
        1
      ) {
        return words[0]
          .charAt(0)
          .toUpperCase();
      }

      return (
        words[0]
          .charAt(0) +
        words[
          words.length - 1
        ].charAt(0)
      ).toUpperCase();
    }, [
      attempt,
    ]);

  /* =========================================================
     Return to quiz
     ========================================================= */

  function handleBackToQuiz() {
    if (
      !attempt ||
      returning
    ) {
      return;
    }

    setReturning(
      true
    );

    router.push(
      `/quiz-session/${attempt.id}`
    );
  }

  /* =========================================================
     Loading
     ========================================================= */

  if (
    loading
  ) {
    return (
      <>
        <AppLoading
          title={t(
            "studentFeedback.loading.title"
          )}
          subtitle={t(
            "studentFeedback.loading.subtitle"
          )}
        />

        <HelpSupport
          context="anonymous"
        />
      </>
    );
  }

  /* =========================================================
     Returning
     ========================================================= */

  if (
    returning
  ) {
    return (
      <>
        <AppLoading
          title="ULearn"
          subtitle={t(
            "studentFeedback.loading.returning"
          )}
        />

        <HelpSupport
          context={
            attempt
              ? "student"
              : "anonymous"
          }
          studentIdentity={
            attempt
              ? {
                  name:
                    attempt.studentName,

                  email:
                    attempt.studentEmail,

                  attemptId:
                    attempt.id,

                  quizId:
                    attempt.quizId,
                }
              : null
          }
        />
      </>
    );
  }

  /* =========================================================
     Error
     ========================================================= */

  if (
    error ||
    !attempt
  ) {
    return (
      <>
        <main
          className={
            styles.page
          }
        >
          <section
            className={`${styles.card} ${styles.errorCard}`}
          >
            <span
              className={
                styles.badge
              }
            >
              ULearn
            </span>

            <div
              className={
                styles.errorIcon
              }
              aria-hidden="true"
            >
              !
            </div>

            <h1>
              {t(
                "studentFeedback.access.title"
              )}
            </h1>

            <p>
              {error ||
                t(
                  "studentFeedback.access.notFound"
                )}
            </p>

            <div
              className={
                styles.errorActions
              }
            >
              <button
                type="button"
                className="app-button app-button-action"
                onClick={() => {
                  router.push(
                    "/"
                  );
                }}
              >
                {t(
                  "studentFeedback.actions.home"
                )}
              </button>
            </div>
          </section>
        </main>

        <HelpSupport
          context="anonymous"
        />
      </>
    );
  }

  /* =========================================================
     Student identity
     ========================================================= */

  const studentIdentity = {
    name:
      attempt.studentName,

    email:
      attempt.studentEmail,

    attemptId:
      attempt.id,

    quizId:
      attempt.quizId,
  };

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
              Header
              ================================================= */}

          <header
            className={
              styles.header
            }
          >
            <div
              className={
                styles.brand
              }
            >
              <span
                className={
                  styles.brandIcon
                }
                aria-hidden="true"
              >
                U
              </span>

              <strong>
                ULearn
              </strong>
            </div>

            <button
              type="button"
              className={
                styles.backButton
              }
              onClick={
                handleBackToQuiz
              }
            >
              ←{" "}
              {t(
                "studentFeedback.actions.backToQuiz"
              )}
            </button>
          </header>

          {/* =================================================
              Main horizontal layout
              ================================================= */}

          <div
            className={
              styles.contentGrid
            }
          >
            {/* ===============================================
                Left side
                =============================================== */}

            <aside
              className={
                styles.sidePanel
              }
            >
              <section
                className={
                  styles.hero
                }
              >
                <span
                  className={
                    styles.badge
                  }
                >
                  {t(
                    "studentFeedback.badge"
                  )}
                </span>

                <h1>
                  {t(
                    "studentFeedback.title"
                  )}
                </h1>

                <p>
                  {t(
                    "studentFeedback.description"
                  )}
                </p>
              </section>

              {/* =============================================
                  Student identity
                  ============================================= */}

              <section
                className={
                  styles.studentCard
                }
              >
                <div
                  className={
                    styles.studentAvatar
                  }
                  aria-hidden="true"
                >
                  {
                    studentInitials
                  }
                </div>

                <div
                  className={
                    styles.studentInfo
                  }
                >
                  <span>
                    {t(
                      "studentFeedback.student.label"
                    )}
                  </span>

                  <strong>
                    {
                      attempt.studentName
                    }
                  </strong>

                  <small>
                    {
                      attempt.studentEmail
                    }
                  </small>
                </div>
              </section>

              {/* =============================================
                  Information
                  ============================================= */}

              <div
                className={
                  styles.sideNote
                }
              >
                <span
                  aria-hidden="true"
                >
                  ★
                </span>

                <p>
                  {t(
                    "studentFeedback.description"
                  )}
                </p>
              </div>
            </aside>

            {/* ===============================================
                Feedback form
                =============================================== */}

            <section
              className={
                styles.formSection
              }
            >
              <FeedbackForm
                authorType="student"
                studentIdentity={
                  studentIdentity
                }
              />
            </section>
          </div>

          {/* =================================================
              Bottom actions
              ================================================= */}

          <footer
            className={
              styles.actions
            }
          >
            <button
              type="button"
              className="app-button app-button-secondary app-button-action"
              onClick={
                handleBackToQuiz
              }
            >
              {t(
                "studentFeedback.actions.backToQuiz"
              )}
            </button>
          </footer>
        </section>
      </main>

      <HelpSupport
        context="student"
        studentIdentity={
          studentIdentity
        }
      />
    </>
  );
}