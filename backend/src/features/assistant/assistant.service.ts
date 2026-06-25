import type { Credentials } from "google-auth-library";

import { getStructuredAiProvider } from "../../shared/ai/provider-factory.ts";
import { getRuntimePool } from "../../shared/db/postgres.ts";
import {
  createGoogleCalendarEvent,
  getMergedCalendarEvents,
  updateGoogleCalendarEvent,
} from "../calendar/calendar.service.ts";
import { getIncludedCalendarIdsForUser } from "../calendar/calendar-preferences.repository.ts";
import type { AuthenticatedUser } from "../auth/auth.types.ts";
import { runPlanningTurn } from "../planning/planning.service.ts";
import type {
  GeneratedPlan,
  PlanningChatMessage,
} from "../planning/planning.types.ts";
import {
  buildCompiledSchedulingContext,
  createDerivedSchedulingSuggestionsFromCandidates,
  createDerivedSchedulingSuggestionsFromReflection,
  createScheduleReflection,
  detectSchedulingConflicts,
  getOrCreateUserSchedulingContext,
} from "../scheduling-context/scheduling-context.repository.ts";
import type {
  CompiledSchedulingContext,
  SchedulingConflict,
  SchedulingPreferenceCandidate,
  UserSchedulingContextRecord,
} from "../scheduling-context/scheduling-context.types.ts";
import {
  buildAssistantTurnInput,
  buildScheduleReflectionInput,
  buildWorkLogInput,
  createAssistantTurnInstructions,
  createScheduleReflectionInstructions,
  createWorkLogInstructions,
  normalizeAssistantModelResponse,
  normalizeScheduleReflectionModelResponse,
  normalizeWorkLogModelResponse,
  ASSISTANT_TURN_SCHEMA,
  SCHEDULE_REFLECTION_SCHEMA,
  WORK_LOG_SCHEMA,
} from "./assistant.prompts.ts";
import {
  createScheduleProposal,
  getScheduleProposalById,
  listDraftScheduleProposals,
  listRecentAppliedScheduleProposals,
  type ScheduleProposalOperation,
  type ScheduleProposalRecord,
  updateScheduleProposalStatus,
} from "./schedule-proposals.repository.ts";
import {
  buildSchedulingAssemblyDraft,
  buildSchedulingCandidateSlots,
  buildSchedulingPlacementPolicy,
  type SchedulingAssemblyAssignment,
  type SchedulingAssemblyDraft,
  type SchedulingHorizonOverride,
} from "./scheduling-placement-policy.ts";
import {
  createStableFocusId,
  findReusablePersonalRoutinesGoal,
  inferGoalFocusSchedulingDefaults,
  mergeGoalFocusAreas,
  mergeGoalScheduleGuidance,
  mergeUniqueTextList,
  normalizeComparableTitle,
} from "./goal-routines.ts";
import type {
  AssistantAction,
  AssistantSideEffects,
  AssistantThreadResponse,
  AssistantTurnMode,
  AssistantTurnResponse,
} from "./assistant.types.ts";
import {
  addMetricProgressEntry,
  appendAssistantMessage,
  createAssistantThread,
  createGoal,
  createGoalMetric,
  createTask,
  createWorkLog,
  deleteAssistantThread,
  ensureGoalMetricsForGoal,
  getAssistantThreadById,
  getGoalMetricById,
  getOrCreateDefaultAssistantThread,
  getWorkspaceExecutor,
  listAssistantMessages,
  listAssistantThreads,
  listGoalMetrics,
  listGoals,
  listTasks,
  listWorkLogs,
  patchGoal,
  patchGoalMetric,
  patchTask,
  updateAssistantThreadState,
} from "../workspace/workspace.repository.ts";
import type {
  AssistantMessageRecord,
  GoalFocusArea,
  GoalMetricRecord,
  GoalRecord,
  TaskRecurrence,
  TaskRecord,
} from "../workspace/workspace.types.ts";

export {
  findReusablePersonalRoutinesGoal,
  inferGoalFocusSchedulingDefaults,
  mergeGoalFocusAreas,
  mergeGoalScheduleGuidance,
  mergeUniqueTextList,
} from "./goal-routines.ts";

export class AssistantThreadNotFoundError extends Error {
  constructor() {
    super("Assistant thread not found.");
  }
}

type PlanningArtifact = {
  generatedPlan?: unknown;
  planningDraftState?: unknown;
  planningGoalId?: string;
};

type ScheduleTaskActionDetails = {
  kind: "task";
  task: TaskRecord;
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  operation: Extract<ScheduleProposalOperation, { type: "schedule_task" }>;
};

type ScheduleGoalFocusActionDetails = {
  kind: "goal_focus";
  goal: GoalRecord;
  focusArea: GoalFocusArea | null;
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  operation: Extract<ScheduleProposalOperation, { type: "schedule_goal_focus" }>;
};

type ScheduleActionDetails =
  | ScheduleTaskActionDetails
  | ScheduleGoalFocusActionDetails;

type CalendarEventWriter = {
  createEvent: typeof createGoogleCalendarEvent;
  updateEvent: typeof updateGoogleCalendarEvent;
};

type ScheduleCalendarEventContext = {
  id: string | null;
  title: string;
  start: string | null;
  end: string | null;
  allDay: boolean;
  sourceCalendarId: string;
  sourceCalendarName: string;
};

type TaskSchedulingContextItem = {
  id: string;
  title: string;
  goalId: string | null;
  status: TaskRecord["status"];
  priorityRank: number;
  estimatedMinutes: number | null;
  dueAt: string | null;
  recurrence: TaskRecord["recurrence"];
  scheduledDateKeys: string[];
  revisionOccurrenceKeys?: string[];
  scheduleIntent: TaskRecord["scheduleIntent"];
  linkedCalendarEventId: string | null;
  calendarStatus:
    | "scheduled"
    | "pending_proposal"
    | "needs_scheduling"
    | "not_requested";
  reason: string;
  matchedCalendarEvent: ScheduleCalendarEventContext | null;
  pendingProposalId: string | null;
};

type ScheduleProposalRevisionFeedback = {
  proposalId: string;
  feedback: string;
};

type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const SCHEDULED_FOCUS_BLOCKS_GUIDANCE_KEY = "scheduledFocusBlocks";

type SchedulingAssemblyTaskInput = Parameters<
  typeof buildSchedulingAssemblyDraft
>[0]["tasks"][number];
type SchedulingAssemblyGoalInput = Parameters<
  typeof buildSchedulingAssemblyDraft
>[0]["goals"][number];

export async function getAssistantThreadForUser(
  userId: string,
  threadId?: string | null,
): Promise<AssistantThreadResponse> {
  const thread = threadId
    ? await getAssistantThreadById(userId, threadId)
    : await getOrCreateDefaultAssistantThread(userId);

  if (!thread) {
    throw new AssistantThreadNotFoundError();
  }

  const messages = await listAssistantMessages(thread.id);

  return {
    thread,
    messages,
  };
}

export async function listAssistantThreadsForUser(userId: string) {
  return listAssistantThreads(userId);
}

export async function createAssistantThreadForUser(
  userId: string,
): Promise<AssistantThreadResponse> {
  const thread = await createAssistantThread({ userId });

  return {
    thread,
    messages: [],
  };
}

export async function deleteAssistantThreadForUser(
  userId: string,
  threadId: string,
) {
  return deleteAssistantThread(userId, threadId);
}

export async function runAssistantTurn(input: {
  user: AuthenticatedUser;
  tokens: Credentials;
  message: string;
  mode?: AssistantTurnMode;
  threadId?: string | null;
}): Promise<AssistantTurnResponse> {
  const thread = await resolveAssistantThreadForTurn(
    input.user.id,
    input.threadId,
  );
  const trimmedMessage = input.message.trim();

  if (!trimmedMessage) {
    throw new Error("message must not be empty");
  }

  const userMessage = await appendAssistantMessage({
    threadId: thread.id,
    role: "user",
    intent:
      input.mode === "work_log" || input.mode === "schedule_reflection"
        ? input.mode
        : "chat",
    content: trimmedMessage,
  });
  await maybeSetThreadTitleFromFirstMessage(thread, trimmedMessage);

  const messages = await listAssistantMessages(thread.id);
  const goals = await listGoals(input.user.id);
  const tasks = await listTasks(input.user.id);
  const metrics = await listGoalMetrics(input.user.id);
  const workLogs = await listWorkLogs(input.user.id);
  const userSchedulingContext = await getOrCreateUserSchedulingContext(input.user.id);
  const compiledSchedulingContext = buildCompiledSchedulingContext(
    userSchedulingContext,
  );
  const pendingScheduleProposals = await listDraftScheduleProposals(input.user.id);
  const recentAppliedScheduleProposals =
    await listRecentAppliedScheduleProposals(input.user.id);

  const inferredMode = inferTurnMode(trimmedMessage, input.mode, metrics.length > 0);

  if (
    shouldUsePlanningFlow(
      thread.latestArtifact,
      goals.length,
      inferredMode,
      trimmedMessage,
    )
  ) {
    return handlePlanningTurn({
      threadId: thread.id,
      userId: input.user.id,
      messages,
      artifact: thread.latestArtifact as PlanningArtifact,
      schedulingContext: compiledSchedulingContext,
      latestUserMessageId: userMessage.id,
    });
  }

  if (inferredMode === "work_log") {
    return handleWorkLogTurn({
      threadId: thread.id,
      userId: input.user.id,
      message: trimmedMessage,
      goals,
      tasks,
      metrics,
      latestUserMessageId: userMessage.id,
    });
  }

  if (inferredMode === "schedule_reflection") {
    return handleScheduleReflectionTurn({
      threadId: thread.id,
      userId: input.user.id,
      message: trimmedMessage,
      messages,
      goals,
      tasks,
      metrics,
      workLogs,
      compiledSchedulingContext,
    });
  }

  const calendarContext = await loadScheduleRelevantCalendarContext({
    userId: input.user.id,
    tokens: input.tokens,
    message: trimmedMessage,
    mode: inferredMode,
  });
  const taskSchedulingContext = buildTaskSchedulingContext(
    tasks,
    pendingScheduleProposals,
    calendarContext.events,
  );

  return handleGeneralAssistantTurn({
    threadId: thread.id,
    userId: input.user.id,
    tokens: input.tokens,
    message: trimmedMessage,
    messages,
    goals,
    tasks,
    metrics,
    workLogs,
    userSchedulingContext,
    compiledSchedulingContext,
    pendingScheduleProposals,
    recentAppliedScheduleProposals,
    taskSchedulingContext,
    scheduleRelevantCalendarEvents: calendarContext.events,
    calendarContextWarning: calendarContext.warning,
    latestUserMessageId: userMessage.id,
  });
}

async function resolveAssistantThreadForTurn(
  userId: string,
  threadId: string | null | undefined,
) {
  if (!threadId) {
    return getOrCreateDefaultAssistantThread(userId);
  }

  const thread = await getAssistantThreadById(userId, threadId);

  if (!thread) {
    throw new AssistantThreadNotFoundError();
  }

  return thread;
}

async function maybeSetThreadTitleFromFirstMessage(
  thread: Awaited<ReturnType<typeof getOrCreateDefaultAssistantThread>>,
  message: string,
) {
  if (thread.title !== "New chat" && thread.title !== "Productiv Workspace") {
    return;
  }

  await updateAssistantThreadState({
    threadId: thread.id,
    title: createThreadTitle(message),
  });
}

function createThreadTitle(message: string) {
  const compactTitle = message.replace(/\s+/g, " ").trim();

  if (compactTitle.length === 0) {
    return "New chat";
  }

  if (compactTitle.length <= 48) {
    return compactTitle;
  }

  return `${compactTitle.slice(0, 45).trim()}...`;
}

