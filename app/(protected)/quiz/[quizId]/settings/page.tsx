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
import { useTeacher } from "@/hooks/useTeacher";
import { useLanguage } from "@/hooks/useLanguage";

import {
  getQuiz,
  updateQuiz,
  type Quiz,
  type QuizAvailabilityMode,
} from "@/lib/services/quizzes";

import {
  formatInTimeZone,
  zonedDateTimeToUtc,
  type Meridiem,
} from "@/lib/dateTime";

import { LIMITS } from "@/lib/services/limits";

import {
  buildDurationOptions,
  formatQuizDuration,
} from "@/lib/quizDuration";

import styles from "../../QuizSettingsForm.module.css";

/* =========================================================
   Types
   ========================================================= */

type TimeSelection = {
  date: string;
  hour: number;
  minute: number;
  period: Meridiem;
};

/* =========================================================
   Constants
   ========================================================= */

const HOURS = Array.from(
  { length: 12 },
  (_, index) => index + 1
);

const MINUTES = [0, 15, 30, 45];

const CUSTOM_DURATION_VALUE = "custom";

const MAX_QUESTIONS = 50;

const TIME_ZONES = [
  {
    value: "America/Toronto",
    key: "toronto",
  },
  {
    value: "America/Winnipeg",
    key: "winnipeg",
  },
  {
    value: "America/Edmonton",
    key: "edmonton",
  },
  {
    value: "America/Vancouver",
    key: "vancouver",
  },
  {
    value: "America/Halifax",
    key: "halifax",
  },
  {
    value: "America/St_Johns",
    key: "stJohns",
  },
  {
    value: "Europe/Paris",
    key: "paris",
  },
  {
    value: "Africa/Bujumbura",
    key: "bujumbura",
  },
] as const;

const EMPTY_START: TimeSelection = {
  date: "",
  hour: 9,
  minute: 0,
  period: "AM",
};

const EMPTY_END: TimeSelection = {
  date: "",
  hour: 5,
  minute: 0,
  period: "PM",
};

/* =========================================================
   Date helpers
   ========================================================= */

function createUtcDateTime(
  selection: TimeSelection,
  timeZone: string
): string | null {
  if (!selection.date || !timeZone) {
    return null;
  }

  return zonedDateTimeToUtc({
    date: selection.date,
    hour: selection.hour,
    minute: selection.minute,
    period: selection.period,
    timeZone,
  });
}

function calculateMinutes(
  start: number,
  end: number
): number {
  if (
    Number.isNaN(start) ||
    Number.isNaN(end) ||
    end <= start
  ) {
    return 0;
  }

  return Math.floor(
    (end - start) / (1000 * 60)
  );
}

function getDateInputValue(
  value: Date | string,
  timeZone: string
): string {
  const date =
    typeof value === "string"
      ? new Date(value)
      : value;

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const formatter =
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

  const parts =
    formatter.formatToParts(date);

  const year =
    parts.find(
      (part) => part.type === "year"
    )?.value ?? "";

  const month =
    parts.find(
      (part) => part.type === "month"
    )?.value ?? "";

  const day =
    parts.find(
      (part) => part.type === "day"
    )?.value ?? "";

  return `${year}-${month}-${day}`;
}

function utcToTimeSelection(
  value: string | null,
  timeZone: string,
  fallback: TimeSelection
): TimeSelection {
  if (!value) {
    return {
      ...fallback,
    };
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      ...fallback,
    };
  }

  const formatter =
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

  const parts =
    formatter.formatToParts(date);

  const year =
    parts.find(
      (part) => part.type === "year"
    )?.value ?? "";

  const month =
    parts.find(
      (part) => part.type === "month"
    )?.value ?? "";

  const day =
    parts.find(
      (part) => part.type === "day"
    )?.value ?? "";

  const hourValue =
    parts.find(
      (part) => part.type === "hour"
    )?.value ?? "12";

  const minuteValue =
    parts.find(
      (part) => part.type === "minute"
    )?.value ?? "00";

  const dayPeriod =
    parts.find(
      (part) => part.type === "dayPeriod"
    )?.value.toUpperCase();

  return {
    date: `${year}-${month}-${day}`,
    hour: Number(hourValue) || 12,
    minute: Number(minuteValue) || 0,
    period:
      dayPeriod === "PM"
        ? "PM"
        : "AM",
  };
}

/* =========================================================
   Page
   ========================================================= */

