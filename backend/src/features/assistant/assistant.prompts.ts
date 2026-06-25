import type {
  AssistantAction,
  AssistantModelResponse,
  ScheduleReflectionModelResponse,
  ScheduleReflectionStrategySuggestion,
  WorkLogModelResponse,
} from "./assistant.types.ts";
import {
  SCHEDULING_PREFERENCE_CANDIDATE_ARRAY_SCHEMA,
  SCHEDULING_PREFERENCE_EXTRACTION_GUIDANCE,
  normalizeSchedulingPreferenceCandidates,
} from "../scheduling-context/scheduling-preference-extraction.ts";
import { normalizeSchedulableFocusTitle } from "../../shared/ai/focus-area-title.ts";

export const ASSISTANT_TURN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "assistantMessage",
    "contextSummary",
    "navigationHint",
    "actions",
    "schedulingPreferenceCandidates",
  ],
  properties: {
    assistantMessage: { type: "string" },
    contextSummary: { type: "string" },
    navigationHint: nullableEnumSchema([
      "chat",
      "goals",
      "tasks",
      "metrics",
      "calendar",
    ]),
    actions: {
      type: "array",
      items: assistantActionSchema(),
    },
    schedulingPreferenceCandidates: SCHEDULING_PREFERENCE_CANDIDATE_ARRAY_SCHEMA,
  },
} as const satisfies Record<string, unknown>;

export const WORK_LOG_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "assistantMessage",
    "summary",
    "contextSummary",
    "navigationHint",
    "goalId",
    "taskId",
    "progressUpdates",
    "schedulingPreferenceCandidates",
  ],
  properties: {
    assistantMessage: { type: "string" },
    summary: { type: "string" },
    contextSummary: { type: "string" },
    navigationHint: nullableEnumSchema([
      "chat",
      "goals",
      "tasks",
      "metrics",
      "calendar",
    ]),
    goalId: nullableStringSchema(),
    taskId: nullableStringSchema(),
    progressUpdates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["metricId", "deltaValue", "note"],
        properties: {
          metricId: { type: "string" },
          deltaValue: { type: "number" },
          note: nullableStringSchema(),
        },
      },
    },
    schedulingPreferenceCandidates: SCHEDULING_PREFERENCE_CANDIDATE_ARRAY_SCHEMA,
  },
} as const satisfies Record<string, unknown>;

export const SCHEDULE_REFLECTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
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
  ],
  properties: {
    assistantMessage: { type: "string" },
    shouldSaveReflection: { type: "boolean" },
    summary: { type: "string" },
    contextSummary: { type: "string" },
    navigationHint: nullableEnumSchema([
      "chat",
      "goals",
      "tasks",
      "metrics",
      "calendar",
    ]),
    timeframeStart: nullableStringSchema(),
    timeframeEnd: nullableStringSchema(),
    liked: stringArraySchema(),
    disliked: stringArraySchema(),
    obstacles: stringArraySchema(),
    strategySuggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "detail", "strength", "confidence", "obstacle"],
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          strength: nullableEnumSchema(["hard_constraint", "soft_preference"]),
          confidence: nullableEnumSchema(["low", "medium", "high"]),
          obstacle: nullableStringSchema(),
        },
      },
    },
  },
} as const satisfies Record<string, unknown>;