async function handleScheduleReflectionTurn(input: {
  threadId: string;
  userId: string;
  message: string;
  messages: AssistantMessageRecord[];
  goals: GoalRecord[];
  tasks: TaskRecord[];
  metrics: GoalMetricRecord[];
  workLogs: Awaited<ReturnType<typeof listWorkLogs>>;
  compiledSchedulingContext: CompiledSchedulingContext;
}): Promise<AssistantTurnResponse> {
  const aiProvider = getStructuredAiProvider();
  const modelResponse = normalizeScheduleReflectionModelResponse(
    await aiProvider.generateJson({
      instructions: createScheduleReflectionInstructions(),
      input: buildScheduleReflectionInput({
        message: input.message,
        goals: input.goals,
        tasks: input.tasks,
        metrics: input.metrics,
        workLogs: input.workLogs.slice(0, 8),
        messages: input.messages.slice(-10).map((message) => ({
          role: message.role,
          content: message.content,
        })),
        schedulingContext: input.compiledSchedulingContext,
      }),
      schemaName: "schedule_reflection",
      schema: SCHEDULE_REFLECTION_SCHEMA,
    }),
  );

  const sideEffects = createEmptySideEffects();
  const client = await getRuntimePool().connect();

  try {
    await client.query("begin");

    if (!modelResponse.shouldSaveReflection) {
      await appendAssistantMessage(
        {
          threadId: input.threadId,
          role: "assistant",
          intent: "schedule_reflection_prompt",
          content: modelResponse.assistantMessage,
          structuredPayload: {
            scheduleReflection: modelResponse,
          },
        },
        client,
      );
      await updateAssistantThreadState(
        {
          threadId: input.threadId,
          currentIntent: "schedule_reflection",
          latestContextSummary: modelResponse.contextSummary,
        },
        client,
      );
      await client.query("commit");

      return {
        ...(await getAssistantThreadForUser(input.userId, input.threadId)),
        assistantMessage: modelResponse.assistantMessage,
        navigationHint: modelResponse.navigationHint,
        sideEffects,
      };
    }

    const { timeframeStart, timeframeEnd } = resolveReflectionDateRange(
      modelResponse.timeframeStart,
      modelResponse.timeframeEnd,
    );
    const reflection = await createScheduleReflection(
      {
        userId: input.userId,
        timeframeStart,
        timeframeEnd,
        userNarrative: input.message,
        extractedBlockers: [...modelResponse.disliked, ...modelResponse.obstacles],
        effectiveConditions: modelResponse.liked,
        recurringPreferences: [],
        recommendedMemoryUpdates: modelResponse.strategySuggestions,
      },
      client,
    );
    sideEffects.scheduleReflections.push(reflection);

    const schedulingSuggestions =
      await createDerivedSchedulingSuggestionsFromReflection(
        {
          userId: input.userId,
          reflectionId: reflection.id,
          suggestions: modelResponse.strategySuggestions,
        },
        client,
      );
    sideEffects.schedulingSuggestions.push(...schedulingSuggestions);

    const assistantMessage = appendReflectionSaveSummary(
      modelResponse.assistantMessage,
      schedulingSuggestions.length,
    );

    await appendAssistantMessage(
      {
        threadId: input.threadId,
        role: "assistant",
        intent: "schedule_reflection",
        content: assistantMessage,
        structuredPayload: {
          scheduleReflection: reflection,
          extractedReflection: modelResponse,
          schedulingSuggestions,
          sideEffects,
        },
      },
      client,
    );
    await updateAssistantThreadState(
      {
        threadId: input.threadId,
        currentIntent: "workspace_assistant",
        latestContextSummary: modelResponse.contextSummary,
      },
      client,
    );
    await client.query("commit");

    return {
      ...(await getAssistantThreadForUser(input.userId, input.threadId)),
      assistantMessage,
      navigationHint: modelResponse.navigationHint ?? "calendar",
      sideEffects,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function handlePlanningTurn(input: {
  threadId: string;
  userId: string;
  messages: AssistantMessageRecord[];
  artifact: PlanningArtifact;
  schedulingContext: CompiledSchedulingContext;
  latestUserMessageId: string;
}): Promise<AssistantTurnResponse> {
  const planningMessages = input.messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map(
      (message): PlanningChatMessage => ({
        role: message.role === "user" ? "user" : "assistant",
        content: message.content,
      }),
    );

  const currentDraftPlanningState =
    input.artifact.planningDraftState as Parameters<
      typeof runPlanningTurn
    >[0]["currentDraftPlanningState"];
  const result = await runPlanningTurn({
    chatHistory: planningMessages,
    schedulingContext: input.schedulingContext,
    ...(currentDraftPlanningState ? { currentDraftPlanningState } : {}),
  });

  const sideEffects = createEmptySideEffects();
  const client = await getRuntimePool().connect();

  try {
    await client.query("begin");

    if (result.status === "plan_ready" && result.generatedPlan) {
      const goal = await createGoal(
        {
          userId: input.userId,
          title: result.generatedPlan.mediumTermGoal,
          definition: result.generatedPlan.summary,
          successCriteria: result.generatedPlan.thirtyDayPerformanceGoals,
          focusAreas: buildGoalFocusAreasFromPlan(result.generatedPlan),
          scheduleGuidance: buildScheduleGuidanceFromPlan(result.generatedPlan),
          constraints: result.generatedPlan.constraints,
          notes: [
            `Direction: ${result.generatedPlan.direction}`,
            `Time availability: ${result.generatedPlan.timeAvailability}`,
            result.generatedPlan.constraints.length > 0
              ? `Constraints: ${result.generatedPlan.constraints.join("; ")}`
              : null,
          ]
            .filter((part): part is string => typeof part === "string")
            .join("\n"),
          status: "active",
          priorityRank: 10,
        },
        client,
      );
      sideEffects.goals.push(goal);
      const goalMetrics = await ensureGoalMetricsForGoal(
        {
          userId: input.userId,
          goal,
        },
        client,
      );
      sideEffects.metrics.push(...goalMetrics);
      const schedulingSuggestions =
        await createDerivedSchedulingSuggestionsFromCandidates(
          {
            userId: input.userId,
            candidates: result.schedulingPreferenceCandidates,
            origin: "planning_intake",
            threadId: input.threadId,
            messageId: input.latestUserMessageId,
            turnMode: "planning_intake",
            goalId: goal.id,
            goalTitle: goal.title,
          },
          client,
        );
      sideEffects.schedulingSuggestions.push(...schedulingSuggestions);

      const assistantMessage =
        `${result.assistantMessage}\n\nI turned that into your first goal and initial focus plan.`;

      await appendAssistantMessage(
        {
          threadId: input.threadId,
          role: "assistant",
          intent: "planning_ready",
          content: assistantMessage,
          structuredPayload: {
            generatedPlan: result.generatedPlan,
            schedulingPreferenceCandidates:
              result.schedulingPreferenceCandidates,
            schedulingSuggestions,
            sideEffects,
          },
        },
        client,
      );

      await updateAssistantThreadState(
        {
          threadId: input.threadId,
          currentIntent: "workspace_assistant",
          latestContextSummary: assistantMessage,
          latestArtifact: {
            planningDraftState: result.draftPlanningState,
            generatedPlan: result.generatedPlan,
            planningGoalId: goal.id,
          },
        },
        client,
      );

      await client.query("commit");

      return {
        ...(await getAssistantThreadForUser(input.userId, input.threadId)),
        assistantMessage,
        navigationHint: "goals",
        sideEffects,
      };
    }

    const schedulingSuggestions =
      await createDerivedSchedulingSuggestionsFromCandidates(
        {
          userId: input.userId,
          candidates: result.schedulingPreferenceCandidates,
          origin: "planning_intake",
          threadId: input.threadId,
          messageId: input.latestUserMessageId,
          turnMode: "planning_intake",
        },
        client,
      );
    sideEffects.schedulingSuggestions.push(...schedulingSuggestions);

    await appendAssistantMessage(
      {
        threadId: input.threadId,
        role: "assistant",
        intent: "planning_follow_up",
        content: result.assistantMessage,
        structuredPayload: {
          draftPlanningState: result.draftPlanningState,
          schedulingPreferenceCandidates: result.schedulingPreferenceCandidates,
          schedulingSuggestions,
          sideEffects,
        },
      },
      client,
    );
    await updateAssistantThreadState(
      {
        threadId: input.threadId,
        currentIntent: "planning_intake",
        latestContextSummary: result.assistantMessage,
        latestArtifact: {
          planningDraftState: result.draftPlanningState,
          generatedPlan: input.artifact.generatedPlan ?? null,
          planningGoalId: input.artifact.planningGoalId ?? null,
        },
      },
      client,
    );
    await client.query("commit");

    return {
      ...(await getAssistantThreadForUser(input.userId, input.threadId)),
      assistantMessage: result.assistantMessage,
      navigationHint: "chat",
      sideEffects,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function handleGeneralAssistantTurn(input: {
  threadId: string;
  userId: string;
  tokens: Credentials;
  message: string;
  messages: AssistantMessageRecord[];
  goals: GoalRecord[];
  tasks: TaskRecord[];
  metrics: GoalMetricRecord[];
  workLogs: Awaited<ReturnType<typeof listWorkLogs>>;
  userSchedulingContext: UserSchedulingContextRecord;
  compiledSchedulingContext: CompiledSchedulingContext;
  pendingScheduleProposals: ScheduleProposalRecord[];
  recentAppliedScheduleProposals: ScheduleProposalRecord[];
  taskSchedulingContext: TaskSchedulingContextItem[];
  scheduleRelevantCalendarEvents: ScheduleCalendarEventContext[];
  calendarContextWarning: string | null;
  latestUserMessageId: string;
}): Promise<AssistantTurnResponse> {
  const aiProvider = getStructuredAiProvider();
  const schedulingPlacementPolicy = buildSchedulingPlacementPolicy({
    schedulingContext: input.compiledSchedulingContext,
  });
  const pendingProposalsById = new Map(
    input.pendingScheduleProposals.map((proposal) => [proposal.id, proposal]),
  );
  const recentAppliedProposalsById = new Map(
    input.recentAppliedScheduleProposals.map((proposal) => [
      proposal.id,
      proposal,
    ]),
  );
  const proposalRevisionFeedback = parseScheduleProposalRevisionFeedback(
    input.message,
    getDefaultDraftProposalId(pendingProposalsById) ??
      getDefaultRecentAppliedProposalId(input.recentAppliedScheduleProposals),
  );
  const proposalRevisionProposal = proposalRevisionFeedback
    ? await resolveScheduleProposalForRevision({
        userId: input.userId,
        proposalId: proposalRevisionFeedback.proposalId,
        pendingProposalsById,
        recentAppliedProposalsById,
        loadScheduleProposalById: getScheduleProposalById,
      })
    : null;
  const proposalRevisionSourceProposalsById = new Map(pendingProposalsById);
  if (proposalRevisionProposal) {
    proposalRevisionSourceProposalsById.set(
      proposalRevisionProposal.id,
      proposalRevisionProposal,
    );
  }
  const pendingScheduleProposalsForTurn = [...pendingProposalsById.values()];
  const schedulingHorizonOverride = buildScheduleProposalRevisionHorizonOverride(
    proposalRevisionProposal,
    proposalRevisionFeedback,
  );
  const schedulingCandidateSlots = buildSchedulingCandidateSlots({
    message: input.message,
    schedulingContext: input.compiledSchedulingContext,
    placementPolicy: schedulingPlacementPolicy,
    calendarEvents: input.scheduleRelevantCalendarEvents,
    horizonOverride: schedulingHorizonOverride,
  });
  const schedulingAssemblyInputs = buildSchedulingAssemblyInputsForTurn({
    tasks: input.taskSchedulingContext,
    goals: input.goals,
    proposalRevisionFeedback,
    pendingProposalsById,
    revisionSourceProposalsById: proposalRevisionSourceProposalsById,
  });
  const schedulingAssemblyDraft = buildSchedulingAssemblyDraft({
    message: input.message,
    candidateSlots: schedulingCandidateSlots,
    tasks: schedulingAssemblyInputs.tasks,
    goals: schedulingAssemblyInputs.goals,
    schedulingContext: input.compiledSchedulingContext,
  });
  const modelResponse = normalizeAssistantModelResponse(
    await aiProvider.generateJson({
      instructions: createAssistantTurnInstructions(),
      input: buildAssistantTurnInput({
        message: input.message,
        goals: input.goals,
        tasks: input.tasks,
        metrics: input.metrics,
        workLogs: input.workLogs.slice(0, 8),
        messages: input.messages.slice(-10).map((message) => ({
          role: message.role,
          content: message.content,
        })),
        schedulingContext: input.compiledSchedulingContext,
        schedulingPlacementPolicy,
        schedulingCandidateSlots,
        schedulingAssemblyDraft,
        pendingScheduleProposals: pendingScheduleProposalsForTurn,
        recentAppliedScheduleProposals: input.recentAppliedScheduleProposals,
        taskSchedulingContext: input.taskSchedulingContext,
        scheduleRelevantCalendarEvents: input.scheduleRelevantCalendarEvents,
        calendarContextNote: input.calendarContextWarning,
      }),
      schemaName: "assistant_turn",
      schema: ASSISTANT_TURN_SCHEMA,
    }),
  );

  const sideEffects = createEmptySideEffects();
  const warnings: string[] = [];
  if (input.calendarContextWarning) {
    warnings.push(input.calendarContextWarning);
  }
  const client = await getRuntimePool().connect();
  const goalsById = new Map(input.goals.map((goal) => [goal.id, goal]));
  const tasksById = new Map(input.tasks.map((task) => [task.id, task]));
  const metricsById = new Map(input.metrics.map((metric) => [metric.id, metric]));
  const proposalFeedbackPreferenceCandidates = proposalRevisionFeedback
    ? deriveSchedulingPreferenceCandidatesFromProposalFeedback(
        proposalRevisionFeedback.feedback,
      )
    : [];

  try {
    await client.query("begin");

    const deferredProposalActions: AssistantAction[] = [];
    const appliedActions = [...modelResponse.actions];

    for (const action of modelResponse.actions) {
      if (isScheduleProposalAction(action)) {
        deferredProposalActions.push(action);
        continue;
      }

      await applyAssistantAction(
        {
          userId: input.userId,
          tokens: input.tokens,
          action,
          goalsById,
          tasksById,
          metricsById,
          threadId: input.threadId,
          currentMessage: input.message,
          userSchedulingContext: input.userSchedulingContext,
          pendingProposalsById,
          sideEffects,
          warnings,
        },
        client,
      );
    }

    const deterministicSchedulingAssemblyDraft =
      buildSchedulingAssemblyDraftForTurn({
        message: input.message,
        candidateSlots: schedulingCandidateSlots,
        tasks: [...tasksById.values()],
        goals: [...goalsById.values()],
        pendingScheduleProposals: [...pendingProposalsById.values()],
        calendarEvents: input.scheduleRelevantCalendarEvents,
        proposalRevisionFeedback,
        pendingProposalsById,
        revisionSourceProposalsById: proposalRevisionSourceProposalsById,
        schedulingContext: input.compiledSchedulingContext,
      });
    const deterministicProposalActions =
      buildScheduleProposalActionsFromSchedulingAssemblyDraft({
        message: input.message,
        modelActions: modelResponse.actions,
        draft: deterministicSchedulingAssemblyDraft,
        proposalRevisionFeedback,
      });

    if (deterministicProposalActions.length > 0) {
      appliedActions.push(...deterministicProposalActions);
      warnings.push(
        ...buildDeterministicScheduleProposalWarnings({
          deterministicProposalActions,
          draft: deterministicSchedulingAssemblyDraft,
        }),
      );
    }

    const proposalActions =
      deferredProposalActions.length > 0
        ? [...deferredProposalActions, ...deterministicProposalActions]
        : deterministicProposalActions;

    if (proposalActions.length > 0) {
      const scheduleProposalCountBeforeCreate = sideEffects.scheduleProposals.length;
      await createProposalFromSchedulingActions(
        {
          userId: input.userId,
          actions: proposalActions,
          goalsById,
          tasksById,
          threadId: input.threadId,
          userSchedulingContext: input.userSchedulingContext,
          pendingProposalsById,
          sideEffects,
          warnings,
        },
        client,
        deterministicProposalActions.length > 0
          ? {
              reason:
                "I used Productiv's scheduling engine to draft this proposal instead of asking you to pick times.",
            }
          : undefined,
      );
      await maybeRecordScheduleProposalRevisionFeedback(
        {
          userId: input.userId,
          proposalRevisionFeedback,
          pendingProposalsById,
          revisionSourceProposalsById: proposalRevisionSourceProposalsById,
          replacementProposal:
            sideEffects.scheduleProposals[scheduleProposalCountBeforeCreate] ??
            null,
          sideEffects,
          warnings,
        },
        client,
      );
    } else {
      await maybeRecordScheduleProposalRevisionFeedback(
        {
          userId: input.userId,
          proposalRevisionFeedback,
          pendingProposalsById,
          revisionSourceProposalsById: proposalRevisionSourceProposalsById,
          replacementProposal: null,
          sideEffects,
          warnings,
        },
        client,
      );
    }

    const schedulingSuggestions =
      await createDerivedSchedulingSuggestionsFromCandidates(
        {
          userId: input.userId,
          candidates: modelResponse.schedulingPreferenceCandidates,
          origin: "assistant_turn",
          threadId: input.threadId,
          messageId: input.latestUserMessageId,
          turnMode: "chat",
          goalId:
            sideEffects.goals.length === 1 ? sideEffects.goals[0]?.id : null,
          goalTitle:
            sideEffects.goals.length === 1 ? sideEffects.goals[0]?.title : null,
        },
        client,
      );
    const proposalFeedbackSchedulingSuggestions =
      await createDerivedSchedulingSuggestionsFromCandidates(
        {
          userId: input.userId,
          candidates: proposalFeedbackPreferenceCandidates,
          origin: "schedule_proposal_feedback",
          threadId: input.threadId,
          messageId: input.latestUserMessageId,
          turnMode: "chat",
        },
        client,
      );
    const allSchedulingSuggestions = [
      ...schedulingSuggestions,
      ...proposalFeedbackSchedulingSuggestions,
    ];
    sideEffects.schedulingSuggestions.push(...allSchedulingSuggestions);

    const assistantMessage = appendWarnings(
      modelResponse.assistantMessage,
      warnings,
    );

    await appendAssistantMessage(
      {
        threadId: input.threadId,
        role: "assistant",
        intent: "workspace_assistant",
        content: assistantMessage,
        structuredPayload: {
          actions: appliedActions,
          schedulingPreferenceCandidates:
            modelResponse.schedulingPreferenceCandidates,
          proposalFeedbackPreferenceCandidates,
          schedulingSuggestions: allSchedulingSuggestions,
          scheduleProposals: sideEffects.scheduleProposals,
          proposalRevisionFeedback,
          sideEffects,
        },
      },
      client,
    );
    await updateAssistantThreadState(
      {
        threadId: input.threadId,
        currentIntent: "workspace_assistant",
        latestContextSummary: modelResponse.contextSummary,
      },
      client,
    );

    await client.query("commit");

    return {
      ...(await getAssistantThreadForUser(input.userId, input.threadId)),
      assistantMessage,
      navigationHint: modelResponse.navigationHint,
      sideEffects,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function handleWorkLogTurn(input: {
  threadId: string;
  userId: string;
  message: string;
  goals: GoalRecord[];
  tasks: TaskRecord[];
  metrics: GoalMetricRecord[];
  latestUserMessageId: string;
}): Promise<AssistantTurnResponse> {
  const aiProvider = getStructuredAiProvider();
  const modelResponse = normalizeWorkLogModelResponse(
    await aiProvider.generateJson({
      instructions: createWorkLogInstructions(),
      input: buildWorkLogInput({
        message: input.message,
        metrics: input.metrics,
        goals: input.goals,
        tasks: input.tasks,
      }),
      schemaName: "work_log_turn",
      schema: WORK_LOG_SCHEMA,
    }),
  );

  const sideEffects = createEmptySideEffects();
  const client = await getRuntimePool().connect();

  try {
    await client.query("begin");

    const workLog = await createWorkLog(
      {
        userId: input.userId,
        threadId: input.threadId,
        goalId: modelResponse.goalId,
        taskId: modelResponse.taskId,
        rawText: input.message,
        summary: modelResponse.summary,
      },
      client,
    );
    sideEffects.workLogs.push(workLog);

    for (const update of modelResponse.progressUpdates) {
      const metric = await getGoalMetricById(
        input.userId,
        update.metricId,
        client,
      );

      if (!metric) {
        continue;
      }

      const result = await addMetricProgressEntry(
        {
          userId: input.userId,
          metricId: update.metricId,
          deltaValue: update.deltaValue,
          source: "assistant_extract",
          note: update.note,
          workLogId: workLog.id,
        },
        client,
      );

      if (result) {
        sideEffects.metrics.push(result.metric);
        sideEffects.metricEntries.push(result.entry);
      }
    }

    const schedulingSuggestions =
      await createDerivedSchedulingSuggestionsFromCandidates(
        {
          userId: input.userId,
          candidates: modelResponse.schedulingPreferenceCandidates,
          origin: "work_log_turn",
          threadId: input.threadId,
          messageId: input.latestUserMessageId,
          turnMode: "work_log",
        },
        client,
      );
    sideEffects.schedulingSuggestions.push(...schedulingSuggestions);

    await appendAssistantMessage(
      {
        threadId: input.threadId,
        role: "assistant",
        intent: "work_log",
        content: modelResponse.assistantMessage,
        structuredPayload: {
          workLogId: workLog.id,
          progressUpdates: modelResponse.progressUpdates,
          schedulingPreferenceCandidates:
            modelResponse.schedulingPreferenceCandidates,
          schedulingSuggestions,
          sideEffects,
        },
      },
      client,
    );
    await updateAssistantThreadState(
      {
        threadId: input.threadId,
        currentIntent: "workspace_assistant",
        latestContextSummary: modelResponse.contextSummary,
      },
      client,
    );

    await client.query("commit");

    return {
      ...(await getAssistantThreadForUser(input.userId, input.threadId)),
      assistantMessage: modelResponse.assistantMessage,
      navigationHint: modelResponse.navigationHint,
      sideEffects,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function applyAssistantAction(
  input: {
    userId: string;
    tokens: Credentials;
    action: AssistantAction;
    currentMessage: string;
    goalsById: Map<string, GoalRecord>;
    tasksById: Map<string, TaskRecord>;
    metricsById: Map<string, GoalMetricRecord>;
    threadId: string;
    userSchedulingContext: UserSchedulingContextRecord;
    pendingProposalsById: Map<string, ScheduleProposalRecord>;
    sideEffects: AssistantSideEffects;
    warnings: string[];
  },
  db: ReturnType<typeof getWorkspaceExecutor>,
) {
  switch (input.action.type) {
    case "create_goal": {
      if (!input.action.title) {
        return;
      }

      const reusablePersonalRoutinesGoal = findReusablePersonalRoutinesGoal({
        title: input.action.title,
        goalsById: input.goalsById,
      });
      const goal = reusablePersonalRoutinesGoal
        ? await patchGoal(
            {
              userId: input.userId,
              goalId: reusablePersonalRoutinesGoal.id,
              definition: reusablePersonalRoutinesGoal.definition.trim()
                ? undefined
                : input.action.definition ?? undefined,
              successCriteria:
                input.action.successCriteria.length > 0
                  ? mergeUniqueTextList(
                      reusablePersonalRoutinesGoal.successCriteria,
                      input.action.successCriteria,
                    )
                  : undefined,
              focusAreas: mergeGoalFocusAreas(
                reusablePersonalRoutinesGoal.focusAreas,
                input.action.focusAreas,
              ),
              scheduleGuidance: mergeGoalScheduleGuidance(
                reusablePersonalRoutinesGoal.scheduleGuidance,
                input.action.scheduleGuidance,
              ),
              constraints:
                input.action.constraints.length > 0
                  ? mergeUniqueTextList(
                      reusablePersonalRoutinesGoal.constraints,
                      input.action.constraints,
                    )
                  : undefined,
              notes:
                reusablePersonalRoutinesGoal.notes?.trim()
                  ? undefined
                  : input.action.notes,
              priorityRank: toIntegerOrUndefined(input.action.priorityRank),
              status: isGoalStatus(input.action.status)
                ? input.action.status
                : "active",
            },
            db,
          )
        : await createGoal(
            {
              userId: input.userId,
              title: input.action.title,
              definition: input.action.definition ?? "",
              successCriteria: input.action.successCriteria,
              focusAreas: input.action.focusAreas,
              scheduleGuidance: input.action.scheduleGuidance ?? undefined,
              constraints: input.action.constraints,
              notes: input.action.notes,
              priorityRank: toIntegerOrUndefined(input.action.priorityRank),
              status: isGoalStatus(input.action.status)
                ? input.action.status
                : "active",
            },
            db,
          );

      if (!goal) {
        return;
      }

      input.goalsById.set(goal.id, goal);
      input.sideEffects.goals.push(goal);
      const goalMetrics = await ensureGoalMetricsForGoal(
        {
          userId: input.userId,
          goal,
        },
        db,
      );

      for (const metric of goalMetrics) {
        input.metricsById.set(metric.id, metric);
      }

      input.sideEffects.metrics.push(...goalMetrics);
      return;
    }
    case "update_goal": {
      if (!input.action.goalId) {
        return;
      }

      const existingGoal = input.goalsById.get(input.action.goalId);
      const goal = await patchGoal(
        {
          userId: input.userId,
          goalId: input.action.goalId,
          title: input.action.title ?? undefined,
          definition: input.action.definition ?? undefined,
          successCriteria:
            input.action.successCriteria.length > 0
              ? input.action.successCriteria
              : undefined,
          focusAreas:
            input.action.focusAreas.length > 0
              ? existingGoal
                ? mergeGoalFocusAreas(
                    existingGoal.focusAreas,
                    input.action.focusAreas,
                  )
                : input.action.focusAreas
              : undefined,
          scheduleGuidance: input.action.scheduleGuidance ?? undefined,
          constraints:
            input.action.constraints.length > 0
              ? input.action.constraints
              : undefined,
          notes: input.action.notes ?? undefined,
          priorityRank: toIntegerOrUndefined(input.action.priorityRank),
          status: isGoalStatus(input.action.status)
            ? input.action.status
            : undefined,
        },
        db,
      );

      if (goal) {
        input.goalsById.set(goal.id, goal);
        input.sideEffects.goals.push(goal);
        const goalMetrics = await ensureGoalMetricsForGoal(
          {
            userId: input.userId,
            goal,
          },
          db,
        );

        for (const metric of goalMetrics) {
          input.metricsById.set(metric.id, metric);
        }

        input.sideEffects.metrics.push(...goalMetrics);
      }
      return;
    }
    case "create_task": {
      if (!input.action.title) {
        return;
      }

      const goalId = resolveGoalIdForTurnAction({
        actionGoalId: input.action.goalId,
        turnGoals: input.sideEffects.goals,
      });

      const task = await createTask(
        {
          userId: input.userId,
          goalId,
          title: input.action.title,
          description: input.action.description ?? "",
          priorityRank: toIntegerOrUndefined(input.action.priorityRank),
          status: isTaskStatus(input.action.status)
            ? input.action.status
            : "inbox",
          estimatedMinutes: toIntegerOrNull(input.action.estimatedMinutes),
          dueAt: parseOptionalIsoDate(input.action.dueAt),
          recurrence: input.action.recurrence,
          scheduleIntent: isScheduleIntent(input.action.scheduleIntent)
            ? input.action.scheduleIntent
            : "unscheduled",
        },
        db,
      );
      input.tasksById.set(task.id, task);
      input.sideEffects.tasks.push(task);
      return;
    }
    case "update_task": {
      const taskId =
        input.action.taskId ??
        (input.action.title
          ? findTaskByTitle(input.tasksById, input.action.title)?.id ?? null
          : null);

      if (!taskId) {
        input.warnings.push(
          "I couldn't update that task because I couldn't identify which task to change.",
        );
        return;
      }

      const task = await patchTask(
        {
          userId: input.userId,
          taskId,
          goalId: input.action.goalId ?? undefined,
          title: input.action.title ?? undefined,
          description: input.action.description ?? undefined,
          priorityRank: toIntegerOrUndefined(input.action.priorityRank),
          status: isTaskStatus(input.action.status)
            ? input.action.status
            : undefined,
          estimatedMinutes: toIntegerOrNullUndefined(input.action.estimatedMinutes),
          dueAt:
            input.action.dueAt === null
              ? undefined
              : parseOptionalIsoDate(input.action.dueAt),
          recurrence:
            input.action.recurrence === null
              ? undefined
              : input.action.recurrence,
          scheduleIntent: isScheduleIntent(input.action.scheduleIntent)
            ? input.action.scheduleIntent
            : undefined,
        },
        db,
      );

      if (task) {
        input.tasksById.set(task.id, task);
        input.sideEffects.tasks.push(task);
      } else {
        input.warnings.push("I couldn't update that task because it was not found.");
      }
      return;
    }
    case "create_metric": {
      const goalId = resolveGoalIdForTurnAction({
        actionGoalId: input.action.goalId,
        turnGoals: input.sideEffects.goals,
      });

      if (
        !goalId ||
        !input.action.title ||
        !input.action.unitLabel ||
        input.action.targetValue === null ||
        input.action.targetValue <= 0
      ) {
        return;
      }

      const metric = await createGoalMetric(
        {
          userId: input.userId,
          goalId,
          name: input.action.title,
          unitLabel: input.action.unitLabel,
          targetValue: input.action.targetValue,
          currentValue: input.action.currentValue ?? 0,
          isActive: input.action.isActive ?? true,
        },
        db,
      );
      input.metricsById.set(metric.id, metric);
      input.sideEffects.metrics.push(metric);
      return;
    }
    case "update_metric": {
      if (!input.action.metricId) {
        return;
      }

      const metric = await patchGoalMetric(
        {
          userId: input.userId,
          metricId: input.action.metricId,
          name: input.action.title ?? undefined,
          unitLabel: input.action.unitLabel ?? undefined,
          targetValue:
            input.action.targetValue !== null && input.action.targetValue > 0
              ? input.action.targetValue
              : undefined,
          currentValue: input.action.currentValue ?? undefined,
          isActive: input.action.isActive ?? undefined,
        },
        db,
      );

      if (metric) {
        input.metricsById.set(metric.id, metric);
        input.sideEffects.metrics.push(metric);
      }
      return;
    }
    case "schedule_task": {
      if (!userMessageSpecifiesExactSlot(input.currentMessage)) {
        await createProposalFromSchedulingActions(
          { ...input, actions: [input.action] },
          db,
          {
            reason:
              "I saved that as a proposal instead of placing it directly because you did not explicitly choose the exact slot yet.",
          },
        );
        return;
      }

      await applyDirectScheduleAction(input, db);
      return;
    }
    case "propose_schedule_task": {
      return;
    }
    case "schedule_goal_focus": {
      if (!userMessageSpecifiesExactSlot(input.currentMessage)) {
        await createProposalFromSchedulingActions(
          { ...input, actions: [input.action] },
          db,
          {
            reason:
              "I saved that as a proposal instead of placing it directly because you did not explicitly choose the exact slot yet.",
          },
        );
        return;
      }

      await applyDirectScheduleAction(input, db);
      return;
    }
    case "propose_schedule_goal_focus": {
      return;
    }
    case "confirm_schedule_proposal": {
      await confirmScheduleProposalAction(input, db);
      return;
    }
    case "dismiss_schedule_proposal": {
      await dismissScheduleProposalAction(input, db);
      return;
    }
  }
}

async function createProposalFromSchedulingActions(
  input: {
    userId: string;
    actions: AssistantAction[];
    goalsById: Map<string, GoalRecord>;
    tasksById: Map<string, TaskRecord>;
    threadId: string;
    userSchedulingContext: UserSchedulingContextRecord;
    pendingProposalsById: Map<string, ScheduleProposalRecord>;
    sideEffects: AssistantSideEffects;
    warnings: string[];
  },
  db: ReturnType<typeof getWorkspaceExecutor>,
  options?: {
    reason?: string | undefined;
  },
) {
  const scheduleDetails = (
    await Promise.all(
      input.actions.map((action) =>
        resolveScheduleActionDetails(
          {
            userId: input.userId,
            action,
            goalsById: input.goalsById,
            tasksById: input.tasksById,
            sideEffects: input.sideEffects,
          },
          db,
        ),
      ),
    )
  ).filter((details): details is ScheduleActionDetails => details !== null);
  scheduleDetails.sort(
    (left, right) => left.startTime.getTime() - right.startTime.getTime(),
  );

  if (scheduleDetails.length === 0) {
    input.warnings.push(
      "I couldn't save that scheduling proposal because every calendar proposal needs a specific work item plus exact start and end times.",
    );
    return;
  }

  const conflicts = dedupeSchedulingConflicts(
    scheduleDetails.flatMap((details) =>
      detectSchedulingConflicts(
        input.userSchedulingContext,
        details.startTime,
        details.endTime,
      ),
    ),
  );
  const proposal = await createScheduleProposal(
    {
      userId: input.userId,
      threadId: input.threadId,
      title: buildScheduleProposalTitle(scheduleDetails),
      intent: "assistant_schedule_proposal",
      summary: buildScheduleProposalSummary(scheduleDetails, conflicts),
      operations: scheduleDetails.map((details) => details.operation),
      conflictAnnotations: conflicts,
    },
    db,
  );

  input.pendingProposalsById.set(proposal.id, proposal);
  input.sideEffects.scheduleProposals.push(proposal);
  input.warnings.push(
    `${options?.reason ?? "I saved that as a schedule proposal for you to confirm before it touches the calendar."} ${buildProposalConfirmationHint(scheduleDetails, conflicts)}`,
  );
}

async function maybeRecordScheduleProposalRevisionFeedback(
  input: {
    userId: string;
    proposalRevisionFeedback: ScheduleProposalRevisionFeedback | null;
    pendingProposalsById: Map<string, ScheduleProposalRecord>;
    revisionSourceProposalsById: Map<string, ScheduleProposalRecord>;
    replacementProposal: ScheduleProposalRecord | null;
    sideEffects: AssistantSideEffects;
    warnings: string[];
  },
  db: ReturnType<typeof getWorkspaceExecutor>,
) {
  if (!input.proposalRevisionFeedback) {
    return;
  }

  const originalProposal = input.revisionSourceProposalsById.get(
    input.proposalRevisionFeedback.proposalId,
  );

  if (!originalProposal) {
    input.warnings.push(
      "I couldn't find the original schedule proposal for that feedback, so I left existing drafts unchanged.",
    );
    return;
  }

  const updatedOriginalProposal = await updateScheduleProposalStatus(
    {
      userId: input.userId,
      proposalId: originalProposal.id,
      status:
        originalProposal.status === "draft"
          ? input.replacementProposal
            ? "superseded"
            : "draft"
          : originalProposal.status,
      feedbackEntry: createScheduleProposalRevisionFeedbackEntry({
        feedback: input.proposalRevisionFeedback.feedback,
        replacementProposalId: input.replacementProposal?.id ?? null,
      }),
    },
    db,
  );

  if (updatedOriginalProposal) {
    input.sideEffects.scheduleProposals.push(updatedOriginalProposal);
  }

  if (input.replacementProposal) {
    if (originalProposal.status === "draft") {
      input.pendingProposalsById.delete(originalProposal.id);
    }
    return;
  }

  input.warnings.push(
    "I saved that feedback on the draft. I still need enough detail to propose a revised schedule.",
  );
}

async function applyDirectScheduleAction(
  input: {
    userId: string;
    tokens: Credentials;
    action: AssistantAction;
    currentMessage: string;
    goalsById: Map<string, GoalRecord>;
    tasksById: Map<string, TaskRecord>;
    userSchedulingContext: UserSchedulingContextRecord;
    sideEffects: AssistantSideEffects;
    warnings: string[];
  },
  db: ReturnType<typeof getWorkspaceExecutor>,
) {
  const scheduleDetails = await resolveScheduleActionDetails(input, db);

  if (!scheduleDetails) {
    input.warnings.push("I skipped that schedule request because the work item or time window was incomplete.");
    return;
  }

  const conflicts = detectSchedulingConflicts(
    input.userSchedulingContext,
    scheduleDetails.startTime,
    scheduleDetails.endTime,
  );
  const applied = await applyScheduleDetailsToCalendar(
    input.userId,
    input.tokens,
    scheduleDetails,
    db,
  );

  if (!applied) {
    input.warnings.push("I couldn't place that event on the calendar, so nothing was scheduled.");
    return;
  }

  if (applied.type === "task") {
    input.tasksById.set(applied.task.id, applied.task);
    input.sideEffects.tasks.push(applied.task);
  }

  if (applied.type === "goal_focus") {
    input.goalsById.set(applied.goal.id, applied.goal);
    input.sideEffects.goals.push(applied.goal);
  }

  if (conflicts.length > 0) {
    input.warnings.push(
      `That slot conflicts with your saved preferences (${formatConflictList(conflicts)}), but I kept your explicit choice and scheduled it.`,
    );
  }
}

async function confirmScheduleProposalAction(
  input: {
    userId: string;
    tokens: Credentials;
    action: AssistantAction;
    currentMessage: string;
    goalsById: Map<string, GoalRecord>;
    tasksById: Map<string, TaskRecord>;
    pendingProposalsById: Map<string, ScheduleProposalRecord>;
    userSchedulingContext: UserSchedulingContextRecord;
    sideEffects: AssistantSideEffects;
    warnings: string[];
  },
  db: ReturnType<typeof getWorkspaceExecutor>,
) {
  const proposal = await resolvePendingProposal({
    userId: input.userId,
    proposalId: input.action.proposalId,
    pendingProposalsById: input.pendingProposalsById,
    loadScheduleProposalById: (userId, proposalId) =>
      getScheduleProposalById(userId, proposalId, db),
  });

  if (!proposal) {
    input.warnings.push("I couldn't find a pending schedule proposal to confirm.");
    return;
  }

  if (!isUnqualifiedProposalConfirmation(input.currentMessage)) {
    input.warnings.push(
      "I did not apply that proposal because your feedback looks like a question or requested change. I left it as a draft so you can revise it before confirming.",
    );
    return;
  }

  if (proposal.operations.length === 0) {
    input.warnings.push("That proposal was missing its scheduling details, so I left the calendar unchanged.");
    return;
  }

  const scheduleDetails = proposal.operations.map((operation) =>
    resolveScheduleDetailsFromProposalOperation(
      operation,
      input.goalsById,
      input.tasksById,
    ),
  );

  if (scheduleDetails.some((details) => details === null)) {
    input.warnings.push("I couldn't find the work item tied to that proposal, so I left the calendar unchanged.");
    return;
  }

  const resolvedScheduleDetails = scheduleDetails.filter(
    (details): details is ScheduleActionDetails => details !== null,
  );
  const conflicts = dedupeSchedulingConflicts(
    resolvedScheduleDetails.flatMap((details) =>
      detectSchedulingConflicts(
        input.userSchedulingContext,
        details.startTime,
        details.endTime,
      ),
    ),
  );

  for (const details of resolvedScheduleDetails) {
    const detailsToApply = refreshScheduleDetailsFromMaps(
      details,
      input.goalsById,
      input.tasksById,
    );
    const applied = await applyScheduleDetailsToCalendar(
      input.userId,
      input.tokens,
      detailsToApply,
      db,
      { sourceProposalId: proposal.id },
    );

    if (!applied) {
      input.warnings.push("I couldn't apply that proposal to the calendar, so it is still waiting for confirmation.");
      return;
    }

    if (applied.type === "task") {
      input.tasksById.set(applied.task.id, applied.task);
      input.sideEffects.tasks.push(applied.task);
    }

    if (applied.type === "goal_focus") {
      input.goalsById.set(applied.goal.id, applied.goal);
      input.sideEffects.goals.push(applied.goal);
    }
  }

  const appliedProposal = await updateScheduleProposalStatus(
    {
      userId: input.userId,
      proposalId: proposal.id,
      status: "applied",
      feedbackEntry: {
        type: "confirmed_by_user",
        at: new Date().toISOString(),
      },
    },
    db,
  );
  if (appliedProposal) {
    input.sideEffects.scheduleProposals.push(appliedProposal);
  }
  input.pendingProposalsById.delete(proposal.id);

  if (conflicts.length > 0) {
    input.warnings.push(
      `I applied that proposal because you confirmed it, even though it conflicts with your saved preferences (${formatConflictList(conflicts)}).`,
    );
  }
}

async function dismissScheduleProposalAction(
  input: {
    userId: string;
    action: AssistantAction;
    pendingProposalsById: Map<string, ScheduleProposalRecord>;
    sideEffects: AssistantSideEffects;
    warnings: string[];
  },
  db: ReturnType<typeof getWorkspaceExecutor>,
) {
  const proposal = await resolvePendingProposal({
    userId: input.userId,
    proposalId: input.action.proposalId,
    pendingProposalsById: input.pendingProposalsById,
    loadScheduleProposalById: (userId, proposalId) =>
      getScheduleProposalById(userId, proposalId, db),
  });

  if (!proposal) {
    input.warnings.push("I couldn't find a pending schedule proposal to dismiss.");
    return;
  }

  const canceledProposal = await updateScheduleProposalStatus(
    {
      userId: input.userId,
      proposalId: proposal.id,
      status: "canceled",
      feedbackEntry: {
        type: "dismissed_by_user",
        at: new Date().toISOString(),
      },
    },
    db,
  );
  if (canceledProposal) {
    input.sideEffects.scheduleProposals.push(canceledProposal);
  }
  input.pendingProposalsById.delete(proposal.id);
  input.warnings.push("I dismissed that pending schedule proposal and left your calendar unchanged.");
}

async function resolveScheduleActionDetails(
  input: {
    userId: string;
    action: AssistantAction;
    goalsById: Map<string, GoalRecord>;
    tasksById: Map<string, TaskRecord>;
    sideEffects: AssistantSideEffects;
  },
  db: ReturnType<typeof getWorkspaceExecutor>,
): Promise<ScheduleActionDetails | null> {
  const startTime = parseRequiredIsoDate(input.action.startTime);
  const endTime = parseRequiredIsoDate(input.action.endTime);

  if (!startTime || !endTime || endTime <= startTime) {
    return null;
  }

  if (
    input.action.type === "schedule_goal_focus" ||
    input.action.type === "propose_schedule_goal_focus"
  ) {
    return resolveGoalFocusForSchedulingAction({
      action: input.action,
      goalsById: input.goalsById,
      startTime,
      endTime,
    });
  }

  const task = await resolveTaskForSchedulingAction(input, db);

  if (!task) {
    return null;
  }

  const rawTitle = input.action.title ?? task.title;
  const title = formatScheduleBlockTitleForCalendar(rawTitle, {
    fallbackTitle: task.title,
  });
  const description = input.action.description ?? task.description ?? "";

  return {
    kind: "task",
    task,
    title,
    description,
    startTime,
    endTime,
    operation: {
      type: "schedule_task",
      taskId: task.id,
      occurrenceKey: input.action.occurrenceKey,
      title,
      description,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    },
  };
}

async function resolveTaskForSchedulingAction(
  input: {
    userId: string;
    action: AssistantAction;
    goalsById: Map<string, GoalRecord>;
    tasksById: Map<string, TaskRecord>;
    sideEffects: AssistantSideEffects;
  },
  db: ReturnType<typeof getWorkspaceExecutor>,
) {
  let task = input.action.taskId
    ? input.tasksById.get(input.action.taskId) ?? null
    : null;

  if (!task && input.action.title) {
    task =
      findTaskByTitle(input.tasksById, input.action.title) ??
      (await createTask(
        {
          userId: input.userId,
          goalId: input.action.goalId,
          title: input.action.title,
          description: input.action.description ?? "",
          status: "planned",
          scheduleIntent: "schedule_now",
        },
        db,
      ));

    if (task && !input.tasksById.has(task.id)) {
      input.tasksById.set(task.id, task);
      input.sideEffects.tasks.push(task);
    }
  }

  return task;
}

export function resolveGoalFocusForSchedulingAction(input: {
  action: AssistantAction;
  goalsById: Map<string, GoalRecord>;
  startTime: Date;
  endTime: Date;
}): ScheduleGoalFocusActionDetails | null {
  const goal = resolveGoalForSchedulingAction(input.action, input.goalsById);

  if (!goal) {
    return null;
  }

  const focusArea = resolveGoalFocusArea(goal, input.action.focusId, input.action.title);
  const rawTitle = input.action.title ?? focusArea?.title ?? goal.title;
  const title = formatScheduleBlockTitleForCalendar(rawTitle, {
    fallbackTitle: focusArea?.title ?? goal.title,
  });
  const description =
    input.action.description ??
    focusArea?.description ??
    goal.definition ??
    "";

  return {
    kind: "goal_focus",
    goal,
    focusArea,
    title,
    description,
    startTime: input.startTime,
    endTime: input.endTime,
    operation: {
      type: "schedule_goal_focus",
      goalId: goal.id,
      focusId: focusArea?.id ?? input.action.focusId,
      title,
      description,
      startTime: input.startTime.toISOString(),
      endTime: input.endTime.toISOString(),
    },
  };
}

function resolveGoalForSchedulingAction(
  action: AssistantAction,
  goalsById: Map<string, GoalRecord>,
) {
  if (action.goalId) {
    return goalsById.get(action.goalId) ?? null;
  }

  const matchingFocusGoals = Array.from(goalsById.values()).filter((goal) =>
    resolveGoalFocusArea(goal, action.focusId, action.title),
  );

  if (matchingFocusGoals.length === 1) {
    return matchingFocusGoals[0] ?? null;
  }

  const normalizedTitle = normalizeComparableTitle(action.title ?? "");

  if (!normalizedTitle) {
    return null;
  }

  const matchingTitleGoals = Array.from(goalsById.values()).filter(
    (goal) => normalizeComparableTitle(goal.title) === normalizedTitle,
  );

  return matchingTitleGoals.length === 1 ? matchingTitleGoals[0] ?? null : null;
}

export function formatScheduleBlockTitleForCalendar(
  value: string,
  options?: {
    fallbackTitle?: string | null | undefined;
  },
) {
  const rawTitle = (value.trim() || options?.fallbackTitle?.trim() || "").replace(
    /\s+/gu,
    " ",
  );

  if (!rawTitle) {
    return "Focus block";
  }

  const specificFitnessTitle = getSpecificFitnessScheduleTitle(rawTitle);

  if (specificFitnessTitle) {
    return specificFitnessTitle;
  }

  const shortened = rawTitle
    .replace(/[.?!]+$/u, "")
    .replace(/^perform\s+/iu, "")
    .replace(/^do\s+/iu, "")
    .replace(/^schedule\s+/iu, "")
    .replace(/^complete\s+(?:at least\s+)?(?:\d+\s+)?/iu, "")
    .replace(/\s+every\b.*$/iu, "")
    .replace(/\s+each\b.*$/iu, "")
    .replace(/\s+(?:earlier|later)\s+in\s+the\s+(?:week|day)\b.*$/iu, "")
    .replace(
      /\s+for\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|this|next|\d{1,2})\b.*$/iu,
      "",
    )
    .replace(/\s+for at least\b.*$/iu, "")
    .replace(
      /\s+(?:before|after)\s+(?:study|studying|practice|workout|work|lunch|waking|blocks?)\b.*$/iu,
      "",
    )
    .replace(/\s+within\b.*$/iu, "")
    .replace(/\s+in order to\b.*$/iu, "")
    .replace(/\s+so that\b.*$/iu, "")
    .replace(
      /\s+to\s+(?:achieve|support|build|improve|increase|reduce|maintain|prepare)\b.*$/iu,
      "",
    )
    .trim();

  const title = shortened || rawTitle;

  if (title.length <= 48) {
    return capitalizeFirstCharacter(title);
  }

  return capitalizeFirstCharacter(truncateTitleAtWordBoundary(title, 48));
}

function getSpecificFitnessScheduleTitle(value: string) {
  if (/\bworkout|workouts|exercise|physical activity\b/iu.test(value)) {
    return "Workout";
  }

  if (/\bstrength training|heavy lifting|lifting\b/iu.test(value)) {
    return "Strength training";
  }

  if (/\bcardio|conditioning|stamina\b/iu.test(value)) {
    return "Conditioning";
  }

  if (/\bmobility|stretching|flexibility\b/iu.test(value)) {
    return "Mobility";
  }

  return null;
}

function truncateTitleAtWordBoundary(value: string, maxLength: number) {
  const words = value.split(" ");
  let nextTitle = "";

  for (const word of words) {
    const candidate = nextTitle ? `${nextTitle} ${word}` : word;

    if (candidate.length > maxLength) {
      break;
    }

    nextTitle = candidate;
  }

  return nextTitle || value.slice(0, maxLength).trim();
}

function capitalizeFirstCharacter(value: string) {
  return value.length === 0 ? value : `${value[0]?.toUpperCase()}${value.slice(1)}`;
}

function resolveScheduleDetailsFromProposalOperation(
  operation: ScheduleProposalOperation,
  goalsById: Map<string, GoalRecord>,
  tasksById: Map<string, TaskRecord>,
): ScheduleActionDetails | null {
  const startTime = parseRequiredIsoDate(operation.startTime);
  const endTime = parseRequiredIsoDate(operation.endTime);

  if (!startTime || !endTime || endTime <= startTime) {
    return null;
  }

  if (operation.type === "schedule_task") {
    const task = tasksById.get(operation.taskId);

    if (!task) {
      return null;
    }

    return {
      kind: "task",
      task,
      title: operation.title,
      description: operation.description,
      startTime,
      endTime,
      operation,
    };
  }

  const goal = goalsById.get(operation.goalId);

  if (!goal) {
    return null;
  }

  return {
    kind: "goal_focus",
    goal,
    focusArea: resolveGoalFocusArea(goal, operation.focusId, operation.title),
    title: operation.title,
    description: operation.description,
    startTime,
    endTime,
    operation,
  };
}

function refreshGoalFocusDetailsFromMap(
  details: ScheduleActionDetails,
  goalsById: Map<string, GoalRecord>,
): ScheduleActionDetails {
  if (details.kind !== "goal_focus") {
    return details;
  }

  const latestGoal = goalsById.get(details.goal.id);

  if (!latestGoal) {
    return details;
  }

  return {
    ...details,
    goal: latestGoal,
    focusArea: resolveGoalFocusArea(
      latestGoal,
      details.operation.focusId,
      details.title,
    ),
  };
}

function refreshScheduleDetailsFromMaps(
  details: ScheduleActionDetails,
  goalsById: Map<string, GoalRecord>,
  tasksById: Map<string, TaskRecord>,
): ScheduleActionDetails {
  if (details.kind === "task") {
    const latestTask = tasksById.get(details.task.id);

    return latestTask
      ? {
          ...details,
          task: latestTask,
        }
      : details;
  }

  return refreshGoalFocusDetailsFromMap(details, goalsById);
}

async function applyScheduleDetailsToCalendar(
  userId: string,
  tokens: Credentials,
  details: ScheduleActionDetails,
  db: ReturnType<typeof getWorkspaceExecutor>,
  options?: { sourceProposalId?: string | null | undefined },
) {
  if (details.kind === "goal_focus") {
    const goal = await applyGoalFocusOperationToCalendar(
      userId,
      tokens,
      details,
      db,
    );
    return goal ? { type: "goal_focus" as const, goal } : null;
  }

  const task = await applyTaskScheduleOperationToCalendar(
    userId,
    tokens,
    details.task,
    details.operation,
    db,
    options,
  );

  return task ? { type: "task" as const, task } : null;
}

export async function applyTaskScheduleOperationToCalendar(
  userId: string,
  tokens: Credentials,
  task: TaskRecord,
  operation: Extract<ScheduleProposalOperation, { type: "schedule_task" }>,
  db: ReturnType<typeof getWorkspaceExecutor>,
  options?: {
    sourceProposalId?: string | null | undefined;
    calendarWriter?: CalendarEventWriter | undefined;
  },
) {
  const startTime = parseRequiredIsoDate(operation.startTime);
  const endTime = parseRequiredIsoDate(operation.endTime);

  if (!startTime || !endTime || endTime <= startTime) {
    return null;
  }

  const isRecurringTask = task.recurrence !== null;
  const recurringScheduledOccurrence = isRecurringTask
    ? findScheduledTaskOccurrenceForScheduleOperation(task, operation, startTime)
    : null;
  const calendarReference = isRecurringTask
    ? parseCalendarReference(
        recurringScheduledOccurrence?.calendarEventId ?? null,
      )
    : parseCalendarReference(task.linkedCalendarEventId);
  const calendarWriter = options?.calendarWriter ?? {
    createEvent: createGoogleCalendarEvent,
    updateEvent: updateGoogleCalendarEvent,
  };
  let linkedCalendarEventId: string | null = task.linkedCalendarEventId;
  let occurrenceCalendarEventId: string | null = null;

  if (calendarReference) {
    const updatedEvent = await calendarWriter.updateEvent(tokens, {
      eventId: calendarReference.eventId,
      calendarId: calendarReference.calendarId,
      title: operation.title,
      description: operation.description,
      startTime,
      endTime,
    });
    linkedCalendarEventId = encodeCalendarReference({
      calendarId: calendarReference.calendarId,
      eventId: updatedEvent.id ?? calendarReference.eventId,
    });
    occurrenceCalendarEventId = linkedCalendarEventId;
  } else {
    const createdEvent = await calendarWriter.createEvent(tokens, {
      title: operation.title,
      description: operation.description,
      startTime,
      endTime,
    });
    linkedCalendarEventId =
      createdEvent.id && createdEvent.sourceCalendarId
        ? encodeCalendarReference({
            calendarId: createdEvent.sourceCalendarId,
            eventId: createdEvent.id,
          })
        : task.linkedCalendarEventId;
    occurrenceCalendarEventId = linkedCalendarEventId;
  }

  return patchTask(
    {
      userId,
      taskId: task.id,
      title: operation.title,
      description: operation.description,
      status: "scheduled",
      dueAt: isRecurringTask ? undefined : startTime,
      linkedCalendarEventId: isRecurringTask
        ? task.linkedCalendarEventId ?? linkedCalendarEventId
        : linkedCalendarEventId,
      recurrence: task.recurrence
        ? recordTaskScheduledOccurrence({
            recurrence: task.recurrence,
            startTime,
            endTime,
            calendarEventId: occurrenceCalendarEventId,
            sourceProposalId: options?.sourceProposalId ?? null,
            replacesOccurrenceKey:
              operation.occurrenceKey ??
              getTaskOccurrenceKeyForScheduledOccurrence(
                task.id,
                recurringScheduledOccurrence,
              ),
          })
        : undefined,
      scheduleIntent: "schedule_now",
    },
    db,
  );
}

export function recordTaskScheduledOccurrence(input: {
  recurrence: TaskRecurrence;
  startTime: Date;
  endTime: Date;
  calendarEventId: string | null;
  sourceProposalId?: string | null | undefined;
  replacesOccurrenceKey?: string | null | undefined;
}): TaskRecurrence {
  const dateKey = dateKeyFromDate(input.startTime);
  const replacedDateKey = dateKeyFromTaskOccurrenceKey(
    input.replacesOccurrenceKey,
  );
  const occurrence = {
    dateKey,
    startTime: input.startTime.toISOString(),
    endTime: input.endTime.toISOString(),
    calendarEventId: input.calendarEventId,
    sourceProposalId: input.sourceProposalId ?? null,
  };

  return {
    ...input.recurrence,
    scheduledOccurrences: [
      ...input.recurrence.scheduledOccurrences.filter(
        (scheduledOccurrence) =>
          scheduledOccurrence.dateKey !== dateKey &&
          scheduledOccurrence.dateKey !== replacedDateKey,
      ),
      occurrence,
    ].sort((left, right) => left.dateKey.localeCompare(right.dateKey)),
  };
}

function findScheduledTaskOccurrenceForScheduleOperation(
  task: TaskRecord,
  operation: Extract<ScheduleProposalOperation, { type: "schedule_task" }>,
  operationStartTime: Date,
) {
  const targetDateKey =
    dateKeyFromTaskOccurrenceKey(operation.occurrenceKey, task.id) ??
    dateKeyFromDate(operationStartTime);

  return (
    task.recurrence?.scheduledOccurrences.find(
      (occurrence) => occurrence.dateKey === targetDateKey,
    ) ?? null
  );
}

function getTaskOccurrenceKeyForScheduledOccurrence(
  taskId: string,
  occurrence: TaskRecurrence["scheduledOccurrences"][number] | null,
) {
  return occurrence ? `${taskId}:${occurrence.dateKey}` : null;
}

function dateKeyFromTaskOccurrenceKey(
  value: string | null | undefined,
  taskId?: string,
) {
  if (!value) {
    return null;
  }

  const dateKey = taskId
    ? value.startsWith(`${taskId}:`)
      ? value.slice(taskId.length + 1)
      : null
    : value.split(":").pop() ?? null;

  return dateKey && /^\d{4}-\d{2}-\d{2}$/u.test(dateKey) ? dateKey : null;
}

function dateKeyFromDate(value: Date) {
  return [
    value.getFullYear(),
    (value.getMonth() + 1).toString().padStart(2, "0"),
    value.getDate().toString().padStart(2, "0"),
  ].join("-");
}

async function applyGoalFocusOperationToCalendar(
  userId: string,
  tokens: Credentials,
  details: ScheduleGoalFocusActionDetails,
  db: ReturnType<typeof getWorkspaceExecutor>,
) {
  const startTime = parseRequiredIsoDate(details.operation.startTime);
  const endTime = parseRequiredIsoDate(details.operation.endTime);

  if (!startTime || !endTime || endTime <= startTime) {
    return null;
  }

  const existingCalendarReference = findScheduledGoalFocusCalendarReference(
    details.goal.scheduleGuidance,
    details.operation,
  );
  const calendarEvent = existingCalendarReference
    ? await updateGoogleCalendarEvent(tokens, {
        eventId: existingCalendarReference.eventId,
        calendarId: existingCalendarReference.calendarId,
        title: details.operation.title,
        description: details.operation.description,
        startTime,
        endTime,
      })
    : await createGoogleCalendarEvent(tokens, {
        title: details.operation.title,
        description: details.operation.description,
        startTime,
        endTime,
      });

  return patchGoal(
    {
      userId,
      goalId: details.goal.id,
      scheduleGuidance: buildScheduleGuidanceWithScheduledGoalFocusBlock({
        scheduleGuidance: details.goal.scheduleGuidance,
        operation: details.operation,
        calendarEvent,
      }),
    },
    db,
  );
}

function findScheduledGoalFocusCalendarReference(
  scheduleGuidance: Record<string, unknown> | null | undefined,
  operation: Extract<ScheduleProposalOperation, { type: "schedule_goal_focus" }>,
) {
  const operationStartTime = parseRequiredIsoDate(operation.startTime);

  if (!operationStartTime) {
    return null;
  }

  for (const block of getScheduledFocusBlockRecords(
    normalizeScheduleGuidanceRecord(scheduleGuidance)[
      SCHEDULED_FOCUS_BLOCKS_GUIDANCE_KEY
    ],
  )) {
    if (!scheduledFocusBlockMatchesOperationDate(block, operation, operationStartTime)) {
      continue;
    }

    const calendarEventId = normalizeNullableString(block.calendarEventId);
    const calendarId = normalizeNullableString(block.calendarId);

    if (calendarEventId && calendarId) {
      return {
        eventId: calendarEventId,
        calendarId,
      };
    }
  }

  return null;
}

function scheduledFocusBlockMatchesOperationDate(
  block: Record<string, unknown>,
  operation: Extract<ScheduleProposalOperation, { type: "schedule_goal_focus" }>,
  operationStartTime: Date,
) {
  const blockStartTime = parseRequiredIsoDate(
    typeof block.startTime === "string" ? block.startTime : null,
  );

  if (!blockStartTime || dateKeyFromDate(blockStartTime) !== dateKeyFromDate(operationStartTime)) {
    return false;
  }

  const blockFocusId = normalizeNullableString(block.focusId);
  const operationFocusId = normalizeNullableString(operation.focusId);

  if (blockFocusId || operationFocusId) {
    return blockFocusId === operationFocusId;
  }

  return (
    normalizeComparableTitle(String(block.title ?? "")) ===
    normalizeComparableTitle(operation.title)
  );
}

export function buildScheduleGuidanceWithScheduledGoalFocusBlock(input: {
  scheduleGuidance?: Record<string, unknown> | null | undefined;
  operation: Extract<ScheduleProposalOperation, { type: "schedule_goal_focus" }>;
  calendarEvent: Awaited<ReturnType<typeof createGoogleCalendarEvent>>;
  now?: Date | undefined;
}): Record<string, unknown> {
  const baseGuidance = normalizeScheduleGuidanceRecord(input.scheduleGuidance);
  const scheduledBlock = {
    focusId: input.operation.focusId ?? null,
    title: input.operation.title,
    startTime: input.operation.startTime,
    endTime: input.operation.endTime,
    calendarEventId:
      typeof input.calendarEvent.id === "string" ? input.calendarEvent.id : null,
    calendarId:
      typeof input.calendarEvent.sourceCalendarId === "string"
        ? input.calendarEvent.sourceCalendarId
        : null,
    source: "productiv_schedule",
    scheduledAt: (input.now ?? new Date()).toISOString(),
  };
  const existingBlocks = getScheduledFocusBlockRecords(
    baseGuidance[SCHEDULED_FOCUS_BLOCKS_GUIDANCE_KEY],
  ).filter(
    (block) =>
      !isSameScheduledFocusBlock(block, scheduledBlock) &&
      !referencesSameScheduledCalendarEvent(block, scheduledBlock),
  );

  return {
    ...baseGuidance,
    [SCHEDULED_FOCUS_BLOCKS_GUIDANCE_KEY]: sortScheduledFocusBlocks([
      ...existingBlocks,
      scheduledBlock,
    ]),
  };
}

function referencesSameScheduledCalendarEvent(
  left: Record<string, unknown>,
  right: {
    calendarEventId: string | null;
    calendarId: string | null;
  },
) {
  const leftEventId = normalizeNullableString(left.calendarEventId);
  const leftCalendarId = normalizeNullableString(left.calendarId);

  return (
    !!leftEventId &&
    !!leftCalendarId &&
    leftEventId === right.calendarEventId &&
    leftCalendarId === right.calendarId
  );
}

function normalizeScheduleGuidanceRecord(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return { ...value };
}

function getScheduledFocusBlockRecords(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function normalizeNullableString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isSameScheduledFocusBlock(
  left: Record<string, unknown>,
  right: {
    focusId: string | null;
    title: string;
    startTime: string;
    endTime: string;
  },
) {
  return (
    normalizeNullableString(left.focusId) === right.focusId &&
    normalizeComparableTitle(String(left.title ?? "")) ===
      normalizeComparableTitle(right.title) &&
    left.startTime === right.startTime &&
    left.endTime === right.endTime
  );
}

function sortScheduledFocusBlocks(blocks: Record<string, unknown>[]) {
  return blocks.sort((left, right) =>
    String(left.startTime ?? "").localeCompare(String(right.startTime ?? "")),
  );
}

function buildScheduleProposalTitle(details: ScheduleActionDetails[]) {
  const firstDetail = details[0];

  if (!firstDetail) {
    return "Schedule proposal";
  }

  if (details.length === 1) {
    return `Schedule ${firstDetail.title}`;
  }

  const uniqueTitles = new Set(details.map((detail) => detail.title));
  if (uniqueTitles.size === 1) {
    return `Schedule ${details.length} ${firstDetail.title} blocks`;
  }

  return `Schedule ${details.length} blocks`;
}

function buildScheduleProposalSummary(
  details: ScheduleActionDetails[],
  conflicts: SchedulingConflict[],
) {
  const firstDetail = details[0];
  const lastDetail = details[details.length - 1] ?? firstDetail;

  if (!firstDetail || !lastDetail) {
    return "No complete schedule blocks were proposed.";
  }

  const scheduleLine =
    details.length === 1
      ? `${firstDetail.title} on ${firstDetail.startTime.toLocaleString()} to ${firstDetail.endTime.toLocaleTimeString()}`
      : `${details.length} proposed blocks from ${firstDetail.startTime.toLocaleDateString()} to ${lastDetail.startTime.toLocaleDateString()}`;

  if (conflicts.length === 0) {
    return scheduleLine;
  }

  return `${scheduleLine}. Conflicts: ${formatConflictList(conflicts)}.`;
}

export function buildProposalConfirmationHint(
  details: ScheduleActionDetails[],
  conflicts: SchedulingConflict[],
) {
  const firstDetail = details[0];
  const lastDetail = details[details.length - 1] ?? firstDetail;

  if (!firstDetail || !lastDetail) {
    return "Reply with the missing work item or constraints you want Productiv to use for a revised draft.";
  }

  const base =
    details.length === 1
      ? `Proposed ${firstDetail.title} for ${firstDetail.startTime.toLocaleString()} to ${firstDetail.endTime.toLocaleTimeString()}.`
      : `Proposed ${details.length} blocks from ${firstDetail.startTime.toLocaleDateString()} to ${lastDetail.startTime.toLocaleDateString()}.`;

  if (conflicts.length === 0) {
    return `${base} Use Yes, implement to apply it, or reply with what should change so Productiv can revise the draft.`;
  }

  return `${base} It conflicts with ${formatConflictList(conflicts)}. Use Yes, implement to apply it anyway, or reply with what should change so Productiv can revise the draft.`;
}

function dedupeSchedulingConflicts(conflicts: SchedulingConflict[]) {
  const seen = new Set<string>();

  return conflicts.filter((conflict) => {
    const key = `${conflict.type}:${conflict.title}:${conflict.detail}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function isScheduleProposalAction(action: AssistantAction) {
  return (
    action.type === "propose_schedule_task" ||
    action.type === "propose_schedule_goal_focus"
  );
}

export function parseScheduleProposalRevisionFeedback(
  message: string,
  fallbackProposalId: string | null = null,
): ScheduleProposalRevisionFeedback | null {
  const match =
    /\bfor\s+schedule\s+proposal\s+(?<proposalId>[a-z0-9_-]+),?\s+please\s+revise\s+it\s+based\s+on\s+this\s+feedback:\s*(?<feedback>.+)$/isu.exec(
      message,
    );
  const proposalId = match?.groups?.proposalId?.trim();
  const feedback = match?.groups?.feedback?.replace(/\s+/gu, " ").trim();

  if (proposalId && feedback) {
    return {
      proposalId,
      feedback,
    };
  }

  const fallbackFeedback = message.replace(/\s+/gu, " ").trim();

  if (
    !fallbackProposalId ||
    !fallbackFeedback ||
    !isNaturalScheduleProposalRevisionFeedback(fallbackFeedback)
  ) {
    return null;
  }

  return {
    proposalId: fallbackProposalId,
    feedback: fallbackFeedback,
  };
}

function isNaturalScheduleProposalRevisionFeedback(message: string) {
  const normalized = message.toLowerCase();

  if (
    /\b(confirm|approve|apply|yes|accept|reject|dismiss|cancel)\b/u.test(
      normalized,
    )
  ) {
    return false;
  }

  return (
    /\b(move|shift|push|place|put|reschedule|change|adjust|revise|redo|fix)\b.*\b(schedule|proposal|draft|plan|calendar|block|blocks|task|tasks|habit|routine|workout|study|focus|later|earlier|morning|afternoon|evening|night)\b/u.test(
      normalized,
    ) ||
    /\b(too crowded|too packed|too full|too much|overwhelming|overloaded|lighter|less crowded|less packed|more realistic|buffer|buffers|break|breaks|breathing room|space|spaced out|gap|gaps|back-to-back|back to back)\b/u.test(
      normalized,
    ) ||
    /\b(can you|please|no[, ]+)\b.*\b(later|earlier|morning|afternoon|evening|night|buffer|break|less|more space|move|change|adjust)\b/u.test(
      normalized,
    ) ||
    /\b(can'?t|cannot|won'?t be able|not available|unavailable|busy|conflict)\b.*\b(schedule|proposal|draft|plan|calendar|block|blocks|time|slot|mornings?|afternoons?|evenings?|nights?|monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow)\b/u.test(
      normalized,
    ) ||
    /\b(mornings?|afternoons?|evenings?|nights?|monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow)\b.*\b(blocked|off-limits|off limits|unavailable|busy|conflict)\b/u.test(
      normalized,
    ) ||
    /\b(this|that|it|schedule|proposal|draft|plan|calendar)\b.*\b(doesn'?t work|does not work|won'?t work|will not work|isn'?t workable|is not workable|not realistic)\b/u.test(
      normalized,
    ) ||
    /\b(need|want|have)\b.*\b(change|move|adjust|redo|revise)\b.*\b(today|tomorrow|this week|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/u.test(
      normalized,
    )
  );
}

export function createScheduleProposalRevisionFeedbackEntry(input: {
  feedback: string;
  replacementProposalId?: string | null | undefined;
  now?: Date | undefined;
}) {
  return {
    type: "revision_requested",
    at: (input.now ?? new Date()).toISOString(),
    feedback: input.feedback,
    replacementProposalId: input.replacementProposalId ?? null,
  };
}

export function buildScheduleProposalRevisionHorizonOverride(
  proposal: ScheduleProposalRecord | null,
  proposalRevisionFeedback: ScheduleProposalRevisionFeedback | null = null,
): SchedulingHorizonOverride | null {
  if (!proposal || proposal.operations.length === 0) {
    return null;
  }

  const operations = getProposalOperationsForRevisionFeedback(
    proposal,
    proposalRevisionFeedback,
  );
  const starts: Date[] = [];
  const ends: Date[] = [];

  for (const operation of operations) {
    const startTime = parseRequiredIsoDate(operation.startTime);
    const endTime = parseRequiredIsoDate(operation.endTime);

    if (startTime && endTime && endTime > startTime) {
      starts.push(startTime);
      ends.push(endTime);
    }
  }

  if (starts.length === 0 || ends.length === 0) {
    return null;
  }

  const earliestStart = new Date(
    Math.min(...starts.map((startTime) => startTime.getTime())),
  );
  const latestEnd = new Date(
    Math.max(...ends.map((endTime) => endTime.getTime())),
  );
  const startTime = startOfDayDate(earliestStart);
  const endTime = addDaysDate(startOfDayDate(latestEnd), 1);

  if (endTime <= startTime) {
    return null;
  }

  return {
    startTime,
    endTime,
    source: buildScheduleProposalRevisionHorizonSource({
      proposal,
      proposalRevisionFeedback,
      operationCount: operations.length,
    }),
  };
}

function buildScheduleProposalRevisionHorizonSource(input: {
  proposal: ScheduleProposalRecord;
  proposalRevisionFeedback: ScheduleProposalRevisionFeedback | null;
  operationCount: number;
}) {
  const targetWeekdays = input.proposalRevisionFeedback
    ? getRevisionFeedbackTargetWeekdays(input.proposalRevisionFeedback.feedback)
    : [];

  if (
    targetWeekdays.length > 0 &&
    input.operationCount < input.proposal.operations.length
  ) {
    return `schedule proposal ${input.proposal.id} ${targetWeekdays
      .map(formatWeekdayName)
      .join(", ")} feedback date range`;
  }

  return `schedule proposal ${input.proposal.id} date range`;
}

function getProposalOperationsForRevisionFeedback(
  proposal: ScheduleProposalRecord,
  proposalRevisionFeedback: ScheduleProposalRevisionFeedback | null,
): ScheduleProposalOperation[] {
  const targetWeekdays = proposalRevisionFeedback
    ? getRevisionFeedbackTargetWeekdays(proposalRevisionFeedback.feedback)
    : [];

  if (targetWeekdays.length === 0) {
    return proposal.operations;
  }

  const targetWeekdaySet = new Set(targetWeekdays);
  const matchingOperations = proposal.operations.filter((operation) => {
    const startTime = parseRequiredIsoDate(operation.startTime);
    const weekday = startTime ? getWeekdayIndex(startTime) : null;

    return weekday !== null && targetWeekdaySet.has(weekday);
  });

  return matchingOperations.length > 0 ? matchingOperations : proposal.operations;
}

function getRevisionFeedbackTargetWeekdays(feedback: string): WeekdayIndex[] {
  const days = [
    ["sunday", 0],
    ["monday", 1],
    ["tuesday", 2],
    ["wednesday", 3],
    ["thursday", 4],
    ["friday", 5],
    ["saturday", 6],
  ] as const;
  const normalized = feedback.toLowerCase();
  const targetWeekdays = days
    .filter(([dayName]) => new RegExp(`\\b${dayName}s?\\b`, "u").test(normalized))
    .map(([, day]) => day);

  return [...new Set(targetWeekdays)];
}

function getWeekdayIndex(date: Date): WeekdayIndex | null {
  const day = date.getDay();

  return day >= 0 && day <= 6 ? (day as WeekdayIndex) : null;
}

function formatWeekdayName(day: WeekdayIndex) {
  return (
    [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ][day] ?? "named day"
  );
}

export function deriveSchedulingPreferenceCandidatesFromProposalFeedback(
  feedback: string,
): SchedulingPreferenceCandidate[] {
  const candidates: SchedulingPreferenceCandidate[] = [];
  const seen = new Set<string>();

  if (hasDurableLighterScheduleFeedback(feedback)) {
    candidates.push({
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
      evidence: feedback,
    });
  }

  const unavailablePeriod = inferUnavailableWorkPeriodFromFeedback(feedback);

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
      evidence: feedback,
    });
  }

  const patterns = [
    /\b(?:keep|reserve|save|use|protect)\s+(?:the\s+)?(?<period>mornings?|afternoons?|evenings?)\s+(?:for|to)\s+(?<activity>[a-z][a-z0-9 -]{1,60}?)(?=[,.!?;]|$|\band\b|\bbut\b)/giu,
    /\b(?:move|schedule|put|place)\s+(?<activity>[a-z][a-z0-9 -]{1,60}?)\s+(?:in|during|for|to)\s+(?:the\s+)?(?<period>mornings?|afternoons?|evenings?)(?=[,.!?;]|$|\band\b|\bbut\b)/giu,
    /\b(?<activity>[a-z][a-z0-9 -]{1,60}?)\s+(?:works?\s+best|is\s+best|should\s+happen)\s+(?:in|during)\s+(?:the\s+)?(?<period>mornings?|afternoons?|evenings?)(?=[,.!?;]|$|\band\b|\bbut\b)/giu,
    /\b(?<activity>[a-z][a-z0-9 -]{1,60}?)\s+(?:works?\s+better|is\s+better|are\s+better|feels?\s+better)\s+(?<relativePeriod>earlier|later)\b(?=[,.!?;]|$|\band\b|\bbut\b)/giu,
  ];

  for (const pattern of patterns) {
    for (const match of feedback.matchAll(pattern)) {
      const period =
        normalizeFeedbackWorkPeriod(match.groups?.period) ??
        normalizeRelativeFeedbackWorkPeriod(match.groups?.relativePeriod);
      const activityTitle = normalizeFeedbackActivityTitle(match.groups?.activity);

      if (!period || !activityTitle) {
        continue;
      }

      const key = `${period}:${activityTitle.toLowerCase()}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      candidates.push({
        kind: "preferred_work_period",
        title: `${activityTitle} ${period} preference`,
        detail: `Prefer scheduling ${activityTitle} during the ${period}.`,
        strength: "soft_preference",
        confidence: "medium",
        applicabilityScope: "activity",
        domain: null,
        goalTitle: null,
        activityTitle,
        temporalScope: period,
        evidence: feedback,
      });
    }
  }

  return candidates.slice(0, 3);
}

function hasDurableLighterScheduleFeedback(feedback: string) {
  return (
    /\b(?:prefer|need|usually|generally|normally|always)\b.*\b(?:buffer|buffers|break|breaks|breathing room|space|spaced out|gap|gaps|less crowded|less packed|lighter|less intense|not so much)\b/iu.test(
      feedback,
    ) ||
    /\b(?:too crowded|too packed|too full|too much|overwhelming|overloaded|lighter|less crowded|less packed|less intense|not so much|more realistic)\b/iu.test(
      feedback,
    ) ||
    /\b(?:add|give|use|make|want|more)\b.*\b(?:buffer|buffers|break|breaks|breathing room|space|spaced out|gap|gaps)\b/iu.test(
      feedback,
    )
  );
}

function normalizeRelativeFeedbackWorkPeriod(value: string | undefined) {
  const normalized = value?.toLowerCase().trim();

  if (normalized === "earlier") {
    return "morning";
  }

  if (normalized === "later") {
    return "afternoon";
  }

  return null;
}

function inferUnavailableWorkPeriodFromFeedback(feedback: string) {
  const normalized = feedback.toLowerCase();

  if (
    !/\b(?:can'?t|cannot|won'?t be able|not available|unavailable|busy|conflict|avoid|no|blocked|off-limits|off limits)\b/iu.test(
      normalized,
    )
  ) {
    return null;
  }

  return normalizeFeedbackWorkPeriod(
    /\b(?<period>mornings?|afternoons?|evenings?)\b/iu.exec(normalized)?.groups
      ?.period,
  );
}

function normalizeFeedbackWorkPeriod(value: string | undefined) {
  const normalized = value?.toLowerCase().trim();

  if (normalized === "morning" || normalized === "mornings") {
    return "morning";
  }

  if (normalized === "afternoon" || normalized === "afternoons") {
    return "afternoon";
  }

  if (normalized === "evening" || normalized === "evenings") {
    return "evening";
  }

  return null;
}

function normalizeFeedbackActivityTitle(value: string | undefined) {
  const cleaned = value
    ?.replace(/\b(?:my|the|a|an)\b/giu, " ")
    .replace(/^(?:and|but|then)\s+/iu, "")
    .replace(/\s+/gu, " ")
    .trim();

  if (!cleaned || cleaned.length < 2) {
    return null;
  }

  return cleaned
    .split(" ")
    .map((word) => capitalizeFirstCharacter(word.toLowerCase()))
    .join(" ");
}

export function buildScheduleProposalActionsFromSchedulingAssemblyDraft(input: {
  message: string;
  modelActions: AssistantAction[];
  draft: SchedulingAssemblyDraft;
  proposalRevisionFeedback?: ScheduleProposalRevisionFeedback | null | undefined;
}): AssistantAction[] {
  if (
    !shouldUseDeterministicScheduleProposalCompletion(
      input.message,
      input.draft.assignments.length,
      input.proposalRevisionFeedback ?? null,
    )
  ) {
    return [];
  }

  return getUncoveredSchedulingAssemblyAssignments(
    input.draft.assignments,
    input.modelActions,
  ).flatMap((assignment) => {
    if (
      assignment.actionTypeHint === "propose_schedule_task" &&
      assignment.taskId
    ) {
      return [
        createAssistantAction({
          type: "propose_schedule_task",
          taskId: assignment.taskId,
          occurrenceKey: assignment.occurrenceKey,
          goalId: assignment.goalId,
          title: assignment.title,
          estimatedMinutes: assignment.durationMinutes,
          startTime: assignment.startTime,
          endTime: assignment.endTime,
        }),
      ];
    }

    if (
      assignment.actionTypeHint === "propose_schedule_goal_focus" &&
      assignment.goalId
    ) {
      return [
        createAssistantAction({
          type: "propose_schedule_goal_focus",
          goalId: assignment.goalId,
          focusId: assignment.focusId,
          title: assignment.title,
          estimatedMinutes: assignment.durationMinutes,
          startTime: assignment.startTime,
          endTime: assignment.endTime,
        }),
      ];
    }

    return [];
  });
}

function getUncoveredSchedulingAssemblyAssignments(
  assignments: SchedulingAssemblyAssignment[],
  modelActions: AssistantAction[],
) {
  const proposalActions = modelActions.filter(isScheduleProposalAction);
  const coveredAssignmentIndexes = new Set<number>();

  for (const action of proposalActions) {
    const matchingIndex = assignments.findIndex((assignment, index) => {
      if (coveredAssignmentIndexes.has(index)) {
        return false;
      }

      return proposalActionCoversAssignment(action, assignment);
    });

    if (matchingIndex !== -1) {
      coveredAssignmentIndexes.add(matchingIndex);
    }
  }

  return assignments.filter((_, index) => !coveredAssignmentIndexes.has(index));
}

function proposalActionCoversAssignment(
  action: AssistantAction,
  assignment: SchedulingAssemblyAssignment,
) {
  if (
    action.type === "propose_schedule_task" &&
    assignment.actionTypeHint === "propose_schedule_task"
  ) {
    if (
      action.taskId
        ? action.taskId !== assignment.taskId
        : !proposalActionTitleMatchesAssignment(action, assignment)
    ) {
      return false;
    }

    return (
      !action.occurrenceKey ||
      !assignment.occurrenceKey ||
      action.occurrenceKey === assignment.occurrenceKey
    );
  }

  if (
    action.type === "propose_schedule_goal_focus" &&
    assignment.actionTypeHint === "propose_schedule_goal_focus"
  ) {
    const goalMatches = action.goalId
      ? action.goalId === assignment.goalId
      : proposalActionTitleMatchesAssignment(action, assignment);

    if (!goalMatches) {
      return false;
    }

    return action.focusId
      ? action.focusId === assignment.focusId
      : proposalActionTitleMatchesAssignment(action, assignment);
  }

  return false;
}

function proposalActionTitleMatchesAssignment(
  action: AssistantAction,
  assignment: SchedulingAssemblyAssignment,
) {
  const actionTitle = normalizeComparableTitle(action.title ?? "");
  const assignmentTitle = normalizeComparableTitle(assignment.title);

  return actionTitle.length > 0 && actionTitle === assignmentTitle;
}

export function buildScheduleAssemblyUnscheduledItemsSummary(
  draft: SchedulingAssemblyDraft,
) {
  if (draft.unscheduledItems.length === 0) {
    return null;
  }

  const visibleItems = draft.unscheduledItems.slice(0, 3);
  const itemSummaries = visibleItems.map((item) => {
    const title = item.title.trim() || "Untitled item";
    const reason = item.reason.trim();

    return reason ? `${title}: ${reason}` : title;
  });
  const remainingCount = draft.unscheduledItems.length - visibleItems.length;
  const remainingSummary =
    remainingCount > 0
      ? ` I also left ${remainingCount} more item${remainingCount === 1 ? "" : "s"} out.`
      : "";

  return `I left ${draft.unscheduledItems.length === 1 ? "this item" : "these items"} out of the draft so the schedule stays realistic: ${itemSummaries.join("; ")}.${remainingSummary} You can tell me what to loosen, move, or prioritize and I'll revise it.`;
}

export function buildDeterministicScheduleProposalWarnings(input: {
  deterministicProposalActions: AssistantAction[];
  draft: SchedulingAssemblyDraft;
}) {
  if (input.deterministicProposalActions.length === 0) {
    return [];
  }

  const unscheduledSummary = buildScheduleAssemblyUnscheduledItemsSummary(
    input.draft,
  );

  return unscheduledSummary ? [unscheduledSummary] : [];
}

export function resolveGoalIdForTurnAction(input: {
  actionGoalId: string | null;
  turnGoals: Array<{ id: string }>;
}) {
  if (input.actionGoalId) {
    return input.actionGoalId;
  }

  return input.turnGoals.length === 1 ? input.turnGoals[0]?.id ?? null : null;
}

function shouldUseDeterministicScheduleProposalCompletion(
  message: string,
  assignmentCount: number,
  proposalRevisionFeedback: ScheduleProposalRevisionFeedback | null = null,
) {
  return (
    assignmentCount > 0 &&
    (proposalRevisionFeedback !== null || hasScheduleGenerationIntent(message))
  );
}

function hasScheduleGenerationIntent(message: string) {
  return (
    parseScheduleProposalRevisionFeedback(message) !== null ||
    /\b(generate|create|make|build|draft|plan|schedule|fill|put together)\b.*\b(schedule|calendar|day|week|today|tomorrow|weekend|blocks?|time)\b/iu.test(
      message,
    )
  );
}

function createAssistantAction(
  patch: Partial<AssistantAction> & Pick<AssistantAction, "type">,
): AssistantAction {
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
    priorityRank: patch.priorityRank ?? null,
    status: patch.status ?? null,
    scheduleIntent: patch.scheduleIntent ?? null,
    startTime: patch.startTime ?? null,
    endTime: patch.endTime ?? null,
    isActive: patch.isActive ?? null,
  };
}

function isUnqualifiedProposalConfirmation(message: string) {
  const feedbackMatch = /\bfeedback:\s*(?<feedback>.+)$/iu.exec(message);
  const feedback = feedbackMatch?.groups?.feedback?.trim();

  if (!feedback) {
    return true;
  }

  return !/[?]|\b(is|are|was|were|what|why|how|can|could|should|would|instead|different|change|move|not|just|only)\b/iu.test(
    feedback,
  );
}

export async function resolvePendingProposal(input: {
  userId: string;
  proposalId: string | null;
  pendingProposalsById: Map<string, ScheduleProposalRecord>;
  loadScheduleProposalById?: (
    userId: string,
    proposalId: string,
  ) => Promise<ScheduleProposalRecord | null>;
}) {
  const { pendingProposalsById, proposalId } = input;

  if (proposalId) {
    const cachedProposal = pendingProposalsById.get(proposalId);

    if (cachedProposal) {
      return cachedProposal.status === "draft" ? cachedProposal : null;
    }

    const loadedProposal = input.loadScheduleProposalById
      ? await input.loadScheduleProposalById(input.userId, proposalId)
      : null;

    if (loadedProposal?.status !== "draft") {
      return null;
    }

    pendingProposalsById.set(loadedProposal.id, loadedProposal);
    return loadedProposal;
  }

  const iterator = pendingProposalsById.values().next();
  return iterator.done || iterator.value.status !== "draft" ? null : iterator.value;
}

export async function resolveScheduleProposalForRevision(input: {
  userId: string;
  proposalId: string | null;
  pendingProposalsById: Map<string, ScheduleProposalRecord>;
  recentAppliedProposalsById: Map<string, ScheduleProposalRecord>;
  loadScheduleProposalById?: (
    userId: string,
    proposalId: string,
  ) => Promise<ScheduleProposalRecord | null>;
}) {
  if (!input.proposalId) {
    return resolvePendingProposal(input);
  }

  const cachedDraftProposal = input.pendingProposalsById.get(input.proposalId);
  if (cachedDraftProposal?.status === "draft") {
    return cachedDraftProposal;
  }

  const cachedAppliedProposal = input.recentAppliedProposalsById.get(
    input.proposalId,
  );
  if (cachedAppliedProposal?.status === "applied") {
    return cachedAppliedProposal;
  }

  const loadedProposal = input.loadScheduleProposalById
    ? await input.loadScheduleProposalById(input.userId, input.proposalId)
    : null;

  if (loadedProposal?.status === "draft") {
    input.pendingProposalsById.set(loadedProposal.id, loadedProposal);
    return loadedProposal;
  }

  if (loadedProposal?.status === "applied") {
    input.recentAppliedProposalsById.set(loadedProposal.id, loadedProposal);
    return loadedProposal;
  }

  return null;
}

function getDefaultDraftProposalId(
  pendingProposalsById: Map<string, ScheduleProposalRecord>,
) {
  for (const proposal of pendingProposalsById.values()) {
    if (proposal.status === "draft") {
      return proposal.id;
    }
  }

  return null;
}

function getDefaultRecentAppliedProposalId(proposals: ScheduleProposalRecord[]) {
  return proposals.find((proposal) => proposal.operations.length > 0)?.id ?? null;
}

export function shouldUsePlanningFlow(
  artifact: Record<string, unknown>,
  goalCount: number,
  mode: AssistantTurnMode,
  message: string,
) {
  const hasPlanningDraft =
    artifact.planningDraftState !== null &&
    artifact.planningDraftState !== undefined;

  return (
    goalCount === 0 &&
    mode === "chat" &&
    !artifact.planningGoalId &&
    !hasMultipleOperationalIntents(message) &&
    (hasPlanningDraft || hasGoalPlanningIntent(message))
  );
}

export function inferTurnMode(
  message: string,
  requestedMode: AssistantTurnMode | undefined,
  hasMetrics: boolean,
): AssistantTurnMode {
  if (requestedMode) {
    return requestedMode;
  }

  if (hasMultipleOperationalIntents(message)) {
    return "chat";
  }

  if (
    /\b(reflect|reflection|review|retro|retrospective)\b/i.test(message) &&
    /\b(schedule|calendar|plan|planned|week|day)\b/i.test(message)
  ) {
    return "schedule_reflection";
  }

  if (
    hasMetrics &&
    /(worked|studied|finished|completed|practiced|logged|spent|applied|submitted|answered|solved|read|ran|walked|lifted|did)\b/i.test(message) &&
    /\b\d+(\.\d+)?\b/.test(message)
  ) {
    return "work_log";
  }

  return "chat";
}

function hasMultipleOperationalIntents(message: string) {
  const categories = getWorkspaceIntentCategories(message);

  categories.delete("preference");

  if (categories.has("reflection")) {
    categories.delete("schedule");
  }

  return categories.size > 1;
}

function getWorkspaceIntentCategories(message: string) {
  const categories = new Set<
    | "goal"
    | "task"
    | "schedule"
    | "habit"
    | "work_log"
    | "reflection"
    | "preference"
  >();

  if (hasGoalPlanningIntent(message)) {
    categories.add("goal");
  }

  if (
    /\b(task|tasks|todo|to-do|reminder|errand|laundry|call|email|pay|submit|finish|draft)\b/iu.test(
      message,
    )
  ) {
    categories.add("task");
  }

  if (
    /\b(schedule|calendar|block|timebox|reschedule|move|shift|next week|this week|tomorrow at|today at)\b/iu.test(
      message,
    )
  ) {
    categories.add("schedule");
  }

  if (
    /\b(habit|routine|recurring|repeat|daily|weekly|weekdays?|weekends?|every|each)\b/iu.test(
      message,
    )
  ) {
    categories.add("habit");
  }

  if (
    /(worked|studied|finished|completed|practiced|logged|spent|applied|submitted|answered|solved|read|ran|walked|lifted|did)\b/iu.test(message) &&
    /\b\d+(\.\d+)?\b/u.test(message)
  ) {
    categories.add("work_log");
  }

  if (
    /\b(reflect|reflection|retro|retrospective)\b/iu.test(message) ||
    /\b(what worked|what didn't work|what did not work|got in the way)\b/iu.test(
      message,
    )
  ) {
    categories.add("reflection");
  }

  if (
    /\b(prefer|preferred|avoid|usually|normally|always|never|best for me|don't like|do not like)\b/iu.test(
      message,
    )
  ) {
    categories.add("preference");
  }

  return categories;
}

function hasGoalPlanningIntent(message: string) {
  return (
    /\b(goal|goals|objective|focus areas?|focus blocks?|working toward|working towards|work toward|work towards|train for|prepare for|get better|improve|learn|build|launch|ship)\b/iu.test(
      message,
    ) ||
    /\bi\s+(?:want|need|would like|am trying|['’]?m trying)\s+to\s+(?!add|schedule|move|reschedule|log|reflect|review|finish|complete)\b/iu.test(
      message,
    )
  );
}

async function loadScheduleRelevantCalendarContext(input: {
  userId: string;
  tokens: Credentials;
  message: string;
  mode: AssistantTurnMode;
}): Promise<{
  events: ScheduleCalendarEventContext[];
  warning: string | null;
}> {
  if (!shouldLoadCalendarContext(input.message, input.mode)) {
    return {
      events: [],
      warning: null,
    };
  }

  const startDate = new Date();
  const endDate = addDaysDate(startDate, 21);

  try {
    const includedCalendarIds = await getIncludedCalendarIdsForUser(input.userId);
    const events = await getMergedCalendarEvents(
      input.tokens,
      startDate,
      endDate,
      includedCalendarIds,
    );

    return {
      events: events.slice(0, 50).map((event) => ({
        id: event.id ?? null,
        title: event.summary ?? "Untitled event",
        start: event.start?.dateTime ?? event.start?.date ?? null,
        end: event.end?.dateTime ?? event.end?.date ?? null,
        allDay: !event.start?.dateTime || !event.end?.dateTime,
        sourceCalendarId: event.sourceCalendarId,
        sourceCalendarName: event.sourceCalendarName,
      })),
      warning: null,
    };
  } catch (error) {
    console.error("[Assistant] Failed to load calendar context", error);

    return {
      events: [],
      warning:
        "I could not load included calendar events for this turn, so the schedule proposal may miss calendar conflicts.",
    };
  }
}

function shouldLoadCalendarContext(message: string, mode: AssistantTurnMode) {
  if (mode !== "chat") {
    return false;
  }

  return /\b(schedule|calendar|next week|this week|tomorrow|today|weekend|travel|trip|beach|busy|available|availability|conflict)\b/i.test(
    message,
  );
}

function buildTaskSchedulingContext(
  tasks: TaskRecord[],
  pendingScheduleProposals: ScheduleProposalRecord[],
  calendarEvents: ScheduleCalendarEventContext[],
): TaskSchedulingContextItem[] {
  return tasks
    .filter((task) => task.status !== "done" && task.status !== "canceled")
    .map((task) =>
      buildTaskSchedulingContextItem(
        task,
        pendingScheduleProposals,
        calendarEvents,
      ),
    )
    .sort(compareTaskSchedulingContextItems);
}

export function buildSchedulingAssemblyInputsForTurn(input: {
  tasks: TaskSchedulingContextItem[];
  goals: GoalRecord[];
  proposalRevisionFeedback: ScheduleProposalRevisionFeedback | null;
  pendingProposalsById: Map<string, ScheduleProposalRecord>;
  revisionSourceProposalsById?: Map<string, ScheduleProposalRecord> | undefined;
}): {
  tasks: SchedulingAssemblyTaskInput[];
  goals: SchedulingAssemblyGoalInput[];
} {
  if (!input.proposalRevisionFeedback) {
    return {
      tasks: input.tasks,
      goals: input.goals,
    };
  }

  const sourceProposalsById =
    input.revisionSourceProposalsById ?? input.pendingProposalsById;
  const originalProposal = sourceProposalsById.get(
    input.proposalRevisionFeedback.proposalId,
  );

  if (!originalProposal) {
    return {
      tasks: [],
      goals: [],
    };
  }

  const revisionOperations = getProposalOperationsForRevisionFeedback(
    originalProposal,
    input.proposalRevisionFeedback,
  );
  const proposalTaskIds = new Set<string>();
  const proposalTaskOccurrenceKeysByTaskId = new Map<string, string[]>();
  const proposalFocusIdsByGoalId = new Map<string, Set<string | null>>();

  for (const operation of revisionOperations) {
    if (operation.type === "schedule_task") {
      proposalTaskIds.add(operation.taskId);

      const occurrenceKey =
        operation.occurrenceKey ??
        getFallbackTaskOccurrenceKeyFromOperation(operation);

      if (occurrenceKey) {
        const occurrenceKeys =
          proposalTaskOccurrenceKeysByTaskId.get(operation.taskId) ?? [];

        if (!occurrenceKeys.includes(occurrenceKey)) {
          occurrenceKeys.push(occurrenceKey);
          proposalTaskOccurrenceKeysByTaskId.set(
            operation.taskId,
            occurrenceKeys,
          );
        }
      }

      continue;
    }

    if (operation.type !== "schedule_goal_focus") {
      continue;
    }

    const focusIds =
      proposalFocusIdsByGoalId.get(operation.goalId) ?? new Set<string | null>();
    focusIds.add(operation.focusId);
    proposalFocusIdsByGoalId.set(operation.goalId, focusIds);
  }

  const tasks = input.tasks
    .filter((task) => proposalTaskIds.has(task.id))
    .map((task) => {
      const revisionOccurrenceKeys =
        task.recurrence === null
          ? []
          : proposalTaskOccurrenceKeysByTaskId.get(task.id) ?? [];

      return {
        ...task,
        ...(revisionOccurrenceKeys.length > 0
          ? { revisionOccurrenceKeys }
          : {}),
        calendarStatus: "needs_scheduling" as const,
        reason: "Task is being revised from a draft schedule proposal.",
        matchedCalendarEvent: null,
        pendingProposalId: null,
      };
    });
  const goals = input.goals.flatMap((goal) => {
    const proposalFocusIds = proposalFocusIdsByGoalId.get(goal.id);

    if (!proposalFocusIds) {
      return [];
    }

    const includeAllFocusAreas = proposalFocusIds.has(null);
    const focusAreas = includeAllFocusAreas
      ? goal.focusAreas
      : goal.focusAreas.filter((focusArea) =>
          proposalFocusIds.has(focusArea.id),
        );

    return focusAreas.length > 0
      ? [
          {
            ...goal,
            focusAreas,
          },
        ]
      : [];
  });

  return {
    tasks,
    goals,
  };
}

function getFallbackTaskOccurrenceKeyFromOperation(
  operation: Extract<ScheduleProposalOperation, { type: "schedule_task" }>,
) {
  const startTime = parseRequiredIsoDate(operation.startTime);

  return startTime ? `${operation.taskId}:${dateKeyFromDate(startTime)}` : null;
}

export function buildSchedulingAssemblyDraftForTurn(input: {
  message: string;
  candidateSlots: Parameters<typeof buildSchedulingAssemblyDraft>[0]["candidateSlots"];
  tasks: TaskRecord[];
  goals: GoalRecord[];
  pendingScheduleProposals: ScheduleProposalRecord[];
  calendarEvents: ScheduleCalendarEventContext[];
  proposalRevisionFeedback: ScheduleProposalRevisionFeedback | null;
  pendingProposalsById: Map<string, ScheduleProposalRecord>;
  revisionSourceProposalsById?: Map<string, ScheduleProposalRecord> | undefined;
  schedulingContext?: CompiledSchedulingContext | undefined;
}) {
  const taskSchedulingContext = buildTaskSchedulingContext(
    input.tasks,
    input.pendingScheduleProposals,
    input.calendarEvents,
  );
  const schedulingAssemblyInputs = buildSchedulingAssemblyInputsForTurn({
    tasks: taskSchedulingContext,
    goals: input.goals,
    proposalRevisionFeedback: input.proposalRevisionFeedback,
    pendingProposalsById: input.pendingProposalsById,
    revisionSourceProposalsById: input.revisionSourceProposalsById,
  });

  return buildSchedulingAssemblyDraft({
    message: input.message,
    candidateSlots: input.candidateSlots,
    tasks: schedulingAssemblyInputs.tasks,
    goals: schedulingAssemblyInputs.goals,
    schedulingContext: input.schedulingContext,
  });
}

function buildTaskSchedulingContextItem(
  task: TaskRecord,
  pendingScheduleProposals: ScheduleProposalRecord[],
  calendarEvents: ScheduleCalendarEventContext[],
): TaskSchedulingContextItem {
  const pendingProposalId = findPendingProposalIdForTask(
    task,
    pendingScheduleProposals,
  );
  const matchedCalendarEvent = findCalendarEventForTask(task, calendarEvents);
  const scheduledDateKeys = getScheduledDateKeysForTask(
    task,
    matchedCalendarEvent,
  );

  if (pendingProposalId) {
    return {
      ...baseTaskSchedulingContextItem(task, scheduledDateKeys),
      calendarStatus: "pending_proposal",
      reason: "Task already appears in a draft schedule proposal.",
      matchedCalendarEvent: null,
      pendingProposalId,
    };
  }

  if (task.recurrence && task.scheduleIntent !== "someday") {
    return {
      ...baseTaskSchedulingContextItem(task, scheduledDateKeys),
      calendarStatus: "needs_scheduling",
      reason: "Recurring task should generate schedule occurrences inside the requested horizon.",
      matchedCalendarEvent,
      pendingProposalId: null,
    };
  }

  if (matchedCalendarEvent || task.linkedCalendarEventId) {
    return {
      ...baseTaskSchedulingContextItem(task, scheduledDateKeys),
      calendarStatus: "scheduled",
      reason: matchedCalendarEvent
        ? "Task matches an included calendar event."
        : "Task has a linked calendar event id.",
      matchedCalendarEvent,
      pendingProposalId: null,
    };
  }

  const isReadyForScheduling =
    task.scheduleIntent === "schedule_now" ||
    (task.scheduleIntent !== "someday" && task.dueAt !== null);

  return {
    ...baseTaskSchedulingContextItem(task, scheduledDateKeys),
    calendarStatus: isReadyForScheduling ? "needs_scheduling" : "not_requested",
    reason:
      isReadyForScheduling
        ? "Task has schedule intent or a due date but no matching calendar event."
        : "Task is active but has no due date, recurrence, or explicit schedule-now intent.",
    matchedCalendarEvent: null,
    pendingProposalId: null,
  };
}

function baseTaskSchedulingContextItem(
  task: TaskRecord,
  scheduledDateKeys: string[],
): Omit<
  TaskSchedulingContextItem,
  "calendarStatus" | "reason" | "matchedCalendarEvent" | "pendingProposalId"
> {
  return {
    id: task.id,
    title: task.title,
    goalId: task.goalId,
    status: task.status,
    priorityRank: task.priorityRank,
    estimatedMinutes: task.estimatedMinutes,
    dueAt: task.dueAt,
    recurrence: task.recurrence,
    scheduledDateKeys,
    scheduleIntent: task.scheduleIntent,
    linkedCalendarEventId: task.linkedCalendarEventId,
  };
}

function getScheduledDateKeysForTask(
  task: TaskRecord,
  matchedCalendarEvent: ScheduleCalendarEventContext | null,
) {
  const matchedStartDate =
    matchedCalendarEvent?.start && !Number.isNaN(Date.parse(matchedCalendarEvent.start))
      ? new Date(matchedCalendarEvent.start)
      : null;
  const dateKeys = [
    ...(task.recurrence?.scheduledOccurrences.map(
      (occurrence) => occurrence.dateKey,
    ) ?? []),
    ...(matchedStartDate ? [dateKeyFromDate(matchedStartDate)] : []),
  ].filter((dateKey) => /^\d{4}-\d{2}-\d{2}$/u.test(dateKey));

  return [...new Set(dateKeys)].sort();
}

function findPendingProposalIdForTask(
  task: TaskRecord,
  pendingScheduleProposals: ScheduleProposalRecord[],
) {
  return (
    pendingScheduleProposals.find((proposal) =>
      proposal.operations.some(
        (operation) =>
          operation.type === "schedule_task" && operation.taskId === task.id,
      ),
    )?.id ?? null
  );
}

function findCalendarEventForTask(
  task: TaskRecord,
  calendarEvents: ScheduleCalendarEventContext[],
) {
  const calendarReference = parseCalendarReference(task.linkedCalendarEventId);

  if (calendarReference) {
    const linkedEvent = calendarEvents.find(
      (event) =>
        event.id === calendarReference.eventId &&
        event.sourceCalendarId === calendarReference.calendarId,
    );

    if (linkedEvent) {
      return linkedEvent;
    }
  }

  const taskDueAt = parseOptionalIsoDate(task.dueAt);

  if (!taskDueAt) {
    return null;
  }

  return (
    calendarEvents.find((event) => {
      if (event.allDay || !event.start || !event.end) {
        return false;
      }

      const eventStart = parseOptionalIsoDate(event.start);
      const eventEnd = parseOptionalIsoDate(event.end);

      if (!eventStart || !eventEnd) {
        return false;
      }

      return (
        datesAreSameDay(taskDueAt, eventStart) &&
        Math.abs(taskDueAt.getTime() - eventStart.getTime()) <=
          6 * 60 * 60 * 1000 &&
        titlesLikelyMatch(task.title, event.title)
      );
    }) ?? null
  );
}

function compareTaskSchedulingContextItems(
  left: TaskSchedulingContextItem,
  right: TaskSchedulingContextItem,
) {
  const statusPriority = {
    needs_scheduling: 0,
    pending_proposal: 1,
    scheduled: 2,
    not_requested: 3,
  };
  const statusDifference =
    statusPriority[left.calendarStatus] - statusPriority[right.calendarStatus];

  if (statusDifference !== 0) {
    return statusDifference;
  }

  const leftDueAt = left.dueAt ?? "9999-12-31T00:00:00.000Z";
  const rightDueAt = right.dueAt ?? "9999-12-31T00:00:00.000Z";
  const dueDifference = leftDueAt.localeCompare(rightDueAt);

  if (dueDifference !== 0) {
    return dueDifference;
  }

  return left.priorityRank - right.priorityRank;
}

function datesAreSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function titlesLikelyMatch(left: string, right: string) {
  const leftTitle = normalizeComparableTitle(left);
  const rightTitle = normalizeComparableTitle(right);

  if (!leftTitle || !rightTitle) {
    return false;
  }

  return (
    leftTitle === rightTitle ||
    leftTitle.includes(rightTitle) ||
    rightTitle.includes(leftTitle)
  );
}

function createEmptySideEffects(): AssistantSideEffects {
  return {
    goals: [],
    scheduleProposals: [],
    scheduleReflections: [],
    schedulingSuggestions: [],
    tasks: [],
    metrics: [],
    workLogs: [],
    metricEntries: [],
  };
}

function appendWarnings(message: string, warnings: string[]) {
  if (warnings.length === 0) {
    return message;
  }

  return `${message}\n\n${warnings.join(" ")}`;
}

function appendReflectionSaveSummary(message: string, suggestionCount: number) {
  const suggestionSummary =
    suggestionCount === 0
      ? "I saved that schedule reflection. I did not create any new strategy suggestions from it yet."
      : `I saved that schedule reflection and created ${suggestionCount} strategy suggestion${suggestionCount === 1 ? "" : "s"} for you to review.`;

  return `${message}\n\n${suggestionSummary}`;
}

function buildGoalFocusAreasFromPlan(plan: GeneratedPlan): GoalFocusArea[] {
  const seenTitles = new Set<string>();
  const focusTitles = [
    ...plan.fourteenDayPerformanceGoals.map((title) => ({
      title,
      description: "Near-term focus from the initial goal plan.",
    })),
    ...plan.thirtyDayPerformanceGoals.map((title) => ({
      title,
      description: "30-day focus from the initial goal plan.",
    })),
  ];

  return focusTitles.flatMap((focus) => {
    const normalizedTitle = focus.title.trim();
    const key = normalizedTitle.toLowerCase();

    if (!normalizedTitle || seenTitles.has(key)) {
      return [];
    }

    seenTitles.add(key);

    return [
      {
        id: createStableFocusId(normalizedTitle),
        title: normalizedTitle,
        description: focus.description,
        status: "active",
        ...inferGoalFocusSchedulingDefaults(
          `${normalizedTitle} ${focus.description}`,
        ),
      },
    ];
  });
}

function buildScheduleGuidanceFromPlan(plan: GeneratedPlan): Record<string, unknown> {
  return {
    timeAvailability: plan.timeAvailability,
    timeProtectionPlan: plan.timeProtectionPlan,
    limitingHabits: plan.limitingHabits,
    scriptedActions: plan.scriptedActions,
    environmentalOptimizations: plan.environmentalOptimizations,
  };
}

function resolveReflectionDateRange(
  timeframeStart: string | null,
  timeframeEnd: string | null,
) {
  const parsedEnd = parseOptionalIsoDate(timeframeEnd) ?? new Date();
  const parsedStart = parseOptionalIsoDate(timeframeStart) ?? addDaysDate(parsedEnd, -7);

  if (parsedStart > parsedEnd) {
    return {
      timeframeStart: addDaysDate(parsedEnd, -7),
      timeframeEnd: parsedEnd,
    };
  }

  return {
    timeframeStart: parsedStart,
    timeframeEnd: parsedEnd,
  };
}

function formatConflictList(conflicts: SchedulingConflict[]) {
  return conflicts
    .map((conflict) => `${conflict.title} (${conflict.detail})`)
    .join("; ");
}

function userMessageSpecifiesExactSlot(message: string) {
  const hasTime = /\b\d{1,2}(:\d{2})?\s?(am|pm)\b/i.test(message);
  const hasDayReference =
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(message) ||
    /\b\d{4}-\d{2}-\d{2}\b/u.test(message) ||
    /\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/u.test(message) ||
    /\b(today|tomorrow)\b/i.test(message);

  return hasTime && hasDayReference;
}

function isGoalStatus(value: string | null): value is GoalRecord["status"] {
  return (
    value === "active" ||
    value === "paused" ||
    value === "completed" ||
    value === "archived"
  );
}

function isTaskStatus(value: string | null): value is TaskRecord["status"] {
  return (
    value === "inbox" ||
    value === "planned" ||
    value === "scheduled" ||
    value === "done" ||
    value === "canceled"
  );
}

function isScheduleIntent(
  value: string | null,
): value is TaskRecord["scheduleIntent"] {
  return (
    value === "unscheduled" ||
    value === "schedule_now" ||
    value === "someday"
  );
}

function parseOptionalIsoDate(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseRequiredIsoDate(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toIntegerOrUndefined(value: number | null) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : undefined;
}

function toIntegerOrNull(value: number | null) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : null;
}

function toIntegerOrNullUndefined(value: number | null) {
  return value === null ? null : toIntegerOrUndefined(value);
}

function addDaysDate(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function startOfDayDate(date: Date) {
  const nextDate = new Date(date);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function findTaskByTitle(
  tasksById: Map<string, TaskRecord>,
  title: string,
) {
  const normalizedTitle = title.trim().toLowerCase();

  for (const task of tasksById.values()) {
    if (task.title.trim().toLowerCase() === normalizedTitle) {
      return task;
    }
  }

  return null;
}

function resolveGoalFocusArea(
  goal: GoalRecord,
  focusId: string | null,
  title: string | null,
) {
  if (focusId) {
    const focusArea = goal.focusAreas.find((focus) => focus.id === focusId);

    if (focusArea) {
      return focusArea;
    }
  }

  const normalizedTitle = title?.trim().toLowerCase();

  if (!normalizedTitle) {
    return null;
  }

  return (
    goal.focusAreas.find(
      (focus) => focus.title.trim().toLowerCase() === normalizedTitle,
    ) ?? null
  );
}

function encodeCalendarReference(input: {
  calendarId: string;
  eventId: string;
}) {
  return `${input.calendarId}::${input.eventId}`;
}

function parseCalendarReference(value: string | null) {
  if (!value) {
    return null;
  }

  const separatorIndex = value.indexOf("::");

  if (separatorIndex === -1) {
    return null;
  }

  const calendarId = value.slice(0, separatorIndex);
  const eventId = value.slice(separatorIndex + 2);

  if (!calendarId || !eventId) {
    return null;
  }

  return { calendarId, eventId };
}
