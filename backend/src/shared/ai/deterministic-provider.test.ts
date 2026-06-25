import assert from "node:assert/strict";
import test from "node:test";

import { DeterministicAiProvider } from "./deterministic-provider.ts";

test("deterministic provider returns assistant actions for local task messages", async () => {
  const provider = new DeterministicAiProvider();
  const response = await provider.generateJson<{
    actions: Array<{ title: string | null; type: string }>;
    navigationHint: string | null;
  }>({
    instructions: "Return assistant JSON.",
    input: [
      "Latest user message:",
      "Add a task to review the local workflow tomorrow",
      "",
      "Recent conversation:",
      "[]",
      "",
      "Current goals:",
      "[]",
      "",
      "Current tasks:",
      "[]",
      "",
      "Current metrics:",
      "[]",
      "",
      "Recent work logs:",
      "[]",
      "",
      "Saved personal scheduling context:",
      "{}",
      "",
      "Pending schedule proposals that still need user confirmation:",
      "[]",
    ].join("\n"),
    schemaName: "assistant_turn",
    schema: {},
  });

  assert.equal(response.navigationHint, "tasks");
  assert.equal(response.actions[0]?.type, "create_task");
  assert.match(response.actions[0]?.title ?? "", /review local workflow/i);
});

test("deterministic provider leaves broad schedule requests to the scheduling engine", async () => {
  const provider = new DeterministicAiProvider();
  const response = await provider.generateJson<{
    actions: Array<{ type: string }>;
    navigationHint: string | null;
  }>({
    instructions: "Return assistant JSON.",
    input: [
      "Latest user message:",
      "Build a schedule for that task tomorrow",
      "",
      "Recent conversation:",
      "[]",
      "",
      "Current goals:",
      "[]",
      "",
      "Current tasks:",
      JSON.stringify([{ id: "task-1", title: "Write proposal" }]),
      "",
      "Current metrics:",
      "[]",
      "",
      "Recent work logs:",
      "[]",
      "",
      "Saved personal scheduling context:",
      "{}",
      "",
      "Pending schedule proposals that still need user confirmation:",
      "[]",
    ].join("\n"),
    schemaName: "assistant_turn",
    schema: {},
  });

  assert.equal(response.navigationHint, "calendar");
  assert.deepEqual(response.actions, []);
});

test("deterministic provider keeps exact schedule requests direct", async () => {
  const provider = new DeterministicAiProvider();
  const response = await provider.generateJson<{
    actions: Array<{ taskId: string | null; type: string }>;
    navigationHint: string | null;
  }>({
    instructions: "Return assistant JSON.",
    input: [
      "Latest user message:",
      "Schedule the first task tomorrow at 9am",
      "",
      "Recent conversation:",
      "[]",
      "",
      "Current goals:",
      "[]",
      "",
      "Current tasks:",
      JSON.stringify([{ id: "task-1", title: "Write proposal" }]),
      "",
      "Current metrics:",
      "[]",
      "",
      "Recent work logs:",
      "[]",
      "",
      "Saved personal scheduling context:",
      "{}",
      "",
      "Pending schedule proposals that still need user confirmation:",
      "[]",
    ].join("\n"),
    schemaName: "assistant_turn",
    schema: {},
  });

  assert.equal(response.navigationHint, "calendar");
  assert.equal(response.actions[0]?.type, "schedule_task");
  assert.equal(response.actions[0]?.taskId, "task-1");
});

test("deterministic provider handles multiple workspace intents in one message", async () => {
  const provider = new DeterministicAiProvider();
  const response = await provider.generateJson<{
    actions: Array<{
      estimatedMinutes: number | null;
      focusAreas: Array<{
        cadence: string | null;
        defaultDurationMinutes: number | null;
        title: string;
      }>;
      goalId: string | null;
      targetValue: number | null;
      title: string | null;
      type: string;
      unitLabel: string | null;
    }>;
    navigationHint: string | null;
  }>({
    instructions: "Return assistant JSON.",
    input: [
      "Latest user message:",
      "Create a goal to pass calculus. Daily 30 minute study routine. Add a task to email the tutor. Create a metric to track 10 hours.",
      "",
      "Recent conversation:",
      "[]",
      "",
      "Current goals:",
      "[]",
      "",
      "Current tasks:",
      "[]",
      "",
      "Current metrics:",
      "[]",
      "",
      "Recent work logs:",
      "[]",
      "",
      "Saved personal scheduling context:",
      "{}",
      "",
      "Pending schedule proposals that still need user confirmation:",
      "[]",
    ].join("\n"),
    schemaName: "assistant_turn",
    schema: {},
  });

  assert.equal(response.navigationHint, "metrics");
  assert.deepEqual(
    response.actions.map((item) => item.type),
    ["create_goal", "create_task", "create_metric"],
  );
  assert.equal(response.actions[0]?.focusAreas[0]?.cadence, "daily");
  assert.equal(response.actions[0]?.focusAreas[0]?.defaultDurationMinutes, 30);
  assert.equal(response.actions[0]?.focusAreas[0]?.title, "Study");
  assert.equal(response.actions[1]?.goalId, null);
  assert.match(response.actions[1]?.title ?? "", /email tutor/i);
  assert.equal(response.actions[2]?.targetValue, 10);
  assert.equal(response.actions[2]?.unitLabel, "hours");
});

