import { NextRequest, NextResponse } from "next/server";

import { sendEmail } from "@/lib/email/mailer";

/* =========================================================
   Types
   ========================================================= */

type SupportAccountType =
  | "teacher"
  | "student"
  | "anonymous";

type SupportRequestBody = {
  action?: unknown;
  description?: unknown;
  email?: unknown;

  accountType?: unknown;

  studentName?: unknown;
  studentEmail?: unknown;
  attemptId?: unknown;
  quizId?: unknown;

  teacherId?: unknown;
  teacherName?: unknown;
  teacherEmail?: unknown;

  signedInAccount?: unknown;
};

/* =========================================================
   Constants
   ========================================================= */

const MAX_ACTION_LENGTH = 150;
const MAX_DESCRIPTION_LENGTH = 1500;
const MAX_EMAIL_LENGTH = 200;

const MAX_NAME_LENGTH = 150;
const MAX_ID_LENGTH = 250;

/* =========================================================
   Helpers
   ========================================================= */

function cleanString(
  value: unknown,
  maxLength: number
) {
  if (
    typeof value !== "string"
  ) {
    return "";
  }

  return value
    .trim()
    .slice(
      0,
      maxLength
    );
}

function normalizeEmail(
  value: unknown
) {
  return cleanString(
    value,
    MAX_EMAIL_LENGTH
  ).toLowerCase();
}

function isValidEmail(
  value: string
) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value
  );
}

function escapeHtml(
  value: string
) {
  return value
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}

function formatOptionalValue(
  value: string
) {
  return value || "Not provided";
}

function getAccountType(
  value: unknown
): SupportAccountType {
  if (
    value === "teacher" ||
    value === "student"
  ) {
    return value;
  }

  return "anonymous";
}

/* =========================================================
   POST /api/support
   ========================================================= */

