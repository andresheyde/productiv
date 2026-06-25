import assert from "node:assert/strict";
import test from "node:test";

import type { CompiledSchedulingContext } from "../scheduling-context/scheduling-context.types.ts";
import type { SchedulingCandidateSlotContext } from "./scheduling-placement-policy.ts";
import {
  buildSchedulingAssemblyDraft,
  buildSchedulingCandidateSlots,
  buildSchedulingPlacementPolicy,
} from "./scheduling-placement-policy.ts";

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

test("buildSchedulingPlacementPolicy uses morning-first defaults", () => {
  const policy = buildSchedulingPlacementPolicy({
    schedulingContext: schedulingContext(),
  });

  assert.equal(policy.defaultFocusBlockMinutes, 30);
  assert.deepEqual(
    policy.rankedWorkPeriods.map((period) => period.period),
    ["morning", "afternoon", "evening"],
  );
  assert.deepEqual(policy.rankedWorkPeriods[0]?.suggestedWindow, {
    startTime: "08:00",
    endTime: "11:00",
  });
});

test("buildSchedulingPlacementPolicy honors saved focus duration and periods first", () => {
  const policy = buildSchedulingPlacementPolicy({
    schedulingContext: schedulingContext({
      preferredFocusBlockMinutes: 45,
      preferredWorkPeriods: ["evening"],
    }),
  });

  assert.equal(policy.defaultFocusBlockMinutes, 45);
  assert.deepEqual(
    policy.rankedWorkPeriods.map((period) => period.period),
    ["evening", "morning", "afternoon"],
  );
  assert.match(policy.rankedWorkPeriods[0]?.rationale ?? "", /User saved/u);
});

test("buildSchedulingPlacementPolicy encodes important-before-urgent placement", () => {
  const policy = buildSchedulingPlacementPolicy({
    schedulingContext: schedulingContext(),
  });
  const rules = [
    ...policy.hardConstraintChecks,
    ...policy.slotScoringRules,
    ...policy.taskPlacementRules,
    ...policy.goalFocusPlacementRules,
    ...policy.feedbackRules,
  ].join(" ");

  assert.match(rules, /Reject candidate blocks/u);
  assert.match(rules, /important goal-focus or habit blocks before urgent/u);
  assert.match(rules, /Choose exact candidate blocks/u);
});

test("buildSchedulingCandidateSlots suggests morning-first blocks for next week", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const slots = buildSchedulingCandidateSlots({
    message: "Generate my schedule for next week.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const firstBlockStart = new Date(
    slots.slots[0]?.recommendedBlock.startTime ?? "",
  );

  assert.equal(
    slots.horizon.source,
    "latest message: next week, default Sunday-through-Saturday",
  );
  assert.equal(slots.defaultDurationMinutes, 30);
  assert.equal(slots.slots[0]?.period, "morning");
  assert.equal(firstBlockStart.getDay(), 0);
  assert.equal(firstBlockStart.getHours(), 8);
});

test("buildSchedulingCandidateSlots avoids tentative unavailable work periods", () => {
  const context = schedulingContext({
    tentativeDerivedPreferences: [
      "Avoid scheduling mornings: Avoid generated schedule drafts during the morning when possible.",
    ],
  });
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const slots = buildSchedulingCandidateSlots({
    message: "Generate my schedule tomorrow.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const firstBlockStart = new Date(
    slots.slots[0]?.recommendedBlock.startTime ?? "",
  );

  assert.equal(slots.slots.some((slot) => slot.period === "morning"), false);
  assert.equal(slots.slots[0]?.period, "afternoon");
  assert.equal(firstBlockStart.getHours(), 13);
  assert.match(
    slots.slots[0]?.rationale.join(" ") ?? "",
    /Tentative learned feedback suggests avoiding morning/u,
  );
});

test("buildSchedulingCandidateSlots trims same-day openings to future time", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const now = new Date(2026, 5, 24, 10, 17, 0);
  const slots = buildSchedulingCandidateSlots({
    message: "Generate my schedule today.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now,
  });
  const firstBlockStart = new Date(
    slots.slots[0]?.recommendedBlock.startTime ?? "",
  );
  const firstBlockEnd = new Date(
    slots.slots[0]?.recommendedBlock.endTime ?? "",
  );

  assert.equal(slots.horizon.source, "latest message: today");
  assert.equal(slots.slots[0]?.period, "morning");
  assert.equal(firstBlockStart.getHours(), 10);
  assert.equal(firstBlockStart.getMinutes(), 20);
  assert.ok(firstBlockStart.getTime() >= now.getTime());
  assert.equal(firstBlockEnd.getHours(), 10);
  assert.equal(firstBlockEnd.getMinutes(), 50);
});

test("buildSchedulingCandidateSlots immediately avoids unavailable periods from latest feedback", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const slots = buildSchedulingCandidateSlots({
    message:
      "For schedule proposal proposal-1, please revise it based on this feedback: I can't do mornings anymore.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    horizonOverride: {
      startTime: new Date(2026, 6, 6, 0, 0, 0),
      endTime: new Date(2026, 6, 8, 0, 0, 0),
      source: "schedule proposal proposal-1 date range",
    },
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const firstBlockStart = new Date(
    slots.slots[0]?.recommendedBlock.startTime ?? "",
  );

  assert.equal(slots.slots.some((slot) => slot.period === "morning"), false);
  assert.equal(slots.slots[0]?.period, "afternoon");
  assert.equal(firstBlockStart.getHours(), 13);
  assert.match(
    slots.slots[0]?.rationale.join(" ") ?? "",
    /Latest feedback says morning is unavailable/u,
  );
});