test("deterministic provider creates starter focus blocks for outcome-only goals", async () => {
  const provider = new DeterministicAiProvider();
  const response = await provider.generateJson<{
    actions: Array<{
      focusAreas: Array<{
        cadence: string | null;
        defaultDurationMinutes: number | null;
        title: string;
      }>;
      title: string | null;
      type: string;
    }>;
    assistantMessage: string;
    navigationHint: string | null;
  }>({
    instructions: "Return assistant JSON.",
    input: [
      "Latest user message:",
      "Create a goal to get visible abs. Schedule my week.",
      "",
      "Recent conversation:",
      "[]",
      "",
      "Current goals:",
      "[]",
      "",
      "Current tasks:",
      "[]",
      "",
      "Current metrics:",
      "[]",
      "",
      "Recent work logs:",
      "[]",
      "",
      "Saved personal scheduling context:",
      "{}",
      "",
      "Pending schedule proposals that still need user confirmation:",
      "[]",
    ].join("\n"),
    schemaName: "assistant_turn",
    schema: {},
  });

  assert.equal(response.navigationHint, "calendar");
  assert.match(response.assistantMessage, /scheduling engine/u);
  assert.deepEqual(
    response.actions.map((item) => item.type),
    ["create_goal"],
  );
  assert.deepEqual(
    response.actions[0]?.focusAreas.map((focusArea) => [
      focusArea.title,
      focusArea.cadence,
      focusArea.defaultDurationMinutes,
    ]),
    [
      ["Strength training", "3x/week", 45],
      ["Cardio", "2x/week", 30],
    ],
  );
});

test("deterministic provider preserves scheduling preferences in multi-part intake", async () => {
  const provider = new DeterministicAiProvider();
  const response = await provider.generateJson<{
    actions: Array<{
      dueAt: string | null;
      focusAreas: Array<{
        cadence: string | null;
        defaultDurationMinutes: number | null;
        title: string;
      }>;
      title: string | null;
      type: string;
    }>;
    schedulingPreferenceCandidates: Array<{
      activityTitle: string | null;
      applicabilityScope: string;
      confidence: string;
      detail: string;
      domain: string | null;
      evidence: string | null;
      goalTitle: string | null;
      kind: string;
      strength: string;
      temporalScope: string | null;
      title: string;
    }>;
  }>({
    instructions: "Return assistant JSON.",
    input: [
      "Latest user message:",
      "Create a goal to pass calculus. Daily 30 minute study routine. Add a task to email the tutor. I prefer study in the morning.",
      "",
      "Recent conversation:",
      "[]",
      "",
      "Current goals:",
      "[]",
      "",
      "Current tasks:",
      "[]",
      "",
      "Current metrics:",
      "[]",
      "",
      "Recent work logs:",
      "[]",
      "",
      "Saved personal scheduling context:",
      "{}",
      "",
      "Pending schedule proposals that still need user confirmation:",
      "[]",
    ].join("\n"),
    schemaName: "assistant_turn",
    schema: {},
  });

  assert.deepEqual(
    response.actions.map((item) => item.type),
    ["create_goal", "create_task"],
  );
  assert.equal(response.actions[0]?.focusAreas[0]?.cadence, "daily");
  assert.equal(response.actions[0]?.focusAreas[0]?.defaultDurationMinutes, 30);
  assert.equal(response.actions[0]?.focusAreas[0]?.title, "Study");
  assert.match(response.actions[1]?.title ?? "", /email tutor/i);
  assert.deepEqual(response.schedulingPreferenceCandidates, [
    {
      kind: "preferred_work_period",
      title: "Study morning preference",
      detail: "Prefer scheduling Study during the morning.",
      strength: "soft_preference",
      confidence: "medium",
      applicabilityScope: "activity",
      domain: null,
      goalTitle: null,
      activityTitle: "Study",
      temporalScope: "morning",
      evidence:
        "Create a goal to pass calculus. Daily 30 minute study routine. Add a task to email the tutor. I prefer study in the morning.",
    },
  ]);
});

