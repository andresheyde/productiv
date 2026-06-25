import type {
  CompiledSchedulingContext,
  SchedulingDayOfWeek,
  SchedulingTimeWindow,
  SleepWindow,
  WorkHoursRule,
  WorkPeriod,
} from "../scheduling-context/scheduling-context.types.ts";
import type { TaskRecurrence } from "../workspace/workspace.types.ts";

type ClockWindow = {
  startTime: string;
  endTime: string;
};

export type SchedulingPlacementPolicy = {
  defaultFocusBlockMinutes: number;
  rankedWorkPeriods: Array<{
    period: WorkPeriod;
    rank: number;
    suggestedWindow: ClockWindow;
    rationale: string;
  }>;
  hardConstraintChecks: string[];
  slotScoringRules: string[];
  taskPlacementRules: string[];
  goalFocusPlacementRules: string[];
  feedbackRules: string[];
};

export type SchedulingCandidateSlotContext = {
  horizon: {
    startTime: string;
    endTime: string;
    source: string;
  };
  defaultDurationMinutes: number;
  assumptions: string[];
  slots: SchedulingCandidateSlot[];
};

export type SchedulingCandidateSlot = {
  id: string;
  period: WorkPeriod;
  rank: number;
  score: number;
  availableWindow: {
    startTime: string;
    endTime: string;
    minutes: number;
  };
  recommendedBlock: {
    startTime: string;
    endTime: string;
    durationMinutes: number;
  };
  rationale: string[];
};

export type SchedulingAssemblyDraft = {
  horizon: SchedulingCandidateSlotContext["horizon"];
  strategy: string;
  assignments: SchedulingAssemblyAssignment[];
  unscheduledItems: SchedulingAssemblyUnscheduledItem[];
  assumptions: string[];
};

export type SchedulingAssemblyAssignment = {
  itemType: "task" | "goal_focus";
  actionTypeHint: "propose_schedule_task" | "propose_schedule_goal_focus";
  taskId: string | null;
  goalId: string | null;
  focusId: string | null;
  occurrenceKey: string | null;
  title: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  sourceSlotId: string;
  rationale: string[];
};

export type SchedulingAssemblyUnscheduledItem = {
  itemType: "task" | "goal_focus";
  taskId: string | null;
  goalId: string | null;
  focusId: string | null;
  title: string;
  reason: string;
};

type CalendarBusyEvent = {
  title?: string | null;
  start?: string | null;
  end?: string | null;
  allDay?: boolean | null;
};

export type SchedulingHorizonOverride = {
  startTime: Date;
  endTime: Date;
  source: string;
};

type MinuteRange = {
  start: number;
  end: number;
  label: string;
};

type ScheduleAssemblyTaskInput = {
  id: string;
  title: string;
  goalId: string | null;
  priorityRank: number;
  estimatedMinutes: number | null;
  dueAt: string | null;
  recurrence?: TaskRecurrence | null;
  scheduledDateKeys?: string[];
  revisionOccurrenceKeys?: string[];
  scheduleIntent: string;
  calendarStatus:
    | "scheduled"
    | "pending_proposal"
    | "needs_scheduling"
    | "not_requested";
};

type ScheduleAssemblyGoalInput = {
  id: string;
  title: string;
  priorityRank: number;
  status: string;
  scheduleGuidance?: Record<string, unknown> | null;
  focusAreas: Array<{
    id: string;
    title: string;
    status: string;
    defaultDurationMinutes: number | null;
    cadence: string | null;
  }>;
};

type AssemblyItem = {
  itemType: "task" | "goal_focus";
  actionTypeHint: "propose_schedule_task" | "propose_schedule_goal_focus";
  taskId: string | null;
  goalId: string | null;
  focusId: string | null;
  title: string;
  durationMinutes: number;
  priorityRank: number;
  dueAt: Date | null;
  occurrenceKey: string;
  targetDateKey: string | null;
  preferredPeriod: WorkPeriod | null;
  learnedPreferenceRationale: string[];
  sequenceRank: number | null;
  sequenceRationale: string[];
  rationale: string[];
};

type AssemblySegment = {
  sourceSlotId: string;
  dateKey: string;
  period: WorkPeriod;
  rank: number;
  score: number;
  startTime: Date;
  endTime: Date;
};

type AssemblyFeedbackPolicy = {
  dailyLoadLimitMinutes: number;
  bufferMinutes: number;
  rationale: string[];
};

type TaskOccurrenceAssemblyTarget = {
  dateKey: string | null;
  occurrenceKey: string;
};

type LearnedActivityPeriodPreference = {
  activityTitle: string;
  comparableActivityTitle: string;
  period: WorkPeriod;
  rationale: string;
};

type FocusSequencePreference = {
  rank: number;
  rationale: string[];
};

type LearnedAvoidedWorkPeriod = {
  period: WorkPeriod;
  rationale: string;
};

type SchedulingHorizon = {
  startTime: Date;
  endTime: Date;
  source: string;
  shouldSuggestSlots: boolean;
};

type DateRangeConnector = "to" | "through" | "until" | "between";

const DEFAULT_FOCUS_BLOCK_MINUTES = 30;
const DEFAULT_DAILY_ASSEMBLY_LOAD_LIMIT_MINUTES = 180;
const REDUCED_DAILY_ASSEMBLY_LOAD_LIMIT_MINUTES = 120;
const MAX_CANDIDATE_SLOTS = 18;
const MAX_ASSEMBLY_ASSIGNMENTS = 12;
const MAX_GOAL_FOCUS_ASSIGNMENTS = 6;
const ASSEMBLY_BUFFER_MINUTES = 10;
const EXPANDED_ASSEMBLY_BUFFER_MINUTES = 20;
const SCHEDULED_FOCUS_BLOCKS_GUIDANCE_KEY = "scheduledFocusBlocks";
const DEFAULT_WORK_PERIOD_ORDER: WorkPeriod[] = [
  "morning",
  "afternoon",
  "evening",
];

const WORK_PERIOD_WINDOWS: Record<WorkPeriod, ClockWindow> = {
  morning: {
    startTime: "08:00",
    endTime: "11:00",
  },
  afternoon: {
    startTime: "13:00",
    endTime: "16:00",
  },
  evening: {
    startTime: "18:00",
    endTime: "20:30",
  },
};

const WORK_PERIOD_LABELS: Record<WorkPeriod, string> = {
  morning: "morning",
  afternoon: "afternoon",
  evening: "evening",
};

export function buildSchedulingPlacementPolicy(input: {
  schedulingContext: CompiledSchedulingContext;
}): SchedulingPlacementPolicy {
  const defaultFocusBlockMinutes =
    input.schedulingContext.preferredFocusBlockMinutes ??
    DEFAULT_FOCUS_BLOCK_MINUTES;
  const rankedWorkPeriods = rankWorkPeriods(
    input.schedulingContext.preferredWorkPeriods,
  );

  return {
    defaultFocusBlockMinutes,
    rankedWorkPeriods,
    hardConstraintChecks: [
      "Reject candidate blocks that overlap saved work hours, no-schedule windows, sleep windows, recovery days, latest-work-end rules, or schedule-relevant calendar events.",
      "Keep explicit current user instructions first, then saved hard constraints, goal/task constraints, saved soft preferences, this policy, then assistant heuristics.",
      "If an exact user-requested slot conflicts with saved preferences, preserve the user's explicit choice and mention the conflict.",
    ],
    slotScoringRules: [
      "Prefer the earliest viable ranked work period for cognitively important work when the user has not named a time.",
      "Protect important goal-focus or habit blocks before urgent/admin tasks when both can still be completed on time.",
      "Place urgent tasks before due dates, but avoid letting urgency consume the user's first high-quality focus window unless the deadline truly requires it.",
      "Cluster related work and leave realistic buffers instead of filling every open gap.",
      "Cap generated non-urgent Productiv-added blocks to a realistic daily load instead of packing every available opening.",
      "Use the default focus block length when an item has no duration, unless the item has its own defaultDurationMinutes or estimatedMinutes.",
    ],
    taskPlacementRules: [
      "Schedule tasks marked needs_scheduling before creating duplicate proposals for tasks already pending or scheduled.",
      "Use task priorityRank, dueAt, estimatedMinutes, and scheduleIntent to decide inclusion and deadline pressure.",
      "Put lower-cognitive admin or cleanup tasks later than important focus work when viable.",
    ],
    goalFocusPlacementRules: [
      "Treat recurring habits and ongoing goal work as goal-focus blocks, not one-off tasks.",
      "Use focus-area defaultDurationMinutes and cadence when present; otherwise use the policy default duration and infer a cautious trial cadence from the request.",
      "When several focus areas compete, schedule the focus area most connected to the user's stated priority earlier in the day or week.",
    ],
    feedbackRules: [
      "Choose exact candidate blocks when enough context exists instead of asking the user to design the schedule.",
      "Treat schedule proposals as drafts: invite lightweight feedback after proposing, and revise from that feedback.",
      "Consider tentative learned preferences from recent feedback as soft scheduling guidance; do not treat them as accepted hard constraints.",
    ],
  };
}

export function buildSchedulingCandidateSlots(input: {
  message: string;
  schedulingContext: CompiledSchedulingContext;
  placementPolicy: SchedulingPlacementPolicy;
  calendarEvents: CalendarBusyEvent[];
  horizonOverride?: SchedulingHorizonOverride | null;
  now?: Date;
}): SchedulingCandidateSlotContext {
  const now = input.now ?? new Date();
  const horizonOverride = normalizeSchedulingHorizonOverride(input.horizonOverride);
  const horizon = horizonOverride
    ? { ...horizonOverride, shouldSuggestSlots: true }
    : inferSchedulingHorizon(input.message, now);

  if (!horizon.shouldSuggestSlots) {
    return {
      horizon: {
        startTime: horizon.startTime.toISOString(),
        endTime: horizon.endTime.toISOString(),
        source: horizon.source,
      },
      defaultDurationMinutes: input.placementPolicy.defaultFocusBlockMinutes,
      assumptions: ["No scheduling request was detected in the latest message."],
      slots: [],
    };
  }

  const slots: SchedulingCandidateSlot[] = [];
  const learnedContext = buildTentativeSchedulingContextOverlay(
    input.schedulingContext,
  );
  const sameTurnContext = buildSameTurnSchedulingContextOverlay(
    input.message,
    learnedContext.context,
  );
  const schedulingContext = sameTurnContext.context;
  const assumptions = [
    "Candidate slots are draft openings; the assistant should still match each item to its own duration, due date, and constraints.",
    "recommendedBlock is the ready-to-use default block when the item does not need a longer duration.",
    ...learnedContext.assumptions,
    ...sameTurnContext.assumptions,
  ];
  const rankedWorkPeriods = getMessageAdjustedRankedWorkPeriods(
    input.message,
    getContextAdjustedRankedWorkPeriods(
      input.message,
      schedulingContext,
      input.placementPolicy.rankedWorkPeriods,
    ),
  );

  for (const day of eachDay(horizon.startTime, horizon.endTime)) {
    if (schedulingContext.recoveryDays.includes(day.getDay() as SchedulingDayOfWeek)) {
      continue;
    }

    for (const rankedPeriod of rankedWorkPeriods) {
      const periodWindow = WORK_PERIOD_WINDOWS[rankedPeriod.period];
      const periodRange = {
        start: toMinutes(periodWindow.startTime),
        end: toMinutes(periodWindow.endTime),
        label: `${rankedPeriod.period} work period`,
      };
      const openRanges = subtractBusyRanges(
        [periodRange],
        buildBusyRanges(day, schedulingContext, input.calendarEvents),
      );

      for (const openRange of openRanges) {
        const viableOpenRange = trimOpenRangeToFuture(openRange, day, now);

        if (!viableOpenRange) {
          continue;
        }

        const availableMinutes = viableOpenRange.end - viableOpenRange.start;

        if (availableMinutes < Math.min(30, input.placementPolicy.defaultFocusBlockMinutes)) {
          continue;
        }

        const recommendedDuration = Math.min(
          input.placementPolicy.defaultFocusBlockMinutes,
          availableMinutes,
        );
        const recommendedStart = setDateMinutes(day, viableOpenRange.start);
        const recommendedEnd = setDateMinutes(
          day,
          viableOpenRange.start + recommendedDuration,
        );

        if (recommendedEnd.getTime() <= now.getTime()) {
          continue;
        }

        slots.push({
          id: [
            toDateKey(day),
            rankedPeriod.period,
            minutesToTime(viableOpenRange.start).replace(":", ""),
          ].join("-"),
          period: rankedPeriod.period,
          rank: rankedPeriod.rank,
          score: scoreCandidateSlot(
            day,
            viableOpenRange.start,
            rankedPeriod.rank,
            now,
          ),
          availableWindow: {
            startTime: setDateMinutes(day, viableOpenRange.start).toISOString(),
            endTime: setDateMinutes(day, viableOpenRange.end).toISOString(),
            minutes: availableMinutes,
          },
          recommendedBlock: {
            startTime: recommendedStart.toISOString(),
            endTime: recommendedEnd.toISOString(),
            durationMinutes: recommendedDuration,
          },
          rationale: [
            rankedPeriod.rationale,
            "Open after subtracting saved hard constraints and included calendar events.",
          ],
        });
      }
    }
  }

  return {
    horizon: {
      startTime: horizon.startTime.toISOString(),
      endTime: horizon.endTime.toISOString(),
      source: horizon.source,
    },
    defaultDurationMinutes: input.placementPolicy.defaultFocusBlockMinutes,
    assumptions,
    slots: slots
      .sort((left, right) => right.score - left.score)
      .slice(0, MAX_CANDIDATE_SLOTS),
  };
}

