export function normalizeSchedulableFocusTitle(title: string) {
  const cleanedTitle = normalizeWhitespace(title);

  if (!looksLikeRoutineTitle(cleanedTitle)) {
    return cleanedTitle;
  }

  const activityText =
    extractRoutineActivityText(cleanedTitle) ?? cleanedTitle;
  const normalizedActivity = normalizeWhitespace(
    activityText
      .replace(
        /\b(?:daily|weekly|monthly|weekday|weekdays|every\s+day|each\s+day|every\s+week|each\s+week)\b/giu,
        " ",
      )
      .replace(/\b\d{1,2}\s*(?:x|times?)\s*(?:a|per)?\s*week\b/giu, " ")
      .replace(
        /\b(?:for|about|around)?\s*\d{1,3}[-\s]*(?:minute|minutes|min|mins|hour|hours|hr|hrs)\b/giu,
        " ",
      )
      .replace(/\b(?:focus\s+routine|routine|habit)\b/giu, " ")
      .replace(/\b(?:a|an|the|my|to|for)\b/giu, " "),
  );

  return normalizedActivity
    ? formatActivityTitle(normalizedActivity)
    : cleanedTitle;
}

function looksLikeRoutineTitle(title: string) {
  return (
    /\b(?:routine|habit)\b/iu.test(title) ||
    /\b(?:daily|weekly|monthly|weekday|weekdays|every\s+day|each\s+day|every\s+week|each\s+week)\b/iu.test(
      title,
    )
  );
}

function extractRoutineActivityText(title: string) {
  const routineToMatch =
    /\b(?:focus\s+routine|routine|habit)\s+to\s+(?<activity>.+)$/iu.exec(
      title,
    );

  return routineToMatch?.groups?.activity ?? null;
}

function formatActivityTitle(value: string) {
  const normalized = value.toLowerCase();
  const singleActivityTitle = normalizeSingleActivityTitle(normalized);

  if (singleActivityTitle) {
    return singleActivityTitle;
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function normalizeSingleActivityTitle(value: string) {
  switch (value) {
    case "meditating":
    case "meditation":
      return "Meditate";
    case "journaling":
      return "Journal";
    case "reading":
      return "Read";
    case "stretching":
      return "Stretch";
    case "walking":
      return "Walk";
    case "running":
      return "Run";
    case "exercising":
    case "working out":
      return "Workout";
    case "cleaning":
      return "Clean";
    case "writing":
      return "Write";
    default:
      return null;
  }
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/gu, " ").trim();
}