test("deterministic provider keeps dumped availability out of workspace items", async () => {
  const provider = new DeterministicAiProvider();
  const response = await provider.generateJson<{
    actions: Array<{
      dueAt: string | null;
      focusAreas: Array<{
        cadence: string | null;
        defaultDurationMinutes: number | null;
        title: string;
      }>;
      title: string | null;
      type: string;
    }>;
    schedulingPreferenceCandidates: Array<{
      activityTitle: string | null;
      kind: string;
      temporalScope: string | null;
      title: string;
    }>;
  }>({
    instructions: "Return assistant JSON.",
    input: [
      "Latest user message:",
      "Here is my schedule: I work weekdays 8am-11am. I sleep 6pm-7am. I have class Tuesday 8am-11am. Create a goal to prepare for product launch; make a daily focus routine to draft the launch narrative for 60 minutes; add a task to review investor notes tomorrow for 45 minutes; add a task to email Maya tomorrow for 20 minutes; I prefer launch narrative in the afternoon; schedule my week.",
      "",
      "Recent conversation:",
      "[]",
      "",
      "Current goals:",
      "[]",
      "",
      "Current tasks:",
      "[]",
      "",
      "Current metrics:",
      "[]",
      "",
      "Recent work logs:",
      "[]",
      "",
      "Saved personal scheduling context:",
      "{}",
      "",
      "Pending schedule proposals that still need user confirmation:",
      "[]",
    ].join("\n"),
    schemaName: "assistant_turn",
    schema: {},
  });

  assert.deepEqual(
    response.actions.map((item) => [item.type, item.title]),
    [
      ["create_goal", "Prepare product launch"],
      ["create_task", "Review investor notes tomorrow 45 minutes"],
      ["create_task", "Email Maya tomorrow 20 minutes"],
    ],
  );
  assert.deepEqual(
    response.actions[0]?.focusAreas.map((focusArea) => [
      focusArea.title,
      focusArea.cadence,
      focusArea.defaultDurationMinutes,
    ]),
    [["Draft launch narrative", "daily", 60]],
  );
  assert.deepEqual(
    response.actions
      .filter((action) => action.type === "create_task")
      .map((action) => new Date(action.dueAt ?? "").getHours()),
    [23, 23],
  );
  assert.deepEqual(
    response.schedulingPreferenceCandidates.map((candidate) => [
      candidate.kind,
      candidate.title,
      candidate.activityTitle,
      candidate.temporalScope,
    ]),
    [
      [
        "work_hours",
        "Protect weekday work hours",
        null,
        "weekdays",
      ],
      [
        "sleep_window",
        "Protect sleep",
        null,
        "nightly",
      ],
      [
        "no_schedule_window",
        "Protect Tuesday class",
        null,
        "Tuesday",
      ],
      [
        "preferred_work_period",
        "Launch Narrative afternoon preference",
        "Launch Narrative",
        "afternoon",
      ],
    ],
  );
});

test("deterministic provider separates standalone habits in complex schedule dumps", async () => {
  const provider = new DeterministicAiProvider();
  const response = await provider.generateJson<{
    actions: Array<{
      focusAreas: Array<{
        cadence: string | null;
        defaultDurationMinutes: number | null;
        title: string;
      }>;
      title: string | null;
      type: string;
    }>;
    navigationHint: string | null;
    schedulingPreferenceCandidates: Array<{
      activityTitle: string | null;
      kind: string;
      temporalScope: string | null;
      title: string;
    }>;
  }>({
    instructions: "Return assistant JSON.",
    input: [
      "Latest user message:",
      "Here is my schedule: I work weekdays 8am-11am. I sleep 6pm-7am. I have class Tuesday 8am-11am. Create a goal to prepare for product launch; make a daily focus routine to draft the launch narrative for 60 minutes; add a task to review investor notes tomorrow for 45 minutes; add a daily 20 minute stretch routine; I prefer launch narrative in the afternoon; schedule next week.",
      "",
      "Recent conversation:",
      "[]",
      "",
      "Current goals:",
      "[]",
      "",
      "Current tasks:",
      "[]",
      "",
      "Current metrics:",
      "[]",
      "",
      "Recent work logs:",
      "[]",
      "",
      "Saved personal scheduling context:",
      "{}",
      "",
      "Pending schedule proposals that still need user confirmation:",
      "[]",
    ].join("\n"),
    schemaName: "assistant_turn",
    schema: {},
  });

  assert.equal(response.navigationHint, "calendar");
  assert.deepEqual(
    response.actions.map((action) => [action.type, action.title]),
    [
      ["create_goal", "Prepare product launch"],
      ["create_goal", "Personal routines"],
      ["create_task", "Review investor notes tomorrow 45 minutes"],
    ],
  );
  assert.deepEqual(
    response.actions[0]?.focusAreas.map((focusArea) => [
      focusArea.title,
      focusArea.cadence,
      focusArea.defaultDurationMinutes,
    ]),
    [["Draft launch narrative", "daily", 60]],
  );
  assert.deepEqual(
    response.actions[1]?.focusAreas.map((focusArea) => [
      focusArea.title,
      focusArea.cadence,
      focusArea.defaultDurationMinutes,
    ]),
    [["Stretch", "daily", 20]],
  );
  assert.deepEqual(
    response.schedulingPreferenceCandidates.map((candidate) => [
      candidate.kind,
      candidate.title,
      candidate.activityTitle,
      candidate.temporalScope,
    ]),
    [
      ["work_hours", "Protect weekday work hours", null, "weekdays"],
      ["sleep_window", "Protect sleep", null, "nightly"],
      ["no_schedule_window", "Protect Tuesday class", null, "Tuesday"],
      [
        "preferred_work_period",
        "Launch Narrative afternoon preference",
        "Launch Narrative",
        "afternoon",
      ],
    ],
  );
});