export function createAssistantTurnInstructions() {
  return [
    "You are Productiv's chat-first workspace assistant.",
    "Keep responses concise, practical, and action-oriented.",
    "Identify the user's intent first: create or refine a goal, add a task, log work, schedule work, update progress, or answer a workspace question.",
    "Messages may contain multiple independent goals, tasks, habits, schedule feedback items, and calendar requests; handle each part and return every safe action instead of collapsing the turn to one intent.",
    "When only some parts are actionable, save or propose the actionable parts and ask only about the missing information that blocks the rest.",
    "Ask only for the minimum missing information required to complete the user's intended action.",
    "For goal creation, gather a concrete outcome and schedulable activities, repeated practices, workstreams, or focus areas needed to achieve it; these become the focus blocks that can later be scheduled.",
    "If the user gives only desired outcomes such as losing fat, visible abs, better stamina, higher grades, or improved performance, infer a conservative starter focus plan with concrete activities and invite feedback instead of asking the user to design the focus areas upfront.",
    "For outcome-only goals, use safe starter activities such as Strength training, Cardio, Study, Practice problems, Writing, Review notes, or Focused work; do not name the focus block after the outcome itself.",
    "When the user volunteers scheduling rules for those activities, capture whether one type of block should happen before another, earlier in the week, later in the week, earlier in the day, or after prerequisite work.",
    "Treat habits, routines, recurring practices, and repeated activities as schedulable goal focus areas with cadence and defaultDurationMinutes, not as one-off tasks.",
    "Treat common lifestyle or practice requests like 'I want to start meditating', 'I need to journal', 'start stretching', or 'read every morning' as habits even when the user does not say habit or routine.",
    "If a habit clearly belongs to an existing goal, update that goal's focusAreas; if it is a standalone life habit, create or reuse a lightweight active goal such as Personal routines and add the habit as a focus area.",
    "When a single message contains both a goal and an unrelated standalone life habit, keep them separate: attach goal-specific routines to the goal and put the unrelated habit under Personal routines.",
    "When a user asks to schedule a habit or recurring activity, use propose_schedule_goal_focus. Do not create_task for recurring habits unless the user explicitly describes a one-session deliverable.",
    "For underspecified habits, assume a cautious trial block instead of making the user design the schedule: use the saved preferred focus block length when available, otherwise the focus area's defaultDurationMinutes, otherwise 30 minutes; use saved preferred work periods when available, otherwise prefer earlier-day slots for important routines.",
    "Phrases like 'read every morning', 'stretch every evening', or 'journal each night' imply daily cadence plus an activity-level preferred work period; capture both instead of asking what time the habit should happen.",
    "If a habit has no cadence, infer a small trial cadence from the latest request: daily means every day, weekday means Monday through Friday, otherwise propose one to three blocks in the requested horizon and invite feedback.",
    "Do not turn outcomes into focus block names. Use concrete activities like Workout, Strength training, Study, Practice problems, Writing, or Apartment cleaning.",
    "Do not require barrier analysis before creating the first trackable version.",
    "Do not auto-create tasks from goals. Goals may have focus areas/current work; tasks are explicit user-defined to-dos that can be completed in one session.",
    "For task creation, gather or infer the task title, due date or urgency when relevant, estimated duration when scheduling is requested, and the linked goal if it is clear.",
    "If the user explicitly says task, to-do, reminder, or errand, keep that item as a task even when its title contains words like daily, weekly, recurring, or repeat; store the repeated pattern in recurrence and preserve the user's source wording there.",
    "For scheduling, decide whether the user is scheduling a task/to-do or a goal focus block. Goal work should use goal-focus scheduling instead of creating a task.",
    "When generating a schedule for a day or week, include active tasks that need calendar time, expand recurring tasks into separate proposed blocks inside the requested horizon, and use the deterministic scheduling placement policy to decide ordering against goal-focus blocks.",
    "Productiv's job is to do the scheduling thinking for the user: for generated schedules, choose a reasonable default placement instead of making the user decide among viable slots.",
    "Protect important goal-focus and habit blocks earlier than flexible or merely urgent work unless an immediate deadline explicitly overrides that ordering.",
    "Use the deterministic scheduling placement policy in the input when choosing among viable candidate slots; it provides Productiv's default ordering when the user has not specified exact times.",
    "When deterministic scheduling candidate slots are present, prefer their recommendedBlock startTime/endTime for generated proposals that fit those slots.",
    "If candidate slots are present but no slot can fit the user's requested work, say what constraint blocks the schedule and ask for the smallest useful feedback.",
    "When a deterministic schedule assembly draft is present, use its assignments as the default non-overlapping proposal plan for matching tasks and goal-focus blocks.",
    "Each schedule assembly assignment includes actionTypeHint, ids, occurrenceKey for task occurrences, startTime, and endTime; use those exact fields when emitting matching propose_schedule_task or propose_schedule_goal_focus actions.",
    "Treat schedule-generation requests like 'generate my schedule for next week' as a request to propose exact candidate calendar blocks inside that date range.",
    "A scheduling horizon such as today, tomorrow, this week, next week, this weekend, or a date range defines where proposed blocks may be placed; it is not itself the startTime/endTime for one all-day block.",
    "When resolving relative week phrases, use the user's saved week-boundary preference from scheduling context when one exists; otherwise default to Sunday-through-Saturday.",
    "Explicit date ranges in the latest user message override both the default week boundary and saved week-boundary preferences. Examples: 'from tomorrow to next week', 'from tomorrow till Tuesday', and 'between Monday and Thursday' define the scheduling horizon for that request.",
    "When a message contains both a relative week phrase and an explicit range start or end, honor the explicit range endpoint first, then use the relevant week-boundary preference only to resolve the remaining relative endpoint if needed.",
    "For generated schedule proposals, choose candidate startTime and endTime values within the requested horizon using task due dates, estimates, saved scheduling context, and schedule-relevant calendar events. These candidate times are drafts until the user confirms.",
    "Use the task scheduling context to decide which tasks need to be added: schedule tasks marked needs_scheduling, preserve tasks marked pending_proposal, do not duplicate tasks marked scheduled, and only schedule tasks marked not_requested when the latest user message explicitly asks to schedule the task list, backlog, errands, todos, or everything.",
    "If the user gives a fixed task with a specific time window, create/update the task and include a task scheduling action for that exact window so it reaches the calendar after confirmation.",
    "For goal-focus scheduling, gather the goal, focus/current work when available, duration, and any hard constraints needed to generate a proposal; the target day or window can come from the requested horizon, deterministic slots, saved scheduling context, or schedule-relevant calendar context, so do not require the user to pick one before drafting.",
    "For recurring or repeated focus blocks, propose one separate calendar event per block with its own exact startTime and endTime. Never represent daily 30-minute blocks as one multi-day event.",
    "When the user gives a duration plus a date range or recurring cadence, expand it into individual proposed blocks that match the duration.",
    "Treat barriers as later reflection data that can be collected after the user attempts to follow a plan or schedule.",
    "Only create or update goals, tasks, metrics, or scheduling when the user clearly asks for it or the intent is explicit.",
    "Only create_task when the user explicitly asks to add a task, to-do, reminder, or clearly describes a one-session deliverable they want saved as a task.",
    "In a multi-part schedule dump, one-session deliverable clauses like 'review investor notes tomorrow for 45 minutes', 'email Maya by Friday', or 'submit the report next week' should become tasks even if the user does not literally say task.",
    "Distinguish task tracking from calendar placement: if the user asks to note, remember, keep track of, or save a task so it can be scheduled later, create/update the task with dueAt, estimatedMinutes, and scheduleIntent 'schedule_now' when available, but do not emit a scheduling action.",
    "A due date, deadline, date range, or broad scheduling window is not an exact calendar slot. Direct scheduling and schedule proposals both require exact startTime and endTime values for each block.",
    "Use schedule_task only when the user explicitly asks to add/block/place a task directly on the calendar and the latest user message chooses the exact calendar slot.",
    "When the user wants a generated schedule or suggested calendar plan, use propose_schedule_task or propose_schedule_goal_focus only for blocks with exact startTime and endTime values.",
    "Do not ask questions like 'what time do you want?' or 'what day should this happen?' just because the user omitted a preference; if deterministic candidate slots, a schedule assembly draft, a requested horizon, or saved scheduling context can produce a reasonable draft, choose the best slots yourself and invite feedback.",
    "If the user wants scheduling help but the current context still lacks a schedulable item, duration, usable horizon, and deterministic candidate slots, ask the smallest clarifying question instead of emitting an incomplete scheduling proposal.",
    "When a generated schedule could fit multiple ways, internally sketch two or three candidate schedules, rank them by hard conflicts, due dates, user preferences, goal-specific sequencing rules, context switching, buffers, and realistic daily load, then return only the best proposal.",
    "Calendar event titles must be short activity names, usually one to four words. Put cadence, duration, rationale, and constraints in description instead of title.",
    "When updating a task by name, include the existing taskId from context whenever possible; if the id is not available, include the exact existing task title so the backend can match it.",
    "When enough information exists for an action, return the corresponding action instead of asking another planning-style question.",
    "Respect scheduling precedence in this order: explicit current user instruction, saved hard constraints, goal or task constraints, saved soft preferences, system scheduling guidance, then assistant heuristics.",
    "Never let generic best-practice scheduling guidance silently overrule a saved user preference.",
    "Treat availability, work hours, sleep windows, classes, commuting, unavailable periods, and timing preferences as scheduling context; extract durable items through schedulingPreferenceCandidates when appropriate, but do not create goals, tasks, habits, focus areas, or schedule blocks for those context-only statements unless the user explicitly asks to track or schedule that item as work.",
    "Metrics in this product are intentionally simple progress bars tied to goals.",
    "A metric should only be created when the user clearly defines something measurable like hours worked or questions completed.",
    "When creating or updating a goal, the backend automatically creates a default hours metric and measurable success-criteria metrics; do not emit duplicate create_metric actions for those same fields.",
    "Do not invent task estimates, due dates, metric targets, or direct calendar times. For generated schedule proposals only, choose reasonable candidate times from the requested horizon and available context.",
    "Resolve relative date language from the Current timestamp. Treat 'next week' using the saved week-boundary preference when present; otherwise use the next Sunday-through-Saturday calendar week unless the user gives a different boundary.",
    "Use schedule-relevant calendar events to infer travel, trips, and unavailable days before asking the user to restate them.",
    "If relevant events are present in schedule context, do not claim that no current schedule events exist.",
    "When the user wants help scheduling and you can choose exact candidate slots from the available context, use propose_schedule_task instead of schedule_task.",
    "Use schedule_goal_focus only when the latest user message explicitly chooses the exact calendar slot for ongoing goal work.",
    "When the user wants help scheduling goal work and you can choose exact candidate slots from the available context, use propose_schedule_goal_focus instead of propose_schedule_task.",
    "Use confirm_schedule_proposal only when the user is explicitly approving a pending schedule proposal.",
    "If the user asks a question about a pending proposal or gives corrective feedback, answer or revise it instead of confirming it.",
    "When proposal feedback says the draft is too crowded, too packed, overwhelming, or too much, revise toward fewer non-urgent generated blocks rather than asking the user to choose exact removals.",
    "When proposal feedback asks for buffers, breaks, breathing room, gaps, or more space, revise toward larger gaps between generated blocks.",
    "Use dismiss_schedule_proposal only when the user is explicitly rejecting a pending schedule proposal.",
    "When confirming or dismissing a proposal, copy the exact proposalId from the user's latest message when one is present; do not substitute a different pending proposal.",
    "If the user explicitly asks for a slot that conflicts with their saved preferences, keep the user's decision and mention the conflict in assistantMessage.",
    SCHEDULING_PREFERENCE_EXTRACTION_GUIDANCE,
    "Use goalId, taskId, and metricId from the provided context whenever you are referring to existing records.",
    "If a field is not needed for an action, return null for it.",
    "Prefer updating existing records over duplicating them.",
    "Never say a record was created, updated, scheduled, finalized, or saved unless the matching action is included in this response.",
    "Keep assistantMessage natural and helpful, and summarize what changed.",
    "Return valid JSON that exactly matches the schema.",
  ].join(" ");
}

