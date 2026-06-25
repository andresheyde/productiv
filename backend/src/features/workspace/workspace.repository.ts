import type { QueryResult, QueryResultRow } from "pg";

import { getRuntimePool } from "../../shared/db/postgres.ts";
import type {
  AssistantMessageRecord,
  AssistantThreadRecord,
  GoalFocusArea,
  GoalMetricRecord,
  GoalRecord,
  MetricProgressEntryRecord,
  MetricProgressSource,
  ScheduleIntent,
  TaskRecurrence,
  TaskRecord,
  TaskStatus,
  WorkLogRecord,
} from "./workspace.types.ts";
import {
  deriveGoalMetricSpecs,
  normalizeMetricSpecKey,
} from "./goal-metric-defaults.ts";

type DatabaseExecutor = {
  query: <T extends QueryResultRow>(
    text: string,
    params?: unknown[],
  ) => Promise<QueryResult<T>>;
};

type GoalRow = {
  id: string;
  title: string;
  definition: string;
  success_criteria: unknown;
  habit_focus: unknown;
  schedule_guidance: unknown;
  constraints: unknown;
  notes: string | null;
  priority_rank: number;
  status: GoalRecord["status"];
  created_at: Date;
  updated_at: Date;
};

type TaskRow = {
  id: string;
  goal_id: string | null;
  title: string;
  description: string;
  priority_rank: number;
  status: TaskStatus;
  estimated_minutes: number | null;
  due_at: Date | null;
  recurrence: unknown;
  linked_calendar_event_id: string | null;
  schedule_intent: ScheduleIntent;
  created_at: Date;
  updated_at: Date;
};