test("deterministic provider extracts one-session deliverables from dumps", async () => {
  const provider = new DeterministicAiProvider();
  const response = await provider.generateJson<{
    actions: Array<{
      dueAt: string | null;
      estimatedMinutes: number | null;
      title: string | null;
      type: string;
    }>;
    navigationHint: string | null;
  }>({
    instructions: "Return assistant JSON.",
    input: [
      "Latest user message:",
      "Here is everything for this week: I work weekdays 8am-11am. Review investor notes tomorrow for 45 minutes. Email Maya tomorrow for 20 minutes. Schedule my week.",
      "",
      "Recent conversation:",
      "[]",
      "",
      "Current goals:",
      "[]",
      "",
      "Current tasks:",
      "[]",
      "",
      "Current metrics:",
      "[]",
      "",
      "Recent work logs:",
      "[]",
      "",
      "Saved personal scheduling context:",
      "{}",
      "",
      "Pending schedule proposals that still need user confirmation:",
      "[]",
    ].join("\n"),
    schemaName: "assistant_turn",
    schema: {},
  });

  assert.equal(response.navigationHint, "calendar");
  assert.deepEqual(
    response.actions.map((action) => [
      action.type,
      action.title,
      action.estimatedMinutes,
    ]),
    [
      ["create_task", "Review investor notes tomorrow 45 minutes", 45],
      ["create_task", "Email Maya tomorrow 20 minutes", 20],
    ],
  );
  assert.deepEqual(
    response.actions.map((action) => new Date(action.dueAt ?? "").getHours()),
    [23, 23],
  );
});

test("deterministic provider keeps context times from becoming task schedule slots", async () => {
  const provider = new DeterministicAiProvider();
  const response = await provider.generateJson<{
    actions: Array<{
      dueAt: string | null;
      estimatedMinutes: number | null;
      focusAreas: Array<{
        cadence: string | null;
        defaultDurationMinutes: number | null;
        title: string;
      }>;
      title: string | null;
      type: string;
    }>;
    assistantMessage: string;
    navigationHint: string | null;
  }>({
    instructions: "Return assistant JSON.",
    input: [
      "Latest user message:",
      "Here is my schedule: class Tuesday 8am-11am, review notes tomorrow for 45 minutes, and add a daily 20 minute stretch routine. Schedule my week.",
      "",
      "Recent conversation:",
      "[]",
      "",
      "Current goals:",
      "[]",
      "",
      "Current tasks:",
      "[]",
      "",
      "Current metrics:",
      "[]",
      "",
      "Recent work logs:",
      "[]",
      "",
      "Saved personal scheduling context:",
      "{}",
      "",
      "Pending schedule proposals that still need user confirmation:",
      "[]",
    ].join("\n"),
    schemaName: "assistant_turn",
    schema: {},
  });

  assert.equal(response.navigationHint, "calendar");
  assert.match(response.assistantMessage, /scheduling engine/u);
  assert.deepEqual(
    response.actions.map((action) => [action.type, action.title]),
    [
      ["create_goal", "Personal routines"],
      ["create_task", "Review notes tomorrow 45 minutes"],
    ],
  );
  assert.deepEqual(
    response.actions[0]?.focusAreas.map((focusArea) => [
      focusArea.title,
      focusArea.cadence,
      focusArea.defaultDurationMinutes,
    ]),
    [["Stretch", "daily", 20]],
  );
  assert.equal(response.actions[1]?.estimatedMinutes, 45);
  assert.equal(new Date(response.actions[1]?.dueAt ?? "").getHours(), 23);
});

