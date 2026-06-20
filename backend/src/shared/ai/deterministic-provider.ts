import type {
  StructuredAiProvider,
  StructuredJsonGenerationInput,
} from "./ai-provider.ts";

type ParsedRecord = Record<string, unknown>;
type DeterministicAction = {
  type: string;
  proposalId: string | null;
  goalId: string | null;
  focusId: string | null;
  taskId: string | null;
  metricId: string | null;
  title: string | null;
  definition: string | null;
  successCriteria: string[];
  focusAreas: unknown[];
  scheduleGuidance: Record<string, unknown> | null;
  constraints: string[];
  notes: string | null;
  description: string | null;
  unitLabel: string | null;
  targetValue: number | null;
  currentValue: number | null;
  dueAt: string | null;
  estimatedMinutes: number | null;
  priorityRank: number | null;
  status: string | null;
  scheduleIntent: string | null;
  startTime: string | null;
  endTime: string | null;
  isActive: boolean | null;
};

const confidenceFlags = {
  direction: "high",
  mediumTermGoal: "high",
  thirtyDayPerformanceGoals: "high",
  fourteenDayPerformanceGoals: "high",
  timeAvailability: "medium",
  timeProtectionPlan: "medium",
  limitingHabits: null,
  scriptedActions: null,
  environmentalOptimizations: null,
  constraints: null,
} as const;

export class DeterministicAiProvider implements StructuredAiProvider {
  async generateJson<T>(input: StructuredJsonGenerationInput): Promise<T> {
    switch (input.schemaName) {
      case "planning_turn_response":
        return buildPlanningTurnResponse(input.input) as T;
      case "generated_plan":
        return buildGeneratedPlan(input.input) as T;
      case "assistant_turn":
        return buildAssistantTurnResponse(input.input) as T;
      case "work_log_turn":
        return buildWorkLogTurnResponse(input.input) as T;
      case "schedule_reflection":
        return buildScheduleReflectionResponse(input.input) as T;
      default:
        throw new Error(
          `Deterministic AI provider does not support schema: ${input.schemaName}`,
        );
    }
  }
}

function buildPlanningTurnResponse(input: string) {
  const message = extractLatestTranscriptMessage(input);
  const goal = titleFromMessage(message, "Local test goal");

  return {
    assistantMessage: "I have enough to create a local test plan.",
    draftPlanningState: {
      direction: [goal],
      mediumTermGoal: goal,
      thirtyDayPerformanceGoals: [`Make measurable progress on ${goal}`],
      fourteenDayPerformanceGoals: [`Complete the first useful step for ${goal}`],
      timeAvailability: "Local testing availability",
      timeProtectionPlan: ["Use a small protected local test block"],
      limitingHabits: [],
      scriptedActions: [],
      environmentalOptimizations: [],
      constraints: [],
      confidenceFlags,
      missingFields: [],
      nextBestQuestion: null,
    },
    schedulingPreferenceCandidates: [],
    status: "plan_ready",
  };
}

function buildGeneratedPlan(input: string) {
  const message = extractLatestTranscriptMessage(input);
  const goal = titleFromMessage(message, "Local test goal");

  return {
    direction: goal,
    mediumTermGoal: goal,
    thirtyDayPerformanceGoals: [`Make measurable progress on ${goal}`],
    fourteenDayPerformanceGoals: [`Complete the first useful step for ${goal}`],
    timeAvailability: "Local testing availability",
    timeProtectionPlan: ["Use a small protected local test block"],
    limitingHabits: [],
    scriptedActions: [],
    environmentalOptimizations: [],
    constraints: [],
    summary: `Local deterministic plan for ${goal}.`,
  };
}

