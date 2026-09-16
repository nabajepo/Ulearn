"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { pdf } from "@react-pdf/renderer";
import JSZip from "jszip";

import AppLoading from "@/components/AppLoading";
import AttemptCorrectionPdf, {
  type PdfLanguage,
} from "@/components/AttemptCorrectionPdf";

import { db } from "@/lib/firebase";
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

import { useTeacher } from "@/hooks/useTeacher";
import { useLanguage } from "@/hooks/useLanguage";

import styles from "./StudentsPage.module.css";

type NavigationTarget = "" | "quiz" | "attempt";

type StatusFilter =
  | "all"
  | "in_progress"
  | "submitted"
  | "graded";

type TemporaryResetCode = {
  attemptId: string;
  code: string;
  expiresAt: string | null;
};

const EMPTY_STATS: QuizAttemptStats = {
  total: 0,
  inProgress: 0,
  submitted: 0,
  graded: 0,
  finished: 0,
  waitingForCorrection: 0,
};

function getStudentInitials(name: string) {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "U";

  if (words.length === 1) {
    return words[0].charAt(0).toUpperCase();
  }

  return (
    words[0].charAt(0) +
    words[words.length - 1].charAt(0)
  ).toUpperCase();
}

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function formatAttemptDate(
  value: string | null,
  language: string
) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  const locale =
    language === "fr"
      ? "fr-CA"
      : language === "rn"
        ? "rn-BI"
        : "en-CA";

  return date.toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function calculateStats(
  attempts: Attempt[]
): QuizAttemptStats {
  let inProgress = 0;
  let submitted = 0;
  let graded = 0;

  for (const attempt of attempts) {
    if (attempt.status === "in_progress") {
      inProgress += 1;
    } else if (attempt.status === "submitted") {
      submitted += 1;
    } else if (attempt.status === "graded") {
      graded += 1;
    }
  }

  return {
    total: attempts.length,
    inProgress,
    submitted,
    graded,
    finished: submitted + graded,
    waitingForCorrection: submitted,
  };
}

function getPdfLanguage(
  language: string
): PdfLanguage {
  if (language === "fr") return "fr";
  if (language === "rn") return "rn";

  return "en";
}

function sanitizeFileName(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9-_ ]/g, "")
      .trim()
      .replace(/\s+/g, "-") || "document"
  );
}

function downloadBlob(
  blob: Blob,
  fileName: string
) {
  const url = URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.style.display = "none";

  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(
    () => URL.revokeObjectURL(url),
    1000
  );
}

