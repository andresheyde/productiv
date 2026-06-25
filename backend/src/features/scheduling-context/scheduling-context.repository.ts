import type { QueryResult, QueryResultRow } from "pg";

import { getRuntimePool } from "../../shared/db/postgres.ts";
import type {
  CompiledSchedulingContext,
  DerivedSchedulingSuggestionRecord,
  RuleConfidence,
  ScheduleReflectionRecord,
  ScheduleReflectionStrategySuggestion,
  SchedulingConflict,
  SchedulingDayOfWeek,
  SchedulingPreferenceCandidate,
  SchedulingPreferenceRuleKind,
  SchedulingPreferenceRuleRecord,
  SchedulingPreferenceRuleSource,
  SchedulingPreferenceRuleStatus,
  SchedulingTimeWindow,
  SleepWindow,
  UserSchedulingContextRecord,
  WorkHoursRule,
  WorkPeriod,
} from "./scheduling-context.types.ts";

type DatabaseExecutor = {
  query: <T extends QueryResultRow>(
    text: string,
    params?: unknown[],
  ) => Promise<QueryResult<T>>;
};

type UserSchedulingContextRow = {
  user_id: string;
  work_hours: unknown;
  no_schedule_windows: unknown;
  sleep_window: unknown;
  max_work_end_time: string | null;
  preferred_focus_block_minutes: number | null;
  preferred_work_periods: unknown;
  recovery_days: unknown;
  additional_notes: string;
  updated_at: Date;
};