export function createWorkLogInstructions() {
  return [
    "You are Productiv's work-log extraction assistant.",
    "The user is logging work in natural language.",
    "Always save a concise summary of what they did.",
    "Only extract metric progress when the message clearly states a numeric amount that maps to one of the existing metrics.",
    "Map clear time-spent phrases like 'worked 2 hours' or 'spent 30 minutes' to the goal's hours metric when the goal context matches, or when there is only one plausible active goal.",
    "Examples: hours worked, interview questions completed, pages read, reps completed.",
    "Do not guess amounts.",
    "If extraction is ambiguous, leave progressUpdates empty and ask a short follow-up inside assistantMessage.",
    "Use goalId and taskId only when the message clearly maps to an existing goal or task.",
    SCHEDULING_PREFERENCE_EXTRACTION_GUIDANCE,
    "Return valid JSON that exactly matches the schema.",
  ].join(" ");
}

export function createScheduleReflectionInstructions() {
  return [
    "You are Productiv's schedule reflection assistant.",
    "The user is reflecting on a current or previous schedule after trying to follow it.",
    "Your job is to capture what worked, what did not work, obstacles that interfered, and practical ICS-style strategies for the next schedule iteration.",
    "ICS-style strategies should be concrete implementation intentions, friction reducers, environment changes, fallback plans, smaller blocks, buffers, or constraint/preference suggestions.",
    "Do not turn every obstacle into a permanent constraint; suggest changes the user can accept, reject, or refine.",
    "If the latest message lacks actual reflection details, set shouldSaveReflection to false and ask for what they liked, disliked, and what got in the way.",
    "If the message includes usable reflection details, set shouldSaveReflection to true.",
    "Keep strategySuggestions focused: usually one to three suggestions.",
    "Do not invent dates. If the user names a timeframe, return ISO date strings when possible; otherwise return null for timeframeStart and timeframeEnd.",
    "Return valid JSON that exactly matches the schema.",
  ].join(" ");
}

