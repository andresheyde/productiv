import type { Credentials } from "google-auth-library";

import { getStructuredAiProvider } from "../../shared/ai/provider-factory.ts";
import { getRuntimePool } from "../../shared/db/postgres.ts";
import {
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
} from "../calendar/calendar.service.ts";
import type { AuthenticatedUser } from "../auth/auth.types.ts";
import { runPlanningTurn } from "../planning/planning.service.ts";
import type {
  GeneratedPlan,
  PlanningChatMessage,
} from "../planning/planning.types.ts";
import {
  buildCompiledSchedulingContext,
  createDerivedSchedulingSuggestionsFromReflection,
  createScheduleReflection,
  detectSchedulingConflicts,
  getOrCreateUserSchedulingContext,
} from "../scheduling-context/scheduling-context.repository.ts";
import type {
  CompiledSchedulingContext,
  SchedulingConflict,
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
  listDraftScheduleProposals,
  type ScheduleProposalOperation,
  type ScheduleProposalRecord,
  updateScheduleProposalStatus,
} from "./schedule-proposals.repository.ts";
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
  createGoal,
  createGoalMetric,
  createTask,
  createWorkLog,
  getGoalMetricById,
  getOrCreateDefaultAssistantThread,
  getWorkspaceExecutor,
  listAssistantMessages,
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
  TaskRecord,
} from "../workspace/workspace.types.ts";

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

export async function getAssistantThreadForUser(
  userId: string,
): Promise<AssistantThreadResponse> {
  const thread = await getOrCreateDefaultAssistantThread(userId);
  const messages = await listAssistantMessages(thread.id);

  return {
    thread,
    messages,
  };
}