type SchedulingSuggestionRow = {
  id: string;
  user_id: string;
  kind: SchedulingPreferenceRuleKind;
  title: string;
  detail: string;
  source: SchedulingPreferenceRuleSource;
  strength: "hard_constraint" | "soft_preference";
  status: SchedulingPreferenceRuleStatus;
  confidence: RuleConfidence | null;
  context_patch: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

type ScheduleReflectionRow = {
  id: string;
  timeframe_start: Date | string;
  timeframe_end: Date | string;
  user_narrative: string;
  extracted_blockers: unknown;
  effective_conditions: unknown;
  recurring_preferences: unknown;
  recommended_memory_updates: unknown;
  created_at: Date;
};

const DEFAULT_WORK_DAY_START = "09:00";
const DEFAULT_WORK_DAY_END = "17:00";
const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const WORK_PERIOD_LABELS: Record<WorkPeriod, string> = {
  morning: "morning",
  afternoon: "afternoon",
  evening: "evening",
};

export function getSchedulingContextExecutor(): DatabaseExecutor {
  return getRuntimePool();
}

export async function getOrCreateUserSchedulingContext(
  userId: string,
  db: DatabaseExecutor = getSchedulingContextExecutor(),
): Promise<UserSchedulingContextRecord> {
  const contextRow = await getOrCreateSchedulingContextRow(userId, db);
  const acceptedDerivedRules = await listSchedulingSuggestionRows(
    userId,
    ["active"],
    db,
  );

  return mapUserSchedulingContext(contextRow, acceptedDerivedRules);
}

export async function patchUserSchedulingContext(
  input: {
    userId: string;
    workHours?: WorkHoursRule[] | undefined;
    noScheduleWindows?: SchedulingTimeWindow[] | undefined;
    sleepWindow?: SleepWindow | null | undefined;
    maxWorkEndTime?: string | null | undefined;
    preferredFocusBlockMinutes?: number | null | undefined;
    preferredWorkPeriods?: WorkPeriod[] | undefined;
    recoveryDays?: SchedulingDayOfWeek[] | undefined;
    additionalNotes?: string | undefined;
  },
  db: DatabaseExecutor = getSchedulingContextExecutor(),
): Promise<UserSchedulingContextRecord> {
  await getOrCreateSchedulingContextRow(input.userId, db);

  const updates: string[] = [];
  const values: unknown[] = [];

  if (input.workHours !== undefined) {
    values.push(JSON.stringify(normalizeWorkHours(input.workHours)));
    updates.push(`work_hours = $${values.length}::jsonb`);
  }

  if (input.noScheduleWindows !== undefined) {
    values.push(JSON.stringify(normalizeNoScheduleWindows(input.noScheduleWindows)));
    updates.push(`no_schedule_windows = $${values.length}::jsonb`);
  }

  if (input.sleepWindow !== undefined) {
    values.push(input.sleepWindow ? JSON.stringify(normalizeSleepWindow(input.sleepWindow)) : null);
    updates.push(`sleep_window = $${values.length}::jsonb`);
  }

  if (input.maxWorkEndTime !== undefined) {
    values.push(input.maxWorkEndTime);
    updates.push(`max_work_end_time = $${values.length}`);
  }

  if (input.preferredFocusBlockMinutes !== undefined) {
    values.push(input.preferredFocusBlockMinutes);
    updates.push(`preferred_focus_block_minutes = $${values.length}`);
  }

  if (input.preferredWorkPeriods !== undefined) {
    values.push(JSON.stringify(normalizePreferredWorkPeriods(input.preferredWorkPeriods)));
    updates.push(`preferred_work_periods = $${values.length}::jsonb`);
  }

  if (input.recoveryDays !== undefined) {
    values.push(JSON.stringify(normalizeRecoveryDays(input.recoveryDays)));
    updates.push(`recovery_days = $${values.length}::jsonb`);
  }

  if (input.additionalNotes !== undefined) {
    values.push(input.additionalNotes.trim());
    updates.push(`additional_notes = $${values.length}`);
  }

  if (updates.length > 0) {
    values.push(input.userId);
    await db.query(
      `
        update user_scheduling_contexts
        set
          ${updates.join(", ")},
          updated_at = timezone('utc', now())
        where user_id = $${values.length}
      `,
      values,
    );
  }

  let context = await getOrCreateUserSchedulingContext(input.userId, db);
  await syncDerivedSuggestionsFromNotes(input.userId, context, db);
  context = await getOrCreateUserSchedulingContext(input.userId, db);
  await upsertUserContextMemoryCache(input.userId, context, db);
  return context;
}

export async function listDerivedSchedulingSuggestions(
  userId: string,
  db: DatabaseExecutor = getSchedulingContextExecutor(),
): Promise<DerivedSchedulingSuggestionRecord[]> {
  const context = await getOrCreateUserSchedulingContext(userId, db);
  await syncDerivedSuggestionsFromNotes(userId, context, db);
  const rows = await listSchedulingSuggestionRows(userId, ["suggested"], db);
  return rows
    .map(mapSchedulingSuggestion)
    .filter(
      (rule): rule is DerivedSchedulingSuggestionRecord =>
        rule.source === "derived" && rule.status === "suggested",
    );
}

export async function acceptDerivedSchedulingSuggestion(
  userId: string,
  suggestionId: string,
  db: DatabaseExecutor = getSchedulingContextExecutor(),
): Promise<{
  context: UserSchedulingContextRecord;
  suggestion: SchedulingPreferenceRuleRecord | null;
}> {
  const suggestion = await getSchedulingSuggestionRow(userId, suggestionId, db);

  if (!suggestion || suggestion.status !== "suggested") {
    return {
      context: await getOrCreateUserSchedulingContext(userId, db),
      suggestion: null,
    };
  }

  if (hasMeaningfulContextPatch(suggestion.context_patch ?? null)) {
    const currentContextRow = await getOrCreateSchedulingContextRow(userId, db);
    const mergedPatch = applyContextPatchToRow(currentContextRow, suggestion.context_patch ?? {});

    await patchUserSchedulingContext(
      {
        userId,
        ...mergedPatch,
      },
      db,
    );
  }

  await db.query(
    `
      update scheduling_preference_suggestions
      set
        status = 'active',
        updated_at = timezone('utc', now())
      where id = $1 and user_id = $2
    `,
    [suggestionId, userId],
  );

  const context = await getOrCreateUserSchedulingContext(userId, db);
  await upsertUserContextMemoryCache(userId, context, db);

  return {
    context,
    suggestion: mapSchedulingSuggestion({
      ...suggestion,
      status: "active",
      updated_at: new Date(),
    }),
  };
}

export async function dismissDerivedSchedulingSuggestion(
  userId: string,
  suggestionId: string,
  db: DatabaseExecutor = getSchedulingContextExecutor(),
): Promise<SchedulingPreferenceRuleRecord | null> {
  const suggestion = await getSchedulingSuggestionRow(userId, suggestionId, db);

  if (!suggestion || suggestion.status !== "suggested") {
    return null;
  }

  await db.query(
    `
      update scheduling_preference_suggestions
      set
        status = 'dismissed',
        updated_at = timezone('utc', now())
      where id = $1 and user_id = $2
    `,
    [suggestionId, userId],
  );

  return mapSchedulingSuggestion({
    ...suggestion,
    status: "dismissed",
    updated_at: new Date(),
  });
}

export async function createScheduleReflection(
  input: {
    userId: string;
    timeframeStart: Date;
    timeframeEnd: Date;
    userNarrative: string;
    extractedBlockers: string[];
    effectiveConditions: string[];
    recurringPreferences: string[];
    recommendedMemoryUpdates: ScheduleReflectionStrategySuggestion[];
  },
  db: DatabaseExecutor = getSchedulingContextExecutor(),
): Promise<ScheduleReflectionRecord> {
  const result = await db.query<ScheduleReflectionRow>(
    `
      insert into schedule_reflections (
        user_id,
        timeframe_start,
        timeframe_end,
        user_narrative,
        extracted_blockers,
        effective_conditions,
        recurring_preferences,
        recommended_memory_updates
      )
      values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb)
      returning
        id,
        timeframe_start,
        timeframe_end,
        user_narrative,
        extracted_blockers,
        effective_conditions,
        recurring_preferences,
        recommended_memory_updates,
        created_at
    `,
    [
      input.userId,
      input.timeframeStart,
      input.timeframeEnd,
      input.userNarrative,
      JSON.stringify(input.extractedBlockers),
      JSON.stringify(input.effectiveConditions),
      JSON.stringify(input.recurringPreferences),
      JSON.stringify(input.recommendedMemoryUpdates),
    ],
  );

  return mapScheduleReflection(result.rows[0]);
}

export async function createDerivedSchedulingSuggestionsFromReflection(
  input: {
    userId: string;
    reflectionId: string;
    suggestions: ScheduleReflectionStrategySuggestion[];
  },
  db: DatabaseExecutor = getSchedulingContextExecutor(),
): Promise<DerivedSchedulingSuggestionRecord[]> {
  if (input.suggestions.length === 0) {
    return [];
  }

  const existingRows = await listSchedulingSuggestionRows(
    input.userId,
    ["suggested", "active", "dismissed"],
    db,
  );
  const existingKeys = new Set(
    existingRows.map((row) => `${row.kind}:${row.title.toLowerCase()}`),
  );
  const createdSuggestions: DerivedSchedulingSuggestionRecord[] = [];

  for (const suggestion of input.suggestions) {
    const title = suggestion.title.trim();
    const detail = suggestion.detail.trim();

    if (!title || !detail) {
      continue;
    }

    const key = `custom:${title.toLowerCase()}`;

    if (existingKeys.has(key)) {
      continue;
    }

    const result = await db.query<SchedulingSuggestionRow>(
      `
        insert into scheduling_preference_suggestions (
          user_id,
          kind,
          title,
          detail,
          source,
          strength,
          status,
          confidence,
          context_patch,
          metadata
        )
        values (
          $1,
          'custom',
          $2,
          $3,
          'derived',
          $4,
          'suggested',
          $5,
          '{}'::jsonb,
          $6::jsonb
        )
        returning
          id,
          user_id,
          kind,
          title,
          detail,
          source,
          strength,
          status,
          confidence,
          context_patch,
          metadata,
          created_at,
          updated_at
      `,
      [
        input.userId,
        title,
        detail,
        suggestion.strength,
        suggestion.confidence,
        JSON.stringify({
          origin: "schedule_reflection",
          reflectionId: input.reflectionId,
          obstacle: suggestion.obstacle ?? null,
        }),
      ],
    );

    const createdSuggestion = result.rows[0];

    if (!createdSuggestion) {
      continue;
    }

    createdSuggestions.push(
      mapSchedulingSuggestion(createdSuggestion) as DerivedSchedulingSuggestionRecord,
    );
    existingKeys.add(key);
  }

  return createdSuggestions;
}

export async function createDerivedSchedulingSuggestionsFromCandidates(
  input: {
    userId: string;
    candidates: SchedulingPreferenceCandidate[];
    origin: string;
    threadId?: string | undefined;
    messageId?: string | undefined;
    turnMode?: string | undefined;
    goalId?: string | null | undefined;
    goalTitle?: string | null | undefined;
  },
  db: DatabaseExecutor = getSchedulingContextExecutor(),
): Promise<DerivedSchedulingSuggestionRecord[]> {
  if (input.candidates.length === 0) {
    return [];
  }

  const existingRows = await listSchedulingSuggestionRows(
    input.userId,
    ["suggested", "active", "dismissed"],
    db,
  );
  const existingKeys = new Set(
    existingRows.map((row) =>
      buildScopedSchedulingSuggestionKey({
        kind: row.kind,
        title: row.title,
        metadata: row.metadata ?? {},
      }),
    ),
  );
  const createdSuggestions: DerivedSchedulingSuggestionRecord[] = [];

  for (const candidate of input.candidates) {
    if (!shouldCreateDerivedSuggestionFromCandidate(candidate)) {
      continue;
    }

    const title = candidate.title.trim();
    const detail = candidate.detail.trim();

    if (!title || !detail) {
      continue;
    }

    const scopedGoalId =
      candidate.applicabilityScope === "goal" ? input.goalId ?? null : null;
    const scopedGoalTitle =
      candidate.applicabilityScope === "goal"
        ? input.goalTitle ?? candidate.goalTitle
        : candidate.goalTitle;
    const metadata = {
      origin: input.origin,
      threadId: input.threadId ?? null,
      messageId: input.messageId ?? null,
      turnMode: input.turnMode ?? null,
      applicabilityScope: candidate.applicabilityScope,
      domain: candidate.domain,
      goalId: scopedGoalId,
      goalTitle: scopedGoalTitle,
      activityTitle: candidate.activityTitle,
      temporalScope: candidate.temporalScope,
      evidence: candidate.evidence,
    };
    const key = buildScopedSchedulingSuggestionKey({
      kind: candidate.kind,
      title,
      metadata,
    });

    if (existingKeys.has(key)) {
      continue;
    }

    const result = await db.query<SchedulingSuggestionRow>(
      `
        insert into scheduling_preference_suggestions (
          user_id,
          kind,
          title,
          detail,
          source,
          strength,
          status,
          confidence,
          context_patch,
          metadata
        )
        values (
          $1,
          $2,
          $3,
          $4,
          'derived',
          $5,
          'suggested',
          $6,
          '{}'::jsonb,
          $7::jsonb
        )
        returning
          id,
          user_id,
          kind,
          title,
          detail,
          source,
          strength,
          status,
          confidence,
          context_patch,
          metadata,
          created_at,
          updated_at
      `,
      [
        input.userId,
        candidate.kind,
        title,
        detail,
        candidate.strength,
        candidate.confidence,
        JSON.stringify(metadata),
      ],
    );

    const createdSuggestion = result.rows[0];

    if (!createdSuggestion) {
      continue;
    }

    createdSuggestions.push(
      mapSchedulingSuggestion(createdSuggestion) as DerivedSchedulingSuggestionRecord,
    );
    existingKeys.add(key);
  }

  return createdSuggestions;
}

export function buildCompiledSchedulingContext(
  context: UserSchedulingContextRecord,
): CompiledSchedulingContext {
  const hardConstraints = context.activeRules
    .filter((rule) => rule.strength === "hard_constraint")
    .map((rule) => `${rule.title}: ${rule.detail}`.trim().replace(/:$/u, ""));
  const softPreferences = context.activeRules
    .filter((rule) => rule.strength === "soft_preference" && rule.source === "user")
    .map((rule) => `${rule.title}: ${rule.detail}`.trim().replace(/:$/u, ""));
  const acceptedDerivedHabits = context.activeRules
    .filter((rule) => rule.source === "derived")
    .map((rule) => `${rule.title}: ${rule.detail}`.trim().replace(/:$/u, ""));

  return {
    workHours: context.workHours.filter((rule) => rule.enabled),
    noScheduleWindows: context.noScheduleWindows,
    sleepWindow: context.sleepWindow,
    maxWorkEndTime: context.maxWorkEndTime,
    preferredFocusBlockMinutes: context.preferredFocusBlockMinutes,
    preferredWorkPeriods: context.preferredWorkPeriods,
    recoveryDays: context.recoveryDays,
    additionalNotes: context.additionalNotes,
    hardConstraints,
    softPreferences,
    acceptedDerivedHabits,
    promptSummary: context.compiledSummary,
  };
}

export function detectSchedulingConflicts(
  context: UserSchedulingContextRecord,
  startTime: Date,
  endTime: Date,
): SchedulingConflict[] {
  const conflicts: SchedulingConflict[] = [];
  const dayOfWeek = startTime.getDay() as SchedulingDayOfWeek;
  const eventStartMinutes = dateToMinutes(startTime);
  const eventEndMinutes = dateToMinutes(endTime);

  const matchingWorkHours = context.workHours.find(
    (rule) => rule.enabled && rule.dayOfWeek === dayOfWeek,
  );

  if (
    matchingWorkHours &&
    timeRangesOverlap(
      eventStartMinutes,
      eventEndMinutes,
      toMinutes(matchingWorkHours.startTime),
      toMinutes(matchingWorkHours.endTime),
    )
  ) {
    conflicts.push({
      type: "work_hours",
      title: `Overlaps work hours on ${DAY_LABELS[dayOfWeek]}`,
      detail: `${matchingWorkHours.startTime}-${matchingWorkHours.endTime}`,
      strength: "hard_constraint",
    });
  }

  for (const window of context.noScheduleWindows) {
    if (window.dayOfWeek !== dayOfWeek) {
      continue;
    }

    if (
      timeRangesOverlap(
        eventStartMinutes,
        eventEndMinutes,
        toMinutes(window.startTime),
        toMinutes(window.endTime),
      )
    ) {
      conflicts.push({
        type: "no_schedule_window",
        title: window.label || `No-schedule window on ${DAY_LABELS[dayOfWeek]}`,
        detail: `${window.startTime}-${window.endTime}`,
        strength: "hard_constraint",
      });
    }
  }

  if (context.recoveryDays.includes(dayOfWeek)) {
    conflicts.push({
      type: "recovery_day",
      title: `Recovery day on ${DAY_LABELS[dayOfWeek]}`,
      detail: "Saved as a protected lighter or no-work day.",
      strength: "hard_constraint",
    });
  }

  if (context.maxWorkEndTime && eventEndMinutes > toMinutes(context.maxWorkEndTime)) {
    conflicts.push({
      type: "latest_work_end",
      title: "Ends later than your preferred cutoff",
      detail: `Saved limit: ${context.maxWorkEndTime}`,
      strength: "hard_constraint",
    });
  }

  if (
    context.sleepWindow &&
    overlapsSleepWindow(eventStartMinutes, eventEndMinutes, context.sleepWindow)
  ) {
    conflicts.push({
      type: "sleep_window",
      title: "Overlaps your saved sleep window",
      detail: `${context.sleepWindow.startTime}-${context.sleepWindow.endTime}`,
      strength: "hard_constraint",
    });
  }

  return dedupeConflicts(conflicts);
}

async function getOrCreateSchedulingContextRow(
  userId: string,
  db: DatabaseExecutor,
): Promise<UserSchedulingContextRow> {
  await db.query(
    `
      insert into user_scheduling_contexts (
        user_id,
        work_hours,
        no_schedule_windows,
        preferred_work_periods,
        recovery_days,
        additional_notes
      )
      values (
        $1,
        $2::jsonb,
        '[]'::jsonb,
        '[]'::jsonb,
        '[]'::jsonb,
        ''
      )
      on conflict (user_id) do nothing
    `,
    [userId, JSON.stringify(createDefaultWorkHours())],
  );

  const result = await db.query<UserSchedulingContextRow>(
    `
      select
        user_id,
        work_hours,
        no_schedule_windows,
        sleep_window,
        max_work_end_time,
        preferred_focus_block_minutes,
        preferred_work_periods,
        recovery_days,
        additional_notes,
        updated_at
      from user_scheduling_contexts
      where user_id = $1
      limit 1
    `,
    [userId],
  );

  const contextRow = result.rows[0];

  if (!contextRow) {
    throw new Error("Failed to load user scheduling context.");
  }

  return contextRow;
}

async function listSchedulingSuggestionRows(
  userId: string,
  statuses: SchedulingPreferenceRuleStatus[],
  db: DatabaseExecutor,
) {
  const result = await db.query<SchedulingSuggestionRow>(
    `
      select
        id,
        user_id,
        kind,
        title,
        detail,
        source,
        strength,
        status,
        confidence,
        context_patch,
        metadata,
        created_at,
        updated_at
      from scheduling_preference_suggestions
      where user_id = $1
        and status = any($2::text[])
      order by created_at desc
    `,
    [userId, statuses],
  );

  return result.rows;
}

async function getSchedulingSuggestionRow(
  userId: string,
  suggestionId: string,
  db: DatabaseExecutor,
) {
  const result = await db.query<SchedulingSuggestionRow>(
    `
      select
        id,
        user_id,
        kind,
        title,
        detail,
        source,
        strength,
        status,
        confidence,
        context_patch,
        metadata,
        created_at,
        updated_at
      from scheduling_preference_suggestions
      where id = $1 and user_id = $2
      limit 1
    `,
    [suggestionId, userId],
  );

  const suggestionRow = result.rows[0];
  return suggestionRow ?? null;
}

async function syncDerivedSuggestionsFromNotes(
  userId: string,
  context: UserSchedulingContextRecord,
  db: DatabaseExecutor,
) {
  const inferredSuggestions = inferSuggestionsFromAdditionalNotes(context);

  if (inferredSuggestions.length === 0) {
    return;
  }

  const existingRows = await listSchedulingSuggestionRows(
    userId,
    ["suggested", "active", "dismissed"],
    db,
  );
  const existingKeys = new Set(
    existingRows.map((row) => `${row.kind}:${row.title.toLowerCase()}`),
  );

  for (const suggestion of inferredSuggestions) {
    const key = `${suggestion.kind}:${suggestion.title.toLowerCase()}`;

    if (existingKeys.has(key)) {
      continue;
    }

    await db.query(
      `
        insert into scheduling_preference_suggestions (
          user_id,
          kind,
          title,
          detail,
          source,
          strength,
          status,
          confidence,
          context_patch,
          metadata
        )
        values (
          $1,
          $2,
          $3,
          $4,
          'derived',
          $5,
          'suggested',
          $6,
          $7::jsonb,
          $8::jsonb
        )
      `,
      [
        userId,
        suggestion.kind,
        suggestion.title,
        suggestion.detail,
        suggestion.strength,
        suggestion.confidence,
        JSON.stringify(suggestion.contextPatch),
        JSON.stringify({
          origin: "freeform_notes_parser",
        }),
      ],
    );
  }
}

function mapUserSchedulingContext(
  row: UserSchedulingContextRow,
  acceptedDerivedRules: SchedulingSuggestionRow[],
): UserSchedulingContextRecord {
  const workHours = normalizeWorkHours(row.work_hours);
  const noScheduleWindows = normalizeNoScheduleWindows(row.no_schedule_windows);
  const sleepWindow = normalizeSleepWindow(row.sleep_window);
  const maxWorkEndTime = isTimeString(row.max_work_end_time) ? row.max_work_end_time : null;
  const preferredFocusBlockMinutes =
    typeof row.preferred_focus_block_minutes === "number" &&
    row.preferred_focus_block_minutes > 0
      ? row.preferred_focus_block_minutes
      : null;
  const preferredWorkPeriods = normalizePreferredWorkPeriods(row.preferred_work_periods);
  const recoveryDays = normalizeRecoveryDays(row.recovery_days);
  const additionalNotes = row.additional_notes.trim();
  const derivedRules = acceptedDerivedRules
    .map(mapSchedulingSuggestion)
    .filter(shouldIncludeAcceptedDerivedRule);

  const syntheticRules = buildSyntheticUserRules({
    workHours,
    noScheduleWindows,
    sleepWindow,
    maxWorkEndTime,
    preferredFocusBlockMinutes,
    preferredWorkPeriods,
    recoveryDays,
  });
  const compiledSummary = buildCompiledSummary({
    workHours,
    noScheduleWindows,
    sleepWindow,
    maxWorkEndTime,
    preferredFocusBlockMinutes,
    preferredWorkPeriods,
    recoveryDays,
    additionalNotes,
    derivedRules,
  });

  return {
    workHours,
    noScheduleWindows,
    sleepWindow,
    maxWorkEndTime,
    preferredFocusBlockMinutes,
    preferredWorkPeriods,
    recoveryDays,
    additionalNotes,
    activeRules: [...syntheticRules, ...derivedRules],
    compiledSummary,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapSchedulingSuggestion(
  row: SchedulingSuggestionRow,
): SchedulingPreferenceRuleRecord {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    detail: row.detail,
    source: row.source,
    strength: row.strength,
    status: row.status,
    confidence: row.confidence,
    contextPatch: row.context_patch ?? {},
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapScheduleReflection(row: ScheduleReflectionRow | undefined): ScheduleReflectionRecord {
  if (!row) {
    throw new Error("Expected schedule reflection row.");
  }

  return {
    id: row.id,
    timeframeStart: formatDateOnly(row.timeframe_start),
    timeframeEnd: formatDateOnly(row.timeframe_end),
    userNarrative: row.user_narrative,
    extractedBlockers: getStringArray(row.extracted_blockers),
    effectiveConditions: getStringArray(row.effective_conditions),
    recurringPreferences: getStringArray(row.recurring_preferences),
    recommendedMemoryUpdates: getReflectionStrategySuggestions(
      row.recommended_memory_updates,
    ),
    createdAt: row.created_at.toISOString(),
  };
}

function formatDateOnly(value: Date | string) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : [];
}

function getReflectionStrategySuggestions(
  value: unknown,
): ScheduleReflectionStrategySuggestion[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return [];
        }

        const record = item as Record<string, unknown>;
        const title = typeof record.title === "string" ? record.title.trim() : "";
        const detail = typeof record.detail === "string" ? record.detail.trim() : "";
        const strength =
          record.strength === "hard_constraint" ||
          record.strength === "soft_preference"
            ? record.strength
            : "soft_preference";
        const confidence =
          record.confidence === "low" ||
          record.confidence === "medium" ||
          record.confidence === "high"
            ? record.confidence
            : "low";

        if (!title || !detail) {
          return [];
        }

        return [
          {
            title,
            detail,
            strength,
            confidence,
            obstacle:
              typeof record.obstacle === "string" && record.obstacle.trim()
                ? record.obstacle.trim()
                : null,
          },
        ];
      })
    : [];
}

