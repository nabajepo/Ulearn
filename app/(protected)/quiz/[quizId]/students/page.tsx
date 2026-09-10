"use client";

/**
 * ============================================================================
 * ULearn - Students and grading page
 * ============================================================================
 *
 * Responsibilities:
 * • Display every attempt for one quiz.
 * • Update attempts in real time using Firestore.
 * • Display quiz attempt statistics.
 * • Allow the teacher to open submitted / graded attempts.
 * • Export all corrected copies as PDF files inside one ZIP archive.
 *
 * ZIP export rule:
 * • The button is always visible.
 * • It remains disabled until ALL attempts are graded.
 * • Once the last attempt is graded, Firestore updates the page in real time
 *   and automatically enables the ZIP button.
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

import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

import {
  pdf,
} from "@react-pdf/renderer";

import JSZip from "jszip";

import AppLoading from "@/components/AppLoading";

import AttemptCorrectionPdf, {
  type PdfLanguage,
} from "@/components/AttemptCorrectionPdf";

import {
  db,
} from "@/lib/firebase";

import {
  getQuiz,
  type Quiz,
} from "@/lib/services/quizzes";

import {
  getQuizAttempts,
  type Attempt,
  type QuizAttemptStats,
} from "@/lib/services/attempts";

import {
  getQuizQuestions,
} from "@/lib/services/questions";

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
   Student initials
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
    words.length === 0
  ) {
    return "U";
  }

  if (
    words.length === 1
  ) {
    return words[0]
      .charAt(0)
      .toUpperCase();
  }

  return (
    words[0].charAt(0) +
    words[
      words.length - 1
    ].charAt(0)
  ).toUpperCase();
}

/* =========================================================
   Date formatting
   ========================================================= */

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
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

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
   Statistics
   ========================================================= */

function calculateStats(
  attempts: Attempt[]
): QuizAttemptStats {
  let inProgress =
    0;

  let submitted =
    0;

  let graded =
    0;

  for (
    const attempt of
    attempts
  ) {
    if (
      attempt.status ===
      "in_progress"
    ) {
      inProgress +=
        1;

      continue;
    }

    if (
      attempt.status ===
      "submitted"
    ) {
      submitted +=
        1;

      continue;
    }

    if (
      attempt.status ===
      "graded"
    ) {
      graded +=
        1;
    }
  }

  return {
    total:
      attempts.length,

    inProgress,

    submitted,

    graded,

    finished:
      submitted +
      graded,

    waitingForCorrection:
      submitted,
  };
}

/* =========================================================
   PDF language
   ========================================================= */

function getPdfLanguage(
  language: string
): PdfLanguage {
  if (
    language === "fr"
  ) {
    return "fr";
  }

  if (
    language === "rn"
  ) {
    return "rn";
  }

  return "en";
}

/* =========================================================
   Safe filenames
   ========================================================= */

function sanitizeFileName(
  value: string
) {
  const sanitized =
    value
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        ""
      )
      .replace(
        /[^a-zA-Z0-9-_ ]/g,
        ""
      )
      .trim()
      .replace(
        /\s+/g,
        "-"
      );

  return (
    sanitized ||
    "document"
  );
}

/* =========================================================
   Browser download
   ========================================================= */

