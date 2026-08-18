"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import {
  useParams,
  useRouter,
} from "next/navigation";

import AppLoading from "@/components/AppLoading";
import HelpSupport from "@/components/HelpSupport";

import {
  getQuizByAccessCode,
  type Quiz,
} from "@/lib/services/quizzes";

import {
  startAttempt,
} from "@/lib/services/attempts";

import {
  formatInTimeZone,
} from "@/lib/dateTime";

import {
  formatQuizDuration,
} from "@/lib/quizDuration";

import {
  useLanguage,
} from "@/hooks/useLanguage";

import styles from "./JoinQuizPage.module.css";

/* =========================================================
   Types
   ========================================================= */

type AvailabilityState =
  | "available"
  | "waiting"
  | "ended"
  | "unavailable";

/* =========================================================
   Helpers
   ========================================================= */

function formatCountdown(
  milliseconds: number
) {
  const safe =
    Math.max(
      0,
      milliseconds
    );

  const totalSeconds =
    Math.floor(
      safe / 1000
    );

  const hours =
    Math.floor(
      totalSeconds / 3600
    );

  const minutes =
    Math.floor(
      (
        totalSeconds %
        3600
      ) /
      60
    );

  const seconds =
    totalSeconds %
    60;

  return [
    hours,
    minutes,
    seconds,
  ]
    .map(
      (value) =>
        String(
          value
        ).padStart(
          2,
          "0"
        )
    )
    .join(":");
}

function isValidEmail(
  value: string
) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value
  );
}

/* =========================================================
   Page
   ========================================================= */