export function buildSchedulingAssemblyDraft(input: {
  message: string;
  candidateSlots: SchedulingCandidateSlotContext;
  tasks: ScheduleAssemblyTaskInput[];
  goals: ScheduleAssemblyGoalInput[];
  schedulingContext?: CompiledSchedulingContext | undefined;
  now?: Date;
}): SchedulingAssemblyDraft {
  const now = input.now ?? new Date();
  const feedbackPolicy = buildAssemblyFeedbackPolicy(
    input.message,
    input.schedulingContext,
  );
  const segments = input.candidateSlots.slots.map(slotToAssemblySegment);
  const items = buildAssemblyItems(input, now);
  const assignments: SchedulingAssemblyAssignment[] = [];
  const unscheduledItems: SchedulingAssemblyUnscheduledItem[] = [];
  const dailyLoadByDateKey = new Map<string, number>();

  for (const item of items.slice(0, MAX_ASSEMBLY_ASSIGNMENTS)) {
    const fit = findSegmentForItem(
      segments,
      item,
      dailyLoadByDateKey,
      feedbackPolicy,
      now,
    );

    if (fit.segmentIndex === -1) {
      unscheduledItems.push({
        itemType: item.itemType,
        taskId: item.taskId,
        goalId: item.goalId,
        focusId: item.focusId,
        title: item.title,
        reason: getUnscheduledItemReason(
          item,
          fit.blockedByDailyLoad,
          feedbackPolicy,
        ),
      });
      continue;
    }

    const segment = segments[fit.segmentIndex];

    if (!segment) {
      continue;
    }

    const startTime = new Date(segment.startTime);
    const endTime = addMinutes(startTime, item.durationMinutes);

    assignments.push({
      itemType: item.itemType,
      actionTypeHint: item.actionTypeHint,
      taskId: item.taskId,
      goalId: item.goalId,
      focusId: item.focusId,
      occurrenceKey: item.itemType === "task" ? item.occurrenceKey : null,
      title: item.title,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      durationMinutes: item.durationMinutes,
      sourceSlotId: segment.sourceSlotId,
      rationale: [
        ...item.rationale,
        ...item.learnedPreferenceRationale,
        ...item.sequenceRationale,
        ...getDueDatePlacementRationale(item, segment.dateKey),
        `Placed in the ${segment.period} candidate slot ranked ${segment.rank}.`,
        ...getDailyLoadRationale(
          item,
          dailyLoadByDateKey,
          segment.dateKey,
          feedbackPolicy,
          now,
        ),
      ],
    });
    dailyLoadByDateKey.set(
      segment.dateKey,
      (dailyLoadByDateKey.get(segment.dateKey) ?? 0) + item.durationMinutes,
    );

    const nextStartTime = addMinutes(endTime, feedbackPolicy.bufferMinutes);

    if (nextStartTime < segment.endTime) {
      segments[fit.segmentIndex] = {
        ...segment,
        startTime: nextStartTime,
      };
    } else {
      segments.splice(fit.segmentIndex, 1);
    }
  }

  return {
    horizon: input.candidateSlots.horizon,
    strategy:
      "Draft assembly assigns immediately due tasks first, protects goal-focus and habit blocks in earlier high-quality slots, then places remaining schedule-now tasks without overlaps.",
    assignments,
    unscheduledItems,
    assumptions: [
      "Use this draft for broad schedule-generation requests or when the latest user message names matching items.",
      "Do not schedule unrelated items just because they appear here; use it as deterministic placement guidance for items the assistant decides to propose.",
      "Assignments are non-overlapping and already account for saved hard constraints and included calendar events through the candidate slots.",
      `Non-urgent generated blocks are capped at ${feedbackPolicy.dailyLoadLimitMinutes} minutes per day for this draft; immediate deadline pressure may exceed that cap.`,
      `Generated blocks use at least ${feedbackPolicy.bufferMinutes} minutes of buffer in this draft.`,
      ...feedbackPolicy.rationale,
    ],
  };
}

function rankWorkPeriods(preferredWorkPeriods: WorkPeriod[]) {
  const uniquePreferredPeriods = uniqueWorkPeriods(preferredWorkPeriods);
  const orderedPeriods = [
    ...uniquePreferredPeriods,
    ...DEFAULT_WORK_PERIOD_ORDER.filter(
      (period) => !uniquePreferredPeriods.includes(period),
    ),
  ];

  return orderedPeriods.map((period, index) => ({
    period,
    rank: index + 1,
    suggestedWindow: WORK_PERIOD_WINDOWS[period],
    rationale:
      index < uniquePreferredPeriods.length
        ? `User saved ${WORK_PERIOD_LABELS[period]} as a preferred work period.`
        : `Default fallback ${WORK_PERIOD_LABELS[period]} work period.`,
  }));
}

function getMessageAdjustedRankedWorkPeriods(
  message: string,
  rankedWorkPeriods: SchedulingPlacementPolicy["rankedWorkPeriods"],
) {
  const avoidedPeriods = getLatestMessageAvoidedWorkPeriods(message);
  const filteredPeriods =
    avoidedPeriods.size > 0
      ? rankedWorkPeriods.filter(
          (rankedPeriod) => !avoidedPeriods.has(rankedPeriod.period),
        )
      : rankedWorkPeriods;
  const availablePeriods =
    filteredPeriods.length > 0 ? filteredPeriods : rankedWorkPeriods;
  const avoidanceRationale =
    filteredPeriods.length > 0 && filteredPeriods.length < rankedWorkPeriods.length
      ? formatLatestMessageAvoidanceRationale(avoidedPeriods)
      : null;
  const adjustedPeriods = avoidanceRationale
    ? availablePeriods.map((rankedPeriod, index) => ({
        ...rankedPeriod,
        rank: index + 1,
        rationale: `${rankedPeriod.rationale} ${avoidanceRationale}`,
      }))
    : availablePeriods;
  const directive = getLatestMessageWorkPeriodDirective(message, avoidedPeriods);

  if (!directive) {
    return adjustedPeriods;
  }

  const periodsByName = new Map(
    adjustedPeriods.map((rankedPeriod) => [rankedPeriod.period, rankedPeriod]),
  );

  return directive.order
    .flatMap((period) => {
      const rankedPeriod = periodsByName.get(period);
      return rankedPeriod ? [rankedPeriod] : [];
    })
    .map((rankedPeriod, index) => ({
      ...rankedPeriod,
      rank: index + 1,
      rationale: `${directive.rationale} ${rankedPeriod.rationale}`,
    }));
}

function getContextAdjustedRankedWorkPeriods(
  message: string,
  schedulingContext: CompiledSchedulingContext,
  rankedWorkPeriods: SchedulingPlacementPolicy["rankedWorkPeriods"],
) {
  const avoidedPeriods = buildLearnedAvoidedWorkPeriods(schedulingContext);

  if (avoidedPeriods.length === 0) {
    return rankedWorkPeriods;
  }

  const avoidedPeriodsByName = new Map(
    avoidedPeriods.map((avoidance) => [avoidance.period, avoidance]),
  );
  const explicitPeriods = getExplicitWorkPeriods(message);
  const latestMessageAvoidedPeriods = getLatestMessageAvoidedWorkPeriods(message);

  for (const period of latestMessageAvoidedPeriods) {
    explicitPeriods.delete(period);
  }

  const filteredPeriods = rankedWorkPeriods.filter(
    (rankedPeriod) =>
      !avoidedPeriodsByName.has(rankedPeriod.period) ||
      explicitPeriods.has(rankedPeriod.period),
  );

  if (filteredPeriods.length === 0) {
    return rankedWorkPeriods;
  }

  const avoidedRationale = avoidedPeriods
    .map((avoidance) => avoidance.rationale)
    .join(" ");

  return filteredPeriods.map((rankedPeriod, index) => ({
    ...rankedPeriod,
    rank: index + 1,
    rationale: `${rankedPeriod.rationale} ${avoidedRationale}`,
  }));
}

function getLatestMessageWorkPeriodDirective(
  message: string,
  avoidedPeriods: Set<WorkPeriod> = new Set(),
): {
  order: WorkPeriod[];
  rationale: string;
} | null {
  const normalized = message.toLowerCase();

  if (
    !avoidedPeriods.has("evening") &&
    /\b(evening|night|after work|after-work)\b/u.test(normalized)
  ) {
    return {
      order: ["evening", "afternoon", "morning"],
      rationale:
        "Latest message asked for evening or after-work timing, so later slots rank first.",
    };
  }

  if (
    /\blater\b/u.test(normalized) ||
    (!avoidedPeriods.has("afternoon") && /\bafternoon\b/u.test(normalized))
  ) {
    return {
      order: ["afternoon", "evening", "morning"],
      rationale:
        "Latest message asked to move this later, so afternoon slots rank first.",
    };
  }

  if (
    !avoidedPeriods.has("morning") &&
    /\b(earlier|early|morning|first thing)\b/u.test(normalized)
  ) {
    return {
      order: ["morning", "afternoon", "evening"],
      rationale:
        "Latest message asked for earlier or morning timing, so morning slots rank first.",
    };
  }

  return null;
}

function getExplicitWorkPeriods(message: string) {
  const normalized = message.toLowerCase();
  const periods = new Set<WorkPeriod>();

  if (/\bmornings?\b/u.test(normalized)) {
    periods.add("morning");
  }

  if (/\bafternoons?\b/u.test(normalized)) {
    periods.add("afternoon");
  }

  if (/\b(evenings?|night|after work|after-work)\b/u.test(normalized)) {
    periods.add("evening");
  }

  return periods;
}

function getLatestMessageAvoidedWorkPeriods(message: string) {
  const normalized = message.toLowerCase();
  const avoidedPeriods = new Set<WorkPeriod>();

  for (const period of DEFAULT_WORK_PERIOD_ORDER) {
    if (messageAvoidsWorkPeriod(normalized, period)) {
      avoidedPeriods.add(period);
    }
  }

  return avoidedPeriods;
}

function messageAvoidsWorkPeriod(normalizedMessage: string, period: WorkPeriod) {
  const periodPattern = getWorkPeriodMessagePattern(period);
  const negativeBeforePeriod = new RegExp(
    [
      "\\b(?:can['’]?t|cant|cannot|won['’]?t|wont|avoid|busy|unavailable|conflict|blocked|",
      "not\\s+available|not\\s+free|do\\s+not|don['’]?t|doesn['’]?t\\s+work|does\\s+not\\s+work|",
      "isn['’]?t\\s+good|is\\s+not\\s+good|not\\s+good)\\b",
      ".{0,60}",
      periodPattern,
    ].join(""),
    "iu",
  );
  const periodBeforeNegative = new RegExp(
    [
      periodPattern,
      ".{0,60}",
      "\\b(?:doesn['’]?t\\s+work|does\\s+not\\s+work|won['’]?t\\s+work|wont\\s+work|",
      "isn['’]?t\\s+good|is\\s+not\\s+good|aren['’]?t\\s+good|are\\s+not\\s+good|",
      "is\\s+unavailable|are\\s+unavailable|is\\s+blocked|are\\s+blocked|",
      "is\\s+busy|are\\s+busy|is\\s+off-limits|are\\s+off-limits)\\b",
    ].join(""),
    "iu",
  );
  const noPeriod = new RegExp(
    [
      "\\bno\\s+(?:more\\s+)?",
      "(?:scheduling\\s+|schedule\\s+|blocks?\\s+|work\\s+|tasks?\\s+|appointments?\\s+)?",
      "(?:in\\s+the\\s+|during\\s+the\\s+)?",
      periodPattern,
    ].join(""),
    "iu",
  );

  return (
    negativeBeforePeriod.test(normalizedMessage) ||
    periodBeforeNegative.test(normalizedMessage) ||
    noPeriod.test(normalizedMessage)
  );
}

function getWorkPeriodMessagePattern(period: WorkPeriod) {
  switch (period) {
    case "morning":
      return "\\b(?:mornings?|the\\s+morning|before\\s+noon|early\\s+in\\s+the\\s+day|first\\s+thing)\\b";
    case "afternoon":
      return "\\b(?:afternoons?|the\\s+afternoon)\\b";
    case "evening":
      return "\\b(?:evenings?|the\\s+evening|night|after\\s+work|after-work)\\b";
  }
}

