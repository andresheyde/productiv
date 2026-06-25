import type {
  StructuredAiProvider,
  StructuredJsonGenerationInput,
} from "./ai-provider.ts";
import { normalizeSchedulableFocusTitle } from "./focus-area-title.ts";

type ParsedRecord = Record<string, unknown>;
type DeterministicAction = {
  type: string;
  proposalId: string | null;
  goalId: string | null;
  focusId: string | null;
  taskId: string | null;
  occurrenceKey: string | null;
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
  recurrence: unknown | null;
  estimatedMinutes: number | null;
  priorityRank: number | null;
  status: string | null;
  scheduleIntent: string | null;
  startTime: string | null;
  endTime: string | null;
  isActive: boolean | null;
};
type DeterministicSchedulingPreferenceCandidate = {
  kind:
    | "work_hours"
    | "no_schedule_window"
    | "sleep_window"
    | "latest_work_end"
    | "preferred_focus_block"
    | "preferred_work_period"
    | "recovery_day"
    | "custom";
  title: string;
  detail: string;
  strength: "hard_constraint" | "soft_preference";
  confidence: "low" | "medium" | "high";
  applicabilityScope: "global" | "domain" | "goal" | "activity" | "temporary";
  domain: string | null;
  goalTitle: string | null;
  activityTitle: string | null;
  temporalScope: string | null;
  evidence: string | null;
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
  const actions: DeterministicAction[] = [];
  let assistantMessage = "I handled that in local deterministic mode.";
  let navigationHint: "chat" | "goals" | "tasks" | "metrics" | "calendar" =
    "chat";

  if (/\b(confirm|approve|yes|apply)\b/u.test(normalizedMessage)) {
    actions.push(
      action({
        type: "confirm_schedule_proposal",
        proposalId: resolveReferencedProposalId(message, proposals),
      }),
    );
    assistantMessage = "Confirmed that local schedule proposal.";
    navigationHint = "calendar";
  } else if (/\b(dismiss|cancel|reject)\b/u.test(normalizedMessage)) {
    actions.push(
      action({
        type: "dismiss_schedule_proposal",
        proposalId: resolveReferencedProposalId(message, proposals),
      }),
    );
    assistantMessage = "Dismissed that local schedule proposal.";
    navigationHint = "calendar";
  } else {
    const messageParts = splitMessageParts(message);
    const workspaceMessageParts = messageParts.filter(
      (part) => !isSchedulingContextOnlyPart(part),
    );
    const goalParts = workspaceMessageParts.filter(hasGoalCreationIntent);
    const taskParts = workspaceMessageParts.filter(hasTaskCreationIntent);
    const taskPartSet = new Set(taskParts);
    const habitParts = workspaceMessageParts.filter(
      (part) => hasHabitIntent(part) && !taskPartSet.has(part),
    );
    const metricParts = workspaceMessageParts.filter(hasMetricCreationIntent);
    const createsGoalInTurn = goalParts.length > 0 || habitParts.length > 0;
    const fallbackExistingGoalId = createsGoalInTurn
      ? null
      : stringField(firstGoal, "id");
    const personalRoutinesGoal = findPersonalRoutinesGoal(goals);

    if (goalParts.length > 0) {
      const goalAttachedHabitParts = new Set<string>();

      for (const goalPart of goalParts) {
        const actionableGoalPart = getActionableWorkspacePart(goalPart);
        const title = titleFromMessage(actionableGoalPart, "Local test goal");
        const attachedHabitParts = getGoalAttachedHabitParts(
          goalPart,
          goalParts,
          habitParts,
        );
        const focusAreas =
          attachedHabitParts.length > 0
            ? attachedHabitParts.map((habitPart) =>
                focusAreaFromMessage(getActionableWorkspacePart(habitPart)),
              )
            : starterFocusAreasForGoal(actionableGoalPart);

        for (const habitPart of attachedHabitParts) {
          goalAttachedHabitParts.add(habitPart);
        }

        actions.push(
          action({
            type: "create_goal",
            title,
            definition: `Local deterministic goal for: ${title}`,
            successCriteria: [`Make measurable progress on ${title}`],
            focusAreas,
            notes: "Created by the deterministic local AI provider.",
          }),
        );
      }

      const standaloneHabitParts = habitParts.filter(
        (habitPart) => !goalAttachedHabitParts.has(habitPart),
      );

      if (standaloneHabitParts.length > 0) {
        actions.push(
          createPersonalRoutinesGoalAction(
            standaloneHabitParts,
            personalRoutinesGoal,
          ),
        );
      }

      navigationHint = "goals";
    } else if (habitParts.length > 0) {
      actions.push(
        createPersonalRoutinesGoalAction(habitParts, personalRoutinesGoal),
      );
      navigationHint = "goals";
    }

    for (const taskPart of taskParts) {
      const actionableTaskPart = getActionableWorkspacePart(taskPart);

      actions.push(
        action({
          type: "create_task",
          goalId: fallbackExistingGoalId,
          title: titleFromMessage(actionableTaskPart, "Local test task"),
          description: taskDescriptionFromMessage(actionableTaskPart),
          dueAt: /\btomorrow\b/u.test(actionableTaskPart.toLowerCase())
            ? nextDayEndOfDay()
            : null,
          recurrence: taskRecurrenceFromMessage(actionableTaskPart),
          estimatedMinutes: firstNumber(actionableTaskPart) ?? 30,
          scheduleIntent: /\b(schedule|calendar|block|timebox|tomorrow|today)\b/iu.test(
            message,
          )
            ? "schedule_now"
            : "unscheduled",
          status: "inbox",
        }),
      );
      navigationHint = navigationHint === "chat" ? "tasks" : navigationHint;
    }

    for (const metricPart of metricParts) {
      const actionableMetricPart = getActionableWorkspacePart(metricPart);

      actions.push(
        action({
          type: "create_metric",
          goalId: fallbackExistingGoalId,
          title: titleFromMessage(actionableMetricPart, "Local progress"),
          unitLabel: /hour/u.test(actionableMetricPart.toLowerCase())
            ? "hours"
            : "units",
          targetValue: firstNumber(actionableMetricPart) ?? 10,
          currentValue: 0,
        }),
      );
      navigationHint = "metrics";
    }

    if (/\b(schedule|calendar)\b/u.test(normalizedMessage)) {
      const schedulableWorkspaceText = workspaceMessageParts
        .map(getActionableWorkspacePart)
        .join(". ")
        .toLowerCase();

      if (hasExactScheduleSlot(schedulableWorkspaceText)) {
        const { startTime, endTime } = localScheduleWindow();
        actions.push(
          action({
            type: "schedule_task",
            taskId: stringField(firstTask, "id"),
            goalId: fallbackExistingGoalId,
            title:
              stringField(firstTask, "title") ??
              actions.find((item) => item.type === "create_task")?.title ??
              titleFromMessage(message, "Local scheduled task"),
            description: "Scheduled in local deterministic mode.",
            startTime,
            endTime,
          }),
        );
        assistantMessage = "Prepared those local workspace and schedule changes.";
      } else {
        assistantMessage = actions.length > 0
          ? "I handled the local workspace updates and asked Productiv's scheduling engine to draft the schedule."
          : "I'll draft that with Productiv's scheduling engine.";
      }
      navigationHint = "calendar";
    } else if (actions.length > 0) {
      assistantMessage =
        actions.length === 1
          ? "Handled that local workspace update."
          : "Handled those local workspace updates.";
    }
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

function getGoalAttachedHabitParts(
  goalPart: string,
  goalParts: string[],
  habitParts: string[],
) {
  if (hasHabitIntent(goalPart)) {
    return [goalPart];
  }

  if (goalParts.length !== 1) {
    return [];
  }

  return habitParts.filter((habitPart) =>
    shouldAttachHabitPartToSingleGoal(habitPart, goalPart),
  );
}

function shouldAttachHabitPartToSingleGoal(habitPart: string, goalPart: string) {
  const actionableHabitPart = getActionableWorkspacePart(habitPart);
  const normalized = actionableHabitPart.toLowerCase();
  const normalizedGoalPart = getActionableWorkspacePart(goalPart).toLowerCase();

  if (/\bfocus\s+(?:routine|block|area|work)\b/u.test(normalized)) {
    return true;
  }

  if (
    /\b(?:study|review|practice\s+problems|draft|write|writing|training)\b/u.test(
      normalized,
    )
  ) {
    return true;
  }

  if (habitPartLooksRelatedToGoal(normalized, normalizedGoalPart)) {
    return true;
  }

  return !isStandaloneLifestyleHabitPart(normalized);
}

function habitPartLooksRelatedToGoal(
  normalizedHabitPart: string,
  normalizedGoalPart: string,
) {
  if (
    /\b(?:train|training|fitness|race|marathon|10k|5k|run|running|workout|exercise)\b/u.test(
      normalizedGoalPart,
    ) &&
    /\b(?:run|running|walk|exercise|work\s*out|workout|stretch)\b/u.test(
      normalizedHabitPart,
    )
  ) {
    return true;
  }

  if (
    /\b(?:study|school|class|course|exam|finals?|calculus|grade)\b/u.test(
      normalizedGoalPart,
    ) &&
    /\b(?:study|read|review|practice)\b/u.test(normalizedHabitPart)
  ) {
    return true;
  }

  return false;
}

function isStandaloneLifestyleHabitPart(normalizedHabitPart: string) {
  return /\b(?:meditat|journal|read|stretch|walk|run|exercise|work\s*out|meal\s*prep|clean)\b/u.test(
    normalizedHabitPart,
  );
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

function splitMessageParts(message: string) {
  return message
    .split(/\s*(?:[.;]|\band\b|\balso\b|\bplus\b|\bthen\b)\s*/iu)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isSchedulingContextOnlyPart(message: string) {
  const normalized = message.toLowerCase();

  if (hasActionableWorkspaceCue(message)) {
    return false;
  }

  return (
    hasAvailabilityContextCue(normalized) ||
    hasSchedulingPreferenceContextCue(normalized)
  );
}

function getActionableWorkspacePart(message: string) {
  const normalized = message
    .replace(/\b(?:here(?:'s| is)?|this is)\s+(?:my\s+)?schedule:?\s*/giu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const commaClauses = normalized
    .split(/\s*,\s*/u)
    .map((part) => part.trim())
    .filter(Boolean);
  const actionableClauses = commaClauses.filter(
    (part) => !isSchedulingContextOnlyPart(part),
  );

  if (actionableClauses.length > 0) {
    return actionableClauses.join(", ");
  }

  return normalized || message;
}

function hasActionableWorkspaceCue(message: string) {
  return (
    hasRawGoalCreationCue(message) ||
    hasRawTaskCreationCue(message) ||
    hasRawHabitCue(message) ||
    hasRawMetricCreationCue(message) ||
    (hasOneSessionDeliverableVerb(message) && hasTaskBoundaryCue(message))
  );
}

function hasRawGoalCreationCue(message: string) {
  return (
    /\b(?:create|add|make|set|build|start)\b.{0,40}\b(?:goal|goals|objective)\b/iu.test(
      message,
    ) ||
    /\b(?:goal|goals|objective)\b.{0,40}\b(?:to|for)\b/iu.test(message) ||
    /\b(?:train for|prepare for|get better at|improve|learn to|learn|ship)\b/iu.test(
      message,
    )
  );
}

function hasRawTaskCreationCue(message: string) {
  return (
    /\b(add|create|make|save|note|remember)\b.*\b(task|tasks|todo|to-do|reminder|errand)\b/iu.test(
      message,
    ) || /\b(task|todo|to-do|reminder)\s+to\b/iu.test(message)
  );
}

function hasRawHabitCue(message: string) {
  const normalized = message.toLowerCase();

  return (
    /\b(habit|routine|recurring|repeat|practice)\b/iu.test(message) ||
    /\b(daily|weekly|weekdays?|every day|each day)\b.*\b(study|read|meditat|journal|stretch|walk|run|exercise|work\s*out|meal\s*prep|clean|write|routine|practice)\b/iu.test(
      normalized,
    ) ||
    /\b(study|read|meditat|journal|stretch|walk|run|exercise|work\s*out|meal\s*prep|clean|write|routine|practice)\b.*\b(daily|weekly|weekdays?|every day|each day)\b/iu.test(
      normalized,
    ) ||
    inferLifestyleHabitActivityTitle(message) !== null
  );
}

function hasRawMetricCreationCue(message: string) {
  return /\b(metric|track|progress bar)\b/iu.test(message);
}

function hasAvailabilityContextCue(message: string) {
  return (
    /\b(?:work\s+hours|working\s+hours|office\s+hours|i\s+work|work\s+weekdays?|work\s+weekends?|sleep|bedtime|bed time|class|lecture|lab|meeting|appointment|therapy|commute|school|college|unavailable|busy|not\s+free|not\s+available)\b/iu.test(
      message,
    ) && /\b(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?|mornings?|afternoons?|evenings?|weekdays?|weekends?|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/iu.test(
      message,
    )
  );
}

function hasSchedulingPreferenceContextCue(message: string) {
  return /\b(?:prefer|preferred|best|avoid|don'?t|do not|keep|save|use)\b.*\b(?:mornings?|afternoons?|evenings?|night|before lunch|after lunch|after work|before work)\b/iu.test(
    message,
  );
}

function hasGoalCreationIntent(message: string) {
  if (isSchedulingContextOnlyPart(message)) {
    return false;
  }

  return hasRawGoalCreationCue(message);
}

function hasHabitIntent(message: string) {
  if (isSchedulingContextOnlyPart(message)) {
    return false;
  }

  return hasRawHabitCue(message);
}

function hasTaskCreationIntent(message: string) {
  return (
    hasRawTaskCreationCue(message) ||
    hasImplicitOneSessionTaskIntent(message)
  );
}

function hasImplicitOneSessionTaskIntent(message: string) {
  if (isSchedulingContextOnlyPart(message) || hasHabitIntent(message)) {
    return false;
  }

  return (
    hasOneSessionDeliverableVerb(message) &&
    hasTaskBoundaryCue(message)
  );
}

function hasOneSessionDeliverableVerb(message: string) {
  return /\b(?:review|email|call|text|message|send|submit|finish|complete|draft|write|edit|pay|buy|order|pick\s+up|drop\s+off|book|prepare|print|read|clean|file|renew)\b/iu.test(
    message,
  );
}

function hasTaskBoundaryCue(message: string) {
  return (
    /\b(?:today|tomorrow|tonight|this\s+(?:morning|afternoon|evening|week|weekend)|next\s+(?:week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|by\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|tonight))\b/iu.test(
      message,
    ) ||
    /\b(?:for|about|around)\s+\d{1,3}\s*(?:minutes?|mins?|hours?|hrs?)\b/iu.test(
      message,
    ) ||
    /\b(?:\d{1,3})[-\s]*(?:minutes?|mins?|hours?|hrs?)\b/iu.test(message)
  );
}

function taskDescriptionFromMessage(message: string) {
  if (hasRecurringTaskWording(message)) {
    return "Created in local deterministic mode for a recurring task.";
  }

  return "Created in local deterministic mode.";
}

function taskRecurrenceFromMessage(message: string) {
  if (!hasRecurringTaskWording(message)) {
    return null;
  }

  if (/\b(monthly|every month|each month)\b/iu.test(message)) {
    return createTaskRecurrence("monthly", [], message);
  }

  if (/\b(weekday|weekdays|monday through friday)\b/iu.test(message)) {
    return createTaskRecurrence("weekly", [1, 2, 3, 4, 5], message);
  }

  const daysOfWeek = inferDaysOfWeek(message);

  if (
    daysOfWeek.length > 0 ||
    /\b(weekly|each week|every week)\b/iu.test(message)
  ) {
    return createTaskRecurrence("weekly", daysOfWeek, message);
  }

  if (/\b(daily|every day|each day)\b/iu.test(message)) {
    return createTaskRecurrence("daily", [], message);
  }

  return createTaskRecurrence("custom", [], message);
}

function createTaskRecurrence(
  frequency: "daily" | "weekly" | "monthly" | "custom",
  daysOfWeek: number[],
  message: string,
) {
  return {
    frequency,
    interval: 1,
    daysOfWeek,
    endsAt: null,
    sourceText: message.trim(),
    scheduledOccurrences: [],
  };
}

function inferDaysOfWeek(message: string) {
  const normalized = message.toLowerCase();
  const days = [
    ["sunday", 0],
    ["monday", 1],
    ["tuesday", 2],
    ["wednesday", 3],
    ["thursday", 4],
    ["friday", 5],
    ["saturday", 6],
  ] as const;

  return days
    .filter(([day]) => new RegExp(`\\b${day}s?\\b`, "u").test(normalized))
    .map(([, value]) => value);
}

function hasRecurringTaskWording(message: string) {
  return /\b(daily|weekly|monthly|weekdays?|every day|each day|every week|every month|every monday|every tuesday|every wednesday|every thursday|every friday|every saturday|every sunday|recurring|repeat|repeats?)\b/iu.test(
    message,
  );
}

function hasMetricCreationIntent(message: string) {
  return hasRawMetricCreationCue(message);
}

function findPersonalRoutinesGoal(goals: unknown) {
  if (!Array.isArray(goals)) {
    return null;
  }

  return (
    goals.find((goal): goal is ParsedRecord => {
      if (!goal || typeof goal !== "object" || Array.isArray(goal)) {
        return false;
      }

      const record = goal as ParsedRecord;
      const status = stringField(record, "status");

      return (
        normalizeComparableTitle(stringField(record, "title") ?? "") ===
          "personal routines" &&
        (status === null || status === "active" || status === "paused")
      );
    }) ?? null
  );
}

function createPersonalRoutinesGoalAction(
  habitParts: string[],
  existingGoal: ParsedRecord | null,
) {
  const incomingFocusAreas = habitParts.map((habitPart) =>
    focusAreaFromMessage(getActionableWorkspacePart(habitPart)),
  );

  if (existingGoal) {
    return action({
      type: "update_goal",
      goalId: stringField(existingGoal, "id"),
      title: stringField(existingGoal, "title") ?? "Personal routines",
      focusAreas: mergeParsedFocusAreas(
        arrayField(existingGoal, "focusAreas"),
        incomingFocusAreas,
      ),
    });
  }

  return action({
    type: "create_goal",
    title: "Personal routines",
    definition: "Lightweight local goal for recurring routines.",
    successCriteria: ["Build a consistent personal routine."],
    focusAreas: incomingFocusAreas,
    notes: "Created by the deterministic local AI provider.",
  });
}

function arrayField(record: ParsedRecord | null, key: string) {
  const value = record?.[key];

  return Array.isArray(value) ? value : [];
}

function mergeParsedFocusAreas(existing: unknown[], incoming: unknown[]) {
  const merged = [...existing];
  const seen = new Set(
    existing.flatMap((focusArea) => {
      if (!focusArea || typeof focusArea !== "object" || Array.isArray(focusArea)) {
        return [];
      }

      const record = focusArea as ParsedRecord;
      const idKey = normalizeComparableTitle(stringField(record, "id") ?? "");
      const titleKey = normalizeComparableTitle(
        stringField(record, "title") ?? "",
      );

      return [idKey, titleKey].filter(Boolean);
    }),
  );

  for (const focusArea of incoming) {
    if (!focusArea || typeof focusArea !== "object" || Array.isArray(focusArea)) {
      continue;
    }

    const record = focusArea as ParsedRecord;
    const idKey = normalizeComparableTitle(stringField(record, "id") ?? "");
    const titleKey = normalizeComparableTitle(stringField(record, "title") ?? "");

    if ((idKey && seen.has(idKey)) || (titleKey && seen.has(titleKey))) {
      continue;
    }

    if (idKey) {
      seen.add(idKey);
    }

    if (titleKey) {
      seen.add(titleKey);
    }

    merged.push(focusArea);
  }

  return merged;
}

function focusAreaFromMessage(message: string) {
  const title =
    inferLifestyleHabitActivityTitle(message) ??
    normalizeSchedulableFocusTitle(titleFromMessage(message, "Routine"));

  return {
    id: `local-focus-${slugify(title) || "routine"}`,
    title,
    description: `Recurring routine from local deterministic mode: ${title}`,
    status: "active",
    defaultDurationMinutes: inferLocalDurationMinutes(message),
    cadence: inferLocalCadence(message),
  };
}

function starterFocusAreasForGoal(message: string) {
  const normalized = message.toLowerCase();

  if (
    /\b(?:lose|losing|fat|weight|abs?|stamina|fitness|fit|strength|strong|workout|exercise|train|training)\b/u.test(
      normalized,
    )
  ) {
    return [
      starterFocusArea("Strength training", 45, "3x/week"),
      starterFocusArea("Cardio", 30, "2x/week"),
    ];
  }

  if (
    /\b(?:grade|grades|school|class|course|exam|finals?|calculus|study|learn)\b/u.test(
      normalized,
    )
  ) {
    return [
      starterFocusArea("Study", 45, "3x/week"),
      starterFocusArea("Practice problems", 45, "3x/week"),
    ];
  }

  if (
    /\b(?:write|writing|draft|essay|book|launch|ship|project|proposal)\b/u.test(
      normalized,
    )
  ) {
    return [
      starterFocusArea("Deep work", 60, "3x/week"),
      starterFocusArea("Review notes", 30, "weekly"),
    ];
  }

  return [starterFocusArea("Focused work", 45, "3x/week")];
}

function starterFocusArea(
  title: string,
  defaultDurationMinutes: number,
  cadence: string,
) {
  return {
    id: `local-focus-${slugify(title) || "starter"}`,
    title,
    description: `Starter focus block from local deterministic mode: ${title}`,
    status: "active",
    defaultDurationMinutes,
    cadence,
  };
}

function inferLifestyleHabitActivityTitle(message: string) {
  const normalized = message.replace(/\s+/gu, " ").trim();
  const wantToPracticeMatch =
    /\b(?:i\s+)?(?:want|need|would\s+like|trying|try)\s+to\s+(?<activity>meditate|journal|read|stretch|walk|run|exercise|work\s*out|meal\s*prep|clean|write)\b/iu.exec(
      normalized,
    );
  const startPracticeMatch =
    /\b(?:start|begin|build)\s+(?:a\s+)?(?<activity>meditating|meditation|journaling|reading|stretching|walking|running|exercising|working\s*out|meal\s*prep|cleaning|writing)\b/iu.exec(
      normalized,
    );
  const recurringPracticeMatch =
    /\b(?<activity>meditate|journal|read|stretch|walk|run|exercise|work\s*out|meal\s*prep|clean|write)\s+every\s+(?:morning|afternoon|evening|night|day|weekday|weekend|week)\b/iu.exec(
      normalized,
    );
  const match = wantToPracticeMatch ?? startPracticeMatch ?? recurringPracticeMatch;
  const activity = match?.groups?.activity;

  if (!activity) {
    return null;
  }

  return normalizeLifestyleHabitActivityTitle(activity);
}

function normalizeLifestyleHabitActivityTitle(activity: string) {
  const normalized = activity.toLowerCase().replace(/\s+/gu, " ").trim();

  if (normalized === "meditating" || normalized === "meditation") {
    return "Meditate";
  }

  if (normalized === "journaling") {
    return "Journal";
  }

  if (normalized === "reading") {
    return "Read";
  }

  if (normalized === "stretching") {
    return "Stretch";
  }

  if (normalized === "walking") {
    return "Walk";
  }

  if (normalized === "running") {
    return "Run";
  }

  if (normalized === "exercising" || normalized === "working out") {
    return "Exercise";
  }

  if (normalized === "cleaning") {
    return "Clean";
  }

  if (normalized === "writing") {
    return "Write";
  }

  return normalized
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function inferLocalDurationMinutes(message: string) {
  const normalized = message.toLowerCase();
  const minuteMatch = normalized.match(
    /\b(\d{1,3})[-\s]*(?:minute|minutes|min)\b/u,
  );

  if (minuteMatch?.[1]) {
    return Number(minuteMatch[1]);
  }

  const hourMatch = normalized.match(/\b(\d{1,2})[-\s]*(?:hour|hours)\b/u);

  if (hourMatch?.[1]) {
    return Number(hourMatch[1]) * 60;
  }

  return null;
}

function inferLocalCadence(message: string) {
  const normalized = message.toLowerCase();
  const weeklyCount = normalized.match(
    /\b(\d{1,2})\s*(?:x|times?)\s*(?:a|per)?\s*week\b/u,
  );

  if (weeklyCount?.[1]) {
    return `${Number(weeklyCount[1])}x/week`;
  }

  if (/\b(weekday|weekdays|monday through friday)\b/u.test(normalized)) {
    return "weekdays";
  }

  if (
    /\b(daily|every day|each day)\b/u.test(normalized) ||
    /\b(?:every|each)\s+(?:morning|afternoon|evening|night)\b/u.test(
      normalized,
    )
  ) {
    return "daily";
  }

  if (/\b(weekly|each week|every week)\b/u.test(normalized)) {
    return "weekly";
  }

  return null;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 48);
}

function normalizeComparableTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
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
  const candidates = inferConcreteAvailabilityCandidates(message);
  const unavailablePeriod = inferUnavailableWorkPeriod(message);

  if (unavailablePeriod) {
    candidates.push({
      kind: "no_schedule_window",
      title: `Avoid scheduling ${unavailablePeriod}s`,
      detail: `Avoid generated schedule drafts during the ${unavailablePeriod} when possible.`,
      strength: "soft_preference",
      confidence: "medium",
      applicabilityScope: "global",
      domain: null,
      goalTitle: null,
      activityTitle: null,
      temporalScope: unavailablePeriod,
      evidence: message,
    });
  }

  const preferredActivityWorkPeriod = inferPreferredActivityWorkPeriod(message);

  if (preferredActivityWorkPeriod) {
    candidates.push({
      kind: "preferred_work_period",
      title: `${preferredActivityWorkPeriod.activityTitle} ${preferredActivityWorkPeriod.period} preference`,
      detail: `Prefer scheduling ${preferredActivityWorkPeriod.activityTitle} during the ${preferredActivityWorkPeriod.period}.`,
      strength: "soft_preference",
      confidence: "medium",
      applicabilityScope: "activity",
      domain: inferActivityDomain(preferredActivityWorkPeriod.activityTitle),
      goalTitle: null,
      activityTitle: preferredActivityWorkPeriod.activityTitle,
      temporalScope: preferredActivityWorkPeriod.period,
      evidence: message,
    });
  }

  if (/\b(week|weeks|scheduling week|planning week)\b.*\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b.*\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/iu.test(message)) {
    candidates.push({
        kind: "custom",
        title: "Preferred scheduling week boundary",
        detail: message,
        strength: "soft_preference",
        confidence: "medium",
        applicabilityScope: "global",
        domain: null,
        goalTitle: null,
        activityTitle: null,
        temporalScope: null,
        evidence: message,
    });
  }

  if (
    !preferredActivityWorkPeriod &&
    !unavailablePeriod &&
    /(\bprefer\b|\bavoid\b|\bdon'?t\b|\bdo not\b|\bneed\b).*(morning|afternoon|evening|night|same day|recovery|recover|after|before|daily|weekly)/iu.test(
      message,
    )
  ) {
    candidates.push({
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
    });
  }

  return dedupeDeterministicSchedulingPreferenceCandidates(candidates);
}

function inferConcreteAvailabilityCandidates(message: string) {
  const candidates: DeterministicSchedulingPreferenceCandidate[] = [];
  const clauses = getSchedulingContextClauses(message);

  for (const clause of clauses) {
    const workHoursCandidate = inferWorkHoursCandidate(clause, message);

    if (workHoursCandidate) {
      candidates.push(workHoursCandidate);
    }

    const sleepWindowCandidate = inferSleepWindowCandidate(clause, message);

    if (sleepWindowCandidate) {
      candidates.push(sleepWindowCandidate);
    }

    const fixedCommitmentCandidate = inferFixedCommitmentCandidate(
      clause,
      message,
    );

    if (fixedCommitmentCandidate) {
      candidates.push(fixedCommitmentCandidate);
    }
  }

  return candidates;
}

function getSchedulingContextClauses(message: string) {
  return splitMessageParts(message)
    .flatMap((part) =>
      part
        .replace(/\b(?:here(?:'s| is)?|this is)\s+(?:my\s+)?schedule:?\s*/giu, " ")
        .split(/\s*,\s*/u),
    )
    .map((part) => part.replace(/\s+/gu, " ").trim())
    .filter(Boolean);
}

function inferWorkHoursCandidate(clause: string, message: string) {
  const timeRange = extractClockRangeText(clause);

  if (!timeRange || !hasAvailabilityContextCue(clause.toLowerCase())) {
    return null;
  }

  if (!/\b(?:work|job|office|shift)\b/iu.test(clause)) {
    return null;
  }

  return {
    kind: "work_hours",
    title: "Protect weekday work hours",
    detail: `I work weekdays ${timeRange}.`,
    strength: "hard_constraint",
    confidence: "high",
    applicabilityScope: "global",
    domain: null,
    goalTitle: null,
    activityTitle: null,
    temporalScope: "weekdays",
    evidence: message,
  } as const;
}

function inferSleepWindowCandidate(clause: string, message: string) {
  const timeRange = extractClockRangeText(clause);

  if (!timeRange || !/\b(?:sleep|bedtime|bed time|asleep)\b/iu.test(clause)) {
    return null;
  }

  return {
    kind: "sleep_window",
    title: "Protect sleep",
    detail: `I sleep ${timeRange}.`,
    strength: "hard_constraint",
    confidence: "high",
    applicabilityScope: "global",
    domain: null,
    goalTitle: null,
    activityTitle: null,
    temporalScope: "nightly",
    evidence: message,
  } as const;
}

function inferFixedCommitmentCandidate(clause: string, message: string) {
  const timeRange = extractClockRangeText(clause);
  const day = inferWeekdayName(clause);
  const label = inferFixedCommitmentTitle(clause);

  if (!timeRange || !day || !label) {
    return null;
  }

  return {
    kind: "no_schedule_window",
    title: `Protect ${day} ${label.toLowerCase()}`,
    detail: `I have ${label.toLowerCase()} every ${day} ${timeRange}.`,
    strength: "hard_constraint",
    confidence: "high",
    applicabilityScope: "global",
    domain: null,
    goalTitle: null,
    activityTitle: null,
    temporalScope: day,
    evidence: message,
  } as const;
}

function extractClockRangeText(value: string) {
  return /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:-|to)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/iu.exec(
    value,
  )?.[0] ?? null;
}

function inferWeekdayName(value: string) {
  const match = /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/iu.exec(
    value,
  );
  const dayName = match?.[1];

  return dayName
    ? dayName.charAt(0).toUpperCase() + dayName.slice(1).toLowerCase()
    : null;
}

function inferFixedCommitmentTitle(value: string) {
  const match = /\b(class|lecture|lab|meeting|appointment|therapy|commute|practice|lesson|school|college|workshop|seminar|standup|shift)\b/iu.exec(
    value,
  );
  const label = match?.[1];

  return label ? label.charAt(0).toUpperCase() + label.slice(1).toLowerCase() : null;
}

function dedupeDeterministicSchedulingPreferenceCandidates(
  candidates: DeterministicSchedulingPreferenceCandidate[],
) {
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    const key = [
      candidate.kind,
      candidate.title.toLowerCase(),
      candidate.temporalScope?.toLowerCase() ?? "",
      candidate.activityTitle?.toLowerCase() ?? "",
    ].join(":");

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function inferPreferredActivityWorkPeriod(message: string) {
  const preferActivityPeriod =
    /\bprefer(?:\s+to)?\s+(?:schedule|scheduling|do|doing)?\s*(?<activity>[a-z][a-z\s-]{1,40}?)\s+(?:in|during)\s+(?:the\s+)?(?<period>mornings?|afternoons?|evenings?)\b/iu.exec(
      message,
    );
  const periodActivity =
    /\b(?:keep|use|save)\s+(?:the\s+)?(?<period>mornings?|afternoons?|evenings?)\s+for\s+(?<activity>[a-z][a-z\s-]{1,40})\b/iu.exec(
      message,
    );
  const recurringActivityPeriod =
    /\b(?<activity>meditate|journal|read|study|stretch|walk|run|exercise|work\s*out|meal\s*prep|clean|write)\s+(?:every|each)\s+(?<period>morning|afternoon|evening|night)\b/iu.exec(
      message,
    );
  const recurringPeriodActivity =
    /\b(?:every|each)\s+(?<period>morning|afternoon|evening|night)\s+(?:i\s+)?(?<activity>meditate|journal|read|study|stretch|walk|run|exercise|work\s*out|meal\s*prep|clean|write)\b/iu.exec(
      message,
    );
  const match =
    preferActivityPeriod ??
    periodActivity ??
    recurringActivityPeriod ??
    recurringPeriodActivity;
  const period = normalizeWorkPeriod(match?.groups?.period);
  const activityTitle =
    match === recurringActivityPeriod || match === recurringPeriodActivity
      ? normalizeLifestyleHabitActivityTitle(match?.groups?.activity ?? "")
      : normalizePreferenceActivityTitle(match?.groups?.activity);

  if (!period || !activityTitle) {
    return null;
  }

  return {
    activityTitle,
    period,
  };
}

function normalizeWorkPeriod(value: string | undefined) {
  const normalized = value?.toLowerCase().trim();

  if (normalized === "morning" || normalized === "mornings") {
    return "morning";
  }

  if (normalized === "afternoon" || normalized === "afternoons") {
    return "afternoon";
  }

  if (
    normalized === "evening" ||
    normalized === "evenings" ||
    normalized === "night"
  ) {
    return "evening";
  }

  return null;
}

function normalizePreferenceActivityTitle(value: string | undefined) {
  const cleaned = value
    ?.replace(/\b(?:my|the|a|an|schedule|scheduling|do|doing)\b/giu, " ")
    .replace(/\s+/gu, " ")
    .trim();

  if (!cleaned || cleaned.length < 2) {
    return null;
  }

  return cleaned
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function inferActivityDomain(activityTitle: string) {
  return /\b(?:workout|fitness|cardio|strength|plyo|basketball|run|running|exercise)\b/iu.test(
    activityTitle,
  )
    ? "fitness"
    : null;
}

function inferUnavailableWorkPeriod(message: string) {
  const normalized = message.toLowerCase();

  if (
    !/\b(?:can'?t|cannot|won'?t be able|not available|unavailable|busy|conflict|avoid|no|blocked|off-limits|off limits)\b/iu.test(
      normalized,
    )
  ) {
    return null;
  }

  const period = /\b(?<period>mornings?|afternoons?|evenings?)\b/iu.exec(
    normalized,
  )?.groups?.period;

  if (period === "morning" || period === "mornings") {
    return "morning";
  }

  if (period === "afternoon" || period === "afternoons") {
    return "afternoon";
  }

  if (period === "evening" || period === "evenings") {
    return "evening";
  }

  return null;
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
    occurrenceKey: null,
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
    recurrence: null,
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

function resolveReferencedProposalId(message: string, proposals: unknown) {
  const explicitProposalId = /\bschedule\s+proposal\s+(?<proposalId>[a-z0-9_-]+)/iu.exec(
    message,
  )?.groups?.proposalId;

  if (explicitProposalId) {
    return explicitProposalId;
  }

  return stringField(firstRecord(proposals), "id");
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

function hasExactScheduleSlot(normalizedMessage: string) {
  if (
    /\b(?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:am|pm)\b/u.test(
      normalizedMessage,
    ) ||
    /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/u.test(normalizedMessage)
  ) {
    return true;
  }

  return /\b(?:at|from|between|around)\s+(?:[1-9]|1[0-2]|noon|midnight)\b/u.test(
    normalizedMessage,
  );
}

function nextDayEndOfDay() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(23, 59, 0, 0);

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
