import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyDraftPlanningState } from "./planning.types.ts";
import {
  canGeneratePlan,
  getMissingPlanRequirements,
  normalizeGeneratedPlan,
  normalizeDraftPlanningState,
  normalizePlanningTurnExtraction,
} from "./planning.validation.ts";

test("normalizeDraftPlanningState falls back when no draft state exists yet", () => {
  const fallback = createEmptyDraftPlanningState();

  assert.deepEqual(normalizeDraftPlanningState(undefined, fallback), fallback);
  assert.deepEqual(normalizeDraftPlanningState(null, fallback), fallback);
});

test("normalizeDraftPlanningState merges valid draft fields with fallback state", () => {
  const fallback = {
    ...createEmptyDraftPlanningState(),
    timeAvailability: "Weekday evenings",
    timeProtectionPlan: ["Block 30 minutes after dinner"],
    confidenceFlags: {
      ...createEmptyDraftPlanningState().confidenceFlags,
      timeAvailability: "medium" as const,
    },
  };

  const result = normalizeDraftPlanningState(
    {
      mediumTermGoal: "  Ship the first Productiv planning flow  ",
      thirtyDayPerformanceGoals: ["  Launch a working beta  ", ""],
      confidenceFlags: {
        mediumTermGoal: "high",
        timeAvailability: "uncertain",
      },
    },
    fallback,
  );

  assert.equal(result.mediumTermGoal, "Ship the first Productiv planning flow");
  assert.deepEqual(result.thirtyDayPerformanceGoals, ["Launch a working beta"]);
  assert.equal(result.timeAvailability, fallback.timeAvailability);
  assert.deepEqual(result.timeProtectionPlan, fallback.timeProtectionPlan);
  assert.equal(result.confidenceFlags.mediumTermGoal, "high");
  assert.equal(
    result.confidenceFlags.timeAvailability,
    fallback.confidenceFlags.timeAvailability,
  );
});

test("normalizeDraftPlanningState keeps fallback values for unusable fields", () => {
  const fallback = {
    ...createEmptyDraftPlanningState(),
    direction: ["Build a healthier work rhythm"],
    mediumTermGoal: "Keep a consistent weekly review",
    limitingHabits: ["Checking messages before planning"],
    missingFields: ["timeAvailability"],
    nextBestQuestion: "When can you protect time?",
  };

  const result = normalizeDraftPlanningState(
    {
      direction: [123, null],
      mediumTermGoal: "   ",
      limitingHabits: [],
      missingFields: "timeAvailability",
      nextBestQuestion: 42,
    },
    fallback,
  );

  assert.deepEqual(result.direction, fallback.direction);
  assert.equal(result.mediumTermGoal, fallback.mediumTermGoal);
  assert.deepEqual(result.limitingHabits, []);
  assert.deepEqual(result.missingFields, fallback.missingFields);
  assert.equal(result.nextBestQuestion, fallback.nextBestQuestion);
});

test("normalizePlanningTurnExtraction still requires an object response", () => {
  assert.throws(
    () =>
      normalizePlanningTurnExtraction(
        "not-json",
        createEmptyDraftPlanningState(),
      ),
    /Expected AI response to be an object/u,
  );
});

test("normalizePlanningTurnExtraction falls back when draft state is omitted", () => {
  const fallback = createEmptyDraftPlanningState();
  const result = normalizePlanningTurnExtraction(
    {
      assistantMessage: "What outcome should we plan around first?",
      status: "needs_clarification",
    },
    fallback,
  );

  assert.equal(
    result.assistantMessage,
    "What outcome should we plan around first?",
  );
  assert.deepEqual(result.draftPlanningState, fallback);
  assert.equal(result.status, "needs_clarification");
});

