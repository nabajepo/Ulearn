export type Meridiem = "AM" | "PM";

type LocalDateTimeInput = {
  date: string;
  hour: number;
  minute: number;
  period: Meridiem;
  timeZone: string;
};

function convertTo24Hour(hour: number, period: Meridiem) {
  if (period === "AM") {
    return hour === 12 ? 0 : hour;
  }

  return hour === 12 ? 12 : hour + 12;
}

/**
 * Converts a wall-clock date in a selected timezone to a UTC ISO string.
 *
 * The browser Date API does not directly construct a date in an arbitrary
 * timezone. This function calculates the timezone offset by comparing the
 * selected zone with UTC.
 */
export function zonedDateTimeToUtc({
  date,
  hour,
  minute,
  period,
  timeZone,
}: LocalDateTimeInput): string | null {
  if (!date || !timeZone) return null;

  const [yearText, monthText, dayText] = date.split("-");

  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  const hour24 = convertTo24Hour(hour, period);

  const initialUtc = new Date(
    Date.UTC(year, month - 1, day, hour24, minute, 0, 0)
  );

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(initialUtc);

  const values: Record<string, string> = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  const representedTime = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );

  const offset = representedTime - initialUtc.getTime();

  return new Date(initialUtc.getTime() - offset).toISOString();
}

export function formatInTimeZone(
  value: string | null,
  timeZone: string
): string {
  if (!value) return "Not selected";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "long",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(date);
}