function buildAssistantTurnResponse(input: string) {
  const message = extractSection(input, "Latest user message:", "Recent conversation:")
    .trim();
  const normalizedMessage = message.toLowerCase();
  const goals = extractJsonSection(input, "Current goals:", "Current tasks:");
  const tasks = extractJsonSection(input, "Current tasks:", "Current metrics:");
  const proposals = extractJsonSection(
    input,
    "Pending schedule proposals that still need user confirmation:",
    "Schedule-relevant calendar events from included account calendars:",
  );
  const firstGoal = firstRecord(goals);
  const firstTask = firstRecord(tasks);
  const firstProposal = firstRecord(proposals);
  const actions = [];
  let assistantMessage = "I handled that in local deterministic mode.";
  let navigationHint: "chat" | "goals" | "tasks" | "metrics" | "calendar" =
    "chat";

  if (/\b(confirm|approve|yes|apply)\b/u.test(normalizedMessage)) {
    actions.push(
      action({
        type: "confirm_schedule_proposal",
        proposalId: stringField(firstProposal, "id"),
      }),
    );
    assistantMessage = "Confirmed that local schedule proposal.";
    navigationHint = "calendar";
  } else if (/\b(dismiss|cancel|reject)\b/u.test(normalizedMessage)) {
    actions.push(
      action({
        type: "dismiss_schedule_proposal",
        proposalId: stringField(firstProposal, "id"),
      }),
    );
    assistantMessage = "Dismissed that local schedule proposal.";
    navigationHint = "calendar";
  } else if (/\b(schedule|calendar)\b/u.test(normalizedMessage)) {
    const { startTime, endTime } = localScheduleWindow();
    actions.push(
      action({
        type: /\b(at|from|tomorrow|today|\d(?::\d{2})?\s*(am|pm)?)\b/u.test(
          normalizedMessage,
        )
          ? "schedule_task"
          : "propose_schedule_task",
        taskId: stringField(firstTask, "id"),
        goalId: stringField(firstGoal, "id"),
        title: firstTask
          ? stringField(firstTask, "title")
          : titleFromMessage(message, "Local scheduled task"),
        description: "Scheduled in local deterministic mode.",
        startTime,
        endTime,
      }),
    );
    assistantMessage = "Prepared that local schedule change.";
    navigationHint = "calendar";
  } else if (/\b(metric|track|progress bar)\b/u.test(normalizedMessage)) {
    actions.push(
      action({
        type: "create_metric",
        goalId: stringField(firstGoal, "id"),
        title: titleFromMessage(message, "Local progress"),
        unitLabel: /hour/u.test(normalizedMessage) ? "hours" : "units",
        targetValue: firstNumber(message) ?? 10,
        currentValue: 0,
      }),
    );
    assistantMessage = "Created a local test metric.";
    navigationHint = "metrics";
  } else if (/\b(task|todo|to-do|review|resume)\b/u.test(normalizedMessage)) {
    actions.push(
      action({
        type: "create_task",
        goalId: stringField(firstGoal, "id"),
        title: titleFromMessage(message, "Local test task"),
        description: "Created in local deterministic mode.",
        dueAt: nextDayAtNoon(),
        estimatedMinutes: 30,
        status: "inbox",
      }),
    );
    assistantMessage = "Added that local test task.";
    navigationHint = "tasks";
  } else if (/\b(goal|plan|launch|learn|ship|build)\b/u.test(normalizedMessage)) {
    const title = titleFromMessage(message, "Local test goal");
    actions.push(
      action({
        type: "create_goal",
        title,
        definition: `Local deterministic goal for: ${title}`,
        successCriteria: [`Make measurable progress on ${title}`],
        notes: "Created by the deterministic local AI provider.",
      }),
    );
    assistantMessage = "Created a local test goal.";
    navigationHint = "goals";
  }

  return {
    assistantMessage,
    contextSummary: "Local deterministic assistant context.",
    navigationHint,
    actions,
    schedulingPreferenceCandidates: buildDeterministicSchedulingPreferenceCandidates(
      message,
    ),
  };
}

function buildWorkLogTurnResponse(input: string) {
  const message = extractSection(input, "Work log message:", "Goals:").trim();
  const metrics = extractJsonSection(input, "Metrics:", undefined);
  const firstMetric = firstRecord(metrics);
  const deltaValue = firstNumber(message);

  return {
    assistantMessage: "Saved that local work log.",
    summary: message || "Local work log",
    contextSummary: "Local deterministic work log context.",
    navigationHint: "metrics",
    goalId: null,
    taskId: null,
    progressUpdates:
      firstMetric && deltaValue !== null
        ? [
            {
              metricId: stringField(firstMetric, "id"),
              deltaValue,
              note: "Extracted by deterministic local AI.",
            },
          ]
        : [],
    schedulingPreferenceCandidates:
      buildDeterministicSchedulingPreferenceCandidates(message),
  };
}

