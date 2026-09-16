"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";

import AppLoading from "@/components/AppLoading";
import HelpSupport from "@/components/HelpSupport";
import { useLanguage } from "@/hooks/useLanguage";
import { formatInTimeZone } from "@/lib/dateTime";
import { formatQuizDuration } from "@/lib/quizDuration";
import { getQuizByAccessCode, type Quiz } from "@/lib/services/quizzes";

import styles from "./JoinQuizPage.module.css";

type AvailabilityState = "available" | "waiting" | "ended" | "unavailable";
type PinResetView = "normal" | "waiting" | "approved";

type ApiBaseResponse = {
  success: boolean;
  messageKey?: string;
  message?: string;
};

type StartAttemptApiResponse = ApiBaseResponse & {
  attemptId?: string | null;
  resumed?: boolean;
  attemptsRemaining?: number;
  lockedUntil?: string | null;
  remainingSeconds?: number;
};

type RequestPinResetApiResponse = ApiBaseResponse & {
  status?: "pending" | "approved";
  attemptId?: string;
};

type PinResetStatusApiResponse = ApiBaseResponse & {
  status?: "pending" | "approved" | null;
  attemptId?: string | null;
};

type ResetPinApiResponse = ApiBaseResponse & {
  attemptId?: string;
  studentName?: string;
  attemptsRemaining?: number;
};

const STUDENT_PIN_LENGTH = 6;
const RESET_CODE_LENGTH = 6;
const RESET_STATUS_POLL_INTERVAL_MS = 2500;

