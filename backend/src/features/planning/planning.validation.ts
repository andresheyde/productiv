import {
  createEmptyDraftPlanningState,
  type PlanningConfidenceFlags,
  type DraftPlanningState,
  type GeneratedPlan,
  type PlanningFieldConfidence,
  type PlanningTurnExtraction,
} from "./planning.types.ts";

type JsonRecord = Record<string, unknown>;

const VALID_CONFIDENCE_LEVELS = new Set<PlanningFieldConfidence>([
  "low",
  "medium",
  "high",
]);

export function normalizeDraftPlanningState(
  value: unknown,
  fallback: DraftPlanningState = createEmptyDraftPlanningState(),
): DraftPlanningState {
  const record = asOptionalRecord(value);

  return {
    direction: getStringArray(record.direction, fallback.direction),
    mediumTermGoal: getNullableString(
      record.mediumTermGoal,
      fallback.mediumTermGoal,
    ),
    thirtyDayPerformanceGoals: getStringArray(
      record.thirtyDayPerformanceGoals,
      fallback.thirtyDayPerformanceGoals,
    ),
    fourteenDayPerformanceGoals: getStringArray(
      record.fourteenDayPerformanceGoals,
      fallback.fourteenDayPerformanceGoals,
    ),
    timeAvailability: getNullableString(
      record.timeAvailability,
      fallback.timeAvailability,
    ),
    timeProtectionPlan: getStringArray(
      record.timeProtectionPlan,
      fallback.timeProtectionPlan,
    ),
    limitingHabits: getStringArray(record.limitingHabits, fallback.limitingHabits),
    scriptedActions: getStringArray(
      record.scriptedActions,
      fallback.scriptedActions,
    ),
    environmentalOptimizations: getStringArray(
      record.environmentalOptimizations,
      fallback.environmentalOptimizations,
    ),
    constraints: getStringArray(record.constraints, fallback.constraints),
    confidenceFlags: getConfidenceFlags(
      record.confidenceFlags,
      fallback.confidenceFlags,
    ),
    missingFields: getStringArray(record.missingFields, fallback.missingFields),
    nextBestQuestion: getNullableString(
      record.nextBestQuestion,
      fallback.nextBestQuestion,
    ),
  };
}

export function normalizePlanningTurnExtraction(
  value: unknown,
  fallbackDraft: DraftPlanningState,
): PlanningTurnExtraction {
  const record = asRecord(value);
  const assistantMessage = getRequiredString(record.assistantMessage);
  const status = getPlanningStatus(record.status);
  const draftPlanningState = normalizeDraftPlanningState(
    record.draftPlanningState,
    fallbackDraft,
  );

  return {
    assistantMessage,
    draftPlanningState,
    status,
  };
}

export function normalizeGeneratedPlan(value: unknown): GeneratedPlan {
  const record = asRecord(value);

  return {
    direction: getRequiredString(record.direction),
    mediumTermGoal: getRequiredString(record.mediumTermGoal),
    thirtyDayPerformanceGoals: getRequiredNonEmptyStringArray(
      record.thirtyDayPerformanceGoals,
    ),
    fourteenDayPerformanceGoals: getStringArray(
      record.fourteenDayPerformanceGoals,
      [],
    ),
    timeAvailability: getRequiredString(record.timeAvailability),
    timeProtectionPlan: getRequiredNonEmptyStringArray(record.timeProtectionPlan),
    limitingHabits: getStringArray(record.limitingHabits, []),
    scriptedActions: getStringArray(record.scriptedActions, []),
    environmentalOptimizations: getStringArray(
      record.environmentalOptimizations,
      [],
    ),
    constraints: getStringArray(record.constraints, []),
    summary: getRequiredString(record.summary),
  };
}

export function canGeneratePlan(draft: DraftPlanningState): boolean {
  return (
    draft.mediumTermGoal !== null &&
    (draft.thirtyDayPerformanceGoals.length > 0 ||
      draft.fourteenDayPerformanceGoals.length > 0) &&
    draft.timeAvailability !== null &&
    draft.timeProtectionPlan.length > 0 &&
    (draft.limitingHabits.length > 0 ||
      draft.scriptedActions.length > 0 ||
      draft.environmentalOptimizations.length > 0)
  );
}

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected AI response to be an object.");
  }

  return value as JsonRecord;
}

function asOptionalRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as JsonRecord;
}

function getRequiredString(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Expected AI response to include a non-empty string.");
  }

  return value.trim();
}

function getNullableString(
  value: unknown,
  fallback: string | null,
): string | null {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function getStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const result = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return result.length > 0 || value.length === 0 ? result : fallback;
}

function getRequiredNonEmptyStringArray(value: unknown): string[] {
  const result = getStringArray(value, []);

  if (result.length === 0) {
    throw new Error("Expected AI response to include a non-empty string array.");
  }

  return result;
}

function getConfidenceFlags(
  value: unknown,
  fallback: PlanningConfidenceFlags,
): PlanningConfidenceFlags {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as JsonRecord)
      : {};

  return {
    direction: getConfidenceValue(record.direction, fallback.direction),
    mediumTermGoal: getConfidenceValue(
      record.mediumTermGoal,
      fallback.mediumTermGoal,
    ),
    thirtyDayPerformanceGoals: getConfidenceValue(
      record.thirtyDayPerformanceGoals,
      fallback.thirtyDayPerformanceGoals,
    ),
    fourteenDayPerformanceGoals: getConfidenceValue(
      record.fourteenDayPerformanceGoals,
      fallback.fourteenDayPerformanceGoals,
    ),
    timeAvailability: getConfidenceValue(
      record.timeAvailability,
      fallback.timeAvailability,
    ),
    timeProtectionPlan: getConfidenceValue(
      record.timeProtectionPlan,
      fallback.timeProtectionPlan,
    ),
    limitingHabits: getConfidenceValue(
      record.limitingHabits,
      fallback.limitingHabits,
    ),
    scriptedActions: getConfidenceValue(
      record.scriptedActions,
      fallback.scriptedActions,
    ),
    environmentalOptimizations: getConfidenceValue(
      record.environmentalOptimizations,
      fallback.environmentalOptimizations,
    ),
    constraints: getConfidenceValue(record.constraints, fallback.constraints),
  };
}

function getConfidenceValue(
  value: unknown,
  fallback: PlanningFieldConfidence | null,
): PlanningFieldConfidence | null {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (
    typeof value === "string" &&
    VALID_CONFIDENCE_LEVELS.has(value as PlanningFieldConfidence)
  ) {
    return value as PlanningFieldConfidence;
  }

  return fallback;
}

function getPlanningStatus(
  value: unknown,
): PlanningTurnExtraction["status"] {
  return value === "plan_ready" ? "plan_ready" : "needs_clarification";
}