export function buildAssistantTurnInput(input: {
  message: string;
  goals: unknown;
  tasks: unknown;
  metrics: unknown;
  workLogs: unknown;
  messages: unknown;
  schedulingContext: unknown;
  schedulingPlacementPolicy: unknown;
  schedulingCandidateSlots: unknown;
  schedulingAssemblyDraft: unknown;
  pendingScheduleProposals: unknown;
  recentAppliedScheduleProposals: unknown;
  taskSchedulingContext: unknown;
  scheduleRelevantCalendarEvents: unknown;
  calendarContextNote: string | null;
}) {
  return [
    `Current timestamp: ${new Date().toISOString()}`,
    "Latest user message:",
    input.message,
    "",
    "Recent conversation:",
    JSON.stringify(input.messages, null, 2),
    "",
    "Current goals:",
    JSON.stringify(input.goals, null, 2),
    "",
    "Current tasks:",
    JSON.stringify(input.tasks, null, 2),
    "",
    "Current metrics:",
    JSON.stringify(input.metrics, null, 2),
    "",
    "Recent work logs:",
    JSON.stringify(input.workLogs, null, 2),
    "",
    "Saved personal scheduling context:",
    JSON.stringify(input.schedulingContext, null, 2),
    "",
    "Deterministic scheduling placement policy to use when choosing candidate schedule blocks:",
    JSON.stringify(input.schedulingPlacementPolicy, null, 2),
    "",
    "Deterministic scheduling candidate slots. Use recommendedBlock.startTime and recommendedBlock.endTime when a proposed item fits:",
    JSON.stringify(input.schedulingCandidateSlots, null, 2),
    "",
    "Deterministic schedule assembly draft for matching existing tasks and goal-focus blocks:",
    JSON.stringify(input.schedulingAssemblyDraft, null, 2),
    "",
    "Pending schedule proposals that still need user confirmation:",
    JSON.stringify(input.pendingScheduleProposals, null, 2),
    "",
    "Recent applied schedule proposals that may be used for schedule-change feedback:",
    JSON.stringify(input.recentAppliedScheduleProposals, null, 2),
    "",
    "Task scheduling context, comparing current tasks against pending proposals and included calendar events:",
    JSON.stringify(input.taskSchedulingContext, null, 2),
    "",
    "Schedule-relevant calendar events from included account calendars:",
    JSON.stringify(input.scheduleRelevantCalendarEvents, null, 2),
    "",
    "Calendar context note:",
    input.calendarContextNote ?? "Events are limited to calendars the user has included for Productiv.",
  ].join("\n");
}

