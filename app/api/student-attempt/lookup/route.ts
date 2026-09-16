import { NextRequest, NextResponse } from "next/server";

import { getQuiz } from "@/lib/services/quizzes";
import { getAttemptByStudentEmail } from "@/lib/services/attempts";

const MAX_STUDENT_NAME_LENGTH = 120;
const MAX_STUDENT_EMAIL_LENGTH = 200;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      quizId?: unknown;
      studentName?: unknown;
      studentEmail?: unknown;
    };

    const quizId =
      typeof body.quizId === "string"
        ? body.quizId.trim()
        : "";

    const studentName =
      typeof body.studentName === "string"
        ? body.studentName.trim()
        : "";

    const studentEmail =
      typeof body.studentEmail === "string"
        ? normalizeEmail(body.studentEmail)
        : "";

    /* =====================================================
       Validate identity
       ===================================================== */

    if (!quizId) {
      return NextResponse.json(
        {
          success: false,
          messageKey: "join.errors.invalidQuiz",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !studentName ||
      studentName.length < 2 ||
      studentName.length > MAX_STUDENT_NAME_LENGTH
    ) {
      return NextResponse.json(
        {
          success: false,
          messageKey: "join.errors.invalidName",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !studentEmail ||
      studentEmail.length > MAX_STUDENT_EMAIL_LENGTH ||
      !isValidEmail(studentEmail)
    ) {
      return NextResponse.json(
        {
          success: false,
          messageKey: "join.errors.invalidEmail",
        },
        {
          status: 400,
        }
      );
    }

    /* =====================================================
       Quiz
       ===================================================== */

    const quiz = await getQuiz(quizId);

    if (!quiz) {
      return NextResponse.json(
        {
          success: false,
          messageKey: "join.errors.quizNotFound",
        },
        {
          status: 404,
        }
      );
    }

    /* =====================================================
       Existing identity
       ===================================================== */

    const existingAttempt =
      await getAttemptByStudentEmail(
        quiz.id,
        studentEmail
      );

    if (!existingAttempt) {
      return NextResponse.json({
        success: true,
        mode: "new",
      });
    }

    /* =====================================================
       Existing completed attempt
       ===================================================== */

    if (existingAttempt.status === "submitted") {
      return NextResponse.json({
        success: true,
        mode: "completed",
        status: "submitted",
        attemptId: existingAttempt.id,
      });
    }

    if (existingAttempt.status === "graded") {
      return NextResponse.json({
        success: true,
        mode: "completed",
        status: "graded",
        attemptId: existingAttempt.id,
      });
    }

    /* =====================================================
       Existing in-progress attempt
       ===================================================== */

    return NextResponse.json({
      success: true,
      mode: "existing",
    });
  } catch (error) {
    console.error(
      "Student attempt lookup error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        messageKey: "join.errors.generic",
      },
      {
        status: 500,
      }
    );
  }
}