import assert from "node:assert/strict";
import test from "node:test";

import type { AssistantActionType } from "./assistant.types.ts";
import {
  ASSISTANT_TURN_SCHEMA,
  WORK_LOG_SCHEMA,
  buildAssistantTurnInput,
  buildWorkLogInput,
  createAssistantTurnInstructions,
  createWorkLogInstructions,
  normalizeAssistantModelResponse,
  normalizeWorkLogModelResponse,
} from "./assistant.prompts.ts";

const actionTypes: AssistantActionType[] = [
  "create_goal",
  "update_goal",
  "create_task",
  "update_task",
  "create_metric",
  "update_metric",
  "schedule_task",
  "propose_schedule_task",
  "confirm_schedule_proposal",
  "dismiss_schedule_proposal",
];

function modelAction(type: AssistantActionType) {
  return {
    type,
    proposalId: "proposal-1",
    goalId: "goal-1",
    taskId: "task-1",
    metricId: "metric-1",
    title: "  Launch beta  ",
    definition: "Ship a useful beta",
    notes: "Keep it realistic",
    description: "Plan the launch",
    unitLabel: "hours",
    targetValue: 10,
    currentValue: 2,
    dueAt: "2026-07-01T00:00:00.000Z",
    estimatedMinutes: 45,
    priorityRank: 1,
    status: "planned",
    scheduleIntent: "schedule_now",
    startTime: "2026-06-20T13:00:00.000Z",
    endTime: "2026-06-20T14:00:00.000Z",
    isActive: true,
  };
}

test("assistant schemas require model response fields used by the service", () => {
  assert.equal(ASSISTANT_TURN_SCHEMA.type, "object");
  assert.deepEqual(ASSISTANT_TURN_SCHEMA.required, [
    "assistantMessage",
    "contextSummary",
    "navigationHint",
    "actions",
  ]);
  assert.equal(WORK_LOG_SCHEMA.type, "object");
  assert.deepEqual(WORK_LOG_SCHEMA.required, [
    "assistantMessage",
    "summary",
    "contextSummary",
    "navigationHint",
    "goalId",
    "taskId",
    "progressUpdates",
  ]);
});

test("assistant instructions constrain scheduling and workspace mutations", () => {
  const instructions = createAssistantTurnInstructions();

  assert.match(instructions, /Identify the user's intent first/u);
  assert.match(instructions, /minimum missing information/u);
  assert.match(instructions, /do not require barrier analysis/u);
  assert.match(instructions, /later reflection data/u);
  assert.match(instructions, /Only create or update goals/u);
  assert.match(instructions, /When enough information exists/u);
  assert.match(instructions, /propose_schedule_task/u);
  assert.match(instructions, /confirm_schedule_proposal/u);
  assert.match(instructions, /Never say a record was created/u);
  assert.match(instructions, /Return valid JSON/u);
});

test("work log instructions require numeric metric evidence", () => {
  const instructions = createWorkLogInstructions();

  assert.match(instructions, /logging work in natural language/u);
  assert.match(instructions, /Do not guess amounts/u);
  assert.match(instructions, /progressUpdates empty/u);
});

test("assistant turn input serializes the latest message and workspace context", () => {
  const input = buildAssistantTurnInput({
    message: "Schedule task one tomorrow at 9am.",
    goals: [{ id: "goal-1", title: "Launch" }],
    tasks: [{ id: "task-1", title: "Draft" }],
    metrics: [{ id: "metric-1", name: "Hours" }],
    workLogs: [{ id: "work-log-1", summary: "Drafted" }],
    messages: [{ role: "user", content: "hello" }],
    schedulingContext: { recoveryDays: [0] },
    pendingScheduleProposals: [{ id: "proposal-1" }],
  });

  assert.match(input, /Current timestamp:/u);
  assert.match(input, /Latest user message:\nSchedule task one tomorrow at 9am\./u);
  assert.match(input, /"title": "Launch"/u);
  assert.match(input, /Pending schedule proposals/u);
});

test("work log input serializes message and matching context", () => {
  const input = buildWorkLogInput({
    message: "Worked 2 hours on launch tasks.",
    goals: [{ id: "goal-1" }],
    tasks: [{ id: "task-1" }],
    metrics: [{ id: "metric-1" }],
  });

  assert.match(input, /Work log message:\nWorked 2 hours/u);
  assert.match(input, /"id": "goal-1"/u);
  assert.match(input, /"id": "task-1"/u);
  assert.match(input, /"id": "metric-1"/u);
});

test("normalizeAssistantModelResponse accepts every supported action type", () => {
  for (const actionType of actionTypes) {
    const result = normalizeAssistantModelResponse({
      assistantMessage: " Done ",
      contextSummary: " Updated workspace ",
      navigationHint: "goals",
      actions: [modelAction(actionType)],
    });

    assert.equal(result.assistantMessage, "Done");
    assert.equal(result.contextSummary, "Updated workspace");
    assert.equal(result.navigationHint, "goals");
    assert.equal(result.actions[0]?.type, actionType);
    assert.equal(result.actions[0]?.title, "Launch beta");
    assert.equal(result.actions[0]?.targetValue, 10);
    assert.equal(result.actions[0]?.isActive, true);
  }
});

test("normalizeAssistantModelResponse supports all navigation hints and null fallback", () => {
  for (const navigationHint of ["chat", "goals", "tasks", "metrics", "calendar"]) {
    const result = normalizeAssistantModelResponse({
      assistantMessage: "Done",
      contextSummary: "Summary",
      navigationHint,
      actions: [],
    });

    assert.equal(result.navigationHint, navigationHint);
  }

  const result = normalizeAssistantModelResponse({
    assistantMessage: "Done",
    contextSummary: "Summary",
    navigationHint: "unknown",
    actions: "not-actions",
  });

  assert.equal(result.navigationHint, null);
  assert.deepEqual(result.actions, []);
});

test("normalizeAssistantModelResponse drops malformed actions", () => {
  const result = normalizeAssistantModelResponse({
    assistantMessage: "Done",
    contextSummary: "Summary",
    navigationHint: null,
    actions: [
      { type: "not-real" },
      null,
      {
        type: "create_goal",
        title: 42,
        definition: "",
        currentValue: Number.NaN,
        isActive: "yes",
      },
    ],
  });

  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0]?.type, "create_goal");
  assert.equal(result.actions[0]?.proposalId, null);
  assert.equal(result.actions[0]?.title, null);
  assert.equal(result.actions[0]?.definition, null);
  assert.equal(result.actions[0]?.currentValue, null);
  assert.equal(result.actions[0]?.isActive, null);
});