function buildSyntheticUserRules(input: {
  workHours: WorkHoursRule[];
  noScheduleWindows: SchedulingTimeWindow[];
  sleepWindow: SleepWindow | null;
  maxWorkEndTime: string | null;
  preferredFocusBlockMinutes: number | null;
  preferredWorkPeriods: WorkPeriod[];
  recoveryDays: SchedulingDayOfWeek[];
}): SchedulingPreferenceRuleRecord[] {
  const rules: SchedulingPreferenceRuleRecord[] = [];

  for (const rule of input.workHours) {
    if (!rule.enabled) {
      continue;
    }

    rules.push({
      id: `user-work-hours-${rule.dayOfWeek}`,
      kind: "work_hours",
      title: `Avoid scheduling during work hours on ${DAY_LABELS[rule.dayOfWeek]}`,
      detail: `${rule.startTime}-${rule.endTime}`,
      source: "user",
      strength: "hard_constraint",
      status: "active",
      confidence: null,
      contextPatch: {},
      metadata: {},
      createdAt: "",
      updatedAt: "",
    });
  }

  for (const window of input.noScheduleWindows) {
    rules.push({
      id: `user-no-schedule-${window.id}`,
      kind: "no_schedule_window",
      title:
        window.label.trim().length > 0
          ? window.label.trim()
          : `Avoid this window on ${DAY_LABELS[window.dayOfWeek]}`,
      detail: `${window.startTime}-${window.endTime}`,
      source: "user",
      strength: "hard_constraint",
      status: "active",
      confidence: null,
      contextPatch: {},
      metadata: {},
      createdAt: "",
      updatedAt: "",
    });
  }

  if (input.sleepWindow) {
    rules.push({
      id: "user-sleep-window",
      kind: "sleep_window",
      title: "Protect sleep time",
      detail: `${input.sleepWindow.startTime}-${input.sleepWindow.endTime}`,
      source: "user",
      strength: "hard_constraint",
      status: "active",
      confidence: null,
      contextPatch: {},
      metadata: {},
      createdAt: "",
      updatedAt: "",
    });
  }

  if (input.maxWorkEndTime) {
    rules.push({
      id: "user-latest-work-end",
      kind: "latest_work_end",
      title: "Avoid scheduling work after",
      detail: input.maxWorkEndTime,
      source: "user",
      strength: "hard_constraint",
      status: "active",
      confidence: null,
      contextPatch: {},
      metadata: {},
      createdAt: "",
      updatedAt: "",
    });
  }

  if (input.preferredFocusBlockMinutes) {
    rules.push({
      id: "user-preferred-focus-block",
      kind: "preferred_focus_block",
      title: "Prefer focus blocks of",
      detail: `${input.preferredFocusBlockMinutes} minutes`,
      source: "user",
      strength: "soft_preference",
      status: "active",
      confidence: null,
      contextPatch: {},
      metadata: {},
      createdAt: "",
      updatedAt: "",
    });
  }

  for (const period of input.preferredWorkPeriods) {
    rules.push({
      id: `user-preferred-period-${period}`,
      kind: "preferred_work_period",
      title: "Prefer focused work in the",
      detail: WORK_PERIOD_LABELS[period],
      source: "user",
      strength: "soft_preference",
      status: "active",
      confidence: null,
      contextPatch: {},
      metadata: {},
      createdAt: "",
      updatedAt: "",
    });
  }

  for (const dayOfWeek of input.recoveryDays) {
    rules.push({
      id: `user-recovery-day-${dayOfWeek}`,
      kind: "recovery_day",
      title: `Keep ${DAY_LABELS[dayOfWeek]} lighter`,
      detail: "Protected as a recovery or no-work day.",
      source: "user",
      strength: "hard_constraint",
      status: "active",
      confidence: null,
      contextPatch: {},
      metadata: {},
      createdAt: "",
      updatedAt: "",
    });
  }

  return rules;
}