export async function runAssistantTurn(input: {
  user: AuthenticatedUser;
  tokens: Credentials;
  message: string;
  mode?: AssistantTurnMode;
}): Promise<AssistantTurnResponse> {
  const thread = await getOrCreateDefaultAssistantThread(input.user.id);
  const trimmedMessage = input.message.trim();

  if (!trimmedMessage) {
    throw new Error("message must not be empty");
  }

  await appendAssistantMessage({
    threadId: thread.id,
    role: "user",
    intent:
      input.mode === "work_log" || input.mode === "schedule_reflection"
        ? input.mode
        : "chat",
    content: trimmedMessage,
  });

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

  const inferredMode = inferTurnMode(trimmedMessage, input.mode, metrics.length > 0);

  if (shouldUsePlanningFlow(thread.latestArtifact, goals.length, inferredMode)) {
    return handlePlanningTurn({
      threadId: thread.id,
      userId: input.user.id,
      messages,
      artifact: thread.latestArtifact as PlanningArtifact,
      schedulingContext: compiledSchedulingContext,
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
  });
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
        ...(await getAssistantThreadForUser(input.userId)),
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
      ...(await getAssistantThreadForUser(input.userId)),
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
        ...(await getAssistantThreadForUser(input.userId)),
        assistantMessage,
        navigationHint: "goals",
        sideEffects,
      };
    }

    await appendAssistantMessage(
      {
        threadId: input.threadId,
        role: "assistant",
        intent: "planning_follow_up",
        content: result.assistantMessage,
        structuredPayload: {
          draftPlanningState: result.draftPlanningState,
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
      ...(await getAssistantThreadForUser(input.userId)),
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
}): Promise<AssistantTurnResponse> {
  const aiProvider = getStructuredAiProvider();
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
        pendingScheduleProposals: input.pendingScheduleProposals,
      }),
      schemaName: "assistant_turn",
      schema: ASSISTANT_TURN_SCHEMA,
    }),
  );

  const sideEffects = createEmptySideEffects();
  const warnings: string[] = [];
  const client = await getRuntimePool().connect();
  const goalsById = new Map(input.goals.map((goal) => [goal.id, goal]));
  const tasksById = new Map(input.tasks.map((task) => [task.id, task]));
  const metricsById = new Map(input.metrics.map((metric) => [metric.id, metric]));
  const pendingProposalsById = new Map(
    input.pendingScheduleProposals.map((proposal) => [proposal.id, proposal]),
  );

  try {
    await client.query("begin");

    for (const action of modelResponse.actions) {
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
          actions: modelResponse.actions,
          scheduleProposals: sideEffects.scheduleProposals,
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
      ...(await getAssistantThreadForUser(input.userId)),
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

    await appendAssistantMessage(
      {
        threadId: input.threadId,
        role: "assistant",
        intent: "work_log",
        content: modelResponse.assistantMessage,
        structuredPayload: {
          workLogId: workLog.id,
          progressUpdates: modelResponse.progressUpdates,
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
      ...(await getAssistantThreadForUser(input.userId)),
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
    goalsById: Map<string, GoalRecord>;
    tasksById: Map<string, TaskRecord>;
    metricsById: Map<string, GoalMetricRecord>;
    threadId: string;
    currentMessage: string;
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

      const goal = await createGoal(
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
          status: isGoalStatus(input.action.status) ? input.action.status : "active",
        },
        db,
      );
      input.goalsById.set(goal.id, goal);
      input.sideEffects.goals.push(goal);
      return;
    }
    case "update_goal": {
      if (!input.action.goalId) {
        return;
      }

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
              ? input.action.focusAreas
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
      }
      return;
    }
    case "create_task": {
      if (!input.action.title) {
        return;
      }

      const task = await createTask(
        {
          userId: input.userId,
          goalId: input.action.goalId,
          title: input.action.title,
          description: input.action.description ?? "",
          priorityRank: toIntegerOrUndefined(input.action.priorityRank),
          status: isTaskStatus(input.action.status)
            ? input.action.status
            : "inbox",
          estimatedMinutes: toIntegerOrNull(input.action.estimatedMinutes),
          dueAt: parseOptionalIsoDate(input.action.dueAt),
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
      if (!input.action.taskId) {
        return;
      }

      const task = await patchTask(
        {
          userId: input.userId,
          taskId: input.action.taskId,
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
          scheduleIntent: isScheduleIntent(input.action.scheduleIntent)
            ? input.action.scheduleIntent
            : undefined,
        },
        db,
      );

      if (task) {
        input.tasksById.set(task.id, task);
        input.sideEffects.tasks.push(task);
      }
      return;
    }
    case "create_metric": {
      if (
        !input.action.goalId ||
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
          goalId: input.action.goalId,
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
        await createProposalFromSchedulingAction(input, db, {
          reason:
            "I saved that as a proposal instead of placing it directly because you did not explicitly choose the exact slot yet.",
        });
        return;
      }

      await applyDirectScheduleAction(input, db);
      return;
    }
    case "propose_schedule_task": {
      await createProposalFromSchedulingAction(input, db);
      return;
    }
    case "schedule_goal_focus": {
      if (!userMessageSpecifiesExactSlot(input.currentMessage)) {
        await createProposalFromSchedulingAction(input, db, {
          reason:
            "I saved that as a proposal instead of placing it directly because you did not explicitly choose the exact slot yet.",
        });
        return;
      }

      await applyDirectScheduleAction(input, db);
      return;
    }
    case "propose_schedule_goal_focus": {
      await createProposalFromSchedulingAction(input, db);
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

async function createProposalFromSchedulingAction(
  input: {
    userId: string;
    action: AssistantAction;
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
  const scheduleDetails = await resolveScheduleActionDetails(input, db);

  if (!scheduleDetails) {
    input.warnings.push("I couldn't save that scheduling proposal because the work item or time window was incomplete.");
    return;
  }

  const conflicts = detectSchedulingConflicts(
    input.userSchedulingContext,
    scheduleDetails.startTime,
    scheduleDetails.endTime,
  );
  const proposal = await createScheduleProposal(
    {
      userId: input.userId,
      threadId: input.threadId,
      title: `Schedule ${scheduleDetails.title}`,
      intent: "assistant_schedule_proposal",
      summary: buildScheduleProposalSummary(scheduleDetails, conflicts),
      operations: [scheduleDetails.operation],
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

async function applyDirectScheduleAction(
  input: {
    userId: string;
    tokens: Credentials;
    action: AssistantAction;
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
    goalsById: Map<string, GoalRecord>;
    tasksById: Map<string, TaskRecord>;
    pendingProposalsById: Map<string, ScheduleProposalRecord>;
    userSchedulingContext: UserSchedulingContextRecord;
    sideEffects: AssistantSideEffects;
    warnings: string[];
  },
  db: ReturnType<typeof getWorkspaceExecutor>,
) {
  const proposal = resolvePendingProposal(input.action.proposalId, input.pendingProposalsById);

  if (!proposal) {
    input.warnings.push("I couldn't find a pending schedule proposal to confirm.");
    return;
  }

  const operation = proposal.operations[0];

  if (!operation) {
    input.warnings.push("That proposal was missing its scheduling details, so I left the calendar unchanged.");
    return;
  }

  const scheduleDetails = resolveScheduleDetailsFromProposalOperation(
    operation,
    input.goalsById,
    input.tasksById,
  );

  if (!scheduleDetails) {
    input.warnings.push("I couldn't find the work item tied to that proposal, so I left the calendar unchanged.");
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
    input.warnings.push("I couldn't apply that proposal to the calendar, so it is still waiting for confirmation.");
    return;
  }

  if (applied.type === "task") {
    input.tasksById.set(applied.task.id, applied.task);
    input.sideEffects.tasks.push(applied.task);
  }

  await updateScheduleProposalStatus(
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
    warnings: string[];
  },
  db: ReturnType<typeof getWorkspaceExecutor>,
) {
  const proposal = resolvePendingProposal(input.action.proposalId, input.pendingProposalsById);

  if (!proposal) {
    input.warnings.push("I couldn't find a pending schedule proposal to dismiss.");
    return;
  }

  await updateScheduleProposalStatus(
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

  const title = input.action.title ?? task.title;
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

function resolveGoalFocusForSchedulingAction(input: {
  action: AssistantAction;
  goalsById: Map<string, GoalRecord>;
  startTime: Date;
  endTime: Date;
}): ScheduleGoalFocusActionDetails | null {
  const goal = input.action.goalId
    ? input.goalsById.get(input.action.goalId) ?? null
    : null;

  if (!goal) {
    return null;
  }

  const focusArea = resolveGoalFocusArea(goal, input.action.focusId, input.action.title);
  const title = input.action.title ?? focusArea?.title ?? goal.title;
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

async function applyScheduleDetailsToCalendar(
  userId: string,
  tokens: Credentials,
  details: ScheduleActionDetails,
  db: ReturnType<typeof getWorkspaceExecutor>,
) {
  if (details.kind === "goal_focus") {
    const applied = await applyGoalFocusOperationToCalendar(tokens, details.operation);
    return applied ? { type: "goal_focus" as const } : null;
  }

  const task = await applyTaskScheduleOperationToCalendar(
    userId,
    tokens,
    details.task,
    details.operation,
    db,
  );

  return task ? { type: "task" as const, task } : null;
}

async function applyTaskScheduleOperationToCalendar(
  userId: string,
  tokens: Credentials,
  task: TaskRecord,
  operation: Extract<ScheduleProposalOperation, { type: "schedule_task" }>,
  db: ReturnType<typeof getWorkspaceExecutor>,
) {
  const startTime = parseRequiredIsoDate(operation.startTime);
  const endTime = parseRequiredIsoDate(operation.endTime);

  if (!startTime || !endTime || endTime <= startTime) {
    return null;
  }

  const calendarReference = parseCalendarReference(task.linkedCalendarEventId);
  let linkedCalendarEventId: string | null = task.linkedCalendarEventId;

  if (calendarReference) {
    const updatedEvent = await updateGoogleCalendarEvent(tokens, {
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
  } else {
    const createdEvent = await createGoogleCalendarEvent(tokens, {
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
  }

  return patchTask(
    {
      userId,
      taskId: task.id,
      title: operation.title,
      description: operation.description,
      status: "scheduled",
      dueAt: startTime,
      linkedCalendarEventId,
      scheduleIntent: "schedule_now",
    },
    db,
  );
}

async function applyGoalFocusOperationToCalendar(
  tokens: Credentials,
  operation: Extract<ScheduleProposalOperation, { type: "schedule_goal_focus" }>,
) {
  const startTime = parseRequiredIsoDate(operation.startTime);
  const endTime = parseRequiredIsoDate(operation.endTime);

  if (!startTime || !endTime || endTime <= startTime) {
    return null;
  }

  return createGoogleCalendarEvent(tokens, {
    title: operation.title,
    description: operation.description,
    startTime,
    endTime,
  });
}

function buildScheduleProposalSummary(
  details: {
    title: string;
    startTime: Date;
    endTime: Date;
  },
  conflicts: SchedulingConflict[],
) {
  const scheduleLine = `${details.title} on ${details.startTime.toLocaleString()} to ${details.endTime.toLocaleTimeString()}`;

  if (conflicts.length === 0) {
    return scheduleLine;
  }

  return `${scheduleLine}. Conflicts: ${formatConflictList(conflicts)}.`;
}

function buildProposalConfirmationHint(
  details: {
    title: string;
    startTime: Date;
    endTime: Date;
  },
  conflicts: SchedulingConflict[],
) {
  const base = `Proposed ${details.title} for ${details.startTime.toLocaleString()} to ${details.endTime.toLocaleTimeString()}.`;

  if (conflicts.length === 0) {
    return `${base} Reply to confirm it or ask for a different time.`;
  }

  return `${base} It conflicts with ${formatConflictList(conflicts)}. Reply to confirm anyway or ask for a different time.`;
}

function resolvePendingProposal(
  proposalId: string | null,
  pendingProposalsById: Map<string, ScheduleProposalRecord>,
) {
  if (proposalId) {
    return pendingProposalsById.get(proposalId) ?? null;
  }

  const iterator = pendingProposalsById.values().next();
  return iterator.done ? null : iterator.value;
}

function shouldUsePlanningFlow(
  artifact: Record<string, unknown>,
  goalCount: number,
  mode: AssistantTurnMode,
) {
  return goalCount === 0 && mode === "chat" && !artifact.planningGoalId;
}

function inferTurnMode(
  message: string,
  requestedMode: AssistantTurnMode | undefined,
  hasMetrics: boolean,
): AssistantTurnMode {
  if (requestedMode) {
    return requestedMode;
  }

  if (
    /\b(reflect|reflection|review|retro|retrospective)\b/i.test(message) &&
    /\b(schedule|calendar|plan|planned|week|day)\b/i.test(message)
  ) {
    return "schedule_reflection";
  }

  if (
    hasMetrics &&
    /(worked|studied|finished|completed|practiced|logged|spent)\b/i.test(message) &&
    /\b\d+(\.\d+)?\b/.test(message)
  ) {
    return "work_log";
  }

  return "chat";
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
        defaultDurationMinutes: null,
        cadence: null,
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

function createStableFocusId(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
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
