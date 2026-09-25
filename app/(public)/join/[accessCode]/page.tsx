"use client";



import {

  FormEvent,

  useCallback,

  useEffect,

  useRef,

  useState,

} from "react";

import { useParams, useRouter } from "next/navigation";

import {

  Clock3,

  Eye,

  EyeOff,

  KeyRound,

  LockKeyhole,

  Mail,

  RotateCcwKey,

  UserRound,

} from "lucide-react";



import AppLoading from "@/components/AppLoading";

import HelpSupport from "@/components/HelpSupport";

import { useLanguage } from "@/hooks/useLanguage";

import {

  getQuizByAccessCode,

  type Quiz,

} from "@/lib/services/quizzes";



import styles from "./JoinQuizPage.module.css";



/* =========================================================

   Types

   ========================================================= */



type JoinStep =

  | "identity"

  | "new"

  | "existing"

  | "completed"

  | "reset";



type LookupMode =

  | "new"

  | "existing"

  | "completed";



type AttemptStatus =

  | "submitted"

  | "graded";



type ResetStatus =

  | "pending"

  | "approved"

  | null;



type ApiResponseBase = {

  success: boolean;

  messageKey?: string;

  message?: string;

};



type LookupResponse = ApiResponseBase & {

  mode?: LookupMode;

  status?: AttemptStatus;

  attemptId?: string;

};



type StartResponse = ApiResponseBase & {

  attemptId?: string;

  status?: AttemptStatus;

  authenticationRequired?: boolean;

  locked?: boolean;

  lockedUntil?: string | null;

  lockRemainingSeconds?: number;

  attemptsRemaining?: number;

};



type ResetRequestResponse = ApiResponseBase & {

  status?: ResetStatus;

  attemptId?: string;

};



type ResetStatusResponse = ApiResponseBase & {

  status?: ResetStatus;

  attemptId?: string;

};



type ResetPinResponse = ApiResponseBase & {

  attemptId?: string;

  studentName?: string;

  attemptsRemaining?: number;

};



type PinFieldProps = {

  label: string;

  value: string;

  setValue: (value: string) => void;

  visible: boolean;

  setVisible: (value: boolean) => void;

  styles: Record<string, string>;

  showLabel: string;

  hideLabel: string;

  disabled?: boolean;

};



/* =========================================================

   Constants

   ========================================================= */



const PIN_LENGTH = 6;

const RESET_STATUS_POLL_MS = 5000;

const LOCAL_SESSION_PREFIX =
  "ulearn:quiz-session:";

function getLocalSessionKey(
  attemptId: string
) {
  return `${LOCAL_SESSION_PREFIX}${attemptId}`;
}

function createLocalQuizSession(
  attemptId: string
) {
  try {
    window.localStorage.setItem(
      getLocalSessionKey(attemptId),
      JSON.stringify({
        attemptId,
        currentIndex: 0,
        answers: {},
        savedAt: new Date().toISOString(),
      })
    );

    return true;
  } catch (error) {
    console.error(
      "Unable to create local quiz session:",
      error
    );

    return false;
  }
}

function hasLocalQuizSession(
  attemptId: string
) {
  try {
    const raw =
      window.localStorage.getItem(
        getLocalSessionKey(attemptId)
      );

    if (!raw) {
      return false;
    }

    const parsed =
      JSON.parse(raw) as {
        attemptId?: unknown;
        currentIndex?: unknown;
        answers?: unknown;
      };

    return (
      parsed.attemptId === attemptId &&
      typeof parsed.currentIndex === "number" &&
      parsed.answers !== null &&
      typeof parsed.answers === "object"
    );
  } catch (error) {
    console.error(
      "Unable to read local quiz session:",
      error
    );

    return false;
  }
}



/* =========================================================

   Helpers

   ========================================================= */



function normalizeEmail(value: string) {

  return value.trim().toLowerCase();

}



function onlyDigits(value: string) {

  return value.replace(/\D/g, "");

}



function isValidEmail(email: string) {

  return /^[^\s@]+@[^\s@]+.[^\s@]+$/.test(email);

}



function isValidPin(pin: string) {

  return /^\d{6}$/.test(pin);

}



/**

 * Safely parse an API response.

 *

 * If Next.js returns an HTML error page instead of JSON,

 * this prevents response.json() from throwing:

 *

 * JSON.parse: unexpected character at line 1 column 1

 */

async function readApiResponse<T extends ApiResponseBase>(

  response: Response

): Promise<T | null> {

  try {

    const contentType =

      response.headers.get("content-type") ?? "";



    if (!contentType.includes("application/json")) {

      const text = await response.text();



      console.error(

        "API returned a non-JSON response:",

        response.status,

        text.slice(0, 500)

      );



      return null;

    }



    return (await response.json()) as T;

  } catch (error) {

    console.error(

      "Unable to parse API response:",

      error

    );



    return null;

  }

}



/* =========================================================

   Page

   ========================================================= */



