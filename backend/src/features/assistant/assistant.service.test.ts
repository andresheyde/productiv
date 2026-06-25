import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";

import { DeterministicAiProvider } from "../../shared/ai/deterministic-provider.ts";
import type { AssistantAction } from "./assistant.types.ts";
import type { ScheduleProposalRecord } from "./schedule-proposals.repository.ts";
import {
  buildSchedulingCandidateSlots,
  buildSchedulingPlacementPolicy,
  type SchedulingAssemblyDraft,
} from "./scheduling-placement-policy.ts";
import {
  applyTaskScheduleOperationToCalendar,
  buildScheduleGuidanceWithScheduledGoalFocusBlock,
  buildDeterministicScheduleProposalWarnings,
  buildProposalConfirmationHint,
  buildScheduleAssemblyUnscheduledItemsSummary,
  buildScheduleProposalActionsFromSchedulingAssemblyDraft,
  buildScheduleProposalRevisionHorizonOverride,
  buildSchedulingAssemblyDraftForTurn,
  buildSchedulingAssemblyInputsForTurn,
  createScheduleProposalRevisionFeedbackEntry,
  deriveSchedulingPreferenceCandidatesFromProposalFeedback,
  findReusablePersonalRoutinesGoal,
  formatScheduleBlockTitleForCalendar,
  inferGoalFocusSchedulingDefaults,
  inferTurnMode,
  mergeGoalFocusAreas,
  mergeGoalScheduleGuidance,
  mergeUniqueTextList,
  parseScheduleProposalRevisionFeedback,
  recordTaskScheduledOccurrence,
  resolveGoalIdForTurnAction,
  resolveGoalFocusForSchedulingAction,
  resolvePendingProposal,
  resolveScheduleProposalForRevision,
  shouldUsePlanningFlow,
} from "./assistant.service.ts";
import type { CompiledSchedulingContext } from "../scheduling-context/scheduling-context.types.ts";
import type { GoalRecord, TaskRecord } from "../workspace/workspace.types.ts";

function action(patch: Partial<AssistantAction> & Pick<AssistantAction, "type">) {
  return {
    type: patch.type,
    proposalId: patch.proposalId ?? null,
    goalId: patch.goalId ?? null,
    focusId: patch.focusId ?? null,
    taskId: patch.taskId ?? null,
    occurrenceKey: patch.occurrenceKey ?? null,
    metricId: patch.metricId ?? null,
    title: patch.title ?? null,
    definition: patch.definition ?? null,
    successCriteria: patch.successCriteria ?? [],
    focusAreas: patch.focusAreas ?? [],
    scheduleGuidance: patch.scheduleGuidance ?? null,
    constraints: patch.constraints ?? [],
    notes: patch.notes ?? null,
    description: patch.description ?? null,
    unitLabel: patch.unitLabel ?? null,
    targetValue: patch.targetValue ?? null,
    currentValue: patch.currentValue ?? null,
    dueAt: patch.dueAt ?? null,
    recurrence: patch.recurrence ?? null,
    estimatedMinutes: patch.estimatedMinutes ?? null,
    priorityRank: patch.priorityRank ?? 100,
    status: patch.status ?? null,
    scheduleIntent: patch.scheduleIntent ?? null,
    startTime: patch.startTime ?? null,
    endTime: patch.endTime ?? null,
    isActive: patch.isActive ?? null,
  } satisfies AssistantAction;
}

function assemblyDraft(): SchedulingAssemblyDraft {
  return {
    horizon: {
      startTime: "2026-06-25T00:00:00.000Z",
      endTime: "2026-06-26T00:00:00.000Z",
      source: "test",
    },
    strategy: "test",
    assignments: [
      {
        itemType: "goal_focus",
        actionTypeHint: "propose_schedule_goal_focus",
        taskId: null,
        goalId: "goal-1",
        focusId: "focus-1",
        occurrenceKey: null,
        title: "Deep work",
        startTime: "2026-06-25T08:00:00.000Z",
        endTime: "2026-06-25T09:00:00.000Z",
        durationMinutes: 60,
        sourceSlotId: "slot-1",
        rationale: ["Focus first"],
      },
      {
        itemType: "task",
        actionTypeHint: "propose_schedule_task",
        taskId: "task-1",
        goalId: null,
        focusId: null,
        occurrenceKey: "task-1",
        title: "Email Sam",
        startTime: "2026-06-25T09:10:00.000Z",
        endTime: "2026-06-25T09:40:00.000Z",
        durationMinutes: 30,
        sourceSlotId: "slot-1",
        rationale: ["Flexible task"],
      },
    ],
    unscheduledItems: [],
    assumptions: [],
  };
}

function scheduleProposalRecord(
  patch: Partial<ScheduleProposalRecord> & Pick<ScheduleProposalRecord, "id">,
): ScheduleProposalRecord {
  return {
    id: patch.id,
    threadId: patch.threadId ?? "thread-1",
    title: patch.title ?? "Draft schedule",
    status: patch.status ?? "draft",
    intent: patch.intent ?? "assistant_schedule_proposal",
    summary: patch.summary ?? "Draft",
    operations: patch.operations ?? [],
    conflictAnnotations: patch.conflictAnnotations ?? [],
    feedbackHistory: patch.feedbackHistory ?? [],
    appliedAt: patch.appliedAt ?? null,
    createdAt: patch.createdAt ?? new Date(2026, 5, 24, 8, 0, 0).toISOString(),
    updatedAt: patch.updatedAt ?? new Date(2026, 5, 24, 8, 0, 0).toISOString(),
  };
}

function goalRecord(
  patch: Partial<GoalRecord> & Pick<GoalRecord, "id" | "title">,
): GoalRecord {
  return {
    id: patch.id,
    title: patch.title,
    definition: patch.definition ?? "",
    successCriteria: patch.successCriteria ?? [],
    focusAreas: patch.focusAreas ?? [],
    scheduleGuidance: patch.scheduleGuidance ?? {},
    constraints: patch.constraints ?? [],
    notes: patch.notes ?? null,
    priorityRank: patch.priorityRank ?? 100,
    status: patch.status ?? "active",
    createdAt: patch.createdAt ?? new Date(2026, 5, 24).toISOString(),
    updatedAt: patch.updatedAt ?? new Date(2026, 5, 24).toISOString(),
  };
}

type TestTaskSchedulingContextItem = Parameters<
  typeof buildSchedulingAssemblyInputsForTurn
>[0]["tasks"][number];

function taskSchedulingContextItem(
  patch: Partial<TestTaskSchedulingContextItem> &
    Pick<TestTaskSchedulingContextItem, "id" | "title">,
): TestTaskSchedulingContextItem {
  return {
    id: patch.id,
    title: patch.title,
    goalId: patch.goalId ?? null,
    status: patch.status ?? "planned",
    priorityRank: patch.priorityRank ?? 100,
    estimatedMinutes: patch.estimatedMinutes ?? 30,
    dueAt: patch.dueAt ?? null,
    recurrence: patch.recurrence ?? null,
    scheduledDateKeys: patch.scheduledDateKeys ?? [],
    ...(patch.revisionOccurrenceKeys
      ? { revisionOccurrenceKeys: patch.revisionOccurrenceKeys }
      : {}),
    scheduleIntent: patch.scheduleIntent ?? "schedule_now",
    linkedCalendarEventId: patch.linkedCalendarEventId ?? null,
    calendarStatus: patch.calendarStatus ?? "pending_proposal",
    reason: patch.reason ?? "Task fixture.",
    matchedCalendarEvent: patch.matchedCalendarEvent ?? null,
    pendingProposalId: patch.pendingProposalId ?? null,
  };
}

class FakePatchTaskDb {
  calls: Array<{ text: string; params?: unknown[] }> = [];
  private readonly task: TaskRecord;

  constructor(task: TaskRecord) {
    this.task = task;
  }

  async query<T extends QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    const call: { text: string; params?: unknown[] } = { text };

    if (params !== undefined) {
      call.params = params;
    }

    this.calls.push(call);

    const setFields = getSqlSetFields(text, params ?? []);
    const recurrenceValue = setFields.get("recurrence");
    const recurrence =
      typeof recurrenceValue === "string"
        ? JSON.parse(recurrenceValue) as TaskRecord["recurrence"]
        : this.task.recurrence;

    return queryResult([
      taskRow({
        ...this.task,
        title:
          typeof setFields.get("title") === "string"
            ? String(setFields.get("title"))
            : this.task.title,
        description:
          typeof setFields.get("description") === "string"
            ? String(setFields.get("description"))
            : this.task.description,
        status:
          setFields.get("status") === "scheduled"
            ? "scheduled"
            : this.task.status,
        recurrence,
        linkedCalendarEventId:
          typeof setFields.get("linked_calendar_event_id") === "string"
            ? String(setFields.get("linked_calendar_event_id"))
            : this.task.linkedCalendarEventId,
        scheduleIntent:
          setFields.get("schedule_intent") === "schedule_now"
            ? "schedule_now"
            : this.task.scheduleIntent,
      }) as T,
    ]);
  }
}

function getSqlSetFields(text: string, params: unknown[]) {
  const setSection = text.slice(
    Math.max(text.indexOf("set"), 0),
    text.indexOf("where") === -1 ? text.length : text.indexOf("where"),
  );
  const fields = new Map<string, unknown>();

  for (const match of setSection.matchAll(/\b([a-z_]+) = \$(\d+)/gu)) {
    const columnName = match[1];
    const paramIndex = Number(match[2]) - 1;

    if (columnName) {
      fields.set(columnName, params[paramIndex]);
    }
  }

  return fields;
}

function taskRow(task: TaskRecord): QueryResultRow {
  return {
    id: task.id,
    goal_id: task.goalId,
    title: task.title,
    description: task.description,
    priority_rank: task.priorityRank,
    status: task.status,
    estimated_minutes: task.estimatedMinutes,
    due_at: task.dueAt ? new Date(task.dueAt) : null,
    recurrence: task.recurrence,
    linked_calendar_event_id: task.linkedCalendarEventId,
    schedule_intent: task.scheduleIntent,
    created_at: new Date(task.createdAt),
    updated_at: new Date(task.updatedAt),
  };
}

function queryResult<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return {
    command: "",
    fields: [],
    oid: 0,
    rowCount: rows.length,
    rows,
  };
}

function schedulingContext(
  overrides: Partial<CompiledSchedulingContext> = {},
): CompiledSchedulingContext {
  return {
    workHours: [],
    noScheduleWindows: [],
    sleepWindow: null,
    maxWorkEndTime: null,
    preferredFocusBlockMinutes: null,
    preferredWorkPeriods: [],
    recoveryDays: [],
    additionalNotes: "",
    hardConstraints: [],
    softPreferences: [],
    acceptedDerivedHabits: [],
    tentativeDerivedPreferences: [],
    promptSummary: "",
    ...overrides,
  };
}