function downloadBlob(
  blob: Blob,
  fileName: string
) {
  const url =
    URL.createObjectURL(
      blob
    );

  const link =
    document.createElement(
      "a"
    );

  link.href =
    url;

  link.download =
    fileName;

  link.style.display =
    "none";

  document.body.appendChild(
    link
  );

  link.click();

  link.remove();

  window.setTimeout(
    () => {
      URL.revokeObjectURL(
        url
      );
    },
    1000
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
  } =
    useLanguage();

  const quizId =
    String(
      params.quizId ??
      ""
    ).trim();

  const {
    teacher,
    loading:
      teacherLoading,
  } =
    useTeacher();

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
    realtimeReady,
    setRealtimeReady,
  ] =
    useState(false);

  const [
    message,
    setMessage,
  ] =
    useState("");

  const [
    successMessage,
    setSuccessMessage,
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

  const [
    generatingZip,
    setGeneratingZip,
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
        setLoading(
          true
        );

        setMessage(
          ""
        );

        if (
          !quizId
        ) {
          setQuiz(
            null
          );

          return;
        }

        const quizData =
          await getQuiz(
            quizId
          );

        if (
          cancelled
        ) {
          return;
        }

        setQuiz(
          quizData
        );
      } catch (error) {
        console.error(
          "Unable to load quiz:",
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

    loadQuiz();

    return () => {
      cancelled =
        true;
    };
  }, [
    quizId,
    t,
  ]);

  /* =========================================================
     Real-time attempts
     ========================================================= */

  useEffect(() => {
    if (
      !quizId
    ) {
      setAttempts(
        []
      );

      setStats(
        EMPTY_STATS
      );

      setRealtimeReady(
        true
      );

      return;
    }

    setRealtimeReady(
      false
    );

    const attemptsQuery =
      query(
        collection(
          db,
          "attempts"
        ),

        where(
          "quizId",
          "==",
          quizId
        )
      );

    const unsubscribe =
      onSnapshot(
        attemptsQuery,

        async () => {
          try {
            const realtimeAttempts =
              await getQuizAttempts(
                quizId
              );

            const sortedAttempts =
              [
                ...realtimeAttempts,
              ].sort(
                (
                  first,
                  second
                ) => {
                  const firstTime =
                    new Date(
                      first.startedAt
                    ).getTime();

                  const secondTime =
                    new Date(
                      second.startedAt
                    ).getTime();

                  return (
                    secondTime -
                    firstTime
                  );
                }
              );

            setAttempts(
              sortedAttempts
            );

            setStats(
              calculateStats(
                sortedAttempts
              )
            );

            setMessage(
              ""
            );

            setRealtimeReady(
              true
            );
          } catch (error) {
            console.error(
              "Unable to refresh realtime quiz attempts:",
              error
            );

            setMessage(
              t(
                "students.messages.loadError"
              )
            );

            setRealtimeReady(
              true
            );
          }
        },

        (
          error
        ) => {
          console.error(
            "Realtime quiz attempts listener failed:",
            error
          );

          setMessage(
            t(
              "students.messages.loadError"
            )
          );

          setRealtimeReady(
            true
          );
        }
      );

    return () => {
      unsubscribe();
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
        filter === "all"
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
     ZIP availability
     ========================================================= */

  const canDownloadAllCorrections =
    stats.total >
      0 &&
    stats.graded ===
      stats.total;

  /* =========================================================
     Loading
     ========================================================= */

  if (
    teacherLoading ||
    loading ||
    !realtimeReady
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
     ZIP generation loading
     ========================================================= */

  if (
    generatingZip
  ) {
    return (
      <AppLoading
        title={t(
          "students.zip.loadingTitle"
        )}
        subtitle={t(
          "students.zip.loadingSubtitle"
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
      navigationTarget ||
      generatingZip
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
      navigationTarget ||
      generatingZip
    ) {
      return;
    }

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
     ZIP export
     ========================================================= */

  async function handleDownloadAllCorrections() {
    if (
      generatingZip ||
      !canDownloadAllCorrections
    ) {
      return;
    }

    setMessage(
      ""
    );

    setSuccessMessage(
      ""
    );

    setGeneratingZip(
      true
    );

    try {
      const questions =
        await getQuizQuestions(
          quiz.id
        );

      const gradedAttempts =
        attempts.filter(
          (
            attempt
          ) =>
            attempt.status ===
              "graded" &&
            attempt.finalScore !==
              null
        );

      if (
        gradedAttempts.length !==
          attempts.length ||
        gradedAttempts.length ===
          0
      ) {
        setMessage(
          t(
            "students.zip.notReady"
          )
        );

        return;
      }

      const zip =
        new JSZip();

      const pdfLanguage =
        getPdfLanguage(
          String(
            language
          )
        );

      const correctionFolder =
        zip.folder(
          "ULearn-corrections"
        );

      if (
        !correctionFolder
      ) {
        throw new Error(
          "Unable to create ZIP correction folder."
        );
      }

      for (
        let index = 0;
        index <
        gradedAttempts.length;
        index += 1
      ) {
        const attempt =
          gradedAttempts[
            index
          ];

        const pdfDocument =
          (
            <AttemptCorrectionPdf
              quiz={
                quiz
              }
              attempt={
                attempt
              }
              questions={
                questions
              }
              language={
                pdfLanguage
              }
            />
          );

        const correctionBlob =
          await pdf(
            pdfDocument
          ).toBlob();

        const studentName =
          sanitizeFileName(
            attempt.studentName
          );

        const position =
          String(
            index + 1
          ).padStart(
            2,
            "0"
          );

        correctionFolder.file(
          `${position}-${studentName}-correction.pdf`,
          correctionBlob
        );
      }

      const zipBlob =
        await zip.generateAsync({
          type:
            "blob",

          compression:
            "DEFLATE",

          compressionOptions: {
            level:
              6,
          },
        });

      const quizName =
        sanitizeFileName(
          quiz.title
        );

      downloadBlob(
        zipBlob,
        `ULearn-${quizName}-corrections.zip`
      );

      setSuccessMessage(
        t(
          "students.zip.success"
        )
      );
    } catch (error) {
      console.error(
        "Unable to generate corrected copies ZIP:",
        error
      );

      setMessage(
        t(
          "students.zip.error"
        )
      );
    } finally {
      setGeneratingZip(
        false
      );
    }
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
            Top bar
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
            Corrected copies export
            ================================================= */}

        <section
          className={
            styles.exportStatus
          }
        >
          <div
            className={
              styles.exportInfo
            }
          >
            <span>
              {t(
                "students.zip.statusLabel"
              )}
            </span>

            <strong>
              {
                stats.graded
              }
              {" / "}
              {
                stats.total
              }
            </strong>
          </div>

          <button
            type="button"
            className="app-button app-button-action"
            disabled={
              !canDownloadAllCorrections
            }
            onClick={
              handleDownloadAllCorrections
            }
            title={
              canDownloadAllCorrections
                ? t(
                    "students.zip.readyHint"
                  )
                : t(
                    "students.zip.disabledHint"
                  )
            }
          >
            ↓{" "}
            {t(
              "students.zip.button"
            )}
          </button>
        </section>

        {/* =================================================
            Messages
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

        {successMessage && (
          <p
            className={
              styles.successMessage
            }
            role="status"
          >
            {
              successMessage
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