test("deterministic provider keeps broad schedule requests out of tasks", async () => {
  const provider = new DeterministicAiProvider();
  const response = await provider.generateJson<{
    actions: Array<{ type: string }>;
    navigationHint: string | null;
  }>({
    instructions: "Return assistant JSON.",
    input: [
      "Latest user message:",
      "Schedule my week.",
      "",
      "Recent conversation:",
      "[]",
      "",
      "Current goals:",
      "[]",
      "",
      "Current tasks:",
      "[]",
      "",
      "Current metrics:",
      "[]",
      "",
      "Recent work logs:",
      "[]",
      "",
      "Saved personal scheduling context:",
      "{}",
      "",
      "Pending schedule proposals that still need user confirmation:",
      "[]",
    ].join("\n"),
    schemaName: "assistant_turn",
    schema: {},
  });

  assert.equal(response.navigationHint, "calendar");
  assert.deepEqual(response.actions, []);
});

test("deterministic provider preserves repeated tasks and habits in one message", async () => {
  const provider = new DeterministicAiProvider();
  const response = await provider.generateJson<{
    actions: Array<{
      estimatedMinutes: number | null;
      focusAreas: Array<{
        cadence: string | null;
        defaultDurationMinutes: number | null;
        title: string;
      }>;
      title: string | null;
      type: string;
    }>;
  }>({
    instructions: "Return assistant JSON.",
    input: [
      "Latest user message:",
      "Create a goal to prepare for finals. Daily 30 minute study routine. Weekly 45 minute review routine. Add a task to email the tutor. Add a task to print the syllabus. Create a metric to track 10 hours.",
      "",
      "Recent conversation:",
      "[]",
      "",
      "Current goals:",
      "[]",
      "",
      "Current tasks:",
      "[]",
      "",
      "Current metrics:",
      "[]",
      "",
      "Recent work logs:",
      "[]",
      "",
      "Saved personal scheduling context:",
      "{}",
      "",
      "Pending schedule proposals that still need user confirmation:",
      "[]",
    ].join("\n"),
    schemaName: "assistant_turn",
    schema: {},
  });

  assert.deepEqual(
    response.actions.map((item) => item.type),
    ["create_goal", "create_task", "create_task", "create_metric"],
  );
  assert.deepEqual(
    response.actions[0]?.focusAreas.map((focusArea) => [
      focusArea.cadence,
      focusArea.defaultDurationMinutes,
      focusArea.title,
    ]),
    [
      ["daily", 30, "Study"],
      ["weekly", 45, "Review"],
    ],
  );
  assert.match(response.actions[1]?.title ?? "", /email tutor/i);
  assert.match(response.actions[2]?.title ?? "", /print syllabus/i);
});

test("deterministic provider keeps explicit weekly items as tasks", async () => {
  const provider = new DeterministicAiProvider();
  const response = await provider.generateJson<{
    actions: Array<{
      description: string | null;
      recurrence: {
        frequency: string;
        interval: number;
        daysOfWeek: number[];
        endsAt: string | null;
        sourceText: string | null;
        scheduledOccurrences: unknown[];
      } | null;
      title: string | null;
      type: string;
    }>;
    navigationHint: string | null;
  }>({
    instructions: "Return assistant JSON.",
    input: [
      "Latest user message:",
      "Add a task to submit the weekly report.",
      "",
      "Recent conversation:",
      "[]",
      "",
      "Current goals:",
      "[]",
      "",
      "Current tasks:",
      "[]",
      "",
      "Current metrics:",
      "[]",
      "",
      "Recent work logs:",
      "[]",
      "",
      "Saved personal scheduling context:",
      "{}",
      "",
      "Pending schedule proposals that still need user confirmation:",
      "[]",
    ].join("\n"),
    schemaName: "assistant_turn",
    schema: {},
  });

  assert.equal(response.navigationHint, "tasks");
  assert.deepEqual(
    response.actions.map((item) => item.type),
    ["create_task"],
  );
  assert.match(response.actions[0]?.title ?? "", /submit weekly report/i);
  assert.deepEqual(response.actions[0]?.recurrence, {
    frequency: "weekly",
    interval: 1,
    daysOfWeek: [],
    endsAt: null,
    sourceText: "Add a task to submit the weekly report",
    scheduledOccurrences: [],
  });
});

