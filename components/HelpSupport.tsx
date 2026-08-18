"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";

import {
  useUser,
} from "@clerk/nextjs";

import {
  useLanguage,
} from "@/hooks/useLanguage";

/* =========================================================
   Types
   ========================================================= */

type FormState = {
  action: string;
  description: string;
  email: string;
};

export type HelpSupportContext =
  | "teacher"
  | "student"
  | "anonymous";

export type HelpSupportStudentIdentity = {
  name?: string;
  email?: string;
  attemptId?: string;
  quizId?: string;
};

type HelpSupportProps = {
  /*
   * Default remains teacher so existing
   * authenticated teacher pages keep working.
   */
  context?:
    HelpSupportContext;

  /*
   * Used only in student context.
   */
  studentIdentity?:
    HelpSupportStudentIdentity | null;
};

/* =========================================================
   Constants
   ========================================================= */

const INITIAL_FORM:
  FormState = {
  action: "",
  description: "",
  email: "",
};

const MAX_ACTION_LENGTH =
  150;

const MAX_DESCRIPTION_LENGTH =
  1500;

const MAX_EMAIL_LENGTH =
  200;

/* =========================================================
   Email validation
   ========================================================= */

function isValidEmail(
  value: string
) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value
  );
}

/* =========================================================
   Component
   ========================================================= */