function formatLatestMessageAvoidanceRationale(avoidedPeriods: Set<WorkPeriod>) {
  const labels = DEFAULT_WORK_PERIOD_ORDER.filter((period) =>
    avoidedPeriods.has(period),
  ).map((period) => WORK_PERIOD_LABELS[period]);

  return labels
    .map(
      (label) =>
        `Latest feedback says ${label} is unavailable, so Productiv avoided those slots for this draft.`,
    )
    .join(" ");
}

function uniqueWorkPeriods(value: WorkPeriod[]) {
  return DEFAULT_WORK_PERIOD_ORDER.filter((period) => value.includes(period));
}

function buildTentativeSchedulingContextOverlay(
  schedulingContext: CompiledSchedulingContext,
): {
  context: CompiledSchedulingContext;
  assumptions: string[];
} {
  const learnedPreferenceText =
    schedulingContext.tentativeDerivedPreferences.join(". ");
  const workHours = inferLatestMessageWorkHours(learnedPreferenceText);
  const sleepWindow = inferLatestMessageSleepWindow(learnedPreferenceText);
  const noScheduleWindows =
    inferLatestMessageNoScheduleWindows(learnedPreferenceText);
  const assumptions: string[] = [];

  if (workHours.length > 0) {
    assumptions.push(
      `Tentative learned availability says ${formatDayList(
        workHours.map((rule) => rule.dayOfWeek),
      )} ${workHours[0]?.startTime}-${workHours[0]?.endTime} are protected work hours, so Productiv blocked them for this draft.`,
    );
  }

  if (sleepWindow) {
    assumptions.push(
      `Tentative learned availability says sleep is ${sleepWindow.startTime}-${sleepWindow.endTime}, so Productiv blocked that sleep window for this draft.`,
    );
  }

  for (const window of noScheduleWindows) {
    assumptions.push(
      `Tentative learned availability says ${window.label || "a fixed commitment"} blocks ${formatDayList([
        window.dayOfWeek,
      ])} ${window.startTime}-${window.endTime}, so Productiv blocked it for this draft.`,
    );
  }

  if (
    workHours.length === 0 &&
    !sleepWindow &&
    noScheduleWindows.length === 0
  ) {
    return {
      context: schedulingContext,
      assumptions,
    };
  }

  return {
    context: {
      ...schedulingContext,
      workHours:
        workHours.length > 0
          ? mergeSameTurnWorkHours(schedulingContext.workHours, workHours)
          : schedulingContext.workHours,
      sleepWindow: sleepWindow ?? schedulingContext.sleepWindow,
      noScheduleWindows:
        noScheduleWindows.length > 0
          ? [...schedulingContext.noScheduleWindows, ...noScheduleWindows]
          : schedulingContext.noScheduleWindows,
    },
    assumptions,
  };
}

function buildSameTurnSchedulingContextOverlay(
  message: string,
  schedulingContext: CompiledSchedulingContext,
): {
  context: CompiledSchedulingContext;
  assumptions: string[];
} {
  const workHours = inferLatestMessageWorkHours(message);
  const sleepWindow = inferLatestMessageSleepWindow(message);
  const noScheduleWindows = inferLatestMessageNoScheduleWindows(message);
  const assumptions: string[] = [];

  if (workHours.length > 0) {
    assumptions.push(
      `Latest message says ${formatDayList(
        workHours.map((rule) => rule.dayOfWeek),
      )} ${workHours[0]?.startTime}-${workHours[0]?.endTime} are protected work hours, so Productiv blocked them for this draft.`,
    );
  }

  if (sleepWindow) {
    assumptions.push(
      `Latest message says sleep is ${sleepWindow.startTime}-${sleepWindow.endTime}, so Productiv blocked that sleep window for this draft.`,
    );
  }

  for (const window of noScheduleWindows) {
    assumptions.push(
      `Latest message says ${window.label || "a fixed commitment"} blocks ${formatDayList([
        window.dayOfWeek,
      ])} ${window.startTime}-${window.endTime}, so Productiv blocked it for this draft.`,
    );
  }

  if (
    workHours.length === 0 &&
    !sleepWindow &&
    noScheduleWindows.length === 0
  ) {
    return {
      context: schedulingContext,
      assumptions,
    };
  }

  return {
    context: {
      ...schedulingContext,
      workHours:
        workHours.length > 0
          ? mergeSameTurnWorkHours(schedulingContext.workHours, workHours)
          : schedulingContext.workHours,
      sleepWindow: sleepWindow ?? schedulingContext.sleepWindow,
      noScheduleWindows:
        noScheduleWindows.length > 0
          ? [...schedulingContext.noScheduleWindows, ...noScheduleWindows]
          : schedulingContext.noScheduleWindows,
    },
    assumptions,
  };
}

function inferLatestMessageWorkHours(message: string): WorkHoursRule[] {
  const workHours: WorkHoursRule[] = [];
  const parts = getSameTurnSchedulingClauses(message);

  for (const part of parts) {
    if (!hasWorkHoursCue(part)) {
      continue;
    }

    const timeRange = parseClockRange(part, {
      defaultStartMeridiem: "am",
      defaultEndMeridiem: "pm",
      allowCrossMidnight: false,
    });

    if (!timeRange) {
      continue;
    }

    const days = inferDaysFromText(part) ?? ([1, 2, 3, 4, 5] as const);

    workHours.push(
      ...days.map((dayOfWeek) => ({
        dayOfWeek,
        enabled: true,
        startTime: timeRange.startTime,
        endTime: timeRange.endTime,
      })),
    );
  }

  return workHours;
}

function inferLatestMessageSleepWindow(message: string): SleepWindow | null {
  for (const part of getSameTurnSchedulingClauses(message)) {
    if (
      !/\b(?:sleep|bedtime|bed time|asleep|go to bed|wake up|waking up)\b/iu.test(
        part,
      )
    ) {
      continue;
    }

    const timeRange = parseClockRange(part, {
      defaultStartMeridiem: "pm",
      defaultEndMeridiem: "am",
      allowCrossMidnight: true,
    });

    if (timeRange) {
      return timeRange;
    }
  }

  return null;
}

function inferLatestMessageNoScheduleWindows(
  message: string,
): SchedulingTimeWindow[] {
  const windows: SchedulingTimeWindow[] = [];
  const parts = getSameTurnSchedulingClauses(message);

  for (const [partIndex, part] of parts.entries()) {
    if (!hasFixedCommitmentCue(part) || hasWorkHoursCue(part)) {
      continue;
    }

    const days = inferDaysFromText(part);
    const timeRange = parseClockRange(part, {
      defaultStartMeridiem: "pm",
      defaultEndMeridiem: "pm",
      allowCrossMidnight: false,
    });

    if (!days || !timeRange) {
      continue;
    }

    for (const [dayIndex, dayOfWeek] of days.entries()) {
      windows.push({
        id: `latest-message-${partIndex}-${dayIndex}`,
        dayOfWeek,
        startTime: timeRange.startTime,
        endTime: timeRange.endTime,
        label: inferFixedCommitmentLabel(part),
      });
    }
  }

  return windows;
}