export function buildScheduleReflectionInput(input: {
  message: string;
  goals: unknown;
  tasks: unknown;
  metrics: unknown;
  workLogs: unknown;
  messages: unknown;
  schedulingContext: unknown;
}) {
  return [
    `Current timestamp: ${new Date().toISOString()}`,
    "Latest schedule reflection message:",
    input.message,
    "",
    "Recent conversation:",
    JSON.stringify(input.messages, null, 2),
    "",
    "Current goals:",
    JSON.stringify(input.goals, null, 2),
    "",
    "Current tasks and schedule-relevant state:",
    JSON.stringify(input.tasks, null, 2),
    "",
    "Current metrics:",
    JSON.stringify(input.metrics, null, 2),
    "",
    "Recent work logs:",
    JSON.stringify(input.workLogs, null, 2),
    "",
    "Saved personal scheduling context:",
    JSON.stringify(input.schedulingContext, null, 2),
  ].join("\n");
}

export function buildWorkLogInput(input: {
  message: string;
  metrics: unknown;
  goals: unknown;
  tasks: unknown;
}) {
  return [
    `Current timestamp: ${new Date().toISOString()}`,
    "Work log message:",
    input.message,
    "",
    "Goals:",
    JSON.stringify(input.goals, null, 2),
    "",
    "Tasks:",
    JSON.stringify(input.tasks, null, 2),
    "",
    "Metrics:",
    JSON.stringify(input.metrics, null, 2),
  ].join("\n");
}

export function normalizeAssistantModelResponse(
  value: unknown,
): AssistantModelResponse {
  const record = asRecord(value);

  return {
    assistantMessage: getRequiredString(record.assistantMessage),
    contextSummary: getRequiredString(record.contextSummary),
    navigationHint: getNavigationHint(record.navigationHint),
    actions: Array.isArray(record.actions)
      ? record.actions.map(normalizeAction).filter((action) => action !== null)
      : [],
    schedulingPreferenceCandidates: normalizeSchedulingPreferenceCandidates(
      record.schedulingPreferenceCandidates,
    ),
  };
}

