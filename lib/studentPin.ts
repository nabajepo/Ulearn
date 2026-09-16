// lib/studentPin.ts

import "server-only";

import {
  createHmac,
  randomInt,
  timingSafeEqual,
} from "crypto";

/* =========================================================
   Constants
   ========================================================= */

export const STUDENT_PIN_LENGTH = 6;

export const MAX_STUDENT_PIN_ATTEMPTS = 5;

/*
 * Temporary lock after too many incorrect PIN attempts.
 */
export const STUDENT_PIN_LOCK_MINUTES = 15;

/*
 * Temporary reset code configuration.
 *
 * The professor receives this code once and communicates
 * it directly to the student.
 */
export const STUDENT_PIN_RESET_CODE_LENGTH = 6;

export const STUDENT_PIN_RESET_CODE_EXPIRATION_MINUTES = 10;

export const MAX_STUDENT_PIN_RESET_CODE_ATTEMPTS = 5;

/* =========================================================
   Secret
   ========================================================= */

function getStudentVerificationSecret() {
  const secret =
    process.env.STUDENT_VERIFICATION_SECRET;

  if (!secret) {
    throw new Error(
      "STUDENT_VERIFICATION_SECRET is missing."
    );
  }

  if (secret.length < 32) {
    throw new Error(
      "STUDENT_VERIFICATION_SECRET must contain at least 32 characters."
    );
  }

  return secret;
}

/* =========================================================
   Shared helpers
   ========================================================= */

function normalizeEmail(
  value: string
) {
  return value
    .trim()
    .toLowerCase();
}

function normalizeQuizId(
  value: string
) {
  return value.trim();
}