function getSameTurnSchedulingClauses(message: string) {
  return message
    .replace(/\b(?:here(?:'s| is)?|this is)\s+(?:my\s+)?schedule:?\s*/giu, " ")
    .split(/[.;\n]|\s*,\s*/u)
    .map((part) => part.replace(/\s+/gu, " ").trim())
    .filter(Boolean);
}

function mergeSameTurnWorkHours(
  existingWorkHours: WorkHoursRule[],
  sameTurnWorkHours: WorkHoursRule[],
) {
  const daysToReplace = new Set(
    sameTurnWorkHours.map((rule) => rule.dayOfWeek),
  );

  return [
    ...existingWorkHours.filter((rule) => !daysToReplace.has(rule.dayOfWeek)),
    ...sameTurnWorkHours,
  ].sort((left, right) => left.dayOfWeek - right.dayOfWeek);
}

function hasWorkHoursCue(value: string) {
  return /\b(?:work\s+hours|working\s+hours|office\s+hours|office|job|shift|i\s+work|work\s+(?:weekdays?|weekends?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?))\b/iu.test(
    value,
  );
}

function hasFixedCommitmentCue(value: string) {
  return /\b(?:class|lecture|lab|meeting|appointment|therapy|commute|practice|lesson|school|college|workshop|seminar|standup|shift|unavailable|busy|blocked|not\s+free|not\s+available)\b/iu.test(
    value,
  );
}

function inferFixedCommitmentLabel(value: string) {
  const match =
    /\b(?<label>class|lecture|lab|meeting|appointment|therapy|commute|practice|lesson|school|college|workshop|seminar|standup|shift)\b/iu.exec(
      value,
    );
  const label = match?.groups?.label;

  return label ? label.charAt(0).toUpperCase() + label.slice(1).toLowerCase() : "Fixed commitment";
}

function inferDaysFromText(value: string): SchedulingDayOfWeek[] | null {
  const normalized = value.toLowerCase();

  if (/\b(?:weekdays?|monday\s*(?:-|to|through|thru)\s*friday|mon\s*(?:-|to|through|thru)\s*fri)\b/u.test(normalized)) {
    return [1, 2, 3, 4, 5];
  }

  if (/\bweekends?\b/u.test(normalized)) {
    return [0, 6];
  }

  const rangeMatch =
    /\b(?<start>sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\s*(?:-|to|through|thru)\s*(?<end>sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/u.exec(
      normalized,
    );

  if (rangeMatch?.groups?.start && rangeMatch.groups.end) {
    return weekdayRange(
      shortWeekdayNameToDay(rangeMatch.groups.start),
      shortWeekdayNameToDay(rangeMatch.groups.end),
    );
  }

  const days = new Set<SchedulingDayOfWeek>();
  const weekdayPattern =
    /\b(sundays?|mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/giu;

  for (const match of normalized.matchAll(weekdayPattern)) {
    const day = shortWeekdayNameToDay(match[1] ?? "");
    days.add(day);
  }

  return days.size > 0 ? [...days].sort() : null;
}

function weekdayRange(
  start: SchedulingDayOfWeek,
  end: SchedulingDayOfWeek,
): SchedulingDayOfWeek[] {
  const days: SchedulingDayOfWeek[] = [];
  let cursor = start;

  while (true) {
    days.push(cursor);

    if (cursor === end) {
      return days;
    }

    cursor = ((cursor + 1) % 7) as SchedulingDayOfWeek;
  }
}

function shortWeekdayNameToDay(value: string): SchedulingDayOfWeek {
  const normalized = value.toLowerCase();

  if (normalized.startsWith("sun")) {
    return 0;
  }

  if (normalized.startsWith("mon")) {
    return 1;
  }

  if (normalized.startsWith("tue")) {
    return 2;
  }

  if (normalized.startsWith("wed")) {
    return 3;
  }

  if (normalized.startsWith("thu")) {
    return 4;
  }

  if (normalized.startsWith("fri")) {
    return 5;
  }

  if (normalized.startsWith("sat")) {
    return 6;
  }

  return 0;
}

function parseClockRange(
  value: string,
  options: {
    defaultStartMeridiem: "am" | "pm";
    defaultEndMeridiem: "am" | "pm";
    allowCrossMidnight: boolean;
  },
): ClockWindow | null {
  const match =
    /\b(?<startHour>\d{1,2})(?::(?<startMinute>\d{2}))?\s*(?<startMeridiem>a\.?m\.?|p\.?m\.?)?\s*(?:-|–|—|to|until|through|thru)\s*(?<endHour>\d{1,2})(?::(?<endMinute>\d{2}))?\s*(?<endMeridiem>a\.?m\.?|p\.?m\.?)?\b/iu.exec(
      value,
    );

  if (!match?.groups) {
    return null;
  }

  const startTime = normalizeClockMatchTime({
    hour: match.groups.startHour,
    minute: match.groups.startMinute,
    meridiem: match.groups.startMeridiem,
    fallbackMeridiem: options.defaultStartMeridiem,
  });
  const inferredEndMeridiem = inferImplicitEndMeridiem({
    startHour: match.groups.startHour,
    startMeridiem: match.groups.startMeridiem,
    endHour: match.groups.endHour,
    fallbackMeridiem: options.defaultEndMeridiem,
  });
  const endTime = normalizeClockMatchTime({
    hour: match.groups.endHour,
    minute: match.groups.endMinute,
    meridiem: match.groups.endMeridiem ?? inferredEndMeridiem,
    fallbackMeridiem: options.defaultEndMeridiem,
  });

  if (!startTime || !endTime || startTime === endTime) {
    return null;
  }

  if (!options.allowCrossMidnight && toMinutes(endTime) <= toMinutes(startTime)) {
    return null;
  }

  return {
    startTime,
    endTime,
  };
}

function inferImplicitEndMeridiem(input: {
  startHour: string | undefined;
  startMeridiem: string | undefined;
  endHour: string | undefined;
  fallbackMeridiem: "am" | "pm";
}) {
  const startMeridiem = normalizeMeridiem(input.startMeridiem);

  if (!startMeridiem || !input.startHour || !input.endHour) {
    return undefined;
  }

  const startHour = Number.parseInt(input.startHour, 10);
  const endHour = Number.parseInt(input.endHour, 10);

  if (endHour > startHour) {
    return startMeridiem;
  }

  return input.fallbackMeridiem;
}

function normalizeClockMatchTime(input: {
  hour: string | undefined;
  minute: string | undefined;
  meridiem: string | undefined;
  fallbackMeridiem: "am" | "pm";
}) {
  if (!input.hour) {
    return null;
  }

  const hour = Number.parseInt(input.hour, 10);
  const minute = Number.parseInt(input.minute ?? "0", 10);

  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) {
    return null;
  }

  const meridiem = normalizeMeridiem(input.meridiem) ?? input.fallbackMeridiem;
  const normalizedHour =
    hour === 12 ? (meridiem === "pm" ? 12 : 0) : meridiem === "pm" ? hour + 12 : hour;

  return minutesToTime(normalizedHour * 60 + minute);
}

function normalizeMeridiem(value: string | undefined) {
  const normalized = value?.toLowerCase().replace(/\./gu, "");

  if (normalized === "am" || normalized === "pm") {
    return normalized;
  }

  return null;
}

function formatDayList(days: SchedulingDayOfWeek[]) {
  const labels = Array.from(new Set(days))
    .sort()
    .map((day) => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day]);

  if (labels.length <= 2) {
    return labels.join(" and ");
  }

  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

function buildAssemblyItems(
  input: {
    message: string;
    candidateSlots: SchedulingCandidateSlotContext;
    tasks: ScheduleAssemblyTaskInput[];
    goals: ScheduleAssemblyGoalInput[];
    schedulingContext?: CompiledSchedulingContext | undefined;
  },
  now: Date,
): AssemblyItem[] {
  if (input.candidateSlots.slots.length === 0) {
    return [];
  }

  const learnedActivityPeriodPreferences = buildActivityPeriodPreferences(
    input.message,
    input.schedulingContext,
  );
  const horizonStart = parseDate(input.candidateSlots.horizon.startTime) ?? now;
  const horizonEnd =
    parseDate(input.candidateSlots.horizon.endTime) ?? addDays(now, 7);
  const horizonDateKeys = dateKeysBetween(horizonStart, horizonEnd);
  const availableDateKeys = getCandidateSlotDateKeys(input.candidateSlots);
  const taskItems = input.tasks
    .filter((task) => shouldAssembleTask(task, input.message))
    .flatMap((task) =>
      buildTaskAssemblyItems({
        task,
        defaultDurationMinutes: input.candidateSlots.defaultDurationMinutes,
        horizonDateKeys,
        availableDateKeys,
        learnedActivityPeriodPreferences,
      }),
    );
  const focusItems = shouldAssembleGoalFocus(input.message)
    ? buildGoalFocusAssemblyItems(
        input.goals,
        input.candidateSlots,
        now,
        learnedActivityPeriodPreferences,
        buildFocusSequencePreferences(input.message, input.goals),
      )
    : [];

  return [...taskItems, ...focusItems].sort(compareAssemblyItems(now));
}

function shouldAssembleTask(
  task: ScheduleAssemblyTaskInput,
  message: string,
) {
  if (task.scheduleIntent === "someday") {
    return false;
  }

  if (task.calendarStatus === "needs_scheduling") {
    return true;
  }

  return (
    task.calendarStatus === "not_requested" &&
    messageRequestsTaskBacklogScheduling(message)
  );
}

function messageRequestsTaskBacklogScheduling(message: string) {
  return (
    /\b(?:schedule|calendar|plan|timebox|block)\b.{0,80}\b(?:tasks?|to-?dos?|task\s+list|todo\s+list|errands?|backlog|everything)\b/iu.test(
      message,
    ) ||
    /\b(?:tasks?|to-?dos?|task\s+list|todo\s+list|errands?|backlog|everything)\b.{0,80}\b(?:schedule|calendar|plan|timebox|block)\b/iu.test(
      message,
    )
  );
}

function buildTaskAssemblyItems(input: {
  task: ScheduleAssemblyTaskInput;
  defaultDurationMinutes: number;
  horizonDateKeys: string[];
  availableDateKeys: string[];
  learnedActivityPeriodPreferences: LearnedActivityPeriodPreference[];
}): AssemblyItem[] {
  const learnedPreference = findLearnedActivityPeriodPreference(
    input.task.title,
    input.learnedActivityPeriodPreferences,
  );
  const durationMinutes =
    input.task.estimatedMinutes ?? input.defaultDurationMinutes;
  const recurrenceTargets = input.task.recurrence
    ? getRevisionOccurrenceTargets(input.task) ??
      getTaskOccurrenceTargets(
        input.task.recurrence,
        input.horizonDateKeys,
        input.availableDateKeys,
        new Set([
          ...(input.task.scheduledDateKeys ?? []),
          ...input.task.recurrence.scheduledOccurrences.map(
            (occurrence) => occurrence.dateKey,
          ),
        ]),
      ).map((dateKey) => ({
        dateKey,
        occurrenceKey: `${input.task.id}:${dateKey}`,
      }))
    : [];
  const targetOccurrences =
    input.task.recurrence && recurrenceTargets.length > 0
      ? recurrenceTargets
      : [
          {
            dateKey: null,
            occurrenceKey: input.task.recurrence
              ? `${input.task.id}:0`
              : input.task.id,
          },
        ];

  return targetOccurrences.map((targetOccurrence): AssemblyItem => {
    const targetDateKey = targetOccurrence.dateKey;
    const recurrenceRationale = input.task.recurrence
      ? [
          `Task follows ${formatTaskRecurrenceForRationale(input.task.recurrence)} recurrence.`,
          targetDateKey
            ? `This task occurrence targets ${targetDateKey} so repeated tasks do not stack on one day.`
            : "This repeated task can use the highest-quality available slot.",
        ]
      : [];

    return {
      itemType: "task",
      actionTypeHint: "propose_schedule_task",
      taskId: input.task.id,
      goalId: input.task.goalId,
      focusId: null,
      title: input.task.title,
      durationMinutes,
      priorityRank: input.task.priorityRank,
      dueAt: input.task.recurrence ? null : parseDate(input.task.dueAt),
      occurrenceKey: input.task.recurrence
        ? targetOccurrence.occurrenceKey
        : input.task.id,
      targetDateKey,
      preferredPeriod: learnedPreference?.period ?? null,
      learnedPreferenceRationale: learnedPreference
        ? [learnedPreference.rationale]
        : [],
      sequenceRank: null,
      sequenceRationale: [],
      rationale: [
        input.task.dueAt && !input.task.recurrence
          ? "Task has a due date and needs calendar time."
          : "Task is marked as needing calendar time.",
        ...recurrenceRationale,
      ],
    };
  });
}

function getRevisionOccurrenceTargets(task: ScheduleAssemblyTaskInput) {
  const revisionOccurrenceKeys = task.revisionOccurrenceKeys ?? [];

  if (!task.recurrence || revisionOccurrenceKeys.length === 0) {
    return null;
  }

  const targets: TaskOccurrenceAssemblyTarget[] = [];
  const seenOccurrenceKeys = new Set<string>();

  for (const occurrenceKey of revisionOccurrenceKeys) {
    if (seenOccurrenceKeys.has(occurrenceKey)) {
      continue;
    }

    const dateKey = dateKeyFromTaskOccurrenceKey(occurrenceKey, task.id);

    if (!dateKey) {
      continue;
    }

    targets.push({ dateKey, occurrenceKey });
    seenOccurrenceKeys.add(occurrenceKey);
  }

  return targets.length > 0 ? targets : null;
}

function dateKeyFromTaskOccurrenceKey(value: string, taskId: string) {
  const prefix = `${taskId}:`;

  if (!value.startsWith(prefix)) {
    return null;
  }

  const dateKey = value.slice(prefix.length);

  return /^\d{4}-\d{2}-\d{2}$/u.test(dateKey) ? dateKey : null;
}

function getTaskOccurrenceTargets(
  recurrence: TaskRecurrence | null,
  horizonDateKeys: string[],
  availableDateKeys: string[],
  scheduledDateKeys: Set<string>,
) {
  if (!recurrence) {
    return [];
  }

  const availableTargets = horizonDateKeys.filter((dateKey) =>
    availableDateKeys.includes(dateKey) && !scheduledDateKeys.has(dateKey),
  );
  const boundedTargets = recurrence.endsAt
    ? availableTargets.filter((dateKey) => {
        const date = parseDate(`${dateKey}T00:00:00.000Z`);
        const endsAt = parseDate(recurrence.endsAt);
        return date && endsAt ? date <= endsAt : true;
      })
    : availableTargets;

  if (boundedTargets.length === 0) {
    return [];
  }

  if (recurrence.frequency === "daily") {
    return boundedTargets.filter((_, index) => index % recurrence.interval === 0);
  }

  if (recurrence.frequency === "weekly") {
    const matchingDays =
      recurrence.daysOfWeek.length > 0
        ? boundedTargets.filter((dateKey) =>
            recurrence.daysOfWeek.includes(getDayOfWeekForDateKey(dateKey)),
          )
        : [];

    if (matchingDays.length > 0) {
      return matchingDays.filter((_, index) => index % recurrence.interval === 0);
    }

    return pickEvenlySpacedDateKeys(
      boundedTargets,
      Math.max(1, Math.ceil(boundedTargets.length / (7 * recurrence.interval))),
    );
  }

  if (recurrence.frequency === "monthly") {
    return pickEvenlySpacedDateKeys(boundedTargets, 1);
  }

  return pickEvenlySpacedDateKeys(boundedTargets, Math.min(3, boundedTargets.length));
}

function formatTaskRecurrenceForRationale(recurrence: TaskRecurrence) {
  if (recurrence.frequency === "weekly" && recurrence.daysOfWeek.length > 0) {
    return `weekly (${recurrence.daysOfWeek
      .map(formatDayOfWeek)
      .join(", ")})`;
  }

  return recurrence.frequency;
}

function formatDayOfWeek(dayOfWeek: number) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dayOfWeek] ?? "day";
}

function shouldAssembleGoalFocus(message: string) {
  return /\b(schedule|calendar|plan my|generate my schedule|focus|goal|habit|routine|practice|study|workout)\b/iu.test(
    message,
  );
}

function buildGoalFocusAssemblyItems(
  goals: ScheduleAssemblyGoalInput[],
  candidateSlots: SchedulingCandidateSlotContext,
  now: Date,
  learnedActivityPeriodPreferences: LearnedActivityPeriodPreference[],
  focusSequencePreferences: Map<string, FocusSequencePreference>,
): AssemblyItem[] {
  const horizonStart = parseDate(candidateSlots.horizon.startTime) ?? now;
  const horizonEnd = parseDate(candidateSlots.horizon.endTime) ?? addDays(now, 7);
  const horizonDateKeys = dateKeysBetween(horizonStart, horizonEnd);
  const availableDateKeys = getCandidateSlotDateKeys(candidateSlots);
  const itemGroups: AssemblyItem[][] = [];

  for (const goal of goals
    .filter((goal) => goal.status === "active")
    .sort((left, right) => left.priorityRank - right.priorityRank)) {
    const activeFocusAreas = goal.focusAreas.filter(
      (focusArea) => focusArea.status === "active",
    );

    for (const [focusAreaIndex, focusArea] of activeFocusAreas.entries()) {
      const learnedPreference = findLearnedActivityPeriodPreference(
        focusArea.title,
        learnedActivityPeriodPreferences,
      );
      const sequencePreference = focusSequencePreferences.get(
        getFocusSequencePreferenceKey(goal.id, focusArea.id),
      );
      const scheduledDateKeys = getScheduledFocusDateKeysForHorizon(
        goal.scheduleGuidance ?? null,
        focusArea,
        horizonStart,
        horizonEnd,
      );
      const occurrences = getFocusOccurrenceTargets(
        focusArea.cadence,
        horizonDateKeys,
        availableDateKeys,
        scheduledDateKeys,
      );
      const focusItems: AssemblyItem[] = [];

      for (let index = 0; index < occurrences.length; index += 1) {
        const targetDateKey = occurrences[index] ?? null;
        const scheduledMemoryRationale =
          scheduledDateKeys.size > 0
            ? [
                `${scheduledDateKeys.size} ${formatFocusBlockCount(scheduledDateKeys.size)} for this focus area already exist in the horizon, so Productiv only proposes uncovered occurrences.`,
              ]
            : [];

        focusItems.push({
          itemType: "goal_focus",
          actionTypeHint: "propose_schedule_goal_focus",
          taskId: null,
          goalId: goal.id,
          focusId: focusArea.id,
          title: focusArea.title,
          durationMinutes:
            focusArea.defaultDurationMinutes ??
            candidateSlots.defaultDurationMinutes,
          priorityRank: goal.priorityRank,
          dueAt: null,
          occurrenceKey: `${goal.id}:${focusArea.id}:${targetDateKey ?? index}`,
          targetDateKey,
          preferredPeriod: learnedPreference?.period ?? null,
          learnedPreferenceRationale: learnedPreference
            ? [learnedPreference.rationale]
            : [],
          sequenceRank: sequencePreference?.rank ?? focusAreaIndex + 1,
          sequenceRationale:
            sequencePreference?.rationale ??
            [
              `Keeps ${focusArea.title} in the saved focus-plan order for ${goal.title}.`,
            ],
          rationale: [
            focusArea.cadence
              ? `Goal focus follows cadence ${focusArea.cadence}.`
              : "Goal focus has no exact cadence, so Productiv proposes a cautious starter pattern.",
            targetDateKey
              ? `This repeated focus occurrence targets ${targetDateKey} so recurring blocks do not stack on one day.`
              : "This starter focus block can use the highest-quality available slot.",
            "Goal-focus work is protected before flexible admin work when viable.",
            ...scheduledMemoryRationale,
          ],
        });
      }

      if (focusItems.length > 0) {
        itemGroups.push(focusItems);
      }
    }
  }

  return selectBalancedGoalFocusAssemblyItems(
    itemGroups,
    MAX_GOAL_FOCUS_ASSIGNMENTS,
  );
}

function selectBalancedGoalFocusAssemblyItems(
  itemGroups: AssemblyItem[][],
  maxItems: number,
) {
  const selected: AssemblyItem[] = [];
  const maxGroupLength = Math.max(0, ...itemGroups.map((group) => group.length));

  for (let index = 0; index < maxGroupLength; index += 1) {
    for (const group of itemGroups) {
      const item = group[index];

      if (!item) {
        continue;
      }

      selected.push(item);

      if (selected.length >= maxItems) {
        return selected;
      }
    }
  }

  return selected;
}

function buildFocusSequencePreferences(
  message: string,
  goals: ScheduleAssemblyGoalInput[],
) {
  const preferences = new Map<string, FocusSequencePreference>();

  for (const goal of goals.filter((goal) => goal.status === "active")) {
    const activeFocusAreas = goal.focusAreas.filter(
      (focusArea) => focusArea.status === "active",
    );
    const sequenceEdges: Array<{
      beforeId: string;
      afterId: string;
      rationale: string;
    }> = [];

    for (let leftIndex = 0; leftIndex < activeFocusAreas.length; leftIndex += 1) {
      const leftFocusArea = activeFocusAreas[leftIndex];

      if (!leftFocusArea) {
        continue;
      }

      for (
        let rightIndex = leftIndex + 1;
        rightIndex < activeFocusAreas.length;
        rightIndex += 1
      ) {
        const rightFocusArea = activeFocusAreas[rightIndex];

        if (!rightFocusArea) {
          continue;
        }

        const ordering = getLatestMessageFocusOrdering(
          message,
          leftFocusArea.title,
          rightFocusArea.title,
        );

        if (!ordering) {
          continue;
        }

        const beforeFocusArea =
          ordering === "left_before_right" ? leftFocusArea : rightFocusArea;
        const afterFocusArea =
          ordering === "left_before_right" ? rightFocusArea : leftFocusArea;

        sequenceEdges.push({
          beforeId: beforeFocusArea.id,
          afterId: afterFocusArea.id,
          rationale: `Latest message says ${beforeFocusArea.title} should happen before ${afterFocusArea.title}.`,
        });
      }
    }

    if (sequenceEdges.length === 0) {
      continue;
    }

    const sequenceRanks = getFocusSequenceRanks(activeFocusAreas, sequenceEdges);

    for (const [focusId, rank] of sequenceRanks) {
      const rationale = sequenceEdges.flatMap((edge) =>
        edge.beforeId === focusId || edge.afterId === focusId
          ? [edge.rationale]
          : [],
      );

      preferences.set(getFocusSequencePreferenceKey(goal.id, focusId), {
        rank,
        rationale: [...new Set(rationale)],
      });
    }
  }

  return preferences;
}

function getLatestMessageFocusOrdering(
  message: string,
  leftTitle: string,
  rightTitle: string,
): "left_before_right" | "right_before_left" | null {
  if (messageOrdersTitleBeforeOtherTitle(message, leftTitle, rightTitle)) {
    return "left_before_right";
  }

  if (messageOrdersTitleBeforeOtherTitle(message, rightTitle, leftTitle)) {
    return "right_before_left";
  }

  return null;
}

function messageOrdersTitleBeforeOtherTitle(
  message: string,
  beforeTitle: string,
  afterTitle: string,
) {
  const beforePattern = titleToMessagePattern(beforeTitle);
  const afterPattern = titleToMessagePattern(afterTitle);
  const beforeThenAfter = new RegExp(
    `${beforePattern}.{0,80}\\b(?:before|ahead\\s+of|prior\\s+to)\\b.{0,80}${afterPattern}`,
    "iu",
  );
  const afterThenBefore = new RegExp(
    `${afterPattern}.{0,80}\\b(?:after|following)\\b.{0,80}${beforePattern}`,
    "iu",
  );

  return beforeThenAfter.test(message) || afterThenBefore.test(message);
}

function titleToMessagePattern(title: string) {
  const words = normalizeComparableTitle(title)
    .split(" ")
    .filter((word) => word.length > 0)
    .map(escapeRegExp);

  return `\\b${words.join("\\s+")}\\b`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function getFocusSequenceRanks(
  focusAreas: ScheduleAssemblyGoalInput["focusAreas"],
  sequenceEdges: Array<{ beforeId: string; afterId: string }>,
) {
  const orderedFocusIds = focusAreas.map((focusArea) => focusArea.id);
  const focusOrder = new Map(
    orderedFocusIds.map((focusId, index) => [focusId, index]),
  );
  const adjacency = new Map<string, Set<string>>();
  const indegree = new Map(orderedFocusIds.map((focusId) => [focusId, 0]));

  for (const edge of sequenceEdges) {
    const nextIds = adjacency.get(edge.beforeId) ?? new Set<string>();

    if (!nextIds.has(edge.afterId)) {
      nextIds.add(edge.afterId);
      adjacency.set(edge.beforeId, nextIds);
      indegree.set(edge.afterId, (indegree.get(edge.afterId) ?? 0) + 1);
    }
  }

  const queue = orderedFocusIds
    .filter((focusId) => (indegree.get(focusId) ?? 0) === 0)
    .sort((left, right) => (focusOrder.get(left) ?? 0) - (focusOrder.get(right) ?? 0));
  const ranks = new Map<string, number>();

  while (queue.length > 0) {
    const focusId = queue.shift();

    if (!focusId) {
      continue;
    }

    ranks.set(focusId, ranks.size);

    for (const nextId of adjacency.get(focusId) ?? []) {
      indegree.set(nextId, (indegree.get(nextId) ?? 0) - 1);

      if ((indegree.get(nextId) ?? 0) === 0) {
        queue.push(nextId);
        queue.sort(
          (left, right) =>
            (focusOrder.get(left) ?? 0) - (focusOrder.get(right) ?? 0),
        );
      }
    }
  }

  return ranks.size === orderedFocusIds.length
    ? ranks
    : new Map(orderedFocusIds.map((focusId, index) => [focusId, index]));
}

function getFocusSequencePreferenceKey(goalId: string, focusId: string) {
  return `${goalId}:${focusId}`;
}

function buildLearnedActivityPeriodPreferences(
  schedulingContext: CompiledSchedulingContext | undefined,
): LearnedActivityPeriodPreference[] {
  const learnedPreferenceInputs = [
    ...(schedulingContext?.acceptedDerivedHabits ?? []).map((value) => ({
      value,
      source: "accepted" as const,
    })),
    ...(schedulingContext?.tentativeDerivedPreferences ?? []).map((value) => ({
      value,
      source: "tentative" as const,
    })),
  ];
  const preferences: LearnedActivityPeriodPreference[] = [];
  const seen = new Set<string>();

  for (const input of learnedPreferenceInputs) {
    const preference = parseLearnedActivityPeriodPreference(
      input.value,
      input.source,
    );

    if (!preference) {
      continue;
    }

    const key = `${preference.comparableActivityTitle}:${preference.period}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    preferences.push(preference);
  }

  return preferences;
}

function buildActivityPeriodPreferences(
  message: string,
  schedulingContext: CompiledSchedulingContext | undefined,
): LearnedActivityPeriodPreference[] {
  const preferences: LearnedActivityPeriodPreference[] = [];
  const seen = new Set<string>();

  for (const preference of [
    ...buildLatestMessageActivityPeriodPreferences(message),
    ...buildLearnedActivityPeriodPreferences(schedulingContext),
  ]) {
    const key = `${preference.comparableActivityTitle}:${preference.period}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    preferences.push(preference);
  }

  return preferences;
}

function buildLatestMessageActivityPeriodPreferences(
  message: string,
): LearnedActivityPeriodPreference[] {
  const preferences: LearnedActivityPeriodPreference[] = [];
  const seen = new Set<string>();
  const patterns = [
    /\bprefer(?:\s+to)?\s+(?:schedule|scheduling|do|doing)?\s*(?<activity>[a-z][a-z\s-]{1,40}?)\s+(?:in|during)\s+(?:the\s+)?(?<period>mornings?|afternoons?|evenings?)\b/giu,
    /\b(?:keep|use|save)\s+(?:the\s+)?(?<period>mornings?|afternoons?|evenings?)\s+for\s+(?<activity>[a-z][a-z\s-]{1,40})\b/giu,
    /\b(?<activity>meditate|journal|read|study|stretch|walk|run|exercise|work\s*out|meal\s*prep|clean|write)\s+(?:every|each)\s+(?<period>morning|afternoon|evening|night)\b/giu,
    /\b(?:every|each)\s+(?<period>morning|afternoon|evening|night)\s+(?:i\s+)?(?<activity>meditate|journal|read|study|stretch|walk|run|exercise|work\s*out|meal\s*prep|clean|write)\b/giu,
  ];

  for (const pattern of patterns) {
    for (const match of message.matchAll(pattern)) {
      const activityTitle = normalizePreferenceActivityTitle(
        match.groups?.activity,
      );
      const period = normalizeLearnedWorkPeriod(match.groups?.period);

      if (!activityTitle || !period) {
        continue;
      }

      const comparableActivityTitle = normalizeComparableTitle(activityTitle);
      const key = `${comparableActivityTitle}:${period}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      preferences.push({
        activityTitle,
        comparableActivityTitle,
        period,
        rationale: `Latest feedback suggests scheduling ${activityTitle} during the ${period}.`,
      });
    }
  }

  return preferences;
}

function buildLearnedAvoidedWorkPeriods(
  schedulingContext: CompiledSchedulingContext | undefined,
): LearnedAvoidedWorkPeriod[] {
  const learnedPreferenceInputs = [
    ...(schedulingContext?.acceptedDerivedHabits ?? []).map((value) => ({
      value,
      source: "accepted" as const,
    })),
    ...(schedulingContext?.tentativeDerivedPreferences ?? []).map((value) => ({
      value,
      source: "tentative" as const,
    })),
  ];
  const avoidedPeriods: LearnedAvoidedWorkPeriod[] = [];
  const seen = new Set<WorkPeriod>();

  for (const input of learnedPreferenceInputs) {
    const avoidance = parseLearnedAvoidedWorkPeriod(input.value, input.source);

    if (!avoidance || seen.has(avoidance.period)) {
      continue;
    }

    seen.add(avoidance.period);
    avoidedPeriods.push(avoidance);
  }

  return avoidedPeriods;
}

function parseLearnedActivityPeriodPreference(
  value: string,
  source: "accepted" | "tentative",
): LearnedActivityPeriodPreference | null {
  const match =
    /\bprefer scheduling (?<activity>.+?) during the (?<period>morning|afternoon|evening)\b/iu.exec(
      value,
    );
  const activityTitle = match?.groups?.activity
    ?.trim()
    .replace(/\s+/gu, " ");
  const period = normalizeLearnedWorkPeriod(match?.groups?.period);

  if (!activityTitle || !period) {
    return null;
  }

  const sourceLabel =
    source === "accepted" ? "Accepted learned preference" : "Tentative learned feedback";

  return {
    activityTitle,
    comparableActivityTitle: normalizeComparableTitle(activityTitle),
    period,
    rationale: `${sourceLabel} suggests scheduling ${activityTitle} during the ${period}.`,
  };
}

function parseLearnedAvoidedWorkPeriod(
  value: string,
  source: "accepted" | "tentative",
): LearnedAvoidedWorkPeriod | null {
  const match =
    /\bavoid generated schedule drafts during the (?<period>morning|afternoon|evening)\b/iu.exec(
      value,
    );
  const period = normalizeLearnedWorkPeriod(match?.groups?.period);

  if (!period) {
    return null;
  }

  const sourceLabel =
    source === "accepted" ? "Accepted learned preference" : "Tentative learned feedback";

  return {
    period,
    rationale: `${sourceLabel} suggests avoiding ${period} schedule drafts when possible.`,
  };
}

function normalizeLearnedWorkPeriod(value: string | undefined): WorkPeriod | null {
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

function findLearnedActivityPeriodPreference(
  title: string,
  preferences: LearnedActivityPeriodPreference[],
) {
  const comparableTitle = normalizeComparableTitle(title);

  return preferences.find((preference) =>
    learnedActivityPreferenceMatchesTitle(
      comparableTitle,
      preference.comparableActivityTitle,
    ),
  );
}

function learnedActivityPreferenceMatchesTitle(
  comparableTitle: string,
  comparableActivityTitle: string,
) {
  return (
    comparableTitle === comparableActivityTitle ||
    comparableTitle.includes(comparableActivityTitle) ||
    comparableActivityTitle.includes(comparableTitle)
  );
}

function getFocusOccurrenceTargets(
  cadence: string | null,
  horizonDateKeys: string[],
  availableDateKeys: string[],
  scheduledDateKeys: Set<string>,
) {
  const availableTargets =
    availableDateKeys.length > 0 ? availableDateKeys : horizonDateKeys;
  const uncoveredAvailableTargets = availableTargets.filter(
    (dateKey) => !scheduledDateKeys.has(dateKey),
  );
  const uncoveredHorizonDateKeys = horizonDateKeys.filter(
    (dateKey) => !scheduledDateKeys.has(dateKey),
  );

  if (!cadence) {
    const targetCount = getTrialFocusOccurrenceTargetCount(
      horizonDateKeys,
      availableTargets,
    );

    return pickTrialFocusOccurrenceDateKeys(
      availableTargets,
      uncoveredAvailableTargets,
      scheduledDateKeys,
      targetCount,
    );
  }

  const normalized = cadence.toLowerCase();
  const weeklyCount = normalized.match(/\b(\d{1,2})x\/week\b/u);

  if (weeklyCount?.[1]) {
    const targetCount = Math.min(
      Number(weeklyCount[1]),
      MAX_GOAL_FOCUS_ASSIGNMENTS,
    );
    const remainingCount = Math.max(targetCount - scheduledDateKeys.size, 0);

    return pickEvenlySpacedDateKeys(
      uncoveredAvailableTargets,
      remainingCount,
    );
  }

  if (normalized.includes("weekday")) {
    const scheduledWeekdayCount = [...scheduledDateKeys].filter(isWeekdayDateKey)
      .length;
    const targetWeekdayCount = Math.min(
      horizonDateKeys.filter(isWeekdayDateKey).length,
      MAX_GOAL_FOCUS_ASSIGNMENTS,
    );
    const remainingWeekdayCount = Math.max(
      targetWeekdayCount - scheduledWeekdayCount,
      0,
    );

    return uncoveredHorizonDateKeys
      .filter(isWeekdayDateKey)
      .slice(0, remainingWeekdayCount);
  }

  if (normalized.includes("daily")) {
    return uncoveredHorizonDateKeys.slice(
      0,
      Math.max(MAX_GOAL_FOCUS_ASSIGNMENTS - scheduledDateKeys.size, 0),
    );
  }

  if (normalized.includes("weekly")) {
    return scheduledDateKeys.size > 0
      ? []
      : uncoveredAvailableTargets.slice(0, 1);
  }

  return scheduledDateKeys.size > 0 ? [] : [null];
}

function getScheduledFocusDateKeysForHorizon(
  scheduleGuidance: Record<string, unknown> | null,
  focusArea: { id: string; title: string },
  horizonStart: Date,
  horizonEnd: Date,
) {
  const scheduledBlocks = Array.isArray(
    scheduleGuidance?.[SCHEDULED_FOCUS_BLOCKS_GUIDANCE_KEY],
  )
    ? scheduleGuidance[SCHEDULED_FOCUS_BLOCKS_GUIDANCE_KEY]
    : [];
  const dateKeys = new Set<string>();

  for (const block of scheduledBlocks) {
    if (!block || typeof block !== "object" || Array.isArray(block)) {
      continue;
    }

    const record = block as Record<string, unknown>;
    if (!scheduledFocusBlockMatchesFocusArea(record, focusArea)) {
      continue;
    }

    const startTime = parseDate(
      typeof record.startTime === "string" ? record.startTime : null,
    );
    const endTime = parseDate(
      typeof record.endTime === "string" ? record.endTime : null,
    );

    if (
      !startTime ||
      !endTime ||
      !dateRangesOverlap(startTime, endTime, horizonStart, horizonEnd)
    ) {
      continue;
    }

    dateKeys.add(toDateKey(startTime));
  }

  return dateKeys;
}

function getTrialFocusOccurrenceTargetCount(
  horizonDateKeys: string[],
  availableTargets: string[],
) {
  const horizonDayCount = Math.max(
    horizonDateKeys.length,
    availableTargets.length,
  );

  if (horizonDayCount >= 5) {
    return 3;
  }

  if (horizonDayCount >= 2) {
    return 2;
  }

  return 1;
}

function pickTrialFocusOccurrenceDateKeys(
  availableTargets: string[],
  uncoveredAvailableTargets: string[],
  scheduledDateKeys: Set<string>,
  targetCount: number,
) {
  const remainingCount = Math.max(targetCount - scheduledDateKeys.size, 0);

  if (remainingCount === 0) {
    return [];
  }

  const idealPattern = pickEvenlySpacedDateKeys(
    availableTargets,
    targetCount,
  );
  const selected = idealPattern
    .filter((dateKey) => !scheduledDateKeys.has(dateKey))
    .slice(0, remainingCount);

  if (selected.length >= remainingCount) {
    return selected;
  }

  const selectedSet = new Set(selected);
  const fillCandidates = uncoveredAvailableTargets.filter(
    (dateKey) => !selectedSet.has(dateKey),
  );
  const fillDates = pickEvenlySpacedDateKeys(
    fillCandidates,
    remainingCount - selected.length,
  );

  return [...selected, ...fillDates];
}

function scheduledFocusBlockMatchesFocusArea(
  record: Record<string, unknown>,
  focusArea: { id: string; title: string },
) {
  if (record.focusId === focusArea.id) {
    return true;
  }

  if (typeof record.focusId === "string" && record.focusId.length > 0) {
    return false;
  }

  return (
    typeof record.title === "string" &&
    normalizeComparableTitle(record.title) ===
      normalizeComparableTitle(focusArea.title)
  );
}

function dateRangesOverlap(
  startTime: Date,
  endTime: Date,
  horizonStart: Date,
  horizonEnd: Date,
) {
  return startTime < horizonEnd && endTime > horizonStart;
}

function normalizeComparableTitle(value: string) {
  return value.trim().replace(/\s+/gu, " ").toLowerCase();
}

function formatFocusBlockCount(count: number) {
  return count === 1 ? "scheduled block" : "scheduled blocks";
}

function dateKeysBetween(startTime: Date, endTime: Date) {
  return eachDay(startTime, endTime).map(toDateKey);
}

function getCandidateSlotDateKeys(candidateSlots: SchedulingCandidateSlotContext) {
  return [
    ...new Set(
      candidateSlots.slots.flatMap((slot) => {
        const startTime = parseDate(slot.availableWindow.startTime);
        return startTime ? [toDateKey(startTime)] : [];
      }),
    ),
  ].sort();
}

function isWeekdayDateKey(dateKey: string) {
  const dayOfWeek = getDayOfWeekForDateKey(dateKey);

  return dayOfWeek >= 1 && dayOfWeek <= 5;
}

function getDayOfWeekForDateKey(dateKey: string) {
  const [yearPart, monthPart, dayPart] = dateKey.split("-");
  const year = Number.parseInt(yearPart ?? "", 10);
  const month = Number.parseInt(monthPart ?? "", 10);
  const day = Number.parseInt(dayPart ?? "", 10);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return -1;
  }

  return new Date(year, month - 1, day).getDay();
}

function pickEvenlySpacedDateKeys(dateKeys: string[], count: number) {
  const targetCount = Math.min(Math.max(count, 0), dateKeys.length);

  if (targetCount === 0) {
    return [];
  }

  if (targetCount === 1) {
    return dateKeys.slice(0, 1);
  }

  if (targetCount >= dateKeys.length) {
    return dateKeys;
  }

  const selected: string[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < targetCount; index += 1) {
    const candidateIndex = Math.round(
      (index * (dateKeys.length - 1)) / (targetCount - 1),
    );
    const dateKey = dateKeys[candidateIndex];

    if (dateKey && !seen.has(dateKey)) {
      selected.push(dateKey);
      seen.add(dateKey);
    }
  }

  return selected;
}

function compareAssemblyItems(now: Date) {
  return (left: AssemblyItem, right: AssemblyItem) => {
    const deadlinePreemptionDifference =
      getDeadlinePreemptionScore(right, now) -
      getDeadlinePreemptionScore(left, now);

    if (deadlinePreemptionDifference !== 0) {
      return deadlinePreemptionDifference;
    }

    const typeDifference =
      getAssemblyTypePriority(left) - getAssemblyTypePriority(right);

    if (typeDifference !== 0) {
      return typeDifference;
    }

    const dueDifference = compareOptionalDates(left.dueAt, right.dueAt);

    if (dueDifference !== 0) {
      return dueDifference;
    }

    const priorityDifference = left.priorityRank - right.priorityRank;

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    const targetDateDifference = getAssemblyTargetDateDifference(left, right);

    if (targetDateDifference !== 0) {
      return targetDateDifference;
    }

    const sequenceDifference = getAssemblySequenceDifference(left, right);

    if (sequenceDifference !== 0) {
      return sequenceDifference;
    }

    return left.occurrenceKey.localeCompare(right.occurrenceKey);
  };
}

function getAssemblyTargetDateDifference(left: AssemblyItem, right: AssemblyItem) {
  if (
    left.itemType !== "goal_focus" ||
    right.itemType !== "goal_focus" ||
    left.goalId !== right.goalId ||
    !left.targetDateKey ||
    !right.targetDateKey
  ) {
    return 0;
  }

  return left.targetDateKey.localeCompare(right.targetDateKey);
}

function getAssemblySequenceDifference(left: AssemblyItem, right: AssemblyItem) {
  if (
    left.itemType !== "goal_focus" ||
    right.itemType !== "goal_focus" ||
    left.goalId !== right.goalId
  ) {
    return 0;
  }

  if (left.sequenceRank === null && right.sequenceRank === null) {
    return 0;
  }

  if (left.sequenceRank === null) {
    return 1;
  }

  if (right.sequenceRank === null) {
    return -1;
  }

  return left.sequenceRank - right.sequenceRank;
}

function compareOptionalDates(left: Date | null, right: Date | null) {
  if (!left && !right) {
    return 0;
  }

  if (!left) {
    return 1;
  }

  if (!right) {
    return -1;
  }

  return left.getTime() - right.getTime();
}

function getDeadlinePreemptionScore(item: AssemblyItem, now: Date) {
  return getImmediateDueScore(item, now) >= 2 ? 1 : 0;
}

function getImmediateDueScore(item: AssemblyItem, now: Date) {
  if (!item.dueAt) {
    return 0;
  }

  const hoursUntilDue =
    (item.dueAt.getTime() - now.getTime()) / (60 * 60 * 1000);

  return hoursUntilDue <= 24 ? 2 : hoursUntilDue <= 72 ? 1 : 0;
}

function getAssemblyTypePriority(item: AssemblyItem) {
  return item.itemType === "goal_focus" ? 0 : 1;
}

function slotToAssemblySegment(slot: SchedulingCandidateSlot): AssemblySegment {
  const startTime = parseDate(slot.availableWindow.startTime) ?? new Date(0);

  return {
    sourceSlotId: slot.id,
    dateKey: toDateKey(startTime),
    period: slot.period,
    rank: slot.rank,
    score: slot.score,
    startTime,
    endTime: parseDate(slot.availableWindow.endTime) ?? new Date(0),
  };
}

function findSegmentForItem(
  segments: AssemblySegment[],
  item: AssemblyItem,
  dailyLoadByDateKey: Map<string, number>,
  feedbackPolicy: AssemblyFeedbackPolicy,
  now: Date,
) {
  const dueDateKey = getDueDatePreferenceKey(item);
  let blockedByDailyLoad = false;

  if (dueDateKey && !item.targetDateKey) {
    const dueDateItem = {
      ...item,
      targetDateKey: dueDateKey,
    };

    if (item.preferredPeriod) {
      const dueDatePreferredFit = findSegmentIndexForItem({
        segments,
        item: dueDateItem,
        dailyLoadByDateKey,
        feedbackPolicy,
        now,
        preferredPeriod: item.preferredPeriod,
      });

      if (dueDatePreferredFit.segmentIndex !== -1) {
        return dueDatePreferredFit;
      }

      blockedByDailyLoad =
        blockedByDailyLoad || dueDatePreferredFit.blockedByDailyLoad;
    }

    const dueDateFit = findSegmentIndexForItem({
      segments,
      item: dueDateItem,
      dailyLoadByDateKey,
      feedbackPolicy,
      now,
      preferredPeriod: null,
    });

    if (dueDateFit.segmentIndex !== -1) {
      return dueDateFit;
    }

    blockedByDailyLoad = blockedByDailyLoad || dueDateFit.blockedByDailyLoad;
  }

  const preferredPeriodFit = item.preferredPeriod
    ? findSegmentIndexForItem({
        segments,
        item,
        dailyLoadByDateKey,
        feedbackPolicy,
        now,
        preferredPeriod: item.preferredPeriod,
      })
    : null;

  if (preferredPeriodFit && preferredPeriodFit.segmentIndex !== -1) {
    return preferredPeriodFit;
  }

  const fallbackFit = findSegmentIndexForItem({
    segments,
    item,
    dailyLoadByDateKey,
    feedbackPolicy,
    now,
    preferredPeriod: null,
  });

  return {
    segmentIndex: fallbackFit.segmentIndex,
    blockedByDailyLoad:
      blockedByDailyLoad ||
      fallbackFit.blockedByDailyLoad ||
      Boolean(preferredPeriodFit?.blockedByDailyLoad),
  };
}

function getDueDatePreferenceKey(item: AssemblyItem) {
  if (item.itemType !== "task" || !item.dueAt) {
    return null;
  }

  return toDateKey(item.dueAt);
}

function findSegmentIndexForItem(input: {
  segments: AssemblySegment[];
  item: AssemblyItem;
  dailyLoadByDateKey: Map<string, number>;
  feedbackPolicy: AssemblyFeedbackPolicy;
  now: Date;
  preferredPeriod: WorkPeriod | null;
}) {
  let blockedByDailyLoad = false;

  const segmentIndex = input.segments.findIndex((segment) => {
    if (input.preferredPeriod && segment.period !== input.preferredPeriod) {
      return false;
    }

    if (input.item.targetDateKey && segment.dateKey !== input.item.targetDateKey) {
      return false;
    }

    if (
      segment.endTime.getTime() - segment.startTime.getTime() <
      input.item.durationMinutes * 60_000
    ) {
      return false;
    }

    if (
      input.item.dueAt &&
      addMinutes(segment.startTime, input.item.durationMinutes) >
        input.item.dueAt
    ) {
      return false;
    }

    if (
      exceedsDailyLoad(
        input.item,
        segment.dateKey,
        input.dailyLoadByDateKey,
        input.feedbackPolicy,
        input.now,
      )
    ) {
      blockedByDailyLoad = true;
      return false;
    }

    return true;
  });

  return {
    segmentIndex,
    blockedByDailyLoad,
  };
}

function exceedsDailyLoad(
  item: AssemblyItem,
  dateKey: string,
  dailyLoadByDateKey: Map<string, number>,
  feedbackPolicy: AssemblyFeedbackPolicy,
  now: Date,
) {
  if (canExceedDefaultDailyLoad(item, now)) {
    return false;
  }

  return (
    (dailyLoadByDateKey.get(dateKey) ?? 0) + item.durationMinutes >
    feedbackPolicy.dailyLoadLimitMinutes
  );
}

function canExceedDefaultDailyLoad(item: AssemblyItem, now: Date) {
  return getImmediateDueScore(item, now) > 0;
}

function getUnscheduledItemReason(
  item: AssemblyItem,
  blockedByDailyLoad: boolean,
  feedbackPolicy: AssemblyFeedbackPolicy,
) {
  if (blockedByDailyLoad) {
    return `Productiv kept this out of the draft because that day already reached the ${feedbackPolicy.dailyLoadLimitMinutes}-minute daily load budget for generated work`;
  }

  return item.dueAt
    ? "No candidate slot could fit this item before its due date."
    : "No candidate slot was long enough after higher-ranked assignments.";
}

function getDueDatePlacementRationale(item: AssemblyItem, dateKey: string) {
  const dueDateKey = getDueDatePreferenceKey(item);

  if (!dueDateKey) {
    return [];
  }

  return dueDateKey === dateKey
    ? ["Task has a due date, so Productiv first tried to place it on that day."]
    : [
        "Task has a due date, but no due-date slot fit first, so Productiv placed it earlier before the deadline.",
      ];
}

function getDailyLoadRationale(
  item: AssemblyItem,
  dailyLoadByDateKey: Map<string, number>,
  dateKey: string,
  feedbackPolicy: AssemblyFeedbackPolicy,
  now: Date,
) {
  const nextDailyLoad =
    (dailyLoadByDateKey.get(dateKey) ?? 0) + item.durationMinutes;

  if (nextDailyLoad <= feedbackPolicy.dailyLoadLimitMinutes) {
    return [
      `Keeps Productiv-added work on ${dateKey} within the ${feedbackPolicy.dailyLoadLimitMinutes}-minute daily load budget for this draft.`,
    ];
  }

  if (canExceedDefaultDailyLoad(item, now)) {
    return [
      `Deadline pressure allows ${dateKey} to exceed the ${feedbackPolicy.dailyLoadLimitMinutes}-minute daily load budget for this draft.`,
    ];
  }

  return [];
}

function buildAssemblyFeedbackPolicy(
  message: string,
  schedulingContext: CompiledSchedulingContext | undefined,
): AssemblyFeedbackPolicy {
  const normalized = message.toLowerCase();
  const tentativePreferenceText = (
    schedulingContext?.tentativeDerivedPreferences ?? []
  ).join(" ").toLowerCase();
  const messageWantsLighterDay = hasLighterScheduleLanguage(normalized);
  const learnedWantsLighterDay = hasLighterScheduleLanguage(tentativePreferenceText);
  const messageWantsMoreBuffer = hasBufferLanguage(normalized);
  const learnedWantsMoreBuffer = hasBufferLanguage(tentativePreferenceText);
  const wantsLighterDay = messageWantsLighterDay || learnedWantsLighterDay;
  const wantsMoreBuffer = messageWantsMoreBuffer || learnedWantsMoreBuffer;
  const rationale: string[] = [];

  if (messageWantsLighterDay) {
    rationale.push(
      `Latest schedule feedback asked for a lighter or less crowded draft, so Productiv lowered the non-urgent generated daily load cap to ${REDUCED_DAILY_ASSEMBLY_LOAD_LIMIT_MINUTES} minutes.`,
    );
  } else if (learnedWantsLighterDay) {
    rationale.push(
      `Tentative learned feedback suggests lighter or less crowded drafts, so Productiv lowered the non-urgent generated daily load cap to ${REDUCED_DAILY_ASSEMBLY_LOAD_LIMIT_MINUTES} minutes.`,
    );
  }

  if (messageWantsMoreBuffer) {
    rationale.push(
      `Latest schedule feedback asked for more space between blocks, so Productiv increased generated buffers to ${EXPANDED_ASSEMBLY_BUFFER_MINUTES} minutes.`,
    );
  } else if (learnedWantsMoreBuffer) {
    rationale.push(
      `Tentative learned feedback suggests more space between blocks, so Productiv increased generated buffers to ${EXPANDED_ASSEMBLY_BUFFER_MINUTES} minutes.`,
    );
  }

  return {
    dailyLoadLimitMinutes: wantsLighterDay
      ? REDUCED_DAILY_ASSEMBLY_LOAD_LIMIT_MINUTES
      : DEFAULT_DAILY_ASSEMBLY_LOAD_LIMIT_MINUTES,
    bufferMinutes: wantsMoreBuffer
      ? EXPANDED_ASSEMBLY_BUFFER_MINUTES
      : ASSEMBLY_BUFFER_MINUTES,
    rationale,
  };
}

function hasLighterScheduleLanguage(value: string) {
  return /\b(too much|too many|overload|overloaded|overwhelming|crowded|packed|lighter|less crowded|less packed|less intense|not so much|too full|more realistic)\b/u.test(
    value,
  );
}

function hasBufferLanguage(value: string) {
  return /\b(buffer|buffers|break|breaks|breathing room|space|spaced out|gap|gaps|less back-to-back|back to back)\b/u.test(
    value,
  );
}

function inferSchedulingHorizon(message: string, now: Date) {
  const normalized = message.toLowerCase();
  const todayStart = startOfDay(now);
  const explicitRange = parseExplicitSchedulingHorizonRange(
    normalized,
    now,
    todayStart,
  );

  if (explicitRange) {
    return explicitRange;
  }

  const explicitWeekHorizon = inferExplicitWeekSchedulingHorizon(
    normalized,
    now,
    todayStart,
  );

  if (explicitWeekHorizon) {
    return explicitWeekHorizon;
  }

  if (/\btomorrow\b/u.test(normalized)) {
    const startTime = addDays(todayStart, 1);

    return {
      startTime,
      endTime: addDays(startTime, 1),
      source: "latest message: tomorrow",
      shouldSuggestSlots: true,
    };
  }

  if (/\btoday\b/u.test(normalized)) {
    return {
      startTime: now,
      endTime: addDays(todayStart, 1),
      source: "latest message: today",
      shouldSuggestSlots: true,
    };
  }

  if (/\bnext week\b/u.test(normalized)) {
    const startTime = addDays(todayStart, daysUntilNextSunday(now));

    return {
      startTime,
      endTime: addDays(startTime, 7),
      source: "latest message: next week, default Sunday-through-Saturday",
      shouldSuggestSlots: true,
    };
  }

  if (/\bthis week\b/u.test(normalized)) {
    return {
      startTime: now,
      endTime: addDays(todayStart, daysUntilNextSunday(now)),
      source: "latest message: this week, through Saturday",
      shouldSuggestSlots: true,
    };
  }

  if (/\bweekend\b/u.test(normalized)) {
    const startTime = nextWeekendStart(todayStart);

    return {
      startTime,
      endTime: addDays(startTime, 2),
      source: "latest message: weekend",
      shouldSuggestSlots: true,
    };
  }

  const explicitNextDays = normalized.match(/\bnext\s+(\d{1,2})\s+days?\b/u);

  if (explicitNextDays?.[1]) {
    const days = Math.min(Math.max(Number(explicitNextDays[1]), 1), 21);

    return {
      startTime: now,
      endTime: addDays(todayStart, days + 1),
      source: `latest message: next ${days} days`,
      shouldSuggestSlots: true,
    };
  }

  return {
    startTime: now,
    endTime: addDays(todayStart, 8),
    source: "default next seven days for scheduling request",
    shouldSuggestSlots: shouldSuggestSlotsForMessage(normalized),
  };
}

function inferExplicitWeekSchedulingHorizon(
  normalizedMessage: string,
  now: Date,
  todayStart: Date,
): SchedulingHorizon | null {
  if (messageRequestsWeekSchedulingHorizon(normalizedMessage, "next")) {
    const startTime = addDays(todayStart, daysUntilNextSunday(now));

    return {
      startTime,
      endTime: addDays(startTime, 7),
      source: "latest message: next week, default Sunday-through-Saturday",
      shouldSuggestSlots: true,
    };
  }

  if (
    messageRequestsWeekSchedulingHorizon(normalizedMessage, "this") ||
    messageRequestsWeekSchedulingHorizon(normalizedMessage, "my")
  ) {
    return {
      startTime: now,
      endTime: addDays(todayStart, daysUntilNextSunday(now)),
      source: "latest message: this week, through Saturday",
      shouldSuggestSlots: true,
    };
  }

  return null;
}

function messageRequestsWeekSchedulingHorizon(
  normalizedMessage: string,
  weekLabel: "this" | "next" | "my",
) {
  const weekPattern = `${weekLabel}\\s+week`;
  const schedulingVerb = "(?:schedule|calendar|plan|generate|build|draft)";
  const verbBeforeWeek = new RegExp(
    `\\b${schedulingVerb}\\b.{0,80}\\b${weekPattern}\\b`,
    "u",
  );
  const weekBeforeVerb = new RegExp(
    `\\b${weekPattern}\\b.{0,80}\\b${schedulingVerb}\\b`,
    "u",
  );

  return (
    verbBeforeWeek.test(normalizedMessage) ||
    weekBeforeVerb.test(normalizedMessage)
  );
}

function parseExplicitSchedulingHorizonRange(
  message: string,
  now: Date,
  todayStart: Date,
): SchedulingHorizon | null {
  if (!shouldSuggestSlotsForExplicitRange(message)) {
    return null;
  }

  const fromMatch =
    /\bfrom\s+(?<start>.+?)\s+(?<connector>to|through|thru|till|until)\s+(?<end>.+?)(?=[,.!?;]|$)/u.exec(
      message,
    );
  const betweenMatch =
    /\bbetween\s+(?<start>.+?)\s+and\s+(?<end>.+?)(?=[,.!?;]|$)/u.exec(
      message,
    );
  const startText = fromMatch?.groups?.start ?? betweenMatch?.groups?.start;
  const endText = fromMatch?.groups?.end ?? betweenMatch?.groups?.end;
  const connector = normalizeDateRangeConnector(
    fromMatch?.groups?.connector ?? (betweenMatch ? "between" : null),
  );

  if (!startText || !endText || !connector) {
    return null;
  }

  const startEndpoint = resolveSchedulingHorizonEndpoint({
    text: startText,
    role: "start",
    now,
    todayStart,
    connector,
  });

  if (!startEndpoint) {
    return null;
  }

  const endEndpoint = resolveSchedulingHorizonEndpoint({
    text: endText,
    role: "end",
    now,
    todayStart,
    connector,
    rangeStart: startEndpoint.date,
  });

  if (!endEndpoint || endEndpoint.date <= startEndpoint.date) {
    return null;
  }

  return {
    startTime: startEndpoint.date,
    endTime: endEndpoint.date,
    source: `latest message explicit date range: ${startEndpoint.label} to ${endEndpoint.label}`,
    shouldSuggestSlots: true,
  };
}

function normalizeDateRangeConnector(
  value: string | null | undefined,
): DateRangeConnector | null {
  if (value === "through" || value === "thru") {
    return "through";
  }

  if (value === "till" || value === "until") {
    return "until";
  }

  if (value === "to") {
    return "to";
  }

  if (value === "between") {
    return "between";
  }

  return null;
}

function resolveSchedulingHorizonEndpoint(input: {
  text: string;
  role: "start" | "end";
  now: Date;
  todayStart: Date;
  connector: DateRangeConnector;
  rangeStart?: Date | undefined;
}): { date: Date; label: string } | null {
  const text = input.text.trim().replace(/^the\s+/u, "");

  if (/^today\b/u.test(text)) {
    return {
      date:
        input.role === "start" ? input.now : addDays(input.todayStart, 1),
      label: "today",
    };
  }

  if (/^tomorrow\b/u.test(text)) {
    const tomorrowStart = addDays(input.todayStart, 1);

    return {
      date:
        input.role === "start" ? tomorrowStart : addDays(tomorrowStart, 1),
      label: "tomorrow",
    };
  }

  const weekEndpoint = resolveWeekRangeEndpoint(input, text);

  if (weekEndpoint) {
    return weekEndpoint;
  }

  return resolveWeekdayEndpoint(input, text);
}

function resolveWeekRangeEndpoint(
  input: Parameters<typeof resolveSchedulingHorizonEndpoint>[0],
  text: string,
) {
  const thisWeekMatch = /^this\s+week\b/u.test(text);
  const nextWeekMatch = /^next\s+week\b/u.test(text);
  const thisWeekendMatch = /^(?:this\s+)?weekend\b/u.test(text);
  const nextWeekendMatch = /^next\s+weekend\b/u.test(text);

  if (thisWeekMatch) {
    return {
      date:
        input.role === "start"
          ? input.now
          : addDays(input.todayStart, daysUntilNextSunday(input.now)),
      label: "this week",
    };
  }

  if (nextWeekMatch) {
    const weekStart = addDays(input.todayStart, daysUntilNextSunday(input.now));

    return {
      date:
        input.role === "start" ||
        (input.role === "end" && input.connector !== "through")
          ? weekStart
          : addDays(weekStart, 7),
      label: "next week",
    };
  }

  if (nextWeekendMatch || thisWeekendMatch) {
    const weekendStart = nextWeekendStart(input.todayStart);

    return {
      date:
        input.role === "start" ||
        (input.role === "end" && input.connector !== "through")
          ? weekendStart
          : addDays(weekendStart, 2),
      label: nextWeekendMatch ? "next weekend" : "weekend",
    };
  }

  return null;
}

function resolveWeekdayEndpoint(
  input: Parameters<typeof resolveSchedulingHorizonEndpoint>[0],
  text: string,
) {
  const weekdayMatch =
    /^(?<modifier>next\s+)?(?<weekday>sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/u.exec(
      text,
    );
  const weekday = weekdayMatch?.groups?.weekday;

  if (!weekday) {
    return null;
  }

  const reference =
    input.role === "end"
      ? startOfDay(input.rangeStart ?? input.todayStart)
      : input.todayStart;
  const date = nextWeekdayStart(
    reference,
    weekdayNameToDay(weekday),
    Boolean(weekdayMatch.groups?.modifier),
  );

  return {
    date: input.role === "start" ? date : addDays(date, 1),
    label: `${weekdayMatch.groups?.modifier ? "next " : ""}${weekday}`,
  };
}

function normalizeSchedulingHorizonOverride(
  override: SchedulingHorizonOverride | null | undefined,
) {
  if (!override) {
    return null;
  }

  if (
    Number.isNaN(override.startTime.getTime()) ||
    Number.isNaN(override.endTime.getTime()) ||
    override.endTime <= override.startTime
  ) {
    return null;
  }

  return {
    startTime: new Date(override.startTime),
    endTime: new Date(override.endTime),
    source: override.source.trim() || "explicit scheduling horizon",
  };
}

function shouldSuggestSlotsForMessage(message: string) {
  return /\b(schedule|calendar|block|timebox|plan my|generate my schedule|availability|available|fit in)\b/u.test(
    message,
  );
}

function shouldSuggestSlotsForExplicitRange(message: string) {
  return /\b(schedule|calendar|block|timebox|plan|generate|draft|build|fit in|routine|habit|practice|study|workout)\b/u.test(
    message,
  );
}

function buildBusyRanges(
  day: Date,
  schedulingContext: CompiledSchedulingContext,
  calendarEvents: CalendarBusyEvent[],
): MinuteRange[] {
  return [
    ...schedulingContext.workHours
      .filter((rule) => rule.enabled && rule.dayOfWeek === day.getDay())
      .map((rule) => ({
        start: toMinutes(rule.startTime),
        end: toMinutes(rule.endTime),
        label: "saved work hours",
      })),
    ...schedulingContext.noScheduleWindows
      .filter((window) => window.dayOfWeek === day.getDay())
      .map((window) => ({
        start: toMinutes(window.startTime),
        end: toMinutes(window.endTime),
        label: window.label || "saved no-schedule window",
      })),
    ...sleepBusyRanges(schedulingContext.sleepWindow),
    ...latestWorkEndBusyRange(schedulingContext.maxWorkEndTime),
    ...calendarBusyRanges(day, calendarEvents),
  ].filter((range) => range.end > range.start);
}

function sleepBusyRanges(
  sleepWindow: CompiledSchedulingContext["sleepWindow"],
): MinuteRange[] {
  if (!sleepWindow) {
    return [];
  }

  const start = toMinutes(sleepWindow.startTime);
  const end = toMinutes(sleepWindow.endTime);

  if (end > start) {
    return [{ start, end, label: "saved sleep window" }];
  }

  return [
    { start: 0, end, label: "saved sleep window" },
    { start, end: 24 * 60, label: "saved sleep window" },
  ];
}

function latestWorkEndBusyRange(maxWorkEndTime: string | null): MinuteRange[] {
  if (!maxWorkEndTime) {
    return [];
  }

  const start = toMinutes(maxWorkEndTime);

  return start < 24 * 60
    ? [{ start, end: 24 * 60, label: "saved latest work end" }]
    : [];
}

function calendarBusyRanges(
  day: Date,
  calendarEvents: CalendarBusyEvent[],
): MinuteRange[] {
  return calendarEvents.flatMap((event) => {
    if (!event.start || !event.end) {
      return [];
    }

    const eventStart = parseDate(event.start);
    const eventEnd = parseDate(event.end);

    if (!eventStart || !eventEnd || !dateRangeOverlapsDay(eventStart, eventEnd, day)) {
      return [];
    }

    if (event.allDay) {
      return [{ start: 0, end: 24 * 60, label: event.title ?? "all-day event" }];
    }

    return [
      {
        start: Math.max(0, minutesSinceDayStart(eventStart, day)),
        end: Math.min(24 * 60, minutesSinceDayStart(eventEnd, day)),
        label: event.title ?? "calendar event",
      },
    ];
  });
}

function subtractBusyRanges(openRanges: MinuteRange[], busyRanges: MinuteRange[]) {
  return busyRanges
    .sort((left, right) => left.start - right.start)
    .reduce((ranges, busyRange) => {
      return ranges.flatMap((range) => subtractBusyRange(range, busyRange));
    }, openRanges);
}

function subtractBusyRange(openRange: MinuteRange, busyRange: MinuteRange) {
  if (!rangesOverlap(openRange, busyRange)) {
    return [openRange];
  }

  return [
    {
      ...openRange,
      end: Math.max(openRange.start, busyRange.start),
    },
    {
      ...openRange,
      start: Math.min(openRange.end, busyRange.end),
    },
  ].filter((range) => range.end > range.start);
}

function trimOpenRangeToFuture(
  openRange: MinuteRange,
  day: Date,
  now: Date,
): MinuteRange | null {
  if (startOfDay(day).getTime() !== startOfDay(now).getTime()) {
    return openRange;
  }

  const currentMinute = roundUpToMinuteInterval(
    minutesSinceDayStart(now, day),
    5,
  );
  const start = Math.max(openRange.start, currentMinute);

  return start < openRange.end
    ? {
        ...openRange,
        start,
      }
    : null;
}

function roundUpToMinuteInterval(minutes: number, interval: number) {
  if (interval <= 0) {
    return minutes;
  }

  return Math.ceil(minutes / interval) * interval;
}

function scoreCandidateSlot(
  day: Date,
  startMinutes: number,
  periodRank: number,
  now: Date,
) {
  const dayDistance = Math.max(
    0,
    Math.round((startOfDay(day).getTime() - startOfDay(now).getTime()) / 86_400_000),
  );

  return 10_000 - periodRank * 1_000 - dayDistance * 50 - startMinutes / 10;
}

function rangesOverlap(left: MinuteRange, right: MinuteRange) {
  return left.start < right.end && left.end > right.start;
}

function dateRangeOverlapsDay(start: Date, end: Date, day: Date) {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);

  return start < dayEnd && end > dayStart;
}

function minutesSinceDayStart(value: Date, day: Date) {
  return Math.round((value.getTime() - startOfDay(day).getTime()) / 60_000);
}

function eachDay(startTime: Date, endTime: Date) {
  const days: Date[] = [];
  let cursor = startOfDay(startTime);
  const end = startOfDay(endTime);

  while (cursor < end) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return days;
}

function nextWeekendStart(todayStart: Date) {
  const day = todayStart.getDay();
  const daysUntilSaturday = day === 0 ? 6 : day === 6 ? 0 : 6 - day;

  return addDays(todayStart, daysUntilSaturday);
}

function daysUntilNextSunday(now: Date) {
  const days = 7 - now.getDay();

  return days === 0 ? 7 : days;
}

function nextWeekdayStart(
  referenceStart: Date,
  weekday: SchedulingDayOfWeek,
  forceNextWeek: boolean,
) {
  const daysUntilTarget =
    (weekday - (referenceStart.getDay() as SchedulingDayOfWeek) + 7) % 7;
  const offsetDays =
    forceNextWeek && daysUntilTarget === 0
      ? 7
      : daysUntilTarget;

  return addDays(referenceStart, offsetDays);
}

function weekdayNameToDay(value: string): SchedulingDayOfWeek {
  switch (value) {
    case "sunday":
      return 0;
    case "monday":
      return 1;
    case "tuesday":
      return 2;
    case "wednesday":
      return 3;
    case "thursday":
      return 4;
    case "friday":
      return 5;
    case "saturday":
      return 6;
    default:
      return 0;
  }
}

function startOfDay(value: Date) {
  const nextDate = new Date(value);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function addDays(value: Date, days: number) {
  const nextDate = new Date(value);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function addMinutes(value: Date, minutes: number) {
  const nextDate = new Date(value);
  nextDate.setMinutes(nextDate.getMinutes() + minutes);
  return nextDate;
}

function setDateMinutes(day: Date, minutes: number) {
  const nextDate = startOfDay(day);
  nextDate.setMinutes(minutes);
  return nextDate;
}

function parseDate(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toMinutes(time: string) {
  const [hoursPart, minutesPart] = time.split(":");
  const hours = Number.parseInt(hoursPart ?? "0", 10);
  const minutes = Number.parseInt(minutesPart ?? "0", 10);
  return hours * 60 + minutes;
}

function minutesToTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const minutePart = minutes % 60;

  return `${hours.toString().padStart(2, "0")}:${minutePart
    .toString()
    .padStart(2, "0")}`;
}

function toDateKey(value: Date) {
  return [
    value.getFullYear(),
    (value.getMonth() + 1).toString().padStart(2, "0"),
    value.getDate().toString().padStart(2, "0"),
  ].join("-");
}