type GoalMetricRow = {
  id: string;
  goal_id: string;
  name: string;
  unit_label: string;
  target_value: number;
  current_value: number;
  is_active: boolean;
  last_delta_value: number | null;
  last_entry_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type MetricProgressEntryRow = {
  id: string;
  metric_id: string;
  work_log_id: string | null;
  delta_value: number;
  source: MetricProgressSource;
  note: string | null;
  created_at: Date;
};

type WorkLogRow = {
  id: string;
  thread_id: string | null;
  goal_id: string | null;
  task_id: string | null;
  raw_text: string;
  summary: string;
  recorded_at: Date;
  created_at: Date;
  updated_at: Date;
};

type AssistantThreadRow = {
  id: string;
  title: string;
  current_intent: string | null;
  latest_context_summary: string;
  latest_artifact: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

type AssistantMessageRow = {
  id: string;
  role: AssistantMessageRecord["role"];
  intent: string | null;
  content: string;
  structured_payload: Record<string, unknown> | null;
  created_at: Date;
};

export function getWorkspaceExecutor(): DatabaseExecutor {
  return getRuntimePool();
}

export async function listAssistantThreads(
  userId: string,
  db: DatabaseExecutor = getWorkspaceExecutor(),
) {
  const result = await db.query<AssistantThreadRow>(
    `
      select
        id,
        title,
        current_intent,
        latest_context_summary,
        latest_artifact,
        created_at,
        updated_at
      from assistant_threads
      where user_id = $1
      order by updated_at desc, created_at desc
    `,
    [userId],
  );

  return result.rows.map(mapAssistantThread);
}

export async function getOrCreateDefaultAssistantThread(
  userId: string,
  db: DatabaseExecutor = getWorkspaceExecutor(),
) {
  const existing = await db.query<AssistantThreadRow>(
    `
      select
        id,
        title,
        current_intent,
        latest_context_summary,
        latest_artifact,
        created_at,
        updated_at
      from assistant_threads
      where user_id = $1
      order by updated_at desc
      limit 1
    `,
    [userId],
  );

  if (existing.rows[0]) {
    return mapAssistantThread(existing.rows[0]);
  }

  const created = await db.query<AssistantThreadRow>(
    `
      insert into assistant_threads (
        user_id,
        title,
        current_intent,
        latest_context_summary,
        latest_artifact
      )
      values ($1, 'Productiv Workspace', 'workspace_assistant', '', '{}'::jsonb)
      returning
        id,
        title,
        current_intent,
        latest_context_summary,
        latest_artifact,
        created_at,
        updated_at
    `,
    [userId],
  );

  return mapAssistantThread(created.rows[0]);
}

export async function createAssistantThread(
  input: {
    userId: string;
    title?: string | undefined;
  },
  db: DatabaseExecutor = getWorkspaceExecutor(),
) {
  const result = await db.query<AssistantThreadRow>(
    `
      insert into assistant_threads (
        user_id,
        title,
        current_intent,
        latest_context_summary,
        latest_artifact
      )
      values ($1, $2, 'workspace_assistant', '', '{}'::jsonb)
      returning
        id,
        title,
        current_intent,
        latest_context_summary,
        latest_artifact,
        created_at,
        updated_at
    `,
    [input.userId, input.title ?? "New chat"],
  );

  return mapAssistantThread(result.rows[0]);
}

export async function getAssistantThreadById(
  userId: string,
  threadId: string,
  db: DatabaseExecutor = getWorkspaceExecutor(),
) {
  const result = await db.query<AssistantThreadRow>(
    `
      select
        id,
        title,
        current_intent,
        latest_context_summary,
        latest_artifact,
        created_at,
        updated_at
      from assistant_threads
      where user_id = $1 and id = $2
      limit 1
    `,
    [userId, threadId],
  );

  return result.rows[0] ? mapAssistantThread(result.rows[0]) : null;
}

export async function deleteAssistantThread(
  userId: string,
  threadId: string,
  db: DatabaseExecutor = getWorkspaceExecutor(),
) {
  const result = await db.query<{ id: string }>(
    `
      delete from assistant_threads
      where user_id = $1 and id = $2
      returning id
    `,
    [userId, threadId],
  );

  return Boolean(result.rows[0]);
}

export async function listAssistantMessages(
  threadId: string,
  db: DatabaseExecutor = getWorkspaceExecutor(),
) {
  const result = await db.query<AssistantMessageRow>(
    `
      select id, role, intent, content, structured_payload, created_at
      from assistant_messages
      where thread_id = $1
      order by created_at asc
    `,
    [threadId],
  );

  return result.rows.map(mapAssistantMessage);
}

export async function appendAssistantMessage(
  input: {
    threadId: string;
    role: AssistantMessageRecord["role"];
    intent?: string | null;
    content: string;
    structuredPayload?: Record<string, unknown>;
  },
  db: DatabaseExecutor = getWorkspaceExecutor(),
) {
  const result = await db.query<AssistantMessageRow>(
    `
      insert into assistant_messages (
        thread_id,
        role,
        intent,
        content,
        structured_payload
      )
      values ($1, $2, $3, $4, $5::jsonb)
      returning id, role, intent, content, structured_payload, created_at
    `,
    [
      input.threadId,
      input.role,
      input.intent ?? null,
      input.content,
      JSON.stringify(input.structuredPayload ?? {}),
    ],
  );

  await db.query(
    `
      update assistant_threads
      set updated_at = timezone('utc', now())
      where id = $1
    `,
    [input.threadId],
  );

  return mapAssistantMessage(result.rows[0]);
}

export async function updateAssistantThreadState(
  input: {
    threadId: string;
    title?: string | undefined;
    currentIntent?: string | null | undefined;
    latestContextSummary?: string | undefined;
    latestArtifact?: Record<string, unknown> | undefined;
  },
  db: DatabaseExecutor = getWorkspaceExecutor(),
) {
  const updates: string[] = [];
  const values: unknown[] = [];

  if (input.title !== undefined) {
    values.push(input.title);
    updates.push(`title = $${values.length}`);
  }

  if (input.currentIntent !== undefined) {
    values.push(input.currentIntent);
    updates.push(`current_intent = $${values.length}`);
  }

  if (input.latestContextSummary !== undefined) {
    values.push(input.latestContextSummary);
    updates.push(`latest_context_summary = $${values.length}`);
  }

  if (input.latestArtifact !== undefined) {
    values.push(JSON.stringify(input.latestArtifact));
    updates.push(`latest_artifact = $${values.length}::jsonb`);
  }

  values.push(input.threadId);

  await db.query(
    `
      update assistant_threads
      set
        ${updates.join(", ")},
        updated_at = timezone('utc', now())
      where id = $${values.length}
    `,
    values,
  );
}

export async function listGoals(
  userId: string,
  db: DatabaseExecutor = getWorkspaceExecutor(),
) {
  const result = await db.query<GoalRow>(
    `
      select
        id,
        title,
        definition,
        success_criteria,
        habit_focus,
        schedule_guidance,
        constraints,
        notes,
        priority_rank,
        status,
        created_at,
        updated_at
      from goals
      where user_id = $1
      order by
        case status
          when 'active' then 0
          when 'paused' then 1
          when 'completed' then 2
          else 3
        end,
        priority_rank asc,
        created_at desc
    `,
    [userId],
  );

  return result.rows.map(mapGoal);
}

export async function listTasks(
  userId: string,
  db: DatabaseExecutor = getWorkspaceExecutor(),
) {
  const result = await db.query<TaskRow>(
    `
      select
        id,
        goal_id,
        title,
        description,
        priority_rank,
        status,
        estimated_minutes,
        due_at,
        recurrence,
        linked_calendar_event_id,
        schedule_intent,
        created_at,
        updated_at
      from tasks
      where user_id = $1
      order by
        case status
          when 'scheduled' then 0
          when 'planned' then 1
          when 'inbox' then 2
          when 'done' then 3
          else 4
        end,
        coalesce(due_at, timezone('utc', now()) + interval '365 days') asc,
        priority_rank asc,
        created_at desc
    `,
    [userId],
  );

  return result.rows.map(mapTask);
}

export async function listGoalMetrics(
  userId: string,
  db: DatabaseExecutor = getWorkspaceExecutor(),
) {
  const result = await db.query<GoalMetricRow>(
    `
      select
        metrics.id,
        metrics.goal_id,
        metrics.name,
        metrics.unit_label,
        metrics.target_value,
        metrics.current_value,
        metrics.is_active,
        latest.delta_value as last_delta_value,
        latest.created_at as last_entry_at,
        metrics.created_at,
        metrics.updated_at
      from goal_metrics metrics
      left join lateral (
        select delta_value, created_at
        from metric_progress_entries
        where metric_id = metrics.id
        order by created_at desc
        limit 1
      ) latest on true
      where metrics.user_id = $1
      order by metrics.is_active desc, metrics.updated_at desc
    `,
    [userId],
  );

  return result.rows.map(mapGoalMetric);
}

export async function ensureGoalMetricsForUser(
  userId: string,
  db: DatabaseExecutor = getWorkspaceExecutor(),
) {
  const goals = await listGoals(userId, db);
  const createdMetrics: GoalMetricRecord[] = [];

  for (const goal of goals) {
    if (goal.status === "archived") {
      continue;
    }

    createdMetrics.push(
      ...(await ensureGoalMetricsForGoal({ userId, goal }, db)),
    );
  }

  return createdMetrics;
}

export async function ensureGoalMetricsForGoal(
  input: {
    userId: string;
    goal: GoalRecord;
  },
  db: DatabaseExecutor = getWorkspaceExecutor(),
) {
  const existingRows = await listGoalMetricRowsForGoal(
    input.userId,
    input.goal.id,
    db,
  );
  const existingKeys = new Set(
    existingRows.map((row) =>
      normalizeMetricSpecKey({
        name: row.name,
        unitLabel: row.unit_label,
      }),
    ),
  );
  const createdMetrics: GoalMetricRecord[] = [];

  for (const spec of deriveGoalMetricSpecs(input.goal)) {
    const key = normalizeMetricSpecKey(spec);

    if (existingKeys.has(key)) {
      continue;
    }

    const metric = await createGoalMetric(
      {
        userId: input.userId,
        goalId: input.goal.id,
        name: spec.name,
        unitLabel: spec.unitLabel,
        targetValue: spec.targetValue,
      },
      db,
    );

    createdMetrics.push(metric);
    existingKeys.add(key);
  }

  return createdMetrics;
}

export async function listWorkLogs(
  userId: string,
  db: DatabaseExecutor = getWorkspaceExecutor(),
) {
  const result = await db.query<WorkLogRow>(
    `
      select
        id,
        thread_id,
        goal_id,
        task_id,
        raw_text,
        summary,
        recorded_at,
        created_at,
        updated_at
      from work_logs
      where user_id = $1
      order by recorded_at desc
      limit 50
    `,
    [userId],
  );

  return result.rows.map(mapWorkLog);
}

export async function getGoalById(
  userId: string,
  goalId: string,
  db: DatabaseExecutor = getWorkspaceExecutor(),
) {
  const result = await db.query<GoalRow>(
    `
      select
        id,
        title,
        definition,
        success_criteria,
        habit_focus,
        schedule_guidance,
        constraints,
        notes,
        priority_rank,
        status,
        created_at,
        updated_at
      from goals
      where user_id = $1 and id = $2
    `,
    [userId, goalId],
  );

  return result.rows[0] ? mapGoal(result.rows[0]) : null;
}

export async function getTaskById(
  userId: string,
  taskId: string,
  db: DatabaseExecutor = getWorkspaceExecutor(),
) {
  const result = await db.query<TaskRow>(
    `
      select
        id,
        goal_id,
        title,
        description,
        priority_rank,
        status,
        estimated_minutes,
        due_at,
        recurrence,
        linked_calendar_event_id,
        schedule_intent,
        created_at,
        updated_at
      from tasks
      where user_id = $1 and id = $2
    `,
    [userId, taskId],
  );

  return result.rows[0] ? mapTask(result.rows[0]) : null;
}

export async function getGoalMetricById(
  userId: string,
  metricId: string,
  db: DatabaseExecutor = getWorkspaceExecutor(),
) {
  const result = await db.query<GoalMetricRow>(
    `
      select
        metrics.id,
        metrics.goal_id,
        metrics.name,
        metrics.unit_label,
        metrics.target_value,
        metrics.current_value,
        metrics.is_active,
        latest.delta_value as last_delta_value,
        latest.created_at as last_entry_at,
        metrics.created_at,
        metrics.updated_at
      from goal_metrics metrics
      left join lateral (
        select delta_value, created_at
        from metric_progress_entries
        where metric_id = metrics.id
        order by created_at desc
        limit 1
      ) latest on true
      where metrics.user_id = $1 and metrics.id = $2
    `,
    [userId, metricId],
  );

  return result.rows[0] ? mapGoalMetric(result.rows[0]) : null;
}

async function listGoalMetricRowsForGoal(
  userId: string,
  goalId: string,
  db: DatabaseExecutor,
) {
  const result = await db.query<GoalMetricRow>(
    `
      select
        metrics.id,
        metrics.goal_id,
        metrics.name,
        metrics.unit_label,
        metrics.target_value,
        metrics.current_value,
        metrics.is_active,
        latest.delta_value as last_delta_value,
        latest.created_at as last_entry_at,
        metrics.created_at,
        metrics.updated_at
      from goal_metrics metrics
      left join lateral (
        select delta_value, created_at
        from metric_progress_entries
        where metric_id = metrics.id
        order by created_at desc
        limit 1
      ) latest on true
      where metrics.user_id = $1 and metrics.goal_id = $2
    `,
    [userId, goalId],
  );

  return result.rows;
}

export async function createGoal(
  input: {
    userId: string;
    title: string;
    definition?: string | undefined;
    successCriteria?: string[] | undefined;
    focusAreas?: GoalFocusArea[] | undefined;
    scheduleGuidance?: Record<string, unknown> | undefined;
    constraints?: string[] | undefined;
    notes?: string | null | undefined;
    priorityRank?: number | undefined;
    status?: GoalRecord["status"] | undefined;
  },
  db: DatabaseExecutor = getWorkspaceExecutor(),
) {
  const result = await db.query<GoalRow>(
    `
      insert into goals (
        user_id,
        title,
        definition,
        success_criteria,
        habit_focus,
        schedule_guidance,
        constraints,
        notes,
        priority_rank,
        status
      )
      values ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10)
      returning
        id,
        title,
        definition,
        success_criteria,
        habit_focus,
        schedule_guidance,
        constraints,
        notes,
        priority_rank,
        status,
        created_at,
        updated_at
    `,
    [
      input.userId,
      input.title,
      input.definition ?? "",
      JSON.stringify(input.successCriteria ?? []),
      JSON.stringify(input.focusAreas ?? []),
      JSON.stringify(input.scheduleGuidance ?? {}),
      JSON.stringify(input.constraints ?? []),
      input.notes ?? null,
      input.priorityRank ?? 100,
      input.status ?? "active",
    ],
  );

  return mapGoal(result.rows[0]);
}

export async function patchGoal(
  input: {
    userId: string;
    goalId: string;
    title?: string | undefined;
    definition?: string | undefined;
    successCriteria?: string[] | undefined;
    focusAreas?: GoalFocusArea[] | undefined;
    scheduleGuidance?: Record<string, unknown> | undefined;
    constraints?: string[] | undefined;
    notes?: string | null | undefined;
    priorityRank?: number | undefined;
    status?: GoalRecord["status"] | undefined;
  },
  db: DatabaseExecutor = getWorkspaceExecutor(),
) {
  return updateOneRecord<GoalRow, GoalRecord>(
    {
      table: "goals",
      idColumn: "id",
      userId: input.userId,
      recordId: input.goalId,
      setFields: {
        title: input.title,
        definition: input.definition,
        success_criteria:
          input.successCriteria === undefined
            ? undefined
            : JSON.stringify(input.successCriteria),
        habit_focus:
          input.focusAreas === undefined
            ? undefined
            : JSON.stringify(input.focusAreas),
        schedule_guidance:
          input.scheduleGuidance === undefined
            ? undefined
            : JSON.stringify(input.scheduleGuidance),
        constraints:
          input.constraints === undefined
            ? undefined
            : JSON.stringify(input.constraints),
        notes: input.notes,
        priority_rank: input.priorityRank,
        status: input.status,
      },
      returning: `
        id,
        title,
        definition,
        success_criteria,
        habit_focus,
        schedule_guidance,
        constraints,
        notes,
        priority_rank,
        status,
        created_at,
        updated_at
      `,
      mapper: mapGoal,
    },
    db,
  );
}

export async function createTask(
  input: {
    userId: string;
    goalId?: string | null | undefined;
    title: string;
    description?: string | undefined;
    priorityRank?: number | undefined;
    status?: TaskStatus | undefined;
    estimatedMinutes?: number | null | undefined;
    dueAt?: Date | null | undefined;
    scheduleIntent?: ScheduleIntent | undefined;
    recurrence?: TaskRecurrence | null | undefined;
    linkedCalendarEventId?: string | null | undefined;
  },
  db: DatabaseExecutor = getWorkspaceExecutor(),
) {
  const result = await db.query<TaskRow>(
    `
      insert into tasks (
        user_id,
        goal_id,
        title,
        description,
        priority_rank,
        status,
        estimated_minutes,
        due_at,
        recurrence,
        linked_calendar_event_id,
        schedule_intent
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
      returning
        id,
        goal_id,
        title,
        description,
        priority_rank,
        status,
        estimated_minutes,
        due_at,
        recurrence,
        linked_calendar_event_id,
        schedule_intent,
        created_at,
        updated_at
    `,
    [
      input.userId,
      input.goalId ?? null,
      input.title,
      input.description ?? "",
      input.priorityRank ?? 100,
      input.status ?? "inbox",
      input.estimatedMinutes ?? null,
      input.dueAt ?? null,
      input.recurrence ? JSON.stringify(input.recurrence) : null,
      input.linkedCalendarEventId ?? null,
      input.scheduleIntent ?? "unscheduled",
    ],
  );

  return mapTask(result.rows[0]);
}

export async function patchTask(
  input: {
    userId: string;
    taskId: string;
    goalId?: string | null | undefined;
    title?: string | undefined;
    description?: string | undefined;
    priorityRank?: number | undefined;
    status?: TaskStatus | undefined;
    estimatedMinutes?: number | null | undefined;
    dueAt?: Date | null | undefined;
    scheduleIntent?: ScheduleIntent | undefined;
    recurrence?: TaskRecurrence | null | undefined;
    linkedCalendarEventId?: string | null | undefined;
  },
  db: DatabaseExecutor = getWorkspaceExecutor(),
) {
  return updateOneRecord<TaskRow, TaskRecord>(
    {
      table: "tasks",
      idColumn: "id",
      userId: input.userId,
      recordId: input.taskId,
      setFields: {
        goal_id: input.goalId,
        title: input.title,
        description: input.description,
        priority_rank: input.priorityRank,
        status: input.status,
        estimated_minutes: input.estimatedMinutes,
        due_at: input.dueAt,
        recurrence:
          input.recurrence === undefined
            ? undefined
            : input.recurrence === null
              ? null
              : JSON.stringify(input.recurrence),
        linked_calendar_event_id: input.linkedCalendarEventId,
        schedule_intent: input.scheduleIntent,
      },
      returning: `
        id,
        goal_id,
        title,
        description,
        priority_rank,
        status,
        estimated_minutes,
        due_at,
        recurrence,
        linked_calendar_event_id,
        schedule_intent,
        created_at,
        updated_at
      `,
      mapper: mapTask,
    },
    db,
  );
}

export async function createGoalMetric(
  input: {
    userId: string;
    goalId: string;
    name: string;
    unitLabel: string;
    targetValue: number;
    currentValue?: number | undefined;
    isActive?: boolean | undefined;
  },
  db: DatabaseExecutor = getWorkspaceExecutor(),
) {
  const result = await db.query<GoalMetricRow>(
    `
      insert into goal_metrics (
        user_id,
        goal_id,
        name,
        unit_label,
        target_value,
        current_value,
        is_active
      )
      values ($1, $2, $3, $4, $5, $6, $7)
      returning
        id,
        goal_id,
        name,
        unit_label,
        target_value,
        current_value,
        is_active,
        null::double precision as last_delta_value,
        null::timestamptz as last_entry_at,
        created_at,
        updated_at
    `,
    [
      input.userId,
      input.goalId,
      input.name,
      input.unitLabel,
      input.targetValue,
      input.currentValue ?? 0,
      input.isActive ?? true,
    ],
  );

  return mapGoalMetric(result.rows[0]);
}

export async function patchGoalMetric(
  input: {
    userId: string;
    metricId: string;
    name?: string | undefined;
    unitLabel?: string | undefined;
    targetValue?: number | undefined;
    currentValue?: number | undefined;
    isActive?: boolean | undefined;
  },
  db: DatabaseExecutor = getWorkspaceExecutor(),
) {
  return updateOneRecord<GoalMetricRow, GoalMetricRecord>(
    {
      table: "goal_metrics",
      idColumn: "id",
      userId: input.userId,
      recordId: input.metricId,
      setFields: {
        name: input.name,
        unit_label: input.unitLabel,
        target_value: input.targetValue,
        current_value: input.currentValue,
        is_active: input.isActive,
      },
      returning: `
        id,
        goal_id,
        name,
        unit_label,
        target_value,
        current_value,
        is_active,
        null::double precision as last_delta_value,
        null::timestamptz as last_entry_at,
        created_at,
        updated_at
      `,
      mapper: mapGoalMetric,
    },
    db,
  );
}

export async function addMetricProgressEntry(
  input: {
    userId: string;
    metricId: string;
    deltaValue: number;
    source: MetricProgressSource;
    note?: string | null | undefined;
    workLogId?: string | null | undefined;
  },
  db: DatabaseExecutor = getWorkspaceExecutor(),
) {
  const updatedMetric = await db.query<GoalMetricRow>(
    `
      update goal_metrics
      set current_value = current_value + $3
      where user_id = $1 and id = $2
      returning
        id,
        goal_id,
        name,
        unit_label,
        target_value,
        current_value,
        is_active,
        $3::double precision as last_delta_value,
        timezone('utc', now()) as last_entry_at,
        created_at,
        updated_at
    `,
    [input.userId, input.metricId, input.deltaValue],
  );

  if (!updatedMetric.rows[0]) {
    return null;
  }

  const entry = await db.query<MetricProgressEntryRow>(
    `
      insert into metric_progress_entries (
        metric_id,
        user_id,
        work_log_id,
        delta_value,
        source,
        note
      )
      values ($1, $2, $3, $4, $5, $6)
      returning
        id,
        metric_id,
        work_log_id,
        delta_value,
        source,
        note,
        created_at
    `,
    [
      input.metricId,
      input.userId,
      input.workLogId ?? null,
      input.deltaValue,
      input.source,
      input.note ?? null,
    ],
  );

  return {
    entry: mapMetricProgressEntry(entry.rows[0]),
    metric: mapGoalMetric(updatedMetric.rows[0]),
  };
}

export async function createWorkLog(
  input: {
    userId: string;
    threadId?: string | null | undefined;
    goalId?: string | null | undefined;
    taskId?: string | null | undefined;
    rawText: string;
    summary: string;
    recordedAt?: Date | undefined;
  },
  db: DatabaseExecutor = getWorkspaceExecutor(),
) {
  const result = await db.query<WorkLogRow>(
    `
      insert into work_logs (
        user_id,
        thread_id,
        goal_id,
        task_id,
        raw_text,
        summary,
        recorded_at
      )
      values ($1, $2, $3, $4, $5, $6, $7)
      returning
        id,
        thread_id,
        goal_id,
        task_id,
        raw_text,
        summary,
        recorded_at,
        created_at,
        updated_at
    `,
    [
      input.userId,
      input.threadId ?? null,
      input.goalId ?? null,
      input.taskId ?? null,
      input.rawText,
      input.summary,
      input.recordedAt ?? new Date(),
    ],
  );

  return mapWorkLog(result.rows[0]);
}

async function updateOneRecord<Row extends QueryResultRow, RecordType>(input: {
  table: string;
  idColumn: string;
  userId: string;
  recordId: string;
  setFields: Record<string, unknown>;
  returning: string;
  mapper: (row: Row | undefined) => RecordType;
}, db: DatabaseExecutor) {
  const entries = Object.entries(input.setFields).filter(([, value]) => value !== undefined);

  if (entries.length === 0) {
    const result = await db.query<Row>(
      `
        select ${input.returning}
        from ${input.table}
        where user_id = $1 and ${input.idColumn} = $2
      `,
      [input.userId, input.recordId],
    );

    return result.rows[0] ? input.mapper(result.rows[0]) : null;
  }

  const values: unknown[] = [];
  const clauses = entries.map(([column, value]) => {
    values.push(value);
    return `${column} = $${values.length}`;
  });

  values.push(input.userId, input.recordId);

  const result = await db.query<Row>(
    `
      update ${input.table}
      set
        ${clauses.join(", ")},
        updated_at = timezone('utc', now())
      where user_id = $${values.length - 1} and ${input.idColumn} = $${values.length}
      returning ${input.returning}
    `,
    values,
  );

  return result.rows[0] ? input.mapper(result.rows[0]) : null;
}

function mapGoal(row: GoalRow | undefined): GoalRecord {
  if (!row) {
    throw new Error("Expected goal row.");
  }

  return {
    id: row.id,
    title: row.title,
    definition: row.definition,
    successCriteria: normalizeStringArray(row.success_criteria),
    focusAreas: normalizeGoalFocusAreas(row.habit_focus),
    scheduleGuidance: normalizeJsonRecord(row.schedule_guidance),
    constraints: normalizeStringArray(row.constraints),
    notes: row.notes,
    priorityRank: row.priority_rank,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function normalizeGoalFocusAreas(value: unknown): GoalFocusArea[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const record = item as Record<string, unknown>;
    const title = normalizeString(record.title);

    if (!title) {
      return [];
    }

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
        id: normalizeString(record.id) ?? createStableFocusId(title),
        title,
        description: normalizeString(record.description) ?? "",
        status,
        defaultDurationMinutes,
        cadence: normalizeString(record.cadence),
      },
    ];
  });
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeJsonRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function normalizeString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeTaskRecurrence(value: unknown): TaskRecurrence | null {
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
  const endsAt =
    typeof record.endsAt === "string" && !Number.isNaN(Date.parse(record.endsAt))
      ? new Date(record.endsAt).toISOString()
      : null;

  return {
    frequency,
    interval,
    daysOfWeek,
    endsAt,
    sourceText: normalizeString(record.sourceText),
    scheduledOccurrences: normalizeTaskScheduledOccurrences(
      record.scheduledOccurrences,
    ),
  };
}

function normalizeTaskScheduledOccurrences(
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
      normalizeDateKey(record.dateKey) ??
      (startTime ? dateKeyFromIsoString(startTime) : null);

    if (!dateKey || !startTime || !endTime) {
      return [];
    }

    return [
      {
        dateKey,
        startTime,
        endTime,
        calendarEventId: normalizeString(record.calendarEventId),
        sourceProposalId: normalizeString(record.sourceProposalId),
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

function normalizeDateKey(value: unknown) {
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

function mapTask(row: TaskRow | undefined): TaskRecord {
  if (!row) {
    throw new Error("Expected task row.");
  }

  return {
    id: row.id,
    goalId: row.goal_id,
    title: row.title,
    description: row.description,
    priorityRank: row.priority_rank,
    status: row.status,
    estimatedMinutes: row.estimated_minutes,
    dueAt: row.due_at?.toISOString() ?? null,
    recurrence: normalizeTaskRecurrence(row.recurrence),
    linkedCalendarEventId: row.linked_calendar_event_id,
    scheduleIntent: row.schedule_intent,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapGoalMetric(row: GoalMetricRow | undefined): GoalMetricRecord {
  if (!row) {
    throw new Error("Expected goal metric row.");
  }

  return {
    id: row.id,
    goalId: row.goal_id,
    name: row.name,
    unitLabel: row.unit_label,
    targetValue: Number(row.target_value),
    currentValue: Number(row.current_value),
    isActive: row.is_active,
    lastDeltaValue: row.last_delta_value === null ? null : Number(row.last_delta_value),
    lastEntryAt: row.last_entry_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapMetricProgressEntry(
  row: MetricProgressEntryRow | undefined,
): MetricProgressEntryRecord {
  if (!row) {
    throw new Error("Expected metric progress entry row.");
  }

  return {
    id: row.id,
    metricId: row.metric_id,
    workLogId: row.work_log_id,
    deltaValue: Number(row.delta_value),
    source: row.source,
    note: row.note,
    createdAt: row.created_at.toISOString(),
  };
}

function mapWorkLog(row: WorkLogRow | undefined): WorkLogRecord {
  if (!row) {
    throw new Error("Expected work log row.");
  }

  return {
    id: row.id,
    threadId: row.thread_id,
    goalId: row.goal_id,
    taskId: row.task_id,
    rawText: row.raw_text,
    summary: row.summary,
    recordedAt: row.recorded_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapAssistantThread(
  row: AssistantThreadRow | undefined,
): AssistantThreadRecord {
  if (!row) {
    throw new Error("Expected assistant thread row.");
  }

  return {
    id: row.id,
    title: row.title,
    currentIntent: row.current_intent,
    latestContextSummary: row.latest_context_summary,
    latestArtifact: row.latest_artifact ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapAssistantMessage(
  row: AssistantMessageRow | undefined,
): AssistantMessageRecord {
  if (!row) {
    throw new Error("Expected assistant message row.");
  }

  return {
    id: row.id,
    role: row.role,
    intent: row.intent,
    content: row.content,
    structuredPayload: row.structured_payload ?? {},
    createdAt: row.created_at.toISOString(),
  };
}