test("normalizeGeneratedPlan trims required fields and optional arrays", () => {
  const result = normalizeGeneratedPlan({
    direction: " Build toward a calmer product launch ",
    mediumTermGoal: " Ship the beta ",
    thirtyDayPerformanceGoals: [" Finish onboarding ", "", 7],
    fourteenDayPerformanceGoals: [" Test the planning flow "],
    timeAvailability: " Weekday evenings ",
    timeProtectionPlan: [" Tuesday 7pm to 9pm "],
    limitingHabits: [" Context switching "],
    scriptedActions: [" Open the launch checklist "],
    environmentalOptimizations: [" Put phone outside the room "],
    constraints: [" No Sunday deep work "],
    summary: " A cautious launch plan ",
  });

  assert.deepEqual(result, {
    direction: "Build toward a calmer product launch",
    mediumTermGoal: "Ship the beta",
    thirtyDayPerformanceGoals: ["Finish onboarding"],
    fourteenDayPerformanceGoals: ["Test the planning flow"],
    timeAvailability: "Weekday evenings",
    timeProtectionPlan: ["Tuesday 7pm to 9pm"],
    limitingHabits: ["Context switching"],
    scriptedActions: ["Open the launch checklist"],
    environmentalOptimizations: ["Put phone outside the room"],
    constraints: ["No Sunday deep work"],
    summary: "A cautious launch plan",
  });

  assert.deepEqual(
    normalizeGeneratedPlan({
      direction: "Build toward a calmer product launch",
      mediumTermGoal: "Ship the beta",
      thirtyDayPerformanceGoals: ["Finish onboarding"],
      fourteenDayPerformanceGoals: [],
      timeAvailability: "Not specified yet",
      timeProtectionPlan: [],
      limitingHabits: [],
      scriptedActions: [],
      environmentalOptimizations: [],
      constraints: [],
      summary: "A cautious launch plan",
    }).timeProtectionPlan,
    [],
  );
});

test("normalizeGeneratedPlan rejects missing required plan fields", () => {
  assert.throws(
    () => normalizeGeneratedPlan(null),
    /Expected AI response to be an object/u,
  );

  assert.throws(
    () =>
      normalizeGeneratedPlan({
        direction: "",
        mediumTermGoal: "Goal",
        thirtyDayPerformanceGoals: ["Finish beta"],
        fourteenDayPerformanceGoals: [],
        timeAvailability: "Evenings",
        timeProtectionPlan: ["Tuesday evening"],
        limitingHabits: [],
        scriptedActions: [],
        environmentalOptimizations: [],
        constraints: [],
        summary: "Summary",
      }),
    /Expected AI response to include a non-empty string/u,
  );

  assert.throws(
    () =>
      normalizeGeneratedPlan({
        direction: "Direction",
        mediumTermGoal: "Goal",
        thirtyDayPerformanceGoals: [],
        fourteenDayPerformanceGoals: [],
        timeAvailability: "Evenings",
        timeProtectionPlan: ["Tuesday evening"],
        limitingHabits: [],
        scriptedActions: [],
        environmentalOptimizations: [],
        constraints: [],
        summary: "Summary",
      }),
    /Expected AI response to include a non-empty string array/u,
  );
});

test("canGeneratePlan requires only core trackable goal details", () => {
  const emptyDraft = createEmptyDraftPlanningState();
  assert.equal(canGeneratePlan(emptyDraft), false);
  assert.deepEqual(getMissingPlanRequirements(emptyDraft), [
    "a concrete goal outcome",
    "at least one activity, task, or focus area you want to include",
  ]);

  const withMediumTermGoal = {
    ...emptyDraft,
    mediumTermGoal: "Ship the beta",
  };
  assert.equal(canGeneratePlan(withMediumTermGoal), false);
  assert.deepEqual(getMissingPlanRequirements(withMediumTermGoal), [
    "at least one activity, task, or focus area you want to include",
  ]);

  const withShortGoal = {
    ...withMediumTermGoal,
    fourteenDayPerformanceGoals: ["Finish onboarding"],
  };
  assert.equal(canGeneratePlan(withShortGoal), false);
  assert.deepEqual(getMissingPlanRequirements(withShortGoal), [
    "at least one activity, task, or focus area you want to include",
  ]);

  const withTime = {
    ...withShortGoal,
    timeAvailability: "Weekday evenings",
  };
  assert.equal(canGeneratePlan(withTime), false);

  const withActivity = {
    ...withMediumTermGoal,
    direction: ["Apply to software developer jobs"],
  };
  assert.equal(canGeneratePlan(withActivity), true);
  assert.deepEqual(getMissingPlanRequirements(withActivity), []);

  const withProtectedTime = {
    ...withActivity,
    timeAvailability: "Weekday evenings",
    timeProtectionPlan: ["Tuesday 7pm to 9pm"],
  };
  assert.equal(canGeneratePlan(withProtectedTime), true);

  assert.equal(
    canGeneratePlan({
      ...withProtectedTime,
      limitingHabits: ["Checking chat before planning"],
    }),
    true,
  );
  assert.equal(
    canGeneratePlan({
      ...withProtectedTime,
      scriptedActions: ["Open the launch checklist"],
    }),
    true,
  );
  assert.equal(
    canGeneratePlan({
      ...withProtectedTime,
      thirtyDayPerformanceGoals: ["Launch beta"],
      fourteenDayPerformanceGoals: [],
      environmentalOptimizations: ["Put phone outside the room"],
    }),
    true,
  );
});