export default function StudentsPage() {
  const router = useRouter();
  const params = useParams();

  const { t, language } =
    useLanguage();

  const rawQuizId =
    params.quizId ?? "";

  const quizId = String(
    Array.isArray(rawQuizId)
      ? rawQuizId[0] ?? ""
      : rawQuizId
  ).trim();

  const {
    teacher,
    loading: teacherLoading,
  } = useTeacher();

  const [quiz, setQuiz] =
    useState<Quiz | null>(null);

  const [attempts, setAttempts] =
    useState<Attempt[]>([]);

  const [stats, setStats] =
    useState<QuizAttemptStats>(
      EMPTY_STATS
    );

  const [loading, setLoading] =
    useState(true);

  const [
    realtimeReady,
    setRealtimeReady,
  ] = useState(false);

  const [message, setMessage] =
    useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  const [
    navigationTarget,
    setNavigationTarget,
  ] = useState<NavigationTarget>("");

  const [filter, setFilter] =
    useState<StatusFilter>("all");

  const [search, setSearch] =
    useState("");

  const [
    generatingZip,
    setGeneratingZip,
  ] = useState(false);

  const [
    approvingResetAttemptId,
    setApprovingResetAttemptId,
  ] = useState("");

  const [
    temporaryResetCodes,
    setTemporaryResetCodes,
  ] = useState<
    Record<string, TemporaryResetCode>
  >({});

  /* =========================================================
     Load quiz
     ========================================================= */

  useEffect(() => {
    let cancelled = false;

    async function loadQuiz() {
      try {
        setLoading(true);
        setMessage("");

        if (!quizId) {
          setQuiz(null);
          return;
        }

        const quizData =
          await getQuiz(quizId);

        if (!cancelled) {
          setQuiz(quizData);
        }
      } catch (error) {
        console.error(
          "Unable to load quiz:",
          error
        );

        if (!cancelled) {
          setMessage(
            t("students.messages.loadError")
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadQuiz();

    return () => {
      cancelled = true;
    };
  }, [quizId, t]);

  /* =========================================================
     Realtime attempts
     ========================================================= */

  useEffect(() => {
    if (!quizId) {
      setAttempts([]);
      setStats(EMPTY_STATS);
      setRealtimeReady(true);
      return;
    }

    setRealtimeReady(false);

    const attemptsQuery =
      query(
        collection(db, "attempts"),
        where("quizId", "==", quizId)
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

            const sortedAttempts = [
              ...realtimeAttempts,
            ].sort(
              (first, second) =>
                new Date(
                  second.startedAt
                ).getTime() -
                new Date(
                  first.startedAt
                ).getTime()
            );

            setAttempts(
              sortedAttempts
            );

            setStats(
              calculateStats(
                sortedAttempts
              )
            );

            setMessage("");
            setRealtimeReady(true);

            /*
             * Keep a plaintext temporary code only while
             * its reset request is still approved.
             *
             * Once the student successfully resets the PIN,
             * reset-pin/route.ts changes the attempt back to:
             *
             * pinResetRequested = false
             * pinResetStatus = null
             *
             * The code then disappears automatically.
             */
            setTemporaryResetCodes(
              (current) => {
                const next = {
                  ...current,
                };

                for (
                  const attemptId of
                  Object.keys(next)
                ) {
                  const currentAttempt =
                    sortedAttempts.find(
                      (item) =>
                        item.id ===
                        attemptId
                    );

                  if (!currentAttempt) {
                    delete next[
                      attemptId
                    ];
                    continue;
                  }

                  if (
                    currentAttempt.status !==
                    "in_progress"
                  ) {
                    delete next[
                      attemptId
                    ];
                    continue;
                  }

                  if (
                    currentAttempt.pinResetRequested !==
                    true
                  ) {
                    delete next[
                      attemptId
                    ];
                    continue;
                  }

                  if (
                    currentAttempt.pinResetStatus !==
                    "approved"
                  ) {
                    delete next[
                      attemptId
                    ];
                  }
                }

                return next;
              }
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

            setRealtimeReady(true);
          }
        },

        (error) => {
          console.error(
            "Realtime quiz attempts listener failed:",
            error
          );

          setMessage(
            t(
              "students.messages.loadError"
            )
          );

          setRealtimeReady(true);
        }
      );

    return () =>
      unsubscribe();
  }, [quizId, t]);

  /* =========================================================
     Pending reset count
     ========================================================= */

  const pendingResetCount =
    useMemo(
      () =>
        attempts.filter(
          (attempt) =>
            attempt.status ===
              "in_progress" &&
            attempt.pinResetRequested ===
              true &&
            attempt.pinResetStatus ===
              "pending"
        ).length,
      [attempts]
    );

  /* =========================================================
     Filtering
     ========================================================= */

  const filteredAttempts =
    useMemo(() => {
      const normalizedSearch =
        normalizeSearchValue(
          search
        );

      return attempts.filter(
        (attempt) => {
          if (
            filter !== "all" &&
            attempt.status !==
              filter
          ) {
            return false;
          }

          if (!normalizedSearch) {
            return true;
          }

          return (
            normalizeSearchValue(
              attempt.studentName
            ).includes(
              normalizedSearch
            ) ||
            normalizeSearchValue(
              attempt.studentEmail
            ).includes(
              normalizedSearch
            )
          );
        }
      );
    }, [
      attempts,
      filter,
      search,
    ]);

  const canDownloadAllCorrections =
    stats.total > 0 &&
    stats.graded === stats.total;

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

  if (generatingZip) {
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

  if (navigationTarget) {
    return (
      <AppLoading
        title="ULearn"
        subtitle={
          navigationTarget ===
          "attempt"
            ? t(
                "students.loading.openingStudent"
              )
            : t(
                "students.loading.returning"
              )
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
    quiz.teacherId !== teacher.id
  ) {
    return (
      <main
        className={styles.page}
      >
        <section
          className={styles.card}
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
    attempt: Attempt
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
     Approve PIN reset
     ========================================================= */

  async function handleApprovePinReset(
    attempt: Attempt
  ) {
    if (
      approvingResetAttemptId ||
      attempt.status !==
        "in_progress"
    ) {
      return;
    }

    setMessage("");
    setSuccessMessage("");

    setApprovingResetAttemptId(
      attempt.id
    );

    try {
      const response =
        await fetch(
          "/api/student-attempt/approve-pin-reset",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            cache: "no-store",

            body: JSON.stringify({
              attemptId:
                attempt.id,
            }),
          }
        );

      const data =
        (await response.json()) as {
          success?: boolean;
          resetCode?: string;
          expiresAt?:
            | string
            | null;
          message?: string;
          messageKey?: string;
        };

      if (
        !response.ok ||
        data.success !== true ||
        typeof data.resetCode !==
          "string"
      ) {
        throw new Error(
          data.message ||
            "Unable to approve the PIN reset request."
        );
      }

      /*
       * Store the plaintext code immediately.
       *
       * Firestore only stores its hash.
       */
      setTemporaryResetCodes(
        (current) => ({
          ...current,

          [attempt.id]: {
            attemptId:
              attempt.id,

            code:
              data.resetCode!,

            expiresAt:
              typeof data.expiresAt ===
              "string"
                ? data.expiresAt
                : null,
          },
        })
      );

      setSuccessMessage(
        t(
          "students.pinReset.approved"
        )
      );
    } catch (error) {
      console.error(
        "Unable to approve PIN reset:",
        error
      );

      setMessage(
        error instanceof Error
          ? error.message
          : t(
              "students.pinReset.approveError"
            )
      );
    } finally {
      setApprovingResetAttemptId(
        ""
      );
    }
  }

  /* =========================================================
     ZIP
     ========================================================= */

  async function handleDownloadAllCorrections() {
    if (
      generatingZip ||
      !canDownloadAllCorrections
    ) {
      return;
    }

    setMessage("");
    setSuccessMessage("");
    setGeneratingZip(true);

    try {
      const questions =
        await getQuizQuestions(
          quiz.id
        );

      const gradedAttempts =
        attempts.filter(
          (attempt) =>
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
          String(language)
        );

      const correctionFolder =
        zip.folder(
          "ULearn-corrections"
        );

      if (!correctionFolder) {
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
          gradedAttempts[index];

        const correctionBlob =
          await pdf(
            <AttemptCorrectionPdf
              quiz={quiz}
              attempt={attempt}
              questions={
                questions
              }
              language={
                pdfLanguage
              }
            />
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
        await zip.generateAsync(
          {
            type: "blob",
            compression:
              "DEFLATE",
            compressionOptions:
              {
                level: 6,
              },
          }
        );

      downloadBlob(
        zipBlob,
        `ULearn-${sanitizeFileName(
          quiz.title
        )}-corrections.zip`
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
      setGeneratingZip(false);
    }
  }

  /* =========================================================
     Labels
     ========================================================= */

  function getAttemptStatusLabel(
    attempt: Attempt
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
    attempt: Attempt
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
     Render
     ========================================================= */

  return (
    <main
      className={styles.page}
    >
      <section
        className={styles.card}
      >
        <div
          className={
            styles.topBar
          }
        >
          <button
            type="button"
            className="app-button app-button-secondary"
            onClick={handleBack}
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
            {stats.total} /{" "}
            {quiz.maxStudents}{" "}
            {t(
              "students.students"
            )}
          </span>
        </div>

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
              {stats.total} /{" "}
              {quiz.maxStudents}
            </strong>
          </article>

          <article>
            <span>
              {t(
                "students.stats.inProgress"
              )}
            </span>

            <strong>
              {stats.inProgress}
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
              {stats.graded}
            </strong>
          </article>

          <article>
            <span>
              {t(
                "students.stats.finished"
              )}
            </span>

            <strong>
              {stats.finished}
            </strong>
          </article>
        </section>

        {pendingResetCount >
          0 && (
          <section
            className={
              styles.pinResetSummary
            }
            role="status"
          >
            <div>
              <strong>
                {t(
                  "students.pinReset.summaryTitle"
                )}
              </strong>

              <span>
                {t(
                  "students.pinReset.summaryText"
                )}
              </span>
            </div>

            <span
              className={
                styles.pinResetCount
              }
            >
              {
                pendingResetCount
              }
            </span>
          </section>
        )}

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
              {stats.graded} /{" "}
              {stats.total}
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

        {message && (
          <p
            className={
              styles.message
            }
            role="alert"
          >
            {message}
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
                  }{" "}
                  {t(
                    "students.list.results"
                  )}
                </span>
              </div>

              <div
                className={
                  styles.searchArea
                }
              >
                <div
                  className={
                    styles.searchBox
                  }
                >
                  <span
                    className={
                      styles.searchIcon
                    }
                    aria-hidden="true"
                  >
                    ⌕
                  </span>

                  <input
                    type="search"
                    value={search}
                    onChange={(
                      event
                    ) =>
                      setSearch(
                        event
                          .target
                          .value
                      )
                    }
                    placeholder={t(
                      "students.search.placeholder"
                    )}
                    aria-label={t(
                      "students.search.label"
                    )}
                    autoComplete="off"
                  />

                  {search && (
                    <button
                      type="button"
                      className={
                        styles.clearSearch
                      }
                      onClick={() =>
                        setSearch(
                          ""
                        )
                      }
                      aria-label={t(
                        "students.search.clear"
                      )}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              <div
                className={
                  styles.filters
                }
              >
                {(
                  [
                    [
                      "all",
                      "students.filters.all",
                      stats.total,
                    ],

                    [
                      "in_progress",
                      "students.filters.inProgress",
                      stats.inProgress,
                    ],

                    [
                      "submitted",
                      "students.filters.waitingCorrection",
                      stats.waitingForCorrection,
                    ],

                    [
                      "graded",
                      "students.filters.graded",
                      stats.graded,
                    ],
                  ] as const
                ).map(
                  ([
                    value,
                    labelKey,
                    count,
                  ]) => (
                    <button
                      key={value}
                      type="button"
                      className={
                        filter ===
                        value
                          ? styles.filterActive
                          : ""
                      }
                      onClick={() =>
                        setFilter(
                          value
                        )
                      }
                    >
                      {t(
                        labelKey
                      )}

                      <span>
                        {count}
                      </span>
                    </button>
                  )
                )}
              </div>
            </section>

            {filteredAttempts.length ===
            0 ? (
              <section
                className={
                  styles.noFilterResults
                }
              >
                <strong>
                  {search
                    ? t(
                        "students.search.emptyTitle"
                      )
                    : t(
                        "students.filters.emptyTitle"
                      )}
                </strong>

                <p>
                  {search
                    ? t(
                        "students.search.emptyText"
                      )
                    : t(
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
                  (attempt) => {
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

                    const hasPendingPinReset =
                      attempt.status ===
                        "in_progress" &&
                      attempt.pinResetRequested ===
                        true &&
                      attempt.pinResetStatus ===
                        "pending";

                    const hasApprovedPinReset =
                      attempt.status ===
                        "in_progress" &&
                      attempt.pinResetRequested ===
                        true &&
                      attempt.pinResetStatus ===
                        "approved";

                    const isApproving =
                      approvingResetAttemptId ===
                      attempt.id;

                    const visibleTemporaryCode =
                      temporaryResetCodes[
                        attempt.id
                      ] ?? null;

                    return (
                      <article
                        key={
                          attempt.id
                        }
                        className={`${styles.studentRow} ${
                          hasPendingPinReset
                            ? styles.studentRowResetPending
                            : ""
                        }`}
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
                            {getStudentInitials(
                              attempt.studentName
                            )}
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

                            {hasPendingPinReset && (
                              <span
                                className={
                                  styles.pinResetInlineBadge
                                }
                              >
                                {t(
                                  "students.pinReset.requested"
                                )}
                              </span>
                            )}

                            {hasApprovedPinReset && (
                              <span
                                className={
                                  styles.pinResetApprovedBadge
                                }
                              >
                                {t(
                                  "students.pinReset.approvedBadge"
                                )}
                              </span>
                            )}
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
                            }{" "}
                            /{" "}
                            {
                              attempt
                                .questionOrder
                                .length
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

                          {hasPendingPinReset ? (
                            <button
                              type="button"
                              className={`${styles.pinResetButton} app-button app-button-action`}
                              disabled={Boolean(
                                approvingResetAttemptId
                              )}
                              onClick={() =>
                                void handleApprovePinReset(
                                  attempt
                                )
                              }
                            >
                              {isApproving
                                ? t(
                                    "students.pinReset.generating"
                                  )
                                : t(
                                    "students.pinReset.generateCode"
                                  )}
                            </button>
                          ) : (
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
                          )}

                          {visibleTemporaryCode && (
                            <div
                              className={
                                styles.temporaryCodeBox
                              }
                            >
                              <span>
                                {t(
                                  "students.pinReset.temporaryCode"
                                )}
                              </span>

                              <strong>
                                {
                                  visibleTemporaryCode.code
                                }
                              </strong>

                              <small>
                                {t(
                                  "students.pinReset.giveCode"
                                )}
                              </small>

                              {visibleTemporaryCode.expiresAt && (
                                <small>
                                  {t(
                                    "students.pinReset.expires"
                                  )}{" "}
                                  {formatAttemptDate(
                                    visibleTemporaryCode.expiresAt,
                                    language
                                  )}
                                </small>
                              )}
                            </div>
                          )}
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