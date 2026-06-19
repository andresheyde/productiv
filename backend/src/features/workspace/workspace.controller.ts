import type { Request, Response } from "express";

import { resolveAuthenticatedRequest } from "../auth/auth-session.ts";
import {
  addMetricProgressEntry,
  listGoalMetrics,
  listGoals,
  listTasks,
  listWorkLogs,
  patchGoal,
  patchGoalMetric,
  patchTask,
} from "./workspace.repository.ts";
import type {
  GoalRecord,
  GoalStatus,
  ScheduleIntent,
  TaskStatus,
} from "./workspace.types.ts";

type GoalParams = {
  goalId?: string;
};

type TaskParams = {
  taskId?: string;
};

type MetricParams = {
  metricId?: string;
};

type PatchGoalBody = {
  title?: string;
  definition?: string;
  notes?: string | null;
  priorityRank?: number;
  status?: GoalStatus;
};

type PatchTaskBody = {
  goalId?: string | null;
  title?: string;
  description?: string;
  priorityRank?: number;
  status?: TaskStatus;
  estimatedMinutes?: number | null;
  dueAt?: string | null;
  scheduleIntent?: ScheduleIntent;
};

type PatchMetricBody = {
  name?: string;
  unitLabel?: string;
  targetValue?: number;
  currentValue?: number;
  isActive?: boolean;
};

type AddMetricEntryBody = {
  deltaValue?: number;
  note?: string | null;
};

export async function getGoals(req: Request, res: Response) {
  try {
    const session = await resolveAuthenticatedRequest(req);

    if (!session) {
      return res.status(401).json({ error: "Authentication required" });
    }

    return res.json({ goals: await listGoals(session.user.id) });
  } catch (error) {
    return handleWorkspaceError(res, "load goals", error);
  }
}

export async function updateGoal(
  req: Request<GoalParams, {}, PatchGoalBody>,
  res: Response,
) {
  try {
    const session = await resolveAuthenticatedRequest(req);

    if (!session) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (typeof req.params.goalId !== "string" || req.params.goalId.length === 0) {
      return res.status(400).json({ error: "Missing goalId" });
    }

    const goal = await patchGoal({
      userId: session.user.id,
      goalId: req.params.goalId,
      title: getOptionalTrimmedString(req.body.title),
      definition: getOptionalTrimmedString(req.body.definition),
      notes: getOptionalNullableTrimmedString(req.body.notes),
      priorityRank: getOptionalNumber(req.body.priorityRank),
      status: getOptionalGoalStatus(req.body.status),
    });

    if (!goal) {
      return res.status(404).json({ error: "Goal not found" });
    }

    return res.json(goal);
  } catch (error) {
    return handleWorkspaceError(res, "update goal", error);
  }
}

export async function getTasks(req: Request, res: Response) {
  try {
    const session = await resolveAuthenticatedRequest(req);

    if (!session) {
      return res.status(401).json({ error: "Authentication required" });
    }

    return res.json({ tasks: await listTasks(session.user.id) });
  } catch (error) {
    return handleWorkspaceError(res, "load tasks", error);
  }
}

export async function updateTask(
  req: Request<TaskParams, {}, PatchTaskBody>,
  res: Response,
) {
  try {
    const session = await resolveAuthenticatedRequest(req);

    if (!session) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (typeof req.params.taskId !== "string" || req.params.taskId.length === 0) {
      return res.status(400).json({ error: "Missing taskId" });
    }

    const task = await patchTask({
      userId: session.user.id,
      taskId: req.params.taskId,
      goalId: getOptionalNullableTrimmedString(req.body.goalId),
      title: getOptionalTrimmedString(req.body.title),
      description: getOptionalTrimmedString(req.body.description),
      priorityRank: getOptionalNumber(req.body.priorityRank),
      status: getOptionalTaskStatus(req.body.status),
      estimatedMinutes: getOptionalNullableNumber(req.body.estimatedMinutes),
      dueAt: parseOptionalDate(req.body.dueAt),
      scheduleIntent: getOptionalScheduleIntent(req.body.scheduleIntent),
    });

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    return res.json(task);
  } catch (error) {
    return handleWorkspaceError(res, "update task", error);
  }
}