test("deterministic provider treats vague lifestyle practices as starter habits", async () => {
  const provider = new DeterministicAiProvider();
  const response = await provider.generateJson<{
    actions: Array<{
      focusAreas: Array<{
        cadence: string | null;
        defaultDurationMinutes: number | null;
        title: string;
      }>;
      title: string | null;
      type: string;
    }>;
    navigationHint: string | null;
  }>({
    instructions: "Return assistant JSON.",
    input: [
      "Latest user message:",
      "I want to meditate. Schedule my week.",
      "",
      "Recent conversation:",
      "[]",
      "",
      "Current goals:",
      "[]",
      "",
      "Current tasks:",
      "[]",
      "",
      "Current metrics:",
      "[]",
      "",
      "Recent work logs:",
      "[]",
      "",
      "Saved personal scheduling context:",
      "{}",
      "",
      "Pending schedule proposals that still need user confirmation:",
      "[]",
    ].join("\n"),
    schemaName: "assistant_turn",
    schema: {},
  });

  assert.equal(response.navigationHint, "calendar");
  assert.deepEqual(
    response.actions.map((item) => item.type),
    ["create_goal"],
  );
  assert.equal(response.actions[0]?.title, "Personal routines");
  assert.deepEqual(
    response.actions[0]?.focusAreas.map((focusArea) => [
      focusArea.title,
      focusArea.cadence,
      focusArea.defaultDurationMinutes,
    ]),
    [["Meditate", null, null]],
  );
});

test("deterministic provider recognizes every-morning practice phrasing as a habit", async () => {
  const provider = new DeterministicAiProvider();
  const response = await provider.generateJson<{
    actions: Array<{
      focusAreas: Array<{
        cadence: string | null;
        defaultDurationMinutes: number | null;
        title: string;
      }>;
      title: string | null;
      type: string;
    }>;
    schedulingPreferenceCandidates: Array<{
      activityTitle: string | null;
      detail: string;
      temporalScope: string | null;
    }>;
  }>({
    instructions: "Return assistant JSON.",
    input: [
      "Latest user message:",
      "Read every morning.",
      "",
      "Recent conversation:",
      "[]",
      "",
      "Current goals:",
      "[]",
      "",
      "Current tasks:",
      "[]",
      "",
      "Current metrics:",
      "[]",
      "",
      "Recent work logs:",
      "[]",
      "",
      "Saved personal scheduling context:",
      "{}",
      "",
      "Pending schedule proposals that still need user confirmation:",
      "[]",
    ].join("\n"),
    schemaName: "assistant_turn",
    schema: {},
  });

  assert.deepEqual(
    response.actions.map((item) => item.type),
    ["create_goal"],
  );
  assert.equal(response.actions[0]?.title, "Personal routines");
  assert.deepEqual(
    response.actions[0]?.focusAreas.map((focusArea) => [
      focusArea.title,
      focusArea.cadence,
      focusArea.defaultDurationMinutes,
    ]),
    [["Read", "daily", null]],
  );
  assert.deepEqual(
    response.schedulingPreferenceCandidates.map((candidate) => ({
      activityTitle: candidate.activityTitle,
      detail: candidate.detail,
      temporalScope: candidate.temporalScope,
    })),
    [
      {
        activityTitle: "Read",
        detail: "Prefer scheduling Read during the morning.",
        temporalScope: "morning",
      },
    ],
  );
});

test("deterministic provider reuses Personal routines for later standalone habits", async () => {
  const provider = new DeterministicAiProvider();
  const response = await provider.generateJson<{
    actions: Array<{
      focusAreas: Array<{
        cadence: string | null;
        defaultDurationMinutes: number | null;
        title: string;
      }>;
      goalId: string | null;
      title: string | null;
      type: string;
    }>;
  }>({
    instructions: "Return assistant JSON.",
    input: [
      "Latest user message:",
      "Weekly 45 minute meal prep routine.",
      "",
      "Recent conversation:",
      "[]",
      "",
      "Current goals:",
      JSON.stringify([
        {
          id: "goal-routines",
          title: "Personal routines",
          status: "active",
          focusAreas: [
            {
              id: "local-focus-daily-stretching-habit",
              title: "Daily stretching habit",
              description: "Stretch every day.",
              status: "active",
              defaultDurationMinutes: 15,
              cadence: "daily",
            },
          ],
        },
      ]),
      "",
      "Current tasks:",
      "[]",
      "",
      "Current metrics:",
      "[]",
      "",
      "Recent work logs:",
      "[]",
      "",
      "Saved personal scheduling context:",
      "{}",
      "",
      "Pending schedule proposals that still need user confirmation:",
      "[]",
    ].join("\n"),
    schemaName: "assistant_turn",
    schema: {},
  });

  assert.deepEqual(
    response.actions.map((item) => item.type),
    ["update_goal"],
  );
  assert.equal(response.actions[0]?.goalId, "goal-routines");
  assert.deepEqual(
    response.actions[0]?.focusAreas.map((focusArea) => [
      focusArea.title,
      focusArea.cadence,
      focusArea.defaultDurationMinutes,
    ]),
    [
      ["Daily stretching habit", "daily", 15],
      ["Meal prep", "weekly", 45],
    ],
  );
});