test("buildSchedulingCandidateSlots lets explicit timing override learned avoidance", () => {
  const context = schedulingContext({
    tentativeDerivedPreferences: [
      "Avoid scheduling mornings: Avoid generated schedule drafts during the morning when possible.",
    ],
  });
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const slots = buildSchedulingCandidateSlots({
    message: "Generate my schedule tomorrow morning.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const firstBlockStart = new Date(
    slots.slots[0]?.recommendedBlock.startTime ?? "",
  );

  assert.equal(slots.slots[0]?.period, "morning");
  assert.equal(firstBlockStart.getHours(), 8);
});

test("buildSchedulingCandidateSlots lets explicit ranges override tomorrow shortcuts", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const slots = buildSchedulingCandidateSlots({
    message: "Generate my schedule from tomorrow till Tuesday.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const horizonStart = new Date(slots.horizon.startTime);
  const horizonEnd = new Date(slots.horizon.endTime);
  const firstBlockStart = new Date(
    slots.slots[0]?.recommendedBlock.startTime ?? "",
  );

  assert.equal(
    slots.horizon.source,
    "latest message explicit date range: tomorrow to tuesday",
  );
  assert.equal(horizonStart.getMonth(), 5);
  assert.equal(horizonStart.getDate(), 25);
  assert.equal(horizonEnd.getMonth(), 6);
  assert.equal(horizonEnd.getDate(), 1);
  assert.equal(firstBlockStart.getDate(), 25);
});

test("buildSchedulingCandidateSlots supports between weekday date ranges", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const slots = buildSchedulingCandidateSlots({
    message: "Plan study blocks between Monday and Thursday.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const horizonStart = new Date(slots.horizon.startTime);
  const horizonEnd = new Date(slots.horizon.endTime);
  const firstBlockStart = new Date(
    slots.slots[0]?.recommendedBlock.startTime ?? "",
  );

  assert.equal(
    slots.horizon.source,
    "latest message explicit date range: monday to thursday",
  );
  assert.equal(horizonStart.getMonth(), 5);
  assert.equal(horizonStart.getDate(), 29);
  assert.equal(horizonEnd.getMonth(), 6);
  assert.equal(horizonEnd.getDate(), 3);
  assert.equal(firstBlockStart.getDay(), 1);
});

test("buildSchedulingCandidateSlots lets explicit week requests beat task due-date words", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const slots = buildSchedulingCandidateSlots({
    message:
      "Review investor notes tomorrow for 45 minutes. Add a daily stretch routine. Schedule my week.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const horizonStart = new Date(slots.horizon.startTime);
  const horizonEnd = new Date(slots.horizon.endTime);

  assert.equal(slots.horizon.source, "latest message: this week, through Saturday");
  assert.equal(horizonStart.getMonth(), 5);
  assert.equal(horizonStart.getDate(), 24);
  assert.equal(horizonEnd.getMonth(), 5);
  assert.equal(horizonEnd.getDate(), 28);
});

test("buildSchedulingCandidateSlots honors explicit proposal revision horizons and later feedback", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const slots = buildSchedulingCandidateSlots({
    message:
      "For schedule proposal proposal-1, please revise it based on this feedback: Move workouts later.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    horizonOverride: {
      startTime: new Date(2026, 6, 6, 0, 0, 0),
      endTime: new Date(2026, 6, 8, 0, 0, 0),
      source: "schedule proposal proposal-1 date range",
    },
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const firstBlockStart = new Date(
    slots.slots[0]?.recommendedBlock.startTime ?? "",
  );

  assert.equal(slots.horizon.source, "schedule proposal proposal-1 date range");
  assert.equal(firstBlockStart.getMonth(), 6);
  assert.equal(firstBlockStart.getDate(), 6);
  assert.equal(firstBlockStart.getHours(), 13);
  assert.equal(slots.slots[0]?.period, "afternoon");
  assert.match(slots.slots[0]?.rationale.join(" ") ?? "", /move this later/u);
});

test("buildSchedulingCandidateSlots subtracts included calendar events", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const now = new Date(2026, 5, 24, 10, 0, 0);
  const busyStart = new Date(2026, 5, 25, 8, 0, 0);
  const busyEnd = new Date(2026, 5, 25, 10, 0, 0);
  const slots = buildSchedulingCandidateSlots({
    message: "Schedule focus time tomorrow.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [
      {
        title: "Doctor",
        start: busyStart.toISOString(),
        end: busyEnd.toISOString(),
        allDay: false,
      },
    ],
    now,
  });
  const firstMorningSlot = slots.slots.find((slot) => slot.period === "morning");
  const firstMorningStart = new Date(
    firstMorningSlot?.recommendedBlock.startTime ?? "",
  );

  assert.equal(firstMorningStart.getHours(), 10);
  assert.equal(firstMorningStart.getMinutes(), 0);
});

test("buildSchedulingCandidateSlots blocks saved work hours", () => {
  const context = schedulingContext({
    workHours: [
      {
        dayOfWeek: 4,
        enabled: true,
        startTime: "08:00",
        endTime: "11:00",
      },
    ],
  });
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const slots = buildSchedulingCandidateSlots({
    message: "Schedule focus time tomorrow.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });

  assert.equal(slots.slots[0]?.period, "afternoon");
  assert.equal(
    new Date(slots.slots[0]?.recommendedBlock.startTime ?? "").getHours(),
    13,
  );
});

test("buildSchedulingCandidateSlots blocks same-turn dumped work hours", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const slots = buildSchedulingCandidateSlots({
    message:
      "I work weekdays 8am-11am. Schedule focus time tomorrow.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });

  assert.equal(slots.slots.some((slot) => slot.period === "morning"), false);
  assert.equal(slots.slots[0]?.period, "afternoon");
  assert.match(slots.assumptions.join(" "), /protected work hours/u);
});

test("buildSchedulingCandidateSlots blocks tentative learned availability", () => {
  const context = schedulingContext({
    tentativeDerivedPreferences: [
      "Protect weekday work hours: I work weekdays 8am-11am.",
      "Protect sleep: I sleep 6pm-7am.",
    ],
  });
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const slots = buildSchedulingCandidateSlots({
    message: "Schedule focus time tomorrow.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const assumptions = slots.assumptions.join(" ");

  assert.equal(slots.slots.some((slot) => slot.period === "morning"), false);
  assert.equal(slots.slots.some((slot) => slot.period === "evening"), false);
  assert.equal(slots.slots[0]?.period, "afternoon");
  assert.match(assumptions, /Tentative learned availability/u);
});

test("buildSchedulingCandidateSlots blocks same-turn sleep window", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const slots = buildSchedulingCandidateSlots({
    message: "I sleep 6pm-7am. Generate my schedule tomorrow.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });

  assert.equal(slots.slots.some((slot) => slot.period === "evening"), false);
  assert.match(slots.assumptions.join(" "), /sleep is 18:00-07:00/u);
});

test("buildSchedulingCandidateSlots keeps dumped constraint times in their own clauses", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const slots = buildSchedulingCandidateSlots({
    message:
      "Here is my schedule: I work weekdays 8am-11am. I sleep 6pm-7am. I have class Tuesday 8am-11am. Schedule my week.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const assumptions = slots.assumptions.join(" ");

  assert.match(assumptions, /work hours/u);
  assert.match(assumptions, /sleep is 18:00-07:00/u);
  assert.match(assumptions, /Class blocks Tuesday 08:00-11:00/u);
  assert.doesNotMatch(assumptions, /sleep is 08:00-11:00/u);
});

test("buildSchedulingCandidateSlots blocks same-turn fixed commitments", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const slots = buildSchedulingCandidateSlots({
    message:
      "Schedule focus time tomorrow. I have class Tuesday 8am-11am.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now: new Date(2026, 5, 29, 10, 0, 0),
  });

  assert.equal(slots.slots.some((slot) => slot.period === "morning"), false);
  assert.equal(slots.slots[0]?.period, "afternoon");
  assert.match(slots.assumptions.join(" "), /Class blocks Tuesday 08:00-11:00/u);
});

test("buildSchedulingAssemblyDraft protects goal focus before flexible tasks", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const candidateSlots = buildSchedulingCandidateSlots({
    message: "Generate my schedule tomorrow.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const draft = buildSchedulingAssemblyDraft({
    message: "Generate my schedule tomorrow.",
    candidateSlots,
    tasks: [
      {
        id: "task-1",
        title: "Email Sam",
        goalId: null,
        priorityRank: 5,
        estimatedMinutes: 45,
        dueAt: null,
        scheduleIntent: "schedule_now",
        calendarStatus: "needs_scheduling",
      },
    ],
    goals: [
      {
        id: "goal-1",
        title: "Launch",
        priorityRank: 1,
        status: "active",
        focusAreas: [
          {
            id: "focus-1",
            title: "Deep work",
            status: "active",
            defaultDurationMinutes: 60,
            cadence: "weekly",
          },
        ],
      },
    ],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });

  assert.equal(draft.assignments[0]?.itemType, "goal_focus");
  assert.equal(draft.assignments[0]?.actionTypeHint, "propose_schedule_goal_focus");
  assert.equal(draft.assignments[1]?.itemType, "task");
  assert.ok(
    new Date(draft.assignments[0]?.endTime ?? "").getTime() <=
      new Date(draft.assignments[1]?.startTime ?? "").getTime(),
  );
});

test("buildSchedulingAssemblyDraft leaves not-requested backlog tasks out of ordinary schedules", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const candidateSlots = buildSchedulingCandidateSlots({
    message: "Generate my schedule tomorrow.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const draft = buildSchedulingAssemblyDraft({
    message: "Generate my schedule tomorrow.",
    candidateSlots,
    tasks: [
      {
        id: "task-ready",
        title: "Email Sam",
        goalId: null,
        priorityRank: 2,
        estimatedMinutes: 30,
        dueAt: null,
        scheduleIntent: "schedule_now",
        calendarStatus: "needs_scheduling",
      },
      {
        id: "task-backlog",
        title: "Organize bookmarks",
        goalId: null,
        priorityRank: 3,
        estimatedMinutes: 30,
        dueAt: null,
        scheduleIntent: "unscheduled",
        calendarStatus: "not_requested",
      },
    ],
    goals: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });

  assert.deepEqual(
    draft.assignments.map((assignment) => assignment.taskId),
    ["task-ready"],
  );
});

test("buildSchedulingAssemblyDraft includes not-requested tasks when scheduling a task list", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const candidateSlots = buildSchedulingCandidateSlots({
    message: "Schedule my task list tomorrow.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const draft = buildSchedulingAssemblyDraft({
    message: "Schedule my task list tomorrow.",
    candidateSlots,
    tasks: [
      {
        id: "task-ready",
        title: "Email Sam",
        goalId: null,
        priorityRank: 2,
        estimatedMinutes: 30,
        dueAt: null,
        scheduleIntent: "schedule_now",
        calendarStatus: "needs_scheduling",
      },
      {
        id: "task-backlog",
        title: "Organize bookmarks",
        goalId: null,
        priorityRank: 3,
        estimatedMinutes: 30,
        dueAt: null,
        scheduleIntent: "unscheduled",
        calendarStatus: "not_requested",
      },
    ],
    goals: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });

  assert.deepEqual(
    draft.assignments.map((assignment) => assignment.taskId),
    ["task-ready", "task-backlog"],
  );
});

test("buildSchedulingAssemblyDraft expands recurring tasks across the horizon", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const candidateSlots = buildSchedulingCandidateSlots({
    message: "Generate my schedule next week.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const draft = buildSchedulingAssemblyDraft({
    message: "Generate my schedule next week.",
    candidateSlots,
    tasks: [
      {
        id: "task-1",
        title: "Submit weekly report",
        goalId: null,
        priorityRank: 3,
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
        scheduleIntent: "schedule_now",
        calendarStatus: "needs_scheduling",
      },
    ],
    goals: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
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
  assert.ok(
    taskAssignments.every((assignment) =>
      assignment.rationale.some((line) => /weekly \(Mon, Wed\)/u.test(line)),
    ),
  );
});

test("buildSchedulingAssemblyDraft skips scheduled recurring task dates", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const candidateSlots = buildSchedulingCandidateSlots({
    message: "Generate my schedule next week.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const draft = buildSchedulingAssemblyDraft({
    message: "Generate my schedule next week.",
    candidateSlots,
    tasks: [
      {
        id: "task-1",
        title: "Submit weekly report",
        goalId: null,
        priorityRank: 3,
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
        scheduleIntent: "schedule_now",
        calendarStatus: "needs_scheduling",
      },
    ],
    goals: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const taskAssignments = draft.assignments.filter(
    (assignment) => assignment.itemType === "task",
  );

  assert.equal(taskAssignments.length, 1);
  assert.equal(new Date(taskAssignments[0]?.startTime ?? "").getDay(), 3);
});

test("buildSchedulingAssemblyDraft honors latest focus sequencing feedback", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const candidateSlots = buildSchedulingCandidateSlots({
    message: "Generate my schedule tomorrow. Outline before writing.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const draft = buildSchedulingAssemblyDraft({
    message: "Generate my schedule tomorrow. Outline before writing.",
    candidateSlots,
    tasks: [],
    goals: [
      {
        id: "goal-1",
        title: "Launch",
        priorityRank: 1,
        status: "active",
        focusAreas: [
          {
            id: "focus-a-writing",
            title: "Writing",
            status: "active",
            defaultDurationMinutes: 45,
            cadence: "weekly",
          },
          {
            id: "focus-z-outline",
            title: "Outline",
            status: "active",
            defaultDurationMinutes: 45,
            cadence: "weekly",
          },
        ],
      },
    ],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });

  assert.equal(draft.assignments[0]?.focusId, "focus-z-outline");
  assert.equal(draft.assignments[1]?.focusId, "focus-a-writing");
  assert.match(
    draft.assignments[0]?.rationale.join(" ") ?? "",
    /Latest message says Outline should happen before Writing/u,
  );
  assert.ok(
    new Date(draft.assignments[0]?.endTime ?? "").getTime() <=
      new Date(draft.assignments[1]?.startTime ?? "").getTime(),
  );
});

test("buildSchedulingAssemblyDraft prefers task due dates before earlier open slots", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const now = new Date(2026, 5, 24, 10, 0, 0);
  const dueAt = new Date(2026, 5, 25, 16, 0, 0).toISOString();
  const candidateSlots = buildSchedulingCandidateSlots({
    message: "Generate my schedule for the next 3 days.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now,
  });
  const draft = buildSchedulingAssemblyDraft({
    message: "Generate my schedule for the next 3 days.",
    candidateSlots,
    tasks: [
      {
        id: "task-1",
        title: "Review investor notes",
        goalId: null,
        priorityRank: 1,
        estimatedMinutes: 45,
        dueAt,
        scheduleIntent: "schedule_now",
        calendarStatus: "needs_scheduling",
      },
    ],
    goals: [],
    now,
  });

  assert.equal(
    toLocalDateKey(draft.assignments[0]?.startTime ?? ""),
    "2026-06-25",
  );
  assert.match(
    draft.assignments[0]?.rationale.join(" ") ?? "",
    /first tried to place it on that day/u,
  );
});

test("buildSchedulingAssemblyDraft falls back before due date when due day is blocked", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const now = new Date(2026, 5, 24, 10, 0, 0);
  const dueAt = new Date(2026, 5, 25, 16, 0, 0).toISOString();
  const candidateSlots = buildSchedulingCandidateSlots({
    message: "Generate my schedule for the next 3 days.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [
      {
        title: "Travel day",
        start: new Date(2026, 5, 25, 8, 0, 0).toISOString(),
        end: new Date(2026, 5, 25, 20, 30, 0).toISOString(),
        allDay: false,
      },
    ],
    now,
  });
  const draft = buildSchedulingAssemblyDraft({
    message: "Generate my schedule for the next 3 days.",
    candidateSlots,
    tasks: [
      {
        id: "task-1",
        title: "Review investor notes",
        goalId: null,
        priorityRank: 1,
        estimatedMinutes: 45,
        dueAt,
        scheduleIntent: "schedule_now",
        calendarStatus: "needs_scheduling",
      },
    ],
    goals: [],
    now,
  });

  assert.equal(
    toLocalDateKey(draft.assignments[0]?.startTime ?? ""),
    "2026-06-24",
  );
  assert.match(
    draft.assignments[0]?.rationale.join(" ") ?? "",
    /placed it earlier before the deadline/u,
  );
});

test("buildSchedulingAssemblyDraft spreads daily goal-focus blocks across days", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const candidateSlots = buildSchedulingCandidateSlots({
    message: "Generate my schedule next week.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const draft = buildSchedulingAssemblyDraft({
    message: "Generate my schedule next week.",
    candidateSlots,
    tasks: [],
    goals: [
      {
        id: "goal-1",
        title: "Fitness",
        priorityRank: 1,
        status: "active",
        focusAreas: [
          {
            id: "focus-1",
            title: "Workout",
            status: "active",
            defaultDurationMinutes: 30,
            cadence: "daily",
          },
        ],
      },
    ],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const focusDateKeys = draft.assignments.map((assignment) =>
    toLocalDateKey(assignment.startTime),
  );

  assert.equal(draft.assignments.length, 6);
  assert.equal(new Set(focusDateKeys).size, draft.assignments.length);
});

test("buildSchedulingAssemblyDraft keeps multiple daily focus areas represented", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const candidateSlots = buildSchedulingCandidateSlots({
    message: "Generate my schedule next week.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const draft = buildSchedulingAssemblyDraft({
    message: "Generate my schedule next week.",
    candidateSlots,
    tasks: [],
    goals: [
      {
        id: "goal-1",
        title: "Launch",
        priorityRank: 1,
        status: "active",
        focusAreas: [
          {
            id: "focus-launch",
            title: "Draft launch narrative",
            status: "active",
            defaultDurationMinutes: 60,
            cadence: "daily",
          },
        ],
      },
      {
        id: "goal-routines",
        title: "Personal routines",
        priorityRank: 2,
        status: "active",
        focusAreas: [
          {
            id: "focus-stretch",
            title: "Stretch",
            status: "active",
            defaultDurationMinutes: 20,
            cadence: "daily",
          },
        ],
      },
    ],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });

  assert.equal(draft.assignments.length, 6);
  assert.ok(
    draft.assignments.some(
      (assignment) => assignment.focusId === "focus-launch",
    ),
  );
  assert.ok(
    draft.assignments.some(
      (assignment) => assignment.focusId === "focus-stretch",
    ),
  );
});

test("buildSchedulingAssemblyDraft skips goal-focus blocks already scheduled in goal guidance", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const candidateSlots = buildSchedulingCandidateSlots({
    message: "Generate my schedule next week.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const draft = buildSchedulingAssemblyDraft({
    message: "Generate my schedule next week.",
    candidateSlots,
    tasks: [],
    goals: [
      {
        id: "goal-1",
        title: "Fitness",
        priorityRank: 1,
        status: "active",
        scheduleGuidance: {
          scheduledFocusBlocks: [
            {
              focusId: "focus-1",
              title: "Workout",
              startTime: new Date(2026, 5, 29, 8, 0, 0).toISOString(),
              endTime: new Date(2026, 5, 29, 8, 30, 0).toISOString(),
            },
            {
              focusId: "focus-1",
              title: "Workout",
              startTime: new Date(2026, 5, 30, 8, 0, 0).toISOString(),
              endTime: new Date(2026, 5, 30, 8, 30, 0).toISOString(),
            },
          ],
        },
        focusAreas: [
          {
            id: "focus-1",
            title: "Workout",
            status: "active",
            defaultDurationMinutes: 30,
            cadence: "daily",
          },
        ],
      },
    ],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const focusDateKeys = draft.assignments.map((assignment) =>
    toLocalDateKey(assignment.startTime),
  );

  assert.equal(draft.assignments.length, 4);
  assert.equal(new Set(focusDateKeys).size, draft.assignments.length);
  assert.equal(focusDateKeys.includes("2026-06-29"), false);
  assert.equal(focusDateKeys.includes("2026-06-30"), false);
});

test("buildSchedulingAssemblyDraft gives no-cadence habits a cautious trial pattern", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const candidateSlots = buildSchedulingCandidateSlots({
    message: "Generate my schedule next week.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const draft = buildSchedulingAssemblyDraft({
    message: "Generate my schedule next week.",
    candidateSlots,
    tasks: [],
    goals: [
      {
        id: "goal-1",
        title: "Personal routines",
        priorityRank: 1,
        status: "active",
        focusAreas: [
          {
            id: "focus-1",
            title: "Stretching",
            status: "active",
            defaultDurationMinutes: 30,
            cadence: null,
          },
        ],
      },
    ],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const focusDateKeys = draft.assignments.map((assignment) =>
    toLocalDateKey(assignment.startTime),
  );

  assert.equal(draft.assignments.length, 3);
  assert.deepEqual(focusDateKeys, [
    "2026-06-28",
    "2026-07-01",
    "2026-07-04",
  ]);
  assert.match(
    draft.assignments[0]?.rationale.join(" ") ?? "",
    /cautious starter pattern/u,
  );
});

test("buildSchedulingAssemblyDraft treats every-morning habits as daily morning work", () => {
  const candidateSlots: SchedulingCandidateSlotContext = {
    horizon: {
      startTime: new Date(2026, 5, 25, 0, 0, 0).toISOString(),
      endTime: new Date(2026, 5, 26, 0, 0, 0).toISOString(),
      source: "test horizon",
    },
    defaultDurationMinutes: 30,
    assumptions: [],
    slots: [
      {
        id: "afternoon-slot",
        period: "afternoon",
        rank: 1,
        score: 100,
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
        rationale: ["Afternoon slot comes first in the raw candidate list."],
      },
      {
        id: "morning-slot",
        period: "morning",
        rank: 2,
        score: 50,
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
        rationale: ["Morning slot should win from the habit preference."],
      },
    ],
  };
  const draft = buildSchedulingAssemblyDraft({
    message: "Schedule my day. Read every morning.",
    candidateSlots,
    tasks: [],
    goals: [
      {
        id: "goal-1",
        title: "Personal routines",
        priorityRank: 1,
        status: "active",
        focusAreas: [
          {
            id: "focus-1",
            title: "Read",
            status: "active",
            defaultDurationMinutes: null,
            cadence: "daily",
          },
        ],
      },
    ],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });

  assert.equal(draft.assignments.length, 1);
  assert.equal(draft.assignments[0]?.sourceSlotId, "morning-slot");
  assert.equal(new Date(draft.assignments[0]?.startTime ?? "").getHours(), 8);
  assert.match(
    draft.assignments[0]?.rationale.join(" ") ?? "",
    /scheduling Read during the morning/u,
  );
});

test("buildSchedulingAssemblyDraft gives vague habits default starter durations", () => {
  const context = schedulingContext({
    preferredFocusBlockMinutes: 25,
  });
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const candidateSlots = buildSchedulingCandidateSlots({
    message: "Generate my schedule next week.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const draft = buildSchedulingAssemblyDraft({
    message: "Generate my schedule next week.",
    candidateSlots,
    tasks: [],
    goals: [
      {
        id: "goal-1",
        title: "Personal routines",
        priorityRank: 1,
        status: "active",
        focusAreas: [
          {
            id: "focus-1",
            title: "Meditate",
            status: "active",
            defaultDurationMinutes: null,
            cadence: null,
          },
        ],
      },
    ],
    schedulingContext: context,
    now: new Date(2026, 5, 24, 10, 0, 0),
  });

  assert.equal(draft.assignments.length, 3);
  assert.deepEqual(
    draft.assignments.map((assignment) => assignment.durationMinutes),
    [25, 25, 25],
  );
  assert.match(
    draft.assignments[0]?.rationale.join(" ") ?? "",
    /cautious starter pattern/u,
  );
});

test("buildSchedulingAssemblyDraft counts scheduled no-cadence focus blocks against trial pattern", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const candidateSlots = buildSchedulingCandidateSlots({
    message: "Generate my schedule next week.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const draft = buildSchedulingAssemblyDraft({
    message: "Generate my schedule next week.",
    candidateSlots,
    tasks: [],
    goals: [
      {
        id: "goal-1",
        title: "Personal routines",
        priorityRank: 1,
        status: "active",
        scheduleGuidance: {
          scheduledFocusBlocks: [
            {
              focusId: "focus-1",
              title: "Stretching",
              startTime: new Date(2026, 5, 28, 8, 0, 0).toISOString(),
              endTime: new Date(2026, 5, 28, 8, 30, 0).toISOString(),
            },
            {
              focusId: "focus-1",
              title: "Stretching",
              startTime: new Date(2026, 6, 1, 8, 0, 0).toISOString(),
              endTime: new Date(2026, 6, 1, 8, 30, 0).toISOString(),
            },
          ],
        },
        focusAreas: [
          {
            id: "focus-1",
            title: "Stretching",
            status: "active",
            defaultDurationMinutes: 30,
            cadence: null,
          },
        ],
      },
    ],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const focusDateKeys = draft.assignments.map((assignment) =>
    toLocalDateKey(assignment.startTime),
  );

  assert.equal(draft.assignments.length, 1);
  assert.deepEqual(focusDateKeys, ["2026-07-04"]);
});

test("buildSchedulingAssemblyDraft spreads weekly-count goal-focus blocks across available days", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const candidateSlots = buildSchedulingCandidateSlots({
    message: "Generate my schedule next week.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const draft = buildSchedulingAssemblyDraft({
    message: "Generate my schedule next week.",
    candidateSlots,
    tasks: [],
    goals: [
      {
        id: "goal-1",
        title: "Exam prep",
        priorityRank: 1,
        status: "active",
        focusAreas: [
          {
            id: "focus-1",
            title: "Practice problems",
            status: "active",
            defaultDurationMinutes: 45,
            cadence: "3x/week",
          },
        ],
      },
    ],
    now: new Date(2026, 5, 24, 10, 0, 0),
  });
  const focusDateKeys = draft.assignments.map((assignment) =>
    toLocalDateKey(assignment.startTime),
  );

  assert.equal(draft.assignments.length, 3);
  assert.equal(new Set(focusDateKeys).size, 3);
});

test("buildSchedulingAssemblyDraft caps non-urgent generated work per day", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const now = new Date(2026, 5, 24, 10, 0, 0);
  const candidateSlots = buildSchedulingCandidateSlots({
    message: "Generate my schedule tomorrow.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now,
  });
  const draft = buildSchedulingAssemblyDraft({
    message: "Generate my schedule tomorrow.",
    candidateSlots,
    tasks: [
      {
        id: "task-1",
        title: "Project outline",
        goalId: null,
        priorityRank: 1,
        estimatedMinutes: 60,
        dueAt: null,
        scheduleIntent: "schedule_now",
        calendarStatus: "needs_scheduling",
      },
      {
        id: "task-2",
        title: "Write draft",
        goalId: null,
        priorityRank: 2,
        estimatedMinutes: 60,
        dueAt: null,
        scheduleIntent: "schedule_now",
        calendarStatus: "needs_scheduling",
      },
      {
        id: "task-3",
        title: "Review notes",
        goalId: null,
        priorityRank: 3,
        estimatedMinutes: 60,
        dueAt: null,
        scheduleIntent: "schedule_now",
        calendarStatus: "needs_scheduling",
      },
      {
        id: "task-4",
        title: "Clean up backlog",
        goalId: null,
        priorityRank: 4,
        estimatedMinutes: 60,
        dueAt: null,
        scheduleIntent: "schedule_now",
        calendarStatus: "needs_scheduling",
      },
    ],
    goals: [],
    now,
  });

  assert.equal(draft.assignments.length, 3);
  assert.equal(draft.unscheduledItems[0]?.taskId, "task-4");
  assert.match(draft.unscheduledItems[0]?.reason ?? "", /daily load budget/u);
  assert.match(draft.assumptions.join(" "), /180 minutes per day/u);
});

test("buildSchedulingAssemblyDraft lowers daily load after crowded feedback", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const now = new Date(2026, 5, 24, 10, 0, 0);
  const candidateSlots = buildSchedulingCandidateSlots({
    message:
      "For schedule proposal proposal-1, please revise it based on this feedback: This is too crowded.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    horizonOverride: {
      startTime: new Date(2026, 5, 25, 0, 0, 0),
      endTime: new Date(2026, 5, 26, 0, 0, 0),
      source: "schedule proposal proposal-1 date range",
    },
    now,
  });
  const draft = buildSchedulingAssemblyDraft({
    message:
      "For schedule proposal proposal-1, please revise it based on this feedback: This is too crowded.",
    candidateSlots,
    tasks: [
      {
        id: "task-1",
        title: "Project outline",
        goalId: null,
        priorityRank: 1,
        estimatedMinutes: 60,
        dueAt: null,
        scheduleIntent: "schedule_now",
        calendarStatus: "needs_scheduling",
      },
      {
        id: "task-2",
        title: "Write draft",
        goalId: null,
        priorityRank: 2,
        estimatedMinutes: 60,
        dueAt: null,
        scheduleIntent: "schedule_now",
        calendarStatus: "needs_scheduling",
      },
      {
        id: "task-3",
        title: "Review notes",
        goalId: null,
        priorityRank: 3,
        estimatedMinutes: 60,
        dueAt: null,
        scheduleIntent: "schedule_now",
        calendarStatus: "needs_scheduling",
      },
    ],
    goals: [],
    now,
  });

  assert.equal(draft.assignments.length, 2);
  assert.equal(draft.unscheduledItems[0]?.taskId, "task-3");
  assert.match(draft.unscheduledItems[0]?.reason ?? "", /daily load budget/u);
  assert.match(draft.assumptions.join(" "), /120 minutes per day/u);
  assert.match(draft.assumptions.join(" "), /less crowded/u);
});

test("buildSchedulingAssemblyDraft adds larger buffers after spacing feedback", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const now = new Date(2026, 5, 24, 10, 0, 0);
  const candidateSlots = buildSchedulingCandidateSlots({
    message:
      "For schedule proposal proposal-1, please revise it based on this feedback: Give me more buffer between blocks.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    horizonOverride: {
      startTime: new Date(2026, 5, 25, 0, 0, 0),
      endTime: new Date(2026, 5, 26, 0, 0, 0),
      source: "schedule proposal proposal-1 date range",
    },
    now,
  });
  const draft = buildSchedulingAssemblyDraft({
    message:
      "For schedule proposal proposal-1, please revise it based on this feedback: Give me more buffer between blocks.",
    candidateSlots,
    tasks: [
      {
        id: "task-1",
        title: "Project outline",
        goalId: null,
        priorityRank: 1,
        estimatedMinutes: 30,
        dueAt: null,
        scheduleIntent: "schedule_now",
        calendarStatus: "needs_scheduling",
      },
      {
        id: "task-2",
        title: "Write draft",
        goalId: null,
        priorityRank: 2,
        estimatedMinutes: 30,
        dueAt: null,
        scheduleIntent: "schedule_now",
        calendarStatus: "needs_scheduling",
      },
    ],
    goals: [],
    now,
  });
  const firstEnd = new Date(draft.assignments[0]?.endTime ?? "");
  const secondStart = new Date(draft.assignments[1]?.startTime ?? "");
  const gapMinutes = (secondStart.getTime() - firstEnd.getTime()) / 60_000;

  assert.equal(gapMinutes, 20);
  assert.match(draft.assumptions.join(" "), /20 minutes of buffer/u);
});