function inferSuggestionsFromAdditionalNotes(context: UserSchedulingContextRecord) {
  const suggestions: Array<{
    kind: SchedulingPreferenceRuleKind;
    title: string;
    detail: string;
    strength: "hard_constraint" | "soft_preference";
    confidence: RuleConfidence;
    contextPatch: Record<string, unknown>;
  }> = [];
  const notes = context.additionalNotes;

  if (!notes) {
    return suggestions;
  }

  if (!context.maxWorkEndTime) {
    const latestWorkEndTime = inferLatestWorkEndTimeFromNotes(notes);

    if (latestWorkEndTime) {
      suggestions.push({
        kind: "latest_work_end",
        title: "Avoid work late in the evening",
        detail: `Productiv noticed a possible preference to stop work after ${latestWorkEndTime}.`,
        strength: "hard_constraint",
        confidence: "low",
        contextPatch: {
          maxWorkEndTime: latestWorkEndTime,
        },
      });
    }
  }

  if (!context.preferredFocusBlockMinutes) {
    const focusBlockMinutes = inferFocusBlockMinutesFromNotes(notes);

    if (focusBlockMinutes) {
      suggestions.push({
        kind: "preferred_focus_block",
        title: "Prefer one-hour focus blocks",
        detail: `Productiv noticed that ${focusBlockMinutes}-minute blocks may fit how you like to work.`,
        strength: "soft_preference",
        confidence: "medium",
        contextPatch: {
          preferredFocusBlockMinutes: focusBlockMinutes,
        },
      });
    }
  }

  if (!context.workHours.some((rule) => rule.enabled)) {
    const weekdayWorkHours = inferWeekdayWorkHoursFromNotes(notes);

    if (weekdayWorkHours) {
      suggestions.push({
        kind: "work_hours",
        title: "Protect weekday work hours",
        detail: `Productiv noticed a possible weekday work window of ${weekdayWorkHours.startTime}-${weekdayWorkHours.endTime}.`,
        strength: "hard_constraint",
        confidence: "low",
        contextPatch: {
          workHours: createDefaultWorkHours().map((rule) =>
            rule.dayOfWeek >= 1 && rule.dayOfWeek <= 5
              ? {
                  ...rule,
                  enabled: true,
                  startTime: weekdayWorkHours.startTime,
                  endTime: weekdayWorkHours.endTime,
                }
              : rule,
          ),
        },
      });
    }
  }

  return suggestions;
}

