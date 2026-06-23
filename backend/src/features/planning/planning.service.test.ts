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
      schedulingPreferenceCandidates: [
        {
          kind: "custom",
          title: "  Keep launch planning in the morning  ",
          detail: "  Morning planning feels more sustainable.  ",
          strength: "soft_preference",
          confidence: "medium",
          applicabilityScope: "goal",
          domain: "work",
          goalTitle: "Launch Productiv",
          activityTitle: "launch planning",
          temporalScope: null,
          evidence: "I prefer planning Productiv in the morning.",
        },
      ],
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
  assert.equal(result.schedulingPreferenceCandidates[0]?.applicabilityScope, "goal");
  assert.equal(
    result.schedulingPreferenceCandidates[0]?.title,
    "Keep launch planning in the morning",
  );
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
  assert.match(result.assistantMessage, /activities, tasks, or focus areas/u);
  assert.doesNotMatch(result.assistantMessage, /enough to draft/u);
  assert.equal(result.generatedPlan, null);
});

test("runPlanningTurn rejects plan_ready when the model omits all core details", async () => {
  const provider = new FakeStructuredAiProvider([
    {
      assistantMessage: "I have enough to draft a plan.",
      draftPlanningState: {},
      status: "plan_ready",
    },
  ]);

  const result = await runPlanningTurn({
    aiProvider: provider,
    chatHistory: [{ role: "user", content: "Help me plan." }],
    currentDraftPlanningState: createEmptyDraftPlanningState(),
  });

  assert.equal(provider.calls.length, 1);
  assert.equal(result.status, "needs_clarification");
  assert.match(result.assistantMessage, /I need one more concrete detail/u);
  assert.match(result.assistantMessage, /a concrete goal outcome/u);
  assert.match(result.assistantMessage, /activity, task, or focus area/u);
  assert.equal(result.generatedPlan, null);
});

