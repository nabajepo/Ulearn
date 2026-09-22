"use client";

import {
  FormEvent,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  useLanguage,
} from "@/hooks/useLanguage";

type ErrorReason =
  | "empty_code"
  | "invalid_code"
  | null;

export default function JoinQuizBox() {
  const router = useRouter();

  const {
    t,
  } = useLanguage();

  const [
    code,
    setCode,
  ] = useState("");

  const [
    error,
    setError,
  ] = useState<ErrorReason>(
    null
  );

  /* =========================================================
     Error message
     ========================================================= */

  function getErrorMessage() {
    switch (error) {
      case "empty_code":
        return t(
          "home.joinQuiz.errors.emptyCode"
        );

      case "invalid_code":
        return t(
          "home.joinQuiz.errors.invalidCode"
        );

      default:
        return "";
    }
  }

  /* =========================================================
     Access code
     ========================================================= */

  function handleCodeChange(
    value: string
  ) {
    const nextCode = value
      .toUpperCase()
      .replace(/\s/g, "")
      .slice(0, 6);

    setCode(nextCode);

    /*
     * Remove the previous error when
     * the student starts correcting
     * the access code.
     */
    if (error) {
      setError(null);
    }
  }

  /* =========================================================
     Join quiz
     ========================================================= */

  function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const cleanCode = code
      .trim()
      .toUpperCase();

    setError(null);

    /*
     * The home page only validates the
     * basic format of the access code.
     *
     * The quiz itself will be resolved
     * on /join/[code].
     */
    if (!cleanCode) {
      setError("empty_code");
      return;
    }

    if (cleanCode.length !== 6) {
      setError("invalid_code");
      return;
    }

    /*
     * No Firestore/API request is needed
     * here.
     *
     * Example:
     *
     * ZPFUT2
     *   ↓
     * /join/ZPFUT2
     *
     * app/join/[code]/page.tsx will then
     * load and validate the corresponding
     * quiz.
     */
    router.push(
      `/join/${encodeURIComponent(
        cleanCode
      )}`
    );
  }

  /* =========================================================
     Render
     ========================================================= */

  return (
    <section
      className="joinQuizSection"
      aria-labelledby="join-quiz-title"
    >
      <div className="joinQuizBox">
        <div className="joinQuizContent">
          <span className="joinQuizBadge">
            {t(
              "home.joinQuiz.badge"
            )}
          </span>

          <h2 id="join-quiz-title">
            {t(
              "home.joinQuiz.title"
            )}
          </h2>

          <p>
            {t(
              "home.joinQuiz.description"
            )}
          </p>
        </div>

        <form
          className="joinQuizForm"
          onSubmit={handleSubmit}
          noValidate
        >
          <label
            htmlFor="quiz-access-code"
          >
            {t(
              "home.joinQuiz.label"
            )}
          </label>

          <div className="joinQuizFormRow">
            <input
              id="quiz-access-code"
              name="quizCode"
              type="text"
              value={code}
              onChange={(event) =>
                handleCodeChange(
                  event.target.value
                )
              }
              placeholder={t(
                "home.joinQuiz.placeholder"
              )}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={6}
              aria-invalid={
                error
                  ? true
                  : undefined
              }
              aria-describedby={
                error
                  ? "quiz-code-error"
                  : undefined
              }
            />

            <button
              type="submit"
            >
              {t(
                "home.joinQuiz.button"
              )}
            </button>
          </div>

          {error && (
            <div
              id="quiz-code-error"
              className="joinQuizError"
              role="alert"
            >
              <span
                className="joinQuizErrorIcon"
                aria-hidden="true"
              >
                !
              </span>

              <span>
                {getErrorMessage()}
              </span>
            </div>
          )}
        </form>
      </div>
    </section>
  );
}