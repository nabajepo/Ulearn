"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import { useRouter } from "next/navigation";

import AppLoading from "@/components/AppLoading";
import { useTeacher } from "@/hooks/useTeacher";

import {
  createQuiz,
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

import styles from "../QuizSettingsForm.module.css";

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

const INITIAL_START_TIME: TimeSelection = {
  date: "",
  hour: 9,
  minute: 0,
  period: "AM",
};

const INITIAL_END_TIME: TimeSelection = {
  date: "",
  hour: 5,
  minute: 0,
  period: "PM",
};

const CUSTOM_DURATION_VALUE = "custom";

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

export default function CreateQuizPage() {
  const router = useRouter();

  const {
    teacher,
    loading,
    blocked,
    message: teacherMessage,
  } = useTeacher();

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
      INITIAL_START_TIME
    );

  const [endTime, setEndTime] =
    useState<TimeSelection>(
      INITIAL_END_TIME
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

  const [
    showResultsToStudents,
    setShowResultsToStudents,
  ] = useState(true);

  const [
    showCorrectAnswers,
    setShowCorrectAnswers,
  ] = useState(false);

  const [message, setMessage] =
    useState("");

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    navigatingBack,
    setNavigatingBack,
  ] = useState(false);

  useEffect(() => {
    const detectedTimeZone =
      Intl.DateTimeFormat()
        .resolvedOptions()
        .timeZone;

    if (detectedTimeZone) {
      setTimeZone(detectedTimeZone);
    }
  }, []);

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
          label: `Current time zone — ${timeZone}`,
        },
        ...TIME_ZONES,
      ];
    }, [timeZone]);

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

  const maximumStudentTime =
    useMemo(() => {
      if (!accountExpirationMs) {
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
          LIMITS.MAX_QUIZ_DURATION_MINUTES
        );

      if (
        availableWindowMinutes !== null &&
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
      maximumStudentTime % 15 === 0
    ) {
      setDurationSelection(
        String(maximumStudentTime)
      );
    } else {
      setDurationSelection(
        CUSTOM_DURATION_VALUE
      );

      setCustomHours(
        Math.floor(
          maximumStudentTime / 60
        )
      );

      setCustomMinutes(
        maximumStudentTime % 60
      );
    }
  }, [
    availabilityMode,
    maximumStudentTime,
    timeLimitMinutes,
  ]);

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
      const currentHours =
        Math.floor(
          timeLimitMinutes / 60
        );

      const currentMinutes =
        timeLimitMinutes % 60;

      setCustomHours(currentHours);
      setCustomMinutes(currentMinutes);

      return;
    }

    const minutes =
      Number(value);

    if (
      Number.isFinite(minutes)
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
        Math.min(
          72,
          Math.floor(
            Number.isFinite(hours)
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
            Number.isFinite(minutes)
              ? minutes
              : 0
          )
        )
      );

    const totalMinutes =
      safeHours * 60 +
      safeMinutes;

    setCustomHours(
      safeHours
    );

    setCustomMinutes(
      safeMinutes
    );

    setTimeLimitMinutes(
      totalMinutes
    );

    setMessage("");
  }

  function handleBackToDashboard() {
    if (
      submitting ||
      navigatingBack
    ) {
      return;
    }

    setNavigatingBack(true);

    router.push(
      "/dashboard"
    );
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      !teacher ||
      submitting
    ) {
      return;
    }

    setMessage("");

    const now = Date.now();

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
        "Quiz title is required."
      );

      return;
    }

    if (!timeZone.trim()) {
      setMessage(
        "A quiz time zone is required."
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
        "The opening date and time cannot be in the past."
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

    if (endMs <= now) {
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
      LIMITS.MAX_QUIZ_DURATION_MINUTES
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
        )} for the selected quiz window.`
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
        });

      if (
        !result.success ||
        !result.quiz
      ) {
        setMessage(
          result.message
        );

        setSubmitting(false);

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
        "Unable to create the quiz. Please try again."
      );

      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <AppLoading
        title="ULearn"
        subtitle="Preparing the quiz creation form..."
      />
    );
  }

  if (submitting) {
    return (
      <AppLoading
        title="Creating your quiz"
        subtitle="Saving your quiz settings..."
      />
    );
  }

  if (navigatingBack) {
    return (
      <AppLoading
        title="ULearn"
        subtitle="Returning to your dashboard..."
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
            Teacher unavailable
          </h1>

          <p>
            {teacherMessage ||
              "Teacher profile unavailable."}
          </p>

          <button
            type="button"
            className="app-button app-button-secondary"
            onClick={() =>
              router.push("/")
            }
          >
            Return to Home
          </button>
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
          ← Back to Dashboard
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
            Create Quiz
          </h1>

          <p>
            Configure your quiz. All quiz dates must remain inside
            your teacher account lifetime.
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
          <section
            className={`${styles.column} ${styles.generalColumn}`}
          >
            <div
              className={
                styles.columnHeader
              }
            >
              <span>
                01
              </span>

              <div>
                <h2>
                  General information
                </h2>

                <p>
                  Define the quiz title and purpose.
                </p>
              </div>
            </div>

            <label>
              Quiz title

              <input
                type="text"
                value={title}
                maxLength={120}
                required
                placeholder="Example: Basic mathematics"
                onChange={(event) => {
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
                {title.length} / 120 characters
              </small>
            </label>

            <label>
              Description

              <textarea
                value={description}
                maxLength={1000}
                placeholder="Describe the purpose of this quiz..."
                onChange={(event) => {
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
                {description.length} / 1000 characters
              </small>
            </label>
          </section>

          <section
            className={`${styles.column} ${styles.availabilityColumn}`}
          >
            <div
              className={
                styles.columnHeader
              }
            >
              <span>
                02
              </span>

              <div>
                <h2>
                  Availability
                </h2>

                <p>
                  Configure how students access the quiz.
                </p>
              </div>
            </div>

            <label>
              Availability mode

              <select
                value={
                  availabilityMode
                }
                onChange={(event) => {
                  setAvailabilityMode(
                    event.target
                      .value as QuizAvailabilityMode
                  );

                  setMessage("");
                }}
              >
                <option value="open_window">
                  Open window — different start times
                </option>

                <option value="scheduled_session">
                  Scheduled session — everyone together
                </option>
              </select>

              <small
                className={
                  styles.helperText
                }
              >
                {availabilityMode ===
                "open_window"
                  ? "Students may begin at different times during the availability window."
                  : "All students use the same scheduled session period."}
              </small>
            </label>

            <label>
              Quiz time zone

              <select
                value={
                  timeZone
                }
                onChange={(event) => {
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
                Quiz dates and times will be interpreted using{" "}
                {timeZone}.
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
                Dates cannot be in the past or after your teacher
                account expiration.
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
              <span>
                03
              </span>

              <div>
                <h2>
                  Quiz schedule
                </h2>

                <p>
                  Select valid opening and closing times.
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
                  ? "Optional. Leave empty to make the quiz available immediately after launch."
                  : "Required. All students may begin at this time."}
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
                    onChange={(event) =>
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
                    onChange={(event) =>
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
                    onChange={(event) =>
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
                  Period

                  <select
                    value={
                      startTime.period
                    }
                    onChange={(event) =>
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
                  : availabilityMode ===
                      "open_window"
                    ? "Available immediately after launch"
                    : "Start date not selected"}
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
                This date and time are required.
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
                    onChange={(event) =>
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
                    onChange={(event) =>
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
                    onChange={(event) =>
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
                  Period

                  <select
                    value={
                      endTime.period
                    }
                    onChange={(event) =>
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

          <section
            className={`${styles.column} ${styles.optionsColumn}`}
          >
            <div
              className={
                styles.columnHeader
              }
            >
              <span>
                04
              </span>

              <div>
                <h2>
                  Student settings
                </h2>

                <p>
                  Configure the student quiz experience.
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
                    onChange={(event) =>
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
                        onChange={(event) =>
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
                        onChange={(event) =>
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
                  Maximum allowed for this quiz window:{" "}
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
                  Scheduled session duration
                </span>

                <strong>
                  {scheduledSessionDuration
                    ? formatQuizDuration(
                        scheduledSessionDuration
                      )
                    : "Select the start and end times"}
                </strong>

                <p>
                  The duration is calculated automatically from the
                  session start and end.
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
                  onChange={(event) => {
                    setAllowBackNavigation(
                      event.target.checked
                    );

                    setMessage("");
                  }}
                />

                <span>
                  <strong>
                    Allow back navigation
                  </strong>

                  <small>
                    Students may return to previous questions.
                  </small>
                </span>
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={
                    shuffleQuestions
                  }
                  onChange={(event) => {
                    setShuffleQuestions(
                      event.target.checked
                    );

                    setMessage("");
                  }}
                />

                <span>
                  <strong>
                    Shuffle questions
                  </strong>

                  <small>
                    Questions appear in a random order.
                  </small>
                </span>
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={
                    shuffleChoices
                  }
                  onChange={(event) => {
                    setShuffleChoices(
                      event.target.checked
                    );

                    setMessage("");
                  }}
                />

                <span>
                  <strong>
                    Shuffle QCM choices
                  </strong>

                  <small>
                    Multiple-choice answers appear in a random order.
                  </small>
                </span>
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={
                    showResultsToStudents
                  }
                  onChange={(event) => {
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
                    Show final score
                  </strong>

                  <small>
                    Students may view their final score once grading
                    is complete.
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
                  onChange={(event) => {
                    setShowCorrectAnswers(
                      event.target.checked
                    );

                    setMessage("");
                  }}
                />

                <span>
                  <strong>
                    Show correct answers
                  </strong>

                  <small>
                    Students may review correct answers after grading
                    is complete.
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
              Create Quiz
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
              Cancel
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}