function safeCompareHexHashes(
  firstHash: string,
  secondHash: string
) {
  if (
    !firstHash ||
    !secondHash
  ) {
    return false;
  }

  /*
   * A SHA-256 hash represented in hexadecimal normally
   * contains exactly 64 characters.
   *
   * We still safely handle malformed values instead of
   * allowing Buffer/timingSafeEqual errors to propagate.
   */
  if (
    !/^[a-f0-9]{64}$/i.test(
      firstHash
    ) ||
    !/^[a-f0-9]{64}$/i.test(
      secondHash
    )
  ) {
    return false;
  }

  const firstBuffer =
    Buffer.from(
      firstHash,
      "hex"
    );

  const secondBuffer =
    Buffer.from(
      secondHash,
      "hex"
    );

  if (
    firstBuffer.length !==
    secondBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(
    firstBuffer,
    secondBuffer
  );
}

/* =========================================================
   PIN normalization
   ========================================================= */

export function normalizeStudentPin(
  value: string
) {
  return value.trim();
}

/* =========================================================
   PIN validation
   ========================================================= */

export function isValidStudentPin(
  value: string
) {
  const pin =
    normalizeStudentPin(
      value
    );

  return new RegExp(
    `^\\d{${STUDENT_PIN_LENGTH}}$`
  ).test(pin);
}

/* =========================================================
   PIN hash
   ========================================================= */

/*
 * The PIN itself is NEVER stored.
 *
 * We use:
 *
 * HMAC-SHA256(
 *   STUDENT_VERIFICATION_SECRET,
 *   quiz + student identity + PIN
 * )
 *
 * quizId and normalized email are included so that the
 * resulting value is tied to this particular student
 * participation.
 */

export function hashStudentPin({
  pin,
  quizId,
  studentEmail,
}: {
  pin: string;
  quizId: string;
  studentEmail: string;
}) {
  const normalizedPin =
    normalizeStudentPin(
      pin
    );

  if (
    !isValidStudentPin(
      normalizedPin
    )
  ) {
    throw new Error(
      `Student PIN must contain exactly ${STUDENT_PIN_LENGTH} digits.`
    );
  }

  const normalizedQuizId =
    normalizeQuizId(
      quizId
    );

  const normalizedEmail =
    normalizeEmail(
      studentEmail
    );

  if (
    !normalizedQuizId ||
    !normalizedEmail
  ) {
    throw new Error(
      "Quiz ID and student email are required to hash a student PIN."
    );
  }

  const secret =
    getStudentVerificationSecret();

  /*
   * Domain separation:
   *
   * "ulearn-student-pin-v1" ensures that a PIN hash
   * cannot be confused with a reset-code hash even though
   * both use the same server secret.
   */
  const value =
    [
      "ulearn-student-pin-v1",
      normalizedQuizId,
      normalizedEmail,
      normalizedPin,
    ].join(":");

  return createHmac(
    "sha256",
    secret
  )
    .update(value)
    .digest("hex");
}

/* =========================================================
   PIN verification
   ========================================================= */

export function verifyStudentPin({
  pin,
  quizId,
  studentEmail,
  storedHash,
}: {
  pin: string;
  quizId: string;
  studentEmail: string;
  storedHash: string;
}) {
  if (
    !storedHash ||
    !isValidStudentPin(
      pin
    )
  ) {
    return false;
  }

  const candidateHash =
    hashStudentPin({
      pin,
      quizId,
      studentEmail,
    });

  return safeCompareHexHashes(
    candidateHash,
    storedHash
  );
}

/* =========================================================
   PIN lock expiration
   ========================================================= */

export function createStudentPinLockUntil() {
  return new Date(
    Date.now() +
      STUDENT_PIN_LOCK_MINUTES *
        60 *
        1000
  ).toISOString();
}

/* =========================================================
   Check PIN lock
   ========================================================= */

export function isStudentPinLocked(
  lockedUntil: string | null
) {
  if (!lockedUntil) {
    return false;
  }

  const timestamp =
    new Date(
      lockedUntil
    ).getTime();

  if (
    Number.isNaN(
      timestamp
    )
  ) {
    return false;
  }

  return (
    timestamp >
    Date.now()
  );
}

/* =========================================================
   Remaining PIN lock time
   ========================================================= */

export function getStudentPinLockRemainingSeconds(
  lockedUntil: string | null
) {
  if (!lockedUntil) {
    return 0;
  }

  const timestamp =
    new Date(
      lockedUntil
    ).getTime();

  if (
    Number.isNaN(
      timestamp
    )
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.ceil(
      (
        timestamp -
        Date.now()
      ) /
        1000
    )
  );
}

/* =========================================================
   Reset code normalization
   ========================================================= */

export function normalizeStudentPinResetCode(
  value: string
) {
  return value.trim();
}

/* =========================================================
   Reset code validation
   ========================================================= */

export function isValidStudentPinResetCode(
  value: string
) {
  const code =
    normalizeStudentPinResetCode(
      value
    );

  return new RegExp(
    `^\\d{${STUDENT_PIN_RESET_CODE_LENGTH}}$`
  ).test(code);
}

/* =========================================================
   Generate reset code
   ========================================================= */

/*
 * Generates a cryptographically secure 6-digit code.
 *
 * Example:
 *
 * 847291
 *
 * The returned code is shown ONCE to the professor.
 * It must never be stored directly in Firestore.
 */
export function generateStudentPinResetCode() {
  const minimum =
    10 **
    (
      STUDENT_PIN_RESET_CODE_LENGTH -
      1
    );

  const maximum =
    10 **
    STUDENT_PIN_RESET_CODE_LENGTH;

  return String(
    randomInt(
      minimum,
      maximum
    )
  );
}

/* =========================================================
   Reset code hash
   ========================================================= */

/*
 * The reset code uses its own HMAC domain:
 *
 * ulearn-student-pin-reset-v1
 *
 * Therefore:
 *
 * PIN 123456
 *
 * and
 *
 * reset code 123456
 *
 * do NOT produce interchangeable hashes.
 */
export function hashStudentPinResetCode({
  code,
  quizId,
  studentEmail,
}: {
  code: string;
  quizId: string;
  studentEmail: string;
}) {
  const normalizedCode =
    normalizeStudentPinResetCode(
      code
    );

  if (
    !isValidStudentPinResetCode(
      normalizedCode
    )
  ) {
    throw new Error(
      `Student PIN reset code must contain exactly ${STUDENT_PIN_RESET_CODE_LENGTH} digits.`
    );
  }

  const normalizedQuizId =
    normalizeQuizId(
      quizId
    );

  const normalizedEmail =
    normalizeEmail(
      studentEmail
    );

  if (
    !normalizedQuizId ||
    !normalizedEmail
  ) {
    throw new Error(
      "Quiz ID and student email are required to hash a student PIN reset code."
    );
  }

  const secret =
    getStudentVerificationSecret();

  const value =
    [
      "ulearn-student-pin-reset-v1",
      normalizedQuizId,
      normalizedEmail,
      normalizedCode,
    ].join(":");

  return createHmac(
    "sha256",
    secret
  )
    .update(value)
    .digest("hex");
}

/* =========================================================
   Reset code verification
   ========================================================= */

export function verifyStudentPinResetCode({
  code,
  quizId,
  studentEmail,
  storedHash,
}: {
  code: string;
  quizId: string;
  studentEmail: string;
  storedHash: string;
}) {
  if (
    !storedHash ||
    !isValidStudentPinResetCode(
      code
    )
  ) {
    return false;
  }

  const candidateHash =
    hashStudentPinResetCode({
      code,
      quizId,
      studentEmail,
    });

  return safeCompareHexHashes(
    candidateHash,
    storedHash
  );
}

/* =========================================================
   Reset code expiration
   ========================================================= */

/*
 * Called when the professor approves a reset request.
 *
 * The temporary code will remain valid for 10 minutes.
 */
export function createStudentPinResetCodeExpiresAt() {
  return new Date(
    Date.now() +
      STUDENT_PIN_RESET_CODE_EXPIRATION_MINUTES *
        60 *
        1000
  ).toISOString();
}

/* =========================================================
   Check reset code expiration
   ========================================================= */

export function isStudentPinResetCodeExpired(
  expiresAt: string | null
) {
  if (!expiresAt) {
    return true;
  }

  const timestamp =
    new Date(
      expiresAt
    ).getTime();

  if (
    Number.isNaN(
      timestamp
    )
  ) {
    return true;
  }

  return (
    timestamp <=
    Date.now()
  );
}

/* =========================================================
   Remaining reset code time
   ========================================================= */

export function getStudentPinResetCodeRemainingSeconds(
  expiresAt: string | null
) {
  if (!expiresAt) {
    return 0;
  }

  const timestamp =
    new Date(
      expiresAt
    ).getTime();

  if (
    Number.isNaN(
      timestamp
    )
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.ceil(
      (
        timestamp -
        Date.now()
      ) /
        1000
    )
  );
}