function buildScheduleReflectionResponse(input: string) {
  const message = extractSection(
    input,
    "Latest schedule reflection message:",
    "Recent conversation:",
  ).trim();

  return {
    assistantMessage: "Saved that local schedule reflection.",
    shouldSaveReflection: message.length > 0,
    summary: message || "Local schedule reflection",
    contextSummary: "Local deterministic schedule reflection context.",
    navigationHint: "calendar",
    timeframeStart: null,
    timeframeEnd: null,
    liked: message ? [message] : [],
    disliked: [],
    obstacles: [],
    strategySuggestions: [
      {
        title: "Keep a small buffer",
        detail: "Add a short buffer around local test work blocks.",
        strength: "soft_preference",
        confidence: "medium",
        obstacle: null,
      },
    ],
  };
}

function buildDeterministicSchedulingPreferenceCandidates(message: string) {
  if (
    /(\bprefer\b|\bavoid\b|\bdon'?t\b|\bdo not\b|\bneed\b).*(morning|afternoon|evening|night|same day|recovery|recover|after|before|daily|weekly)/iu.test(
      message,
    )
  ) {
    return [
      {
        kind: "custom",
        title: "Local learned scheduling preference",
        detail: message,
        strength: /(\bavoid\b|\bdon'?t\b|\bdo not\b|\bneed\b)/iu.test(message)
          ? "hard_constraint"
          : "soft_preference",
        confidence: "medium",
        applicabilityScope: /same day|strength|plyo|basketball|cardio|workout/iu.test(
          message,
        )
          ? "activity"
          : "global",
        domain: /strength|plyo|basketball|cardio|workout|recovery/iu.test(message)
          ? "fitness"
          : null,
        goalTitle: null,
        activityTitle: /strength|plyo|basketball|cardio|workout/iu.test(message)
          ? "fitness training"
          : null,
        temporalScope: null,
        evidence: message,
      },
    ];
  }

  return [];
}

function action(overrides: Partial<DeterministicAction>) {
  return {
    ...emptyAction(),
    ...overrides,
  };
}

function emptyAction(): DeterministicAction {
  return {
    type: "create_task",
    proposalId: null,
    goalId: null,
    focusId: null,
    taskId: null,
    metricId: null,
    title: null,
    definition: null,
    successCriteria: [],
    focusAreas: [],
    scheduleGuidance: null,
    constraints: [],
    notes: null,
    description: null,
    unitLabel: null,
    targetValue: null,
    currentValue: null,
    dueAt: null,
    estimatedMinutes: null,
    priorityRank: null,
    status: null,
    scheduleIntent: null,
    startTime: null,
    endTime: null,
    isActive: null,
  };
}

function extractLatestTranscriptMessage(input: string) {
  const matches = Array.from(input.matchAll(/^USER:\s*(.+)$/gmu));
  return matches.at(-1)?.[1]?.trim() ?? "Local test goal";
}

function extractSection(input: string, startLabel: string, endLabel: string | undefined) {
  const startIndex = input.indexOf(startLabel);

  if (startIndex === -1) {
    return "";
  }

  const contentStart = startIndex + startLabel.length;
  const endIndex = endLabel ? input.indexOf(endLabel, contentStart) : -1;
  return input.slice(contentStart, endIndex === -1 ? undefined : endIndex);
}

function extractJsonSection(
  input: string,
  startLabel: string,
  endLabel: string | undefined,
) {
  const section = extractSection(input, startLabel, endLabel).trim();

  try {
    return JSON.parse(section) as unknown;
  } catch {
    return null;
  }
}

function firstRecord(value: unknown): ParsedRecord | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const item = value[0];
  return item && typeof item === "object" && !Array.isArray(item)
    ? (item as ParsedRecord)
    : null;
}

function stringField(record: ParsedRecord | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function firstNumber(value: string) {
  const match = value.match(/\b\d+(?:\.\d+)?\b/u);
  return match?.[0] ? Number(match[0]) : null;
}

function titleFromMessage(message: string, fallback: string) {
  const cleaned = message
    .replace(/\b(add|create|make|build|ship|track|schedule|goal|task|todo|to-do|metric|please|a|an|the|to|for|my)\b/giu, " ")
    .replace(/\s+/gu, " ")
    .trim();

  if (!cleaned) {
    return fallback;
  }

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function nextDayAtNoon() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(12, 0, 0, 0);
  return date.toISOString();
}

function localScheduleWindow() {
  const startTime = new Date();
  startTime.setDate(startTime.getDate() + 1);
  startTime.setHours(9, 0, 0, 0);

  const endTime = new Date(startTime);
  endTime.setHours(10, 0, 0, 0);

  return {
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
  };
}