test("runPlanningTurn asks for user-owned focus areas before creating broad fitness goals", async () => {
  const provider = new FakeStructuredAiProvider([
    {
      assistantMessage: "I can turn that into a first fitness plan.",
      draftPlanningState: {
        mediumTermGoal:
          "Reduce body fat, build strength, improve stamina, play sports without pain, and develop visible abdominal definition within 6 months",
        thirtyDayPerformanceGoals: [
          "Establish a consistent workout routine including strength training and cardiovascular exercise at least 3 times per week",
          "Incorporate flexibility and mobility exercises twice per week to reduce pain during sports",
        ],
        fourteenDayPerformanceGoals: [
          "Complete at least 6 workout sessions combining strength and cardio exercises",
        ],
      },
      schedulingPreferenceCandidates: [],
      status: "plan_ready",
    },
  ]);

  const result = await runPlanningTurn({
    aiProvider: provider,
    chatHistory: [
      { role: "user", content: "I want to get in better shape." },
      {
        role: "assistant",
        content: "What does getting in better shape mean to you?",
      },
      {
        role: "user",
        content:
          "I would like to shed some fat and replace it with more strength. I want to become more explosive, have more stamina, and have no pain when I'm playing sports. I would like a six pack.",
      },
    ],
    currentDraftPlanningState: createEmptyDraftPlanningState(),
  });

  assert.equal(provider.calls.length, 1);
  assert.equal(result.status, "needs_clarification");
  assert.equal(result.generatedPlan, null);
  assert.match(result.assistantMessage, /activities, tasks, or focus areas/u);
  assert.match(result.assistantMessage, /help choosing/u);
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

test("runPlanningTurn breaks repeated activity clarification loops from the model", async () => {
  const provider = new FakeStructuredAiProvider([
    {
      assistantMessage:
        "What specific activities or habits do you think would help you build muscle and lose weight?",
      draftPlanningState: {
        mediumTermGoal: "get in better shape",
      },
      status: "needs_clarification",
    },
    {
      direction: "Improve athletic fitness",
      mediumTermGoal:
        "Build stamina for sports, dunk and sprint without pain, lose 20 pounds, and build visible muscle",
      thirtyDayPerformanceGoals: [
        "Complete strength training, plyo training, and cardio sessions consistently",
      ],
      fourteenDayPerformanceGoals: [
        "Start a repeatable training rhythm across strength, plyo, and cardio",
      ],
      timeAvailability: "Not specified yet",
      timeProtectionPlan: [],
      limitingHabits: [],
      scriptedActions: [],
      environmentalOptimizations: [],
      constraints: [],
      summary:
        "Create a first fitness plan around strength training, plyometrics, and cardio.",
    },
  ]);

  const result = await runPlanningTurn({
    aiProvider: provider,
    chatHistory: [
      { role: "user", content: "I want to get in better shape." },
      {
        role: "assistant",
        content: "What does getting in better shape mean to you?",
      },
      {
        role: "user",
        content:
          "More stamina while playing sports, able to dunk and sprint with no pain and more powerfully. I want to lose 20 pounds while building muscle. I want a six pack.",
      },
      {
        role: "assistant",
        content:
          "What specific activities or habits do you think would help you build muscle and lose weight?",
      },
      {
        role: "user",
        content: [
          "I need to spend time doing strength trainings - upper and lower",
          "I need to do plyo training - sprints and jumping",
          "I need to do consistent cardio - running/biking/jump roping",
        ].join("\n"),
      },
    ],
    currentDraftPlanningState: createEmptyDraftPlanningState(),
  });

  assert.equal(provider.calls.length, 2);
  assert.equal(provider.calls[1]?.schemaName, "generated_plan");
  assert.equal(result.status, "plan_ready");
  assert.doesNotMatch(result.assistantMessage, /What specific activities/u);
  assert.match(result.draftPlanningState.mediumTermGoal ?? "", /lose 20 pounds/u);
  assert.deepEqual(result.draftPlanningState.direction, [
    "Strength trainings - upper and lower",
    "Plyo training - sprints and jumping",
    "Cardio - running/biking/jump roping",
  ]);
});

test("runPlanningTurn ignores frustrated repetition when hydrating a draft", async () => {
  const currentDraft = {
    ...createEmptyDraftPlanningState(),
    direction: ["Apply to roles"],
    mediumTermGoal: "Secure a software developer job offer",
  };
  const provider = new FakeStructuredAiProvider([
    {
      assistantMessage: "What should we clarify next?",
      draftPlanningState: currentDraft,
      status: "needs_clarification",
    },
  ]);

  const result = await runPlanningTurn({
    aiProvider: provider,
    chatHistory: [
      {
        role: "user",
        content: "I want to get a software developer job.",
      },
      {
        role: "user",
        content: "apply to roles",
      },
      {
        role: "user",
        content: "I just told you those applications.",
      },
      {
        role: "user",
        content: "Ok.",
      },
    ],
    currentDraftPlanningState: currentDraft,
  });

  assert.equal(provider.calls.length, 1);
  assert.equal(result.status, "needs_clarification");
  assert.deepEqual(result.draftPlanningState.direction, ["Apply to roles"]);
  assert.equal(
    result.draftPlanningState.mediumTermGoal,
    "Secure a software developer job offer",
  );
});

test("runPlanningTurn handles a trackable draft with no user messages", async () => {
  const currentDraft = {
    ...createEmptyDraftPlanningState(),
    direction: ["Training"],
    mediumTermGoal: "get in better shape",
  };
  const provider = new FakeStructuredAiProvider([
    {
      assistantMessage: "What should we clarify next?",
      draftPlanningState: currentDraft,
      status: "needs_clarification",
    },
  ]);

  const result = await runPlanningTurn({
    aiProvider: provider,
    chatHistory: [],
    currentDraftPlanningState: currentDraft,
  });

  assert.equal(provider.calls.length, 1);
  assert.equal(result.status, "needs_clarification");
  assert.equal(result.generatedPlan, null);
  assert.deepEqual(result.draftPlanningState.direction, ["Training"]);
  assert.equal(result.draftPlanningState.mediumTermGoal, "get in better shape");
});

test("runPlanningTurn preserves direction confidence when only the goal is inferred", async () => {
  const emptyDraft = createEmptyDraftPlanningState();
  const currentDraft = {
    ...emptyDraft,
    confidenceFlags: {
      ...emptyDraft.confidenceFlags,
      direction: "high" as const,
    },
    direction: ["Apply to roles"],
    mediumTermGoal: "get in better shape",
  };
  const provider = new FakeStructuredAiProvider([
    {
      assistantMessage: "What should we clarify next?",
      draftPlanningState: currentDraft,
      status: "needs_clarification",
    },
  ]);

  const result = await runPlanningTurn({
    aiProvider: provider,
    chatHistory: [
      {
        role: "user",
        content: "I want a software developer job.",
      },
    ],
    currentDraftPlanningState: currentDraft,
  });

  assert.equal(provider.calls.length, 1);
  assert.equal(result.status, "needs_clarification");
  assert.deepEqual(result.draftPlanningState.direction, ["Apply to roles"]);
  assert.equal(
    result.draftPlanningState.mediumTermGoal,
    "a software developer job.",
  );
  assert.equal(result.draftPlanningState.confidenceFlags.direction, "high");
});

test("runPlanningTurn keeps the pending question when only activities are inferred", async () => {
  const currentDraft = {
    ...createEmptyDraftPlanningState(),
    nextBestQuestion: "What outcome should this support?",
  };
  const provider = new FakeStructuredAiProvider([
    {
      assistantMessage: "What outcome should this support?",
      draftPlanningState: currentDraft,
      status: "needs_clarification",
    },
  ]);

  const result = await runPlanningTurn({
    aiProvider: provider,
    chatHistory: [
      {
        role: "user",
        content: "apply to roles",
      },
    ],
    currentDraftPlanningState: currentDraft,
  });

  assert.equal(provider.calls.length, 1);
  assert.equal(result.status, "needs_clarification");
  assert.deepEqual(result.draftPlanningState.direction, ["Apply to roles"]);
  assert.equal(result.draftPlanningState.mediumTermGoal, null);
  assert.equal(
    result.draftPlanningState.nextBestQuestion,
    "What outcome should this support?",
  );
});

test("runPlanningTurn keeps useful model clarifications instead of forcing a gated flow", async () => {
  const completeDraft = {
    ...createEmptyDraftPlanningState(),
    direction: ["Apply to roles"],
    mediumTermGoal: "Secure a software developer job offer within 3 months",
    thirtyDayPerformanceGoals: ["Apply to 100 software developer jobs"],
  };
  const provider = new FakeStructuredAiProvider([
    {
      assistantMessage: "When can you realistically work on this each week?",
      draftPlanningState: completeDraft,
      status: "needs_clarification",
    },
  ]);

  const result = await runPlanningTurn({
    aiProvider: provider,
    chatHistory: [
      {
        role: "user",
        content:
          "I want to get a software developer job and apply to 100 jobs.",
      },
    ],
    currentDraftPlanningState: createEmptyDraftPlanningState(),
  });

  assert.equal(provider.calls.length, 1);
  assert.equal(provider.calls[0]?.schemaName, "planning_turn_response");
  assert.equal(result.status, "needs_clarification");
  assert.equal(result.generatedPlan, null);
  assert.equal(
    result.assistantMessage,
    "When can you realistically work on this each week?",
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
