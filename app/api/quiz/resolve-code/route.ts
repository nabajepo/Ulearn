import "server-only";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  adminDb,
} from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QUIZZES_COLLECTION = "quizzes";

type ResolveCodeBody = {
  code?: unknown;
};

export async function POST(
  request: NextRequest
) {
  try {
    const body =
      (await request.json()) as ResolveCodeBody;

    const rawCode =
      typeof body.code === "string"
        ? body.code
        : "";

    const code = rawCode
      .trim()
      .toUpperCase();

    if (!code) {
      return NextResponse.json(
        {
          success: false,
          reason: "empty_code",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * ULearn access codes currently contain
     * exactly 6 characters.
     */
    if (code.length !== 6) {
      return NextResponse.json(
        {
          success: false,
          reason: "invalid_code",
        },
        {
          status: 400,
        }
      );
    }

    const snapshot =
      await adminDb
        .collection(QUIZZES_COLLECTION)
        .where(
          "accessCode",
          "==",
          code
        )
        .limit(1)
        .get();

    if (snapshot.empty) {
      return NextResponse.json(
        {
          success: false,
          reason: "not_found",
        },
        {
          status: 404,
        }
      );
    }

    const quizDocument =
      snapshot.docs[0];

    const quizData =
      quizDocument.data();

    /*
     * A code must not allow a student
     * to enter a draft or closed quiz.
     */
    if (
      quizData.status !== "launched"
    ) {
      return NextResponse.json(
        {
          success: false,
          reason: "not_available",
        },
        {
          status: 409,
        }
      );
    }

    /*
     * Additional protection:
     * if the quiz deadline has already passed,
     * do not redirect the student to the join page.
     */
    if (
      typeof quizData.availableUntil ===
        "string" &&
      quizData.availableUntil
    ) {
      const availableUntil =
        new Date(
          quizData.availableUntil
        ).getTime();

      if (
        !Number.isNaN(
          availableUntil
        ) &&
        availableUntil <= Date.now()
      ) {
        return NextResponse.json(
          {
            success: false,
            reason: "not_available",
          },
          {
            status: 409,
          }
        );
      }
    }

    return NextResponse.json(
      {
        success: true,
        quizId: quizDocument.id,
      },
      {
        status: 200,
      }
    );
  } catch (error) {
    console.error(
      "Resolve quiz access code failed:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        reason: "server_error",
      },
      {
        status: 500,
      }
    );
  }
}