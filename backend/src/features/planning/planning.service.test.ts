import assert from "node:assert/strict";
import test from "node:test";

import type {
  StructuredAiProvider,
  StructuredJsonGenerationInput,
} from "../../shared/ai/ai-provider.ts";
import { createEmptyDraftPlanningState } from "./planning.types.ts";

process.env.OPENAI_API_KEY = "";
process.env.OPENAI_MODEL = "";

const { runPlanningTurn } = await import("./planning.service.ts");

class FakeStructuredAiProvider implements StructuredAiProvider {
  calls: StructuredJsonGenerationInput[] = [];
  private readonly responses: unknown[];

  constructor(responses: unknown[]) {
    this.responses = responses;
  }

  async generateJson<T>(input: StructuredJsonGenerationInput): Promise<T> {
    this.calls.push(input);

    if (this.responses.length === 0) {
      throw new Error("Unexpected AI provider call.");
    }

    return this.responses.shift() as T;
  }
}

test("runPlanningTurn asks for clarification when the draft is incomplete", async () => {
  const provider = new FakeStructuredAiProvider([
    {
      assistantMessage: "What outcome should this plan optimize for first?",
      draftPlanningState: {
        mediumTermGoal: "Launch Productiv",
        confidenceFlags: {
          mediumTermGoal: "medium",
        },
      },
      status: "needs_clarification",
    },
  ]);

  const result = await runPlanningTurn({
    aiProvider: provider,
    chatHistory: [{ role: "user", content: "I need a plan for Productiv." }],
  });

  assert.equal(provider.calls.length, 1);
  assert.equal(provider.calls[0]?.schemaName, "planning_turn_response");
  assert.match(provider.calls[0]?.input ?? "", /Current draft planning state/u);
  assert.equal(result.status, "needs_clarification");
  assert.equal(
    result.assistantMessage,
    "What outcome should this plan optimize for first?",
  );
  assert.equal(result.draftPlanningState.mediumTermGoal, "Launch Productiv");
  assert.equal(result.draftPlanningState.confidenceFlags.mediumTermGoal, "medium");
  assert.equal(result.generatedPlan, null);
});

test("runPlanningTurn uses the configured provider when no test provider is supplied", async () => {
  await assert.rejects(
    () =>
      runPlanningTurn({
        chatHistory: [{ role: "user", content: "Start a plan." }],
      }),
    /AI provider is not configured/u,
  );
});

test("runPlanningTurn does not synthesize a plan when plan_ready lacks required fields", async () => {
  const provider = new FakeStructuredAiProvider([
    {
      assistantMessage: "I have enough to draft a plan.",
      draftPlanningState: {
        mediumTermGoal: "Launch Productiv",
      },
      status: "plan_ready",
    },
  ]);

  const result = await runPlanningTurn({
    aiProvider: provider,
    chatHistory: [{ role: "user", content: "Launch Productiv." }],
    currentDraftPlanningState: createEmptyDraftPlanningState(),
    schedulingContext: { preferredFocusBlockMinutes: 90 },
  });

  assert.equal(provider.calls.length, 1);
  assert.match(provider.calls[0]?.input ?? "", /"preferredFocusBlockMinutes": 90/u);
  assert.equal(result.status, "needs_clarification");
  assert.match(result.assistantMessage, /I need one more concrete detail/u);
  assert.doesNotMatch(result.assistantMessage, /enough to draft/u);
  assert.equal(result.generatedPlan, null);
});

test("runPlanningTurn synthesizes a goal without optional barrier analysis", async () => {
  const trackableDraft = {
    ...createEmptyDraftPlanningState(),
    direction: ["Land a backend software developer role"],
    mediumTermGoal: "Secure a backend software developer job within 3 months",
    thirtyDayPerformanceGoals: [
      "Finish the system design course and apply to 300 jobs",
    ],
    timeAvailability: "Weekdays during normal work hours",
  };
  const provider = new FakeStructuredAiProvider([
    {
      assistantMessage: "I have enough to create a first trackable goal.",
      draftPlanningState: trackableDraft,
      status: "plan_ready",
    },
    {
      direction: "Land a backend software developer role",
      mediumTermGoal: "Secure a backend software developer job within 3 months",
      thirtyDayPerformanceGoals: [
        "Finish the system design course and apply to 300 jobs",
      ],
      fourteenDayPerformanceGoals: [],
      timeAvailability: "Weekdays during normal work hours",
      timeProtectionPlan: [],
      limitingHabits: [],
      scriptedActions: [],
      environmentalOptimizations: [],
      constraints: ["Keep weekends open"],
      summary:
        "Create a focused job-search plan around system design, portfolio work, and daily applications.",
    },
  ]);

  const result = await runPlanningTurn({
    aiProvider: provider,
    chatHistory: [
      {
        role: "user",
        content:
          "I want a backend software developer job within 3 months and need to apply to 300 jobs.",
      },
    ],
    currentDraftPlanningState: createEmptyDraftPlanningState(),
  });

  assert.equal(provider.calls.length, 2);
  assert.equal(provider.calls[1]?.schemaName, "generated_plan");
  assert.equal(result.status, "plan_ready");
  assert.equal(result.generatedPlan?.timeProtectionPlan.length, 0);
  assert.deepEqual(result.generatedPlan?.limitingHabits, []);
  assert.equal(
    result.generatedPlan?.mediumTermGoal,
    "Secure a backend software developer job within 3 months",
  );
});

test("runPlanningTurn synthesizes a generated plan when the draft is complete", async () => {
  const completeDraft = {
    ...createEmptyDraftPlanningState(),
    direction: ["Launch carefully"],
    mediumTermGoal: "Launch a useful Productiv beta",
    thirtyDayPerformanceGoals: ["Invite five beta users"],
    timeAvailability: "Weekday evenings",
    timeProtectionPlan: ["Tuesday 7pm to 9pm"],
    limitingHabits: ["Starting with vague tasks"],
  };
  const provider = new FakeStructuredAiProvider([
    {
      assistantMessage: "I can turn that into a first plan.",
      draftPlanningState: completeDraft,
      status: "plan_ready",
    },
    {
      direction: " Launch carefully ",
      mediumTermGoal: " Launch a useful Productiv beta ",
      thirtyDayPerformanceGoals: [" Invite five beta users "],
      fourteenDayPerformanceGoals: [" Interview two people "],
      timeAvailability: " Weekday evenings ",
      timeProtectionPlan: [" Tuesday 7pm to 9pm "],
      limitingHabits: [" Starting with vague tasks "],
      scriptedActions: [" Open the beta checklist "],
      environmentalOptimizations: [" Keep notes app closed "],
      constraints: [" No Sunday deep work "],
      summary: " A cautious launch plan ",
    },
  ]);

  const result = await runPlanningTurn({
    aiProvider: provider,
    chatHistory: [{ role: "user", content: "Use weekday evenings." }],
    currentDraftPlanningState: completeDraft,
  });

  assert.equal(provider.calls.length, 2);
  assert.equal(provider.calls[0]?.schemaName, "planning_turn_response");
  assert.equal(provider.calls[1]?.schemaName, "generated_plan");
  assert.equal(result.status, "plan_ready");
  assert.equal(result.assistantMessage, "I can turn that into a first plan.");
  assert.equal(result.generatedPlan?.mediumTermGoal, "Launch a useful Productiv beta");
  assert.deepEqual(result.generatedPlan?.thirtyDayPerformanceGoals, [
    "Invite five beta users",
  ]);
  assert.equal(result.generatedPlan?.summary, "A cautious launch plan");
});