function buildCompiledSummary(input: {
  workHours: WorkHoursRule[];
  noScheduleWindows: SchedulingTimeWindow[];
  sleepWindow: SleepWindow | null;
  maxWorkEndTime: string | null;
  preferredFocusBlockMinutes: number | null;
  preferredWorkPeriods: WorkPeriod[];
  recoveryDays: SchedulingDayOfWeek[];
  additionalNotes: string;
  derivedRules: SchedulingPreferenceRuleRecord[];
}) {
  const parts: string[] = [];
  const enabledWorkHours = input.workHours.filter((rule) => rule.enabled);

  if (enabledWorkHours.length > 0) {
    parts.push(
      `Protected work hours: ${enabledWorkHours
        .map((rule) => `${DAY_LABELS[rule.dayOfWeek]} ${rule.startTime}-${rule.endTime}`)
        .join(", ")}.`,
    );
  }

  if (input.noScheduleWindows.length > 0) {
    parts.push(
      `No-schedule windows: ${input.noScheduleWindows
        .map((window) => {
          const label = window.label.trim().length > 0 ? `${window.label} ` : "";
          return `${label}${DAY_LABELS[window.dayOfWeek]} ${window.startTime}-${window.endTime}`;
        })
        .join(", ")}.`,
    );
  }

  if (input.sleepWindow) {
    parts.push(
      `Protect sleep window from ${input.sleepWindow.startTime} to ${input.sleepWindow.endTime}.`,
    );
  }

  if (input.maxWorkEndTime) {
    parts.push(`Avoid scheduling focused work after ${input.maxWorkEndTime}.`);
  }

  if (input.preferredFocusBlockMinutes) {
    parts.push(
      `Preferred focus block length is ${input.preferredFocusBlockMinutes} minutes.`,
    );
  }

  if (input.preferredWorkPeriods.length > 0) {
    parts.push(
      `Preferred work periods: ${input.preferredWorkPeriods
        .map((period) => WORK_PERIOD_LABELS[period])
        .join(", ")}.`,
    );
  }

  if (input.recoveryDays.length > 0) {
    parts.push(
      `Protected recovery days: ${input.recoveryDays
        .map((dayOfWeek) => DAY_LABELS[dayOfWeek])
        .join(", ")}.`,
    );
  }

  if (input.derivedRules.length > 0) {
    parts.push(
      `Accepted derived habits: ${input.derivedRules
        .map(formatDerivedRuleForSummary)
        .join(", ")}.`,
    );
  }

  if (input.additionalNotes.length > 0) {
    parts.push(`Additional user notes: ${input.additionalNotes}`);
  }

  return parts.join(" ");
}

