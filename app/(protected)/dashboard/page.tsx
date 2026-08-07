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
 * • Allow the user to change the application language.
 * ============================================================================
 */

import { useState } from "react";

import { UserButton } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

import AppLoading from "@/components/AppLoading";
import LanguageSwitcher from "@/components/LanguageSwitcher";

import { useTeacher } from "@/hooks/useTeacher";
import { useCountdown } from "@/hooks/useCountdown";
import { useLanguage } from "@/hooks/useLanguage";

import styles from "./DashboardPage.module.css";

type NavigationTarget =
  | "create"
  | "open"
  | "";

export default function DashboardPage() {
  const router = useRouter();

  const { t } = useLanguage();

  const {
    teacher,
    loading,
    blocked,
    message,
  } = useTeacher();

  const timeLeft = useCountdown(
    teacher?.expiresAt ?? null
  );

  const [
    navigationTarget,
    setNavigationTarget,
  ] = useState<NavigationTarget>("");

  function navigateTo(
    path: string,
    target: "create" | "open"
  ) {
    if (navigationTarget) {
      return;
    }

    setNavigationTarget(target);

    router.push(path);
  }

  /* =========================================================
     Loading
     ========================================================= */

  if (loading) {
    return (
      <AppLoading
        title="ULearn"
        subtitle={t(
          "dashboard.loading"
        )}
      />
    );
  }

  if (
    navigationTarget ===
    "create"
  ) {
    return (
      <AppLoading
        title={t(
          "dashboard.loadingCreateTitle"
        )}
        subtitle={t(
          "dashboard.loadingCreateSubtitle"
        )}
      />
    );
  }

  if (
    navigationTarget ===
    "open"
  ) {
    return (
      <AppLoading
        title={t(
          "dashboard.loadingOpenTitle"
        )}
        subtitle={t(
          "dashboard.loadingOpenSubtitle"
        )}
      />
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
      <main
        className={
          styles.blockedPage
        }
      >
        <section
          className={
            styles.blockedBox
          }
        >
          <h1>
            {t(
              "dashboard.accessUnavailable"
            )}
          </h1>

          <p>
            {message ||
              t(
                "dashboard.loadError"
              )}
          </p>
        </section>
      </main>
    );
  }

  const hasQuiz =
    Boolean(
      teacher.quizId
    );

  /* =========================================================
     Dashboard
     ========================================================= */

  return (
    <main
      className={
        styles.page
      }
    >
      <header
        className={
          styles.header
        }
      >
        {/* Brand */}

        <div
          className={
            styles.brand
          }
        >
          <h1>
            ULearn
          </h1>

          <p>
            {t(
              "dashboard.welcome"
            )}
            {", "}
            {teacher.name}
            {" 👋"}
          </p>
        </div>

        {/* Account countdown */}

        <div
          className={
            styles.timer
          }
        >
          <span>
            {t(
              "dashboard.accountExpires"
            )}
          </span>

          <strong>
            {timeLeft}
          </strong>
        </div>

        {/* Language + Clerk profile */}

        <div
          className={
            styles.headerActions
          }
        >
          <LanguageSwitcher />

          <UserButton />
        </div>
      </header>

      <section
        className={
          styles.main
        }
      >
        {/* ===================================================
           Create Quiz
           =================================================== */}

        <article
          className={`${styles.card} ${
            hasQuiz
              ? styles.disabled
              : ""
          }`}
        >
          <div
            className={
              styles.icon
            }
          >
            ＋
          </div>

          <div>
            <h2>
              {t(
                "dashboard.create.title"
              )}
            </h2>

            <p>
              {t(
                "dashboard.create.description"
              )}
            </p>

            <button
              type="button"
              className="app-button"
              disabled={
                hasQuiz ||
                Boolean(
                  navigationTarget
                )
              }
              onClick={() =>
                navigateTo(
                  "/quiz/create",
                  "create"
                )
              }
            >
              {hasQuiz
                ? t(
                    "dashboard.create.alreadyCreated"
                  )
                : `${t(
                    "dashboard.create.button"
                  )} →`}
            </button>

            <small>
              {hasQuiz
                ? t(
                    "dashboard.create.deleteCurrent"
                  )
                : t(
                    "dashboard.create.limit"
                  )}
            </small>
          </div>
        </article>

        {/* ===================================================
           Existing Quiz
           =================================================== */}

        <article
          className={
            styles.card
          }
        >
          <div
            className={
              styles.icon
            }
          >
            ☰
          </div>

          <div>
            <h2>
              {t(
                "dashboard.quizzes.title"
              )}
            </h2>

            <p>
              {t(
                "dashboard.quizzes.description"
              )}
            </p>

            <button
              type="button"
              className="app-button"
              disabled={
                !hasQuiz ||
                Boolean(
                  navigationTarget
                )
              }
              onClick={() => {
                if (
                  teacher.quizId
                ) {
                  navigateTo(
                    `/quiz/${teacher.quizId}`,
                    "open"
                  );
                }
              }}
            >
              {hasQuiz
                ? `${t(
                    "dashboard.quizzes.open"
                  )} →`
                : t(
                    "dashboard.quizzes.none"
                  )}
            </button>

            <small>
              {hasQuiz
                ? t(
                    "dashboard.quizzes.manage"
                  )
                : t(
                    "dashboard.quizzes.createFirst"
                  )}
            </small>
          </div>
        </article>
      </section>
    </main>
  );
}