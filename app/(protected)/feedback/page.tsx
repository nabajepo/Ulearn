"use client";

/**
 * ============================================================================
 * ULearn - Teacher Feedback Page
 * ============================================================================
 *
 * Protected page allowing an authenticated teacher
 * to leave feedback about ULearn.
 *
 * Desktop layout:
 * • Left column  -> teacher identity + page introduction.
 * • Right column -> feedback form.
 *
 * Mobile layout:
 * • Everything becomes a single vertical column.
 *
 * The feedback creation logic remains inside:
 * components/FeedbackForm.tsx
 * ============================================================================
 */

import {
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import AppLoading from "@/components/AppLoading";
import FeedbackForm from "@/components/FeedbackForm";
import HelpSupport from "@/components/HelpSupport";

import {
  useTeacher,
} from "@/hooks/useTeacher";

import {
  useLanguage,
} from "@/hooks/useLanguage";

import styles from "./FeedbackPage.module.css";

/* =========================================================
   Page
   ========================================================= */

export default function TeacherFeedbackPage() {
  const router =
    useRouter();

  const {
    t,
  } =
    useLanguage();

  const {
    teacher,
    loading,
    blocked,
    message,
  } =
    useTeacher();

  const [
    returning,
    setReturning,
  ] =
    useState(false);

  /* =========================================================
     Return to dashboard
     ========================================================= */

  function handleBack() {
    if (
      returning
    ) {
      return;
    }

    setReturning(
      true
    );

    router.push(
      "/dashboard"
    );
  }

  /* =========================================================
     Initial loading
     ========================================================= */

  if (
    loading
  ) {
    return (
      <>
        <AppLoading
          title={t(
            "teacherFeedback.loading.title"
          )}
          subtitle={t(
            "teacherFeedback.loading.subtitle"
          )}
        />

        <HelpSupport
          context="teacher"
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
            "teacherFeedback.loading.returning"
          )}
        />

        <HelpSupport
          context="teacher"
        />
      </>
    );
  }

  /* =========================================================
     Access unavailable
     ========================================================= */

  if (
    blocked ||
    !teacher
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
                "teacherFeedback.access.title"
              )}
            </h1>

            <p>
              {message ||
                t(
                  "teacherFeedback.access.text"
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
                    "/dashboard"
                  );
                }}
              >
                {t(
                  "teacherFeedback.actions.dashboard"
                )}
              </button>
            </div>
          </section>
        </main>

        <HelpSupport
          context="teacher"
        />
      </>
    );
  }

  /* =========================================================
     Teacher initials
     ========================================================= */

  const words =
    teacher.name
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  let initials =
    "T";

  if (
    words.length ===
    1
  ) {
    initials =
      words[0]
        .charAt(0)
        .toUpperCase();
  } else if (
    words.length >
    1
  ) {
    initials =
      (
        words[0]
          .charAt(0) +
        words[
          words.length - 1
        ].charAt(0)
      ).toUpperCase();
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
                handleBack
              }
            >
              ←{" "}
              {t(
                "teacherFeedback.actions.dashboard"
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
                Left column
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
                    "teacherFeedback.badge"
                  )}
                </span>

                <h1>
                  {t(
                    "teacherFeedback.title"
                  )}
                </h1>

                <p>
                  {t(
                    "teacherFeedback.description"
                  )}
                </p>
              </section>

              {/* =============================================
                  Teacher identity
                  ============================================= */}

              <section
                className={
                  styles.teacherCard
                }
              >
                <div
                  className={
                    styles.teacherAvatar
                  }
                  aria-hidden="true"
                >
                  {
                    initials
                  }
                </div>

                <div
                  className={
                    styles.teacherInfo
                  }
                >
                  <span>
                    {t(
                      "teacherFeedback.teacher.label"
                    )}
                  </span>

                  <strong>
                    {
                      teacher.name
                    }
                  </strong>

                  <small>
                    {
                      teacher.email
                    }
                  </small>
                </div>
              </section>

              {/* =============================================
                  Small information block
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
                    "teacherFeedback.footer"
                  )}
                </p>
              </div>
            </aside>

            {/* ===============================================
                Right column
                =============================================== */}

            <section
              className={
                styles.formSection
              }
            >
              <FeedbackForm
                authorType="teacher"
              />
            </section>
          </div>

          {/* =================================================
              Bottom
              ================================================= */}

          <footer
            className={
              styles.footer
            }
          >
            <p>
              {t(
                "teacherFeedback.footer"
              )}
            </p>

            <button
              type="button"
              className="app-button app-button-secondary app-button-action"
              onClick={
                handleBack
              }
            >
              {t(
                "teacherFeedback.actions.dashboard"
              )}
            </button>
          </footer>
        </section>
      </main>

      <HelpSupport
        context="teacher"
      />
    </>
  );
}