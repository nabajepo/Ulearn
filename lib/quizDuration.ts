// lib/quizDuration.ts

export type QuizDurationLanguage = "en" | "fr" | "rn";

function pluralizeEnglish(
  value: number,
  singular: string,
  plural: string
) {
  return value === 1 ? singular : plural;
}

/**
 * Formats a duration according to the selected application language.
 *
 * Examples:
 * en: 75   -> "1 hour 15 minutes"
 * fr: 75   -> "1 heure 15 minutes"
 * rn: 75   -> "isaha 1 iminota 15"
 */
export function formatQuizDuration(
  totalMinutes: number,
  language: QuizDurationLanguage = "en"
) {
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

  if (language === "fr") {
    if (days > 0) {
      parts.push(
        `${days} ${days === 1 ? "jour" : "jours"}`
      );
    }

    if (hours > 0) {
      parts.push(
        `${hours} ${hours === 1 ? "heure" : "heures"}`
      );
    }

    if (
      minutes > 0 ||
      parts.length === 0
    ) {
      parts.push(
        `${minutes} ${minutes === 1 ? "minute" : "minutes"}`
      );
    }

    return parts.join(" ");
  }

  if (language === "rn") {
    if (days > 0) {
      parts.push(
        days === 1
          ? "umusi 1"
          : `imisi ${days}`
      );
    }

    if (hours > 0) {
      parts.push(
        hours === 1
          ? "isaha 1"
          : `amasaha ${hours}`
      );
    }

    if (
      minutes > 0 ||
      parts.length === 0
    ) {
      parts.push(
        minutes === 1
          ? "umunota 1"
          : `iminota ${minutes}`
      );
    }

    return parts.join(" ");
  }

  if (days > 0) {
    parts.push(
      `${days} ${pluralizeEnglish(
        days,
        "day",
        "days"
      )}`
    );
  }

  if (hours > 0) {
    parts.push(
      `${hours} ${pluralizeEnglish(
        hours,
        "hour",
        "hours"
      )}`
    );
  }

  if (
    minutes > 0 ||
    parts.length === 0
  ) {
    parts.push(
      `${minutes} ${pluralizeEnglish(
        minutes,
        "minute",
        "minutes"
      )}`
    );
  }

  return parts.join(" ");
}

/**
 * Generates values every 15 minutes and adds the exact maximum
 * when the maximum is not divisible by 15.
 */
export function buildDurationOptions(
  maximumMinutes: number
) {
  const maximum = Math.max(
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

  if (
    maximum % 15 !== 0 &&
    maximum > 0
  ) {
    values.push(maximum);
  }

  return values;
}
