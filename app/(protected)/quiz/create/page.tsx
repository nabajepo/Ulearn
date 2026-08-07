"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import {
  useRouter,
} from "next/navigation";

import AppLoading from "@/components/AppLoading";

import {
  useTeacher,
} from "@/hooks/useTeacher";

import {
  useLanguage,
} from "@/hooks/useLanguage";

import {
  createQuiz,
  type QuizAvailabilityMode,
} from "@/lib/services/quizzes";

import {
  formatInTimeZone,
  zonedDateTimeToUtc,
  type Meridiem,
} from "@/lib/dateTime";

import {
  LIMITS,
} from "@/lib/services/limits";

import {
  buildDurationOptions,
  formatQuizDuration,
} from "@/lib/quizDuration";

import styles from "../QuizSettingsForm.module.css";

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

const MINUTES = [
  0,
  15,
  30,
  45,
];

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

const INITIAL_START_TIME:
  TimeSelection = {
    date: "",
    hour: 9,
    minute: 0,
    period: "AM",
  };

const INITIAL_END_TIME:
  TimeSelection = {
    date: "",
    hour: 5,
    minute: 0,
    period: "PM",
  };

const CUSTOM_DURATION_VALUE =
  "custom";

/* =========================================================
   Helpers
   ========================================================= */

function createUtcDateTime(
  selection: TimeSelection,
  timeZone: string
) {
  if (
    !selection.date ||
    !timeZone
  ) {
    return null;
  }

  return zonedDateTimeToUtc({
    date:
      selection.date,

    hour:
      selection.hour,

    minute:
      selection.minute,

    period:
      selection.period,

    timeZone,
  });
}

function calculateMinutes(
  start: number,
  end: number
) {
  if (
    Number.isNaN(start) ||
    Number.isNaN(end) ||
    end <= start
  ) {
    return 0;
  }

  return Math.floor(
    (end - start) /
      (1000 * 60)
  );
}

function getDateInputValue(
  value: Date | string,
  timeZone: string
) {
  const date =
    typeof value === "string"
      ? new Date(value)
      : value;

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  const formatter =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    );

  const parts =
    formatter.formatToParts(
      date
    );

  const year =
    parts.find(
      (part) =>
        part.type === "year"
    )?.value ?? "";

  const month =
    parts.find(
      (part) =>
        part.type === "month"
    )?.value ?? "";

  const day =
    parts.find(
      (part) =>
        part.type === "day"
    )?.value ?? "";

  return `${year}-${month}-${day}`;
}

/* =========================================================
   Page
   ========================================================= */