export default function HelpSupport({
  context = "teacher",
  studentIdentity = null,
}: HelpSupportProps) {
  const {
    user,
    isLoaded,
  } =
    useUser();

  const {
    t,
  } =
    useLanguage();

  const firstInputRef =
    useRef<HTMLInputElement | null>(
      null
    );

  const [
    open,
    setOpen,
  ] =
    useState(false);

  const [
    form,
    setForm,
  ] =
    useState<FormState>(
      INITIAL_FORM
    );

  const [
    message,
    setMessage,
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

  /* =========================================================
     Context helpers
     ========================================================= */

  const isTeacherContext =
    context ===
    "teacher";

  const isStudentContext =
    context ===
    "student";

  const isAnonymousContext =
    context ===
    "anonymous";

  /* =========================================================
     Clerk teacher identity
     ========================================================= */

  const clerkEmail =
    useMemo(() => {
      /*
       * Clerk is intentionally ignored outside
       * the teacher context.
       */
      if (
        !isTeacherContext ||
        !isLoaded ||
        !user
      ) {
        return "";
      }

      return (
        user.primaryEmailAddress
          ?.emailAddress
          ?.trim() ??
        ""
      );
    }, [
      isTeacherContext,
      isLoaded,
      user,
    ]);

  const clerkName =
    useMemo(() => {
      if (
        !isTeacherContext ||
        !isLoaded ||
        !user
      ) {
        return "";
      }

      return (
        user.fullName
          ?.trim() ??
        ""
      );
    }, [
      isTeacherContext,
      isLoaded,
      user,
    ]);

  /* =========================================================
     Student identity
     ========================================================= */

  const studentEmail =
    useMemo(() => {
      if (
        !isStudentContext
      ) {
        return "";
      }

      return (
        studentIdentity
          ?.email
          ?.trim()
          ?.toLowerCase() ??
        ""
      );
    }, [
      isStudentContext,
      studentIdentity,
    ]);

  const studentName =
    useMemo(() => {
      if (
        !isStudentContext
      ) {
        return "";
      }

      return (
        studentIdentity
          ?.name
          ?.trim() ??
        ""
      );
    }, [
      isStudentContext,
      studentIdentity,
    ]);

  const hasStudentIdentity =
    Boolean(
      studentName ||
      studentEmail
    );

  /* =========================================================
     Effective support email
     ========================================================= */

  const supportEmail =
    useMemo(() => {
      if (
        isStudentContext
      ) {
        return studentEmail;
      }

      if (
        isAnonymousContext
      ) {
        return "";
      }

      return clerkEmail;
    }, [
      isStudentContext,
      isAnonymousContext,
      studentEmail,
      clerkEmail,
    ]);

  /* =========================================================
     Effective support account
     ========================================================= */

  const supportAccount =
    useMemo(() => {
      /* =====================================================
         Anonymous
         ===================================================== */

      if (
        isAnonymousContext
      ) {
        return t(
          "help.account.notIdentified"
        );
      }

      /* =====================================================
         Student
         ===================================================== */

      if (
        isStudentContext
      ) {
        if (
          hasStudentIdentity
        ) {
          return (
            studentName ||
            studentEmail ||
            t(
              "help.account.student"
            )
          );
        }

        return t(
          "help.account.notIdentified"
        );
      }

      /* =====================================================
         Teacher
         ===================================================== */

      if (
        !isLoaded
      ) {
        return t(
          "help.account.loading"
        );
      }

      if (
        !user
      ) {
        return t(
          "help.account.notSignedIn"
        );
      }

      return (
        clerkName ||
        clerkEmail ||
        t(
          "help.account.authenticatedUser"
        )
      );
    }, [
      isAnonymousContext,
      isStudentContext,
      hasStudentIdentity,
      studentName,
      studentEmail,
      isLoaded,
      user,
      clerkName,
      clerkEmail,
      t,
    ]);

  /* =========================================================
     Account type
     ========================================================= */

  const supportAccountType:
    | "teacher"
    | "student"
    | "anonymous" =
    useMemo(() => {
      if (
        isAnonymousContext
      ) {
        return "anonymous";
      }

      if (
        isStudentContext
      ) {
        return hasStudentIdentity
          ? "student"
          : "anonymous";
      }

      if (
        isTeacherContext &&
        user
      ) {
        return "teacher";
      }

      return "anonymous";
    }, [
      isAnonymousContext,
      isStudentContext,
      isTeacherContext,
      hasStudentIdentity,
      user,
    ]);

  /* =========================================================
     Reset modal form
     ========================================================= */

  function createInitialModalForm():
    FormState {
    return {
      action:
        "",

      description:
        "",

      email:
        supportEmail,
    };
  }

  /* =========================================================
     Open modal initialization
     ========================================================= */

  useEffect(() => {
    if (
      !open
    ) {
      return;
    }

    setSubmitted(
      false
    );

    setMessage(
      ""
    );

    /*
     * Important:
     *
     * We do NOT preserve an email from an old context.
     *
     * anonymous  -> ""
     * student    -> student email
     * teacher    -> Clerk email
     */
    setForm(
      createInitialModalForm()
    );

    const timer =
      window.setTimeout(
        () => {
          firstInputRef.current
            ?.focus();
        },
        100
      );

    return () => {
      window.clearTimeout(
        timer
      );
    };
  }, [
    open,
    supportEmail,
  ]);

  /* =========================================================
     Synchronize identity while modal is open
     ========================================================= */

  useEffect(() => {
    if (
      !open
    ) {
      return;
    }

    setForm(
      (
        current
      ) => ({
        ...current,

        /*
         * This deliberately becomes an empty
         * string for anonymous context.
         */
        email:
          supportEmail,
      })
    );
  }, [
    open,
    supportEmail,
  ]);

  /* =========================================================
     Escape + body lock
     ========================================================= */

  useEffect(() => {
    if (
      !open
    ) {
      return;
    }

    function handleEscape(
      event:
        KeyboardEvent
    ) {
      if (
        event.key ===
          "Escape" &&
        !submitting
      ) {
        setOpen(
          false
        );

        setMessage(
          ""
        );

        setSubmitted(
          false
        );

        setForm(
          INITIAL_FORM
        );
      }
    }

    document.addEventListener(
      "keydown",
      handleEscape
    );

    const previousOverflow =
      document.body.style
        .overflow;

    document.body.style
      .overflow =
      "hidden";

    return () => {
      document.removeEventListener(
        "keydown",
        handleEscape
      );

      document.body.style
        .overflow =
        previousOverflow;
    };
  }, [
    open,
    submitting,
  ]);

  /* =========================================================
     Modal helpers
     ========================================================= */

  function openModal() {
    setOpen(
      true
    );
  }

  function closeModal() {
    if (
      submitting
    ) {
      return;
    }

    setOpen(
      false
    );

    setMessage(
      ""
    );

    setSubmitted(
      false
    );

    setForm(
      INITIAL_FORM
    );
  }

  function updateField(
    field:
      keyof FormState,

    value:
      string
  ) {
    setForm(
      (
        current
      ) => ({
        ...current,

        [field]:
          value,
      })
    );

    setMessage(
      ""
    );
  }

  function handleOverlayClick(
    event:
      MouseEvent<HTMLDivElement>
  ) {
    if (
      event.target ===
        event.currentTarget &&
      !submitting
    ) {
      closeModal();
    }
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

    const cleanAction =
      form.action.trim();

    const cleanDescription =
      form.description.trim();

    const cleanEmail =
      form.email
        .trim()
        .toLowerCase();

    /* =====================================================
       Validation
       ===================================================== */

    if (
      !cleanAction
    ) {
      setMessage(
        t(
          "help.validation.actionRequired"
        )
      );

      return;
    }

    if (
      !cleanDescription
    ) {
      setMessage(
        t(
          "help.validation.descriptionRequired"
        )
      );

      return;
    }

    if (
      cleanDescription.length <
      10
    ) {
      setMessage(
        t(
          "help.validation.descriptionTooShort"
        )
      );

      return;
    }

    if (
      cleanEmail &&
      !isValidEmail(
        cleanEmail
      )
    ) {
      setMessage(
        t(
          "help.validation.invalidEmail"
        )
      );

      return;
    }

    setSubmitting(
      true
    );

    setMessage(
      ""
    );

    try {
      const supportReport = {
        action:
          cleanAction,

        description:
          cleanDescription,

        email:
          cleanEmail ||
          null,

        accountType:
          supportAccountType,

        /* =================================================
           Student context
           ================================================= */

        studentName:
          isStudentContext &&
          hasStudentIdentity
            ? studentName ||
              null
            : null,

        studentEmail:
          isStudentContext &&
          hasStudentIdentity
            ? studentEmail ||
              null
            : null,

        attemptId:
          isStudentContext
            ? studentIdentity
                ?.attemptId ??
              null
            : null,

        quizId:
          isStudentContext
            ? studentIdentity
                ?.quizId ??
              null
            : null,

        /* =================================================
           Teacher context
           ================================================= */

        teacherId:
          isTeacherContext
            ? user?.id ??
              null
            : null,

        teacherName:
          isTeacherContext
            ? clerkName ||
              null
            : null,

        teacherEmail:
          isTeacherContext
            ? clerkEmail ||
              null
            : null,

        signedInAccount:
          supportAccount,

        createdAt:
          new Date()
            .toISOString(),
      };

      /*
       * Temporary development output.
       *
       * Later this can be connected to Firestore,
       * an API route or email delivery.
       */
      console.log(
        "ULearn support report:",
        supportReport
      );

      await new Promise<void>(
        (
          resolve
        ) => {
          window.setTimeout(
            resolve,
            700
          );
        }
      );

      setSubmitted(
        true
      );

      setForm(
        createInitialModalForm()
      );
    } catch (
      error
    ) {
      console.error(
        "Unable to prepare the support report:",
        error
      );

      setMessage(
        t(
          "help.validation.submitError"
        )
      );
    } finally {
      setSubmitting(
        false
      );
    }
  }

  /* =========================================================
     UI
     ========================================================= */

  return (
    <>
      <button
        type="button"
        className="help-support-button"
        onClick={
          openModal
        }
        aria-label={t(
          "help.openAriaLabel"
        )}
        aria-haspopup="dialog"
        aria-expanded={
          open
        }
      >
        <span
          className="help-support-icon"
          aria-hidden="true"
        >
          ?
        </span>

        <span className="help-support-button-text">
          {t(
            "help.button"
          )}
        </span>
      </button>

      {open && (
        <div
          className="help-support-overlay"
          onMouseDown={
            handleOverlayClick
          }
        >
          <section
            className="help-support-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-dialog-title"
          >
            <header className="help-support-header">
              <div>
                <span className="help-support-badge">
                  {t(
                    "help.badge"
                  )}
                </span>

                <h2
                  id="help-dialog-title"
                >
                  {t(
                    "help.title"
                  )}
                </h2>

                <p>
                  {t(
                    "help.subtitle"
                  )}
                </p>
              </div>

              <button
                type="button"
                className="help-support-close-button"
                onClick={
                  closeModal
                }
                disabled={
                  submitting
                }
                aria-label={t(
                  "help.closeAriaLabel"
                )}
              >
                ×
              </button>
            </header>

            {submitted ? (
              <div className="help-support-success">
                <div
                  className="help-support-success-icon"
                  aria-hidden="true"
                >
                  ✓
                </div>

                <h3>
                  {t(
                    "help.success.title"
                  )}
                </h3>

                <p>
                  {t(
                    "help.success.text"
                  )}
                </p>

                <p className="help-support-temporary-notice">
                  {t(
                    "help.success.temporaryNotice"
                  )}
                </p>

                <button
                  type="button"
                  className="app-button app-button-action"
                  onClick={
                    closeModal
                  }
                >
                  {t(
                    "help.close"
                  )}
                </button>
              </div>
            ) : (
              <form
                className="help-support-form"
                onSubmit={
                  handleSubmit
                }
              >
                <label>
                  {t(
                    "help.form.actionLabel"
                  )}

                  <input
                    ref={
                      firstInputRef
                    }
                    type="text"
                    value={
                      form.action
                    }
                    maxLength={
                      MAX_ACTION_LENGTH
                    }
                    placeholder={t(
                      "help.form.actionPlaceholder"
                    )}
                    onChange={(
                      event
                    ) =>
                      updateField(
                        "action",
                        event.target.value
                      )
                    }
                  />

                  <small>
                    {
                      form.action
                        .length
                    }
                    {" / "}
                    {
                      MAX_ACTION_LENGTH
                    }
                    {" "}
                    {t(
                      "help.form.characters"
                    )}
                  </small>
                </label>

                <label>
                  {t(
                    "help.form.descriptionLabel"
                  )}

                  <textarea
                    value={
                      form.description
                    }
                    maxLength={
                      MAX_DESCRIPTION_LENGTH
                    }
                    placeholder={t(
                      "help.form.descriptionPlaceholder"
                    )}
                    onChange={(
                      event
                    ) =>
                      updateField(
                        "description",
                        event.target.value
                      )
                    }
                  />

                  <small>
                    {
                      form.description
                        .length
                    }
                    {" / "}
                    {
                      MAX_DESCRIPTION_LENGTH
                    }
                    {" "}
                    {t(
                      "help.form.characters"
                    )}
                  </small>
                </label>

                <label>
                  <span>
                    {t(
                      "help.form.emailLabel"
                    )}

                    <span className="help-support-optional">
                      {t(
                        "help.form.optional"
                      )}
                    </span>
                  </span>

                  <input
                    type="email"
                    value={
                      form.email
                    }
                    maxLength={
                      MAX_EMAIL_LENGTH
                    }
                    placeholder={t(
                      "help.form.emailPlaceholder"
                    )}
                    onChange={(
                      event
                    ) =>
                      updateField(
                        "email",
                        event.target.value
                      )
                    }
                  />

                  <small>
                    {t(
                      "help.form.emailHelp"
                    )}
                  </small>
                </label>

                <div className="help-support-automatic-info">
                  <strong>
                    {t(
                      "help.automaticInfo.title"
                    )}
                  </strong>

                  <div className="help-support-account-info">
                    <span>
                      {t(
                        "help.automaticInfo.account"
                      )}
                    </span>

                    <p>
                      {
                        supportAccount
                      }
                    </p>

                    {isStudentContext &&
                      hasStudentIdentity &&
                      studentEmail && (
                        <small>
                          {
                            studentEmail
                          }
                        </small>
                      )}
                  </div>
                </div>

                {message && (
                  <p
                    className="help-support-message"
                    role="alert"
                  >
                    {
                      message
                    }
                  </p>
                )}

                <div className="help-support-actions">
                  <button
                    type="submit"
                    className="app-button app-button-action"
                    disabled={
                      submitting
                    }
                  >
                    {submitting
                      ? t(
                          "help.form.preparing"
                        )
                      : t(
                          "help.form.submit"
                        )}
                  </button>

                  <button
                    type="button"
                    className="app-button app-button-secondary app-button-action"
                    disabled={
                      submitting
                    }
                    onClick={
                      closeModal
                    }
                  >
                    {t(
                      "help.cancel"
                    )}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}