export default function JoinQuizPage() {

  const params = useParams<{

    accessCode: string;

  }>();



  const router = useRouter();

  const { t } = useLanguage();



  const accessCode =

    typeof params.accessCode === "string"

      ? params.accessCode

      : "";



  /* =======================================================

     Quiz

     ======================================================= */



  const [quiz, setQuiz] =

    useState<Quiz | null>(null);



  const [loadingQuiz, setLoadingQuiz] =

    useState(true);



  const [quizError, setQuizError] =

    useState("");



  const [now, setNow] =

    useState(() => Date.now());



  /* =======================================================

     Join flow

     ======================================================= */



  const [step, setStep] =

    useState<JoinStep>("identity");



  const [studentName, setStudentName] =

    useState("");



  const [studentEmail, setStudentEmail] =

    useState("");



  const [pin, setPin] =

    useState("");



  const [confirmPin, setConfirmPin] =

    useState("");



  const [showPin, setShowPin] =

    useState(false);



  const [

    showConfirmPin,

    setShowConfirmPin,

  ] = useState(false);



  const [busy, setBusy] =

    useState(false);



  const [error, setError] =

    useState("");



  /* =======================================================

     Completed attempt

     ======================================================= */



  const [

    completedAttemptId,

    setCompletedAttemptId,

  ] = useState("");



  const [

    completedStatus,

    setCompletedStatus,

  ] = useState<AttemptStatus | null>(

    null

  );



  /* =======================================================

     PIN reset

     ======================================================= */



  const [resetStatus, setResetStatus] =

    useState<ResetStatus>(null);



  const [

    temporaryCode,

    setTemporaryCode,

  ] = useState("");



  const [newPin, setNewPin] =

    useState("");



  const [

    confirmNewPin,

    setConfirmNewPin,

  ] = useState("");



  const [

    showTemporaryCode,

    setShowTemporaryCode,

  ] = useState(false);



  const [

    showNewPin,

    setShowNewPin,

  ] = useState(false);



  const [

    showConfirmNewPin,

    setShowConfirmNewPin,

  ] = useState(false);



  const pollingRef =

    useRef<ReturnType<typeof setInterval> | null>(

      null

    );



  /* =======================================================

     Translation helper

     ======================================================= */



  const translateOrFallback = useCallback(

    (

      key: string,

      fallback: string

    ) => {

      try {

        const translated = t(key);



        if (

          !translated ||

          translated === key

        ) {

          return fallback;

        }



        return translated;

      } catch {

        return fallback;

      }

    },

    [t]

  );



  const getMessage = useCallback(

    (

      messageKey: string | undefined,

      fallback: string

    ) => {

      if (!messageKey) {

        return fallback;

      }



      try {

        const translated =

          t(messageKey);



        if (

          !translated ||

          translated === messageKey

        ) {

          return fallback;

        }



        return translated;

      } catch {

        return fallback;

      }

    },

    [t]

  );



  /* =======================================================

     Localized duration helpers

     ======================================================= */



  const formatDuration = useCallback(

    (minutes: number) => {

      if (

        !Number.isFinite(minutes) ||

        minutes <= 0

      ) {

        return "—";

      }



      if (minutes < 60) {

        return `${minutes} ${translateOrFallback(

          "join.time.minutesShort",

          "min"

        )}`;

      }



      const hours =

        Math.floor(minutes / 60);



      const remainingMinutes =

        minutes % 60;



      const hourLabel =

        translateOrFallback(

          "join.time.hoursShort",

          "h"

        );



      const minuteLabel =

        translateOrFallback(

          "join.time.minutesShort",

          "min"

        );



      if (remainingMinutes === 0) {

        return `${hours} ${hourLabel}`;

      }



      return `${hours} ${hourLabel} ${remainingMinutes} ${minuteLabel}`;

    },

    [translateOrFallback]

  );



  const formatCountdown = useCallback(

    (milliseconds: number) => {

      const totalSeconds =

        Math.max(

          0,

          Math.ceil(

            milliseconds / 1000

          )

        );



      const days =

        Math.floor(

          totalSeconds / 86400

        );



      const hours =

        Math.floor(

          (totalSeconds % 86400) /

            3600

        );



      const minutes =

        Math.floor(

          (totalSeconds % 3600) /

            60

        );



      const seconds =

        totalSeconds % 60;



      const hh =

        String(hours).padStart(

          2,

          "0"

        );



      const mm =

        String(minutes).padStart(

          2,

          "0"

        );



      const ss =

        String(seconds).padStart(

          2,

          "0"

        );



      if (days > 0) {

        const dayLabel =

          translateOrFallback(

            "join.time.daysShort",

            "d"

          );



        return `${days} ${dayLabel} ${hh}:${mm}:${ss}`;

      }



      return `${hh}:${mm}:${ss}`;

    },

    [translateOrFallback]

  );



  /* =======================================================

     Live clock

     ======================================================= */



  useEffect(() => {

    const interval =

      window.setInterval(() => {

        setNow(Date.now());

      }, 1000);



    return () => {

      window.clearInterval(interval);

    };

  }, []);



  /* =======================================================

     Load quiz

     ======================================================= */



  useEffect(() => {

    let cancelled = false;



    async function loadQuiz() {

      if (!accessCode) {

        setQuizError(

          t("join.errors.invalidQuiz")

        );



        setLoadingQuiz(false);

        return;

      }



      try {

        setLoadingQuiz(true);

        setQuizError("");



        const foundQuiz =

          await getQuizByAccessCode(

            accessCode

          );



        if (cancelled) {

          return;

        }



        if (!foundQuiz) {

          setQuizError(

            t(

              "join.errors.quizNotFound"

            )

          );



          return;

        }



        setQuiz(foundQuiz);

      } catch (loadError) {

        console.error(

          "Unable to load quiz:",

          loadError

        );



        if (!cancelled) {

          setQuizError(

            t("join.errors.generic")

          );

        }

      } finally {

        if (!cancelled) {

          setLoadingQuiz(false);

        }

      }

    }



    void loadQuiz();



    return () => {

      cancelled = true;

    };

  }, [

    accessCode,

    t,

  ]);



  /* =======================================================

     PIN reset polling cleanup

     ======================================================= */



  const stopResetPolling =

    useCallback(() => {

      if (pollingRef.current) {

        clearInterval(

          pollingRef.current

        );



        pollingRef.current = null;

      }

    }, []);



  useEffect(() => {

    return () => {

      stopResetPolling();

    };

  }, [stopResetPolling]);



  /* =======================================================

     Quiz availability

     ======================================================= */



  const availableFromMs =

    quiz?.availableFrom

      ? new Date(

          quiz.availableFrom

        ).getTime()

      : null;



  const availableUntilMs =

    quiz?.availableUntil

      ? new Date(

          quiz.availableUntil

        ).getTime()

      : null;



  const validAvailableFromMs =

    availableFromMs !== null &&

    Number.isFinite(

      availableFromMs

    )

      ? availableFromMs

      : null;



  const validAvailableUntilMs =

    availableUntilMs !== null &&

    Number.isFinite(

      availableUntilMs

    )

      ? availableUntilMs

      : null;



  const quizHasStarted =

    validAvailableFromMs === null ||

    now >= validAvailableFromMs;



  const quizHasEnded =

    quiz?.status === "closed" ||

    (

      validAvailableUntilMs !==

        null &&

      now >= validAvailableUntilMs

    );



  const quizAvailable =

    quiz?.status === "launched" &&

    quizHasStarted &&

    !quizHasEnded;



  const countdownTarget =

    !quizHasStarted &&

    validAvailableFromMs !== null

      ? validAvailableFromMs

      : !quizHasEnded &&

          validAvailableUntilMs !==

            null

        ? validAvailableUntilMs

        : null;



  const countdown =

    countdownTarget !== null

      ? formatCountdown(

          countdownTarget - now

        )

      : null;



  function getAvailabilityLabel() {

    if (!quiz) {

      return "";

    }



    if (quizHasEnded) {

      return t(

        "join.availability.ended"

      );

    }



    if (!quizHasStarted) {

      return t(

        "join.availability.startsIn"

      );

    }



    if (

      validAvailableUntilMs !==

      null

    ) {

      return t(

        "join.availability.remaining"

      );

    }



    return t(

      "join.availability.available"

    );

  }



  /* =======================================================

     Identity lookup

     ======================================================= */



  async function handleIdentitySubmit(

    event: FormEvent<HTMLFormElement>

  ) {

    event.preventDefault();



    if (

      !quiz ||

      busy ||

      !quizAvailable

    ) {

      return;

    }



    setError("");



    const cleanName =

      studentName.trim();



    const cleanEmail =

      normalizeEmail(

        studentEmail

      );



    if (cleanName.length < 2) {

      setError(

        t(

          "join.errors.invalidName"

        )

      );



      return;

    }



    if (

      !isValidEmail(cleanEmail)

    ) {

      setError(

        t(

          "join.errors.invalidEmail"

        )

      );



      return;

    }



    try {

      setBusy(true);



      const response =

        await fetch(

          "/api/student-attempt/lookup",

          {

            method: "POST",



            headers: {

              "Content-Type":

                "application/json",

            },



            cache: "no-store",



            body: JSON.stringify({

              quizId: quiz.id,

              studentName:

                cleanName,

              studentEmail:

                cleanEmail,

            }),

          }

        );



      const data =

        await readApiResponse<LookupResponse>(

          response

        );



      if (!data) {

        setError(

          t(

            "join.errors.generic"

          )

        );



        return;

      }



      if (

        !response.ok ||

        !data.success

      ) {

        setError(

          getMessage(

            data.messageKey,

            data.message ||

              t(

                "join.errors.generic"

              )

          )

        );



        return;

      }



      setStudentName(

        cleanName

      );



      setStudentEmail(

        cleanEmail

      );



      setPin("");

      setConfirmPin("");



      if (

        data.mode === "new"

      ) {

        setStep("new");

        return;

      }



      if (

        data.mode ===

        "existing"

      ) {

        setStep("existing");

        return;

      }



      if (

        data.mode ===

          "completed" &&

        data.attemptId &&

        data.status

      ) {

        setCompletedAttemptId(

          data.attemptId

        );



        setCompletedStatus(

          data.status

        );



        setStep("completed");



        return;

      }



      setError(

        t(

          "join.errors.generic"

        )

      );

    } catch (lookupError) {

      console.error(

        "Student lookup failed:",

        lookupError

      );



      setError(

        t(

          "join.errors.generic"

        )

      );

    } finally {

      setBusy(false);

    }

  }



  /* =======================================================

     Create new attempt

     ======================================================= */



  async function handleCreateAttempt(

    event: FormEvent<HTMLFormElement>

  ) {

    event.preventDefault();



    if (

      !quiz ||

      busy ||

      !quizAvailable

    ) {

      return;

    }



    setError("");



    if (!isValidPin(pin)) {

      setError(

        t("join.pin.invalid")

      );



      return;

    }



    if (pin !== confirmPin) {

      setError(

        t("join.pin.mismatch")

      );



      return;

    }



    try {

      setBusy(true);



      const response =

        await fetch(

          "/api/student-attempt/start",

          {

            method: "POST",



            headers: {

              "Content-Type":

                "application/json",

            },



            cache: "no-store",



            body: JSON.stringify({

              quizId: quiz.id,

              studentName,

              studentEmail,

              pin,

            }),

          }

        );



      const data =

        await readApiResponse<StartResponse>(

          response

        );



      if (!data) {

        setError(

          t(

            "join.errors.generic"

          )

        );



        return;

      }



      if (

        !response.ok ||

        !data.success

      ) {

        /*

         * Another request may have

         * created the credential

         * between lookup and start.

         */

        if (

          data.authenticationRequired

        ) {

          setPin("");

          setConfirmPin("");

          setStep("existing");



          return;

        }



        setError(

          getMessage(

            data.messageKey,

            data.message ||

              t(

                "join.errors.generic"

              )

          )

        );



        return;

      }



      if (!data.attemptId) {

        setError(

          t(

            "join.errors.generic"

          )

        );



        return;

      }



      const localSessionCreated =
        createLocalQuizSession(
          data.attemptId
        );

      if (!localSessionCreated) {
        setError(
          t(
            "join.errors.generic"
          )
        );

        return;
      }

      router.push(

        `/quiz-session/${data.attemptId}`

      );

    } catch (startError) {

      console.error(

        "Unable to start quiz:",

        startError

      );



      setError(

        t(

          "join.errors.generic"

        )

      );

    } finally {

      setBusy(false);

    }

  }



  /* =======================================================

     Resume existing attempt

     ======================================================= */



  async function handleResumeAttempt(

    event: FormEvent<HTMLFormElement>

  ) {

    event.preventDefault();



    if (!quiz || busy) {

      return;

    }



    setError("");



    if (!isValidPin(pin)) {

      setError(

        t("join.pin.invalid")

      );



      return;

    }



    try {

      setBusy(true);



      const response =

        await fetch(

          "/api/student-attempt/start",

          {

            method: "POST",



            headers: {

              "Content-Type":

                "application/json",

            },



            cache: "no-store",



            body: JSON.stringify({

              quizId: quiz.id,

              studentName,

              studentEmail,

              pin,

            }),

          }

        );



      const data =

        await readApiResponse<StartResponse>(

          response

        );



      if (!data) {

        setError(

          t(

            "join.errors.generic"

          )

        );



        return;

      }



      if (

        !response.ok ||

        !data.success

      ) {

        if (data.locked) {

          const seconds =

            Math.max(

              0,

              data.lockRemainingSeconds ??

                0

            );



          const minutes =

            Math.max(

              1,

              Math.ceil(

                seconds / 60

              )

            );



          const template =

            t("join.pin.locked");



          /*

           * Supports both the old

           * {minutes} translation

           * and a possible {seconds}

           * translation.

           */

          setError(

            template

              .replace(

                "{minutes}",

                String(minutes)

              )

              .replace(

                "{seconds}",

                String(seconds)

              )

          );



          return;

        }



        if (

          data.status ===

            "submitted" ||

          data.status === "graded"

        ) {

          if (data.attemptId) {

            setCompletedAttemptId(

              data.attemptId

            );

          }



          setCompletedStatus(

            data.status

          );



          setStep("completed");



          return;

        }



        setError(

          getMessage(

            data.messageKey,

            data.message ||

              t(

                "join.pin.incorrect"

              )

          )

        );



        return;

      }



      if (!data.attemptId) {

        setError(

          t(

            "join.errors.generic"

          )

        );



        return;

      }



      if (
        !hasLocalQuizSession(
          data.attemptId
        )
      ) {
        setError(
          t(
            "join.errors.missingLocalSession"
          )
        );

        return;
      }

      router.push(

        `/quiz-session/${data.attemptId}`

      );

    } catch (resumeError) {

      console.error(

        "Unable to resume attempt:",

        resumeError

      );



      setError(

        t(

          "join.errors.generic"

        )

      );

    } finally {

      setBusy(false);

    }

  }



  /* =======================================================

     Check PIN reset status

     ======================================================= */



  const checkResetStatus =

    useCallback(async () => {

      if (

        !quiz ||

        !studentEmail

      ) {

        return;

      }



      try {

        const response =

          await fetch(

            "/api/student-attempt/pin-reset-status",

            {

              method: "POST",



              headers: {

                "Content-Type":

                  "application/json",

              },



              cache: "no-store",



              body: JSON.stringify({

                quizId: quiz.id,

                studentEmail,

              }),

            }

          );



        const data =

          await readApiResponse<ResetStatusResponse>(

            response

          );



        if (

          !data ||

          !response.ok ||

          !data.success

        ) {

          return;

        }



        const nextStatus =

          data.status ?? null;



        setResetStatus(

          nextStatus

        );



        if (

          nextStatus ===

          "approved"

        ) {

          stopResetPolling();

        }

      } catch (statusError) {

        console.error(

          "Unable to check PIN reset status:",

          statusError

        );

      }

    }, [

      quiz,

      studentEmail,

      stopResetPolling,

    ]);



  /* =======================================================

     Poll PIN reset status

     ======================================================= */



  useEffect(() => {

    if (

      step !== "reset" ||

      resetStatus ===

        "approved"

    ) {

      stopResetPolling();



      return;

    }



    void checkResetStatus();



    pollingRef.current =

      setInterval(() => {

        void checkResetStatus();

      }, RESET_STATUS_POLL_MS);



    return () => {

      stopResetPolling();

    };

  }, [

    step,

    resetStatus,

    checkResetStatus,

    stopResetPolling,

  ]);



  /* =======================================================

     Request PIN reset

     ======================================================= */



  async function handleRequestReset() {

    if (!quiz || busy) {

      return;

    }



    setError("");



    try {

      setBusy(true);



      const response =

        await fetch(

          "/api/student-attempt/request-pin-reset",

          {

            method: "POST",



            headers: {

              "Content-Type":

                "application/json",

            },



            cache: "no-store",



            body: JSON.stringify({

              quizId: quiz.id,

              studentEmail,

            }),

          }

        );



      const data =

        await readApiResponse<ResetRequestResponse>(

          response

        );



      if (!data) {

        setError(

          t(

            "join.errors.generic"

          )

        );



        return;

      }



      if (

        !response.ok ||

        !data.success

      ) {

        setError(

          getMessage(

            data.messageKey,

            data.message ||

              t(

                "join.errors.generic"

              )

          )

        );



        return;

      }



      setTemporaryCode("");

      setNewPin("");

      setConfirmNewPin("");



      setResetStatus(

        data.status ??

          "pending"

      );



      setStep("reset");

    } catch (resetError) {

      console.error(

        "Unable to request PIN reset:",

        resetError

      );



      setError(

        t(

          "join.errors.generic"

        )

      );

    } finally {

      setBusy(false);

    }

  }



  /* =======================================================

     Complete PIN reset

     ======================================================= */



  async function handleResetPin(

    event: FormEvent<HTMLFormElement>

  ) {

    event.preventDefault();



    if (!quiz || busy) {

      return;

    }



    setError("");



    if (

      !isValidPin(

        temporaryCode

      )

    ) {

      setError(

        t(

          "join.reset.invalidTemporaryCode"

        )

      );



      return;

    }



    if (

      !isValidPin(newPin)

    ) {

      setError(

        t("join.pin.invalid")

      );



      return;

    }



    if (

      newPin !==

      confirmNewPin

    ) {

      setError(

        t("join.pin.mismatch")

      );



      return;

    }



    try {

      setBusy(true);



      const response =

        await fetch(

          "/api/student-attempt/reset-pin",

          {

            method: "POST",



            headers: {

              "Content-Type":

                "application/json",

            },



            cache: "no-store",



            body: JSON.stringify({

              quizId: quiz.id,

              studentEmail,

              resetCode: temporaryCode,

              newPin,

              newPinConfirmation: confirmNewPin,

            }),

          }

        );



      const data =

        await readApiResponse<ResetPinResponse>(

          response

        );



      if (!data) {

        setError(

          t(

            "join.errors.generic"

          )

        );



        return;

      }



      if (

        !response.ok ||

        !data.success

      ) {

        setError(

          getMessage(

            data.messageKey,

            data.message ||

              t(

                "join.reset.invalidTemporaryCode"

              )

          )

        );



        return;

      }



      stopResetPolling();



      if (!data.attemptId) {

        setError(

          t(

            "join.errors.generic"

          )

        );



        return;

      }



      if (
        !hasLocalQuizSession(
          data.attemptId
        )
      ) {
        setError(
          t(
            "join.errors.missingLocalSession"
          )
        );

        return;
      }

      router.push(

        `/quiz-session/${data.attemptId}`

      );

    } catch (resetError) {

      console.error(

        "Unable to reset PIN:",

        resetError

      );



      setError(

        t(

          "join.errors.generic"

        )

      );

    } finally {

      setBusy(false);

    }

  }



  /* =======================================================

     Return to identity

     ======================================================= */



  function returnToIdentity() {

    stopResetPolling();



    setStep("identity");



    setPin("");

    setConfirmPin("");



    setShowPin(false);

    setShowConfirmPin(false);



    setError("");



    setResetStatus(null);



    setTemporaryCode("");

    setNewPin("");

    setConfirmNewPin("");



    setShowTemporaryCode(false);

    setShowNewPin(false);

    setShowConfirmNewPin(false);



    setCompletedAttemptId("");

    setCompletedStatus(null);

  }



  /* =======================================================

     Loading

     ======================================================= */



  if (loadingQuiz) {

    return <AppLoading />;

  }



  /* =======================================================

     Quiz unavailable

     ======================================================= */



  if (

    quizError ||

    !quiz

  ) {

    return (

      <main className={styles.page}>

        <section

          className={styles.card}

        >

          <div

            className={styles.error}

            role="alert"

          >

            {quizError ||

              t(

                "join.errors.quizNotFound"

              )}

          </div>

        </section>



        <HelpSupport />

      </main>

    );

  }



  /* =======================================================

     Render

     ======================================================= */



  return (

    <main className={styles.page}>

      <section

        className={styles.card}

      >

        {/* ================================================

            Header

            ================================================ */}



        <header

          className={

            styles.quizHeader

          }

        >

          <div

            className={

              styles.iconCircle

            }

          >

            <KeyRound

              size={26}

              aria-hidden="true"

            />

          </div>



          <div

            className={

              styles.quizHeaderContent

            }

          >

            <div className={styles.eyebrowRow}>

              <p

                className={

                  styles.eyebrow

                }

              >

                {t("join.quizLabel")}

              </p>

              <span

                className={styles.accessCodeBadge}

                aria-label={accessCode}

              >

                {accessCode.toUpperCase()}

              </span>

            </div>



            <h1

              className={

                styles.title

              }

            >

              {quiz.title}

            </h1>



            {quiz.createdByName && (

              <p

                className={

                  styles.teacher

                }

              >

                {t(

                  "join.createdBy"

                ).replace(

                  "{name}",

                  quiz.createdByName

                )}

              </p>

            )}

          </div>

        </header>



        {quiz.description && (

          <p

            className={

              styles.description

            }

          >

            {quiz.description}

          </p>

        )}



        {/* ================================================

            Quiz summary

            ================================================ */}



        <div

          className={

            styles.quizSummary

          }

        >

          <div

            className={

              styles.summaryItem

            }

          >

            <strong>

              {quiz.totalQuestions}

            </strong>



            <span>

              {t(

                "join.summary.questions"

              )}

            </span>

          </div>



          <div

            className={

              styles.summaryDivider

            }

            aria-hidden="true"

          />



          <div

            className={

              styles.summaryItem

            }

          >

            <strong>

              {quiz.totalPoints}

            </strong>



            <span>

              {t(

                "join.summary.points"

              )}

            </span>

          </div>



          <div

            className={

              styles.summaryDivider

            }

            aria-hidden="true"

          />



          <div

            className={

              styles.summaryItem

            }

          >

            <strong>

              {formatDuration(

                quiz.timeLimitMinutes

              )}

            </strong>



            <span>

              {t(

                "join.summary.duration"

              )}

            </span>

          </div>

        </div>



        {/* ================================================

            Availability / countdown

            ================================================ */}



        <div

          className={`${styles.availability} ${

            quizHasEnded

              ? styles.availabilityEnded

              : !quizHasStarted

                ? styles.availabilityWaiting

                : styles.availabilityActive

          }`}

          role="status"

          aria-live="polite"

        >

          <Clock3

            size={18}

            className={

              styles.clockIcon

            }

            aria-hidden="true"

          />



          <div

            className={

              styles.availabilityContent

            }

          >

            <span

              className={

                styles.availabilityLabel

              }

            >

              {getAvailabilityLabel()}

            </span>



            {countdown &&

              !quizHasEnded && (

                <strong

                  className={

                    styles.countdown

                  }

                >

                  {countdown}

                </strong>

              )}

          </div>

        </div>



        {/* ================================================

            Identity

            ================================================ */}



        {step === "identity" && (

          <>

            <div

              className={

                styles.infoBlock

              }

            >

              <div

                className={

                  styles.infoIcon

                }

              >

                <UserRound

                  size={21}

                  aria-hidden="true"

                />

              </div>



              <div>

                <h2

                  className={

                    styles.sectionTitle

                  }

                >

                  {t(

                    "join.identity.title"

                  )}

                </h2>



                <p

                  className={

                    styles.sectionText

                  }

                >

                  {t(

                    "join.identity.description"

                  )}

                </p>

              </div>

            </div>



            <form

              className={

                styles.form

              }

              onSubmit={

                handleIdentitySubmit

              }

            >

              <label

                className={

                  styles.field

                }

              >

                <span

                  className={

                    styles.label

                  }

                >

                  {t(

                    "join.identity.name"

                  )}

                </span>



                <div

                  className={

                    styles.inputWrapper

                  }

                >

                  <UserRound

                    className={

                      styles.inputIcon

                    }

                    size={18}

                    aria-hidden="true"

                  />



                  <input

                    className={

                      styles.input

                    }

                    type="text"

                    value={

                      studentName

                    }

                    onChange={(

                      event

                    ) =>

                      setStudentName(

                        event.target

                          .value

                      )

                    }

                    placeholder={t(

                      "join.identity.namePlaceholder"

                    )}

                    autoComplete="name"

                    disabled={

                      busy ||

                      !quizAvailable

                    }

                    required

                  />

                </div>

              </label>



              <label

                className={

                  styles.field

                }

              >

                <span

                  className={

                    styles.label

                  }

                >

                  {t(

                    "join.identity.email"

                  )}

                </span>



                <div

                  className={

                    styles.inputWrapper

                  }

                >

                  <Mail

                    className={

                      styles.inputIcon

                    }

                    size={18}

                    aria-hidden="true"

                  />



                  <input

                    className={

                      styles.input

                    }

                    type="email"

                    value={

                      studentEmail

                    }

                    onChange={(

                      event

                    ) =>

                      setStudentEmail(

                        event.target

                          .value

                      )

                    }

                    placeholder={t(

                      "join.identity.emailPlaceholder"

                    )}

                    autoComplete="email"

                    disabled={

                      busy ||

                      !quizAvailable

                    }

                    required

                  />

                </div>

              </label>



              {error && (

                <div

                  className={

                    styles.error

                  }

                  role="alert"

                >

                  {error}

                </div>

              )}



              {!quizAvailable &&

                !quizHasEnded &&

                !quizHasStarted && (

                  <div

                    className={

                      styles.waitingNotice

                    }

                    role="status"

                  >

                    {t(

                      "join.availability.notStarted"

                    )}

                  </div>

                )}



              {quizHasEnded && (

                <div

                  className={

                    styles.endedNotice

                  }

                  role="status"

                >

                  {t(

                    "join.availability.ended"

                  )}

                </div>

              )}



              <button

                className={

                  styles.primaryButton

                }

                type="submit"

                disabled={

                  busy ||

                  !quizAvailable

                }

              >

                {busy

                  ? t(

                      "join.actions.checking"

                    )

                  : t(

                      "join.actions.continue"

                    )}

              </button>

            </form>

          </>

        )}



        {/* ================================================

            New student

            ================================================ */}



        {step === "new" && (

          <>

            <div

              className={

                styles.infoBlock

              }

            >

              <div

                className={

                  styles.infoIcon

                }

              >

                <LockKeyhole

                  size={21}

                  aria-hidden="true"

                />

              </div>



              <div>

                <h2

                  className={

                    styles.sectionTitle

                  }

                >

                  {t(

                    "join.new.title"

                  )}

                </h2>



                <p

                  className={

                    styles.sectionText

                  }

                >

                  {t(

                    "join.new.description"

                  )}

                </p>

              </div>

            </div>



            <div

              className={

                styles.identitySummary

              }

            >

              <strong>

                {studentName}

              </strong>



              <span>

                {studentEmail}

              </span>

            </div>



            <form

              className={

                styles.form

              }

              onSubmit={

                handleCreateAttempt

              }

            >

              <PinField

                label={t(

                  "join.pin.newPin"

                )}

                value={pin}

                setValue={setPin}

                visible={showPin}

                setVisible={

                  setShowPin

                }

                styles={styles}

                showLabel={t(

                  "join.pin.show"

                )}

                hideLabel={t(

                  "join.pin.hide"

                )}

                disabled={

                  busy ||

                  !quizAvailable

                }

              />



              <PinField

                label={t(

                  "join.pin.confirmPin"

                )}

                value={

                  confirmPin

                }

                setValue={

                  setConfirmPin

                }

                visible={

                  showConfirmPin

                }

                setVisible={

                  setShowConfirmPin

                }

                styles={styles}

                showLabel={t(

                  "join.pin.show"

                )}

                hideLabel={t(

                  "join.pin.hide"

                )}

                disabled={

                  busy ||

                  !quizAvailable

                }

              />



              {error && (

                <div

                  className={

                    styles.error

                  }

                  role="alert"

                >

                  {error}

                </div>

              )}



              <button

                className={

                  styles.primaryButton

                }

                type="submit"

                disabled={

                  busy ||

                  !quizAvailable

                }

              >

                {busy

                  ? t(

                      "join.actions.starting"

                    )

                  : t(

                      "join.actions.start"

                    )}

              </button>



              <button

                className={

                  styles.secondaryButton

                }

                type="button"

                onClick={

                  returnToIdentity

                }

                disabled={busy}

              >

                {t(

                  "join.actions.back"

                )}

              </button>

            </form>

          </>

        )}



        {/* ================================================

            Existing student

            ================================================ */}



        {step === "existing" && (

          <>

            <div

              className={

                styles.infoBlock

              }

            >

              <div

                className={

                  styles.infoIcon

                }

              >

                <KeyRound

                  size={21}

                  aria-hidden="true"

                />

              </div>



              <div>

                <h2

                  className={

                    styles.sectionTitle

                  }

                >

                  {t(

                    "join.existing.title"

                  )}

                </h2>



                <p

                  className={

                    styles.sectionText

                  }

                >

                  {t(

                    "join.existing.description"

                  )}

                </p>

              </div>

            </div>



            <div

              className={

                styles.identitySummary

              }

            >

              <strong>

                {studentName}

              </strong>



              <span>

                {studentEmail}

              </span>

            </div>



            <form

              className={

                styles.form

              }

              onSubmit={

                handleResumeAttempt

              }

            >

              <PinField

                label={t(

                  "join.pin.pin"

                )}

                value={pin}

                setValue={setPin}

                visible={showPin}

                setVisible={

                  setShowPin

                }

                styles={styles}

                showLabel={t(

                  "join.pin.show"

                )}

                hideLabel={t(

                  "join.pin.hide"

                )}

                disabled={busy}

              />



              {error && (

                <div

                  className={

                    styles.error

                  }

                  role="alert"

                >

                  {error}

                </div>

              )}



              <button

                className={

                  styles.primaryButton

                }

                type="submit"

                disabled={busy}

              >

                {busy

                  ? t(

                      "join.actions.resuming"

                    )

                  : t(

                      "join.actions.resume"

                    )}

              </button>



              <button

                className={

                  styles.resetButton

                }

                type="button"

                onClick={() =>

                  void handleRequestReset()

                }

                disabled={busy}

              >

                <RotateCcwKey

                  size={18}

                  aria-hidden="true"

                />



                {t(

                  "join.actions.forgotPin"

                )}

              </button>



              <button

                className={

                  styles.secondaryButton

                }

                type="button"

                onClick={

                  returnToIdentity

                }

                disabled={busy}

              >

                {t(

                  "join.actions.back"

                )}

              </button>

            </form>

          </>

        )}



        {/* ================================================

            PIN reset

            ================================================ */}



        {step === "reset" && (

          <>

            {resetStatus !==

            "approved" ? (

              <div

                className={

                  styles.resetWaiting

                }

              >

                <div

                  className={

                    styles.waitingSpinner

                  }

                  aria-hidden="true"

                />



                <h2

                  className={

                    styles.sectionTitle

                  }

                >

                  {t(

                    "join.reset.waitingTitle"

                  )}

                </h2>



                <p

                  className={

                    styles.sectionText

                  }

                >

                  {t(

                    "join.reset.waitingDescription"

                  )}

                </p>



                <div

                  className={

                    styles.identitySummary

                  }

                >

                  <strong>

                    {studentName}

                  </strong>



                  <span>

                    {studentEmail}

                  </span>

                </div>



                {error && (

                  <div

                    className={

                      styles.error

                    }

                    role="alert"

                  >

                    {error}

                  </div>

                )}



                <button

                  className={

                    styles.secondaryButton

                  }

                  type="button"

                  onClick={

                    returnToIdentity

                  }

                >

                  {t(

                    "join.actions.back"

                  )}

                </button>

              </div>

            ) : (

              <>

                <div

                  className={

                    styles.infoBlock

                  }

                >

                  <div

                    className={

                      styles.infoIcon

                    }

                  >

                    <RotateCcwKey

                      size={21}

                      aria-hidden="true"

                    />

                  </div>



                  <div>

                    <h2

                      className={

                        styles.sectionTitle

                      }

                    >

                      {t(

                        "join.reset.approvedTitle"

                      )}

                    </h2>



                    <p

                      className={

                        styles.sectionText

                      }

                    >

                      {t(

                        "join.reset.approvedDescription"

                      )}

                    </p>

                  </div>

                </div>



                <div

                  className={

                    styles.identitySummary

                  }

                >

                  <strong>

                    {studentName}

                  </strong>



                  <span>

                    {studentEmail}

                  </span>

                </div>



                <form

                  className={

                    styles.form

                  }

                  onSubmit={

                    handleResetPin

                  }

                >

                  <PinField

                    label={t(

                      "join.reset.temporaryCode"

                    )}

                    value={

                      temporaryCode

                    }

                    setValue={

                      setTemporaryCode

                    }

                    visible={

                      showTemporaryCode

                    }

                    setVisible={

                      setShowTemporaryCode

                    }

                    styles={styles}

                    showLabel={t(

                      "join.pin.show"

                    )}

                    hideLabel={t(

                      "join.pin.hide"

                    )}

                    disabled={busy}

                  />



                  <PinField

                    label={t(

                      "join.reset.newPin"

                    )}

                    value={newPin}

                    setValue={

                      setNewPin

                    }

                    visible={

                      showNewPin

                    }

                    setVisible={

                      setShowNewPin

                    }

                    styles={styles}

                    showLabel={t(

                      "join.pin.show"

                    )}

                    hideLabel={t(

                      "join.pin.hide"

                    )}

                    disabled={busy}

                  />



                  <PinField

                    label={t(

                      "join.reset.confirmNewPin"

                    )}

                    value={

                      confirmNewPin

                    }

                    setValue={

                      setConfirmNewPin

                    }

                    visible={

                      showConfirmNewPin

                    }

                    setVisible={

                      setShowConfirmNewPin

                    }

                    styles={styles}

                    showLabel={t(

                      "join.pin.show"

                    )}

                    hideLabel={t(

                      "join.pin.hide"

                    )}

                    disabled={busy}

                  />



                  {error && (

                    <div

                      className={

                        styles.error

                      }

                      role="alert"

                    >

                      {error}

                    </div>

                  )}



                  <button

                    className={

                      styles.primaryButton

                    }

                    type="submit"

                    disabled={busy}

                  >

                    {busy

                      ? t(

                          "join.reset.resetting"

                        )

                      : t(

                          "join.reset.confirm"

                        )}

                  </button>



                  <button

                    className={

                      styles.secondaryButton

                    }

                    type="button"

                    onClick={

                      returnToIdentity

                    }

                    disabled={busy}

                  >

                    {t(

                      "join.actions.back"

                    )}

                  </button>

                </form>

              </>

            )}

          </>

        )}



        {/* ================================================

            Completed

            ================================================ */}



        {step === "completed" && (

          <div

            className={

              styles.completedBlock

            }

          >

            <div

              className={

                styles.iconCircle

              }

            >

              <LockKeyhole

                size={28}

                aria-hidden="true"

              />

            </div>



            <h2

              className={

                styles.sectionTitle

              }

            >

              {t(

                "join.completed.title"

              )}

            </h2>



            <p

              className={

                styles.sectionText

              }

            >

              {completedStatus ===

              "graded"

                ? t(

                    "join.completed.graded"

                  )

                : t(

                    "join.completed.submitted"

                  )}

            </p>



            {completedAttemptId && (

              <button

                type="button"

                className={

                  styles.primaryButton

                }

                onClick={() =>

                  router.push(

                    `/quiz-session/${completedAttemptId}`

                  )

                }

              >

                {t(

                  "join.completed.view"

                )}

              </button>

            )}



            <button

              type="button"

              className={

                styles.secondaryButton

              }

              onClick={

                returnToIdentity

              }

            >

              {t(

                "join.actions.back"

              )}

            </button>

          </div>

        )}

      </section>



      <HelpSupport />

    </main>

  );

}



