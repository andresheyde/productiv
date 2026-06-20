import type { GoalRecord } from "./workspace.types.ts";

export type GoalMetricSpec = {
  name: string;
  unitLabel: string;
  targetValue: number;
};

type GoalMetricSource = Pick<
  GoalRecord,
  "definition" | "notes" | "scheduleGuidance" | "successCriteria" | "title"
>;

const DEFAULT_HOURS_TARGET = 10;
const KNOWN_UNITS: Array<{ unitLabel: string; pattern: RegExp }> = [
  { unitLabel: "applications", pattern: /\b(applications?|job applications?|jobs?)\b/iu },
  { unitLabel: "questions", pattern: /\b(questions?|problems?|prompts?)\b/iu },
  { unitLabel: "interviews", pattern: /\b(interviews?|interview screens?|screens?)\b/iu },
  { unitLabel: "pages", pattern: /\b(pages?|chapters?)\b/iu },
  { unitLabel: "sessions", pattern: /\b(sessions?|workouts?|practices?|blocks?)\b/iu },
  { unitLabel: "reps", pattern: /\b(reps?|repetitions?)\b/iu },
  { unitLabel: "sets", pattern: /\bsets?\b/iu },
  { unitLabel: "miles", pattern: /\b(miles?|mi)\b/iu },
  { unitLabel: "kilometers", pattern: /\b(kilometers?|kilometres?|km)\b/iu },
  { unitLabel: "pounds", pattern: /\b(pounds?|lbs?)\b/iu },
  { unitLabel: "users", pattern: /\b(users?|customers?|beta users?|people)\b/iu },
  { unitLabel: "tasks", pattern: /\b(tasks?|todos?|to-dos?)\b/iu },
  { unitLabel: "hours", pattern: /\b(hours?|hrs?)\b/iu },
];

export function deriveGoalMetricSpecs(goal: GoalMetricSource): GoalMetricSpec[] {
  const specs: GoalMetricSpec[] = [
    {
      name: "Hours spent working on goal",
      unitLabel: "hours",
      targetValue: inferHoursTarget(goal),
    },
  ];

  for (const criterion of goal.successCriteria) {
    const metricSpec = deriveMetricSpecFromSuccessCriterion(criterion);

    if (metricSpec) {
      specs.push(metricSpec);
    }
  }

  return dedupeMetricSpecs(specs);
}

export function normalizeMetricSpecKey(input: {
  name: string;
  unitLabel: string;
}) {
  return `${normalizeMetricText(input.name)}:${normalizeMetricText(input.unitLabel)}`;
}

function deriveMetricSpecFromSuccessCriterion(
  criterion: string,
): GoalMetricSpec | null {
  const targetMatch = criterion.match(
    /\b(?:at least|at minimum|minimum of|more than|over|>=)?\s*(\d+(?:,\d{3})*(?:\.\d+)?)\b/iu,
  );

  if (!targetMatch?.[1] || targetMatch.index === undefined) {
    return null;
  }

  const targetValue = Number(targetMatch[1].replace(/,/gu, ""));

  if (!Number.isFinite(targetValue) || targetValue <= 0) {
    return null;
  }

  const textAfterTarget = criterion.slice(targetMatch.index + targetMatch[0].length);
  const unitLabel = inferMetricUnitLabel(textAfterTarget);

  if (!unitLabel) {
    return null;
  }

  return {
    name: normalizeMetricName(criterion),
    unitLabel,
    targetValue,
  };
}

function inferMetricUnitLabel(value: string) {
  const nearbyWords = value.trim().split(/\s+/u).slice(0, 8).join(" ");

  for (const unit of KNOWN_UNITS) {
    if (unit.pattern.test(nearbyWords)) {
      return unit.unitLabel;
    }
  }

  return null;
}

function inferHoursTarget(goal: GoalMetricSource) {
  const text = [
    goal.title,
    goal.definition,
    goal.successCriteria.join(" "),
    JSON.stringify(goal.scheduleGuidance),
    goal.notes ?? "",
  ].join(" ");
  const minutesMatch = text.match(
    /\b(\d+(?:\.\d+)?)\s*(?:minutes?|mins?)\b/iu,
  );
  const hoursMatch = text.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/iu);
  const days = inferPlanningDays(text);
  const sessions = inferSessionCount(text);

  if (minutesMatch?.[1]) {
    return roundTarget((Number(minutesMatch[1]) / 60) * sessions * days);
  }

  if (hoursMatch?.[1]) {
    return roundTarget(Number(hoursMatch[1]) * sessions * days);
  }

  return DEFAULT_HOURS_TARGET;
}

function inferPlanningDays(text: string) {
  if (/\b(30 days?|month)\b/iu.test(text)) {
    return /\bweekdays?\b/iu.test(text) ? 22 : 30;
  }

  if (/\b(14 days?|two weeks?)\b/iu.test(text)) {
    return /\bweekdays?\b/iu.test(text) ? 10 : 14;
  }

  if (/\b(3 months?|three months?)\b/iu.test(text)) {
    return /\bweekdays?\b/iu.test(text) ? 66 : 90;
  }

  return 1;
}

function inferSessionCount(text: string) {
  const rangeMatch = text.match(/\b(\d+)\s*-\s*(\d+)\s+\w+\s+(?:per|a)\s+day\b/iu);
  const perDayMatch = text.match(/\b(\d+)\s+\w+\s+(?:per|a)\s+day\b/iu);

  if (rangeMatch?.[1] && rangeMatch[2]) {
    return Math.max(1, Math.round((Number(rangeMatch[1]) + Number(rangeMatch[2])) / 2));
  }

  if (perDayMatch?.[1]) {
    return Math.max(1, Number(perDayMatch[1]));
  }

  return 1;
}

function roundTarget(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_HOURS_TARGET;
  }

  return Math.max(1, Math.round(value * 10) / 10);
}

function normalizeMetricName(value: string) {
  return value
    .replace(
      /\b(?:at least|at minimum|minimum of|more than|over|>=)?\s*\d+(?:,\d{3})*(?:\.\d+)?\b/iu,
      "",
    )
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/\s+([,.!?])/gu, "$1");
}

function dedupeMetricSpecs(specs: GoalMetricSpec[]) {
  const seen = new Set<string>();
  const result: GoalMetricSpec[] = [];

  for (const spec of specs) {
    const key = normalizeMetricSpecKey(spec);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(spec);
  }

  return result;
}

function normalizeMetricText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
}