export default function CreateQuizPage() {
  const router =
    useRouter();

  const {
    t,
    language,
  } = useLanguage();

  const {
    teacher,
    loading,
    blocked,
    message:
      teacherMessage,
  } = useTeacher();

  /* =====================================================
     General information
     ===================================================== */

  const [
    title,
    setTitle,
  ] = useState("");

  const [
    description,
    setDescription,
  ] = useState("");

  const [
    targetQuestions,
    setTargetQuestions,
  ] = useState(10);

  const [
    totalPoints,
    setTotalPoints,
  ] = useState(10);

  /* =====================================================
     Availability
     ===================================================== */

  const [
    availabilityMode,
    setAvailabilityMode,
  ] =
    useState<QuizAvailabilityMode>(
      "open_window"
    );

  const [
    timeZone,
    setTimeZone,
  ] =
    useState(
      "America/Toronto"
    );

  const [
    startTime,
    setStartTime,
  ] =
    useState<TimeSelection>(
      INITIAL_START_TIME
    );

  const [
    endTime,
    setEndTime,
  ] =
    useState<TimeSelection>(
      INITIAL_END_TIME
    );

  /* =====================================================
     Duration
     ===================================================== */

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

  /* =====================================================
     Student options
     ===================================================== */

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

  /* =====================================================
     UI state
     ===================================================== */

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    navigatingBack,
    setNavigatingBack,
  ] = useState(false);

  /* =====================================================
     Browser timezone
     ===================================================== */

  useEffect(() => {
    const detected =
      Intl.DateTimeFormat()
        .resolvedOptions()
        .timeZone;

    if (detected) {
      setTimeZone(
        detected
      );
    }
  }, []);

  const availableTimeZones =
    useMemo(() => {
      const exists =
        TIME_ZONES.some(
          (zone) =>
            zone.value ===
            timeZone
        );

      const translated =
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

      if (exists) {
        return translated;
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

        ...translated,
      ];
    }, [
      timeZone,
      t,
    ]);

  /* =====================================================
     Account dates
     ===================================================== */

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

  /* =====================================================
     Selected dates
     ===================================================== */

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

      const start =
        startUtc
          ? new Date(
              startUtc
            ).getTime()
          : Date.now();

      const end =
        new Date(
          endUtc
        ).getTime();

      return calculateMinutes(
        start,
        end
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

  /* =====================================================
     Maximum student duration
     ===================================================== */

  const maximumStudentTime =
    useMemo(() => {
      if (
        !accountExpirationMs
      ) {
        return 1;
      }

      const remainingAccountMinutes =
        calculateMinutes(
          Date.now(),
          accountExpirationMs
        );

      let maximum =
        Math.min(
          remainingAccountMinutes,
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

    setDurationSelection(
      String(
        maximumStudentTime
      )
    );
  }, [
    availabilityMode,
    maximumStudentTime,
    timeLimitMinutes,
  ]);

  /* =====================================================
     Date updates
     ===================================================== */

  function updateStartTime<
    K extends keyof TimeSelection,
  >(
    field: K,
    value:
      TimeSelection[K]
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
    K extends keyof TimeSelection,
  >(
    field: K,
    value:
      TimeSelection[K]
  ) {
    setEndTime(
      (current) => ({
        ...current,
        [field]: value,
      })
    );

    setMessage("");
  }

  /* =====================================================
     Duration updates
     ===================================================== */

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
      return;
    }

    const minutes =
      Number(value);

    if (
      Number.isFinite(
        minutes
      )
    ) {
      setTimeLimitMinutes(
        minutes
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
        Math.floor(hours)
      );

    const safeMinutes =
      Math.min(
        59,
        Math.max(
          0,
          Math.floor(minutes)
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

  /* =====================================================
     Navigation
     ===================================================== */

  function handleBackToDashboard() {
    if (
      submitting ||
      navigatingBack
    ) {
      return;
    }

    setNavigatingBack(
      true
    );

    router.push(
      "/dashboard"
    );
  }

  /* =====================================================
     Submit
     ===================================================== */

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      !teacher ||
      submitting
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

    if (!cleanTitle) {
      setMessage(
        t(
          "quizCreate.validation.titleRequired"
        )
      );

      return;
    }

    if (
      !Number.isInteger(
        targetQuestions
      ) ||
      targetQuestions < 1 ||
      targetQuestions >
        LIMITS.MAX_QUESTIONS_PER_QUIZ
    ) {
      setMessage(
        `${t(
          "quizCreate.validation.questionRange"
        )} ${LIMITS.MAX_QUESTIONS_PER_QUIZ}.`
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
        t(
          "quizCreate.validation.minimumPoints"
        )
      );

      return;
    }

    if (
      Number.isNaN(
        expiration
      ) ||
      expiration <= now
    ) {
      setMessage(
        t(
          "quizCreate.validation.accountExpired"
        )
      );

      return;
    }

    if (
      startMs !== null &&
      startMs < now
    ) {
      setMessage(
        t(
          "quizCreate.validation.startPast"
        )
      );

      return;
    }

    if (
      startMs !== null &&
      startMs >
        expiration
    ) {
      setMessage(
        t(
          "quizCreate.validation.startAfterExpiration"
        )
      );

      return;
    }

    if (
      endMs === null
    ) {
      setMessage(
        availabilityMode ===
        "scheduled_session"
          ? t(
              "quizCreate.validation.sessionEndRequired"
            )
          : t(
              "quizCreate.validation.deadlineRequired"
            )
      );

      return;
    }

    if (
      endMs <= now
    ) {
      setMessage(
        t(
          "quizCreate.validation.deadlinePast"
        )
      );

      return;
    }

    if (
      endMs >
      expiration
    ) {
      setMessage(
        t(
          "quizCreate.validation.deadlineAfterExpiration"
        )
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
          ? t(
              "quizCreate.validation.sessionEndAfterStart"
            )
          : t(
              "quizCreate.validation.deadlineAfterStart"
            )
      );

      return;
    }

    if (
      availabilityMode ===
        "scheduled_session" &&
      startMs === null
    ) {
      setMessage(
        t(
          "quizCreate.validation.sessionStartRequired"
        )
      );

      return;
    }

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
        t(
          "quizCreate.validation.minimumDuration"
        )
      );

      return;
    }

    if (
      finalDuration >
      LIMITS
        .MAX_QUIZ_DURATION_MINUTES
    ) {
      setMessage(
        `${t(
          "quizCreate.validation.maximumDuration"
        )} ${LIMITS.ACCOUNT_DURATION_DAYS} ${t(
          "quizCreate.units.days"
        )}.`
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

    setSubmitting(true);

    try {
      const result =
        await createQuiz({
          teacherId:
            teacher.id,

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
          showCorrectAnswers,
        });

      if (
        !result.success ||
        !result.quiz
      ) {
        setMessage(
          result.message
        );

        setSubmitting(
          false
        );

        return;
      }

      router.push(
        `/quiz/${result.quiz.id}`
      );
    } catch (error) {
      console.error(
        "Error creating quiz:",
        error
      );

      setMessage(
        t(
          "quizCreate.validation.createError"
        )
      );

      setSubmitting(
        false
      );
    }
  }

  /* =====================================================
     Loading
     ===================================================== */

  if (loading) {
    return (
      <AppLoading
        title="ULearn"
        subtitle={t(
          "quizCreate.loading.preparing"
        )}
      />
    );
  }

  if (submitting) {
    return (
      <AppLoading
        title={t(
          "quizCreate.loading.creatingTitle"
        )}
        subtitle={t(
          "quizCreate.loading.creatingSubtitle"
        )}
      />
    );
  }

  if (
    navigatingBack
  ) {
    return (
      <AppLoading
        title="ULearn"
        subtitle={t(
          "quizCreate.loading.returning"
        )}
      />
    );
  }

  if (
    blocked ||
    !teacher
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
              "quizCreate.teacherUnavailable.title"
            )}
          </h1>

          <p>
            {teacherMessage ||
              t(
                "quizCreate.teacherUnavailable.text"
              )}
          </p>
        </section>
      </main>
    );
  }

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
            handleBackToDashboard
          }
        >
          ←{" "}
          {t(
            "quizCreate.backDashboard"
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
              "quizCreate.badge"
            )}
          </span>

          <h1>
            {t(
              "quizCreate.title"
            )}
          </h1>

          <p>
            {t(
              "quizCreate.subtitle"
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
                  {t(
                    "quizCreate.general.title"
                  )}
                </h2>

                <p>
                  {t(
                    "quizCreate.general.subtitle"
                  )}
                </p>
              </div>
            </div>

            <label>
              {t(
                "quizCreate.general.quizTitle"
              )}

              <input
                type="text"
                value={title}
                maxLength={120}
                required
                placeholder={t(
                  "quizCreate.general.quizTitlePlaceholder"
                )}
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
                {title.length} /
                120{" "}
                {t(
                  "quizCreate.units.characters"
                )}
              </small>
            </label>

            <label>
              {t(
                "quizCreate.general.description"
              )}

              <textarea
                value={
                  description
                }
                maxLength={1000}
                placeholder={t(
                  "quizCreate.general.descriptionPlaceholder"
                )}
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
                {description.length} /
                1000{" "}
                {t(
                  "quizCreate.units.characters"
                )}
              </small>
            </label>

            <div
              className={
                styles.structureGrid
              }
            >
              <label>
                {t(
                  "quizCreate.general.numberQuestions"
                )}

                <input
                  type="number"
                  min={1}
                  max={
                    LIMITS
                      .MAX_QUESTIONS_PER_QUIZ
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
                  {t(
                    "quizCreate.general.maximumQuestions"
                  )}{" "}
                  {
                    LIMITS
                      .MAX_QUESTIONS_PER_QUIZ
                  }.
                </small>
              </label>

              <label>
                {t(
                  "quizCreate.general.totalPoints"
                )}

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
                  {t(
                    "quizCreate.general.minimumPoints"
                  )}
                </small>
              </label>
            </div>
          </section>

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
                  {t(
                    "quizCreate.availability.title"
                  )}
                </h2>

                <p>
                  {t(
                    "quizCreate.availability.subtitle"
                  )}
                </p>
              </div>
            </div>

            <label>
              {t(
                "quizCreate.availability.mode"
              )}

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
                <option
                  value="open_window"
                >
                  {t(
                    "quizCreate.availability.openWindow"
                  )}
                </option>

                <option
                  value="scheduled_session"
                >
                  {t(
                    "quizCreate.availability.scheduledSession"
                  )}
                </option>
              </select>

              <small
                className={
                  styles.helperText
                }
              >
                {availabilityMode ===
                "open_window"
                  ? t(
                      "quizCreate.availability.openWindowHelp"
                    )
                  : t(
                      "quizCreate.availability.scheduledHelp"
                    )}
              </small>
            </label>

            <label>
              {t(
                "quizCreate.availability.timeZone"
              )}

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
                {t(
                  "quizCreate.availability.timeZoneHelp"
                )}{" "}
                {timeZone}.
              </small>
            </label>

            <div
              className={
                styles.infoBox
              }
            >
              <strong>
                {t(
                  "quizCreate.availability.dateLimitsTitle"
                )}
              </strong>

              <p>
                {t(
                  "quizCreate.availability.dateLimitsText"
                )}
              </p>
            </div>
          </section>

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
                  {t(
                    "quizCreate.schedule.title"
                  )}
                </h2>

                <p>
                  {t(
                    "quizCreate.schedule.subtitle"
                  )}
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
                  ? t(
                      "quizCreate.schedule.sessionStart"
                    )
                  : t(
                      "quizCreate.schedule.availableFrom"
                    )}
              </legend>

              <p
                className={
                  styles.groupDescription
                }
              >
                {availabilityMode ===
                "open_window"
                  ? t(
                      "quizCreate.schedule.availableFromHelp"
                    )
                  : t(
                      "quizCreate.schedule.sessionStartHelp"
                    )}
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
                  {t(
                    "quizCreate.schedule.date"
                  )}

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
                  {t(
                    "quizCreate.schedule.hour"
                  )}

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
                  {t(
                    "quizCreate.schedule.minute"
                  )}

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
                  {t(
                    "quizCreate.schedule.period"
                  )}

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
                  {t(
                    "quizCreate.schedule.preview"
                  )}:
                </strong>{" "}

                {startUtc
                  ? formatInTimeZone(
                      startUtc,
                      timeZone
                    )
                  : availabilityMode ===
                      "open_window"
                    ? t(
                        "quizCreate.schedule.availableImmediately"
                      )
                    : t(
                        "quizCreate.schedule.startNotSelected"
                      )}
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
                  ? t(
                      "quizCreate.schedule.sessionEnd"
                    )
                  : t(
                      "quizCreate.schedule.submissionDeadline"
                    )}
              </legend>

              <p
                className={
                  styles.groupDescription
                }
              >
                {t(
                  "quizCreate.schedule.requiredDateTime"
                )}
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
                  {t(
                    "quizCreate.schedule.date"
                  )}

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
                  {t(
                    "quizCreate.schedule.hour"
                  )}

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
                  {t(
                    "quizCreate.schedule.minute"
                  )}

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
                  {t(
                    "quizCreate.schedule.period"
                  )}

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
                  {t(
                    "quizCreate.schedule.preview"
                  )}:
                </strong>{" "}

                {endUtc
                  ? formatInTimeZone(
                      endUtc,
                      timeZone
                    )
                  : t(
                      "quizCreate.schedule.deadlineNotSelected"
                    )}
              </div>
            </fieldset>
          </section>

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
                  {t(
                    "quizCreate.student.title"
                  )}
                </h2>

                <p>
                  {t(
                    "quizCreate.student.subtitle"
                  )}
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
                  {t(
                    "quizCreate.student.timeAllowed"
                  )}

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
                          {minutes}{" "}
                          {t(
                            "quizCreate.units.minutesShort"
                          )}{" "}
                          —{" "}
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
                      {t(
                        "quizCreate.student.customDuration"
                      )}
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
                      {t(
                        "quizCreate.student.hours"
                      )}

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
                      {t(
                        "quizCreate.student.minutes"
                      )}

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
                    {t(
                      "quizCreate.student.selectedDuration"
                    )}
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
                  {t(
                    "quizCreate.student.maximumAllowed"
                  )}{" "}
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
                  {t(
                    "quizCreate.student.sessionDuration"
                  )}
                </span>

                <strong>
                  {scheduledSessionDuration
                    ? formatQuizDuration(
                        scheduledSessionDuration,
                        language
                      )
                    : t(
                        "quizCreate.student.selectStartEnd"
                      )}
                </strong>

                <p>
                  {t(
                    "quizCreate.student.sessionDurationHelp"
                  )}
                </p>
              </div>
            )}

            <div
              className={
                styles.options
              }
            >
              <h3>
                {t(
                  "quizCreate.student.options"
                )}
              </h3>

              <label>
                <input
                  type="checkbox"
                  checked={
                    allowBackNavigation
                  }
                  onChange={(
                    event
                  ) =>
                    setAllowBackNavigation(
                      event.target.checked
                    )
                  }
                />

                <span>
                  <strong>
                    {t(
                      "quizCreate.student.backNavigation"
                    )}
                  </strong>

                  <small>
                    {t(
                      "quizCreate.student.backNavigationHelp"
                    )}
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
                  ) =>
                    setShuffleQuestions(
                      event.target.checked
                    )
                  }
                />

                <span>
                  <strong>
                    {t(
                      "quizCreate.student.shuffleQuestions"
                    )}
                  </strong>

                  <small>
                    {t(
                      "quizCreate.student.shuffleQuestionsHelp"
                    )}
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
                  ) =>
                    setShuffleChoices(
                      event.target.checked
                    )
                  }
                />

                <span>
                  <strong>
                    {t(
                      "quizCreate.student.shuffleChoices"
                    )}
                  </strong>

                  <small>
                    {t(
                      "quizCreate.student.shuffleChoicesHelp"
                    )}
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

                    if (
                      !checked
                    ) {
                      setShowCorrectAnswers(
                        false
                      );
                    }
                  }}
                />

                <span>
                  <strong>
                    {t(
                      "quizCreate.student.showScore"
                    )}
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
                  ) =>
                    setShowCorrectAnswers(
                      event.target.checked
                    )
                  }
                />

                <span>
                  <strong>
                    {t(
                      "quizCreate.student.showCorrectAnswers"
                    )}
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
                submitting
              }
            >
              {t(
                "quizCreate.actions.create"
              )}
            </button>

            <button
              type="button"
              className="app-button app-button-secondary app-button-action"
              disabled={
                submitting
              }
              onClick={
                handleBackToDashboard
              }
            >
              {t(
                "quizCreate.actions.cancel"
              )}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}