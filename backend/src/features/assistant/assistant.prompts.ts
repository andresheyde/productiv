import type {
  AssistantAction,
  AssistantModelResponse,
  ScheduleReflectionModelResponse,
  ScheduleReflectionStrategySuggestion,
  WorkLogModelResponse,
} from "./assistant.types.ts";

export const ASSISTANT_TURN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "assistantMessage",
    "contextSummary",
    "navigationHint",
    "actions",
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
    "Ask only for the minimum missing information required to complete the user's intended action.",
    "For goal creation, gather a concrete outcome and at least one milestone, task, or tracking target; do not require barrier analysis before creating the first trackable version.",
    "For task creation, gather or infer the task title, due date or urgency when relevant, estimated duration when scheduling is requested, and the linked goal if it is clear.",
    "For scheduling, gather the task, duration, target day or window, and any hard constraints needed to generate a proposal.",
    "Treat barriers as later reflection data that can be collected after the user attempts to follow a plan or schedule.",
    "Only create or update goals, tasks, metrics, or scheduling when the user clearly asks for it or the intent is explicit.",
    "When enough information exists for an action, return the corresponding action instead of asking another planning-style question.",
    "Respect scheduling precedence in this order: explicit current user instruction, saved hard constraints, goal or task constraints, saved soft preferences, system scheduling guidance, then assistant heuristics.",
    "Never let generic best-practice scheduling guidance silently overrule a saved user preference.",
    "Metrics in this product are intentionally simple progress bars tied to goals.",
    "A metric should only be created when the user clearly defines something measurable like hours worked or questions completed.",
    "Do not invent numbers, dates, or schedule times.",
    "Use schedule_task only when the latest user message explicitly chooses the exact calendar slot.",
    "When the user wants help scheduling but has not explicitly chosen the exact slot, use propose_schedule_task instead of schedule_task.",
    "Use confirm_schedule_proposal only when the user is explicitly approving a pending schedule proposal.",
    "Use dismiss_schedule_proposal only when the user is explicitly rejecting a pending schedule proposal.",
    "If the user explicitly asks for a slot that conflicts with their saved preferences, keep the user's decision and mention the conflict in assistantMessage.",
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
    "Examples: hours worked, interview questions completed, pages read, reps completed.",
    "Do not guess amounts.",
    "If extraction is ambiguous, leave progressUpdates empty and ask a short follow-up inside assistantMessage.",
    "Use goalId and taskId only when the message clearly maps to an existing goal or task.",
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
  pendingScheduleProposals: unknown;
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
    "Pending schedule proposals that still need user confirmation:",
    JSON.stringify(input.pendingScheduleProposals, null, 2),
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
      "taskId",
      "metricId",
      "title",
      "definition",
      "notes",
      "description",
      "unitLabel",
      "targetValue",
      "currentValue",
      "dueAt",
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
          "confirm_schedule_proposal",
          "dismiss_schedule_proposal",
        ],
      },
      proposalId: nullableStringSchema(),
      goalId: nullableStringSchema(),
      taskId: nullableStringSchema(),
      metricId: nullableStringSchema(),
      title: nullableStringSchema(),
      definition: nullableStringSchema(),
      notes: nullableStringSchema(),
      description: nullableStringSchema(),
      unitLabel: nullableStringSchema(),
      targetValue: nullableNumberSchema(),
      currentValue: nullableNumberSchema(),
      dueAt: nullableStringSchema(),
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

    return {
      type: getRequiredActionType(record.type),
      proposalId: getNullableString(record.proposalId),
      goalId: getNullableString(record.goalId),
      taskId: getNullableString(record.taskId),
      metricId: getNullableString(record.metricId),
      title: getNullableString(record.title),
      definition: getNullableString(record.definition),
      notes: getNullableString(record.notes),
      description: getNullableString(record.description),
      unitLabel: getNullableString(record.unitLabel),
      targetValue: getNullableNumber(record.targetValue),
      currentValue: getNullableNumber(record.currentValue),
      dueAt: getNullableString(record.dueAt),
      estimatedMinutes: getNullableNumber(record.estimatedMinutes),
      priorityRank: getNullableNumber(record.priorityRank),
      status: getNullableString(record.status),
      scheduleIntent: getNullableString(record.scheduleIntent),
      startTime: getNullableString(record.startTime),
      endTime: getNullableString(record.endTime),
      isActive:
        typeof record.isActive === "boolean" ? record.isActive : null,
    };
  } catch {
    return null;
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

function nullableEnumSchema(values: string[]) {
  return {
    type: ["string", "null"],
    enum: [...values, null],
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