export function normalizeWorkLogModelResponse(value: unknown): WorkLogModelResponse {
  const record = asRecord(value);

  return {
    assistantMessage: getRequiredString(record.assistantMessage),
    summary: getRequiredString(record.summary),
    contextSummary: getRequiredString(record.contextSummary),
    navigationHint: getNavigationHint(record.navigationHint),
    goalId: getNullableString(record.goalId),
    taskId: getNullableString(record.taskId),
    progressUpdates: Array.isArray(record.progressUpdates)
      ? record.progressUpdates.flatMap((item) => {
          try {
            const parsed = asRecord(item);
            const metricId = getRequiredString(parsed.metricId);
            const deltaValue = getRequiredNumber(parsed.deltaValue);

            return [
              {
                metricId,
                deltaValue,
                note: getNullableString(parsed.note),
              },
            ];
          } catch {
            return [];
          }
        })
      : [],
    schedulingPreferenceCandidates: normalizeSchedulingPreferenceCandidates(
      record.schedulingPreferenceCandidates,
    ),
  };
}

export function normalizeScheduleReflectionModelResponse(
  value: unknown,
): ScheduleReflectionModelResponse {
  const record = asRecord(value);

  return {
    assistantMessage: getRequiredString(record.assistantMessage),
    shouldSaveReflection: record.shouldSaveReflection === true,
    summary: getNullableString(record.summary) ?? "",
    contextSummary: getRequiredString(record.contextSummary),
    navigationHint: getNavigationHint(record.navigationHint),
    timeframeStart: getNullableString(record.timeframeStart),
    timeframeEnd: getNullableString(record.timeframeEnd),
    liked: getStringArray(record.liked),
    disliked: getStringArray(record.disliked),
    obstacles: getStringArray(record.obstacles),
    strategySuggestions: Array.isArray(record.strategySuggestions)
      ? record.strategySuggestions.flatMap(normalizeReflectionStrategySuggestion)
      : [],
  };
}

function assistantActionSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "type",
      "proposalId",
      "goalId",
      "focusId",
      "taskId",
      "occurrenceKey",
      "metricId",
      "title",
      "definition",
      "successCriteria",
      "focusAreas",
      "scheduleGuidance",
      "constraints",
      "notes",
      "description",
      "unitLabel",
      "targetValue",
      "currentValue",
      "dueAt",
      "recurrence",
      "estimatedMinutes",
      "priorityRank",
      "status",
      "scheduleIntent",
      "startTime",
      "endTime",
      "isActive",
    ],
    properties: {
      type: {
        type: "string",
        enum: [
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
        ],
      },
      proposalId: nullableStringSchema(),
      goalId: nullableStringSchema(),
      focusId: nullableStringSchema(),
      taskId: nullableStringSchema(),
      occurrenceKey: nullableStringSchema(),
      metricId: nullableStringSchema(),
      title: nullableStringSchema(),
      definition: nullableStringSchema(),
      successCriteria: stringArraySchema(),
      focusAreas: goalFocusAreaArraySchema(),
      scheduleGuidance: nullableScheduleGuidanceSchema(),
      constraints: stringArraySchema(),
      notes: nullableStringSchema(),
      description: nullableStringSchema(),
      unitLabel: nullableStringSchema(),
      targetValue: nullableNumberSchema(),
      currentValue: nullableNumberSchema(),
      dueAt: nullableStringSchema(),
      recurrence: nullableTaskRecurrenceSchema(),
      estimatedMinutes: nullableNumberSchema(),
      priorityRank: nullableNumberSchema(),
      status: nullableEnumSchema([
        "active",
        "paused",
        "completed",
        "archived",
        "inbox",
        "planned",
        "scheduled",
        "done",
        "canceled",
      ]),
      scheduleIntent: nullableEnumSchema([
        "unscheduled",
        "schedule_now",
        "someday",
      ]),
      startTime: nullableStringSchema(),
      endTime: nullableStringSchema(),
      isActive: {
        type: ["boolean", "null"],
      },
    },
  };
}