export async function getMetrics(req: Request, res: Response) {
  try {
    const session = await resolveAuthenticatedRequest(req);

    if (!session) {
      return res.status(401).json({ error: "Authentication required" });
    }

    return res.json({ metrics: await listGoalMetrics(session.user.id) });
  } catch (error) {
    return handleWorkspaceError(res, "load metrics", error);
  }
}

export async function updateMetric(
  req: Request<MetricParams, {}, PatchMetricBody>,
  res: Response,
) {
  try {
    const session = await resolveAuthenticatedRequest(req);

    if (!session) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (typeof req.params.metricId !== "string" || req.params.metricId.length === 0) {
      return res.status(400).json({ error: "Missing metricId" });
    }

    const metric = await patchGoalMetric({
      userId: session.user.id,
      metricId: req.params.metricId,
      name: getOptionalTrimmedString(req.body.name),
      unitLabel: getOptionalTrimmedString(req.body.unitLabel),
      targetValue: getOptionalPositiveNumber(req.body.targetValue),
      currentValue: getOptionalNumber(req.body.currentValue),
      isActive: typeof req.body.isActive === "boolean" ? req.body.isActive : undefined,
    });

    if (!metric) {
      return res.status(404).json({ error: "Metric not found" });
    }

    return res.json(metric);
  } catch (error) {
    return handleWorkspaceError(res, "update metric", error);
  }
}

export async function addMetricEntry(
  req: Request<MetricParams, {}, AddMetricEntryBody>,
  res: Response,
) {
  try {
    const session = await resolveAuthenticatedRequest(req);

    if (!session) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (typeof req.params.metricId !== "string" || req.params.metricId.length === 0) {
      return res.status(400).json({ error: "Missing metricId" });
    }

    if (typeof req.body.deltaValue !== "number" || !Number.isFinite(req.body.deltaValue)) {
      return res.status(400).json({ error: "deltaValue must be a number" });
    }

    const result = await addMetricProgressEntry({
      userId: session.user.id,
      metricId: req.params.metricId,
      deltaValue: req.body.deltaValue,
      source: "manual",
      note: getOptionalNullableTrimmedString(req.body.note),
    });

    if (!result) {
      return res.status(404).json({ error: "Metric not found" });
    }

    return res.status(201).json(result);
  } catch (error) {
    return handleWorkspaceError(res, "add metric entry", error);
  }
}

export async function getWorkLogs(req: Request, res: Response) {
  try {
    const session = await resolveAuthenticatedRequest(req);

    if (!session) {
      return res.status(401).json({ error: "Authentication required" });
    }

    return res.json({ workLogs: await listWorkLogs(session.user.id) });
  } catch (error) {
    return handleWorkspaceError(res, "load work logs", error);
  }
}

function handleWorkspaceError(res: Response, action: string, error: unknown) {
  console.error(`[Workspace] Failed to ${action}`, error);
  return res.status(500).json({
    error:
      error instanceof Error
        ? error.message
        : `Failed to ${action}.`,
  });
}

function getOptionalTrimmedString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getOptionalNullableTrimmedString(value: unknown) {
  if (value === null) {
    return null;
  }

  return getOptionalTrimmedString(value);
}

function getOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getOptionalNullableNumber(value: unknown) {
  if (value === null) {
    return null;
  }

  return getOptionalNumber(value);
}

function getOptionalPositiveNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return value;
}

function getOptionalGoalStatus(value: unknown): GoalRecord["status"] | undefined {
  return value === "active" ||
    value === "paused" ||
    value === "completed" ||
    value === "archived"
    ? value
    : undefined;
}

function getOptionalTaskStatus(value: unknown): TaskStatus | undefined {
  return value === "inbox" ||
    value === "planned" ||
    value === "scheduled" ||
    value === "done" ||
    value === "canceled"
    ? value
    : undefined;
}

function getOptionalScheduleIntent(value: unknown): ScheduleIntent | undefined {
  return value === "unscheduled" ||
    value === "schedule_now" ||
    value === "someday"
    ? value
    : undefined;
}

function parseOptionalDate(value: unknown) {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