function formatCountdown(milliseconds: number) {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPin(value: string) {
  return /^\d{6}$/.test(value);
}

function onlyDigits(value: string, maxLength: number) {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

export default function JoinQuizPage() {
  const router = useRouter();
  const params = useParams();
  const { t, language } = useLanguage();

  const rawAccessCode = params.accessCode ?? params.accesscode ?? "";
  const accessCode = String(
    Array.isArray(rawAccessCode) ? rawAccessCode[0] ?? "" : rawAccessCode
  )
    .trim()
    .toUpperCase();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const [studentName, setStudentName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [studentPin, setStudentPin] = useState("");

  const [pinResetView, setPinResetView] = useState<PinResetView>("normal");
  const [pinResetAttemptId, setPinResetAttemptId] = useState<string | null>(null);
  const [requestingReset, setRequestingReset] = useState(false);
  const [checkingResetStatus, setCheckingResetStatus] = useState(false);

  const [resetCode, setResetCode] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newPinConfirmation, setNewPinConfirmation] = useState("");
  const [resettingPin, setResettingPin] = useState(false);

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;

    async function loadQuiz() {
      if (!accessCode) {
        setLoading(false);
        return;
      }

      try {
        const data = await getQuizByAccessCode(accessCode);

        if (!cancelled) {
          setQuiz(data);
        }
      } catch (error) {
        console.error("Unable to load student quiz access:", error);

        if (!cancelled) {
          setMessage(t("joinQuiz.messages.loadError"));
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
  }, [accessCode, t]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const startMs = useMemo(() => {
    if (!quiz?.availableFrom) return null;

    const value = new Date(quiz.availableFrom).getTime();
    return Number.isNaN(value) ? null : value;
  }, [quiz?.availableFrom]);

  const endMs = useMemo(() => {
    if (!quiz?.availableUntil) return null;

    const value = new Date(quiz.availableUntil).getTime();
    return Number.isNaN(value) ? null : value;
  }, [quiz?.availableUntil]);

  const availabilityState: AvailabilityState = useMemo(() => {
    if (!quiz || quiz.status !== "launched" || endMs === null) {
      return "unavailable";
    }

    if (now >= endMs) {
      return "ended";
    }

    if (startMs !== null && now < startMs) {
      return "waiting";
    }

    return "available";
  }, [quiz, startMs, endMs, now]);

  const countdownLabel = useMemo(() => {
    if (availabilityState === "waiting" && startMs !== null) {
      return formatCountdown(startMs - now);
    }

    if (availabilityState === "available" && endMs !== null) {
      return formatCountdown(endMs - now);
    }

    return "";
  }, [availabilityState, startMs, endMs, now]);

  function getStartApiMessage(result: StartAttemptApiResponse) {
    switch (result.messageKey) {
      case "attempts.start.alreadySubmitted":
        return t("joinQuiz.messages.alreadySubmitted");

      case "attempts.start.alreadyGraded":
        return t("joinQuiz.messages.alreadyGraded");

      case "attempts.start.expired":
        return t("joinQuiz.messages.attemptExpired");

      case "attempts.pin.invalidFormat":
        return t("joinQuiz.pin.invalid");

      case "attempts.pin.incorrect":
        if (typeof result.attemptsRemaining === "number") {
          return `${t("joinQuiz.pin.incorrect")} ${t(
            "joinQuiz.pin.attemptsRemaining"
          )}: ${result.attemptsRemaining}`;
        }

        return t("joinQuiz.pin.incorrect");

      case "attempts.pin.locked":
        return t("joinQuiz.pin.locked");

      case "attempts.pin.resetRequired":
        return t("joinQuiz.pin.resetRequired");

      default:
        return result.message || t("joinQuiz.messages.startError");
    }
  }

  function getPinResetMessage(
    result: ApiBaseResponse & { attemptsRemaining?: number }
  ) {
    switch (result.messageKey) {
      case "attempts.pinReset.noActiveAttempt":
        return t("joinQuiz.pinReset.noActiveAttempt");

      case "attempts.pinReset.notInProgress":
        return t("joinQuiz.pinReset.notInProgress");

      case "attempts.pinReset.attemptExpired":
        return t("joinQuiz.pinReset.attemptExpired");

      case "attempts.pinReset.incorrectCode":
        if (typeof result.attemptsRemaining === "number") {
          return `${t("joinQuiz.pinReset.incorrectCode")} ${t(
            "joinQuiz.pin.attemptsRemaining"
          )}: ${result.attemptsRemaining}`;
        }

        return t("joinQuiz.pinReset.incorrectCode");

      case "attempts.pinReset.tooManyCodeAttempts":
        return t("joinQuiz.pinReset.tooManyCodeAttempts");

      case "attempts.pinReset.codeExpired":
        return t("joinQuiz.pinReset.codeExpired");

      case "attempts.pinReset.codeUnavailable":
        return t("joinQuiz.pinReset.codeUnavailable");

      case "attempts.pinReset.invalidCodeFormat":
        return t("joinQuiz.pinReset.invalidCode");

      case "attempts.pinReset.invalidNewPin":
        return t("joinQuiz.pinReset.invalidNewPin");

      case "attempts.pinReset.pinMismatch":
        return t("joinQuiz.pinReset.pinMismatch");

      case "attempts.pinReset.notApproved":
        return t("joinQuiz.pinReset.waitingMessage");

      default:
        return result.message || t("joinQuiz.pinReset.error");
    }
  }

  function getCleanEmail() {
    const cleanEmail = studentEmail.trim().toLowerCase();

    if (!cleanEmail) {
      setMessage(t("joinQuiz.validation.emailRequired"));
      return null;
    }

    if (!isValidEmail(cleanEmail)) {
      setMessage(t("joinQuiz.validation.invalidEmail"));
      return null;
    }

    return cleanEmail;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!quiz || submitting) return;

    setMessage("");

    const cleanName = studentName.trim();
    const cleanEmail = studentEmail.trim().toLowerCase();
    const cleanPin = studentPin.trim();

    if (!cleanName || cleanName.length < 2) {
      setMessage(t("joinQuiz.validation.nameRequired"));
      return;
    }

    if (!cleanEmail) {
      setMessage(t("joinQuiz.validation.emailRequired"));
      return;
    }

    if (!isValidEmail(cleanEmail)) {
      setMessage(t("joinQuiz.validation.invalidEmail"));
      return;
    }

    if (!isValidPin(cleanPin)) {
      setMessage(t("joinQuiz.pin.invalid"));
      return;
    }

    if (availabilityState !== "available") return;

    setSubmitting(true);

    try {
      const response = await fetch("/api/student-attempt/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          quizId: quiz.id,
          studentName: cleanName,
          studentEmail: cleanEmail,
          pin: cleanPin,
        }),
      });

      const result = (await response.json()) as StartAttemptApiResponse;

      if (!response.ok || !result.success || !result.attemptId) {
        setMessage(getStartApiMessage(result));
        return;
      }

      router.push(`/quiz-session/${result.attemptId}`);
    } catch (error) {
      console.error("Unable to start quiz:", error);
      setMessage(t("joinQuiz.messages.startError"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRequestPinReset() {
    if (
      !quiz ||
      requestingReset ||
      availabilityState !== "available"
    ) {
      return;
    }

    setMessage("");

    // The recovery identity is quizId + normalized email.
    // The student's name is deliberately NOT sent here.
    const cleanEmail = getCleanEmail();

    if (!cleanEmail) return;

    setRequestingReset(true);

    try {
      const response = await fetch(
        "/api/student-attempt/request-pin-reset",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            quizId: quiz.id,
            studentEmail: cleanEmail,
          }),
        }
      );

      const result =
        (await response.json()) as RequestPinResetApiResponse;

      if (!response.ok || !result.success || !result.attemptId) {
        setMessage(getPinResetMessage(result));
        return;
      }

      setPinResetAttemptId(result.attemptId);

      if (result.status === "approved") {
        setPinResetView("approved");
        setMessage(t("joinQuiz.pinReset.approvedMessage"));
        return;
      }

      setPinResetView("waiting");
      setMessage(t("joinQuiz.pinReset.requestSent"));
    } catch (error) {
      console.error("Unable to request PIN reset:", error);
      setMessage(t("joinQuiz.pinReset.error"));
    } finally {
      setRequestingReset(false);
    }
  }

  async function checkPinResetStatus() {
    if (
      !quiz ||
      pinResetView !== "waiting" ||
      checkingResetStatus
    ) {
      return;
    }

    const cleanEmail = studentEmail.trim().toLowerCase();

    if (!cleanEmail || !isValidEmail(cleanEmail)) return;

    setCheckingResetStatus(true);

    try {
      const response = await fetch(
        "/api/student-attempt/pin-reset-status",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            quizId: quiz.id,
            studentEmail: cleanEmail,
          }),
        }
      );

      const result =
        (await response.json()) as PinResetStatusApiResponse;

      if (!response.ok || !result.success) {
        return;
      }

      if (result.attemptId) {
        setPinResetAttemptId(result.attemptId);
      }

      if (result.status === "approved") {
        setPinResetView("approved");
        setMessage(t("joinQuiz.pinReset.approvedMessage"));
      }
    } catch (error) {
      console.error("Unable to check PIN reset status:", error);
    } finally {
      setCheckingResetStatus(false);
    }
  }

  useEffect(() => {
    if (pinResetView !== "waiting") return;

    const interval = window.setInterval(() => {
      void checkPinResetStatus();
    }, RESET_STATUS_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
    // checkPinResetStatus uses the latest render state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinResetView, quiz?.id, studentEmail]);

  async function handleResetPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!quiz || resettingPin) return;

    setMessage("");

    const cleanEmail = studentEmail.trim().toLowerCase();
    const cleanResetCode = resetCode.trim();
    const cleanNewPin = newPin.trim();
    const cleanConfirmation = newPinConfirmation.trim();

    if (!cleanEmail || !isValidEmail(cleanEmail)) {
      setMessage(t("joinQuiz.validation.invalidEmail"));
      return;
    }

    if (!isValidPin(cleanResetCode)) {
      setMessage(t("joinQuiz.pinReset.invalidCode"));
      return;
    }

    if (!isValidPin(cleanNewPin)) {
      setMessage(t("joinQuiz.pinReset.invalidNewPin"));
      return;
    }

    if (cleanNewPin !== cleanConfirmation) {
      setMessage(t("joinQuiz.pinReset.pinMismatch"));
      return;
    }

    setResettingPin(true);

    try {
      const response = await fetch("/api/student-attempt/reset-pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          quizId: quiz.id,
          studentEmail: cleanEmail,
          resetCode: cleanResetCode,
          newPin: cleanNewPin,
          newPinConfirmation: cleanConfirmation,
        }),
      });

      const result = (await response.json()) as ResetPinApiResponse;

      if (!response.ok || !result.success || !result.attemptId) {
        setMessage(getPinResetMessage(result));

        if (
          result.messageKey === "attempts.pinReset.codeExpired" ||
          result.messageKey === "attempts.pinReset.codeUnavailable" ||
          result.messageKey === "attempts.pinReset.tooManyCodeAttempts"
        ) {
          setPinResetView("normal");
          setPinResetAttemptId(null);
          setResetCode("");
          setNewPin("");
          setNewPinConfirmation("");
        }

        return;
      }

      router.push(`/quiz-session/${result.attemptId}`);
    } catch (error) {
      console.error("Unable to reset PIN:", error);
      setMessage(t("joinQuiz.pinReset.error"));
    } finally {
      setResettingPin(false);
    }
  }

  function handleBackToPin() {
    setPinResetView("normal");
    setResetCode("");
    setNewPin("");
    setNewPinConfirmation("");
    setMessage("");
  }

  if (loading) {
    return (
      <>
        <AppLoading
          title="ULearn"
          subtitle={t("joinQuiz.loading")}
        />
        <HelpSupport context="anonymous" />
      </>
    );
  }

  if (submitting || resettingPin) {
    return (
      <>
        <AppLoading
          title={
            resettingPin
              ? t("joinQuiz.pinReset.resettingTitle")
              : t("joinQuiz.starting.title")
          }
          subtitle={
            resettingPin
              ? t("joinQuiz.pinReset.resettingSubtitle")
              : t("joinQuiz.starting.subtitle")
          }
        />
        <HelpSupport context="anonymous" />
      </>
    );
  }

  if (!quiz) {
    return (
      <>
        <main className={styles.page}>
          <section className={styles.errorCard}>
            <span className={styles.badge}>ULearn</span>
            <h1>{t("joinQuiz.notFound.title")}</h1>
            <p>{t("joinQuiz.notFound.text")}</p>
            <strong className={styles.accessCode}>
              {accessCode}
            </strong>
          </section>
        </main>
        <HelpSupport context="anonymous" />
      </>
    );
  }

  const timeZone = quiz.timeZone || "America/Toronto";

  return (
    <>
      <main className={styles.page}>
        <section className={styles.card}>
          <header className={styles.top}>
            <div className={styles.brand}>
              <span className={styles.brandIcon}>U</span>
              <strong>ULearn</strong>
            </div>

            <span className={styles.codeBadge}>
              {accessCode}
            </span>
          </header>

          <section className={styles.hero}>
            <span className={styles.badge}>
              {t("joinQuiz.badge")}
            </span>

            <h1>{quiz.title}</h1>

            {quiz.createdByName && (
              <div className={styles.createdBy}>
                <span>
                  {t("joinQuiz.teacher.createdBy")}
                </span>
                <strong>{quiz.createdByName}</strong>
              </div>
            )}

            <p className={styles.description}>
              {quiz.description ||
                t("joinQuiz.noDescription")}
            </p>
          </section>

          {availabilityState === "waiting" && (
            <section className={styles.stateBox}>
              <span>{t("joinQuiz.waiting.label")}</span>
              <strong className={styles.countdown}>
                {countdownLabel}
              </strong>
              <p>{t("joinQuiz.waiting.text")}</p>
            </section>
          )}

          {availabilityState === "ended" && (
            <section className={styles.stateBox}>
              <strong>{t("joinQuiz.ended.title")}</strong>
              <p>{t("joinQuiz.ended.text")}</p>
            </section>
          )}

          {availabilityState === "unavailable" && (
            <section className={styles.stateBox}>
              <strong>
                {t("joinQuiz.unavailable.title")}
              </strong>
              <p>{t("joinQuiz.unavailable.text")}</p>
            </section>
          )}

          <section className={styles.summary}>
            <article>
              <span>
                {t("joinQuiz.summary.questions")}
              </span>
              <strong>{quiz.targetQuestions}</strong>
            </article>

            <article>
              <span>{t("joinQuiz.summary.points")}</span>
              <strong>{quiz.totalPoints}</strong>
            </article>

            <article>
              <span>
                {quiz.availabilityMode === "open_window"
                  ? t("joinQuiz.summary.timePerStudent")
                  : t("joinQuiz.summary.sessionDuration")}
              </span>
              <strong>
                {formatQuizDuration(
                  quiz.timeLimitMinutes,
                  language
                )}
              </strong>
            </article>

            <article>
              <span>{t("joinQuiz.summary.mode")}</span>
              <strong>
                {quiz.availabilityMode === "open_window"
                  ? t("joinQuiz.modes.openWindow")
                  : t("joinQuiz.modes.scheduledSession")}
              </strong>
            </article>

            <article>
              <span>{t("joinQuiz.summary.starts")}</span>
              <strong>
                {quiz.availableFrom
                  ? formatInTimeZone(
                      quiz.availableFrom,
                      timeZone
                    )
                  : t("joinQuiz.summary.immediately")}
              </strong>
            </article>

            <article>
              <span>{t("joinQuiz.summary.ends")}</span>
              <strong>
                {quiz.availableUntil
                  ? formatInTimeZone(
                      quiz.availableUntil,
                      timeZone
                    )
                  : t("joinQuiz.summary.notSet")}
              </strong>
            </article>

            <article>
              <span>{t("joinQuiz.summary.timeZone")}</span>
              <strong>{timeZone}</strong>
            </article>

            {availabilityState === "available" && (
              <article>
                <span>
                  {t("joinQuiz.summary.timeRemaining")}
                </span>
                <strong className={styles.countdown}>
                  {countdownLabel}
                </strong>
              </article>
            )}
          </section>

          <section className={styles.studentSection}>
            <div className={styles.studentHeading}>
              <span className={styles.badge}>
                {t("joinQuiz.student.badge")}
              </span>

              <h2>
                {pinResetView === "normal"
                  ? t("joinQuiz.student.title")
                  : t("joinQuiz.pinReset.title")}
              </h2>

              <p>
                {pinResetView === "normal"
                  ? t("joinQuiz.student.description")
                  : pinResetView === "waiting"
                    ? t(
                        "joinQuiz.pinReset.waitingDescription"
                      )
                    : t(
                        "joinQuiz.pinReset.approvedDescription"
                      )}
              </p>
            </div>

            {pinResetView === "normal" && (
              <form
                className={styles.form}
                onSubmit={handleSubmit}
              >
                <label htmlFor="student-name">
                  {t("joinQuiz.student.name")}
                  <input
                    id="student-name"
                    name="studentName"
                    type="text"
                    value={studentName}
                    maxLength={120}
                    required
                    autoComplete="name"
                    placeholder={t(
                      "joinQuiz.student.namePlaceholder"
                    )}
                    disabled={
                      availabilityState !== "available" ||
                      submitting
                    }
                    onChange={(event) => {
                      setStudentName(event.target.value);
                      setMessage("");
                    }}
                  />
                </label>

                <label htmlFor="student-email">
                  {t("joinQuiz.student.email")}
                  <input
                    id="student-email"
                    name="studentEmail"
                    type="email"
                    value={studentEmail}
                    maxLength={200}
                    required
                    autoComplete="email"
                    inputMode="email"
                    placeholder={t(
                      "joinQuiz.student.emailPlaceholder"
                    )}
                    disabled={
                      availabilityState !== "available" ||
                      submitting
                    }
                    onChange={(event) => {
                      setStudentEmail(event.target.value);
                      setMessage("");
                    }}
                  />
                </label>

                <label
                  htmlFor="student-pin"
                  className={`${styles.pinField} ${styles.pinBlock}`}
                >
                  {t("joinQuiz.pin.label")}
                  <input
                    id="student-pin"
                    name="studentPin"
                    type="password"
                    value={studentPin}
                    required
                    minLength={STUDENT_PIN_LENGTH}
                    maxLength={STUDENT_PIN_LENGTH}
                    inputMode="numeric"
                    autoComplete="off"
                    pattern="[0-9]{6}"
                    placeholder="••••••"
                    disabled={
                      availabilityState !== "available" ||
                      submitting
                    }
                    onChange={(event) => {
                      setStudentPin(
                        onlyDigits(
                          event.target.value,
                          STUDENT_PIN_LENGTH
                        )
                      );
                      setMessage("");
                    }}
                  />
                  <small>{t("joinQuiz.pin.help")}</small>
                </label>

                <div className={styles.pinInfo}>
                  <strong>
                    {t("joinQuiz.pin.infoTitle")}
                  </strong>
                  <p>{t("joinQuiz.pin.infoText")}</p>
                </div>

                <div className={styles.pinActions}>
                  <button
                    type="button"
                    className={styles.forgotPinButton}
                    disabled={
                      availabilityState !== "available" ||
                      requestingReset
                    }
                    onClick={() => {
                      void handleRequestPinReset();
                    }}
                  >
                    {requestingReset
                      ? t("joinQuiz.pinReset.requesting")
                      : t("joinQuiz.pinReset.forgotPin")}
                  </button>
                </div>

                {message && (
                  <p
                    className={styles.message}
                    role="alert"
                  >
                    {message}
                  </p>
                )}

                <button
                  type="submit"
                  className="app-button app-button-action"
                  disabled={
                    availabilityState !== "available" ||
                    submitting ||
                    requestingReset
                  }
                >
                  {t("joinQuiz.student.start")}
                </button>
              </form>
            )}

            {pinResetView === "waiting" && (
              <div className={styles.resetPanel}>
                <div
                  className={styles.waitingIcon}
                  aria-hidden="true"
                >
                  …
                </div>

                <div className={styles.resetPanelContent}>
                  <strong>
                    {t("joinQuiz.pinReset.waitingTitle")}
                  </strong>

                  <p>
                    {t("joinQuiz.pinReset.waitingMessage")}
                  </p>

                  <div className={styles.resetIdentity}>
                    <span>
                      {t("joinQuiz.student.email")}
                    </span>
                    <strong>
                      {studentEmail.trim().toLowerCase()}
                    </strong>
                  </div>

                  {pinResetAttemptId && (
                    <p className={styles.resetStatus}>
                      {checkingResetStatus
                        ? t("joinQuiz.pinReset.checking")
                        : t(
                            "joinQuiz.pinReset.waitingStatus"
                          )}
                    </p>
                  )}
                </div>

                {message && (
                  <p
                    className={styles.message}
                    role="status"
                  >
                    {message}
                  </p>
                )}

                <div className={styles.resetActions}>
                  <button
                    type="button"
                    className="app-button app-button-action"
                    disabled={checkingResetStatus}
                    onClick={() => {
                      void checkPinResetStatus();
                    }}
                  >
                    {t("joinQuiz.pinReset.checkNow")}
                  </button>

                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={handleBackToPin}
                  >
                    {t("joinQuiz.pinReset.back")}
                  </button>
                </div>
              </div>
            )}

            {pinResetView === "approved" && (
              <form
                className={styles.resetForm}
                onSubmit={handleResetPin}
              >
                <div className={styles.approvedBox}>
                  <strong>
                    {t("joinQuiz.pinReset.approvedTitle")}
                  </strong>
                  <p>
                    {t("joinQuiz.pinReset.approvedMessage")}
                  </p>
                </div>

                <label htmlFor="reset-code">
                  {t("joinQuiz.pinReset.codeLabel")}
                  <input
                    id="reset-code"
                    name="resetCode"
                    type="text"
                    value={resetCode}
                    required
                    minLength={RESET_CODE_LENGTH}
                    maxLength={RESET_CODE_LENGTH}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    placeholder="000000"
                    onChange={(event) => {
                      setResetCode(
                        onlyDigits(
                          event.target.value,
                          RESET_CODE_LENGTH
                        )
                      );
                      setMessage("");
                    }}
                  />
                  <small>
                    {t("joinQuiz.pinReset.codeHelp")}
                  </small>
                </label>

                <label htmlFor="new-pin">
                  {t("joinQuiz.pinReset.newPinLabel")}
                  <input
                    id="new-pin"
                    name="newPin"
                    type="password"
                    value={newPin}
                    required
                    minLength={STUDENT_PIN_LENGTH}
                    maxLength={STUDENT_PIN_LENGTH}
                    inputMode="numeric"
                    autoComplete="new-password"
                    pattern="[0-9]{6}"
                    placeholder="••••••"
                    onChange={(event) => {
                      setNewPin(
                        onlyDigits(
                          event.target.value,
                          STUDENT_PIN_LENGTH
                        )
                      );
                      setMessage("");
                    }}
                  />
                </label>

                <label htmlFor="new-pin-confirmation">
                  {t("joinQuiz.pinReset.confirmPinLabel")}
                  <input
                    id="new-pin-confirmation"
                    name="newPinConfirmation"
                    type="password"
                    value={newPinConfirmation}
                    required
                    minLength={STUDENT_PIN_LENGTH}
                    maxLength={STUDENT_PIN_LENGTH}
                    inputMode="numeric"
                    autoComplete="new-password"
                    pattern="[0-9]{6}"
                    placeholder="••••••"
                    onChange={(event) => {
                      setNewPinConfirmation(
                        onlyDigits(
                          event.target.value,
                          STUDENT_PIN_LENGTH
                        )
                      );
                      setMessage("");
                    }}
                  />
                </label>

                {message && (
                  <p
                    className={styles.message}
                    role="alert"
                  >
                    {message}
                  </p>
                )}

                <div className={styles.resetActions}>
                  <button
                    type="submit"
                    className="app-button app-button-action"
                    disabled={resettingPin}
                  >
                    {t("joinQuiz.pinReset.resetButton")}
                  </button>

                  <button
                    type="button"
                    className={styles.secondaryButton}
                    disabled={resettingPin}
                    onClick={handleBackToPin}
                  >
                    {t("joinQuiz.pinReset.back")}
                  </button>
                </div>
              </form>
            )}
          </section>
        </section>
      </main>

      <HelpSupport context="anonymous" />
    </>
  );
}
