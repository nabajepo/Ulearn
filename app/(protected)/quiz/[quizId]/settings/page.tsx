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

type TimeSelection = {
  date: string;
  hour: number;
  minute: number;
  period: Meridiem;
};

const HOURS = Array.from(
  { length: 12 },
  (_, index) => index + 1
);

const MINUTES = [0, 15, 30, 45];

const CUSTOM_DURATION_VALUE = "custom";

const TIME_ZONES = [
  {
    value: "America/Toronto",
    label: "Eastern Time — Ottawa, Toronto, Montréal",
  },
  {
    value: "America/Winnipeg",
    label: "Central Time — Winnipeg",
  },
  {
    value: "America/Edmonton",
    label: "Mountain Time — Edmonton",
  },
  {
    value: "America/Vancouver",
    label: "Pacific Time — Vancouver",
  },
  {
    value: "America/Halifax",
    label: "Atlantic Time — Halifax",
  },
  {
    value: "America/St_Johns",
    label: "Newfoundland Time — St. John's",
  },
  {
    value: "Europe/Paris",
    label: "Central European Time — Paris",
  },
  {
    value: "Africa/Bujumbura",
    label: "Central Africa Time — Bujumbura",
  },
];

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
) {
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
) {
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

/**
 * Converts a UTC Firestore date back into the quiz's
 * local date + hour + minute + AM/PM.
 */
function utcToTimeSelection(
  value: string | null,
  timeZone: string,
  fallback: TimeSelection
): TimeSelection {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return fallback;
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
    hour: Number(hourValue),
    minute: Number(minuteValue),
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

  const [navigatingBack, setNavigatingBack] =
    useState(false);

  const [message, setMessage] =
    useState("");

  /* =========================================================
     Form state
     ========================================================= */

  const [title, setTitle] =
    useState("");

  const [description, setDescription] =
    useState("");

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

  /* =========================================================
     Load existing quiz
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

        setTitle(data.title);
        setDescription(
          data.description
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

        /*
         * Standard 15-minute duration:
         * select it directly.
         *
         * Non-standard value:
         * use Custom duration.
         */
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
        }

        setAllowBackNavigation(
          data.allowBackNavigation
        );

        setShuffleQuestions(
          data.shuffleQuestions
        );

        setShuffleChoices(
          data.shuffleChoices
        );
      } catch (error) {
        console.error(
          "Error loading quiz settings:",
          error
        );

        setMessage(
          "Unable to load quiz settings."
        );
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
  }, [quizId]);

  /* =========================================================
     Time zones
     ========================================================= */

  const availableTimeZones =
    useMemo(() => {
      const exists =
        TIME_ZONES.some(
          (zone) =>
            zone.value === timeZone
        );

      if (exists) {
        return TIME_ZONES;
      }

      return [
        {
          value: timeZone,
          label:
            `Current time zone — ${timeZone}`,
        },
        ...TIME_ZONES,
      ];
    }, [timeZone]);

  /* =========================================================
     Dates
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
      if (!teacher?.expiresAt) {
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
      if (!teacher?.expiresAt) {
        return 0;
      }

      const value =
        new Date(
          teacher.expiresAt
        ).getTime();

      return Number.isNaN(value)
        ? 0
        : value;
    }, [teacher?.expiresAt]);

  const startUtc =
    useMemo(
      () =>
        createUtcDateTime(
          startTime,
          timeZone
        ),
      [startTime, timeZone]
    );

  const endUtc =
    useMemo(
      () =>
        createUtcDateTime(
          endTime,
          timeZone
        ),
      [endTime, timeZone]
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
     Maximum duration
     ========================================================= */

  const maximumStudentTime =
    useMemo(() => {
      if (!accountExpirationMs) {
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
        availableWindowMinutes > 0
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
      [maximumStudentTime]
    );

  /*
   * If changing dates makes the previous duration invalid,
   * automatically reduce it to the new maximum.
   */
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
    }
  }, [
    availabilityMode,
    maximumStudentTime,
    timeLimitMinutes,
  ]);

  /* =========================================================
     Updates
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

  function handleDurationSelection(
    value: string
  ) {
    setDurationSelection(value);
    setMessage("");

    if (
      value ===
      CUSTOM_DURATION_VALUE
    ) {
      const hours =
        Math.floor(
          timeLimitMinutes /
            60
        );

      const minutes =
        timeLimitMinutes %
        60;

      setCustomHours(hours);
      setCustomMinutes(minutes);

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

    setNavigatingBack(true);

    router.push(
      `/quiz/${quizId}`
    );
  }

  /* =========================================================
     Save settings
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

    if (
      quiz.status !==
      "draft"
    ) {
      setMessage(
        "Only draft quizzes can be modified."
      );

      return;
    }

    if (!cleanTitle) {
      setMessage(
        "Quiz title is required."
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
        "Your teacher account has expired."
      );

      return;
    }

    if (
      startMs !== null &&
      startMs < now
    ) {
      setMessage(
        "The opening date and time cannot be in the past. Select a future time or remove the opening date."
      );

      return;
    }

    if (
      startMs !== null &&
      startMs > expiration
    ) {
      setMessage(
        "The opening date cannot be after your account expiration."
      );

      return;
    }

    if (endMs === null) {
      setMessage(
        availabilityMode ===
        "scheduled_session"
          ? "A session end date and time are required."
          : "A submission deadline is required."
      );

      return;
    }

    if (
      endMs <= now
    ) {
      setMessage(
        "The deadline cannot be in the past."
      );

      return;
    }

    if (
      endMs > expiration
    ) {
      setMessage(
        "The quiz deadline cannot exceed your teacher account expiration."
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
          ? "The session end must be after the session start."
          : "The submission deadline must be after the opening date."
      );

      return;
    }

    if (
      availabilityMode ===
        "scheduled_session" &&
      startMs === null
    ) {
      setMessage(
        "A scheduled session requires a start date and time."
      );

      return;
    }

    const finalDuration =
      availabilityMode ===
      "scheduled_session"
        ? scheduledSessionDuration
        : timeLimitMinutes;

    if (
      finalDuration === null ||
      !Number.isFinite(
        finalDuration
      ) ||
      finalDuration < 1
    ) {
      setMessage(
        "The quiz duration must be at least 1 minute."
      );

      return;
    }

    if (
      finalDuration >
      LIMITS
        .MAX_QUIZ_DURATION_MINUTES
    ) {
      setMessage(
        `The quiz duration cannot exceed ${LIMITS.ACCOUNT_DURATION_DAYS} days.`
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
        `The time allowed per student cannot exceed ${formatQuizDuration(
          maximumStudentTime
        )}.`
      );

      return;
    }

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
          }
        );

      if (!result.success) {
        setMessage(
          result.message
        );

        setSaving(false);

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
        "Unable to save the quiz settings. Please try again."
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
        title="Quiz Settings"
        subtitle="Loading your quiz settings..."
      />
    );
  }

  if (saving) {
    return (
      <AppLoading
        title="Saving Quiz"
        subtitle="Updating your quiz settings..."
      />
    );
  }

  if (navigatingBack) {
    return (
      <AppLoading
        title="ULearn"
        subtitle="Returning to your quiz..."
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
            Access unavailable
          </h1>

          <p>
            {teacherMessage ||
              "Quiz not found or access denied."}
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
            ← Back to Quiz
          </button>

          <div
            className={
              styles.heading
            }
          >
            <h1>
              Settings locked
            </h1>

            <p>
              Only draft quizzes
              can have their
              settings changed.
            </p>
          </div>
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
            handleBack
          }
        >
          ← Back to Quiz
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
            Quiz settings
          </span>

          <h1>
            Update Quiz Settings
          </h1>

          <p>
            Change the quiz information,
            schedule and student options.
          </p>

          <div
            className={
              styles.accountLimit
            }
          >
            <span>
              Account valid until
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
          {/* COLUMN 1 */}

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
                  General information
                </h2>

                <p>
                  Change the quiz
                  title and purpose.
                </p>
              </div>
            </div>

            <label>
              Quiz title

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
                {title.length} /
                120 characters
              </small>
            </label>

            <label>
              Description

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
                {description.length} /
                1000 characters
              </small>
            </label>
          </section>

          {/* COLUMN 2 */}

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
                  Availability
                </h2>

                <p>
                  Configure how students
                  access the quiz.
                </p>
              </div>
            </div>

            <label>
              Availability mode

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
                  Open window —
                  different start times
                </option>

                <option
                  value="scheduled_session"
                >
                  Scheduled session —
                  everyone together
                </option>
              </select>
            </label>

            <label>
              Quiz time zone

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
                Quiz dates and times
                will be interpreted
                using {timeZone}.
              </small>
            </label>

            <div
              className={
                styles.infoBox
              }
            >
              <strong>
                Quiz date limits
              </strong>

              <p>
                Dates cannot be in
                the past or after
                your teacher account
                expiration.
              </p>
            </div>
          </section>

          {/* COLUMN 3 */}

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
                  Quiz schedule
                </h2>

                <p>
                  Change opening and
                  closing times.
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
                  ? "Session start"
                  : "Available from"}
              </legend>

              <p
                className={
                  styles.groupDescription
                }
              >
                {availabilityMode ===
                "open_window"
                  ? "Optional. Clear the date to make the quiz available when launched."
                  : "Required for a scheduled session."}
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
                  Date

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
                  Hour

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
                  Minute

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
                          key={minute}
                          value={minute}
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
                  Period

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
                  Preview:
                </strong>{" "}

                {startUtc
                  ? formatInTimeZone(
                      startUtc,
                      timeZone
                    )
                  : "Available immediately after launch"}
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
                  ? "Session end"
                  : "Submission deadline"}
              </legend>

              <p
                className={
                  styles.groupDescription
                }
              >
                This date and time
                are required.
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
                  Date

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
                  Hour

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
                  Minute

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
                          key={minute}
                          value={minute}
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
                  Period

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
                  Preview:
                </strong>{" "}

                {endUtc
                  ? formatInTimeZone(
                      endUtc,
                      timeZone
                    )
                  : "Deadline not selected"}
              </div>
            </fieldset>
          </section>

          {/* COLUMN 4 */}

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
                  Student settings
                </h2>

                <p>
                  Configure the student
                  quiz experience.
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
                  Time allowed per student

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
                          {minutes} min —{" "}
                          {formatQuizDuration(
                            minutes
                          )}
                        </option>
                      )
                    )}

                    <option
                      value={
                        CUSTOM_DURATION_VALUE
                      }
                    >
                      Custom duration...
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
                      Hours

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
                      Minutes

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
                    Selected duration
                  </span>

                  <strong>
                    {formatQuizDuration(
                      timeLimitMinutes
                    )}
                  </strong>
                </div>

                <small
                  className={
                    styles.helperText
                  }
                >
                  Maximum allowed:{" "}
                  {formatQuizDuration(
                    maximumStudentTime
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
                  Scheduled session
                  duration
                </span>

                <strong>
                  {scheduledSessionDuration
                    ? formatQuizDuration(
                        scheduledSessionDuration
                      )
                    : "Select the start and end times"}
                </strong>

                <p>
                  The duration is
                  calculated automatically.
                </p>
              </div>
            )}

            <div
              className={
                styles.options
              }
            >
              <h3>
                Student options
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
                    Allow back navigation
                  </strong>

                  <small>
                    Students may return
                    to previous questions.
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
                    Shuffle questions
                  </strong>

                  <small>
                    Questions appear
                    in a random order.
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
                    Shuffle QCM choices
                  </strong>

                  <small>
                    Multiple-choice answers
                    appear randomly.
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
              type="button"
              className="app-button app-button-secondary app-button-action"
              disabled={saving}
              onClick={
                handleBack
              }
            >
              Cancel
            </button>

            <button
              type="submit"
              className="app-button app-button-action"
              disabled={saving}
            >
              Save Changes
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}