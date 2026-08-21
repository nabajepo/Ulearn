"use client";

import {
  useMemo,
  useState,
  type FormEvent,
} from "react";

import {
  addDoc,
  collection,
  deleteDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";

import {
  useUser,
} from "@clerk/nextjs";

import {
  db,
} from "@/lib/firebase";

import {
  useLanguage,
} from "@/hooks/useLanguage";

/* =========================================================
   Types
   ========================================================= */

export type FeedbackAuthorType =
  | "student"
  | "teacher";

export type FeedbackStudentIdentity = {
  name: string;
  email: string;
  attemptId: string;
  quizId: string;
};

type FeedbackFormProps = {
  authorType: FeedbackAuthorType;

  studentIdentity?:
    FeedbackStudentIdentity | null;

  onSuccess?: () => void;
};

/* =========================================================
   Constants
   ========================================================= */

const FEEDBACKS_COLLECTION =
  "feedbacks";

const MAX_FEEDBACKS =
  5;

const MAX_COMMENT_LENGTH =
  1000;

/* =========================================================
   Component
   ========================================================= */

export default function FeedbackForm({
  authorType,
  studentIdentity = null,
  onSuccess,
}: FeedbackFormProps) {
  const {
    user,
    isLoaded,
  } =
    useUser();

  const {
    t,
  } =
    useLanguage();

  const [
    rating,
    setRating,
  ] =
    useState(0);

  const [
    hoverRating,
    setHoverRating,
  ] =
    useState(0);

  const [
    comment,
    setComment,
  ] =
    useState("");

  const [
    submitting,
    setSubmitting,
  ] =
    useState(false);

  const [
    submitted,
    setSubmitted,
  ] =
    useState(false);

  const [
    message,
    setMessage,
  ] =
    useState("");

  /* =========================================================
     Context
     ========================================================= */

  const isStudent =
    authorType ===
    "student";

  const isTeacher =
    authorType ===
    "teacher";

  /* =========================================================
     Teacher identity
     ========================================================= */

  const teacherName =
    useMemo(() => {
      if (
        !isTeacher ||
        !isLoaded ||
        !user
      ) {
        return "";
      }

      return (
        user.fullName
          ?.trim() ||
        user.primaryEmailAddress
          ?.emailAddress
          ?.trim() ||
        ""
      );
    }, [
      isTeacher,
      isLoaded,
      user,
    ]);

  const teacherEmail =
    useMemo(() => {
      if (
        !isTeacher ||
        !isLoaded ||
        !user
      ) {
        return "";
      }

      return (
        user.primaryEmailAddress
          ?.emailAddress
          ?.trim()
          ?.toLowerCase() ||
        ""
      );
    }, [
      isTeacher,
      isLoaded,
      user,
    ]);

  const teacherId =
    isTeacher &&
    user
      ? user.id
      : "";

  /* =========================================================
     Student identity
     ========================================================= */

  const studentName =
    isStudent
      ? studentIdentity
          ?.name
          ?.trim() ||
        ""
      : "";

  const studentEmail =
    isStudent
      ? studentIdentity
          ?.email
          ?.trim()
          ?.toLowerCase() ||
        ""
      : "";

  const attemptId =
    isStudent
      ? studentIdentity
          ?.attemptId
          ?.trim() ||
        ""
      : "";

  const quizId =
    isStudent
      ? studentIdentity
          ?.quizId
          ?.trim() ||
        ""
      : "";

  /* =========================================================
     Display identity
     ========================================================= */

  const displayName =
    isStudent
      ? studentName ||
        studentEmail
      : teacherName ||
        teacherEmail;

  const displayEmail =
    isStudent
      ? studentEmail
      : teacherEmail;

  /* =========================================================
     Validation
     ========================================================= */

  function validateForm() {
    if (
      rating <
        1 ||
      rating >
        5
    ) {
      return t(
        "feedbackForm.validation.ratingRequired"
      );
    }

    const cleanComment =
      comment.trim();

    if (
      !cleanComment
    ) {
      return t(
        "feedbackForm.validation.commentRequired"
      );
    }

    if (
      cleanComment.length <
      3
    ) {
      return t(
        "feedbackForm.validation.commentTooShort"
      );
    }

    if (
      isStudent
    ) {
      if (
        !studentName ||
        !studentEmail ||
        !attemptId ||
        !quizId
      ) {
        return t(
          "feedbackForm.validation.studentIdentityMissing"
        );
      }
    }

    if (
      isTeacher
    ) {
      if (
        !isLoaded
      ) {
        return t(
          "feedbackForm.validation.teacherLoading"
        );
      }

      if (
        !user ||
        !teacherId
      ) {
        return t(
          "feedbackForm.validation.teacherRequired"
        );
      }
    }

    return "";
  }

  /* =========================================================
     Duplicate check
     ========================================================= */

  async function feedbackAlreadyExists() {
    const feedbackRef =
      collection(
        db,
        FEEDBACKS_COLLECTION
      );

    if (
      isStudent
    ) {
      const duplicateQuery =
        query(
          feedbackRef,

          where(
            "authorType",
            "==",
            "student"
          ),

          where(
            "attemptId",
            "==",
            attemptId
          ),

          limit(
            1
          )
        );

      const snapshot =
        await getDocs(
          duplicateQuery
        );

      return !snapshot.empty;
    }

    const duplicateQuery =
      query(
        feedbackRef,

        where(
          "authorType",
          "==",
          "teacher"
        ),

        where(
          "teacherId",
          "==",
          teacherId
        ),

        limit(
          1
        )
      );

    const snapshot =
      await getDocs(
        duplicateQuery
      );

    return !snapshot.empty;
  }

  /* =========================================================
     Keep only latest 5 feedbacks
     ========================================================= */

  async function trimFeedbackQueue() {
    const feedbackQuery =
      query(
        collection(
          db,
          FEEDBACKS_COLLECTION
        ),

        orderBy(
          "createdAt",
          "desc"
        )
      );

    const snapshot =
      await getDocs(
        feedbackQuery
      );

    if (
      snapshot.docs.length <=
      MAX_FEEDBACKS
    ) {
      return;
    }

    const feedbacksToDelete =
      snapshot.docs.slice(
        MAX_FEEDBACKS
      );

    await Promise.all(
      feedbacksToDelete.map(
        (
          feedbackDocument
        ) =>
          deleteDoc(
            feedbackDocument.ref
          )
      )
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
      submitting
    ) {
      return;
    }

    setMessage(
      ""
    );

    const validationMessage =
      validateForm();

    if (
      validationMessage
    ) {
      setMessage(
        validationMessage
      );

      return;
    }

    setSubmitting(
      true
    );

    try {
      const duplicate =
        await feedbackAlreadyExists();

      if (
        duplicate
      ) {
        setMessage(
          isStudent
            ? t(
                "feedbackForm.validation.studentAlreadySubmitted"
              )
            : t(
                "feedbackForm.validation.teacherAlreadySubmitted"
              )
        );

        return;
      }

      const now =
        new Date()
          .toISOString();

      const feedbackData = {
        rating,

        comment:
          comment
            .trim()
            .slice(
              0,
              MAX_COMMENT_LENGTH
            ),

        authorType,

        /* =====================================================
           Student
           ===================================================== */

        studentName:
          isStudent
            ? studentName
            : null,

        studentEmail:
          isStudent
            ? studentEmail
            : null,

        attemptId:
          isStudent
            ? attemptId
            : null,

        quizId:
          isStudent
            ? quizId
            : null,

        /* =====================================================
           Teacher
           ===================================================== */

        teacherId:
          isTeacher
            ? teacherId
            : null,

        teacherName:
          isTeacher
            ? teacherName
            : null,

        teacherEmail:
          isTeacher
            ? teacherEmail
            : null,

        createdAt:
          now,
      };

      await addDoc(
        collection(
          db,
          FEEDBACKS_COLLECTION
        ),

        feedbackData
      );

      await trimFeedbackQueue();

      setSubmitted(
        true
      );

      setRating(
        0
      );

      setHoverRating(
        0
      );

      setComment(
        ""
      );

      setMessage(
        ""
      );

      onSuccess?.();
    } catch (error) {
      console.error(
        "Unable to submit feedback:",
        error
      );

      setMessage(
        t(
          "feedbackForm.validation.submitError"
        )
      );
    } finally {
      setSubmitting(
        false
      );
    }
  }

  /* =========================================================
     Submitted
     ========================================================= */

  if (
    submitted
  ) {
    return (
      <section className="feedback-form feedback-form-success">
        <div
          className="feedback-form-success-icon"
          aria-hidden="true"
        >
          ✓
        </div>

        <h2>
          {t(
            "feedbackForm.success.title"
          )}
        </h2>

        <p>
          {t(
            "feedbackForm.success.text"
          )}
        </p>
      </section>
    );
  }

  /* =========================================================
     UI
     ========================================================= */

  return (
    <section className="feedback-form">
      <div className="feedback-form-heading">
        <span className="feedback-form-badge">
          {t(
            "feedbackForm.badge"
          )}
        </span>

        <h2>
          {t(
            "feedbackForm.title"
          )}
        </h2>

        <p>
          {t(
            "feedbackForm.description"
          )}
        </p>
      </div>

      {displayName && (
        <div className="feedback-form-identity">
          <span>
            {isStudent
              ? t(
                  "feedbackForm.identity.student"
                )
              : t(
                  "feedbackForm.identity.teacher"
                )}
          </span>

          <strong>
            {
              displayName
            }
          </strong>

          {displayEmail && (
            <small>
              {
                displayEmail
              }
            </small>
          )}
        </div>
      )}

      <form
        onSubmit={
          handleSubmit
        }
      >
        <fieldset className="feedback-form-rating">
          <legend>
            {t(
              "feedbackForm.rating.label"
            )}
          </legend>

          <p>
            {t(
              "feedbackForm.rating.help"
            )}
          </p>

          <div
            className="feedback-form-stars"
            role="radiogroup"
            aria-label={t(
              "feedbackForm.rating.label"
            )}
          >
            {[1, 2, 3, 4, 5].map(
              (
                value
              ) => {
                const active =
                  value <=
                  (
                    hoverRating ||
                    rating
                  );

                return (
                  <button
                    key={
                      value
                    }
                    type="button"
                    className={`feedback-form-star ${
                      active
                        ? "is-active"
                        : ""
                    }`}
                    role="radio"
                    aria-checked={
                      rating ===
                      value
                    }
                    aria-label={`${value} ${t(
                      value ===
                        1
                        ? "feedbackForm.rating.star"
                        : "feedbackForm.rating.stars"
                    )}`}
                    onMouseEnter={() => {
                      setHoverRating(
                        value
                      );
                    }}
                    onMouseLeave={() => {
                      setHoverRating(
                        0
                      );
                    }}
                    onFocus={() => {
                      setHoverRating(
                        value
                      );
                    }}
                    onBlur={() => {
                      setHoverRating(
                        0
                      );
                    }}
                    onClick={() => {
                      setRating(
                        value
                      );

                      setMessage(
                        ""
                      );
                    }}
                  >
                    ★
                  </button>
                );
              }
            )}
          </div>

          <strong className="feedback-form-rating-value">
            {rating > 0
              ? `${rating}/5`
              : t(
                  "feedbackForm.rating.notSelected"
                )}
          </strong>
        </fieldset>

        <label className="feedback-form-comment">
          <span>
            {t(
              "feedbackForm.comment.label"
            )}
          </span>

          <textarea
            value={
              comment
            }
            maxLength={
              MAX_COMMENT_LENGTH
            }
            placeholder={t(
              "feedbackForm.comment.placeholder"
            )}
            onChange={(
              event
            ) => {
              setComment(
                event.target.value
              );

              setMessage(
                ""
              );
            }}
          />

          <small>
            {
              comment.length
            }
            {" / "}
            {
              MAX_COMMENT_LENGTH
            }
            {" "}
            {t(
              "feedbackForm.comment.characters"
            )}
          </small>
        </label>

        {message && (
          <p
            className="feedback-form-message"
            role="alert"
          >
            {
              message
            }
          </p>
        )}

        <button
          type="submit"
          className="app-button app-button-action"
          disabled={
            submitting
          }
        >
          {submitting
            ? t(
                "feedbackForm.actions.submitting"
              )
            : t(
                "feedbackForm.actions.submit"
              )}
        </button>
      </form>
    </section>
  );
}