test("formatScheduleBlockTitleForCalendar keeps calendar event names short", () => {
  assert.equal(
    formatScheduleBlockTitleForCalendar(
      "Perform physical activity every weekday for at least 45 minutes.",
    ),
    "Workout",
  );
  assert.equal(
    formatScheduleBlockTitleForCalendar(
      "Complete at least 6 workout sessions combining strength and cardio exercises",
    ),
    "Workout",
  );
  assert.equal(
    formatScheduleBlockTitleForCalendar(
      "Schedule apartment cleaning for Sunday night around 8 PM",
    ),
    "Apartment cleaning",
  );
  assert.equal(
    formatScheduleBlockTitleForCalendar(
      "Practice problems later in the week after study blocks",
    ),
    "Practice problems",
  );
});

test("buildProposalConfirmationHint reinforces feedback-driven schedule revision", () => {
  const details = [
    {
      kind: "task",
      task: {},
      title: "Email Sam",
      description: "Email Sam",
      startTime: new Date("2026-06-25T13:00:00.000Z"),
      endTime: new Date("2026-06-25T13:30:00.000Z"),
      operation: {
        type: "schedule_task",
        taskId: "task-1",
        title: "Email Sam",
        description: "Email Sam",
        startTime: "2026-06-25T13:00:00.000Z",
        endTime: "2026-06-25T13:30:00.000Z",
      },
    },
  ] as Parameters<typeof buildProposalConfirmationHint>[0];

  const hint = buildProposalConfirmationHint(details, []);
  const conflictHint = buildProposalConfirmationHint(details, [
    {
      type: "work_hours",
      title: "Work hours",
      detail: "This overlaps your saved work hours.",
      strength: "hard_constraint",
    },
  ]);

  assert.match(hint, /Yes, implement/u);
  assert.match(hint, /what should change/u);
  assert.doesNotMatch(hint, /different time|what time|what day|time window/iu);
  assert.match(conflictHint, /apply it anyway/u);
  assert.match(conflictHint, /what should change/u);
  assert.doesNotMatch(conflictHint, /different time|what time|what day/iu);
});

test("buildScheduleGuidanceWithScheduledGoalFocusBlock stores durable focus schedule memory", () => {
  const guidance = buildScheduleGuidanceWithScheduledGoalFocusBlock({
    scheduleGuidance: {
      preferredWindow: "morning",
      scheduledFocusBlocks: [
        {
          focusId: "focus-1",
          title: "Workout",
          startTime: "2026-06-25T12:00:00.000Z",
          endTime: "2026-06-25T12:30:00.000Z",
          calendarEventId: "old-event",
        },
      ],
    },
    operation: {
      type: "schedule_goal_focus",
      goalId: "goal-1",
      focusId: "focus-1",
      title: "Workout",
      description: "Workout",
      startTime: "2026-06-25T12:00:00.000Z",
      endTime: "2026-06-25T12:30:00.000Z",
    },
    calendarEvent: {
      id: "event-1",
      sourceCalendarId: "primary",
    },
    now: new Date("2026-06-24T16:00:00.000Z"),
  });

  assert.equal(guidance.preferredWindow, "morning");
  assert.deepEqual(guidance.scheduledFocusBlocks, [
    {
      focusId: "focus-1",
      title: "Workout",
      startTime: "2026-06-25T12:00:00.000Z",
      endTime: "2026-06-25T12:30:00.000Z",
      calendarEventId: "event-1",
      calendarId: "primary",
      source: "productiv_schedule",
      scheduledAt: "2026-06-24T16:00:00.000Z",
    },
  ]);
});

test("buildScheduleGuidanceWithScheduledGoalFocusBlock replaces rescheduled focus event memory", () => {
  const guidance = buildScheduleGuidanceWithScheduledGoalFocusBlock({
    scheduleGuidance: {
      scheduledFocusBlocks: [
        {
          focusId: "focus-1",
          title: "Practice problems",
          startTime: "2026-06-26T13:00:00.000Z",
          endTime: "2026-06-26T13:45:00.000Z",
          calendarEventId: "event-1",
          calendarId: "primary",
          source: "productiv_schedule",
          scheduledAt: "2026-06-24T16:00:00.000Z",
        },
      ],
    },
    operation: {
      type: "schedule_goal_focus",
      goalId: "goal-1",
      focusId: "focus-1",
      title: "Practice problems",
      description: "Practice problems",
      startTime: "2026-06-26T15:00:00.000Z",
      endTime: "2026-06-26T15:45:00.000Z",
    },
    calendarEvent: {
      id: "event-1",
      sourceCalendarId: "primary",
    },
    now: new Date("2026-06-25T16:00:00.000Z"),
  });

  assert.deepEqual(guidance.scheduledFocusBlocks, [
    {
      focusId: "focus-1",
      title: "Practice problems",
      startTime: "2026-06-26T15:00:00.000Z",
      endTime: "2026-06-26T15:45:00.000Z",
      calendarEventId: "event-1",
      calendarId: "primary",
      source: "productiv_schedule",
      scheduledAt: "2026-06-25T16:00:00.000Z",
    },
  ]);
});

test("inferTurnMode keeps mixed operational messages in general chat", () => {
  assert.equal(
    inferTurnMode(
      "I worked 2 hours on portfolio, add a task to email Sam, and schedule study blocks next week.",
      undefined,
      true,
    ),
    "chat",
  );
  assert.equal(
    inferTurnMode("I worked 2 hours on portfolio.", undefined, true),
    "work_log",
  );
  assert.equal(
    inferTurnMode(
      "Reflect on my schedule this week; mornings worked and afternoons slipped.",
      undefined,
      true,
    ),
    "schedule_reflection",
  );
});

test("shouldUsePlanningFlow only captures focused first-goal intake", () => {
  assert.equal(
    shouldUsePlanningFlow(
      {},
      0,
      "chat",
      "I want to get better at software engineering.",
    ),
    true,
  );
  assert.equal(
    shouldUsePlanningFlow(
      {},
      0,
      "chat",
      "I want to train for a 10k, add laundry tomorrow, and schedule runs every weekday.",
    ),
    false,
  );
  assert.equal(
    shouldUsePlanningFlow({}, 0, "chat", "Add laundry tomorrow."),
    false,
  );
});

test("inferGoalFocusSchedulingDefaults keeps habit cadence and duration schedulable", () => {
  assert.deepEqual(
    inferGoalFocusSchedulingDefaults(
      "Run a 30-minute weekday morning learning session.",
    ),
    {
      defaultDurationMinutes: 30,
      cadence: "weekdays",
    },
  );
  assert.deepEqual(
    inferGoalFocusSchedulingDefaults("Strength training 3x per week."),
    {
      defaultDurationMinutes: null,
      cadence: "3x/week",
    },
  );
  assert.deepEqual(
    inferGoalFocusSchedulingDefaults("One-hour daily writing practice."),
    {
      defaultDurationMinutes: 60,
      cadence: "daily",
    },
  );
  assert.deepEqual(inferGoalFocusSchedulingDefaults("Read every morning."), {
    defaultDurationMinutes: null,
    cadence: "daily",
  });
});

test("findReusablePersonalRoutinesGoal selects an active routines goal", () => {
  const olderPausedGoal = goalRecord({
    id: "goal-paused",
    title: "Personal routines",
    status: "paused",
    createdAt: new Date(2026, 5, 20).toISOString(),
  });
  const activeGoal = goalRecord({
    id: "goal-active",
    title: "Personal routines",
    status: "active",
    createdAt: new Date(2026, 5, 22).toISOString(),
  });
  const archivedGoal = goalRecord({
    id: "goal-archived",
    title: "Personal routines",
    status: "archived",
    createdAt: new Date(2026, 5, 18).toISOString(),
  });
  const goalsById = new Map(
    [olderPausedGoal, activeGoal, archivedGoal].map((goal) => [goal.id, goal]),
  );

  assert.equal(
    findReusablePersonalRoutinesGoal({
      title: "Personal routines",
      goalsById,
    })?.id,
    "goal-active",
  );
  assert.equal(
    findReusablePersonalRoutinesGoal({
      title: "Study calculus",
      goalsById,
    }),
    null,
  );
});

test("mergeGoalFocusAreas accumulates routine habits without overwriting details", () => {
  const merged = mergeGoalFocusAreas(
    [
      {
        id: "workout",
        title: "Workout",
        description: "Existing strength habit.",
        status: "paused",
        defaultDurationMinutes: null,
        cadence: null,
      },
    ],
    [
      {
        id: "workout",
        title: "workout",
        description: "New note should not replace the existing description.",
        status: "active",
        defaultDurationMinutes: 45,
        cadence: "3x/week",
      },
      {
        id: "meal-prep",
        title: "Meal prep",
        description: "Prep meals for the week.",
        status: "active",
        defaultDurationMinutes: 60,
        cadence: "weekly",
      },
    ],
  );

  assert.deepEqual(merged, [
    {
      id: "workout",
      title: "Workout",
      description: "Existing strength habit.",
      status: "paused",
      defaultDurationMinutes: 45,
      cadence: "3x/week",
    },
    {
      id: "meal-prep",
      title: "Meal prep",
      description: "Prep meals for the week.",
      status: "active",
      defaultDurationMinutes: 60,
      cadence: "weekly",
    },
  ]);
});

test("mergeGoalFocusAreas treats same-title focus updates as additive details", () => {
  const merged = mergeGoalFocusAreas(
    [
      {
        id: "focus-old",
        title: "Morning walk",
        description: "",
        status: "active",
        defaultDurationMinutes: null,
        cadence: null,
      },
    ],
    [
      {
        id: "focus-new",
        title: "morning walk",
        description: "Walk before work.",
        status: "active",
        defaultDurationMinutes: 20,
        cadence: "daily",
      },
    ],
  );

  assert.deepEqual(merged, [
    {
      id: "focus-old",
      title: "Morning walk",
      description: "Walk before work.",
      status: "active",
      defaultDurationMinutes: 20,
      cadence: "daily",
    },
  ]);
});

test("merge helpers preserve existing routine metadata while adding new details", () => {
  assert.deepEqual(
    mergeUniqueTextList(
      ["Keep mornings flexible"],
      [" keep mornings flexible ", "Avoid late caffeine"],
    ),
    ["Keep mornings flexible", "Avoid late caffeine"],
  );
  assert.deepEqual(
    mergeGoalScheduleGuidance(
      { preferredPeriod: "morning" },
      { preferredPeriod: "evening", bufferMinutes: 15 },
    ),
    { preferredPeriod: "morning", bufferMinutes: 15 },
  );
  assert.equal(mergeGoalScheduleGuidance({}, null), undefined);
});

test("resolveGoalIdForTurnAction can attach follow-on actions to one new goal", () => {
  assert.equal(
    resolveGoalIdForTurnAction({
      actionGoalId: "goal-explicit",
      turnGoals: [{ id: "goal-created" }],
    }),
    "goal-explicit",
  );
  assert.equal(
    resolveGoalIdForTurnAction({
      actionGoalId: null,
      turnGoals: [{ id: "goal-created" }],
    }),
    "goal-created",
  );
  assert.equal(
    resolveGoalIdForTurnAction({
      actionGoalId: null,
      turnGoals: [{ id: "goal-1" }, { id: "goal-2" }],
    }),
    null,
  );
});

