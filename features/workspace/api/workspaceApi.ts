import { apiRequest } from "@/features/shared/api/request";
import type {
  Goal,
  GoalFocusArea,
  GoalMetric,
  MetricProgressEntry,
  ScheduleIntent,
  Task,
  TaskRecurrence,
  TaskStatus,
  WorkLog,
} from "@/features/workspace/types";

export async function fetchGoals(sessionToken?: string | null) {
  const response = await apiRequest("/goals", { sessionToken });
  return ((await response.json()) as { goals: Goal[] }).goals;
}

export async function updateGoal(
  input: {
    goalId: string;
    title?: string;
    definition?: string;
    successCriteria?: string[];
    focusAreas?: GoalFocusArea[];
    scheduleGuidance?: Record<string, unknown>;
    constraints?: string[];
    notes?: string | null;
    priorityRank?: number;
    status?: Goal["status"];
    sessionToken?: string | null;
  },
) {
  const response = await apiRequest(`/goals/${input.goalId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    sessionToken: input.sessionToken,
    body: JSON.stringify({
      title: input.title,
      definition: input.definition,
      successCriteria: input.successCriteria,
      focusAreas: input.focusAreas,
      scheduleGuidance: input.scheduleGuidance,
      constraints: input.constraints,
      notes: input.notes,
      priorityRank: input.priorityRank,
      status: input.status,
    }),
  });

  return (await response.json()) as Goal;
}

export async function fetchTasks(sessionToken?: string | null) {
  const response = await apiRequest("/tasks", { sessionToken });
  return ((await response.json()) as { tasks: Task[] }).tasks;
}

export async function updateTask(
  input: {
    taskId: string;
    goalId?: string | null;
    title?: string;
    description?: string;
    priorityRank?: number;
    status?: TaskStatus;
    estimatedMinutes?: number | null;
    dueAt?: string | null;
    recurrence?: TaskRecurrence | null;
    scheduleIntent?: ScheduleIntent;
    sessionToken?: string | null;
  },
) {
  const response = await apiRequest(`/tasks/${input.taskId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    sessionToken: input.sessionToken,
    body: JSON.stringify({
      goalId: input.goalId,
      title: input.title,
      description: input.description,
      priorityRank: input.priorityRank,
      status: input.status,
      estimatedMinutes: input.estimatedMinutes,
      dueAt: input.dueAt,
      recurrence: input.recurrence,
      scheduleIntent: input.scheduleIntent,
    }),
  });

  return (await response.json()) as Task;
}

export async function fetchMetrics(sessionToken?: string | null) {
  const response = await apiRequest("/metrics", { sessionToken });
  return ((await response.json()) as { metrics: GoalMetric[] }).metrics;
}

export async function updateMetric(
  input: {
    metricId: string;
    name?: string;
    unitLabel?: string;
    targetValue?: number;
    currentValue?: number;
    isActive?: boolean;
    sessionToken?: string | null;
  },
) {
  const response = await apiRequest(`/metrics/${input.metricId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    sessionToken: input.sessionToken,
    body: JSON.stringify({
      name: input.name,
      unitLabel: input.unitLabel,
      targetValue: input.targetValue,
      currentValue: input.currentValue,
      isActive: input.isActive,
    }),
  });

  return (await response.json()) as GoalMetric;
}

export async function addMetricEntry(
  input: {
    metricId: string;
    deltaValue: number;
    note?: string | null;
    sessionToken?: string | null;
  },
) {
  const response = await apiRequest(`/metrics/${input.metricId}/entries`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    sessionToken: input.sessionToken,
    body: JSON.stringify({
      deltaValue: input.deltaValue,
      note: input.note,
    }),
  });

  return (await response.json()) as {
    entry: MetricProgressEntry;
    metric: GoalMetric;
  };
}

export async function fetchWorkLogs(sessionToken?: string | null) {
  const response = await apiRequest("/work-logs", { sessionToken });
  return ((await response.json()) as { workLogs: WorkLog[] }).workLogs;
}
