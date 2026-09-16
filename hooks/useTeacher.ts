"use client";

/**
 * ============================================================================
 * ULearn - useTeacher Hook
 * ============================================================================
 *
 * Purpose
 * -------
 * This hook initializes and manages the currently authenticated teacher.
 *
 * Why does this file exist?
 * -------------------------
 * Every protected page in ULearn needs information about the connected
 * teacher. Instead of repeating authentication and Firestore logic
 * everywhere, this hook centralizes all initialization in one place.
 *
 * Responsibilities
 * ----------------
 * • Read the authenticated Clerk user.
 * • Create the Firestore teacher profile if it does not exist.
 * • Check whether the account has expired.
 * • Load the current teacher profile.
 * • Request the welcome email when it has not yet been sent.
 * • Retry the welcome email later if a previous delivery failed.
 * • Return loading and error states.
 *
 * Workflow
 * --------
 *
 * Clerk Authentication
 *          ↓
 * Retrieve Clerk User
 *          ↓
 * Create / Retrieve Teacher
 *          ↓
 * Check Account Expiration
 *          ↓
 * Load Teacher Profile
 *          ↓
 * welcomeEmailSentAt === null ?
 *       ↙                 ↘
 *     YES                  NO
 *      ↓                    ↓
 * Request Welcome Email     │
 *      ↓                    │
 *      └─────────┬──────────┘
 *                ↓
 *             Dashboard
 *
 * Important
 * ---------
 * Welcome-email failures must NOT block access to the dashboard.
 *
 * The secure email route is responsible for:
 * • authenticating the teacher with Clerk;
 * • determining the recipient;
 * • preventing duplicate emails;
 * • calling Resend securely;
 * • marking welcomeEmailSentAt after success.
 *
 * Used by
 * -------
 * Dashboard
 * Future Protected Pages
 * ============================================================================
 */

import {
  useEffect,
  useState,
} from "react";

import {
  useUser,
} from "@clerk/nextjs";

import {
  cleanupExpiredTeacher,
  createTeacher,
  type Teacher,
} from "@/lib/services/users";

/**
 * Response returned by:
 *
 * POST /api/email/teacher-welcome
 */
type WelcomeEmailResponse = {
  success: boolean;

  /**
   * true:
   * The email was sent during this request.
   *
   * false:
   * The email had already been sent.
   */
  sent?: boolean;

  /**
   * UTC ISO timestamp returned when the welcome email
   * has been successfully recorded as sent.
   */
  sentAt?: string;

  message?: string;
};

/**
 * Sends the welcome-email request to the secure
 * server-side API route.
 *
 * IMPORTANT:
 * ----------
 * No teacher ID, email address, teacher name,
 * expiration date or other sensitive information
 * is sent from the browser.
 *
 * The server route determines this information from:
 * • the authenticated Clerk session;
 * • the stored teacher profile.
 */
async function requestTeacherWelcomeEmail(): Promise<WelcomeEmailResponse> {
  const response =
    await fetch(
      "/api/email/teacher-welcome",
      {
        method: "POST",

        /**
         * No request body is required.
         *
         * Clerk authentication cookies are automatically
         * available to same-origin requests.
         */
        cache: "no-store",
      }
    );

  let data:
    | WelcomeEmailResponse
    | null = null;

  try {
    data =
      (await response.json()) as WelcomeEmailResponse;
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(
      data?.message ||
        `Welcome email request failed with status ${response.status}.`
    );
  }

  if (!data) {
    throw new Error(
      "Welcome email route returned an invalid response."
    );
  }

  return data;
}

/**
 * ============================================================================
 * useTeacher
 * ============================================================================
 */
