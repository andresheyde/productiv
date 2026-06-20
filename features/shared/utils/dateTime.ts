type DateInput = Date | string;

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;

export function parseDateForDisplay(value: DateInput) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const trimmedValue = value.trim();
  const dateOnlyMatch = DATE_ONLY_PATTERN.exec(trimmedValue);

  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    const yearNumber = Number.parseInt(year, 10);
    const monthNumber = Number.parseInt(month, 10);
    const dayNumber = Number.parseInt(day, 10);
    const parsed = new Date(
      yearNumber,
      monthNumber - 1,
      dayNumber,
    );

    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.getFullYear() !== yearNumber ||
      parsed.getMonth() !== monthNumber - 1 ||
      parsed.getDate() !== dayNumber
    ) {
      return null;
    }

    return parsed;
  }

  const parsed = new Date(trimmedValue);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatLocaleDate(
  value: DateInput,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
  fallback?: string,
) {
  return formatLocaleDateInput(value, options, fallback);
}

export function formatLocaleDateTime(value: DateInput, fallback?: string) {
  return formatLocaleDateInput(
    value,
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
    fallback,
  );
}

export function formatLocaleDateOrDateTime(
  value: DateInput,
  fallback?: string,
) {
  return formatLocaleDateInput(
    value,
    typeof value === "string" && DATE_ONLY_PATTERN.test(value.trim())
      ? { dateStyle: "medium" }
      : { dateStyle: "medium", timeStyle: "short" },
    fallback,
  );
}

export function formatLocaleTime(
  value: DateInput,
  options: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
  },
  fallback?: string,
) {
  return formatLocaleDateInput(value, options, fallback);
}

export function formatLocaleHour(hour: number) {
  return formatLocaleTime(new Date(2026, 0, 1, hour), {
    hour: "numeric",
  });
}

function formatLocaleDateInput(
  value: DateInput,
  options: Intl.DateTimeFormatOptions,
  fallback?: string,
) {
  const parsed = parseDateForDisplay(value);

  if (!parsed) {
    return fallback ?? (typeof value === "string" ? value : "");
  }

  return new Intl.DateTimeFormat(undefined, options).format(parsed);
}