function formatDerivedRuleForSummary(rule: SchedulingPreferenceRuleRecord) {
  const scopeLabel = formatRuleScope(rule.metadata);
  const detail = rule.detail ? ` (${rule.detail})` : "";
  return `${scopeLabel}${rule.title}${detail}`;
}

function formatRuleScope(metadata: Record<string, unknown>) {
  const scope = getMetadataString(metadata, "applicabilityScope");

  if (!scope || scope === "global") {
    return "";
  }

  const domain = getMetadataString(metadata, "domain");
  const goalTitle = getMetadataString(metadata, "goalTitle");
  const activityTitle = getMetadataString(metadata, "activityTitle");
  const temporalScope = getMetadataString(metadata, "temporalScope");

  if (scope === "domain" && domain) {
    return `[domain: ${domain}] `;
  }

  if (scope === "goal" && goalTitle) {
    return `[goal: ${goalTitle}] `;
  }

  if (scope === "activity" && activityTitle) {
    return `[activity: ${activityTitle}] `;
  }

  if (scope === "temporary" && temporalScope) {
    return `[temporary: ${temporalScope}] `;
  }

  return `[${scope}] `;
}

function buildScopedSchedulingSuggestionKey(input: {
  kind: SchedulingPreferenceRuleKind;
  title: string;
  metadata: Record<string, unknown>;
}) {
  return [
    input.kind,
    normalizeDedupeValue(input.title),
    normalizeDedupeValue(
      getMetadataString(input.metadata, "applicabilityScope") ?? "global",
    ),
    normalizeDedupeValue(getMetadataString(input.metadata, "domain") ?? ""),
    normalizeDedupeValue(getMetadataString(input.metadata, "goalId") ?? ""),
    normalizeDedupeValue(getMetadataString(input.metadata, "goalTitle") ?? ""),
    normalizeDedupeValue(getMetadataString(input.metadata, "activityTitle") ?? ""),
    normalizeDedupeValue(getMetadataString(input.metadata, "temporalScope") ?? ""),
  ].join(":");
}

function shouldCreateDerivedSuggestionFromCandidate(
  candidate: SchedulingPreferenceCandidate,
) {
  if (candidate.applicabilityScope === "temporary") {
    return false;
  }

  if (candidate.confidence === "low") {
    return false;
  }

  const evidenceText = [
    candidate.title,
    candidate.detail,
    candidate.evidence ?? "",
    candidate.temporalScope ?? "",
  ]
    .join(" ")
    .toLowerCase();

  if (!hasDurableSchedulingCue(evidenceText)) {
    return false;
  }

  return !looksLikeOneOffSchedulingPlacement(evidenceText);
}

