import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPlanSynthesisInput,
  buildPlanningTurnInput,
  createPlanSynthesisInstructions,
  createPlanningTurnInstructions,
  GENERATED_PLAN_SCHEMA,
  PLANNING_TURN_RESPONSE_SCHEMA,
} from "./planning.prompts.ts";
import { createEmptyDraftPlanningState } from "./planning.types.ts";

test("planning turn schema requires the assistant message, draft state, and status", () => {
  assert.equal(PLANNING_TURN_RESPONSE_SCHEMA.type, "object");
  assert.deepEqual(PLANNING_TURN_RESPONSE_SCHEMA.required, [
    "assistantMessage",
    "draftPlanningState",
    "status",
  ]);
  assert.deepEqual(
    PLANNING_TURN_RESPONSE_SCHEMA.properties.status.enum,
    ["needs_clarification", "plan_ready"],
  );
});

test("generated plan schema requires all fields used to create workspace records", () => {
  assert.equal(GENERATED_PLAN_SCHEMA.type, "object");
  assert.deepEqual(GENERATED_PLAN_SCHEMA.required, [
    "direction",
    "mediumTermGoal",
    "thirtyDayPerformanceGoals",
    "fourteenDayPerformanceGoals",
    "timeAvailability",
    "timeProtectionPlan",
    "limitingHabits",
    "scriptedActions",
    "environmentalOptimizations",
    "constraints",
    "summary",
  ]);
});

test("planning instructions stay focused on one-question intake", () => {
  const instructions = createPlanningTurnInstructions();

  assert.match(instructions, /guided interviewer/u);
  assert.match(instructions, /Ask one focused question at a time/u);
  assert.match(instructions, /status to plan_ready/u);
  assert.match(instructions, /valid JSON/u);
});

test("plan synthesis instructions produce a draft instead of a follow-up question", () => {
  const instructions = createPlanSynthesisInstructions();

  assert.match(instructions, /first structured planning draft/u);
  assert.match(instructions, /Do not ask questions/u);
  assert.match(instructions, /valid JSON/u);
});

test("planning turn input includes transcript, saved context, and current draft", () => {
  const draft = {
    ...createEmptyDraftPlanningState(),
    mediumTermGoal: "Ship a useful first version",
  };
  const input = buildPlanningTurnInput(
    [
      { role: "user", content: "I need to plan my launch." },
      { role: "assistant", content: "What outcome matters most?" },
    ],
    draft,
    { preferredFocusBlockMinutes: 90 },
  );

  assert.match(input, /USER: I need to plan my launch\./u);
  assert.match(input, /ASSISTANT: What outcome matters most\?/u);
  assert.match(input, /"preferredFocusBlockMinutes": 90/u);
  assert.match(input, /"mediumTermGoal": "Ship a useful first version"/u);
  assert.match(input, /Return the next assistant message/u);
});

test("plan synthesis input includes the structured draft planning state", () => {
  const draft = {
    ...createEmptyDraftPlanningState(),
    timeAvailability: "Weekday evenings",
  };
  const input = buildPlanSynthesisInput(
    [{ role: "user", content: "Use Tuesday evenings." }],
    draft,
    null,
  );

  assert.match(input, /Structured draft planning state:/u);
  assert.match(input, /"timeAvailability": "Weekday evenings"/u);
  assert.match(input, /Saved personal scheduling context:\nnull/u);
  assert.match(input, /Generate the first plan draft/u);
});
