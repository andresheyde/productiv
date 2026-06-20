import assert from "node:assert/strict";
import test from "node:test";

import type { AssistantActionType } from "./assistant.types.ts";
import {
  ASSISTANT_TURN_SCHEMA,
  SCHEDULE_REFLECTION_SCHEMA,
  WORK_LOG_SCHEMA,
  buildAssistantTurnInput,
  buildScheduleReflectionInput,
  buildWorkLogInput,
  createAssistantTurnInstructions,
  createScheduleReflectionInstructions,
  createWorkLogInstructions,
  normalizeAssistantModelResponse,
  normalizeScheduleReflectionModelResponse,
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
  "schedule_goal_focus",
  "propose_schedule_goal_focus",
  "confirm_schedule_proposal",
  "dismiss_schedule_proposal",
];

function modelAction(type: AssistantActionType) {
  return {
    type,
    proposalId: "proposal-1",
    goalId: "goal-1",
    focusId: "focus-1",
    taskId: "task-1",
    metricId: "metric-1",
    title: "  Launch beta  ",
    definition: "Ship a useful beta",
    successCriteria: ["  Five interviews  "],
    focusAreas: [
      {
        id: "focus-1",
        title: "  Interview users  ",
        description: "Talk to likely users",
        status: "active",
        defaultDurationMinutes: 45,
        cadence: "weekly",
      },
    ],
    scheduleGuidance: {
      timeAvailability: "Weekday mornings",
      timeProtectionPlan: ["Block 45 minutes"],
      limitingHabits: [],
      scriptedActions: [],
      environmentalOptimizations: [],
    },
    constraints: ["  Keep weekends open  "],
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
  assert.equal(SCHEDULE_REFLECTION_SCHEMA.type, "object");
  assert.deepEqual(SCHEDULE_REFLECTION_SCHEMA.required, [
    "assistantMessage",
    "shouldSaveReflection",
    "summary",
    "contextSummary",
    "navigationHint",
    "timeframeStart",
    "timeframeEnd",
    "liked",
    "disliked",
    "obstacles",
    "strategySuggestions",
  ]);
});