test("buildSchedulingAssemblyDraft applies tentative learned lighter-buffer preferences", () => {
  const context = schedulingContext({
    tentativeDerivedPreferences: [
      "Prefer lighter schedule drafts: Prefer generated schedule drafts with more breathing room, larger buffers, and a lighter non-urgent daily load.",
    ],
  });
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const now = new Date(2026, 5, 24, 10, 0, 0);
  const candidateSlots = buildSchedulingCandidateSlots({
    message: "Generate my schedule tomorrow.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now,
  });
  const draft = buildSchedulingAssemblyDraft({
    message: "Generate my schedule tomorrow.",
    candidateSlots,
    tasks: [
      {
        id: "task-1",
        title: "Project outline",
        goalId: null,
        priorityRank: 1,
        estimatedMinutes: 60,
        dueAt: null,
        scheduleIntent: "schedule_now",
        calendarStatus: "needs_scheduling",
      },
      {
        id: "task-2",
        title: "Write draft",
        goalId: null,
        priorityRank: 2,
        estimatedMinutes: 60,
        dueAt: null,
        scheduleIntent: "schedule_now",
        calendarStatus: "needs_scheduling",
      },
      {
        id: "task-3",
        title: "Review notes",
        goalId: null,
        priorityRank: 3,
        estimatedMinutes: 60,
        dueAt: null,
        scheduleIntent: "schedule_now",
        calendarStatus: "needs_scheduling",
      },
    ],
    goals: [],
    schedulingContext: context,
    now,
  });
  const firstEnd = new Date(draft.assignments[0]?.endTime ?? "");
  const secondStart = new Date(draft.assignments[1]?.startTime ?? "");
  const gapMinutes = (secondStart.getTime() - firstEnd.getTime()) / 60_000;

  assert.equal(draft.assignments.length, 2);
  assert.equal(draft.unscheduledItems[0]?.taskId, "task-3");
  assert.equal(gapMinutes, 20);
  assert.match(draft.assumptions.join(" "), /Tentative learned feedback/u);
  assert.match(draft.assumptions.join(" "), /120 minutes per day/u);
  assert.match(draft.assumptions.join(" "), /20 minutes of buffer/u);
});

