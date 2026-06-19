import type { QueryResult, QueryResultRow } from "pg";

import { getRuntimePool } from "../../shared/db/postgres.ts";
import type { SchedulingConflict } from "../scheduling-context/scheduling-context.types.ts";

type DatabaseExecutor = {
  query: <T extends QueryResultRow>(
    text: string,
    params?: unknown[],
  ) => Promise<QueryResult<T>>;
};

type ScheduleProposalRow = {
  id: string;
  thread_id: string | null;
  title: string;
  status: "draft" | "confirmed" | "applied" | "superseded" | "canceled";
  intent: string | null;
  date_range_start: string | null;
  date_range_end: string | null;
  summary: string;
  operations: unknown;
  conflict_annotations: unknown;
  feedback_history: unknown;
  applied_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type ScheduleProposalOperation = {
  type: "schedule_task";
  taskId: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
};

export type ScheduleProposalRecord = {
  id: string;
  threadId: string | null;
  title: string;
  status: "draft" | "confirmed" | "applied" | "superseded" | "canceled";
  intent: string | null;
  summary: string;
  operations: ScheduleProposalOperation[];
  conflictAnnotations: SchedulingConflict[];
  feedbackHistory: Record<string, unknown>[];
  appliedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function getScheduleProposalExecutor(): DatabaseExecutor {
  return getRuntimePool();
}

export async function listDraftScheduleProposals(
  userId: string,
  db: DatabaseExecutor = getScheduleProposalExecutor(),
): Promise<ScheduleProposalRecord[]> {
  const result = await db.query<ScheduleProposalRow>(
    `
      select
        id,
        thread_id,
        title,
        status,
        intent,
        date_range_start::text,
        date_range_end::text,
        summary,
        operations,
        conflict_annotations,
        feedback_history,
        applied_at,
        created_at,
        updated_at
      from schedule_proposals
      where user_id = $1
        and status = 'draft'
      order by created_at desc
      limit 5
    `,
    [userId],
  );

  return result.rows.map(mapScheduleProposal);
}

export async function createScheduleProposal(
  input: {
    userId: string;
    threadId?: string | null;
    title: string;
    intent?: string | null;
    summary: string;
    operations: ScheduleProposalOperation[];
    conflictAnnotations?: SchedulingConflict[] | undefined;
  },
  db: DatabaseExecutor = getScheduleProposalExecutor(),
): Promise<ScheduleProposalRecord> {
  const operationDates = input.operations
    .flatMap((operation) => [operation.startTime.slice(0, 10), operation.endTime.slice(0, 10)])
    .sort();
  const dateRangeStart = operationDates[0] ?? null;
  const dateRangeEnd = operationDates[operationDates.length - 1] ?? null;

  const result = await db.query<ScheduleProposalRow>(
    `
      insert into schedule_proposals (
        user_id,
        thread_id,
        title,
        status,
        intent,
        date_range_start,
        date_range_end,
        summary,
        operations,
        conflict_annotations,
        feedback_history
      )
      values (
        $1,
        $2,
        $3,
        'draft',
        $4,
        $5,
        $6,
        $7,
        $8::jsonb,
        $9::jsonb,
        '[]'::jsonb
      )
      returning
        id,
        thread_id,
        title,
        status,
        intent,
        date_range_start::text,
        date_range_end::text,
        summary,
        operations,
        conflict_annotations,
        feedback_history,
        applied_at,
        created_at,
        updated_at
    `,
    [
      input.userId,
      input.threadId ?? null,
      input.title,
      input.intent ?? null,
      dateRangeStart,
      dateRangeEnd,
      input.summary,
      JSON.stringify(input.operations),
      JSON.stringify(input.conflictAnnotations ?? []),
    ],
  );

  const createdRow = result.rows[0];

  if (!createdRow) {
    throw new Error("Failed to create schedule proposal.");
  }

  return mapScheduleProposal(createdRow);
}

export async function getScheduleProposalById(
  userId: string,
  proposalId: string,
  db: DatabaseExecutor = getScheduleProposalExecutor(),
): Promise<ScheduleProposalRecord | null> {
  const result = await db.query<ScheduleProposalRow>(
    `
      select
        id,
        thread_id,
        title,
        status,
        intent,
        date_range_start::text,
        date_range_end::text,
        summary,
        operations,
        conflict_annotations,
        feedback_history,
        applied_at,
        created_at,
        updated_at
      from schedule_proposals
      where user_id = $1 and id = $2
      limit 1
    `,
    [userId, proposalId],
  );

  const proposalRow = result.rows[0];
  return proposalRow ? mapScheduleProposal(proposalRow) : null;
}

export async function updateScheduleProposalStatus(
  input: {
    userId: string;
    proposalId: string;
    status: ScheduleProposalRecord["status"];
    feedbackEntry?: Record<string, unknown> | undefined;
  },
  db: DatabaseExecutor = getScheduleProposalExecutor(),
) {
  if (input.feedbackEntry) {
    await db.query(
      `
        update schedule_proposals
        set
          status = $1,
          feedback_history = coalesce(feedback_history, '[]'::jsonb) || $2::jsonb,
          applied_at = case when $1 = 'applied' then timezone('utc', now()) else applied_at end,
          updated_at = timezone('utc', now())
        where id = $3 and user_id = $4
      `,
      [
        input.status,
        JSON.stringify([input.feedbackEntry]),
        input.proposalId,
        input.userId,
      ],
    );
    return;
  }

  await db.query(
    `
      update schedule_proposals
      set
        status = $1,
        applied_at = case when $1 = 'applied' then timezone('utc', now()) else applied_at end,
        updated_at = timezone('utc', now())
      where id = $2 and user_id = $3
    `,
    [input.status, input.proposalId, input.userId],
  );
}

function mapScheduleProposal(row: ScheduleProposalRow): ScheduleProposalRecord {
  return {
    id: row.id,
    threadId: row.thread_id,
    title: row.title,
    status: row.status,
    intent: row.intent,
    summary: row.summary,
    operations: Array.isArray(row.operations)
      ? row.operations.flatMap((operation) => normalizeScheduleProposalOperation(operation))
      : [],
    conflictAnnotations: Array.isArray(row.conflict_annotations)
      ? row.conflict_annotations.flatMap((item) => normalizeSchedulingConflict(item))
      : [],
    feedbackHistory: Array.isArray(row.feedback_history)
      ? row.feedback_history.filter(
          (item): item is Record<string, unknown> =>
            !!item && typeof item === "object" && !Array.isArray(item),
        )
      : [],
    appliedAt: row.applied_at ? row.applied_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function normalizeScheduleProposalOperation(value: unknown): ScheduleProposalOperation[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const record = value as Record<string, unknown>;

  if (
    record.type !== "schedule_task" ||
    typeof record.taskId !== "string" ||
    typeof record.title !== "string" ||
    typeof record.description !== "string" ||
    typeof record.startTime !== "string" ||
    typeof record.endTime !== "string"
  ) {
    return [];
  }

  return [
    {
      type: "schedule_task",
      taskId: record.taskId,
      title: record.title,
      description: record.description,
      startTime: record.startTime,
      endTime: record.endTime,
    },
  ];
}

function normalizeSchedulingConflict(value: unknown): SchedulingConflict[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const record = value as Record<string, unknown>;

  if (
    (record.type !== "work_hours" &&
      record.type !== "no_schedule_window" &&
      record.type !== "sleep_window" &&
      record.type !== "latest_work_end" &&
      record.type !== "recovery_day") ||
    typeof record.title !== "string" ||
    typeof record.detail !== "string" ||
    (record.strength !== "hard_constraint" &&
      record.strength !== "soft_preference")
  ) {
    return [];
  }

  return [
    {
      type: record.type,
      title: record.title,
      detail: record.detail,
      strength: record.strength,
    },
  ];
}