test("assistant instructions constrain scheduling and workspace mutations", () => {
  const instructions = createAssistantTurnInstructions();

  assert.match(instructions, /Identify the user's intent first/u);
  assert.match(instructions, /minimum missing information/u);
  assert.match(instructions, /do not require barrier analysis/u);
  assert.match(instructions, /later reflection data/u);
  assert.match(instructions, /Only create or update goals/u);
  assert.match(instructions, /Do not auto-create tasks from goals/u);
  assert.match(instructions, /goal-focus scheduling/u);
  assert.match(instructions, /When enough information exists/u);
  assert.match(instructions, /propose_schedule_task/u);
  assert.match(instructions, /propose_schedule_goal_focus/u);
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

test("schedule reflection instructions capture lived schedule feedback", () => {
  const instructions = createScheduleReflectionInstructions();

  assert.match(instructions, /current or previous schedule/u);
  assert.match(instructions, /what worked, what did not work, obstacles/u);
  assert.match(instructions, /ICS-style strategies/u);
  assert.match(instructions, /shouldSaveReflection to false/u);
  assert.match(instructions, /one to three suggestions/u);
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

test("schedule reflection input serializes schedule context and recent workspace state", () => {
  const input = buildScheduleReflectionInput({
    message: "Mornings worked, but I kept losing time after lunch.",
    goals: [{ id: "goal-1" }],
    tasks: [{ id: "task-1", dueAt: "2026-07-01T13:00:00.000Z" }],
    metrics: [{ id: "metric-1" }],
    workLogs: [{ id: "work-log-1" }],
    messages: [{ role: "user", content: "Reflect on my week." }],
    schedulingContext: { preferredFocusBlockMinutes: 60 },
  });

  assert.match(input, /Latest schedule reflection message/u);
  assert.match(input, /Mornings worked/u);
  assert.match(input, /Current tasks and schedule-relevant state/u);
  assert.match(input, /"preferredFocusBlockMinutes": 60/u);
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
    assert.equal(result.actions[0]?.focusId, "focus-1");
    assert.deepEqual(result.actions[0]?.successCriteria, ["Five interviews"]);
    assert.equal(result.actions[0]?.focusAreas[0]?.title, "Interview users");
    assert.deepEqual(result.actions[0]?.scheduleGuidance, {
      timeAvailability: "Weekday mornings",
      timeProtectionPlan: ["Block 45 minutes"],
      limitingHabits: [],
      scriptedActions: [],
      environmentalOptimizations: [],
    });
    assert.deepEqual(result.actions[0]?.constraints, ["Keep weekends open"]);
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

test("normalizeAssistantModelResponse sanitizes goal focus action fields", () => {
  const result = normalizeAssistantModelResponse({
    assistantMessage: "Done",
    contextSummary: "Summary",
    navigationHint: "goals",
    actions: [
      {
        ...modelAction("update_goal"),
        focusId: null,
        successCriteria: "not-an-array",
        focusAreas: [
          null,
          [],
          { title: "   " },
          {
            id: null,
            title: "  API design prep!  ",
            description: null,
            status: "paused",
            defaultDurationMinutes: -5,
            cadence: null,
          },
        ],
        scheduleGuidance: null,
        constraints: ["  one session at a time  "],
      },
      {
        ...modelAction("update_goal"),
        focusAreas: [
          {
            id: null,
            title: "  Resume polish  ",
            description: "Improve the resume",
            status: "completed",
            defaultDurationMinutes: 30,
            cadence: "one time",
          },
        ],
        scheduleGuidance: [],
      },
    ],
  });

  assert.equal(result.actions[0]?.focusId, null);
  assert.deepEqual(result.actions[0]?.successCriteria, []);
  assert.deepEqual(result.actions[0]?.focusAreas, [
    {
      id: "api-design-prep",
      title: "API design prep!",
      description: "",
      status: "paused",
      defaultDurationMinutes: null,
      cadence: null,
    },
  ]);
  assert.equal(result.actions[0]?.scheduleGuidance, null);
  assert.deepEqual(result.actions[0]?.constraints, ["one session at a time"]);
  assert.deepEqual(result.actions[1]?.focusAreas, [
    {
      id: "resume-polish",
      title: "Resume polish",
      description: "Improve the resume",
      status: "completed",
      defaultDurationMinutes: 30,
      cadence: "one time",
    },
  ]);
  assert.equal(result.actions[1]?.scheduleGuidance, null);
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

test("normalizeScheduleReflectionModelResponse extracts reflection and strategy suggestions", () => {
  const result = normalizeScheduleReflectionModelResponse({
    assistantMessage: "Saved reflection.",
    shouldSaveReflection: true,
    summary: " Morning blocks worked, lunch transition failed. ",
    contextSummary: " Schedule reflection saved ",
    navigationHint: "calendar",
    timeframeStart: " 2026-06-01 ",
    timeframeEnd: null,
    liked: [" Morning focus ", ""],
    disliked: [" Too many afternoon blocks "],
    obstacles: [" Lost momentum after lunch "],
    strategySuggestions: [
      {
        title: " Add a post-lunch restart ritual ",
        detail: "After lunch, open the task list and start with a 10-minute setup block.",
        strength: "soft_preference",
        confidence: "medium",
        obstacle: " Lost momentum after lunch ",
      },
      {
        title: "",
        detail: "Bad",
        strength: "soft_preference",
        confidence: "medium",
        obstacle: null,
      },
      {
        title: " Protect the first block ",
        detail: "Start with the most important work before checking messages.",
        strength: "hard_constraint",
        confidence: "high",
        obstacle: null,
      },
      {
        title: " Use a fallback block ",
        detail: "If the long block slips, schedule a shorter recovery block.",
        strength: "unknown",
        confidence: "unknown",
        obstacle: null,
      },
    ],
  });

  assert.equal(result.shouldSaveReflection, true);
  assert.equal(result.summary, "Morning blocks worked, lunch transition failed.");
  assert.equal(result.timeframeStart, "2026-06-01");
  assert.equal(result.timeframeEnd, null);
  assert.deepEqual(result.liked, ["Morning focus"]);
  assert.deepEqual(result.disliked, ["Too many afternoon blocks"]);
  assert.deepEqual(result.obstacles, ["Lost momentum after lunch"]);
  assert.deepEqual(result.strategySuggestions, [
    {
      title: "Add a post-lunch restart ritual",
      detail:
        "After lunch, open the task list and start with a 10-minute setup block.",
      strength: "soft_preference",
      confidence: "medium",
      obstacle: "Lost momentum after lunch",
    },
    {
      title: "Protect the first block",
      detail: "Start with the most important work before checking messages.",
      strength: "hard_constraint",
      confidence: "high",
      obstacle: null,
    },
    {
      title: "Use a fallback block",
      detail: "If the long block slips, schedule a shorter recovery block.",
      strength: "soft_preference",
      confidence: "low",
      obstacle: null,
    },
  ]);
});

test("normalizeScheduleReflectionModelResponse handles optional fallback fields", () => {
  const result = normalizeScheduleReflectionModelResponse({
    assistantMessage: "Tell me what worked and what did not.",
    shouldSaveReflection: false,
    summary: null,
    contextSummary: "Asked for reflection details",
    navigationHint: null,
    timeframeStart: null,
    timeframeEnd: null,
    liked: [],
    disliked: [],
    obstacles: [],
    strategySuggestions: undefined,
  });

  assert.equal(result.summary, "");
  assert.deepEqual(result.strategySuggestions, []);
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