test("buildSchedulingAssemblyDraft applies learned activity timing preferences", () => {
  const context = schedulingContext({
    tentativeDerivedPreferences: [
      "Workout evening preference: Prefer scheduling Workout during the evening.",
    ],
  });
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const now = new Date(2026, 5, 24, 10, 0, 0);
  const candidateSlots = buildSchedulingCandidateSlots({
    message: "Generate my schedule tomorrow.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now,
  });
  const draft = buildSchedulingAssemblyDraft({
    message: "Generate my schedule tomorrow.",
    candidateSlots,
    tasks: [],
    goals: [
      {
        id: "goal-1",
        title: "Fitness",
        priorityRank: 1,
        status: "active",
        focusAreas: [
          {
            id: "focus-1",
            title: "Workout",
            status: "active",
            defaultDurationMinutes: 45,
            cadence: "weekly",
          },
        ],
      },
    ],
    schedulingContext: context,
    now,
  });
  const assignmentStart = new Date(draft.assignments[0]?.startTime ?? "");

  assert.equal(draft.assignments[0]?.focusId, "focus-1");
  assert.equal(draft.assignments[0]?.sourceSlotId.includes("evening"), true);
  assert.equal(assignmentStart.getHours(), 18);
  assert.match(
    draft.assignments[0]?.rationale.join(" ") ?? "",
    /Tentative learned feedback suggests scheduling Workout during the evening/u,
  );
});