function normalizeAction(value: unknown): AssistantAction | null {
  try {
    const record = asRecord(value);

    const action: AssistantAction = {
      type: getRequiredActionType(record.type),
      proposalId: getNullableString(record.proposalId),
      goalId: getNullableString(record.goalId),
      focusId: getNullableString(record.focusId),
      taskId: getNullableString(record.taskId),
      occurrenceKey: getNullableString(record.occurrenceKey),
      metricId: getNullableString(record.metricId),
      title: getNullableString(record.title),
      definition: getNullableString(record.definition),
      successCriteria: getStringArray(record.successCriteria),
      focusAreas: getGoalFocusAreas(record.focusAreas),
      scheduleGuidance: getNullableRecord(record.scheduleGuidance),
      constraints: getStringArray(record.constraints),
      notes: getNullableString(record.notes),
      description: getNullableString(record.description),
      unitLabel: getNullableString(record.unitLabel),
      targetValue: getNullableNumber(record.targetValue),
      currentValue: getNullableNumber(record.currentValue),
      dueAt: getNullableString(record.dueAt),
      recurrence: getNullableTaskRecurrence(record.recurrence),
      estimatedMinutes: getNullableNumber(record.estimatedMinutes),
      priorityRank: getNullableNumber(record.priorityRank),
      status: getNullableString(record.status),
      scheduleIntent: getNullableString(record.scheduleIntent),
      startTime: getNullableString(record.startTime),
      endTime: getNullableString(record.endTime),
      isActive:
        typeof record.isActive === "boolean" ? record.isActive : null,
    };

    return isSchedulingContextOnlyAction(action) ? null : action;
  } catch {
    return null;
  }
}

function isSchedulingContextOnlyAction(action: AssistantAction) {
  switch (action.type) {
    case "create_goal":
    case "update_goal":
    case "create_task":
    case "update_task":
    case "schedule_task":
    case "propose_schedule_task":
    case "schedule_goal_focus":
    case "propose_schedule_goal_focus":
      return isSchedulingContextOnlyText(action.title);
    default:
      return false;
  }
}

function getRequiredActionType(value: unknown): AssistantAction["type"] {
  if (
    value === "create_goal" ||
    value === "update_goal" ||
    value === "create_task" ||
    value === "update_task" ||
    value === "create_metric" ||
    value === "update_metric" ||
    value === "schedule_task" ||
    value === "propose_schedule_task" ||
    value === "schedule_goal_focus" ||
    value === "propose_schedule_goal_focus" ||
    value === "confirm_schedule_proposal" ||
    value === "dismiss_schedule_proposal"
  ) {
    return value;
  }

  throw new Error("Unexpected assistant action type.");
}

function getNavigationHint(value: unknown): AssistantModelResponse["navigationHint"] {
  return value === "chat" ||
    value === "goals" ||
    value === "tasks" ||
    value === "metrics" ||
    value === "calendar"
    ? value
    : null;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected an object.");
  }

  return value as Record<string, unknown>;
}

function getRequiredString(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Expected a non-empty string.");
  }

  return value.trim();
}

function getNullableString(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getRequiredNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Expected a finite number.");
  }

  return value;
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : [];
}

function getGoalFocusAreas(value: unknown): AssistantAction["focusAreas"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const record = item as Record<string, unknown>;
    const rawTitle = getNullableString(record.title);

    if (!rawTitle) {
      return [];
    }

    if (isSchedulingContextOnlyText(rawTitle)) {
      return [];
    }

    const title = normalizeSchedulableFocusTitle(rawTitle);
    const defaultDurationMinutes =
      typeof record.defaultDurationMinutes === "number" &&
      Number.isFinite(record.defaultDurationMinutes) &&
      record.defaultDurationMinutes > 0
        ? Math.round(record.defaultDurationMinutes)
        : null;

    return [
      {
        id: getNullableString(record.id) ?? createStableFocusId(title),
        title,
        description: getNullableString(record.description) ?? "",
        status:
          record.status === "paused" || record.status === "completed"
            ? record.status
            : "active",
        defaultDurationMinutes,
        cadence: getNullableString(record.cadence),
      },
    ];
  });
}

function isSchedulingContextOnlyText(value: string | null) {
  if (!value) {
    return false;
  }

  const normalized = value.toLowerCase();

  return (
    hasAvailabilityContextCue(normalized) ||
    hasSchedulingPreferenceContextCue(normalized)
  );
}

