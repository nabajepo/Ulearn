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

import styles from "./CreateQuizPage.module.css";

type TimeSelection = {
  date: string;
  hour: number;
  minute: number;
  period: Meridiem;
};

const HOURS = Array.from({ length: 12 }, (_, index) => index + 1);
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

function calculateDurationMinutes(
  startValue: string | null,
  endValue: string | null
): number | null {
  if (!startValue || !endValue) {
    return null;
  }

  const start = new Date(startValue).getTime();
  const end = new Date(endValue).getTime();

  if (
    Number.isNaN(start) ||
    Number.isNaN(end) ||
    end <= start
  ) {
    return null;
  }

  return Math.floor((end - start) / (1000 * 60));
}

export default function CreateQuizPage() {
  const router = useRouter();

  const {
    teacher,
    loading,
    blocked,
    message: teacherMessage,
  } = useTeacher();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const [availabilityMode, setAvailabilityMode] =
    useState<QuizAvailabilityMode>("open_window");

  const [timeZone, setTimeZone] = useState("America/Toronto");

  const [startTime, setStartTime] =
    useState<TimeSelection>(INITIAL_START_TIME);

  const [endTime, setEndTime] =
    useState<TimeSelection>(INITIAL_END_TIME);

  const [timeLimitMinutes, setTimeLimitMinutes] = useState(60);

  const [allowBackNavigation, setAllowBackNavigation] = useState(true);
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleChoices, setShuffleChoices] = useState(false);

  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [navigatingBack, setNavigatingBack] = useState(false);

  useEffect(() => {
    const detectedTimeZone =
      Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (detectedTimeZone) {
      setTimeZone(detectedTimeZone);
    }
  }, []);

  const availableTimeZones = useMemo(() => {
    const detectedZoneAlreadyExists = TIME_ZONES.some(
      (zone) => zone.value === timeZone
    );

    if (detectedZoneAlreadyExists) {
      return TIME_ZONES;
    }

    return [
      {
        value: timeZone,
        label: `Current location — ${timeZone}`,
      },
      ...TIME_ZONES,
    ];
  }, [timeZone]);

  const startUtc = useMemo(
    () => createUtcDateTime(startTime, timeZone),
    [startTime, timeZone]
  );

  const endUtc = useMemo(
    () => createUtcDateTime(endTime, timeZone),
    [endTime, timeZone]
  );

  const scheduledSessionDuration = useMemo(
    () => calculateDurationMinutes(startUtc, endUtc),
    [startUtc, endUtc]
  );

  function updateStartTime<K extends keyof TimeSelection>(
    field: K,
    value: TimeSelection[K]
  ) {
    setStartTime((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateEndTime<K extends keyof TimeSelection>(
    field: K,
    value: TimeSelection[K]
  ) {
    setEndTime((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleBackToDashboard() {
    if (submitting || navigatingBack) {
      return;
    }

    setNavigatingBack(true);
    router.push("/dashboard");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!teacher || submitting) {
      return;
    }

    setMessage("");

    const cleanTitle = title.trim();
    const cleanDescription = description.trim();

    if (!cleanTitle) {
      setMessage("Quiz title is required.");
      return;
    }

    if (!timeZone) {
      setMessage("Please select a time zone.");
      return;
    }

    if (availabilityMode === "open_window") {
      if (!endTime.date || !endUtc) {
        setMessage(
          "A submission deadline is required for an open-window quiz."
        );
        return;
      }

      if (
        !Number.isFinite(timeLimitMinutes) ||
        timeLimitMinutes < 1 ||
        timeLimitMinutes > 1440
      ) {
        setMessage(
          "The time allowed per student must be between 1 and 1440 minutes."
        );
        return;
      }
    }

    if (availabilityMode === "scheduled_session") {
      if (!startTime.date || !startUtc) {
        setMessage(
          "A start date and time are required for a scheduled session."
        );
        return;
      }

      if (!endTime.date || !endUtc) {
        setMessage(
          "An end date and time are required for a scheduled session."
        );
        return;
      }

      if (
        !scheduledSessionDuration ||
        scheduledSessionDuration < 1
      ) {
        setMessage(
          "The scheduled session end must be after its start."
        );
        return;
      }

      if (scheduledSessionDuration > 1440) {
        setMessage(
          "A scheduled session cannot last longer than 24 hours."
        );
        return;
      }
    }

    if (
      startUtc &&
      endUtc &&
      new Date(endUtc).getTime() <= new Date(startUtc).getTime()
    ) {
      setMessage(
        "The submission deadline must be after the opening date."
      );
      return;
    }

    const finalTimeLimitMinutes =
      availabilityMode === "open_window"
        ? timeLimitMinutes
        : scheduledSessionDuration;

    if (!finalTimeLimitMinutes) {
      setMessage("Unable to calculate the quiz duration.");
      return;
    }

    setSubmitting(true);

    try {
      const result = await createQuiz({
        teacherId: teacher.id,
        title: cleanTitle,
        description: cleanDescription,
        timeZone,
        availabilityMode,
        availableFrom: startUtc,
        availableUntil: endUtc,
        timeLimitMinutes: finalTimeLimitMinutes,
        allowBackNavigation,
        shuffleQuestions,
        shuffleChoices,
      });

      if (!result.success || !result.quiz) {
        setMessage(result.message);
        setSubmitting(false);
        return;
      }

      router.push(`/quiz/${result.quiz.id}`);
    } catch (error) {
      console.error("Error creating quiz:", error);

      setMessage(
        "An unexpected error occurred while creating the quiz. Please try again."
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
        subtitle="Saving your quiz settings securely..."
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

  if (blocked || !teacher) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <h1>Teacher unavailable</h1>

          <p>
            {teacherMessage ||
              "Your teacher profile could not be loaded. Please sign in again."}
          </p>

          <button
            type="button"
            className="app-button app-button-secondary"
            onClick={() => router.push("/")}
          >
            Return to Home
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <button
          type="button"
          className="app-button app-button-secondary"
          onClick={handleBackToDashboard}
        >
          ← Back to Dashboard
        </button>

        <header className={styles.heading}>
          <span className={styles.badge}>Quiz settings</span>

          <h1>Create Quiz</h1>

          <p>
            Configure the general quiz settings. Questions will be added after
            this step.
          </p>
        </header>

        <form className={styles.form} onSubmit={handleSubmit}>
          <section
            className={`${styles.column} ${styles.generalColumn}`}
          >
            <div className={styles.columnHeader}>
              <span>01</span>

              <div>
                <h2>General information</h2>
                <p>Define the quiz title and purpose.</p>
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
                onChange={(event) => setTitle(event.target.value)}
              />

              <small className={styles.helperText}>
                {title.length} / 120 characters
              </small>
            </label>

            <label>
              Description

              <textarea
                value={description}
                maxLength={1000}
                placeholder="Describe the purpose of this quiz..."
                onChange={(event) =>
                  setDescription(event.target.value)
                }
              />

              <small className={styles.helperText}>
                {description.length} / 1000 characters
              </small>
            </label>
          </section>

          <section
            className={`${styles.column} ${styles.availabilityColumn}`}
          >
            <div className={styles.columnHeader}>
              <span>02</span>

              <div>
                <h2>Availability</h2>
                <p>Choose how and where the quiz schedule applies.</p>
              </div>
            </div>

            <label>
              Availability mode

              <select
                value={availabilityMode}
                onChange={(event) => {
                  setAvailabilityMode(
                    event.target.value as QuizAvailabilityMode
                  );
                  setMessage("");
                }}
              >
                <option value="open_window">
                  Open window — students may start at different times
                </option>

                <option value="scheduled_session">
                  Scheduled session — everyone answers together
                </option>
              </select>

              <small className={styles.helperText}>
                {availabilityMode === "open_window"
                  ? "Each student receives an individual time limit after starting."
                  : "The session duration is determined by its start and end times."}
              </small>
            </label>

            <label>
              Teacher location and time zone

              <select
                value={timeZone}
                onChange={(event) => setTimeZone(event.target.value)}
              >
                {availableTimeZones.map((zone) => (
                  <option key={zone.value} value={zone.value}>
                    {zone.label}
                  </option>
                ))}
              </select>

              <small className={styles.helperText}>
                Current time zone: {timeZone}
              </small>
            </label>

            <div className={styles.infoBox}>
              <strong>How dates are saved</strong>

              <p>
                Quiz dates are stored in UTC and displayed using the selected
                teacher time zone.
              </p>
            </div>
          </section>

          <section
            className={`${styles.column} ${styles.scheduleColumn}`}
          >
            <div className={styles.columnHeader}>
              <span>03</span>

              <div>
                <h2>Quiz schedule</h2>
                <p>Select the opening and closing times.</p>
              </div>
            </div>

            <fieldset className={styles.dateTimeGroup}>
              <legend>
                {availabilityMode === "scheduled_session"
                  ? "Session start"
                  : "Available from"}
              </legend>

              <p className={styles.groupDescription}>
                {availabilityMode === "open_window"
                  ? "Optional. Leave empty to make the quiz available immediately after launch."
                  : "Required. All students may begin at this time."}
              </p>

              <div className={styles.dateTimeGrid}>
                <label className={styles.dateField}>
                  Date

                  <input
                    type="date"
                    value={startTime.date}
                    required={
                      availabilityMode === "scheduled_session"
                    }
                    onChange={(event) =>
                      updateStartTime("date", event.target.value)
                    }
                  />
                </label>

                <label>
                  Hour

                  <select
                    value={startTime.hour}
                    onChange={(event) =>
                      updateStartTime(
                        "hour",
                        Number(event.target.value)
                      )
                    }
                  >
                    {HOURS.map((hour) => (
                      <option key={hour} value={hour}>
                        {String(hour).padStart(2, "0")}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Minute

                  <select
                    value={startTime.minute}
                    onChange={(event) =>
                      updateStartTime(
                        "minute",
                        Number(event.target.value)
                      )
                    }
                  >
                    {MINUTES.map((minute) => (
                      <option key={minute} value={minute}>
                        {String(minute).padStart(2, "0")}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Period

                  <select
                    value={startTime.period}
                    onChange={(event) =>
                      updateStartTime(
                        "period",
                        event.target.value as Meridiem
                      )
                    }
                  >
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </label>
              </div>

              <div className={styles.preview}>
                <strong>Preview:</strong>{" "}
                {startUtc
                  ? formatInTimeZone(startUtc, timeZone)
                  : availabilityMode === "open_window"
                    ? "Immediately after launch"
                    : "Start date not selected"}
              </div>
            </fieldset>

            <fieldset className={styles.dateTimeGroup}>
              <legend>
                {availabilityMode === "scheduled_session"
                  ? "Session end"
                  : "Submission deadline"}
              </legend>

              <p className={styles.groupDescription}>
                This date and time are required.
              </p>

              <div className={styles.dateTimeGrid}>
                <label className={styles.dateField}>
                  Date

                  <input
                    type="date"
                    value={endTime.date}
                    required
                    onChange={(event) =>
                      updateEndTime("date", event.target.value)
                    }
                  />
                </label>

                <label>
                  Hour

                  <select
                    value={endTime.hour}
                    onChange={(event) =>
                      updateEndTime(
                        "hour",
                        Number(event.target.value)
                      )
                    }
                  >
                    {HOURS.map((hour) => (
                      <option key={hour} value={hour}>
                        {String(hour).padStart(2, "0")}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Minute

                  <select
                    value={endTime.minute}
                    onChange={(event) =>
                      updateEndTime(
                        "minute",
                        Number(event.target.value)
                      )
                    }
                  >
                    {MINUTES.map((minute) => (
                      <option key={minute} value={minute}>
                        {String(minute).padStart(2, "0")}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Period

                  <select
                    value={endTime.period}
                    onChange={(event) =>
                      updateEndTime(
                        "period",
                        event.target.value as Meridiem
                      )
                    }
                  >
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </label>
              </div>

              <div className={styles.preview}>
                <strong>Preview:</strong>{" "}
                {endUtc
                  ? formatInTimeZone(endUtc, timeZone)
                  : "End date not selected"}
              </div>
            </fieldset>
          </section>

          <section
            className={`${styles.column} ${styles.optionsColumn}`}
          >
            <div className={styles.columnHeader}>
              <span>04</span>

              <div>
                <h2>Student settings</h2>
                <p>Configure the student quiz experience.</p>
              </div>
            </div>

            {availabilityMode === "open_window" ? (
              <label>
                Time allowed per student

                <div className={styles.durationInput}>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    required
                    value={timeLimitMinutes}
                    onChange={(event) =>
                      setTimeLimitMinutes(Number(event.target.value))
                    }
                  />

                  <span>minutes</span>
                </div>

                <small className={styles.helperText}>
                  Each student will have {timeLimitMinutes} minute
                  {timeLimitMinutes !== 1 ? "s" : ""} after starting.
                </small>
              </label>
            ) : (
              <div className={styles.sessionDurationBox}>
                <span>Scheduled session duration</span>

                <strong>
                  {scheduledSessionDuration
                    ? `${scheduledSessionDuration} minutes`
                    : "Select the start and end times"}
                </strong>

                <p>
                  In scheduled-session mode, the time limit is automatically
                  determined by the session window.
                </p>
              </div>
            )}

            <div className={styles.options}>
              <h3>Student options</h3>

              <label>
                <input
                  type="checkbox"
                  checked={allowBackNavigation}
                  onChange={(event) =>
                    setAllowBackNavigation(event.target.checked)
                  }
                />

                <span>
                  <strong>Allow back navigation</strong>
                  <small>
                    Students may return to previous questions.
                  </small>
                </span>
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={shuffleQuestions}
                  onChange={(event) =>
                    setShuffleQuestions(event.target.checked)
                  }
                />

                <span>
                  <strong>Shuffle questions</strong>
                  <small>
                    Questions appear in a different order.
                  </small>
                </span>
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={shuffleChoices}
                  onChange={(event) =>
                    setShuffleChoices(event.target.checked)
                  }
                />

                <span>
                  <strong>Shuffle QCM choices</strong>
                  <small>
                    Multiple-choice answers appear randomly.
                  </small>
                </span>
              </label>
            </div>
          </section>

          {message && (
            <p className={styles.message} role="alert">
              {message}
            </p>
          )}

          <div className={styles.formActions}>
            <button
              type="button"
              className="app-button app-button-secondary app-button-action"
              disabled={submitting}
              onClick={handleBackToDashboard}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="app-button app-button-action"
              disabled={submitting}
            >
              Create Quiz
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}