import type {
  RuleConfidence,
  SchedulingPreferenceApplicabilityScope,
  SchedulingPreferenceCandidate,
  SchedulingPreferenceRuleKind,
  SchedulingPreferenceRuleStrength,
} from "./scheduling-context.types.ts";

export const SCHEDULING_PREFERENCE_CANDIDATE_ARRAY_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: [
      "kind",
      "title",
      "detail",
      "strength",
      "confidence",
      "applicabilityScope",
      "domain",
      "goalTitle",
      "activityTitle",
      "temporalScope",
      "evidence",
    ],
    properties: {
      kind: {
        type: "string",
        enum: [
          "work_hours",
          "no_schedule_window",
          "sleep_window",
          "latest_work_end",
          "preferred_focus_block",
          "preferred_work_period",
          "recovery_day",
          "custom",
        ],
      },
      title: { type: "string" },
      detail: { type: "string" },
      strength: {
        type: "string",
        enum: ["hard_constraint", "soft_preference"],
      },
      confidence: {
        type: "string",
        enum: ["low", "medium", "high"],
      },
      applicabilityScope: {
        type: "string",
        enum: ["global", "domain", "goal", "activity", "temporary"],
      },
      domain: nullableStringSchema(),
      goalTitle: nullableStringSchema(),
      activityTitle: nullableStringSchema(),
      temporalScope: nullableStringSchema(),
      evidence: nullableStringSchema(),
    },
  },
} as const satisfies Record<string, unknown>;

export const SCHEDULING_PREFERENCE_EXTRACTION_GUIDANCE = [
  "Also return schedulingPreferenceCandidates from the latest user message.",
  "A scheduling preference candidate is only about when, how often, spacing, constraints, recovery needs, energy patterns, or conditions for doing work or activities.",
  "Extract durable week-boundary preferences such as 'my scheduling week is Monday through Sunday' or 'I plan weeks from Monday to Sunday' as a custom global soft_preference with a clear title and detail.",
  "Do not extract one-off date ranges like 'schedule from tomorrow till Tuesday' as durable preferences; those are request-specific scheduling horizons.",
  "Do not extract a scheduling preference merely because one task was scheduled in one slot; a single apartment cleaning, meeting, errand, or workout placement is not a durable habit unless the user states it should repeat or expresses a standing preference.",
  "Do not extract ordinary goals, tasks, activities, outcomes, or motivation as scheduling preferences.",
  "Use applicabilityScope to avoid overgeneralizing: global for broad life/work preferences, domain for broad areas like fitness or study, goal for one specific goal, activity for one recurring activity, and temporary for short-lived rules.",
  "Workout or study timing rules should usually be scoped to the relevant goal or recurring activity, not the whole user, unless the user clearly states a global preference.",
  "Goal-specific examples such as not combining strength training and plyometrics on the same day should use applicabilityScope goal or activity, not global.",
  "Return an empty array when the latest message does not contain a durable scheduling rule.",
].join(" ");

const VALID_KINDS = new Set<SchedulingPreferenceRuleKind>([
  "work_hours",
  "no_schedule_window",
  "sleep_window",
  "latest_work_end",
  "preferred_focus_block",
  "preferred_work_period",
  "recovery_day",
  "custom",
]);
const VALID_STRENGTHS = new Set<SchedulingPreferenceRuleStrength>([
  "hard_constraint",
  "soft_preference",
]);
const VALID_CONFIDENCE = new Set<RuleConfidence>(["low", "medium", "high"]);
const VALID_SCOPES = new Set<SchedulingPreferenceApplicabilityScope>([
  "global",
  "domain",
  "goal",
  "activity",
  "temporary",
]);

export function normalizeSchedulingPreferenceCandidates(
  value: unknown,
): SchedulingPreferenceCandidate[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const candidates: SchedulingPreferenceCandidate[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const candidate = normalizeSchedulingPreferenceCandidate(item);

    if (!candidate) {
      continue;
    }

    const key = [
      candidate.kind,
      candidate.title.toLowerCase(),
      candidate.applicabilityScope,
      candidate.domain?.toLowerCase() ?? "",
      candidate.goalTitle?.toLowerCase() ?? "",
      candidate.activityTitle?.toLowerCase() ?? "",
      candidate.temporalScope?.toLowerCase() ?? "",
    ].join(":");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    candidates.push(candidate);
  }

  return candidates.slice(0, 5);
}

function normalizeSchedulingPreferenceCandidate(
  value: unknown,
): SchedulingPreferenceCandidate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const kind = getEnumValue(record.kind, VALID_KINDS, "custom");
  const title = getTrimmedString(record.title);
  const detail = getTrimmedString(record.detail);
  const strength = getEnumValue(
    record.strength,
    VALID_STRENGTHS,
    "soft_preference",
  );
  const confidence = getEnumValue(record.confidence, VALID_CONFIDENCE, "low");
  const applicabilityScope = getEnumValue(
    record.applicabilityScope,
    VALID_SCOPES,
    "global",
  );

  if (!title || !detail) {
    return null;
  }

  return {
    kind,
    title,
    detail,
    strength,
    confidence,
    applicabilityScope,
    domain: getNullableTrimmedString(record.domain),
    goalTitle: getNullableTrimmedString(record.goalTitle),
    activityTitle: getNullableTrimmedString(record.activityTitle),
    temporalScope: getNullableTrimmedString(record.temporalScope),
    evidence: getNullableTrimmedString(record.evidence),
  };
}

function nullableStringSchema() {
  return {
    type: ["string", "null"],
  };
}

function getEnumValue<T extends string>(
  value: unknown,
  validValues: Set<T>,
  fallback: T,
) {
  return typeof value === "string" && validValues.has(value as T)
    ? (value as T)
    : fallback;
}

function getTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getNullableTrimmedString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