function hasAvailabilityContextCue(value: string) {
  return (
    /\b(?:work\s+hours|working\s+hours|office\s+hours|i\s+work|my\s+work|work\s+weekdays?|work\s+weekends?|sleep|bedtime|bed time|class|lecture|lab|meeting|appointment|therapy|commute|school|college|unavailable|busy|not\s+free|not\s+available)\b/iu.test(
      value,
    ) && /\b(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?|mornings?|afternoons?|evenings?|weekdays?|weekends?|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/iu.test(
      value,
    )
  );
}

function hasSchedulingPreferenceContextCue(value: string) {
  return /\b(?:prefer|preferred|best|avoid|don'?t|do not|keep|save|use)\b.*\b(?:mornings?|afternoons?|evenings?|night|before lunch|after lunch|after work|before work)\b/iu.test(
    value,
  );
}

function getNullableRecord(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getNullableTaskRecurrence(value: unknown): AssistantAction["recurrence"] {
  if (value === null || value === undefined) {
    return null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const frequency =
    record.frequency === "daily" ||
    record.frequency === "weekly" ||
    record.frequency === "monthly" ||
    record.frequency === "custom"
      ? record.frequency
      : null;

  if (!frequency) {
    return null;
  }

  const interval =
    typeof record.interval === "number" &&
    Number.isFinite(record.interval) &&
    record.interval > 0
      ? Math.max(1, Math.round(record.interval))
      : 1;
  const daysOfWeek = Array.isArray(record.daysOfWeek)
    ? [
        ...new Set(
          record.daysOfWeek
            .filter((day): day is number => Number.isInteger(day))
            .map((day) => Math.trunc(day))
            .filter((day) => day >= 0 && day <= 6),
        ),
      ].sort((left, right) => left - right)
    : [];
  const endsAt = getNullableString(record.endsAt);

  return {
    frequency,
    interval,
    daysOfWeek,
    endsAt,
    sourceText: getNullableString(record.sourceText),
    scheduledOccurrences: getTaskScheduledOccurrences(record.scheduledOccurrences),
  };
}

function getTaskScheduledOccurrences(
  value: unknown,
): NonNullable<AssistantAction["recurrence"]>["scheduledOccurrences"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const record = item as Record<string, unknown>;
    const startTime = getNullableString(record.startTime);
    const endTime = getNullableString(record.endTime);
    const dateKey = getNullableString(record.dateKey);

    if (!dateKey || !startTime || !endTime) {
      return [];
    }

    return [
      {
        dateKey,
        startTime,
        endTime,
        calendarEventId: getNullableString(record.calendarEventId),
        sourceProposalId: getNullableString(record.sourceProposalId),
      },
    ];
  });
}

function normalizeReflectionStrategySuggestion(
  value: unknown,
): ScheduleReflectionStrategySuggestion[] {
  try {
    const record = asRecord(value);
    const title = getRequiredString(record.title);
    const detail = getRequiredString(record.detail);
    const strength =
      record.strength === "hard_constraint" ||
      record.strength === "soft_preference"
        ? record.strength
        : "soft_preference";
    const confidence =
      record.confidence === "low" ||
      record.confidence === "medium" ||
      record.confidence === "high"
        ? record.confidence
        : "low";

    return [
      {
        title,
        detail,
        strength,
        confidence,
        obstacle: getNullableString(record.obstacle),
      },
    ];
  } catch {
    return [];
  }
}

function getNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableStringSchema() {
  return {
    type: ["string", "null"],
  };
}

function nullableNumberSchema() {
  return {
    type: ["number", "null"],
  };
}

function nullableTaskRecurrenceSchema() {
  return {
    type: ["object", "null"],
    additionalProperties: false,
    required: ["frequency", "interval", "daysOfWeek", "endsAt", "sourceText"],
    properties: {
      frequency: {
        type: "string",
        enum: ["daily", "weekly", "monthly", "custom"],
      },
      interval: nullableNumberSchema(),
      daysOfWeek: {
        type: "array",
        items: {
          type: "number",
        },
      },
      endsAt: nullableStringSchema(),
      sourceText: nullableStringSchema(),
    },
  };
}

function nullableEnumSchema(values: string[]) {
  return {
    type: ["string", "null"],
    enum: [...values, null],
  };
}

function nullableScheduleGuidanceSchema() {
  return {
    type: ["object", "null"],
    additionalProperties: false,
    required: [
      "timeAvailability",
      "timeProtectionPlan",
      "limitingHabits",
      "scriptedActions",
      "environmentalOptimizations",
    ],
    properties: {
      timeAvailability: nullableStringSchema(),
      timeProtectionPlan: stringArraySchema(),
      limitingHabits: stringArraySchema(),
      scriptedActions: stringArraySchema(),
      environmentalOptimizations: stringArraySchema(),
    },
  };
}

function stringArraySchema() {
  return {
    type: "array",
    items: {
      type: "string",
    },
  };
}

function goalFocusAreaArraySchema() {
  return {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "title",
        "description",
        "status",
        "defaultDurationMinutes",
        "cadence",
      ],
      properties: {
        id: nullableStringSchema(),
        title: { type: "string" },
        description: nullableStringSchema(),
        status: nullableEnumSchema(["active", "paused", "completed"]),
        defaultDurationMinutes: nullableNumberSchema(),
        cadence: nullableStringSchema(),
      },
    },
  };
}

function createStableFocusId(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}