export async function POST(
  request: NextRequest
) {
  try {
    /* =====================================================
       Configuration
       ===================================================== */

    const supportEmail =
      process.env.SUPPORT_EMAIL
        ?.trim()
        .toLowerCase();

    if (
      !supportEmail ||
      !isValidEmail(
        supportEmail
      )
    ) {
      console.error(
        "SUPPORT_EMAIL is missing or invalid."
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "Support email is not configured.",
        },
        {
          status: 500,
        }
      );
    }

    /* =====================================================
       Parse request
       ===================================================== */

    let body:
      SupportRequestBody;

    try {
      body =
        (await request.json()) as
          SupportRequestBody;
    } catch {
      return NextResponse.json(
        {
          success: false,
          message:
            "Invalid request body.",
        },
        {
          status: 400,
        }
      );
    }

    /* =====================================================
       Main form fields
       ===================================================== */

    const action =
      cleanString(
        body.action,
        MAX_ACTION_LENGTH
      );

    const description =
      cleanString(
        body.description,
        MAX_DESCRIPTION_LENGTH
      );

    const email =
      normalizeEmail(
        body.email
      );

    const accountType =
      getAccountType(
        body.accountType
      );

    /* =====================================================
       Validation
       ===================================================== */

    if (
      !action
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Action is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !description
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Description is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      description.length <
      10
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Description is too short.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      email &&
      !isValidEmail(
        email
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Invalid email address.",
        },
        {
          status: 400,
        }
      );
    }

    /* =====================================================
       Context information
       ===================================================== */

    const studentName =
      cleanString(
        body.studentName,
        MAX_NAME_LENGTH
      );

    const studentEmail =
      normalizeEmail(
        body.studentEmail
      );

    const attemptId =
      cleanString(
        body.attemptId,
        MAX_ID_LENGTH
      );

    const quizId =
      cleanString(
        body.quizId,
        MAX_ID_LENGTH
      );

    const teacherId =
      cleanString(
        body.teacherId,
        MAX_ID_LENGTH
      );

    const teacherName =
      cleanString(
        body.teacherName,
        MAX_NAME_LENGTH
      );

    const teacherEmail =
      normalizeEmail(
        body.teacherEmail
      );

    const signedInAccount =
      cleanString(
        body.signedInAccount,
        MAX_NAME_LENGTH
      );

    /* =====================================================
       Additional email validation
       ===================================================== */

    if (
      studentEmail &&
      !isValidEmail(
        studentEmail
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Invalid student email address.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      teacherEmail &&
      !isValidEmail(
        teacherEmail
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Invalid teacher email address.",
        },
        {
          status: 400,
        }
      );
    }

    /* =====================================================
       Date
       ===================================================== */

    const createdAt =
      new Date()
        .toISOString();

    /* =====================================================
       Plain text email
       ===================================================== */

    const text = [
      "ULearn support request",
      "",
      `Account type: ${accountType}`,
      `Account: ${formatOptionalValue(signedInAccount)}`,
      `Contact email: ${formatOptionalValue(email)}`,
      "",
      `Action: ${action}`,
      "",
      "Description:",
      description,
      "",
      "Student information:",
      `Name: ${formatOptionalValue(studentName)}`,
      `Email: ${formatOptionalValue(studentEmail)}`,
      `Attempt ID: ${formatOptionalValue(attemptId)}`,
      `Quiz ID: ${formatOptionalValue(quizId)}`,
      "",
      "Teacher information:",
      `Teacher ID: ${formatOptionalValue(teacherId)}`,
      `Name: ${formatOptionalValue(teacherName)}`,
      `Email: ${formatOptionalValue(teacherEmail)}`,
      "",
      `Created at: ${createdAt}`,
    ].join("\n");

    /* =====================================================
       HTML email
       ===================================================== */

    const html = `
      <div
        style="
          font-family: Arial, sans-serif;
          max-width: 680px;
          margin: 0 auto;
          color: #171717;
          line-height: 1.6;
        "
      >
        <div
          style="
            background: #2a0369;
            color: white;
            padding: 24px;
            border-radius: 12px 12px 0 0;
          "
        >
          <h1
            style="
              margin: 0;
              font-size: 24px;
            "
          >
            ULearn Support
          </h1>

          <p
            style="
              margin: 8px 0 0;
              opacity: 0.9;
            "
          >
            New support request
          </p>
        </div>

        <div
          style="
            border: 1px solid #e5e5e5;
            border-top: none;
            padding: 24px;
            border-radius: 0 0 12px 12px;
          "
        >
          <h2>
            ${escapeHtml(action)}
          </h2>

          <p>
            ${escapeHtml(description)
              .replace(
                /\n/g,
                "<br />"
              )}
          </p>

          <hr
            style="
              border: 0;
              border-top: 1px solid #e5e5e5;
              margin: 24px 0;
            "
          />

          <h3>
            Account
          </h3>

          <p>
            <strong>Type:</strong>
            ${escapeHtml(accountType)}
          </p>

          <p>
            <strong>Account:</strong>
            ${escapeHtml(
              formatOptionalValue(
                signedInAccount
              )
            )}
          </p>

          <p>
            <strong>Contact email:</strong>
            ${escapeHtml(
              formatOptionalValue(
                email
              )
            )}
          </p>

          ${
            accountType ===
            "student"
              ? `
                <h3>
                  Student information
                </h3>

                <p>
                  <strong>Name:</strong>
                  ${escapeHtml(
                    formatOptionalValue(
                      studentName
                    )
                  )}
                </p>

                <p>
                  <strong>Email:</strong>
                  ${escapeHtml(
                    formatOptionalValue(
                      studentEmail
                    )
                  )}
                </p>

                <p>
                  <strong>Quiz ID:</strong>
                  ${escapeHtml(
                    formatOptionalValue(
                      quizId
                    )
                  )}
                </p>

                <p>
                  <strong>Attempt ID:</strong>
                  ${escapeHtml(
                    formatOptionalValue(
                      attemptId
                    )
                  )}
                </p>
              `
              : ""
          }

          ${
            accountType ===
            "teacher"
              ? `
                <h3>
                  Teacher information
                </h3>

                <p>
                  <strong>Name:</strong>
                  ${escapeHtml(
                    formatOptionalValue(
                      teacherName
                    )
                  )}
                </p>

                <p>
                  <strong>Email:</strong>
                  ${escapeHtml(
                    formatOptionalValue(
                      teacherEmail
                    )
                  )}
                </p>

                <p>
                  <strong>Teacher ID:</strong>
                  ${escapeHtml(
                    formatOptionalValue(
                      teacherId
                    )
                  )}
                </p>
              `
              : ""
          }

          <hr
            style="
              border: 0;
              border-top: 1px solid #e5e5e5;
              margin: 24px 0;
            "
          />

          <p
            style="
              color: #666;
              font-size: 13px;
            "
          >
            Submitted at
            ${escapeHtml(createdAt)}
          </p>
        </div>
      </div>
    `;

    /* =====================================================
       Send
       ===================================================== */

    const result =
      await sendEmail({
        to:
          supportEmail,

        subject:
          `[ULearn Support] ${action}`,

        html,

        text,
      });

    /* =====================================================
       Success
       ===================================================== */

    return NextResponse.json(
      {
        success: true,
        emailId:
          result.id,
      },
      {
        status: 200,
      }
    );
  } catch (
    error
  ) {
    console.error(
      "Unable to send ULearn support request:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "Unable to send support request.",
      },
      {
        status: 500,
      }
    );
  }
}