test("normalizeAssistantModelResponse rejects malformed top-level responses", () => {
  assert.throws(
    () => normalizeAssistantModelResponse("not-object"),
    /Expected an object/u,
  );
  assert.throws(
    () =>
      normalizeAssistantModelResponse({
        assistantMessage: "",
        contextSummary: "Summary",
        navigationHint: null,
        actions: [],
      }),
    /Expected a non-empty string/u,
  );
});

test("normalizeWorkLogModelResponse extracts valid progress updates", () => {
  const result = normalizeWorkLogModelResponse({
    assistantMessage: " Logged ",
    summary: " Worked on launch ",
    contextSummary: " Launch progress ",
    navigationHint: "metrics",
    goalId: " goal-1 ",
    taskId: null,
    progressUpdates: [
      { metricId: " metric-1 ", deltaValue: 2, note: " focused work " },
      { metricId: "metric-2", deltaValue: 1, note: null },
      { metricId: "", deltaValue: 4, note: "bad metric" },
      { metricId: "metric-3", deltaValue: Number.POSITIVE_INFINITY, note: null },
      "not-object",
    ],
  });

  assert.deepEqual(result, {
    assistantMessage: "Logged",
    summary: "Worked on launch",
    contextSummary: "Launch progress",
    navigationHint: "metrics",
    goalId: "goal-1",
    taskId: null,
    progressUpdates: [
      { metricId: "metric-1", deltaValue: 2, note: "focused work" },
      { metricId: "metric-2", deltaValue: 1, note: null },
    ],
  });
});

test("normalizeWorkLogModelResponse handles absent progress updates and invalid ids", () => {
  const result = normalizeWorkLogModelResponse({
    assistantMessage: "Logged",
    summary: "Summary",
    contextSummary: "Context",
    navigationHint: null,
    goalId: 99,
    taskId: "   ",
    progressUpdates: undefined,
  });

  assert.equal(result.goalId, null);
  assert.equal(result.taskId, null);
  assert.deepEqual(result.progressUpdates, []);
});

test("normalizeWorkLogModelResponse rejects malformed required fields", () => {
  assert.throws(
    () => normalizeWorkLogModelResponse([]),
    /Expected an object/u,
  );
  assert.throws(
    () =>
      normalizeWorkLogModelResponse({
        assistantMessage: "Logged",
        summary: "",
        contextSummary: "Context",
        navigationHint: null,
        goalId: null,
        taskId: null,
        progressUpdates: [],
      }),
    /Expected a non-empty string/u,
  );
});
