import type { Request, Response } from "express";

import { resolveAuthenticatedRequest } from "../auth/auth-session.ts";
import {
  addMetricProgressEntry,
  ensureGoalMetricsForUser,
  listGoalMetrics,
  listGoals,
  listTasks,
  listWorkLogs,
  patchGoal,
  patchGoalMetric,
  patchTask,
} from "./workspace.repository.ts";
import type {
  GoalFocusArea,
  GoalRecord,
  GoalStatus,
  ScheduleIntent,
  TaskRecurrence,
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
  successCriteria?: unknown;
  focusAreas?: unknown;
  scheduleGuidance?: unknown;
  constraints?: unknown;
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
  recurrence?: unknown;
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
      successCriteria: getOptionalStringArray(req.body.successCriteria),
      focusAreas: getOptionalGoalFocusAreas(req.body.focusAreas),
      scheduleGuidance: getOptionalRecord(req.body.scheduleGuidance),
      constraints: getOptionalStringArray(req.body.constraints),
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
      recurrence: getOptionalTaskRecurrence(req.body.recurrence),
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

    await ensureGoalMetricsForUser(session.user.id);
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

function getOptionalStringArray(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function getOptionalRecord(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function getOptionalGoalFocusAreas(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.flatMap((item): GoalFocusArea[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const record = item as Record<string, unknown>;
    const title = getOptionalTrimmedString(record.title);

    if (!title) {
      return [];
    }

    const id = getOptionalTrimmedString(record.id) ?? createStableFocusId(title);
    const status =
      record.status === "paused" || record.status === "completed"
        ? record.status
        : "active";
    const defaultDurationMinutes =
      typeof record.defaultDurationMinutes === "number" &&
      Number.isFinite(record.defaultDurationMinutes) &&
      record.defaultDurationMinutes > 0
        ? Math.round(record.defaultDurationMinutes)
        : null;

    return [
      {
        id,
        title,
        description: getOptionalTrimmedString(record.description) ?? "",
        status,
        defaultDurationMinutes,
        cadence: getOptionalTrimmedString(record.cadence) ?? null,
      },
    ];
  });
}

function getOptionalTaskRecurrence(value: unknown): TaskRecurrence | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
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
    return undefined;
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
  const endsAt =
    typeof record.endsAt === "string" && !Number.isNaN(Date.parse(record.endsAt))
      ? new Date(record.endsAt).toISOString()
      : null;

  return {
    frequency,
    interval,
    daysOfWeek,
    endsAt,
    sourceText: getOptionalTrimmedString(record.sourceText) ?? null,
    scheduledOccurrences: getTaskScheduledOccurrences(record.scheduledOccurrences),
  };
}

function getTaskScheduledOccurrences(
  value: unknown,
): TaskRecurrence["scheduledOccurrences"] {
  if (!Array.isArray(value)) {
    return [];
  }

  const occurrences = value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const record = item as Record<string, unknown>;
    const startTime = normalizeIsoString(record.startTime);
    const endTime = normalizeIsoString(record.endTime);
    const dateKey =
      getOptionalDateKey(record.dateKey) ??
      (startTime ? dateKeyFromIsoString(startTime) : null);

    if (!dateKey || !startTime || !endTime) {
      return [];
    }

    return [
      {
        dateKey,
        startTime,
        endTime,
        calendarEventId: getOptionalTrimmedString(record.calendarEventId) ?? null,
        sourceProposalId: getOptionalTrimmedString(record.sourceProposalId) ?? null,
      },
    ];
  });
  const seen = new Set<string>();

  return occurrences.filter((occurrence) => {
    const key = `${occurrence.dateKey}:${occurrence.calendarEventId ?? occurrence.startTime}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function getOptionalDateKey(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return null;
  }

  return value;
}

function normalizeIsoString(value: unknown) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    return null;
  }

  return new Date(value).toISOString();
}

function dateKeyFromIsoString(value: string) {
  const date = new Date(value);

  return [
    date.getFullYear(),
    (date.getMonth() + 1).toString().padStart(2, "0"),
    date.getDate().toString().padStart(2, "0"),
  ].join("-");
}

function createStableFocusId(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
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