/* =========================================================

   PIN field

   ========================================================= */



function PinField({

  label,

  value,

  setValue,

  visible,

  setVisible,

  styles,

  showLabel,

  hideLabel,

  disabled = false,

}: PinFieldProps) {

  const visibilityLabel =

    visible

      ? hideLabel

      : showLabel;



  return (

    <label

      className={styles.field}

    >

      <span

        className={styles.label}

      >

        {label}

      </span>



      <div

        className={

          styles.inputWrapper

        }

      >

        <LockKeyhole

          className={

            styles.inputIcon

          }

          size={18}

          aria-hidden="true"

        />



        <input

          className={

            styles.pinInput

          }

          type={

            visible

              ? "text"

              : "password"

          }

          inputMode="numeric"

          autoComplete="off"

          value={value}

          onChange={(event) => {

            const nextValue =

              onlyDigits(

                event.target.value

              ).slice(

                0,

                PIN_LENGTH

              );



            setValue(

              nextValue

            );

          }}

          maxLength={PIN_LENGTH}

          disabled={disabled}

          required

        />



        <button

          type="button"

          className={

            styles.eyeButton

          }

          onClick={() =>

            setVisible(

              !visible

            )

          }

          aria-label={

            visibilityLabel

          }

          title={

            visibilityLabel

          }

          disabled={disabled}

        >

          {visible ? (

            <EyeOff

              size={18}

              aria-hidden="true"

            />

          ) : (

            <Eye

              size={18}

              aria-hidden="true"

            />

          )}

        </button>

      </div>

    </label>

  );

}