test("buildSchedulingAssemblyDraft applies latest message activity timing preferences", () => {
  const context = schedulingContext();
  const candidateSlots = {
    horizon: {
      startTime: "2026-06-25T00:00:00.000Z",
      endTime: "2026-06-26T00:00:00.000Z",
      source: "test horizon",
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
          startTime: "2026-06-25T08:00:00.000Z",
          endTime: "2026-06-25T11:00:00.000Z",
          minutes: 180,
        },
        recommendedBlock: {
          startTime: "2026-06-25T08:00:00.000Z",
          endTime: "2026-06-25T08:30:00.000Z",
          durationMinutes: 30,
        },
        rationale: ["Morning slot comes first in the raw slot list."],
      },
      {
        id: "slot-afternoon",
        period: "afternoon",
        rank: 2,
        score: 80,
        availableWindow: {
          startTime: "2026-06-25T13:00:00.000Z",
          endTime: "2026-06-25T16:00:00.000Z",
          minutes: 180,
        },
        recommendedBlock: {
          startTime: "2026-06-25T13:00:00.000Z",
          endTime: "2026-06-25T13:30:00.000Z",
          durationMinutes: 30,
        },
        rationale: ["Afternoon slot should win only through the message preference."],
      },
    ],
  } satisfies SchedulingCandidateSlotContext;
  const draft = buildSchedulingAssemblyDraft({
    message: "Generate my schedule tomorrow. I prefer study in the afternoon.",
    candidateSlots,
    tasks: [],
    goals: [
      {
        id: "goal-1",
        title: "Certification",
        priorityRank: 1,
        status: "active",
        focusAreas: [
          {
            id: "focus-1",
            title: "Study",
            status: "active",
            defaultDurationMinutes: 45,
            cadence: "weekly",
          },
        ],
      },
    ],
    schedulingContext: context,
    now: new Date("2026-06-24T10:00:00.000Z"),
  });
  const assignmentStart = new Date(draft.assignments[0]?.startTime ?? "");

  assert.equal(draft.assignments[0]?.focusId, "focus-1");
  assert.equal(draft.assignments[0]?.sourceSlotId, "slot-afternoon");
  assert.equal(assignmentStart.getUTCHours(), 13);
  assert.match(
    draft.assignments[0]?.rationale.join(" ") ?? "",
    /Latest feedback suggests scheduling Study during the afternoon/u,
  );
});

