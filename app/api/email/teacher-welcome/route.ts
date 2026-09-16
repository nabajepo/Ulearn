// app/api/email/teacher-welcome/route.ts

import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { getTeacherWelcomeEmailTemplate } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/mailer";

import {
  getTeacher,
  isTeacherExpired,
  markTeacherWelcomeEmailAsSent,
} from "@/lib/services/users";

/**
 * ============================================================================
 * ULearn - Teacher Welcome Email Route
 * ============================================================================
 *
 * Purpose
 * -------
 * Sends the welcome email to a newly created teacher.
 *
 * Security
 * --------
 * • The teacher identity comes from Clerk on the server.
 * • The browser cannot choose the teacher ID.
 * • The browser cannot choose the recipient email.
 * • The browser cannot choose the expiration date.
 * • The Resend API key never reaches the client.
 *
 * Duplicate protection
 * --------------------
 * The welcome email is sent only when:
 *
 * welcomeEmailSentAt === null
 *
 * After a successful Resend request, the Firestore teacher
 * profile is updated with the exact send timestamp.
 *
 * Important
 * ---------
 * This field prevents normal duplicate sends caused by:
 * • page refreshes;
 * • dashboard revisits;
 * • future logins.
 *
 * More advanced concurrency protection can later be added
 * if necessary.
 * ============================================================================
 */

export async function POST() {
  try {
    /**
     * ------------------------------------------------------------------------
     * 1. Verify Clerk authentication
     * ------------------------------------------------------------------------
     */
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized.",
        },
        {
          status: 401,
        }
      );
    }

    /**
     * ------------------------------------------------------------------------
     * 2. Retrieve the authenticated Clerk user
     * ------------------------------------------------------------------------
     *
     * We use Clerk server-side information as an additional
     * identity check.
     */
    const clerkUser = await currentUser();

    if (!clerkUser) {
      return NextResponse.json(
        {
          success: false,
          message: "Authenticated user not found.",
        },
        {
          status: 401,
        }
      );
    }

    /**
     * ------------------------------------------------------------------------
     * 3. Retrieve the teacher profile
     * ------------------------------------------------------------------------
     *
     * The Firestore document ID must be the authenticated
     * Clerk user ID.
     */
    const teacher = await getTeacher(userId);

    if (!teacher) {
      return NextResponse.json(
        {
          success: false,
          message: "Teacher profile not found.",
        },
        {
          status: 404,
        }
      );
    }

    /**
     * ------------------------------------------------------------------------
     * 4. Do not send email to an expired account
     * ------------------------------------------------------------------------
     */
    if (
      teacher.status === "expired" ||
      isTeacherExpired(teacher.expiresAt)
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Teacher account has expired.",
        },
        {
          status: 410,
        }
      );
    }

    /**
     * ------------------------------------------------------------------------
     * 5. Prevent normal duplicate welcome emails
     * ------------------------------------------------------------------------
     */
    if (teacher.welcomeEmailSentAt) {
      return NextResponse.json(
        {
          success: true,
          sent: false,
          message: "Welcome email already sent.",
        },
        {
          status: 200,
        }
      );
    }

    /**
     * ------------------------------------------------------------------------
     * 6. Determine the authoritative recipient email
     * ------------------------------------------------------------------------
     *
     * We prefer Clerk's primary email address.
     *
     * The email is NOT accepted from request.body.
     */
    const clerkEmail =
      clerkUser.primaryEmailAddress?.emailAddress
        ?.trim()
        .toLowerCase() || "";

    const teacherEmail =
      teacher.email.trim().toLowerCase();

    if (!clerkEmail) {
      return NextResponse.json(
        {
          success: false,
          message:
            "No primary email address is available for this account.",
        },
        {
          status: 400,
        }
      );
    }

    /**
     * The Firestore profile should belong to exactly the
     * same authenticated Clerk account.
     *
     * If the two email addresses differ, we stop instead
     * of sending potentially sensitive account information
     * to an unexpected address.
     */
    if (
      teacherEmail &&
      teacherEmail !== clerkEmail
    ) {
      console.error(
        "Teacher email mismatch:",
        {
          teacherId: userId,
        }
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "Teacher email does not match the authenticated account.",
        },
        {
          status: 409,
        }
      );
    }

    /**
     * ------------------------------------------------------------------------
     * 7. Validate the expiration timestamp
     * ------------------------------------------------------------------------
     */
    const expirationDate =
      new Date(teacher.expiresAt);

    if (
      Number.isNaN(
        expirationDate.getTime()
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Teacher expiration date is invalid.",
        },
        {
          status: 500,
        }
      );
    }

    /**
     * ------------------------------------------------------------------------
     * 8. Build the multilingual welcome email
     * ------------------------------------------------------------------------
     *
     * One email contains:
     * • English
     * • French
     * • Kirundi
     */
    const emailTemplate =
      getTeacherWelcomeEmailTemplate({
        teacherName:
          teacher.name ||
          clerkUser.fullName ||
          clerkUser.firstName ||
          "Professor",

        expirationDate,
      });

    /**
     * ------------------------------------------------------------------------
     * 9. Send through Resend
     * ------------------------------------------------------------------------
     *
     * The idempotency key gives Resend another layer of
     * protection against accidental duplicate requests.
     *
     * The key is deterministic for this teacher/account.
     */
    const idempotencyKey =
      `teacher-welcome-${userId}-${teacher.createdAt}`;

    await sendEmail({
      to: clerkEmail,

      subject:
        emailTemplate.subject,

      html:
        emailTemplate.html,

      text:
        emailTemplate.text,

      idempotencyKey,
    });

    /**
     * ------------------------------------------------------------------------
     * 10. Mark the email as sent
     * ------------------------------------------------------------------------
     *
     * IMPORTANT:
     * We update Firestore only AFTER Resend accepts the email.
     *
     * If Resend throws an error, execution never reaches
     * this point and welcomeEmailSentAt remains null.
     *
     * That allows ULearn to retry later.
     */
    const sentAt =
      await markTeacherWelcomeEmailAsSent(
        userId
      );

    return NextResponse.json(
      {
        success: true,
        sent: true,
        sentAt,
        message:
          "Welcome email sent successfully.",
      },
      {
        status: 200,
      }
    );
  } catch (error) {
    console.error(
      "Teacher welcome email error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "Unable to send the welcome email.",
      },
      {
        status: 500,
      }
    );
  }
}