test("deterministic provider leaves same-turn follow-ons unlinked when creating a new goal", async () => {
  const provider = new DeterministicAiProvider();
  const response = await provider.generateJson<{
    actions: Array<{
      goalId: string | null;
      title: string | null;
      type: string;
    }>;
  }>({
    instructions: "Return assistant JSON.",
    input: [
      "Latest user message:",
      "Create a goal to prepare for product launch. Add a task to review investor notes. Create a metric to track 10 hours.",
      "",
      "Recent conversation:",
      "[]",
      "",
      "Current goals:",
      JSON.stringify([{ id: "old-goal", title: "Old goal" }]),
      "",
      "Current tasks:",
      "[]",
      "",
      "Current metrics:",
      "[]",
      "",
      "Recent work logs:",
      "[]",
      "",
      "Saved personal scheduling context:",
      "{}",
      "",
      "Pending schedule proposals that still need user confirmation:",
      "[]",
    ].join("\n"),
    schemaName: "assistant_turn",
    schema: {},
  });

  assert.deepEqual(
    response.actions.map((item) => [item.type, item.goalId]),
    [
      ["create_goal", null],
      ["create_task", null],
      ["create_metric", null],
    ],
  );
});

test("deterministic provider can create and exactly schedule a task in one message", async () => {
  const provider = new DeterministicAiProvider();
  const response = await provider.generateJson<{
    actions: Array<{
      startTime: string | null;
      taskId: string | null;
      title: string | null;
      type: string;
    }>;
    navigationHint: string | null;
  }>({
    instructions: "Return assistant JSON.",
    input: [
      "Latest user message:",
      "Add a task to review calculus notes and schedule it tomorrow at 9am.",
      "",
      "Recent conversation:",
      "[]",
      "",
      "Current goals:",
      "[]",
      "",
      "Current tasks:",
      "[]",
      "",
      "Current metrics:",
      "[]",
      "",
      "Recent work logs:",
      "[]",
      "",
      "Saved personal scheduling context:",
      "{}",
      "",
      "Pending schedule proposals that still need user confirmation:",
      "[]",
    ].join("\n"),
    schemaName: "assistant_turn",
    schema: {},
  });

  assert.equal(response.navigationHint, "calendar");
  assert.deepEqual(
    response.actions.map((item) => item.type),
    ["create_task", "schedule_task"],
  );
  assert.equal(response.actions[1]?.taskId, null);
  assert.equal(response.actions[1]?.title, response.actions[0]?.title);
  assert.match(response.actions[1]?.startTime ?? "", /T/u);
});

test("deterministic provider confirms the proposal id named by the UI prompt", async () => {
  const provider = new DeterministicAiProvider();
  const response = await provider.generateJson<{
    actions: Array<{ proposalId: string | null; type: string }>;
    navigationHint: string | null;
  }>({
    instructions: "Return assistant JSON.",
    input: [
      "Latest user message:",
      "Confirm schedule proposal proposal-new.",
      "",
      "Recent conversation:",
      "[]",
      "",
      "Current goals:",
      "[]",
      "",
      "Current tasks:",
      "[]",
      "",
      "Current metrics:",
      "[]",
      "",
      "Recent work logs:",
      "[]",
      "",
      "Saved personal scheduling context:",
      "{}",
      "",
      "Pending schedule proposals that still need user confirmation:",
      JSON.stringify([{ id: "proposal-old" }, { id: "proposal-new" }]),
    ].join("\n"),
    schemaName: "assistant_turn",
    schema: {},
  });

  assert.equal(response.navigationHint, "calendar");
  assert.equal(response.actions[0]?.type, "confirm_schedule_proposal");
  assert.equal(response.actions[0]?.proposalId, "proposal-new");
});

test("deterministic provider falls back to the first pending proposal for generic approval", async () => {
  const provider = new DeterministicAiProvider();
  const response = await provider.generateJson<{
    actions: Array<{ proposalId: string | null; type: string }>;
  }>({
    instructions: "Return assistant JSON.",
    input: [
      "Latest user message:",
      "Yes, implement it.",
      "",
      "Recent conversation:",
      "[]",
      "",
      "Current goals:",
      "[]",
      "",
      "Current tasks:",
      "[]",
      "",
      "Current metrics:",
      "[]",
      "",
      "Recent work logs:",
      "[]",
      "",
      "Saved personal scheduling context:",
      "{}",
      "",
      "Pending schedule proposals that still need user confirmation:",
      JSON.stringify([{ id: "proposal-latest" }, { id: "proposal-older" }]),
    ].join("\n"),
    schemaName: "assistant_turn",
    schema: {},
  });

  assert.equal(response.actions[0]?.type, "confirm_schedule_proposal");
  assert.equal(response.actions[0]?.proposalId, "proposal-latest");
});