export default function QuizSettingsPage() {
  const router = useRouter();
  const params = useParams();

  const {
    t,
    language,
  } = useLanguage();

  const quizId =
    String(params.quizId);

  const {
    teacher,
    loading: teacherLoading,
    blocked,
    message: teacherMessage,
  } = useTeacher();

  const [quiz, setQuiz] =
    useState<Quiz | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [
    navigatingBack,
    setNavigatingBack,
  ] = useState(false);

  const [message, setMessage] =
    useState("");

  /* =========================================================
     General information
     ========================================================= */

  const [title, setTitle] =
    useState("");

  const [description, setDescription] =
    useState("");

  const [
    targetQuestions,
    setTargetQuestions,
  ] = useState(10);

  const [
    totalPoints,
    setTotalPoints,
  ] = useState(10);

  /* =========================================================
     Availability
     ========================================================= */

  const [
    availabilityMode,
    setAvailabilityMode,
  ] =
    useState<QuizAvailabilityMode>(
      "open_window"
    );

  const [timeZone, setTimeZone] =
    useState("America/Toronto");

  const [startTime, setStartTime] =
    useState<TimeSelection>(
      EMPTY_START
    );

  const [endTime, setEndTime] =
    useState<TimeSelection>(
      EMPTY_END
    );

  /* =========================================================
     Duration
     ========================================================= */

  const [
    timeLimitMinutes,
    setTimeLimitMinutes,
  ] = useState(60);

  const [
    durationSelection,
    setDurationSelection,
  ] = useState("60");

  const [
    customHours,
    setCustomHours,
  ] = useState(1);

  const [
    customMinutes,
    setCustomMinutes,
  ] = useState(0);

  /* =========================================================
     Student options
     ========================================================= */

  const [
    allowBackNavigation,
    setAllowBackNavigation,
  ] = useState(true);

  const [
    shuffleQuestions,
    setShuffleQuestions,
  ] = useState(false);

  const [
    shuffleChoices,
    setShuffleChoices,
  ] = useState(false);

  const [
    showResultsToStudents,
    setShowResultsToStudents,
  ] = useState(true);

  const [
    showCorrectAnswers,
    setShowCorrectAnswers,
  ] = useState(false);

  /* =========================================================
     Load quiz
     ========================================================= */

  useEffect(() => {
    let cancelled = false;

    async function loadQuiz() {
      try {
        const data =
          await getQuiz(quizId);

        if (
          cancelled ||
          !data
        ) {
          return;
        }

        setQuiz(data);

        const quizTimeZone =
          data.timeZone ||
          "America/Toronto";

        setTitle(
          data.title
        );

        setDescription(
          data.description
        );

        setTargetQuestions(
          data.targetQuestions
        );

        setTotalPoints(
          data.totalPoints
        );

        setAvailabilityMode(
          data.availabilityMode
        );

        setTimeZone(
          quizTimeZone
        );

        setStartTime(
          utcToTimeSelection(
            data.availableFrom,
            quizTimeZone,
            EMPTY_START
          )
        );

        setEndTime(
          utcToTimeSelection(
            data.availableUntil,
            quizTimeZone,
            EMPTY_END
          )
        );

        setTimeLimitMinutes(
          data.timeLimitMinutes
        );

        if (
          data.timeLimitMinutes %
            15 ===
          0
        ) {
          setDurationSelection(
            String(
              data.timeLimitMinutes
            )
          );
        } else {
          setDurationSelection(
            CUSTOM_DURATION_VALUE
          );
        }

        setCustomHours(
          Math.floor(
            data.timeLimitMinutes /
              60
          )
        );

        setCustomMinutes(
          data.timeLimitMinutes %
            60
        );

        setAllowBackNavigation(
          data.allowBackNavigation
        );

        setShuffleQuestions(
          data.shuffleQuestions
        );

        setShuffleChoices(
          data.shuffleChoices
        );

        setShowResultsToStudents(
          data.showResultsToStudents
        );

        setShowCorrectAnswers(
          data.showCorrectAnswers
        );
      } catch (error) {
        console.error(
          "Error loading quiz settings:",
          error
        );

        if (!cancelled) {
          setMessage(
            t("quizSettings.messages.loadError")
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadQuiz();

    return () => {
      cancelled = true;
    };
  }, [
    quizId,
    t,
  ]);

  /* =========================================================
     Time zones
     ========================================================= */

  const availableTimeZones =
    useMemo(() => {
      const translatedZones =
        TIME_ZONES.map(
          (zone) => ({
            value:
              zone.value,

            label:
              t(
                `quizCreate.timeZones.${zone.key}`
              ),
          })
        );

      const exists =
        TIME_ZONES.some(
          (zone) =>
            zone.value ===
            timeZone
        );

      if (exists) {
        return translatedZones;
      }

      return [
        {
          value:
            timeZone,

          label:
            `${t(
              "quizCreate.timeZones.current"
            )} — ${timeZone}`,
        },

        ...translatedZones,
      ];
    }, [
      timeZone,
      t,
    ]);

  /* =========================================================
     Account dates
     ========================================================= */

  const todayDateInput =
    useMemo(
      () =>
        getDateInputValue(
          new Date(),
          timeZone
        ),
      [timeZone]
    );

  const accountExpirationDateInput =
    useMemo(() => {
      if (
        !teacher?.expiresAt
      ) {
        return "";
      }

      return getDateInputValue(
        teacher.expiresAt,
        timeZone
      );
    }, [
      teacher?.expiresAt,
      timeZone,
    ]);

  const accountExpirationMs =
    useMemo(() => {
      if (
        !teacher?.expiresAt
      ) {
        return 0;
      }

      const value =
        new Date(
          teacher.expiresAt
        ).getTime();

      return Number.isNaN(
        value
      )
        ? 0
        : value;
    }, [
      teacher?.expiresAt,
    ]);

  /* =========================================================
     Selected dates
     ========================================================= */

  const startUtc =
    useMemo(
      () =>
        createUtcDateTime(
          startTime,
          timeZone
        ),
      [
        startTime,
        timeZone,
      ]
    );

  const endUtc =
    useMemo(
      () =>
        createUtcDateTime(
          endTime,
          timeZone
        ),
      [
        endTime,
        timeZone,
      ]
    );

  const availableWindowMinutes =
    useMemo(() => {
      if (!endUtc) {
        return null;
      }

      const startMs =
        startUtc
          ? new Date(
              startUtc
            ).getTime()
          : Date.now();

      const endMs =
        new Date(
          endUtc
        ).getTime();

      return calculateMinutes(
        startMs,
        endMs
      );
    }, [
      startUtc,
      endUtc,
    ]);

  const scheduledSessionDuration =
    availabilityMode ===
    "scheduled_session"
      ? availableWindowMinutes
      : null;

  /* =========================================================
     Maximum open-window duration
     ========================================================= */

  const maximumStudentTime =
    useMemo(() => {
      if (
        !accountExpirationMs
      ) {
        return 1;
      }

      const remaining =
        calculateMinutes(
          Date.now(),
          accountExpirationMs
        );

      let maximum =
        Math.min(
          remaining,
          LIMITS
            .MAX_QUIZ_DURATION_MINUTES
        );

      if (
        availableWindowMinutes !==
          null &&
        availableWindowMinutes >
          0
      ) {
        maximum =
          Math.min(
            maximum,
            availableWindowMinutes
          );
      }

      return Math.max(
        1,
        maximum
      );
    }, [
      accountExpirationMs,
      availableWindowMinutes,
    ]);

  const durationOptions =
    useMemo(
      () =>
        buildDurationOptions(
          maximumStudentTime
        ),
      [
        maximumStudentTime,
      ]
    );

  useEffect(() => {
    if (
      availabilityMode !==
      "open_window"
    ) {
      return;
    }

    if (
      timeLimitMinutes <=
      maximumStudentTime
    ) {
      return;
    }

    setTimeLimitMinutes(
      maximumStudentTime
    );

    if (
      maximumStudentTime %
        15 ===
      0
    ) {
      setDurationSelection(
        String(
          maximumStudentTime
        )
      );
    } else {
      setDurationSelection(
        CUSTOM_DURATION_VALUE
      );
    }

    setCustomHours(
      Math.floor(
        maximumStudentTime /
          60
      )
    );

    setCustomMinutes(
      maximumStudentTime %
        60
    );
  }, [
    availabilityMode,
    maximumStudentTime,
    timeLimitMinutes,
  ]);

  /* =========================================================
     Time updates
     ========================================================= */

  function updateStartTime<
    K extends keyof TimeSelection
  >(
    field: K,
    value: TimeSelection[K]
  ) {
    setStartTime(
      (current) => ({
        ...current,
        [field]: value,
      })
    );

    setMessage("");
  }

  function updateEndTime<
    K extends keyof TimeSelection
  >(
    field: K,
    value: TimeSelection[K]
  ) {
    setEndTime(
      (current) => ({
        ...current,
        [field]: value,
      })
    );

    setMessage("");
  }

  /* =========================================================
     Duration updates
     ========================================================= */

  function handleDurationSelection(
    value: string
  ) {
    setDurationSelection(
      value
    );

    setMessage("");

    if (
      value ===
      CUSTOM_DURATION_VALUE
    ) {
      setCustomHours(
        Math.floor(
          timeLimitMinutes /
            60
        )
      );

      setCustomMinutes(
        timeLimitMinutes %
          60
      );

      return;
    }

    const newDuration =
      Number(value);

    if (
      Number.isFinite(
        newDuration
      )
    ) {
      setTimeLimitMinutes(
        newDuration
      );
    }
  }

  function updateCustomDuration(
    hours: number,
    minutes: number
  ) {
    const safeHours =
      Math.max(
        0,
        Math.min(
          72,
          Math.floor(
            Number.isFinite(
              hours
            )
              ? hours
              : 0
          )
        )
      );

    const safeMinutes =
      Math.max(
        0,
        Math.min(
          59,
          Math.floor(
            Number.isFinite(
              minutes
            )
              ? minutes
              : 0
          )
        )
      );

    setCustomHours(
      safeHours
    );

    setCustomMinutes(
      safeMinutes
    );

    setTimeLimitMinutes(
      safeHours * 60 +
        safeMinutes
    );

    setMessage("");
  }

  /* =========================================================
     Navigation
     ========================================================= */

  function handleBack() {
    if (
      saving ||
      navigatingBack
    ) {
      return;
    }

    setNavigatingBack(
      true
    );

    router.push(
      `/quiz/${quizId}`
    );
  }

  /* =========================================================
     Submit
     ========================================================= */

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      !teacher ||
      !quiz ||
      saving
    ) {
      return;
    }

    setMessage("");

    const now =
      Date.now();

    const expiration =
      new Date(
        teacher.expiresAt
      ).getTime();

    const startMs =
      startUtc
        ? new Date(
            startUtc
          ).getTime()
        : null;

    const endMs =
      endUtc
        ? new Date(
            endUtc
          ).getTime()
        : null;

    const cleanTitle =
      title.trim();

    const cleanDescription =
      description.trim();

    /* =====================================================
       General validation
       ===================================================== */

    if (
      quiz.status !==
      "draft"
    ) {
      setMessage(
        t("quizSettings.validation.draftOnly")
      );

      return;
    }

    if (!cleanTitle) {
      setMessage(
        t("quizCreate.validation.titleRequired")
      );

      return;
    }

    if (
      !Number.isInteger(
        targetQuestions
      ) ||
      targetQuestions < 1 ||
      targetQuestions >
        MAX_QUESTIONS
    ) {
      setMessage(
        `${t("quizCreate.validation.questionRange")} ${MAX_QUESTIONS}.`
      );

      return;
    }

    if (
      targetQuestions <
      quiz.totalQuestions
    ) {
      setMessage(
        `${t("quizSettings.validation.existingQuestionsBefore")} ${quiz.totalQuestions}. ${t("quizSettings.validation.existingQuestionsAfter")} ${quiz.totalQuestions}.`
      );

      return;
    }

    if (
      !Number.isInteger(
        totalPoints
      ) ||
      totalPoints < 10
    ) {
      setMessage(
        t("quizCreate.validation.minimumPoints")
      );

      return;
    }

    if (
      !timeZone.trim()
    ) {
      setMessage(
        t("quizSettings.validation.timeZoneRequired")
      );

      return;
    }

    /* =====================================================
       Account validation
       ===================================================== */

    if (
      Number.isNaN(
        expiration
      ) ||
      expiration <= now
    ) {
      setMessage(
        t("quizCreate.validation.accountExpired")
      );

      return;
    }

    /* =====================================================
       Date validation
       ===================================================== */

    if (
      startMs !== null &&
      startMs < now
    ) {
      setMessage(
        t("quizSettings.validation.startPast")
      );

      return;
    }

    if (
      startMs !== null &&
      startMs >
        expiration
    ) {
      setMessage(
        t("quizCreate.validation.startAfterExpiration")
      );

      return;
    }

    if (
      endMs === null
    ) {
      setMessage(
        availabilityMode ===
        "scheduled_session"
          ? t("quizCreate.validation.sessionEndRequired")
          : t("quizCreate.validation.deadlineRequired")
      );

      return;
    }

    if (
      endMs <= now
    ) {
      setMessage(
        t("quizCreate.validation.deadlinePast")
      );

      return;
    }

    if (
      endMs >
      expiration
    ) {
      setMessage(
        t("quizCreate.validation.deadlineAfterExpiration")
      );

      return;
    }

    if (
      startMs !== null &&
      endMs <= startMs
    ) {
      setMessage(
        availabilityMode ===
        "scheduled_session"
          ? t("quizCreate.validation.sessionEndAfterStart")
          : t("quizCreate.validation.deadlineAfterStart")
      );

      return;
    }

    if (
      availabilityMode ===
        "scheduled_session" &&
      startMs === null
    ) {
      setMessage(
        t("quizCreate.validation.sessionStartRequired")
      );

      return;
    }

    /* =====================================================
       Duration validation
       ===================================================== */

    const finalDuration =
      availabilityMode ===
      "scheduled_session"
        ? scheduledSessionDuration
        : timeLimitMinutes;

    if (
      finalDuration ===
        null ||
      !Number.isFinite(
        finalDuration
      ) ||
      finalDuration < 1
    ) {
      setMessage(
        t("quizCreate.validation.minimumDuration")
      );

      return;
    }

    if (
      finalDuration >
      LIMITS
        .MAX_QUIZ_DURATION_MINUTES
    ) {
      setMessage(
        `${t("quizCreate.validation.maximumDuration")} ${LIMITS.ACCOUNT_DURATION_DAYS} ${t("quizCreate.units.days")}.`
      );

      return;
    }

    if (
      availabilityMode ===
        "open_window" &&
      finalDuration >
        maximumStudentTime
    ) {
      setMessage(
        `${t(
          "quizCreate.validation.durationWindow"
        )} ${formatQuizDuration(
          maximumStudentTime,
          language
        )}.`
      );

      return;
    }

    /* =====================================================
       Save
       ===================================================== */

    setSaving(true);

    try {
      const result =
        await updateQuiz(
          quizId,
          {
            title:
              cleanTitle,

            description:
              cleanDescription,

            targetQuestions,

            totalPoints,

            timeZone,

            availabilityMode,

            availableFrom:
              startUtc,

            availableUntil:
              endUtc,

            timeLimitMinutes:
              finalDuration,

            allowBackNavigation,

            shuffleQuestions,

            shuffleChoices,

            showResultsToStudents,

            showCorrectAnswers:
              showResultsToStudents
                ? showCorrectAnswers
                : false,
          }
        );

      if (
        !result.success
      ) {
        setMessage(
          t(
            "quizSettings.messages.saveError"
          )
        );

        setSaving(
          false
        );

        return;
      }

      router.push(
        `/quiz/${quizId}`
      );
    } catch (error) {
      console.error(
        "Error updating quiz:",
        error
      );

      setMessage(
        t("quizSettings.messages.saveError")
      );

      setSaving(false);
    }
  }

  /* =========================================================
     Loading states
     ========================================================= */

  if (
    teacherLoading ||
    loading
  ) {
    return (
      <AppLoading
        title={t("quizSettings.loading.title")}
        subtitle={t("quizSettings.loading.subtitle")}
      />
    );
  }

  if (saving) {
    return (
      <AppLoading
        title={t("quizSettings.loading.savingTitle")}
        subtitle={t("quizSettings.loading.savingSubtitle")}
      />
    );
  }

  if (
    navigatingBack
  ) {
    return (
      <AppLoading
        title="ULearn"
        subtitle={t("quizSettings.loading.returning")}
      />
    );
  }

  if (
    blocked ||
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
              "quizSettings.access.title"
            )}
          </h1>

          <p>
            {teacherMessage ||
              t(
                "quizSettings.access.text"
              )}
          </p>
        </section>
      </main>
    );
  }

  if (
    quiz.status !==
    "draft"
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
          <button
            type="button"
            className="app-button app-button-secondary"
            onClick={() =>
              router.push(
                `/quiz/${quizId}`
              )
            }
          >
            ←{" "}
            {t(
              "quizSettings.backQuiz"
            )}
          </button>

          <div
            className={
              styles.heading
            }
          >
            <h1>
              {t(
                "quizSettings.locked.title"
              )}
            </h1>

            <p>
              {t(
                "quizSettings.locked.text"
              )}
            </p>
          </div>
        </section>
      </main>
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
            "quizSettings.backQuiz"
          )}
        </button>

        <header
          className={
            styles.heading
          }
        >
          <span
            className={
              styles.badge
            }
          >
            {t(
              "quizSettings.badge"
            )}
          </span>

          <h1>
            {t(
              "quizSettings.title"
            )}
          </h1>

          <p>
            {t(
              "quizSettings.subtitle"
            )}
          </p>

          <div
            className={
              styles.accountLimit
            }
          >
            <span>
              {t(
                "quizCreate.accountValidUntil"
              )}
            </span>

            <strong>
              {formatInTimeZone(
                teacher.expiresAt,
                timeZone
              )}
            </strong>
          </div>
        </header>

        <form
          className={
            styles.form
          }
          onSubmit={
            handleSubmit
          }
        >
          {/* =================================================
              COLUMN 1
              ================================================= */}

          <section
            className={`${styles.column} ${styles.generalColumn}`}
          >
            <div
              className={
                styles.columnHeader
              }
            >
              <span>01</span>

              <div>
                <h2>
                  {t("quizCreate.general.title")}
                </h2>

                <p>
                  {t("quizSettings.generalSubtitle")}
                </p>
              </div>
            </div>

            <label>
              {t("quizCreate.general.quizTitle")}

              <input
                type="text"
                required
                maxLength={120}
                value={title}
                onChange={(
                  event
                ) => {
                  setTitle(
                    event.target.value
                  );

                  setMessage("");
                }}
              />

              <small
                className={
                  styles.helperText
                }
              >
                {title.length} / 120 {t("quizCreate.units.characters")}
              </small>
            </label>

            <label>
              {t("quizCreate.general.description")}

              <textarea
                maxLength={1000}
                value={
                  description
                }
                onChange={(
                  event
                ) => {
                  setDescription(
                    event.target.value
                  );

                  setMessage("");
                }}
              />

              <small
                className={
                  styles.helperText
                }
              >
                {description.length} / 1000 {t("quizCreate.units.characters")}
              </small>
            </label>

            <div
              className={
                styles.structureGrid
              }
            >
              <label>
                {t("quizCreate.general.numberQuestions")}

                <input
                  type="number"
                  min={Math.max(
                    1,
                    quiz.totalQuestions
                  )}
                  max={
                    MAX_QUESTIONS
                  }
                  step={1}
                  required
                  value={
                    targetQuestions
                  }
                  onChange={(
                    event
                  ) => {
                    setTargetQuestions(
                      Number(
                        event.target.value
                      )
                    );

                    setMessage("");
                  }}
                />

                <small
                  className={
                    styles.helperText
                  }
                >
                  {quiz.totalQuestions > 0
                    ? `${t(
                        "quizSettings.currentQuestions"
                      )} ${quiz.totalQuestions}.`
                    : `${t(
                        "quizCreate.general.maximumQuestions"
                      )} ${MAX_QUESTIONS}.`}
                </small>
              </label>

              <label>
                {t("quizCreate.general.totalPoints")}

                <input
                  type="number"
                  min={10}
                  step={1}
                  required
                  value={
                    totalPoints
                  }
                  onChange={(
                    event
                  ) => {
                    setTotalPoints(
                      Number(
                        event.target.value
                      )
                    );

                    setMessage("");
                  }}
                />

                <small
                  className={
                    styles.helperText
                  }
                >
                  {t("quizCreate.general.minimumPoints")}
                </small>
              </label>
            </div>
          </section>

          {/* =================================================
              COLUMN 2
              ================================================= */}

          <section
            className={`${styles.column} ${styles.availabilityColumn}`}
          >
            <div
              className={
                styles.columnHeader
              }
            >
              <span>02</span>

              <div>
                <h2>
                  {t("quizCreate.availability.title")}
                </h2>

                <p>
                  {t("quizCreate.availability.subtitle")}
                </p>
              </div>
            </div>

            <label>
              {t("quizCreate.availability.mode")}

              <select
                value={
                  availabilityMode
                }
                onChange={(
                  event
                ) => {
                  setAvailabilityMode(
                    event.target
                      .value as QuizAvailabilityMode
                  );

                  setMessage("");
                }}
              >
                <option value="open_window">
                  {t("quizCreate.availability.openWindow")}
                </option>

                <option value="scheduled_session">
                  {t("quizCreate.availability.scheduledSession")}
                </option>
              </select>

              <small
                className={
                  styles.helperText
                }
              >
                {availabilityMode ===
                "open_window"
                  ? t("quizCreate.availability.openWindowHelp")
                  : t("quizCreate.availability.scheduledHelp")}
              </small>
            </label>

            <label>
              {t("quizCreate.availability.timeZone")}

              <select
                value={
                  timeZone
                }
                onChange={(
                  event
                ) => {
                  setTimeZone(
                    event.target.value
                  );

                  setMessage("");
                }}
              >
                {availableTimeZones.map(
                  (zone) => (
                    <option
                      key={
                        zone.value
                      }
                      value={
                        zone.value
                      }
                    >
                      {zone.label}
                    </option>
                  )
                )}
              </select>

              <small
                className={
                  styles.helperText
                }
              >
                {t("quizCreate.availability.timeZoneHelp")} {timeZone}.
              </small>
            </label>

            <div
              className={
                styles.infoBox
              }
            >
              <strong>
                {t("quizCreate.availability.dateLimitsTitle")}
              </strong>

              <p>
                {t(
                  "quizCreate.availability.dateLimitsText"
                )}
              </p>
            </div>
          </section>

          {/* =================================================
              COLUMN 3
              ================================================= */}

          <section
            className={`${styles.column} ${styles.scheduleColumn}`}
          >
            <div
              className={
                styles.columnHeader
              }
            >
              <span>03</span>

              <div>
                <h2>
                  {t("quizCreate.schedule.title")}
                </h2>

                <p>
                  {t("quizSettings.scheduleSubtitle")}
                </p>
              </div>
            </div>

            <fieldset
              className={
                styles.dateTimeGroup
              }
            >
              <legend>
                {availabilityMode ===
                "scheduled_session"
                  ? t("quizCreate.schedule.sessionStart")
                  : t("quizCreate.schedule.availableFrom")}
              </legend>

              <p
                className={
                  styles.groupDescription
                }
              >
                {availabilityMode ===
                "open_window"
                  ? t("quizSettings.schedule.availableFromHelp")
                  : t("quizSettings.schedule.sessionStartHelp")}
              </p>

              <div
                className={
                  styles.dateTimeGrid
                }
              >
                <label
                  className={
                    styles.dateField
                  }
                >
                  {t("quizCreate.schedule.date")}

                  <input
                    type="date"
                    min={
                      todayDateInput
                    }
                    max={
                      accountExpirationDateInput
                    }
                    required={
                      availabilityMode ===
                      "scheduled_session"
                    }
                    value={
                      startTime.date
                    }
                    onChange={(
                      event
                    ) =>
                      updateStartTime(
                        "date",
                        event.target.value
                      )
                    }
                  />
                </label>

                <label>
                  {t("quizCreate.schedule.hour")}

                  <select
                    value={
                      startTime.hour
                    }
                    onChange={(
                      event
                    ) =>
                      updateStartTime(
                        "hour",
                        Number(
                          event.target.value
                        )
                      )
                    }
                  >
                    {HOURS.map(
                      (hour) => (
                        <option
                          key={hour}
                          value={hour}
                        >
                          {String(
                            hour
                          ).padStart(
                            2,
                            "0"
                          )}
                        </option>
                      )
                    )}
                  </select>
                </label>

                <label>
                  {t("quizCreate.schedule.minute")}

                  <select
                    value={
                      startTime.minute
                    }
                    onChange={(
                      event
                    ) =>
                      updateStartTime(
                        "minute",
                        Number(
                          event.target.value
                        )
                      )
                    }
                  >
                    {MINUTES.map(
                      (minute) => (
                        <option
                          key={
                            minute
                          }
                          value={
                            minute
                          }
                        >
                          {String(
                            minute
                          ).padStart(
                            2,
                            "0"
                          )}
                        </option>
                      )
                    )}
                  </select>
                </label>

                <label>
                  {t("quizCreate.schedule.period")}

                  <select
                    value={
                      startTime.period
                    }
                    onChange={(
                      event
                    ) =>
                      updateStartTime(
                        "period",
                        event.target
                          .value as Meridiem
                      )
                    }
                  >
                    <option value="AM">
                      AM
                    </option>

                    <option value="PM">
                      PM
                    </option>
                  </select>
                </label>
              </div>

              <div
                className={
                  styles.preview
                }
              >
                <strong>
                  {t("quizCreate.schedule.preview")}:
                </strong>{" "}

                {startUtc
                  ? formatInTimeZone(
                      startUtc,
                      timeZone
                    )
                  : availabilityMode ===
                      "open_window"
                    ? t("quizCreate.schedule.availableImmediately")
                    : t("quizCreate.schedule.startNotSelected")}
              </div>
            </fieldset>

            <fieldset
              className={
                styles.dateTimeGroup
              }
            >
              <legend>
                {availabilityMode ===
                "scheduled_session"
                  ? t("quizCreate.schedule.sessionEnd")
                  : t("quizCreate.schedule.submissionDeadline")}
              </legend>

              <p
                className={
                  styles.groupDescription
                }
              >
                {t("quizCreate.schedule.requiredDateTime")}
              </p>

              <div
                className={
                  styles.dateTimeGrid
                }
              >
                <label
                  className={
                    styles.dateField
                  }
                >
                  {t("quizCreate.schedule.date")}

                  <input
                    type="date"
                    min={
                      startTime.date ||
                      todayDateInput
                    }
                    max={
                      accountExpirationDateInput
                    }
                    required
                    value={
                      endTime.date
                    }
                    onChange={(
                      event
                    ) =>
                      updateEndTime(
                        "date",
                        event.target.value
                      )
                    }
                  />
                </label>

                <label>
                  {t("quizCreate.schedule.hour")}

                  <select
                    value={
                      endTime.hour
                    }
                    onChange={(
                      event
                    ) =>
                      updateEndTime(
                        "hour",
                        Number(
                          event.target.value
                        )
                      )
                    }
                  >
                    {HOURS.map(
                      (hour) => (
                        <option
                          key={hour}
                          value={hour}
                        >
                          {String(
                            hour
                          ).padStart(
                            2,
                            "0"
                          )}
                        </option>
                      )
                    )}
                  </select>
                </label>

                <label>
                  {t("quizCreate.schedule.minute")}

                  <select
                    value={
                      endTime.minute
                    }
                    onChange={(
                      event
                    ) =>
                      updateEndTime(
                        "minute",
                        Number(
                          event.target.value
                        )
                      )
                    }
                  >
                    {MINUTES.map(
                      (minute) => (
                        <option
                          key={
                            minute
                          }
                          value={
                            minute
                          }
                        >
                          {String(
                            minute
                          ).padStart(
                            2,
                            "0"
                          )}
                        </option>
                      )
                    )}
                  </select>
                </label>

                <label>
                  {t("quizCreate.schedule.period")}

                  <select
                    value={
                      endTime.period
                    }
                    onChange={(
                      event
                    ) =>
                      updateEndTime(
                        "period",
                        event.target
                          .value as Meridiem
                      )
                    }
                  >
                    <option value="AM">
                      AM
                    </option>

                    <option value="PM">
                      PM
                    </option>
                  </select>
                </label>
              </div>

              <div
                className={
                  styles.preview
                }
              >
                <strong>
                  {t("quizCreate.schedule.preview")}:
                </strong>{" "}

                {endUtc
                  ? formatInTimeZone(
                      endUtc,
                      timeZone
                    )
                  : t("quizCreate.schedule.deadlineNotSelected")}
              </div>
            </fieldset>
          </section>

          {/* =================================================
              COLUMN 4
              ================================================= */}

          <section
            className={`${styles.column} ${styles.optionsColumn}`}
          >
            <div
              className={
                styles.columnHeader
              }
            >
              <span>04</span>

              <div>
                <h2>
                  {t("quizCreate.student.title")}
                </h2>

                <p>
                  {t("quizSettings.studentSubtitle")}
                </p>
              </div>
            </div>

            {availabilityMode ===
            "open_window" ? (
              <div
                className={
                  styles.durationSection
                }
              >
                <label>
                  {t("quizCreate.student.timeAllowed")}

                  <select
                    value={
                      durationSelection
                    }
                    onChange={(
                      event
                    ) =>
                      handleDurationSelection(
                        event.target.value
                      )
                    }
                  >
                    {durationOptions.map(
                      (minutes) => (
                        <option
                          key={
                            minutes
                          }
                          value={
                            minutes
                          }
                        >
                          {minutes} {t("quizCreate.units.minutesShort")} —{" "}
                          {formatQuizDuration(
                            minutes,
                            language
                          )}
                        </option>
                      )
                    )}

                    <option
                      value={
                        CUSTOM_DURATION_VALUE
                      }
                    >
                      {t("quizCreate.student.customDuration")}
                    </option>
                  </select>
                </label>

                {durationSelection ===
                  CUSTOM_DURATION_VALUE && (
                  <div
                    className={
                      styles.customDuration
                    }
                  >
                    <label>
                      {t("quizCreate.schedule.hour")}s

                      <input
                        type="number"
                        min={0}
                        max={72}
                        value={
                          customHours
                        }
                        onChange={(
                          event
                        ) =>
                          updateCustomDuration(
                            Number(
                              event.target.value
                            ),
                            customMinutes
                          )
                        }
                      />
                    </label>

                    <label>
                      {t("quizCreate.schedule.minute")}s

                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={
                          customMinutes
                        }
                        onChange={(
                          event
                        ) =>
                          updateCustomDuration(
                            customHours,
                            Number(
                              event.target.value
                            )
                          )
                        }
                      />
                    </label>
                  </div>
                )}

                <div
                  className={
                    styles.durationSummary
                  }
                >
                  <span>
                    {t("quizCreate.student.selectedDuration")}
                  </span>

                  <strong>
                    {formatQuizDuration(
                      timeLimitMinutes,
                      language
                    )}
                  </strong>
                </div>

                <small
                  className={
                    styles.helperText
                  }
                >
                  {t("quizSettings.maximumAllowed")}{" "}
                  {formatQuizDuration(
                    maximumStudentTime,
                    language
                  )}.
                </small>
              </div>
            ) : (
              <div
                className={
                  styles.sessionDurationBox
                }
              >
                <span>
                  {t("quizCreate.student.sessionDuration")}
                </span>

                <strong>
                  {scheduledSessionDuration
                    ? formatQuizDuration(
                        scheduledSessionDuration,
                        language
                      )
                    : t("quizCreate.student.selectStartEnd")}
                </strong>

                <p>
                  {t("quizSettings.sessionDurationHelp")}
                </p>
              </div>
            )}

            <div
              className={
                styles.options
              }
            >
              <h3>
                {t("quizCreate.student.options")}
              </h3>

              <label>
                <input
                  type="checkbox"
                  checked={
                    allowBackNavigation
                  }
                  onChange={(
                    event
                  ) => {
                    setAllowBackNavigation(
                      event.target.checked
                    );

                    setMessage("");
                  }}
                />

                <span>
                  <strong>
                    {t("quizCreate.student.backNavigation")}
                  </strong>

                  <small>
                    {t("quizCreate.student.backNavigationHelp")}
                  </small>
                </span>
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={
                    shuffleQuestions
                  }
                  onChange={(
                    event
                  ) => {
                    setShuffleQuestions(
                      event.target.checked
                    );

                    setMessage("");
                  }}
                />

                <span>
                  <strong>
                    {t("quizCreate.student.shuffleQuestions")}
                  </strong>

                  <small>
                    {t("quizCreate.student.shuffleQuestionsHelp")}
                  </small>
                </span>
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={
                    shuffleChoices
                  }
                  onChange={(
                    event
                  ) => {
                    setShuffleChoices(
                      event.target.checked
                    );

                    setMessage("");
                  }}
                />

                <span>
                  <strong>
                    {t("quizCreate.student.shuffleChoices")}
                  </strong>

                  <small>
                    {t("quizSettings.shuffleChoicesHelp")}
                  </small>
                </span>
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={
                    showResultsToStudents
                  }
                  onChange={(
                    event
                  ) => {
                    const checked =
                      event.target.checked;

                    setShowResultsToStudents(
                      checked
                    );

                    if (!checked) {
                      setShowCorrectAnswers(
                        false
                      );
                    }

                    setMessage("");
                  }}
                />

                <span>
                  <strong>
                    {t("quizCreate.student.showScore")}
                  </strong>

                  <small>
                    {t(
                      "quizCreate.student.showScoreHelp"
                    )}
                  </small>
                </span>
              </label>

              <label
                className={
                  !showResultsToStudents
                    ? styles.disabledOption
                    : undefined
                }
              >
                <input
                  type="checkbox"
                  checked={
                    showCorrectAnswers
                  }
                  disabled={
                    !showResultsToStudents
                  }
                  onChange={(
                    event
                  ) => {
                    setShowCorrectAnswers(
                      event.target.checked
                    );

                    setMessage("");
                  }}
                />

                <span>
                  <strong>
                    {t("quizCreate.student.showCorrectAnswers")}
                  </strong>

                  <small>
                    {t(
                      "quizCreate.student.showCorrectAnswersHelp"
                    )}
                  </small>
                </span>
              </label>
            </div>
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

          <div
            className={
              styles.formActions
            }
          >
            <button
              type="submit"
              className="app-button app-button-action"
              disabled={
                saving
              }
            >
              {t("quizSettings.actions.save")}
            </button>

            <button
              type="button"
              className="app-button app-button-secondary app-button-action"
              disabled={
                saving
              }
              onClick={
                handleBack
              }
            >
              {t("quizCreate.actions.cancel")}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}