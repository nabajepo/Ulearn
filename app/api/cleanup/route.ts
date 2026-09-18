import "server-only";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  runExpirationCleanup,
} from "@/lib/server/expiration/cleanup";

/*
 * PDF generation, Firebase Admin, Clerk and Buffer
 * require the Node.js runtime.
 */
export const runtime =
  "nodejs";

/*
 * Prevent Next.js from treating this route
 * as static/cached.
 */
export const dynamic =
  "force-dynamic";

/* =========================================================
   Authorization
   ========================================================= */

function isAuthorized(
  request: NextRequest
) {
  const cleanupSecret =
    process.env.CLEANUP_SECRET;

  if (!cleanupSecret) {
    console.error(
      "CLEANUP_SECRET is missing."
    );

    return false;
  }

  const authorization =
    request.headers.get(
      "authorization"
    );

  if (!authorization) {
    return false;
  }

  return (
    authorization ===
    `Bearer ${cleanupSecret}`
  );
}

/* =========================================================
   Cleanup route
   ========================================================= */

export async function GET(
  request: NextRequest
) {
  /* =======================================================
     Security
     ======================================================= */

  if (
    !isAuthorized(
      request
    )
  ) {
    return NextResponse.json(
      {
        success:
          false,

        message:
          "Unauthorized.",
      },
      {
        status:
          401,
      }
    );
  }

  /* =======================================================
     Run cleanup
     ======================================================= */

  try {
    const result =
      await runExpirationCleanup();

    return NextResponse.json(
      {
        success:
          true,

        result,
      },
      {
        status:
          200,
      }
    );
  } catch (
    error
  ) {
    /*
     * Do not expose internal Firebase,
     * Clerk, Resend or environment errors
     * to the external caller.
     */
    console.error(
      "Expiration cleanup route failed:",
      error
    );

    return NextResponse.json(
      {
        success:
          false,

        message:
          "Cleanup failed.",
      },
      {
        status:
          500,
      }
    );
  }
}