test("resolvePendingProposal loads an explicit draft proposal outside the cached window", async () => {
  const cachedProposal = scheduleProposalRecord({ id: "proposal-latest" });
  const targetProposal = scheduleProposalRecord({ id: "proposal-target" });
  const pendingProposalsById = new Map([[cachedProposal.id, cachedProposal]]);
  const lookups: Array<[string, string]> = [];

  const result = await resolvePendingProposal({
    userId: "user-1",
    proposalId: targetProposal.id,
    pendingProposalsById,
    loadScheduleProposalById: async (userId, proposalId) => {
      lookups.push([userId, proposalId]);
      return targetProposal;
    },
  });

  assert.equal(result, targetProposal);
  assert.equal(pendingProposalsById.get(targetProposal.id), targetProposal);
  assert.deepEqual(lookups, [["user-1", "proposal-target"]]);
});

test("resolvePendingProposal does not resolve non-draft explicit proposals", async () => {
  const pendingProposalsById = new Map<string, ScheduleProposalRecord>();
  const result = await resolvePendingProposal({
    userId: "user-1",
    proposalId: "proposal-applied",
    pendingProposalsById,
    loadScheduleProposalById: async () =>
      scheduleProposalRecord({
        id: "proposal-applied",
        status: "applied",
        appliedAt: new Date(2026, 5, 24, 9, 0, 0).toISOString(),
      }),
  });

  assert.equal(result, null);
  assert.equal(pendingProposalsById.has("proposal-applied"), false);
});

test("resolvePendingProposal uses the cached latest draft for generic approval", async () => {
  const cachedProposal = scheduleProposalRecord({ id: "proposal-latest" });
  let lookupCount = 0;

  const result = await resolvePendingProposal({
    userId: "user-1",
    proposalId: null,
    pendingProposalsById: new Map([[cachedProposal.id, cachedProposal]]),
    loadScheduleProposalById: async () => {
      lookupCount += 1;
      return null;
    },
  });

  assert.equal(result, cachedProposal);
  assert.equal(lookupCount, 0);
});

test("resolveScheduleProposalForRevision can target a recent applied proposal", async () => {
  const appliedProposal = scheduleProposalRecord({
    id: "proposal-applied",
    status: "applied",
    appliedAt: new Date(2026, 5, 24, 9, 0, 0).toISOString(),
  });
  let lookupCount = 0;

  const result = await resolveScheduleProposalForRevision({
    userId: "user-1",
    proposalId: "proposal-applied",
    pendingProposalsById: new Map(),
    recentAppliedProposalsById: new Map([
      [appliedProposal.id, appliedProposal],
    ]),
    loadScheduleProposalById: async () => {
      lookupCount += 1;
      return null;
    },
  });

  assert.equal(result, appliedProposal);
  assert.equal(lookupCount, 0);
});

test("resolveScheduleProposalForRevision still prefers draft proposals", async () => {
  const draftProposal = scheduleProposalRecord({ id: "proposal-1" });
  const appliedProposal = scheduleProposalRecord({
    id: "proposal-1",
    status: "applied",
    appliedAt: new Date(2026, 5, 24, 9, 0, 0).toISOString(),
  });

  const result = await resolveScheduleProposalForRevision({
    userId: "user-1",
    proposalId: "proposal-1",
    pendingProposalsById: new Map([[draftProposal.id, draftProposal]]),
    recentAppliedProposalsById: new Map([
      [appliedProposal.id, appliedProposal],
    ]),
  });

  assert.equal(result, draftProposal);
});

test("buildSchedulingAssemblyDraftForTurn includes same-turn created work items", () => {
  const draft = buildSchedulingAssemblyDraftForTurn({
    message: "Build my schedule for tomorrow.",
    candidateSlots: {
      horizon: {
        startTime: new Date(2026, 5, 25, 0, 0, 0).toISOString(),
        endTime: new Date(2026, 5, 26, 0, 0, 0).toISOString(),
        source: "test",
      },
      defaultDurationMinutes: 30,
      assumptions: [],
      slots: [
        {
          id: "2026-06-25-morning-0800",
          period: "morning",
          rank: 1,
          score: 9000,
          availableWindow: {
            startTime: new Date(2026, 5, 25, 8, 0, 0).toISOString(),
            endTime: new Date(2026, 5, 25, 11, 0, 0).toISOString(),
            minutes: 180,
          },
          recommendedBlock: {
            startTime: new Date(2026, 5, 25, 8, 0, 0).toISOString(),
            endTime: new Date(2026, 5, 25, 8, 30, 0).toISOString(),
            durationMinutes: 30,
          },
          rationale: ["test slot"],
        },
      ],
    },
    tasks: [
      {
        id: "task-1",
        goalId: "goal-1",
        title: "Email tutor",
        description: "Email tutor.",
        priorityRank: 2,
        status: "inbox",
        estimatedMinutes: 30,
        dueAt: null,
        recurrence: null,
        linkedCalendarEventId: null,
        scheduleIntent: "schedule_now",
        createdAt: new Date(2026, 5, 24).toISOString(),
        updatedAt: new Date(2026, 5, 24).toISOString(),
      },
      {
        id: "task-2",
        goalId: "goal-1",
        title: "Print syllabus",
        description: "Print syllabus.",
        priorityRank: 3,
        status: "inbox",
        estimatedMinutes: 30,
        dueAt: null,
        recurrence: null,
        linkedCalendarEventId: null,
        scheduleIntent: "schedule_now",
        createdAt: new Date(2026, 5, 24).toISOString(),
        updatedAt: new Date(2026, 5, 24).toISOString(),
      },
    ],
    goals: [
      {
        id: "goal-1",
        title: "Pass calculus",
        definition: "Pass calculus.",
        successCriteria: [],
        focusAreas: [
          {
            id: "focus-1",
            title: "Study routine",
            description: "Study routine.",
            status: "active",
            defaultDurationMinutes: 30,
            cadence: "daily",
          },
        ],
        scheduleGuidance: {},
        constraints: [],
        notes: null,
        priorityRank: 1,
        status: "active",
        createdAt: new Date(2026, 5, 24).toISOString(),
        updatedAt: new Date(2026, 5, 24).toISOString(),
      },
    ],
    pendingScheduleProposals: [],
    calendarEvents: [],
    proposalRevisionFeedback: null,
    pendingProposalsById: new Map(),
  });

  assert.deepEqual(
    draft.assignments.map((assignment) => assignment.itemType),
    ["goal_focus", "task", "task"],
  );
  assert.equal(draft.assignments[0]?.goalId, "goal-1");
  assert.equal(draft.assignments[0]?.focusId, "focus-1");
  assert.equal(draft.assignments[1]?.taskId, "task-1");
  assert.equal(draft.assignments[2]?.taskId, "task-2");
  assert.equal(draft.unscheduledItems.length, 0);
});

test("buildSchedulingAssemblyDraftForTurn leaves not-requested backlog out of ordinary generated schedules", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const candidateSlots = buildSchedulingCandidateSlots({
    message: "Generate my schedule tomorrow.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const draft = buildSchedulingAssemblyDraftForTurn({
    message: "Generate my schedule tomorrow.",
    candidateSlots,
    tasks: [
      {
        id: "task-ready",
        goalId: null,
        title: "Review investor notes",
        description: "Review investor notes.",
        priorityRank: 1,
        status: "inbox",
        estimatedMinutes: 30,
        dueAt: null,
        recurrence: null,
        linkedCalendarEventId: null,
        scheduleIntent: "schedule_now",
        createdAt: new Date(2026, 5, 24).toISOString(),
        updatedAt: new Date(2026, 5, 24).toISOString(),
      },
      {
        id: "task-backlog",
        goalId: null,
        title: "Organize bookmarks",
        description: "Useful someday cleanup.",
        priorityRank: 2,
        status: "inbox",
        estimatedMinutes: 30,
        dueAt: null,
        recurrence: null,
        linkedCalendarEventId: null,
        scheduleIntent: "unscheduled",
        createdAt: new Date(2026, 5, 24).toISOString(),
        updatedAt: new Date(2026, 5, 24).toISOString(),
      },
    ],
    goals: [],
    pendingScheduleProposals: [],
    calendarEvents: [],
    proposalRevisionFeedback: null,
    pendingProposalsById: new Map(),
    schedulingContext: context,
  });

  assert.deepEqual(
    draft.assignments.map((assignment) => assignment.taskId),
    ["task-ready"],
  );
});

test("buildSchedulingAssemblyDraftForTurn schedules recurring tasks beyond old linked events", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const candidateSlots = buildSchedulingCandidateSlots({
    message: "Generate my schedule next week.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const draft = buildSchedulingAssemblyDraftForTurn({
    message: "Generate my schedule next week.",
    candidateSlots,
    tasks: [
      {
        id: "task-recurring",
        goalId: null,
        title: "Submit weekly report",
        description: "Submit weekly report.",
        priorityRank: 2,
        status: "scheduled",
        estimatedMinutes: 30,
        dueAt: null,
        recurrence: {
          frequency: "weekly",
          interval: 1,
          daysOfWeek: [1, 3],
          endsAt: null,
          sourceText: "Add a task to submit the weekly report every Monday and Wednesday",
          scheduledOccurrences: [],
        },
        linkedCalendarEventId: "primary:event-old",
        scheduleIntent: "schedule_now",
        createdAt: new Date(2026, 5, 20).toISOString(),
        updatedAt: new Date(2026, 5, 20).toISOString(),
      },
    ],
    goals: [],
    pendingScheduleProposals: [],
    calendarEvents: [],
    proposalRevisionFeedback: null,
    pendingProposalsById: new Map(),
    schedulingContext: context,
  });
  const taskAssignments = draft.assignments.filter(
    (assignment) => assignment.itemType === "task",
  );

  assert.equal(taskAssignments.length, 2);
  assert.deepEqual(
    taskAssignments.map((assignment) =>
      new Date(assignment.startTime).getDay(),
    ),
    [1, 3],
  );
});

