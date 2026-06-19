import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyDraftPlanningState } from "./planning.types.ts";
import {
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