test("buildSchedulingAssemblyDraft lets immediate deadlines exceed daily load cap", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const now = new Date(2026, 5, 24, 10, 0, 0);
  const dueAt = new Date(2026, 5, 25, 23, 0, 0).toISOString();
  const candidateSlots = buildSchedulingCandidateSlots({
    message: "Generate my schedule tomorrow.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now,
  });
  const draft = buildSchedulingAssemblyDraft({
    message: "Generate my schedule tomorrow.",
    candidateSlots,
    tasks: [
      {
        id: "task-1",
        title: "Deadline project one",
        goalId: null,
        priorityRank: 1,
        estimatedMinutes: 60,
        dueAt,
        scheduleIntent: "schedule_now",
        calendarStatus: "needs_scheduling",
      },
      {
        id: "task-2",
        title: "Deadline project two",
        goalId: null,
        priorityRank: 2,
        estimatedMinutes: 60,
        dueAt,
        scheduleIntent: "schedule_now",
        calendarStatus: "needs_scheduling",
      },
      {
        id: "task-3",
        title: "Deadline project three",
        goalId: null,
        priorityRank: 3,
        estimatedMinutes: 60,
        dueAt,
        scheduleIntent: "schedule_now",
        calendarStatus: "needs_scheduling",
      },
      {
        id: "task-4",
        title: "Deadline project four",
        goalId: null,
        priorityRank: 4,
        estimatedMinutes: 60,
        dueAt,
        scheduleIntent: "schedule_now",
        calendarStatus: "needs_scheduling",
      },
    ],
    goals: [],
    now,
  });

  assert.equal(draft.assignments.length, 4);
  assert.deepEqual(draft.unscheduledItems, []);
  assert.match(
    draft.assignments.at(-1)?.rationale.join(" ") ?? "",
    /Deadline pressure allows/u,
  );
});