export default function JoinQuizPage() {
  const router =
    useRouter();

  const params =
    useParams();

  const {
    t,
    language,
  } =
    useLanguage();

  const accessCode =
    String(
      params.accessCode ??
      ""
    )
      .trim()
      .toUpperCase();

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
    submitting,
    setSubmitting,
  ] =
    useState(false);

  const [
    message,
    setMessage,
  ] =
    useState("");

  const [
    studentName,
    setStudentName,
  ] =
    useState("");

  const [
    studentEmail,
    setStudentEmail,
  ] =
    useState("");

  const [
    now,
    setNow,
  ] =
    useState(
      Date.now()
    );

  /* =========================================================
     Load quiz
     ========================================================= */

  useEffect(() => {
    let cancelled =
      false;

    async function loadQuiz() {
      try {
        const data =
          await getQuizByAccessCode(
            accessCode
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
          "Unable to load student quiz access:",
          error
        );

        if (
          !cancelled
        ) {
          setMessage(
            t(
              "joinQuiz.messages.loadError"
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

    loadQuiz();

    return () => {
      cancelled =
        true;
    };
  }, [
    accessCode,
    t,
  ]);

  /* =========================================================
     Clock
     ========================================================= */

  useEffect(() => {
    const interval =
      window.setInterval(
        () => {
          setNow(
            Date.now()
          );
        },
        1000
      );

    return () => {
      window.clearInterval(
        interval
      );
    };
  }, []);

  /* =========================================================
     Quiz times
     ========================================================= */

  const startMs =
    useMemo(() => {
      if (
        !quiz?.availableFrom
      ) {
        return null;
      }

      const value =
        new Date(
          quiz.availableFrom
        ).getTime();

      return Number.isNaN(
        value
      )
        ? null
        : value;
    }, [
      quiz?.availableFrom,
    ]);

  const endMs =
    useMemo(() => {
      if (
        !quiz?.availableUntil
      ) {
        return null;
      }

      const value =
        new Date(
          quiz.availableUntil
        ).getTime();

      return Number.isNaN(
        value
      )
        ? null
        : value;
    }, [
      quiz?.availableUntil,
    ]);

  /* =========================================================
     Availability
     ========================================================= */

  const availabilityState:
    AvailabilityState =
    useMemo(() => {
      if (
        !quiz
      ) {
        return "unavailable";
      }

      if (
        quiz.status !==
        "launched"
      ) {
        return "unavailable";
      }

      if (
        endMs ===
        null
      ) {
        return "unavailable";
      }

      if (
        now >=
        endMs
      ) {
        return "ended";
      }

      if (
        startMs !==
          null &&
        now <
          startMs
      ) {
        return "waiting";
      }

      return "available";
    }, [
      quiz,
      startMs,
      endMs,
      now,
    ]);

  /* =========================================================
     Countdown
     ========================================================= */

  const countdownLabel =
    useMemo(() => {
      if (
        availabilityState ===
          "waiting" &&
        startMs !==
          null
      ) {
        return formatCountdown(
          startMs -
          now
        );
      }

      if (
        availabilityState ===
          "available" &&
        endMs !==
          null
      ) {
        return formatCountdown(
          endMs -
          now
        );
      }

      return "";
    }, [
      availabilityState,
      startMs,
      endMs,
      now,
    ]);

  /* =========================================================
     Start / resume attempt
     ========================================================= */

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      !quiz ||
      submitting
    ) {
      return;
    }

    setMessage(
      ""
    );

    const cleanName =
      studentName.trim();

    const cleanEmail =
      studentEmail
        .trim()
        .toLowerCase();

    /* =====================================================
       Name validation
       ===================================================== */

    if (
      !cleanName ||
      cleanName.length <
        2
    ) {
      setMessage(
        t(
          "joinQuiz.validation.nameRequired"
        )
      );

      return;
    }

    /* =====================================================
       Email validation
       ===================================================== */

    if (
      !cleanEmail
    ) {
      setMessage(
        t(
          "joinQuiz.validation.emailRequired"
        )
      );

      return;
    }

    if (
      !isValidEmail(
        cleanEmail
      )
    ) {
      setMessage(
        t(
          "joinQuiz.validation.invalidEmail"
        )
      );

      return;
    }

    /* =====================================================
       Availability
       ===================================================== */

    if (
      availabilityState !==
      "available"
    ) {
      return;
    }

    /* =====================================================
       Loading
       ===================================================== */

    setSubmitting(
      true
    );

    try {
      const result =
        await startAttempt({
          quizId:
            quiz.id,

          studentName:
            cleanName,

          studentEmail:
            cleanEmail,
        });

      if (
        !result.success ||
        !result.attempt
      ) {
        /*
         * We intentionally do NOT display
         * result.message here because attempts.ts
         * still contains service-layer English
         * messages.
         *
         * The public UI must remain fully i18n.
         */

        setSubmitting(
          false
        );

        setMessage(
          t(
            "joinQuiz.messages.startError"
          )
        );

        return;
      }

      /*
       * Important:
       *
       * Do NOT set submitting back to false here.
       *
       * The loading screen remains visible until
       * Next.js finishes navigating to the student's
       * quiz session.
       */
      router.push(
        `/quiz-session/${result.attempt.id}`
      );
    } catch (error) {
      console.error(
        "Unable to start quiz:",
        error
      );

      setSubmitting(
        false
      );

      setMessage(
        t(
          "joinQuiz.messages.startError"
        )
      );
    }
  }

  /* =========================================================
     Loading quiz information
     ========================================================= */

  if (
    loading
  ) {
    return (
      <>
        <AppLoading
          title="ULearn"
          subtitle={t(
            "joinQuiz.loading"
          )}
        />

        <HelpSupport
          context="anonymous"
        />
      </>
    );
  }

  /* =========================================================
     Starting quiz
     ========================================================= */

  if (
    submitting
  ) {
    return (
      <>
        <AppLoading
          title={t(
            "joinQuiz.starting.title"
          )}
          subtitle={t(
            "joinQuiz.starting.subtitle"
          )}
        />

        <HelpSupport
          context="anonymous"
        />
      </>
    );
  }

  /* =========================================================
     Quiz not found
     ========================================================= */

  if (
    !quiz
  ) {
    return (
      <>
        <main
          className={
            styles.page
          }
        >
          <section
            className={
              styles.errorCard
            }
          >
            <span
              className={
                styles.badge
              }
            >
              ULearn
            </span>

            <h1>
              {t(
                "joinQuiz.notFound.title"
              )}
            </h1>

            <p>
              {t(
                "joinQuiz.notFound.text"
              )}
            </p>

            <strong
              className={
                styles.accessCode
              }
            >
              {
                accessCode
              }
            </strong>
          </section>
        </main>

        <HelpSupport
          context="anonymous"
        />
      </>
    );
  }

  const timeZone =
    quiz.timeZone ||
    "America/Toronto";

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
              styles.top
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
              >
                U
              </span>

              <strong>
                ULearn
              </strong>
            </div>

            <span
              className={
                styles.codeBadge
              }
            >
              {
                accessCode
              }
            </span>
          </header>

          {/* =================================================
              Quiz information
              ================================================= */}

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
                "joinQuiz.badge"
              )}
            </span>

            <h1>
              {
                quiz.title
              }
            </h1>

            {quiz.createdByName && (
              <div
                className={
                  styles.createdBy
                }
              >
                <span>
                  {t(
                    "joinQuiz.teacher.createdBy"
                  )}
                </span>

                <strong>
                  {
                    quiz.createdByName
                  }
                </strong>
              </div>
            )}

            <p
              className={
                styles.description
              }
            >
              {quiz.description ||
                t(
                  "joinQuiz.noDescription"
                )}
            </p>
          </section>

          {/* =================================================
              Availability
              ================================================= */}

          {availabilityState ===
            "waiting" && (
            <section
              className={
                styles.stateBox
              }
            >
              <span>
                {t(
                  "joinQuiz.waiting.label"
                )}
              </span>

              <strong
                className={
                  styles.countdown
                }
              >
                {
                  countdownLabel
                }
              </strong>

              <p>
                {t(
                  "joinQuiz.waiting.text"
                )}
              </p>
            </section>
          )}

          {availabilityState ===
            "ended" && (
            <section
              className={
                styles.stateBox
              }
            >
              <strong>
                {t(
                  "joinQuiz.ended.title"
                )}
              </strong>

              <p>
                {t(
                  "joinQuiz.ended.text"
                )}
              </p>
            </section>
          )}

          {availabilityState ===
            "unavailable" && (
            <section
              className={
                styles.stateBox
              }
            >
              <strong>
                {t(
                  "joinQuiz.unavailable.title"
                )}
              </strong>

              <p>
                {t(
                  "joinQuiz.unavailable.text"
                )}
              </p>
            </section>
          )}

          {/* =================================================
              Quiz summary
              ================================================= */}

          <section
            className={
              styles.summary
            }
          >
            <article>
              <span>
                {t(
                  "joinQuiz.summary.questions"
                )}
              </span>

              <strong>
                {
                  quiz.targetQuestions
                }
              </strong>
            </article>

            <article>
              <span>
                {t(
                  "joinQuiz.summary.points"
                )}
              </span>

              <strong>
                {
                  quiz.totalPoints
                }
              </strong>
            </article>

            <article>
              <span>
                {quiz.availabilityMode ===
                "open_window"
                  ? t(
                      "joinQuiz.summary.timePerStudent"
                    )
                  : t(
                      "joinQuiz.summary.sessionDuration"
                    )}
              </span>

              <strong>
                {formatQuizDuration(
                  quiz.timeLimitMinutes,
                  language
                )}
              </strong>
            </article>

            <article>
              <span>
                {t(
                  "joinQuiz.summary.mode"
                )}
              </span>

              <strong>
                {quiz.availabilityMode ===
                "open_window"
                  ? t(
                      "joinQuiz.modes.openWindow"
                    )
                  : t(
                      "joinQuiz.modes.scheduledSession"
                    )}
              </strong>
            </article>

            <article>
              <span>
                {t(
                  "joinQuiz.summary.starts"
                )}
              </span>

              <strong>
                {quiz.availableFrom
                  ? formatInTimeZone(
                      quiz.availableFrom,
                      timeZone
                    )
                  : t(
                      "joinQuiz.summary.immediately"
                    )}
              </strong>
            </article>

            <article>
              <span>
                {t(
                  "joinQuiz.summary.ends"
                )}
              </span>

              <strong>
                {quiz.availableUntil
                  ? formatInTimeZone(
                      quiz.availableUntil,
                      timeZone
                    )
                  : t(
                      "joinQuiz.summary.notSet"
                    )}
              </strong>
            </article>

            <article>
              <span>
                {t(
                  "joinQuiz.summary.timeZone"
                )}
              </span>

              <strong>
                {
                  timeZone
                }
              </strong>
            </article>

            {availabilityState ===
              "available" && (
              <article>
                <span>
                  {t(
                    "joinQuiz.summary.timeRemaining"
                  )}
                </span>

                <strong
                  className={
                    styles.countdown
                  }
                >
                  {
                    countdownLabel
                  }
                </strong>
              </article>
            )}
          </section>

          {/* =================================================
              Student identification
              ================================================= */}

          <section
            className={
              styles.studentSection
            }
          >
            <div
              className={
                styles.studentHeading
              }
            >
              <span
                className={
                  styles.badge
                }
              >
                {t(
                  "joinQuiz.student.badge"
                )}
              </span>

              <h2>
                {t(
                  "joinQuiz.student.title"
                )}
              </h2>

              <p>
                {t(
                  "joinQuiz.student.description"
                )}
              </p>
            </div>

            <form
              className={
                styles.form
              }
              onSubmit={
                handleSubmit
              }
            >
              {/* =============================================
                  Name
                  ============================================= */}

              <label
                htmlFor="student-name"
              >
                {t(
                  "joinQuiz.student.name"
                )}

                <input
                  id="student-name"
                  name="studentName"
                  type="text"
                  value={
                    studentName
                  }
                  maxLength={
                    120
                  }
                  required
                  autoComplete="name"
                  placeholder={t(
                    "joinQuiz.student.namePlaceholder"
                  )}
                  disabled={
                    availabilityState !==
                      "available" ||
                    submitting
                  }
                  onChange={(
                    event
                  ) => {
                    setStudentName(
                      event.target.value
                    );

                    setMessage(
                      ""
                    );
                  }}
                />
              </label>

              {/* =============================================
                  Email
                  ============================================= */}

              <label
                htmlFor="student-email"
              >
                {t(
                  "joinQuiz.student.email"
                )}

                <input
                  id="student-email"
                  name="studentEmail"
                  type="email"
                  value={
                    studentEmail
                  }
                  maxLength={
                    200
                  }
                  required
                  autoComplete="email"
                  inputMode="email"
                  placeholder={t(
                    "joinQuiz.student.emailPlaceholder"
                  )}
                  disabled={
                    availabilityState !==
                      "available" ||
                    submitting
                  }
                  onChange={(
                    event
                  ) => {
                    setStudentEmail(
                      event.target.value
                    );

                    setMessage(
                      ""
                    );
                  }}
                />
              </label>

              {/* =============================================
                  Message
                  ============================================= */}

              {message && (
                <p
                  className={
                    styles.message
                  }
                  role="alert"
                >
                  {
                    message
                  }
                </p>
              )}

              {/* =============================================
                  Start
                  ============================================= */}

              <button
                type="submit"
                className="app-button app-button-action"
                disabled={
                  availabilityState !==
                    "available" ||
                  submitting
                }
              >
                {t(
                  "joinQuiz.student.start"
                )}
              </button>
            </form>
          </section>
        </section>
      </main>

      {/* =====================================================
          Help support

          No Attempt exists yet on the join page.

          Clerk is ignored completely here.

          Support therefore remains anonymous:
          - no teacher identity
          - no teacher email
          - no student identity yet
          ===================================================== */}

      <HelpSupport
        context="anonymous"
      />
    </>
  );
}