test("buildSchedulingAssemblyDraftForTurn skips remembered recurring task occurrences", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const candidateSlots = buildSchedulingCandidateSlots({
    message: "Generate my schedule next week.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const draft = buildSchedulingAssemblyDraftForTurn({
    message: "Generate my schedule next week.",
    candidateSlots,
    tasks: [
      {
        id: "task-recurring",
        goalId: null,
        title: "Submit weekly report",
        description: "Submit weekly report.",
        priorityRank: 2,
        status: "scheduled",
        estimatedMinutes: 30,
        dueAt: null,
        recurrence: {
          frequency: "weekly",
          interval: 1,
          daysOfWeek: [1, 3],
          endsAt: null,
          sourceText: "Add a task to submit the weekly report every Monday and Wednesday",
          scheduledOccurrences: [
            {
              dateKey: "2026-06-29",
              startTime: new Date(2026, 5, 29, 8, 0, 0).toISOString(),
              endTime: new Date(2026, 5, 29, 8, 30, 0).toISOString(),
              calendarEventId: "primary:event-monday",
              sourceProposalId: null,
            },
          ],
        },
        linkedCalendarEventId: "primary:event-old",
        scheduleIntent: "schedule_now",
        createdAt: new Date(2026, 5, 20).toISOString(),
        updatedAt: new Date(2026, 5, 20).toISOString(),
      },
    ],
    goals: [],
    pendingScheduleProposals: [],
    calendarEvents: [],
    proposalRevisionFeedback: null,
    pendingProposalsById: new Map(),
    schedulingContext: context,
  });
  const taskAssignments = draft.assignments.filter(
    (assignment) => assignment.itemType === "task",
  );

  assert.equal(taskAssignments.length, 1);
  assert.equal(new Date(taskAssignments[0]?.startTime ?? "").getDay(), 3);
});

test("buildSchedulingAssemblyDraftForTurn preserves recurring occurrence identity during revision", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const originalProposal = scheduleProposalRecord({
    id: "proposal-1",
    operations: [
      {
        type: "schedule_task",
        taskId: "task-recurring",
        occurrenceKey: "task-recurring:2026-06-29",
        title: "Submit weekly report",
        description: "Submit weekly report.",
        startTime: new Date(2026, 5, 29, 8, 0, 0).toISOString(),
        endTime: new Date(2026, 5, 29, 8, 30, 0).toISOString(),
      },
    ],
  });
  const candidateSlots = buildSchedulingCandidateSlots({
    message:
      "For schedule proposal proposal-1, please revise it based on this feedback: move the Monday report later.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    horizonOverride: buildScheduleProposalRevisionHorizonOverride(
      originalProposal,
    ),
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const draft = buildSchedulingAssemblyDraftForTurn({
    message:
      "For schedule proposal proposal-1, please revise it based on this feedback: move the Monday report later.",
    candidateSlots,
    tasks: [
      {
        id: "task-recurring",
        goalId: null,
        title: "Submit weekly report",
        description: "Submit weekly report.",
        priorityRank: 2,
        status: "scheduled",
        estimatedMinutes: 30,
        dueAt: null,
        recurrence: {
          frequency: "weekly",
          interval: 1,
          daysOfWeek: [1, 3],
          endsAt: null,
          sourceText: "Every Monday and Wednesday",
          scheduledOccurrences: [
            {
              dateKey: "2026-06-29",
              startTime: new Date(2026, 5, 29, 8, 0, 0).toISOString(),
              endTime: new Date(2026, 5, 29, 8, 30, 0).toISOString(),
              calendarEventId: "primary::event-monday",
              sourceProposalId: "proposal-1",
            },
          ],
        },
        linkedCalendarEventId: null,
        scheduleIntent: "schedule_now",
        createdAt: new Date(2026, 5, 20).toISOString(),
        updatedAt: new Date(2026, 5, 20).toISOString(),
      },
    ],
    goals: [],
    pendingScheduleProposals: [],
    calendarEvents: [],
    proposalRevisionFeedback: {
      proposalId: "proposal-1",
      feedback: "Move the Monday report later.",
    },
    pendingProposalsById: new Map([["proposal-1", originalProposal]]),
    schedulingContext: context,
  });
  const taskAssignments = draft.assignments.filter(
    (assignment) => assignment.itemType === "task",
  );

  assert.equal(taskAssignments.length, 1);
  assert.equal(taskAssignments[0]?.occurrenceKey, "task-recurring:2026-06-29");
  assert.equal(new Date(taskAssignments[0]?.startTime ?? "").getDay(), 1);
});

test("recordTaskScheduledOccurrence preserves multiple recurring task dates", () => {
  const recurrence = {
    frequency: "weekly" as const,
    interval: 1,
    daysOfWeek: [1, 3],
    endsAt: null,
    sourceText: "Every Monday and Wednesday",
    scheduledOccurrences: [],
  };
  const withMonday = recordTaskScheduledOccurrence({
    recurrence,
    startTime: new Date(2026, 5, 29, 8, 0, 0),
    endTime: new Date(2026, 5, 29, 8, 30, 0),
    calendarEventId: "primary:event-monday",
    sourceProposalId: "proposal-1",
  });
  const withWednesday = recordTaskScheduledOccurrence({
    recurrence: withMonday,
    startTime: new Date(2026, 6, 1, 8, 0, 0),
    endTime: new Date(2026, 6, 1, 8, 30, 0),
    calendarEventId: "primary:event-wednesday",
    sourceProposalId: "proposal-1",
  });

  assert.deepEqual(
    withWednesday.scheduledOccurrences.map((occurrence) => occurrence.dateKey),
    ["2026-06-29", "2026-07-01"],
  );
  assert.deepEqual(
    withWednesday.scheduledOccurrences.map(
      (occurrence) => occurrence.calendarEventId,
    ),
    ["primary:event-monday", "primary:event-wednesday"],
  );
  assert.deepEqual(
    withWednesday.scheduledOccurrences.map(
      (occurrence) => occurrence.sourceProposalId,
    ),
    ["proposal-1", "proposal-1"],
  );
});

test("recordTaskScheduledOccurrence replaces revised recurring task occurrence", () => {
  const recurrence = {
    frequency: "weekly" as const,
    interval: 1,
    daysOfWeek: [1, 3],
    endsAt: null,
    sourceText: "Every Monday and Wednesday",
    scheduledOccurrences: [
      {
        dateKey: "2026-06-29",
        startTime: new Date(2026, 5, 29, 8, 0, 0).toISOString(),
        endTime: new Date(2026, 5, 29, 8, 30, 0).toISOString(),
        calendarEventId: "primary::event-monday",
        sourceProposalId: "proposal-1",
      },
    ],
  };
  const revised = recordTaskScheduledOccurrence({
    recurrence,
    startTime: new Date(2026, 5, 30, 13, 0, 0),
    endTime: new Date(2026, 5, 30, 13, 30, 0),
    calendarEventId: "primary::event-monday",
    sourceProposalId: "proposal-2",
    replacesOccurrenceKey: "task-recurring:2026-06-29",
  });

  assert.deepEqual(
    revised.scheduledOccurrences.map((occurrence) => occurrence.dateKey),
    ["2026-06-30"],
  );
  assert.equal(
    revised.scheduledOccurrences[0]?.calendarEventId,
    "primary::event-monday",
  );
  assert.equal(revised.scheduledOccurrences[0]?.sourceProposalId, "proposal-2");
});

test("applyTaskScheduleOperationToCalendar updates revised recurring task occurrence", async () => {
  const task: TaskRecord = {
    id: "task-recurring",
    goalId: null,
    title: "Submit weekly report",
    description: "Submit weekly report.",
    priorityRank: 2,
    status: "scheduled",
    estimatedMinutes: 30,
    dueAt: null,
    recurrence: {
      frequency: "weekly",
      interval: 1,
      daysOfWeek: [1, 3],
      endsAt: null,
      sourceText: "Every Monday and Wednesday",
      scheduledOccurrences: [
        {
          dateKey: "2026-06-29",
          startTime: new Date(2026, 5, 29, 8, 0, 0).toISOString(),
          endTime: new Date(2026, 5, 29, 8, 30, 0).toISOString(),
          calendarEventId: "primary::event-monday",
          sourceProposalId: "proposal-original",
        },
      ],
    },
    linkedCalendarEventId: null,
    scheduleIntent: "schedule_now",
    createdAt: new Date(2026, 5, 20).toISOString(),
    updatedAt: new Date(2026, 5, 20).toISOString(),
  };
  const updateCalls: Array<{
    calendarId: string;
    eventId: string;
    startTime: Date;
    endTime: Date;
  }> = [];
  const db = new FakePatchTaskDb(task);
  const applied = await applyTaskScheduleOperationToCalendar(
    "user-1",
    {},
    task,
    {
      type: "schedule_task",
      taskId: task.id,
      occurrenceKey: "task-recurring:2026-06-29",
      title: "Submit weekly report",
      description: "Submit weekly report.",
      startTime: new Date(2026, 5, 29, 13, 0, 0).toISOString(),
      endTime: new Date(2026, 5, 29, 13, 30, 0).toISOString(),
    },
    db,
    {
      sourceProposalId: "proposal-revised",
      calendarWriter: {
        createEvent: async () => {
          assert.fail("Expected recurring revision to update existing event.");
        },
        updateEvent: async (_tokens, input) => {
          updateCalls.push({
            calendarId: input.calendarId,
            eventId: input.eventId,
            startTime: input.startTime,
            endTime: input.endTime,
          });

          return {
            id: input.eventId,
            sourceCalendarId: input.calendarId,
          };
        },
      },
    },
  );

  assert.deepEqual(updateCalls, [
    {
      calendarId: "primary",
      eventId: "event-monday",
      startTime: new Date(2026, 5, 29, 13, 0, 0),
      endTime: new Date(2026, 5, 29, 13, 30, 0),
    },
  ]);
  assert.equal(
    applied?.recurrence?.scheduledOccurrences[0]?.calendarEventId,
    "primary::event-monday",
  );
  assert.equal(
    applied?.recurrence?.scheduledOccurrences[0]?.startTime,
    new Date(2026, 5, 29, 13, 0, 0).toISOString(),
  );
  assert.equal(
    applied?.recurrence?.scheduledOccurrences[0]?.sourceProposalId,
    "proposal-revised",
  );
});