test("deterministic provider dismisses the proposal id named by the UI prompt", async () => {
  const provider = new DeterministicAiProvider();
  const response = await provider.generateJson<{
    actions: Array<{ proposalId: string | null; type: string }>;
    navigationHint: string | null;
  }>({
    instructions: "Return assistant JSON.",
    input: [
      "Latest user message:",
      "Reject schedule proposal proposal-new.",
      "",
      "Recent conversation:",
      "[]",
      "",
      "Current goals:",
      "[]",
      "",
      "Current tasks:",
      "[]",
      "",
      "Current metrics:",
      "[]",
      "",
      "Recent work logs:",
      "[]",
      "",
      "Saved personal scheduling context:",
      "{}",
      "",
      "Pending schedule proposals that still need user confirmation:",
      JSON.stringify([{ id: "proposal-old" }, { id: "proposal-new" }]),
    ].join("\n"),
    schemaName: "assistant_turn",
    schema: {},
  });

  assert.equal(response.navigationHint, "calendar");
  assert.equal(response.actions[0]?.type, "dismiss_schedule_proposal");
  assert.equal(response.actions[0]?.proposalId, "proposal-new");
});

test("deterministic provider extracts week-boundary scheduling preferences", async () => {
  const provider = new DeterministicAiProvider();
  const response = await provider.generateJson<{
    schedulingPreferenceCandidates: Array<{
      applicabilityScope: string;
      kind: string;
      title: string;
    }>;
  }>({
    instructions: "Return assistant JSON.",
    input: [
      "Latest user message:",
      "My scheduling week runs from Monday through Sunday.",
      "",
      "Recent conversation:",
      "[]",
      "",
      "Current goals:",
      "[]",
      "",
      "Current tasks:",
      "[]",
      "",
      "Current metrics:",
      "[]",
      "",
      "Recent work logs:",
      "[]",
      "",
      "Saved personal scheduling context:",
      "{}",
      "",
      "Pending schedule proposals that still need user confirmation:",
      "[]",
    ].join("\n"),
    schemaName: "assistant_turn",
    schema: {},
  });

  assert.equal(response.schedulingPreferenceCandidates[0]?.kind, "custom");
  assert.equal(
    response.schedulingPreferenceCandidates[0]?.title,
    "Preferred scheduling week boundary",
  );
  assert.equal(
    response.schedulingPreferenceCandidates[0]?.applicabilityScope,
    "global",
  );
});

test("deterministic provider extracts unavailable work periods", async () => {
  const provider = new DeterministicAiProvider();
  const response = await provider.generateJson<{
    schedulingPreferenceCandidates: Array<{
      applicabilityScope: string;
      detail: string;
      kind: string;
      strength: string;
      temporalScope: string | null;
      title: string;
    }>;
  }>({
    instructions: "Return assistant JSON.",
    input: [
      "Latest user message:",
      "Afternoons are blocked now.",
      "",
      "Recent conversation:",
      "[]",
      "",
      "Current goals:",
      "[]",
      "",
      "Current tasks:",
      "[]",
      "",
      "Current metrics:",
      "[]",
      "",
      "Recent work logs:",
      "[]",
      "",
      "Saved personal scheduling context:",
      "{}",
      "",
      "Pending schedule proposals that still need user confirmation:",
      "[]",
    ].join("\n"),
    schemaName: "assistant_turn",
    schema: {},
  });

  assert.equal(
    response.schedulingPreferenceCandidates[0]?.kind,
    "no_schedule_window",
  );
  assert.equal(
    response.schedulingPreferenceCandidates[0]?.title,
    "Avoid scheduling afternoons",
  );
  assert.equal(
    response.schedulingPreferenceCandidates[0]?.detail,
    "Avoid generated schedule drafts during the afternoon when possible.",
  );
  assert.equal(
    response.schedulingPreferenceCandidates[0]?.strength,
    "soft_preference",
  );
  assert.equal(
    response.schedulingPreferenceCandidates[0]?.applicabilityScope,
    "global",
  );
  assert.equal(
    response.schedulingPreferenceCandidates[0]?.temporalScope,
    "afternoon",
  );
});

test("deterministic provider extracts work-log metric progress", async () => {
  const provider = new DeterministicAiProvider();
  const response = await provider.generateJson<{
    progressUpdates: Array<{ deltaValue: number; metricId: string }>;
  }>({
    instructions: "Return work log JSON.",
    input: [
      "Work log message:",
      "I worked 2 hours on local testing",
      "",
      "Goals:",
      "[]",
      "",
      "Tasks:",
      "[]",
      "",
      "Metrics:",
      JSON.stringify([{ id: "metric-1" }]),
    ].join("\n"),
    schemaName: "work_log_turn",
    schema: {},
  });

  assert.deepEqual(response.progressUpdates, [
    {
      metricId: "metric-1",
      deltaValue: 2,
      note: "Extracted by deterministic local AI.",
    },
  ]);
});
