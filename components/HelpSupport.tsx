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

import { useLanguage } from "@/hooks/useLanguage";

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
  const {
    user,
    isLoaded,
  } = useUser();

  const { t } = useLanguage();

  const firstInputRef =
    useRef<HTMLInputElement | null>(
      null
    );

  const [open, setOpen] =
    useState(false);

  const [form, setForm] =
    useState<FormState>(
      INITIAL_FORM
    );

  const [message, setMessage] =
    useState("");

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    submitted,
    setSubmitted,
  ] = useState(false);

  const userEmail =
    useMemo(() => {
      if (
        !isLoaded ||
        !user
      ) {
        return "";
      }

      return (
        user.primaryEmailAddress
          ?.emailAddress || ""
      );
    }, [
      isLoaded,
      user,
    ]);

  const signedInAccount =
    useMemo(() => {
      if (!isLoaded) {
        return t(
          "help.account.loading"
        );
      }

      if (!user) {
        return t(
          "help.account.notSignedIn"
        );
      }

      return (
        user.fullName ||
        userEmail ||
        t(
          "help.account.authenticatedUser"
        )
      );
    }, [
      isLoaded,
      user,
      userEmail,
      t,
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
        event.key ===
          "Escape" &&
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
      document.body.style
        .overflow;

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

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>
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
        t(
          "help.validation.actionRequired"
        )
      );

      return;
    }

    if (!cleanDescription) {
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
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
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

    setSubmitting(true);
    setMessage("");

    try {
      const supportReport = {
        action:
          cleanAction,

        description:
          cleanDescription,

        email:
          cleanEmail ||
          null,

        teacherId:
          user?.id ||
          null,

        teacherName:
          user?.fullName ||
          null,

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

      setForm(
        INITIAL_FORM
      );
    } catch (error) {
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
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="help-support-button"
        onClick={openModal}
        aria-label={t(
          "help.openAriaLabel"
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="help-support-icon">
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

                <h2 id="help-dialog-title">
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
                <div className="help-support-success-icon">
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
                      150
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
                    }{" "}
                    / 150{" "}
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
                      1500
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
                    }{" "}
                    / 1500{" "}
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
                      200
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
                        signedInAccount
                      }
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