test("buildSchedulingAssemblyDraftForTurn proposes vague same-turn starter routines", () => {
  const message = "I want to meditate. Generate my schedule next week.";
  const context = schedulingContext({
    preferredFocusBlockMinutes: 25,
  });
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const candidateSlots = buildSchedulingCandidateSlots({
    message,
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const draft = buildSchedulingAssemblyDraftForTurn({
    message,
    candidateSlots,
    tasks: [],
    goals: [
      goalRecord({
        id: "goal-routines",
        title: "Personal routines",
        priorityRank: 1,
        focusAreas: [
          {
            id: "focus-meditate",
            title: "Meditate",
            description: "Starter routine inferred from a vague habit request.",
            status: "active",
            defaultDurationMinutes: null,
            cadence: null,
          },
        ],
      }),
    ],
    pendingScheduleProposals: [],
    calendarEvents: [],
    proposalRevisionFeedback: null,
    pendingProposalsById: new Map(),
    schedulingContext: context,
  });
  const actions = buildScheduleProposalActionsFromSchedulingAssemblyDraft({
    message,
    modelActions: [],
    draft,
  });

  assert.equal(draft.assignments.length, 3);
  assert.deepEqual(
    draft.assignments.map((assignment) => [
      assignment.itemType,
      assignment.focusId,
      assignment.durationMinutes,
    ]),
    [
      ["goal_focus", "focus-meditate", 25],
      ["goal_focus", "focus-meditate", 25],
      ["goal_focus", "focus-meditate", 25],
    ],
  );
  assert.deepEqual(
    actions.map((action) => [
      action.type,
      action.goalId,
      action.focusId,
      action.estimatedMinutes,
    ]),
    [
      ["propose_schedule_goal_focus", "goal-routines", "focus-meditate", 25],
      ["propose_schedule_goal_focus", "goal-routines", "focus-meditate", 25],
      ["propose_schedule_goal_focus", "goal-routines", "focus-meditate", 25],
    ],
  );
});

test("outcome-only goals get starter focus blocks that can be scheduled", async () => {
  const message = "Create a goal to get visible abs. Schedule my week.";
  const provider = new DeterministicAiProvider();
  const modelResponse = await provider.generateJson<{
    actions: AssistantAction[];
  }>({
    instructions: "Return assistant JSON.",
    input: [
      "Latest user message:",
      message,
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
  const goalAction = modelResponse.actions.find(
    (action) => action.type === "create_goal",
  );
  const goals = goalAction
    ? [
        goalRecord({
          id: "goal-fitness",
          title: goalAction.title ?? "Fitness",
          priorityRank: 1,
          focusAreas: goalAction.focusAreas,
        }),
      ]
    : [];
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const candidateSlots = buildSchedulingCandidateSlots({
    message,
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const draft = buildSchedulingAssemblyDraftForTurn({
    message,
    candidateSlots,
    tasks: [],
    goals,
    pendingScheduleProposals: [],
    calendarEvents: [],
    proposalRevisionFeedback: null,
    pendingProposalsById: new Map(),
    schedulingContext: context,
  });
  const proposalActions = buildScheduleProposalActionsFromSchedulingAssemblyDraft({
    message,
    modelActions: modelResponse.actions,
    draft,
  });

  assert.deepEqual(
    goals[0]?.focusAreas.map((focusArea) => [
      focusArea.title,
      focusArea.cadence,
      focusArea.defaultDurationMinutes,
    ]),
    [
      ["Strength training", "3x/week", 45],
      ["Cardio", "2x/week", 30],
    ],
  );
  const proposedFocusIds = proposalActions.map((action) => action.focusId);

  assert.equal(proposalActions[0]?.type, "propose_schedule_goal_focus");
  assert.equal(proposalActions[0]?.goalId, "goal-fitness");
  assert.equal(proposalActions[0]?.focusId, "local-focus-strength-training");
  assert.equal(
    proposedFocusIds.filter((focusId) => focusId === "local-focus-strength-training")
      .length,
    3,
  );
  assert.equal(
    proposedFocusIds.filter((focusId) => focusId === "local-focus-cardio")
      .length,
    2,
  );
});

test("complex same-turn dumps create separate routines and autonomous schedule proposals", async () => {
  const message =
    "Here is my schedule: I work weekdays 8am-11am. I sleep 6pm-7am. I have class Tuesday 8am-11am. Create a goal to prepare for product launch; make a daily focus routine to draft the launch narrative for 60 minutes; add a task to review investor notes tomorrow for 45 minutes; add a daily 20 minute stretch routine; I prefer launch narrative in the afternoon; schedule my week.";
  const provider = new DeterministicAiProvider();
  const modelResponse = await provider.generateJson<{
    actions: AssistantAction[];
  }>({
    instructions: "Return assistant JSON.",
    input: [
      "Latest user message:",
      message,
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
  const goalActions = modelResponse.actions.filter(
    (action) => action.type === "create_goal",
  );
  const taskActions = modelResponse.actions.filter(
    (action) => action.type === "create_task",
  );
  const goals = goalActions.map((action, index) =>
    goalRecord({
      id: action.title === "Personal routines" ? "goal-routines" : "goal-launch",
      title: action.title ?? `Goal ${index + 1}`,
      priorityRank: index + 1,
      focusAreas: action.focusAreas,
    }),
  );
  const tasks: TaskRecord[] = taskActions.map((action, index) => ({
    id: `task-${index + 1}`,
    goalId: null,
    title: action.title ?? `Task ${index + 1}`,
    description: action.description ?? action.title ?? `Task ${index + 1}`,
    priorityRank: action.priorityRank ?? index + 1,
    status: "inbox",
    estimatedMinutes: action.estimatedMinutes,
    dueAt: action.dueAt,
    recurrence: action.recurrence,
    linkedCalendarEventId: null,
    scheduleIntent:
      action.scheduleIntent === "unscheduled" ||
      action.scheduleIntent === "someday"
        ? action.scheduleIntent
        : "schedule_now",
    createdAt: new Date(2026, 5, 24).toISOString(),
    updatedAt: new Date(2026, 5, 24).toISOString(),
  }));
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const candidateSlots = buildSchedulingCandidateSlots({
    message,
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const draft = buildSchedulingAssemblyDraftForTurn({
    message,
    candidateSlots,
    tasks,
    goals,
    pendingScheduleProposals: [],
    calendarEvents: [],
    proposalRevisionFeedback: null,
    pendingProposalsById: new Map(),
    schedulingContext: context,
  });
  const proposalActions = buildScheduleProposalActionsFromSchedulingAssemblyDraft({
    message,
    modelActions: modelResponse.actions,
    draft,
  });
  const launchGoal = goals.find((goal) => goal.id === "goal-launch");
  const routinesGoal = goals.find((goal) => goal.id === "goal-routines");
  const launchFocusId = launchGoal?.focusAreas.find((focusArea) =>
    focusArea.title.toLowerCase().includes("launch narrative"),
  )?.id;
  const stretchFocusId = routinesGoal?.focusAreas.find(
    (focusArea) => focusArea.title === "Stretch",
  )?.id;
  const launchAction = proposalActions.find(
    (action) =>
      action.type === "propose_schedule_goal_focus" &&
      action.focusId === launchFocusId,
  );

  assert.deepEqual(
    goals.map((goal) => [
      goal.title,
      goal.focusAreas.map((focusArea) => focusArea.title),
    ]),
    [
      ["Prepare product launch", ["Draft launch narrative"]],
      ["Personal routines", ["Stretch"]],
    ],
  );
  assert.deepEqual(tasks.map((task) => [task.title, task.estimatedMinutes]), [
    ["Review investor notes tomorrow 45 minutes", 45],
  ]);
  assert.match(candidateSlots.assumptions.join(" "), /protected work hours/u);
  assert.match(candidateSlots.assumptions.join(" "), /sleep is 18:00-07:00/u);
  assert.match(candidateSlots.assumptions.join(" "), /Class blocks Tuesday/u);
  assert.equal(candidateSlots.horizon.source, "latest message: this week, through Saturday");
  assert.ok(launchFocusId);
  assert.ok(stretchFocusId);
  assert.ok(launchAction);
  assert.equal(new Date(launchAction.startTime ?? "").getHours() >= 12, true);
  assert.ok(
    proposalActions.some(
      (action) =>
        action.type === "propose_schedule_goal_focus" &&
        action.focusId === stretchFocusId,
    ),
  );
  assert.ok(
    proposalActions.some(
      (action) =>
        action.type === "propose_schedule_task" && action.taskId === "task-1",
    ),
  );
});

test("buildSchedulingAssemblyDraftForTurn applies same-turn focus timing preferences", () => {
  const draft = buildSchedulingAssemblyDraftForTurn({
    message: "Build my schedule for tomorrow. Keep afternoons for study routine.",
    candidateSlots: {
      horizon: {
        startTime: new Date(2026, 5, 25, 0, 0, 0).toISOString(),
        endTime: new Date(2026, 5, 26, 0, 0, 0).toISOString(),
        source: "test",
      },
      defaultDurationMinutes: 30,
      assumptions: [],
      slots: [
        {
          id: "slot-morning",
          period: "morning",
          rank: 1,
          score: 100,
          availableWindow: {
            startTime: new Date(2026, 5, 25, 8, 0, 0).toISOString(),
            endTime: new Date(2026, 5, 25, 11, 0, 0).toISOString(),
            minutes: 180,
          },
          recommendedBlock: {
            startTime: new Date(2026, 5, 25, 8, 0, 0).toISOString(),
            endTime: new Date(2026, 5, 25, 8, 30, 0).toISOString(),
            durationMinutes: 30,
          },
          rationale: ["Morning slot is the default best slot."],
        },
        {
          id: "slot-afternoon",
          period: "afternoon",
          rank: 2,
          score: 80,
          availableWindow: {
            startTime: new Date(2026, 5, 25, 13, 0, 0).toISOString(),
            endTime: new Date(2026, 5, 25, 16, 0, 0).toISOString(),
            minutes: 180,
          },
          recommendedBlock: {
            startTime: new Date(2026, 5, 25, 13, 0, 0).toISOString(),
            endTime: new Date(2026, 5, 25, 13, 30, 0).toISOString(),
            durationMinutes: 30,
          },
          rationale: ["Afternoon slot is lower ranked unless an item prefers it."],
        },
      ],
    },
    tasks: [
      {
        id: "task-1",
        goalId: "goal-1",
        title: "Email tutor",
        description: "Email tutor.",
        priorityRank: 2,
        status: "inbox",
        estimatedMinutes: 30,
        dueAt: null,
        recurrence: null,
        linkedCalendarEventId: null,
        scheduleIntent: "schedule_now",
        createdAt: "2026-06-24T10:00:00.000Z",
        updatedAt: "2026-06-24T10:00:00.000Z",
      },
    ],
    goals: [
      goalRecord({
        id: "goal-1",
        title: "Pass calculus",
        priorityRank: 1,
        focusAreas: [
          {
            id: "focus-1",
            title: "Study routine",
            description: "Study routine.",
            status: "active",
            defaultDurationMinutes: 45,
            cadence: "daily",
          },
        ],
      }),
    ],
    pendingScheduleProposals: [],
    calendarEvents: [],
    proposalRevisionFeedback: null,
    pendingProposalsById: new Map(),
    schedulingContext: schedulingContext(),
  });

  const focusAssignment = draft.assignments.find(
    (assignment) => assignment.focusId === "focus-1",
  );
  const taskAssignment = draft.assignments.find(
    (assignment) => assignment.taskId === "task-1",
  );

  assert.equal(focusAssignment?.sourceSlotId, "slot-afternoon");
  assert.equal(new Date(focusAssignment?.startTime ?? "").getHours(), 13);
  assert.match(
    focusAssignment?.rationale.join(" ") ?? "",
    /Latest feedback suggests scheduling Study Routine during the afternoon/u,
  );
  assert.equal(taskAssignment?.sourceSlotId, "slot-morning");
});

test("buildSchedulingAssemblyDraftForTurn revises proposals away from newly unavailable mornings", () => {
  const message =
    "For schedule proposal proposal-1, please revise it based on this feedback: I can't do mornings anymore.";
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const originalProposal = scheduleProposalRecord({
    id: "proposal-1",
    operations: [
      {
        type: "schedule_goal_focus",
        goalId: "goal-1",
        focusId: "focus-1",
        title: "Practice problems",
        description: "Practice problems",
        startTime: new Date(2026, 6, 6, 8, 0, 0).toISOString(),
        endTime: new Date(2026, 6, 6, 9, 0, 0).toISOString(),
      },
      {
        type: "schedule_task",
        taskId: "task-1",
        title: "Email tutor",
        description: "Email tutor.",
        startTime: new Date(2026, 6, 6, 9, 10, 0).toISOString(),
        endTime: new Date(2026, 6, 6, 9, 40, 0).toISOString(),
      },
    ],
  });
  const proposalRevisionFeedback = {
    proposalId: originalProposal.id,
    feedback: "I can't do mornings anymore.",
  };
  const candidateSlots = buildSchedulingCandidateSlots({
    message,
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    horizonOverride: buildScheduleProposalRevisionHorizonOverride(
      originalProposal,
    ),
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const draft = buildSchedulingAssemblyDraftForTurn({
    message,
    candidateSlots,
    tasks: [
      {
        id: "task-1",
        goalId: null,
        title: "Email tutor",
        description: "Email tutor.",
        priorityRank: 2,
        status: "inbox",
        estimatedMinutes: 30,
        dueAt: null,
        recurrence: null,
        linkedCalendarEventId: null,
        scheduleIntent: "schedule_now",
        createdAt: new Date(2026, 5, 24).toISOString(),
        updatedAt: new Date(2026, 5, 24).toISOString(),
      },
    ],
    goals: [
      goalRecord({
        id: "goal-1",
        title: "Exam prep",
        priorityRank: 1,
        focusAreas: [
          {
            id: "focus-1",
            title: "Practice problems",
            description: "Practice problems.",
            status: "active",
            defaultDurationMinutes: 60,
            cadence: "weekly",
          },
          {
            id: "focus-2",
            title: "Read notes",
            description: "Read notes.",
            status: "active",
            defaultDurationMinutes: 45,
            cadence: "weekly",
          },
        ],
      }),
    ],
    pendingScheduleProposals: [originalProposal],
    calendarEvents: [],
    proposalRevisionFeedback,
    pendingProposalsById: new Map([[originalProposal.id, originalProposal]]),
    schedulingContext: context,
  });
  const actions = buildScheduleProposalActionsFromSchedulingAssemblyDraft({
    message,
    modelActions: [],
    draft,
    proposalRevisionFeedback,
  });
  const actionStartHours = actions.map((item) =>
    new Date(item.startTime ?? "").getHours(),
  );

  assert.deepEqual(
    draft.assignments.map((assignment) => [
      assignment.itemType,
      assignment.focusId ?? assignment.taskId,
    ]),
    [
      ["goal_focus", "focus-1"],
      ["task", "task-1"],
    ],
  );
  assert.equal(draft.assignments.some((assignment) => {
    const startHour = new Date(assignment.startTime).getHours();

    return startHour < 12;
  }), false);
  assert.deepEqual(
    actions.map((item) => item.type),
    ["propose_schedule_goal_focus", "propose_schedule_task"],
  );
  assert.deepEqual(actionStartHours.every((hour) => hour >= 12), true);
});

test("buildScheduleProposalActionsFromSchedulingAssemblyDraft converts assignments for schedule generation", () => {
  const actions = buildScheduleProposalActionsFromSchedulingAssemblyDraft({
    message: "Generate my schedule for tomorrow.",
    modelActions: [],
    draft: assemblyDraft(),
  });

  assert.deepEqual(
    actions.map((item) => item.type),
    ["propose_schedule_goal_focus", "propose_schedule_task"],
  );
  assert.equal(actions[0]?.goalId, "goal-1");
  assert.equal(actions[0]?.focusId, "focus-1");
  assert.equal(actions[0]?.startTime, "2026-06-25T08:00:00.000Z");
  assert.equal(actions[1]?.taskId, "task-1");
  assert.equal(actions[1]?.occurrenceKey, "task-1");
  assert.equal(actions[1]?.estimatedMinutes, 30);
});

test("buildScheduleProposalActionsFromSchedulingAssemblyDraft completes missing model proposal items", () => {
  const actions = buildScheduleProposalActionsFromSchedulingAssemblyDraft({
    message: "Generate my schedule for tomorrow.",
    modelActions: [
      action({
        type: "propose_schedule_task",
        taskId: "task-1",
        occurrenceKey: "task-1",
        startTime: "2026-06-25T12:00:00.000Z",
        endTime: "2026-06-25T12:30:00.000Z",
      }),
    ],
    draft: assemblyDraft(),
  });

  assert.deepEqual(
    actions.map((item) => [item.type, item.goalId, item.focusId, item.taskId]),
    [["propose_schedule_goal_focus", "goal-1", "focus-1", null]],
  );
  assert.equal(actions[0]?.startTime, "2026-06-25T08:00:00.000Z");
});

test("buildScheduleProposalActionsFromSchedulingAssemblyDraft treats title-matched new task proposals as covered", () => {
  const actions = buildScheduleProposalActionsFromSchedulingAssemblyDraft({
    message: "Add a task to email Sam and generate my schedule for tomorrow.",
    modelActions: [
      action({
        type: "propose_schedule_task",
        taskId: null,
        title: "Email Sam",
        startTime: "2026-06-25T12:00:00.000Z",
        endTime: "2026-06-25T12:30:00.000Z",
      }),
    ],
    draft: assemblyDraft(),
  });

  assert.deepEqual(
    actions.map((item) => [item.type, item.goalId, item.focusId, item.taskId]),
    [["propose_schedule_goal_focus", "goal-1", "focus-1", null]],
  );
});

test("buildScheduleProposalActionsFromSchedulingAssemblyDraft treats title-matched new habit proposals as covered", () => {
  const draft: SchedulingAssemblyDraft = {
    ...assemblyDraft(),
    assignments: [
      {
        ...assemblyDraft().assignments[0]!,
        goalId: "goal-routines",
        focusId: "focus-meditate",
        title: "Meditate",
      },
      assemblyDraft().assignments[1]!,
    ],
  };
  const actions = buildScheduleProposalActionsFromSchedulingAssemblyDraft({
    message: "Create a daily meditation habit and generate my schedule tomorrow.",
    modelActions: [
      action({
        type: "propose_schedule_goal_focus",
        goalId: null,
        focusId: null,
        title: "Meditate",
        startTime: "2026-06-25T12:00:00.000Z",
        endTime: "2026-06-25T12:30:00.000Z",
      }),
    ],
    draft,
  });

  assert.deepEqual(
    actions.map((item) => [item.type, item.goalId, item.focusId, item.taskId]),
    [["propose_schedule_task", null, null, "task-1"]],
  );
});

test("resolveGoalFocusForSchedulingAction resolves a same-turn habit proposal by focus title", () => {
  const goal = goalRecord({
    id: "goal-routines",
    title: "Personal routines",
    focusAreas: [
      {
        id: "focus-meditate",
        title: "Meditate",
        description: "Starter meditation habit.",
        status: "active",
        defaultDurationMinutes: 25,
        cadence: "daily",
      },
    ],
  });
  const details = resolveGoalFocusForSchedulingAction({
    action: action({
      type: "propose_schedule_goal_focus",
      goalId: null,
      focusId: null,
      title: "Meditate",
      startTime: "2026-06-25T12:00:00.000Z",
      endTime: "2026-06-25T12:25:00.000Z",
    }),
    goalsById: new Map([[goal.id, goal]]),
    startTime: new Date("2026-06-25T12:00:00.000Z"),
    endTime: new Date("2026-06-25T12:25:00.000Z"),
  });

  assert.equal(details?.kind, "goal_focus");
  assert.equal(details?.goal.id, "goal-routines");
  assert.equal(details?.focusArea?.id, "focus-meditate");
  assert.deepEqual(details?.operation, {
    type: "schedule_goal_focus",
    goalId: "goal-routines",
    focusId: "focus-meditate",
    title: "Meditate",
    description: "Starter meditation habit.",
    startTime: "2026-06-25T12:00:00.000Z",
    endTime: "2026-06-25T12:25:00.000Z",
  });
});

test("buildScheduleProposalActionsFromSchedulingAssemblyDraft ignores non-scheduling chat", () => {
  const actions = buildScheduleProposalActionsFromSchedulingAssemblyDraft({
    message: "What goals am I working on?",
    modelActions: [],
    draft: assemblyDraft(),
  });

  assert.deepEqual(actions, []);
});

test("buildScheduleProposalActionsFromSchedulingAssemblyDraft treats one model habit block as one covered occurrence", () => {
  const draft: SchedulingAssemblyDraft = {
    ...assemblyDraft(),
    assignments: [
      {
        itemType: "goal_focus",
        actionTypeHint: "propose_schedule_goal_focus",
        taskId: null,
        goalId: "goal-routines",
        focusId: "focus-study",
        occurrenceKey: null,
        title: "Study",
        startTime: "2026-06-25T08:00:00.000Z",
        endTime: "2026-06-25T08:30:00.000Z",
        durationMinutes: 30,
        sourceSlotId: "slot-1",
        rationale: ["First occurrence"],
      },
      {
        itemType: "goal_focus",
        actionTypeHint: "propose_schedule_goal_focus",
        taskId: null,
        goalId: "goal-routines",
        focusId: "focus-study",
        occurrenceKey: null,
        title: "Study",
        startTime: "2026-06-26T08:00:00.000Z",
        endTime: "2026-06-26T08:30:00.000Z",
        durationMinutes: 30,
        sourceSlotId: "slot-2",
        rationale: ["Second occurrence"],
      },
    ],
  };
  const actions = buildScheduleProposalActionsFromSchedulingAssemblyDraft({
    message: "Generate my schedule this week.",
    modelActions: [
      action({
        type: "propose_schedule_goal_focus",
        goalId: "goal-routines",
        focusId: "focus-study",
        startTime: "2026-06-25T09:00:00.000Z",
        endTime: "2026-06-25T09:30:00.000Z",
      }),
    ],
    draft,
  });

  assert.deepEqual(
    actions.map((item) => [item.goalId, item.focusId, item.startTime]),
    [["goal-routines", "focus-study", "2026-06-26T08:00:00.000Z"]],
  );
});

test("buildScheduleProposalActionsFromSchedulingAssemblyDraft handles proposal revision feedback", () => {
  const actions = buildScheduleProposalActionsFromSchedulingAssemblyDraft({
    message:
      "For schedule proposal proposal-1, please revise it based on this feedback: Move workouts later.",
    modelActions: [],
    draft: assemblyDraft(),
  });

  assert.deepEqual(
    actions.map((item) => item.type),
    ["propose_schedule_goal_focus", "propose_schedule_task"],
  );
});

test("buildScheduleProposalActionsFromSchedulingAssemblyDraft handles natural proposal feedback", () => {
  const actions = buildScheduleProposalActionsFromSchedulingAssemblyDraft({
    message: "Move workouts later and add more buffer.",
    modelActions: [],
    draft: assemblyDraft(),
    proposalRevisionFeedback: {
      proposalId: "proposal-1",
      feedback: "Move workouts later and add more buffer.",
    },
  });

  assert.deepEqual(
    actions.map((item) => item.type),
    ["propose_schedule_goal_focus", "propose_schedule_task"],
  );
});

test("buildScheduleAssemblyUnscheduledItemsSummary explains omitted schedule items", () => {
  const draft: SchedulingAssemblyDraft = {
    ...assemblyDraft(),
    unscheduledItems: [
      {
        itemType: "task",
        taskId: "task-2",
        goalId: null,
        focusId: null,
        title: "Clean up backlog",
        reason:
          "Productiv kept this out of the draft because that day already reached the default daily load budget for generated work.",
      },
      {
        itemType: "goal_focus",
        taskId: null,
        goalId: "goal-1",
        focusId: "focus-2",
        title: "Practice problems",
        reason: "No candidate slot was long enough after higher-ranked assignments.",
      },
    ],
  };
  const summary = buildScheduleAssemblyUnscheduledItemsSummary(draft);

  assert.match(summary ?? "", /I left these items out/u);
  assert.match(summary ?? "", /Clean up backlog/u);
  assert.match(summary ?? "", /daily load budget/u);
  assert.match(summary ?? "", /Practice problems/u);
  assert.match(summary ?? "", /tell me what to loosen, move, or prioritize/u);
});

test("buildScheduleAssemblyUnscheduledItemsSummary returns null when everything fits", () => {
  assert.equal(buildScheduleAssemblyUnscheduledItemsSummary(assemblyDraft()), null);
});

test("buildDeterministicScheduleProposalWarnings only reports omissions for fallback proposals", () => {
  const draft: SchedulingAssemblyDraft = {
    ...assemblyDraft(),
    unscheduledItems: [
      {
        itemType: "task",
        taskId: "task-2",
        goalId: null,
        focusId: null,
        title: "Clean up backlog",
        reason:
          "Productiv kept this out of the draft because that day already reached the default daily load budget for generated work.",
      },
    ],
  };

  assert.deepEqual(
    buildDeterministicScheduleProposalWarnings({
      deterministicProposalActions: [],
      draft,
    }),
    [],
  );
  assert.equal(
    buildDeterministicScheduleProposalWarnings({
      deterministicProposalActions:
        buildScheduleProposalActionsFromSchedulingAssemblyDraft({
          message: "Generate my schedule for tomorrow.",
          modelActions: [],
          draft,
        }),
      draft,
    }).length,
    1,
  );
});

test("parseScheduleProposalRevisionFeedback extracts the mobile feedback prompt", () => {
  assert.deepEqual(
    parseScheduleProposalRevisionFeedback(
      "For schedule proposal proposal-1, please revise it based on this feedback: Move workouts later and keep mornings for study.",
    ),
    {
      proposalId: "proposal-1",
      feedback: "Move workouts later and keep mornings for study.",
    },
  );
  assert.equal(
    parseScheduleProposalRevisionFeedback("Confirm schedule proposal proposal-1."),
    null,
  );
});

test("parseScheduleProposalRevisionFeedback can use the latest draft for natural feedback", () => {
  assert.deepEqual(
    parseScheduleProposalRevisionFeedback(
      "Can you move workouts later and add more buffer?",
      "proposal-latest",
    ),
    {
      proposalId: "proposal-latest",
      feedback: "Can you move workouts later and add more buffer?",
    },
  );
  assert.deepEqual(
    parseScheduleProposalRevisionFeedback(
      "This is too crowded. I need more breathing room.",
      "proposal-latest",
    ),
    {
      proposalId: "proposal-latest",
      feedback: "This is too crowded. I need more breathing room.",
    },
  );
  assert.deepEqual(
    parseScheduleProposalRevisionFeedback(
      "I can't do mornings anymore.",
      "proposal-latest",
    ),
    {
      proposalId: "proposal-latest",
      feedback: "I can't do mornings anymore.",
    },
  );
  assert.deepEqual(
    parseScheduleProposalRevisionFeedback(
      "Afternoons are blocked for the next few weeks.",
      "proposal-latest",
    ),
    {
      proposalId: "proposal-latest",
      feedback: "Afternoons are blocked for the next few weeks.",
    },
  );
  assert.deepEqual(
    parseScheduleProposalRevisionFeedback(
      "That plan doesn't work; I need to change Friday.",
      "proposal-latest",
    ),
    {
      proposalId: "proposal-latest",
      feedback: "That plan doesn't work; I need to change Friday.",
    },
  );
  assert.equal(
    parseScheduleProposalRevisionFeedback(
      "What does this proposal mean?",
      "proposal-latest",
    ),
    null,
  );
  assert.equal(
    parseScheduleProposalRevisionFeedback(
      "Confirm schedule proposal proposal-latest.",
      "proposal-latest",
    ),
    null,
  );
});

test("createScheduleProposalRevisionFeedbackEntry records replacement proposal linkage", () => {
  assert.deepEqual(
    createScheduleProposalRevisionFeedbackEntry({
      feedback: "Move workouts later.",
      replacementProposalId: "proposal-2",
      now: new Date("2026-06-25T12:00:00.000Z"),
    }),
    {
      type: "revision_requested",
      at: "2026-06-25T12:00:00.000Z",
      feedback: "Move workouts later.",
      replacementProposalId: "proposal-2",
    },
  );
});

test("buildScheduleProposalRevisionHorizonOverride uses proposal operation days", () => {
  const proposal: ScheduleProposalRecord = {
    id: "proposal-1",
    threadId: "thread-1",
    title: "Draft schedule",
    status: "draft",
    intent: "assistant_schedule_proposal",
    summary: "Draft",
    operations: [
      {
        type: "schedule_task",
        taskId: "task-1",
        title: "Email Sam",
        description: "Email Sam",
        startTime: new Date(2026, 6, 8, 9, 0, 0).toISOString(),
        endTime: new Date(2026, 6, 8, 9, 30, 0).toISOString(),
      },
      {
        type: "schedule_goal_focus",
        goalId: "goal-1",
        focusId: "focus-1",
        title: "Deep work",
        description: "Deep work",
        startTime: new Date(2026, 6, 10, 13, 0, 0).toISOString(),
        endTime: new Date(2026, 6, 10, 14, 0, 0).toISOString(),
      },
    ],
    conflictAnnotations: [],
    feedbackHistory: [],
    appliedAt: null,
    createdAt: new Date(2026, 6, 8, 8, 0, 0).toISOString(),
    updatedAt: new Date(2026, 6, 8, 8, 0, 0).toISOString(),
  };
  const horizon = buildScheduleProposalRevisionHorizonOverride(proposal);

  assert.equal(horizon?.source, "schedule proposal proposal-1 date range");
  assert.equal(horizon?.startTime.getFullYear(), 2026);
  assert.equal(horizon?.startTime.getMonth(), 6);
  assert.equal(horizon?.startTime.getDate(), 8);
  assert.equal(horizon?.startTime.getHours(), 0);
  assert.equal(horizon?.endTime.getMonth(), 6);
  assert.equal(horizon?.endTime.getDate(), 11);
  assert.equal(horizon?.endTime.getHours(), 0);
});

test("buildScheduleProposalRevisionHorizonOverride narrows to named feedback day", () => {
  const proposal = scheduleProposalRecord({
    id: "proposal-1",
    operations: [
      {
        type: "schedule_task",
        taskId: "task-1",
        title: "Email Sam",
        description: "Email Sam",
        startTime: new Date(2026, 6, 8, 8, 0, 0).toISOString(),
        endTime: new Date(2026, 6, 8, 8, 30, 0).toISOString(),
      },
      {
        type: "schedule_task",
        taskId: "task-2",
        title: "Submit report",
        description: "Submit report",
        startTime: new Date(2026, 6, 10, 13, 0, 0).toISOString(),
        endTime: new Date(2026, 6, 10, 14, 0, 0).toISOString(),
      },
    ],
  });
  const horizon = buildScheduleProposalRevisionHorizonOverride(proposal, {
    proposalId: "proposal-1",
    feedback: "I need to change Friday.",
  });

  assert.equal(
    horizon?.source,
    "schedule proposal proposal-1 Friday feedback date range",
  );
  assert.equal(horizon?.startTime.getFullYear(), 2026);
  assert.equal(horizon?.startTime.getMonth(), 6);
  assert.equal(horizon?.startTime.getDate(), 10);
  assert.equal(horizon?.startTime.getHours(), 0);
  assert.equal(horizon?.endTime.getMonth(), 6);
  assert.equal(horizon?.endTime.getDate(), 11);
  assert.equal(horizon?.endTime.getHours(), 0);
});

test("buildSchedulingAssemblyInputsForTurn revises only original proposal items", () => {
  const proposal: ScheduleProposalRecord = {
    id: "proposal-1",
    threadId: "thread-1",
    title: "Draft schedule",
    status: "draft",
    intent: "assistant_schedule_proposal",
    summary: "Draft",
    operations: [
      {
        type: "schedule_task",
        taskId: "task-1",
        title: "Email Sam",
        description: "Email Sam",
        startTime: new Date(2026, 6, 8, 8, 0, 0).toISOString(),
        endTime: new Date(2026, 6, 8, 8, 30, 0).toISOString(),
      },
      {
        type: "schedule_goal_focus",
        goalId: "goal-1",
        focusId: "focus-2",
        title: "Practice problems",
        description: "Practice problems",
        startTime: new Date(2026, 6, 8, 8, 40, 0).toISOString(),
        endTime: new Date(2026, 6, 8, 9, 25, 0).toISOString(),
      },
    ],
    conflictAnnotations: [],
    feedbackHistory: [],
    appliedAt: null,
    createdAt: new Date(2026, 6, 8, 8, 0, 0).toISOString(),
    updatedAt: new Date(2026, 6, 8, 8, 0, 0).toISOString(),
  };
  const inputs = buildSchedulingAssemblyInputsForTurn({
    tasks: [
      {
        id: "task-1",
        title: "Email Sam",
        goalId: null,
        status: "planned",
        priorityRank: 1,
        estimatedMinutes: 30,
        dueAt: null,
        recurrence: null,
        scheduledDateKeys: [],
        scheduleIntent: "schedule_now",
        linkedCalendarEventId: null,
        calendarStatus: "pending_proposal",
        reason: "Task already appears in a draft schedule proposal.",
        matchedCalendarEvent: null,
        pendingProposalId: "proposal-1",
      },
      {
        id: "task-2",
        title: "Unrelated task",
        goalId: null,
        status: "planned",
        priorityRank: 2,
        estimatedMinutes: 30,
        dueAt: null,
        recurrence: null,
        scheduledDateKeys: [],
        scheduleIntent: "schedule_now",
        linkedCalendarEventId: null,
        calendarStatus: "needs_scheduling",
        reason: "Unrelated active task.",
        matchedCalendarEvent: null,
        pendingProposalId: null,
      },
    ],
    goals: [
      {
        id: "goal-1",
        title: "Exam prep",
        definition: "Prepare for the exam.",
        successCriteria: [],
        focusAreas: [
          {
            id: "focus-1",
            title: "Read notes",
            description: "Read notes.",
            status: "active",
            defaultDurationMinutes: 30,
            cadence: "weekly",
          },
          {
            id: "focus-2",
            title: "Practice problems",
            description: "Practice problems.",
            status: "active",
            defaultDurationMinutes: 45,
            cadence: "weekly",
          },
        ],
        scheduleGuidance: {},
        constraints: [],
        notes: null,
        priorityRank: 1,
        status: "active",
        createdAt: new Date(2026, 6, 1).toISOString(),
        updatedAt: new Date(2026, 6, 1).toISOString(),
      },
      {
        id: "goal-2",
        title: "Unrelated goal",
        definition: "Do something else.",
        successCriteria: [],
        focusAreas: [
          {
            id: "focus-3",
            title: "Unrelated focus",
            description: "Unrelated focus.",
            status: "active",
            defaultDurationMinutes: 30,
            cadence: "weekly",
          },
        ],
        scheduleGuidance: {},
        constraints: [],
        notes: null,
        priorityRank: 2,
        status: "active",
        createdAt: new Date(2026, 6, 1).toISOString(),
        updatedAt: new Date(2026, 6, 1).toISOString(),
      },
    ],
    proposalRevisionFeedback: {
      proposalId: "proposal-1",
      feedback: "Move it later.",
    },
    pendingProposalsById: new Map([["proposal-1", proposal]]),
  });

  assert.deepEqual(
    inputs.tasks.map((task) => [task.id, task.calendarStatus]),
    [["task-1", "needs_scheduling"]],
  );
  assert.deepEqual(
    inputs.goals.map((goal) => ({
      id: goal.id,
      focusAreaIds: goal.focusAreas.map((focusArea) => focusArea.id),
    })),
    [{ id: "goal-1", focusAreaIds: ["focus-2"] }],
  );
});

test("buildSchedulingAssemblyInputsForTurn revises only named feedback day items", () => {
  const proposal = scheduleProposalRecord({
    id: "proposal-1",
    operations: [
      {
        type: "schedule_task",
        taskId: "task-1",
        title: "Email Sam",
        description: "Email Sam",
        startTime: new Date(2026, 6, 8, 8, 0, 0).toISOString(),
        endTime: new Date(2026, 6, 8, 8, 30, 0).toISOString(),
      },
      {
        type: "schedule_task",
        taskId: "task-2",
        title: "Submit report",
        description: "Submit report",
        startTime: new Date(2026, 6, 10, 13, 0, 0).toISOString(),
        endTime: new Date(2026, 6, 10, 14, 0, 0).toISOString(),
      },
      {
        type: "schedule_goal_focus",
        goalId: "goal-1",
        focusId: "focus-2",
        title: "Practice problems",
        description: "Practice problems",
        startTime: new Date(2026, 6, 10, 14, 15, 0).toISOString(),
        endTime: new Date(2026, 6, 10, 15, 0, 0).toISOString(),
      },
    ],
  });
  const inputs = buildSchedulingAssemblyInputsForTurn({
    tasks: [
      taskSchedulingContextItem({
        id: "task-1",
        title: "Email Sam",
        pendingProposalId: "proposal-1",
      }),
      taskSchedulingContextItem({
        id: "task-2",
        title: "Submit report",
        pendingProposalId: "proposal-1",
      }),
      taskSchedulingContextItem({
        id: "task-3",
        title: "Unrelated task",
      }),
    ],
    goals: [
      goalRecord({
        id: "goal-1",
        title: "Exam prep",
        focusAreas: [
          {
            id: "focus-1",
            title: "Read notes",
            description: "Read notes.",
            status: "active",
            defaultDurationMinutes: 30,
            cadence: "weekly",
          },
          {
            id: "focus-2",
            title: "Practice problems",
            description: "Practice problems.",
            status: "active",
            defaultDurationMinutes: 45,
            cadence: "weekly",
          },
        ],
      }),
    ],
    proposalRevisionFeedback: {
      proposalId: "proposal-1",
      feedback: "I need to change my schedule for Friday.",
    },
    pendingProposalsById: new Map([["proposal-1", proposal]]),
  });

  assert.deepEqual(
    inputs.tasks.map((task) => [task.id, task.calendarStatus]),
    [["task-2", "needs_scheduling"]],
  );
  assert.deepEqual(
    inputs.goals.map((goal) => ({
      id: goal.id,
      focusAreaIds: goal.focusAreas.map((focusArea) => focusArea.id),
    })),
    [{ id: "goal-1", focusAreaIds: ["focus-2"] }],
  );
});

test("buildSchedulingAssemblyInputsForTurn can revise applied proposal items", () => {
  const appliedProposal = scheduleProposalRecord({
    id: "proposal-applied",
    status: "applied",
    appliedAt: new Date(2026, 6, 10, 16, 0, 0).toISOString(),
    operations: [
      {
        type: "schedule_task",
        taskId: "task-1",
        title: "Email Sam",
        description: "Email Sam",
        startTime: new Date(2026, 6, 10, 9, 0, 0).toISOString(),
        endTime: new Date(2026, 6, 10, 9, 30, 0).toISOString(),
      },
      {
        type: "schedule_goal_focus",
        goalId: "goal-1",
        focusId: "focus-1",
        title: "Practice problems",
        description: "Practice problems",
        startTime: new Date(2026, 6, 10, 10, 0, 0).toISOString(),
        endTime: new Date(2026, 6, 10, 10, 45, 0).toISOString(),
      },
    ],
  });
  const inputs = buildSchedulingAssemblyInputsForTurn({
    tasks: [
      taskSchedulingContextItem({
        id: "task-1",
        title: "Email Sam",
        calendarStatus: "scheduled",
        linkedCalendarEventId: "primary:event-1",
      }),
      taskSchedulingContextItem({
        id: "task-2",
        title: "Unrelated task",
      }),
    ],
    goals: [
      goalRecord({
        id: "goal-1",
        title: "Exam prep",
        focusAreas: [
          {
            id: "focus-1",
            title: "Practice problems",
            description: "Practice problems.",
            status: "active",
            defaultDurationMinutes: 45,
            cadence: "weekly",
          },
        ],
      }),
    ],
    proposalRevisionFeedback: {
      proposalId: "proposal-applied",
      feedback: "I need to change my schedule for Friday.",
    },
    pendingProposalsById: new Map(),
    revisionSourceProposalsById: new Map([
      ["proposal-applied", appliedProposal],
    ]),
  });

  assert.deepEqual(
    inputs.tasks.map((task) => [task.id, task.calendarStatus]),
    [["task-1", "needs_scheduling"]],
  );
  assert.deepEqual(
    inputs.goals.map((goal) => ({
      id: goal.id,
      focusAreaIds: goal.focusAreas.map((focusArea) => focusArea.id),
    })),
    [{ id: "goal-1", focusAreaIds: ["focus-1"] }],
  );
});

test("deriveSchedulingPreferenceCandidatesFromProposalFeedback extracts durable activity timing", () => {
  const candidates = deriveSchedulingPreferenceCandidatesFromProposalFeedback(
    "Move workouts later, but keep mornings for study.",
  );

  assert.deepEqual(candidates, [
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
      evidence: "Move workouts later, but keep mornings for study.",
    },
  ]);
});

test("deriveSchedulingPreferenceCandidatesFromProposalFeedback extracts durable buffer preferences", () => {
  const candidates = deriveSchedulingPreferenceCandidatesFromProposalFeedback(
    "I usually need more buffer and less crowded days.",
  );

  assert.deepEqual(candidates, [
    {
      kind: "custom",
      title: "Prefer lighter schedule drafts",
      detail:
        "Prefer generated schedule drafts with more breathing room, larger buffers, and a lighter non-urgent daily load.",
      strength: "soft_preference",
      confidence: "medium",
      applicabilityScope: "global",
      domain: null,
      goalTitle: null,
      activityTitle: null,
      temporalScope: null,
      evidence: "I usually need more buffer and less crowded days.",
    },
  ]);
});

test("deriveSchedulingPreferenceCandidatesFromProposalFeedback learns crowded draft feedback", () => {
  const candidates = deriveSchedulingPreferenceCandidatesFromProposalFeedback(
    "Move workouts later and make the day feel less crowded.",
  );

  assert.deepEqual(candidates, [
    {
      kind: "custom",
      title: "Prefer lighter schedule drafts",
      detail:
        "Prefer generated schedule drafts with more breathing room, larger buffers, and a lighter non-urgent daily load.",
      strength: "soft_preference",
      confidence: "medium",
      applicabilityScope: "global",
      domain: null,
      goalTitle: null,
      activityTitle: null,
      temporalScope: null,
      evidence: "Move workouts later and make the day feel less crowded.",
    },
  ]);
});

test("deriveSchedulingPreferenceCandidatesFromProposalFeedback extracts unavailable periods", () => {
  const candidates = deriveSchedulingPreferenceCandidatesFromProposalFeedback(
    "I can't do mornings anymore.",
  );
  const blockedCandidates = deriveSchedulingPreferenceCandidatesFromProposalFeedback(
    "Afternoons are blocked for the next few weeks.",
  );

  assert.deepEqual(candidates, [
    {
      kind: "no_schedule_window",
      title: "Avoid scheduling mornings",
      detail: "Avoid generated schedule drafts during the morning when possible.",
      strength: "soft_preference",
      confidence: "medium",
      applicabilityScope: "global",
      domain: null,
      goalTitle: null,
      activityTitle: null,
      temporalScope: "morning",
      evidence: "I can't do mornings anymore.",
    },
  ]);
  assert.deepEqual(blockedCandidates, [
    {
      kind: "no_schedule_window",
      title: "Avoid scheduling afternoons",
      detail: "Avoid generated schedule drafts during the afternoon when possible.",
      strength: "soft_preference",
      confidence: "medium",
      applicabilityScope: "global",
      domain: null,
      goalTitle: null,
      activityTitle: null,
      temporalScope: "afternoon",
      evidence: "Afternoons are blocked for the next few weeks.",
    },
  ]);
});

test("deriveSchedulingPreferenceCandidatesFromProposalFeedback extracts relative activity timing", () => {
  const candidates = deriveSchedulingPreferenceCandidatesFromProposalFeedback(
    "Workouts are better later, and study is better earlier.",
  );

  assert.deepEqual(candidates, [
    {
      kind: "preferred_work_period",
      title: "Workouts afternoon preference",
      detail: "Prefer scheduling Workouts during the afternoon.",
      strength: "soft_preference",
      confidence: "medium",
      applicabilityScope: "activity",
      domain: null,
      goalTitle: null,
      activityTitle: "Workouts",
      temporalScope: "afternoon",
      evidence: "Workouts are better later, and study is better earlier.",
    },
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
      evidence: "Workouts are better later, and study is better earlier.",
    },
  ]);
});

test("deriveSchedulingPreferenceCandidatesFromProposalFeedback ignores vague timing feedback without learning signal", () => {
  assert.deepEqual(
    deriveSchedulingPreferenceCandidatesFromProposalFeedback(
      "Move workouts later.",
    ),
    [],
  );
});
