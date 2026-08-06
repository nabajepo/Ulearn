"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";

import { useUser } from "@clerk/nextjs";

type FormState = {
  action: string;
  description: string;
  email: string;
};

const INITIAL_FORM: FormState = {
  action: "",
  description: "",
  email: "",
};

export default function HelpSupport() {
  const { user, isLoaded } = useUser();

  const firstInputRef =
    useRef<HTMLInputElement | null>(null);

  const [open, setOpen] =
    useState(false);

  const [form, setForm] =
    useState<FormState>(INITIAL_FORM);

  const [message, setMessage] =
    useState("");

  const [submitting, setSubmitting] =
    useState(false);

  const [submitted, setSubmitted] =
    useState(false);

  const userEmail = useMemo(() => {
    if (!isLoaded || !user) {
      return "";
    }

    return (
      user.primaryEmailAddress
        ?.emailAddress || ""
    );
  }, [isLoaded, user]);

  const signedInAccount = useMemo(() => {
    if (!isLoaded) {
      return "Loading account...";
    }

    if (!user) {
      return "Not signed in";
    }

    return (
      user.fullName ||
      userEmail ||
      "Authenticated user"
    );
  }, [
    isLoaded,
    user,
    userEmail,
  ]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setSubmitted(false);
    setMessage("");

    setForm((current) => ({
      ...current,
      email:
        current.email ||
        userEmail,
    }));

    const timer =
      window.setTimeout(() => {
        firstInputRef.current
          ?.focus();
      }, 100);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    open,
    userEmail,
  ]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleEscape(
      event: KeyboardEvent
    ) {
      if (
        event.key === "Escape" &&
        !submitting
      ) {
        closeModal();
      }
    }

    document.addEventListener(
      "keydown",
      handleEscape
    );

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    return () => {
      document.removeEventListener(
        "keydown",
        handleEscape
      );

      document.body.style.overflow =
        previousOverflow;
    };
  }, [
    open,
    submitting,
  ]);

  function openModal() {
    setOpen(true);
  }

  function closeModal() {
    if (submitting) {
      return;
    }

    setOpen(false);
    setMessage("");
    setSubmitted(false);
    setForm(INITIAL_FORM);
  }

  function updateField(
    field: keyof FormState,
    value: string
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    setMessage("");
  }

  function handleOverlayClick(
    event: MouseEvent<HTMLDivElement>
  ) {
    if (
      event.target ===
        event.currentTarget &&
      !submitting
    ) {
      closeModal();
    }
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    const cleanAction =
      form.action.trim();

    const cleanDescription =
      form.description.trim();

    const cleanEmail =
      form.email.trim();

    if (!cleanAction) {
      setMessage(
        "Please tell us what you were trying to do."
      );

      return;
    }

    if (!cleanDescription) {
      setMessage(
        "Please describe what went wrong."
      );

      return;
    }

    if (
      cleanDescription.length < 10
    ) {
      setMessage(
        "Please provide a little more detail about the problem."
      );

      return;
    }

    if (
      cleanEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        cleanEmail
      )
    ) {
      setMessage(
        "Please enter a valid email address."
      );

      return;
    }

    setSubmitting(true);
    setMessage("");

    try {
      const supportReport = {
        action: cleanAction,

        description:
          cleanDescription,

        email:
          cleanEmail || null,

        teacherId:
          user?.id || null,

        teacherName:
          user?.fullName || null,

        signedInAccount:
          user
            ? signedInAccount
            : null,

        createdAt:
          new Date().toISOString(),
      };

      console.log(
        "ULearn support report:",
        supportReport
      );

      await new Promise<void>(
        (resolve) => {
          window.setTimeout(
            resolve,
            700
          );
        }
      );

      setSubmitted(true);
      setForm(INITIAL_FORM);
    } catch (error) {
      console.error(
        "Unable to prepare the support report:",
        error
      );

      setMessage(
        "Unable to submit the report. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="help-support-button"
        onClick={openModal}
        aria-label="Open the help form"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="help-support-icon">
          ?
        </span>

        <span className="help-support-button-text">
          Need help?
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
                  ULearn support
                </span>

                <h2 id="help-dialog-title">
                  Report a problem
                </h2>

                <p>
                  Tell us what happened
                  so we can improve your
                  ULearn experience.
                </p>
              </div>

              <button
                type="button"
                className="help-support-close-button"
                onClick={closeModal}
                disabled={submitting}
                aria-label="Close the help form"
              >
                ×
              </button>
            </header>

            {submitted ? (
              <div className="help-support-success">
                <div className="help-support-success-icon">
                  ✓
                </div>

                <h3>
                  Report prepared
                </h3>

                <p>
                  Thank you. Your report
                  has been prepared
                  successfully.
                </p>

                <p className="help-support-temporary-notice">
                  Email delivery will be
                  connected in a later
                  development phase.
                </p>

                <button
                  type="button"
                  className="app-button app-button-action"
                  onClick={closeModal}
                >
                  Close
                </button>
              </div>
            ) : (
              <form
                className="help-support-form"
                onSubmit={handleSubmit}
              >
                <label>
                  What were you trying
                  to do?

                  <input
                    ref={firstInputRef}
                    type="text"
                    value={form.action}
                    maxLength={150}
                    placeholder="Example: Create a new quiz"
                    onChange={(event) =>
                      updateField(
                        "action",
                        event.target.value
                      )
                    }
                  />

                  <small>
                    {form.action.length}
                    {" / "}
                    150 characters
                  </small>
                </label>

                <label>
                  What happened?

                  <textarea
                    value={
                      form.description
                    }
                    maxLength={1500}
                    placeholder="Describe the issue, the error message, or the unexpected behaviour..."
                    onChange={(event) =>
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
                    1500 characters
                  </small>
                </label>

                <label>
                  <span>
                    Your email

                    <span className="help-support-optional">
                      Optional
                    </span>
                  </span>

                  <input
                    type="email"
                    value={form.email}
                    maxLength={200}
                    placeholder="name@example.com"
                    onChange={(event) =>
                      updateField(
                        "email",
                        event.target.value
                      )
                    }
                  />

                  <small>
                    Add an email if you
                    would like a response.
                  </small>
                </label>

                <div className="help-support-automatic-info">
                  <strong>
                    Information added
                    automatically
                  </strong>

                  <div className="help-support-account-info">
                    <span>
                      Signed-in account
                    </span>

                    <p>
                      {signedInAccount}
                    </p>
                  </div>
                </div>

                {message && (
                  <p
                    className="help-support-message"
                    role="alert"
                  >
                    {message}
                  </p>
                )}

                <div className="help-support-actions">
                  <button
                    type="submit"
                    className="app-button app-button-action"
                    disabled={submitting}
                  >
                    {submitting
                      ? "Preparing report..."
                      : "Submit report"}
                  </button>

                  <button
                    type="button"
                    className="app-button app-button-secondary app-button-action"
                    disabled={submitting}
                    onClick={closeModal}
                  >
                    Cancel
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