export function useTeacher() {
  const {
    user,
    isLoaded,
  } = useUser();

  const [
    teacher,
    setTeacher,
  ] =
    useState<Teacher | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    blocked,
    setBlocked,
  ] =
    useState(false);

  const [
    message,
    setMessage,
  ] =
    useState("");

  useEffect(() => {
    /**
     * Prevent React state updates after this effect
     * has been cleaned up.
     *
     * This can happen when:
     * • the component unmounts;
     * • the authenticated Clerk user changes;
     * • React replaces this effect execution.
     */
    let cancelled = false;

    async function initializeTeacher() {
      /**
       * ----------------------------------------------------------------------
       * 1. Wait for Clerk
       * ----------------------------------------------------------------------
       */
      if (!isLoaded) {
        return;
      }

      /**
       * ----------------------------------------------------------------------
       * 2. Require an authenticated user
       * ----------------------------------------------------------------------
       */
      if (!user) {
        if (!cancelled) {
          setTeacher(null);

          setLoading(false);

          setBlocked(true);

          setMessage(
            "User not authenticated."
          );
        }

        return;
      }

      try {
        /**
         * Reset initialization state.
         */
        if (!cancelled) {
          setLoading(true);

          setBlocked(false);

          setMessage("");
        }

        /**
         * --------------------------------------------------------------------
         * 3. Prepare teacher identity from Clerk
         * --------------------------------------------------------------------
         */
        const fullName =
          user.fullName ||
          user.firstName ||
          user.primaryEmailAddress
            ?.emailAddress ||
          "Professor";

        const email =
          user.primaryEmailAddress
            ?.emailAddress ||
          "";

        /**
         * --------------------------------------------------------------------
         * 4. Create or retrieve the teacher profile
         * --------------------------------------------------------------------
         *
         * createTeacher() behaves idempotently:
         *
         * New teacher:
         * created === true
         *
         * Existing teacher:
         * created === false
         */
        const result =
          await createTeacher({
            id: user.id,
            name: fullName,
            email,
          });

        /**
         * Teacher creation/retrieval failed.
         *
         * Example:
         * The global teacher-account limit has been reached.
         */
        if (
          !result.success ||
          !result.teacher
        ) {
          if (!cancelled) {
            setTeacher(null);

            setBlocked(true);

            setMessage(
              result.message
            );
          }

          return;
        }

        /**
         * --------------------------------------------------------------------
         * 5. Check account expiration
         * --------------------------------------------------------------------
         *
         * This must happen BEFORE requesting the welcome email.
         *
         * An expired account must never receive a delayed
         * welcome email.
         */
        const cleanup =
          await cleanupExpiredTeacher(
            user.id
          );

        if (cleanup.deleted) {
          if (!cancelled) {
            setTeacher(null);

            setBlocked(true);

            setMessage(
              "Your account has expired."
            );
          }

          return;
        }

        /**
         * --------------------------------------------------------------------
         * 6. Make the teacher available to the application
         * --------------------------------------------------------------------
         */
        if (!cancelled) {
          setTeacher(
            result.teacher
          );
        }

        /**
         * --------------------------------------------------------------------
         * 7. Determine whether the Welcome email needs to be requested
         * --------------------------------------------------------------------
         *
         * We intentionally DO NOT use:
         *
         * if (result.created)
         *
         * as the only condition.
         *
         * Why?
         * ----
         * Imagine:
         *
         * 1. Teacher account is created.
         * 2. Resend temporarily fails.
         * 3. welcomeEmailSentAt remains null.
         * 4. Teacher returns later.
         * 5. createTeacher() now returns created === false.
         *
         * If we checked only result.created, ULearn would never
         * retry the welcome email.
         *
         * Instead, welcomeEmailSentAt is the persistent state
         * indicating whether the email was successfully sent.
         */
        const shouldRequestWelcomeEmail =
          result.teacher
            .welcomeEmailSentAt ===
          null;

        /**
         * --------------------------------------------------------------------
         * 8. Request Welcome email if necessary
         * --------------------------------------------------------------------
         */
        if (
          shouldRequestWelcomeEmail
        ) {
          try {
            const emailResult =
              await requestTeacherWelcomeEmail();

            /**
             * The email was actually sent during
             * this request.
             */
            if (
              emailResult.sent ===
              true
            ) {
              console.info(
                "Teacher welcome email sent."
              );

              /**
               * Keep the local teacher state synchronized
               * with the Firestore update performed by
               * the server route.
               *
               * This avoids keeping:
               *
               * welcomeEmailSentAt: null
               *
               * in React memory after a successful send.
               */
              if (
                !cancelled &&
                emailResult.sentAt
              ) {
                setTeacher(
                  (currentTeacher) => {
                    if (
                      !currentTeacher
                    ) {
                      return currentTeacher;
                    }

                    return {
                      ...currentTeacher,

                      welcomeEmailSentAt:
                        emailResult.sentAt ??
                        currentTeacher
                          .welcomeEmailSentAt,
                    };
                  }
                );
              }
            }

            /**
             * The server determined that the Welcome
             * email had already been sent.
             *
             * This can happen if another request completed
             * first.
             */
            if (
              emailResult.sent ===
              false
            ) {
              console.info(
                "Teacher welcome email was already sent."
              );
            }
          } catch (
            emailError
          ) {
            /**
             * IMPORTANT:
             *
             * Email delivery failure must NOT block the
             * teacher account.
             *
             * welcomeEmailSentAt remains null, allowing
             * ULearn to retry on a future initialization.
             */
            console.error(
              "Unable to send teacher welcome email:",
              emailError
            );
          }
        }
      } catch (error) {
        /**
         * --------------------------------------------------------------------
         * 9. Teacher initialization failure
         * --------------------------------------------------------------------
         */
        console.error(
          "Error initializing teacher:",
          error
        );

        if (!cancelled) {
          setTeacher(null);

          setBlocked(true);

          setMessage(
            "Unable to prepare your dashboard."
          );
        }
      } finally {
        /**
         * --------------------------------------------------------------------
         * 10. Finish loading
         * --------------------------------------------------------------------
         *
         * Preserve the existing ULearn loading experience.
         *
         * The dashboard loading screen remains visible
         * for approximately 3 seconds.
         */
        window.setTimeout(
          () => {
            if (!cancelled) {
              setLoading(false);
            }
          },
          3000
        );
      }
    }

    initializeTeacher();

    /**
     * Effect cleanup.
     */
    return () => {
      cancelled = true;
    };
  }, [
    isLoaded,
    user,
  ]);

  return {
    teacher,
    loading,
    blocked,
    message,
  };
}