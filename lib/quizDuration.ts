// lib/quizDuration.ts

/**
 * Formats a duration in a readable form.
 *
 * Examples:
 * 15   -> "15 minutes"
 * 60   -> "1 hour"
 * 75   -> "1 hour 15 minutes"
 * 1440 -> "1 day"
 * 1530 -> "1 day 1 hour 30 minutes"
 */
export function formatQuizDuration(totalMinutes: number) {
  const safeMinutes = Math.max(
    0,
    Math.floor(totalMinutes)
  );

  const days = Math.floor(
    safeMinutes / (24 * 60)
  );

  const remainingAfterDays =
    safeMinutes % (24 * 60);

  const hours = Math.floor(
    remainingAfterDays / 60
  );

  const minutes =
    remainingAfterDays % 60;

  const parts: string[] = [];

  if (days > 0) {
    parts.push(
      `${days} day${days !== 1 ? "s" : ""}`
    );
  }

  if (hours > 0) {
    parts.push(
      `${hours} hour${hours !== 1 ? "s" : ""}`
    );
  }

  if (
    minutes > 0 ||
    parts.length === 0
  ) {
    parts.push(
      `${minutes} minute${
        minutes !== 1 ? "s" : ""
      }`
    );
  }

  return parts.join(" ");
}

/**
 * Generates values every 15 minutes.
 *
 * 15, 30, 45, 60, 75...
 *
 * The list automatically stops at the maximum duration
 * currently allowed for the quiz.
 */
export function buildDurationOptions(
  maximumMinutes: number
) {
  const maximum =
    Math.max(
      1,
      Math.floor(maximumMinutes)
    );

  const values: number[] = [];

  for (
    let value = 15;
    value <= maximum;
    value += 15
  ) {
    values.push(value);
  }

  /*
   * If the maximum is not divisible by 15,
   * make the exact maximum selectable too.
   *
   * Example:
   * maximum = 139 minutes
   *
   * options:
   * 15, 30, 45 ... 135, 139
   */
  if (
    maximum % 15 !== 0 &&
    maximum > 0
  ) {
    values.push(maximum);
  }

  return values;
}