function hasDurableSchedulingCue(value: string) {
  return /\b(always|usually|generally|normally|prefer|preferred|best|every|each|daily|weekly|weekdays?|weekends?|mornings?|afternoons?|evenings?|nightly|recurring|routine|habit|ongoing|regular|consistent|consistently|avoid|never|separate|space|same day|after waking|before lunch|after lunch|before work|after work|on mondays|on tuesdays|on wednesdays|on thursdays|on fridays|on saturdays|on sundays)\b/u.test(
    value,
  );
}

function looksLikeOneOffSchedulingPlacement(value: string) {
  if (
    !/\b(schedule|scheduled|scheduling|place|placed|block|blocked|add|added)\b/u.test(
      value,
    )
  ) {
    return false;
  }

  return !/\b(every|each|daily|weekly|weekdays?|weekends?|recurring|routine|habit|ongoing|regular|usually|prefer|preferred|always|on mondays|on tuesdays|on wednesdays|on thursdays|on fridays|on saturdays|on sundays)\b/u.test(
    value,
  );
}

function getMetadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeDedupeValue(value: string) {
  return value.toLowerCase().replace(/\s+/gu, " ").trim();
}

function inferLatestWorkEndTimeFromNotes(notes: string) {
  const explicitMatch = notes.match(
    /(avoid|don'?t|do not|not)\s+(?:like to\s+)?work after\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i,
  );

  if (!explicitMatch) {
    return null;
  }

  return normalizeImplicitMeridiemTime(
    explicitMatch[2],
    explicitMatch[3],
    explicitMatch[4],
    "pm",
  );
}

function inferFocusBlockMinutesFromNotes(notes: string) {
  const oneHourMatch = notes.match(/\b(1 hour|one hour|60 minute)\b/i);
  const mentionsBlock = /block|session|chunk/i.test(notes);

  if (oneHourMatch && mentionsBlock) {
    return 60;
  }

  return null;
}

function inferWeekdayWorkHoursFromNotes(notes: string) {
  if (!/weekday/i.test(notes)) {
    return null;
  }

  const match = notes.match(
    /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i,
  );

  if (!match) {
    return null;
  }

  const startTime = normalizeImplicitMeridiemTime(
    match[1],
    match[2],
    match[3],
    "am",
  );
  const endTime = normalizeImplicitMeridiemTime(
    match[4],
    match[5],
    match[6],
    "pm",
  );

  if (!startTime || !endTime || toMinutes(endTime) <= toMinutes(startTime)) {
    return null;
  }

  return {
    startTime,
    endTime,
  };
}

function normalizeImplicitMeridiemTime(
  hourValue: string | undefined,
  minuteValue: string | undefined,
  meridiem: string | undefined,
  assumedMeridiem: "am" | "pm",
) {
  if (!hourValue) {
    return null;
  }

  const hour = Number.parseInt(hourValue, 10);
  const minute = Number.parseInt(minuteValue ?? "0", 10);
  const nextMeridiem = meridiem?.toLowerCase() === "am" || meridiem?.toLowerCase() === "pm"
    ? meridiem.toLowerCase()
    : assumedMeridiem;
  const normalizedHour =
    hour === 12 ? (nextMeridiem === "pm" ? 12 : 0) : nextMeridiem === "pm" ? hour + 12 : hour;

  return `${String(normalizedHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

async function upsertUserContextMemoryCache(
  userId: string,
  context: UserSchedulingContextRecord,
  db: DatabaseExecutor,
) {
  const compiled = buildCompiledSchedulingContext(context);
  const preferredWorkWindows = compiled.softPreferences;
  const noGoTimes = compiled.hardConstraints;
  const helpfulInterventions = [...compiled.softPreferences, ...compiled.acceptedDerivedHabits];

  await db.query(
    `
      insert into user_context_memory (
        user_id,
        priority_summary,
        preferred_work_windows,
        no_go_times,
        recurring_blockers,
        helpful_interventions,
        raw_summary,
        updated_at
      )
      values (
        $1,
        '[]'::jsonb,
        $2::jsonb,
        $3::jsonb,
        '[]'::jsonb,
        $4::jsonb,
        $5,
        timezone('utc', now())
      )
      on conflict (user_id) do update
      set
        preferred_work_windows = excluded.preferred_work_windows,
        no_go_times = excluded.no_go_times,
        helpful_interventions = excluded.helpful_interventions,
        raw_summary = excluded.raw_summary,
        updated_at = timezone('utc', now())
    `,
    [
      userId,
      JSON.stringify(preferredWorkWindows),
      JSON.stringify(noGoTimes),
      JSON.stringify(helpfulInterventions),
      compiled.promptSummary,
    ],
  );
}

function shouldIncludeAcceptedDerivedRule(rule: SchedulingPreferenceRuleRecord) {
  if (rule.status !== "active" || rule.source !== "derived") {
    return false;
  }

  return Object.keys(rule.contextPatch).length === 0 || rule.kind === "custom";
}

function createDefaultWorkHours(): WorkHoursRule[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek: dayOfWeek as SchedulingDayOfWeek,
    enabled: false,
    startTime: DEFAULT_WORK_DAY_START,
    endTime: DEFAULT_WORK_DAY_END,
  }));
}

function normalizeWorkHours(value: unknown): WorkHoursRule[] {
  const input = Array.isArray(value) ? value : [];
  const byDay = new Map<SchedulingDayOfWeek, WorkHoursRule>();

  for (const entry of input) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }

    const dayOfWeek = getDayOfWeek((entry as { dayOfWeek?: unknown }).dayOfWeek);
    if (dayOfWeek === null) {
      continue;
    }

    const startTime = getTimeOrFallback(
      (entry as { startTime?: unknown }).startTime,
      DEFAULT_WORK_DAY_START,
    );
    const endTime = getTimeOrFallback(
      (entry as { endTime?: unknown }).endTime,
      DEFAULT_WORK_DAY_END,
    );

    byDay.set(dayOfWeek, {
      dayOfWeek,
      enabled: Boolean((entry as { enabled?: unknown }).enabled),
      startTime,
      endTime: toMinutes(endTime) > toMinutes(startTime) ? endTime : DEFAULT_WORK_DAY_END,
    });
  }

  return createDefaultWorkHours().map(
    (defaultRule) => byDay.get(defaultRule.dayOfWeek) ?? defaultRule,
  );
}

function normalizeNoScheduleWindows(value: unknown): SchedulingTimeWindow[] {
  const input = Array.isArray(value) ? value : [];

  return input.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }

    const dayOfWeek = getDayOfWeek((entry as { dayOfWeek?: unknown }).dayOfWeek);
    const startTime = getTimeOrNull((entry as { startTime?: unknown }).startTime);
    const endTime = getTimeOrNull((entry as { endTime?: unknown }).endTime);

    if (dayOfWeek === null || !startTime || !endTime || toMinutes(endTime) <= toMinutes(startTime)) {
      return [];
    }

    const rawId = (entry as { id?: unknown }).id;
    const label = typeof (entry as { label?: unknown }).label === "string"
      ? (entry as { label?: string }).label?.trim() ?? ""
      : "";

    return [
      {
        id:
          typeof rawId === "string" && rawId.trim().length > 0
            ? rawId.trim()
            : `window-${index}`,
        dayOfWeek,
        startTime,
        endTime,
        label,
      },
    ];
  });
}

function normalizeSleepWindow(value: unknown): SleepWindow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const startTime = getTimeOrNull((value as { startTime?: unknown }).startTime);
  const endTime = getTimeOrNull((value as { endTime?: unknown }).endTime);

  if (!startTime || !endTime) {
    return null;
  }

  return {
    startTime,
    endTime,
  };
}

function normalizePreferredWorkPeriods(value: unknown): WorkPeriod[] {
  const input = Array.isArray(value) ? value : [];
  const allowed = new Set<WorkPeriod>(["morning", "afternoon", "evening"]);

  return Array.from(
    new Set(
      input.filter((entry): entry is WorkPeriod =>
        typeof entry === "string" && allowed.has(entry as WorkPeriod),
      ),
    ),
  );
}

function normalizeRecoveryDays(value: unknown): SchedulingDayOfWeek[] {
  const input = Array.isArray(value) ? value : [];

  return Array.from(
    new Set(
      input.flatMap((entry) => {
        const dayOfWeek = getDayOfWeek(entry);
        return dayOfWeek === null ? [] : [dayOfWeek];
      }),
    ),
  ).sort();
}

function getDayOfWeek(value: unknown): SchedulingDayOfWeek | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6
    ? (value as SchedulingDayOfWeek)
    : null;
}

function getTimeOrFallback(value: unknown, fallback: string) {
  return isTimeString(value) ? value : fallback;
}

function getTimeOrNull(value: unknown) {
  return isTimeString(value) ? value : null;
}

function isTimeString(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/u.test(value);
}

function toMinutes(time: string) {
  const [hoursPart, minutesPart] = time.split(":");
  const hours = Number.parseInt(hoursPart ?? "0", 10);
  const minutes = Number.parseInt(minutesPart ?? "0", 10);
  return hours * 60 + minutes;
}

function dateToMinutes(value: Date) {
  return value.getHours() * 60 + value.getMinutes();
}

function timeRangesOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
) {
  return startA < endB && endA > startB;
}

function overlapsSleepWindow(
  eventStartMinutes: number,
  eventEndMinutes: number,
  sleepWindow: SleepWindow,
) {
  const sleepStart = toMinutes(sleepWindow.startTime);
  const sleepEnd = toMinutes(sleepWindow.endTime);

  if (sleepEnd > sleepStart) {
    return timeRangesOverlap(eventStartMinutes, eventEndMinutes, sleepStart, sleepEnd);
  }

  return (
    eventStartMinutes < sleepEnd ||
    eventEndMinutes > sleepStart ||
    timeRangesOverlap(eventStartMinutes, eventEndMinutes, sleepStart, 24 * 60)
  );
}

function dedupeConflicts(conflicts: SchedulingConflict[]) {
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

function hasMeaningfulContextPatch(value: Record<string, unknown> | null) {
  return !!value && Object.keys(value).length > 0;
}

function applyContextPatchToRow(
  row: UserSchedulingContextRow,
  patch: Record<string, unknown>,
): {
  workHours?: WorkHoursRule[] | undefined;
  noScheduleWindows?: SchedulingTimeWindow[] | undefined;
  sleepWindow?: SleepWindow | null | undefined;
  maxWorkEndTime?: string | null | undefined;
  preferredFocusBlockMinutes?: number | null | undefined;
  preferredWorkPeriods?: WorkPeriod[] | undefined;
  recoveryDays?: SchedulingDayOfWeek[] | undefined;
  additionalNotes?: string | undefined;
} {
  const nextPatch: {
    workHours?: WorkHoursRule[] | undefined;
    noScheduleWindows?: SchedulingTimeWindow[] | undefined;
    sleepWindow?: SleepWindow | null | undefined;
    maxWorkEndTime?: string | null | undefined;
    preferredFocusBlockMinutes?: number | null | undefined;
    preferredWorkPeriods?: WorkPeriod[] | undefined;
    recoveryDays?: SchedulingDayOfWeek[] | undefined;
    additionalNotes?: string | undefined;
  } = {};

  if ("workHours" in patch) {
    nextPatch.workHours = normalizeWorkHours(patch.workHours);
  }

  if ("noScheduleWindows" in patch) {
    nextPatch.noScheduleWindows = normalizeNoScheduleWindows(patch.noScheduleWindows);
  }

  if ("sleepWindow" in patch) {
    nextPatch.sleepWindow = normalizeSleepWindow(patch.sleepWindow);
  }

  if ("maxWorkEndTime" in patch) {
    nextPatch.maxWorkEndTime = getTimeOrNull(patch.maxWorkEndTime);
  }

  if ("preferredFocusBlockMinutes" in patch) {
    nextPatch.preferredFocusBlockMinutes =
      typeof patch.preferredFocusBlockMinutes === "number" &&
      patch.preferredFocusBlockMinutes > 0
        ? patch.preferredFocusBlockMinutes
        : null;
  }

  if ("preferredWorkPeriods" in patch) {
    nextPatch.preferredWorkPeriods = normalizePreferredWorkPeriods(
      patch.preferredWorkPeriods,
    );
  }

  if ("recoveryDays" in patch) {
    nextPatch.recoveryDays = normalizeRecoveryDays(patch.recoveryDays);
  }

  if ("additionalNotes" in patch && typeof patch.additionalNotes === "string") {
    const existingNotes = row.additional_notes.trim();
    const nextNotes = patch.additionalNotes.trim();
    nextPatch.additionalNotes =
      existingNotes.length > 0 && nextNotes.length > 0
        ? `${existingNotes}\n${nextNotes}`
        : nextNotes || existingNotes;
  }

  return nextPatch;
}
