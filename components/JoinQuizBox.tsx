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
  | "not_found"
  | "not_available"
  | "server_error"
  | null;

type ResolveQuizResponse = {
  success: boolean;
  quizId?: string;
  reason?: ErrorReason;
};

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

  const [
    isLoading,
    setIsLoading,
  ] = useState(false);

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

      case "not_found":
        return t(
          "home.joinQuiz.errors.notFound"
        );

      case "not_available":
        return t(
          "home.joinQuiz.errors.notAvailable"
        );

      case "server_error":
        return t(
          "home.joinQuiz.errors.serverError"
        );

      default:
        return "";
    }
  }

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

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (isLoading) {
      return;
    }

    const cleanCode = code
      .trim()
      .toUpperCase();

    setError(null);

    if (!cleanCode) {
      setError("empty_code");
      return;
    }

    if (cleanCode.length !== 6) {
      setError("invalid_code");
      return;
    }

    try {
      setIsLoading(true);

      const response =
        await fetch(
          "/api/quiz/resolve-code",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              code: cleanCode,
            }),
          }
        );

      const data =
        (await response.json()) as
          ResolveQuizResponse;

      if (
        response.ok &&
        data.success &&
        typeof data.quizId ===
          "string" &&
        data.quizId
      ) {
        router.push(
          `/join/${data.quizId}`
        );

        return;
      }

      switch (data.reason) {
        case "empty_code":
        case "invalid_code":
        case "not_found":
        case "not_available":
        case "server_error":
          setError(data.reason);
          break;

        default:
          setError("server_error");
          break;
      }
    } catch (error) {
      console.error(
        "Unable to resolve quiz code:",
        error
      );

      setError("server_error");
    } finally {
      setIsLoading(false);
    }
  }

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
              disabled={isLoading}
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
              disabled={isLoading}
            >
              {isLoading
                ? t(
                    "home.joinQuiz.loading"
                  )
                : t(
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