test("buildSchedulingAssemblyDraft protects focus before near-term non-immediate deadlines", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const now = new Date(2026, 5, 24, 10, 0, 0);
  const candidateSlots = buildSchedulingCandidateSlots({
    message: "Generate my schedule tomorrow.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now,
  });
  const draft = buildSchedulingAssemblyDraft({
    message: "Generate my schedule tomorrow.",
    candidateSlots,
    tasks: [
      {
        id: "task-near-term",
        title: "Submit Friday form",
        goalId: null,
        priorityRank: 1,
        estimatedMinutes: 30,
        dueAt: new Date(2026, 5, 26, 9, 0, 0).toISOString(),
        scheduleIntent: "schedule_now",
        calendarStatus: "needs_scheduling",
      },
    ],
    goals: [
      {
        id: "goal-1",
        title: "Launch",
        priorityRank: 1,
        status: "active",
        focusAreas: [
          {
            id: "focus-1",
            title: "Deep work",
            status: "active",
            defaultDurationMinutes: 60,
            cadence: "weekly",
          },
        ],
      },
    ],
    now,
  });

  assert.equal(draft.assignments[0]?.itemType, "goal_focus");
  assert.equal(draft.assignments[1]?.taskId, "task-near-term");
});

test("buildSchedulingAssemblyDraft still protects immediate task deadlines", () => {
  const context = schedulingContext();
  const policy = buildSchedulingPlacementPolicy({ schedulingContext: context });
  const now = new Date(2026, 5, 24, 10, 0, 0);
  const candidateSlots = buildSchedulingCandidateSlots({
    message: "Generate my schedule tomorrow.",
    schedulingContext: context,
    placementPolicy: policy,
    calendarEvents: [],
    now,
  });
  const draft = buildSchedulingAssemblyDraft({
    message: "Generate my schedule tomorrow.",
    candidateSlots,
    tasks: [
      {
        id: "task-urgent",
        title: "Submit form",
        goalId: null,
        priorityRank: 5,
        estimatedMinutes: 30,
        dueAt: new Date(2026, 5, 25, 9, 0, 0).toISOString(),
        scheduleIntent: "schedule_now",
        calendarStatus: "needs_scheduling",
      },
    ],
    goals: [
      {
        id: "goal-1",
        title: "Launch",
        priorityRank: 1,
        status: "active",
        focusAreas: [
          {
            id: "focus-1",
            title: "Deep work",
            status: "active",
            defaultDurationMinutes: 60,
            cadence: "weekly",
          },
        ],
      },
    ],
    now,
  });

  assert.equal(draft.assignments[0]?.itemType, "task");
  assert.equal(draft.assignments[0]?.taskId, "task-urgent");
  assert.equal(draft.assignments[1]?.itemType, "goal_focus");
});

function toLocalDateKey(value: string) {
  const date = new Date(value);

  return [
    date.getFullYear(),
    (date.getMonth() + 1).toString().padStart(2, "0"),
    date.getDate().toString().padStart(2, "0"),
  ].join("-");
}
