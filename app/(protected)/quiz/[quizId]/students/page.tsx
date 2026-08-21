"use client";

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

import {
  getQuiz,
  type Quiz,
} from "@/lib/services/quizzes";

import {
  getQuizAttempts,
  getQuizAttemptStats,
  type Attempt,
  type QuizAttemptStats,
} from "@/lib/services/attempts";

import {
  useTeacher,
} from "@/hooks/useTeacher";

import {
  useLanguage,
} from "@/hooks/useLanguage";

import styles from "./StudentsPage.module.css";

/* =========================================================
   Types
   ========================================================= */

type NavigationTarget =
  | ""
  | "quiz"
  | "attempt";

type StatusFilter =
  | "all"
  | "in_progress"
  | "submitted"
  | "graded";

/* =========================================================
   Empty statistics
   ========================================================= */

const EMPTY_STATS:
  QuizAttemptStats = {
  total: 0,
  inProgress: 0,
  submitted: 0,
  graded: 0,
  finished: 0,
  waitingForCorrection: 0,
};

/* =========================================================
   Helpers
   ========================================================= */

function getStudentInitials(
  name: string
) {
  const words =
    name
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
}

function formatAttemptDate(
  value: string | null,
  language: string
) {
  if (
    !value
  ) {
    return "—";
  }

  const date =
    new Date(
      value
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

  /*
   * English is the default language.
   */
  const locale =
    language === "fr"
      ? "fr-CA"
      : language === "rn"
        ? "rn-BI"
        : "en-CA";

  return date.toLocaleString(
    locale,
    {
      year:
        "numeric",

      month:
        "short",

      day:
        "numeric",

      hour:
        "2-digit",

      minute:
        "2-digit",
    }
  );
}

/* =========================================================
   Page
   ========================================================= */

export default function StudentsPage() {
  const router =
    useRouter();

  const params =
    useParams();

  const {
    t,
    language,
  } = useLanguage();

  const quizId =
    String(
      params.quizId ??
      ""
    ).trim();

  const {
    teacher,
    loading:
      teacherLoading,
  } = useTeacher();

  /* =========================================================
     Quiz
     ========================================================= */

  const [
    quiz,
    setQuiz,
  ] =
    useState<Quiz | null>(
      null
    );

  /* =========================================================
     Attempts
     ========================================================= */

  const [
    attempts,
    setAttempts,
  ] =
    useState<Attempt[]>(
      []
    );

  const [
    stats,
    setStats,
  ] =
    useState<QuizAttemptStats>(
      EMPTY_STATS
    );

  /* =========================================================
     UI
     ========================================================= */

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    message,
    setMessage,
  ] =
    useState("");

  const [
    navigationTarget,
    setNavigationTarget,
  ] =
    useState<NavigationTarget>(
      ""
    );

  const [
    filter,
    setFilter,
  ] =
    useState<StatusFilter>(
      "all"
    );

  /* =========================================================
     Load quiz + attempts
     ========================================================= */

  useEffect(() => {
    let cancelled =
      false;

    async function loadPage() {
      try {
        setLoading(
          true
        );

        setMessage(
          ""
        );

        const [
          quizData,
          attemptsData,
          statsData,
        ] =
          await Promise.all([
            getQuiz(
              quizId
            ),

            getQuizAttempts(
              quizId
            ),

            getQuizAttemptStats(
              quizId
            ),
          ]);

        if (
          cancelled
        ) {
          return;
        }

        setQuiz(
          quizData
        );

        setAttempts(
          attemptsData
        );

        setStats(
          statsData
        );
      } catch (error) {
        console.error(
          "Unable to load quiz students:",
          error
        );

        if (
          !cancelled
        ) {
          setMessage(
            t(
              "students.messages.loadError"
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

    loadPage();

    return () => {
      cancelled =
        true;
    };
  }, [
    quizId,
    t,
  ]);

  /* =========================================================
     Filtered attempts
     ========================================================= */

  const filteredAttempts =
    useMemo(() => {
      if (
        filter ===
        "all"
      ) {
        return attempts;
      }

      return attempts.filter(
        (
          attempt
        ) =>
          attempt.status ===
          filter
      );
    }, [
      attempts,
      filter,
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

  /* =========================================================
     Navigation loading
     ========================================================= */

  if (
    navigationTarget
  ) {
    const subtitle =
      navigationTarget ===
      "attempt"
        ? t(
            "students.loading.openingStudent"
          )
        : t(
            "students.loading.returning"
          );

    return (
      <AppLoading
        title="ULearn"
        subtitle={
          subtitle
        }
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
          <div
            className={
              styles.accessState
            }
          >
            <div
              className={
                styles.accessIcon
              }
              aria-hidden="true"
            >
              !
            </div>

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
          </div>
        </section>
      </main>
    );
  }

  /* =========================================================
     Navigation
     ========================================================= */

  function handleBack() {
    if (
      navigationTarget
    ) {
      return;
    }

    setNavigationTarget(
      "quiz"
    );

    router.push(
      `/quiz/${quizId}`
    );
  }

  function handleAttempt(
    attempt:
      Attempt
  ) {
    if (
      navigationTarget
    ) {
      return;
    }

    /*
     * An attempt can only be opened for correction
     * after the student has submitted it.
     *
     * submitted -> teacher must grade development answers.
     * graded    -> teacher may review the correction.
     */
    if (
      attempt.status ===
      "in_progress"
    ) {
      return;
    }

    setNavigationTarget(
      "attempt"
    );

    router.push(
      `/quiz/${quizId}/students/${attempt.id}`
    );
  }

  /* =========================================================
     Attempt status
     ========================================================= */

  function getAttemptStatusLabel(
    attempt:
      Attempt
  ) {
    if (
      attempt.status ===
      "submitted"
    ) {
      return t(
        "students.status.waitingCorrection"
      );
    }

    if (
      attempt.status ===
      "graded"
    ) {
      return t(
        "students.status.graded"
      );
    }

    return t(
      "students.status.inProgress"
    );
  }

  function getAttemptActionLabel(
    attempt:
      Attempt
  ) {
    if (
      attempt.status ===
      "submitted"
    ) {
      return t(
        "students.actions.grade"
      );
    }

    if (
      attempt.status ===
      "graded"
    ) {
      return t(
        "students.actions.viewCorrection"
      );
    }

    return t(
      "students.status.inProgress"
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
        {/* =================================================
            Top
            ================================================= */}

        <div
          className={
            styles.topBar
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

          <span
            className={
              styles.topCount
            }
          >
            {
              stats.total
            }
            {" / "}
            {
              quiz.maxStudents
            }
            {" "}
            {t(
              "students.students"
            )}
          </span>
        </div>

        {/* =================================================
            Header
            ================================================= */}

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
            {
              quiz.title
            }
          </h1>

          <p>
            {t(
              "students.description"
            )}
          </p>
        </header>

        {/* =================================================
            Statistics
            ================================================= */}

        <section
          className={
            styles.stats
          }
        >
          <article>
            <span>
              {t(
                "students.stats.participants"
              )}
            </span>

            <strong>
              {
                stats.total
              }
              {" / "}
              {
                quiz.maxStudents
              }
            </strong>
          </article>

          <article>
            <span>
              {t(
                "students.stats.inProgress"
              )}
            </span>

            <strong>
              {
                stats.inProgress
              }
            </strong>
          </article>

          <article>
            <span>
              {t(
                "students.stats.waitingCorrection"
              )}
            </span>

            <strong>
              {
                stats.waitingForCorrection
              }
            </strong>
          </article>

          <article>
            <span>
              {t(
                "students.stats.graded"
              )}
            </span>

            <strong>
              {
                stats.graded
              }
            </strong>
          </article>

          <article>
            <span>
              {t(
                "students.stats.finished"
              )}
            </span>

            <strong>
              {
                stats.finished
              }
            </strong>
          </article>
        </section>

        {/* =================================================
            Error
            ================================================= */}

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

        {/* =================================================
            No students
            ================================================= */}

        {attempts.length ===
        0 ? (
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
          </section>
        ) : (
          <>
            {/* ===============================================
                Filters
                =============================================== */}

            <section
              className={
                styles.filterBar
              }
            >
              <div
                className={
                  styles.filterHeading
                }
              >
                <div>
                  <span
                    className={
                      styles.sectionEyebrow
                    }
                  >
                    {t(
                      "students.list.badge"
                    )}
                  </span>

                  <h2>
                    {t(
                      "students.list.title"
                    )}
                  </h2>
                </div>

                <span
                  className={
                    styles.resultCount
                  }
                >
                  {
                    filteredAttempts.length
                  }
                  {" "}
                  {t(
                    "students.list.results"
                  )}
                </span>
              </div>

              <div
                className={
                  styles.filters
                }
              >
                <button
                  type="button"
                  className={
                    filter ===
                    "all"
                      ? styles.filterActive
                      : ""
                  }
                  onClick={() =>
                    setFilter(
                      "all"
                    )
                  }
                >
                  {t(
                    "students.filters.all"
                  )}

                  <span>
                    {
                      stats.total
                    }
                  </span>
                </button>

                <button
                  type="button"
                  className={
                    filter ===
                    "in_progress"
                      ? styles.filterActive
                      : ""
                  }
                  onClick={() =>
                    setFilter(
                      "in_progress"
                    )
                  }
                >
                  {t(
                    "students.filters.inProgress"
                  )}

                  <span>
                    {
                      stats.inProgress
                    }
                  </span>
                </button>

                <button
                  type="button"
                  className={
                    filter ===
                    "submitted"
                      ? styles.filterActive
                      : ""
                  }
                  onClick={() =>
                    setFilter(
                      "submitted"
                    )
                  }
                >
                  {t(
                    "students.filters.waitingCorrection"
                  )}

                  <span>
                    {
                      stats.waitingForCorrection
                    }
                  </span>
                </button>

                <button
                  type="button"
                  className={
                    filter ===
                    "graded"
                      ? styles.filterActive
                      : ""
                  }
                  onClick={() =>
                    setFilter(
                      "graded"
                    )
                  }
                >
                  {t(
                    "students.filters.graded"
                  )}

                  <span>
                    {
                      stats.graded
                    }
                  </span>
                </button>
              </div>
            </section>

            {/* ===============================================
                Attempts
                =============================================== */}

            {filteredAttempts.length ===
            0 ? (
              <section
                className={
                  styles.noFilterResults
                }
              >
                <strong>
                  {t(
                    "students.filters.emptyTitle"
                  )}
                </strong>

                <p>
                  {t(
                    "students.filters.emptyText"
                  )}
                </p>
              </section>
            ) : (
              <section
                className={
                  styles.studentList
                }
              >
                {filteredAttempts.map(
                  (
                    attempt
                  ) => {
                    const initials =
                      getStudentInitials(
                        attempt.studentName
                      );

                    const answeredCount =
                      Object.keys(
                        attempt.answers
                      ).length;

                    const scoreAvailable =
                      attempt.status ===
                        "graded" &&
                      attempt.finalScore !==
                        null;

                    const canOpenAttempt =
                      attempt.status ===
                        "submitted" ||
                      attempt.status ===
                        "graded";

                    return (
                      <article
                        key={
                          attempt.id
                        }
                        className={
                          styles.studentRow
                        }
                      >
                        {/* =================================
                            Identity
                            ================================= */}

                        <div
                          className={
                            styles.studentMain
                          }
                        >
                          <div
                            className={
                              styles.studentAvatar
                            }
                            aria-hidden="true"
                          >
                            {
                              initials
                            }
                          </div>

                          <div
                            className={
                              styles.studentIdentity
                            }
                          >
                            <strong>
                              {
                                attempt.studentName
                              }
                            </strong>

                            <span>
                              {
                                attempt.studentEmail
                              }
                            </span>
                          </div>
                        </div>

                        {/* =================================
                            Progress
                            ================================= */}

                        <div
                          className={
                            styles.studentMetric
                          }
                        >
                          <span>
                            {t(
                              "students.list.answers"
                            )}
                          </span>

                          <strong>
                            {
                              answeredCount
                            }
                            {" / "}
                            {
                              attempt.questionOrder.length
                            }
                          </strong>
                        </div>

                        {/* =================================
                            Started
                            ================================= */}

                        <div
                          className={
                            styles.studentMetric
                          }
                        >
                          <span>
                            {t(
                              "students.list.startedAt"
                            )}
                          </span>

                          <strong>
                            {formatAttemptDate(
                              attempt.startedAt,
                              language
                            )}
                          </strong>
                        </div>

                        {/* =================================
                            Submitted
                            ================================= */}

                        <div
                          className={
                            styles.studentMetric
                          }
                        >
                          <span>
                            {t(
                              "students.list.submittedAt"
                            )}
                          </span>

                          <strong>
                            {formatAttemptDate(
                              attempt.submittedAt,
                              language
                            )}
                          </strong>
                        </div>

                        {/* =================================
                            Score
                            ================================= */}

                        <div
                          className={
                            styles.studentMetric
                          }
                        >
                          <span>
                            {t(
                              "students.list.score"
                            )}
                          </span>

                          <strong>
                            {scoreAvailable
                              ? `${attempt.finalScore} / ${quiz.totalPoints}`
                              : "—"}
                          </strong>
                        </div>

                        {/* =================================
                            Status + action
                            ================================= */}

                        <div
                          className={
                            styles.studentActions
                          }
                        >
                          <span
                            className={`${styles.statusBadge} ${
                              attempt.status ===
                              "submitted"
                                ? styles.statusWaiting
                                : attempt.status ===
                                    "graded"
                                  ? styles.statusGraded
                                  : styles.statusProgress
                            }`}
                          >
                            {getAttemptStatusLabel(
                              attempt
                            )}
                          </span>

                          <button
                            type="button"
                            className="app-button app-button-action"
                            disabled={
                              !canOpenAttempt
                            }
                            onClick={() =>
                              handleAttempt(
                                attempt
                              )
                            }
                          >
                            {getAttemptActionLabel(
                              attempt
                            )}

                            {canOpenAttempt &&
                              " →"}
                          </button>
                        </div>
                      </article>
                    );
                  }
                )}
              </section>
            )}
          </>
        )}
      </section>
    </main>
  );
}