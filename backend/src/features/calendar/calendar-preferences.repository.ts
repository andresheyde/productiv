import type { QueryResult, QueryResultRow } from "pg";

import { getRuntimePool } from "../../shared/db/postgres.ts";

type DatabaseExecutor = {
  query: <T extends QueryResultRow>(
    text: string,
    params?: unknown[],
  ) => Promise<QueryResult<T>>;
};

type UserCalendarPreferencesRow = {
  included_calendar_ids: unknown;
  updated_at: Date;
};

export type UserCalendarPreferencesRecord = {
  includedCalendarIds: string[] | null;
  updatedAt: string;
};

export function getCalendarPreferencesExecutor(): DatabaseExecutor {
  return getRuntimePool();
}

export async function getOrCreateUserCalendarPreferences(
  userId: string,
  db: DatabaseExecutor = getCalendarPreferencesExecutor(),
): Promise<UserCalendarPreferencesRecord> {
  await db.query(
    `
      insert into user_calendar_preferences (user_id, included_calendar_ids)
      values ($1, null)
      on conflict (user_id) do nothing
    `,
    [userId],
  );

  const result = await db.query<UserCalendarPreferencesRow>(
    `
      select
        included_calendar_ids,
        updated_at
      from user_calendar_preferences
      where user_id = $1
      limit 1
    `,
    [userId],
  );

  const row = result.rows[0];

  if (!row) {
    throw new Error("Failed to load calendar preferences.");
  }

  return mapUserCalendarPreferences(row);
}

export async function patchUserCalendarPreferences(
  input: {
    userId: string;
    includedCalendarIds: string[] | null;
  },
  db: DatabaseExecutor = getCalendarPreferencesExecutor(),
): Promise<UserCalendarPreferencesRecord> {
  await getOrCreateUserCalendarPreferences(input.userId, db);

  const normalizedIds = input.includedCalendarIds
    ? normalizeCalendarIds(input.includedCalendarIds)
    : null;

  const result = await db.query<UserCalendarPreferencesRow>(
    `
      update user_calendar_preferences
      set
        included_calendar_ids = $1::jsonb,
        updated_at = timezone('utc', now())
      where user_id = $2
      returning
        included_calendar_ids,
        updated_at
    `,
    [normalizedIds ? JSON.stringify(normalizedIds) : null, input.userId],
  );

  const row = result.rows[0];

  if (!row) {
    throw new Error("Failed to update calendar preferences.");
  }

  return mapUserCalendarPreferences(row);
}

export async function getIncludedCalendarIdsForUser(
  userId: string,
  db: DatabaseExecutor = getCalendarPreferencesExecutor(),
): Promise<string[] | null> {
  const preferences = await getOrCreateUserCalendarPreferences(userId, db);
  return preferences.includedCalendarIds;
}

function mapUserCalendarPreferences(
  row: UserCalendarPreferencesRow,
): UserCalendarPreferencesRecord {
  return {
    includedCalendarIds: normalizeCalendarIds(row.included_calendar_ids),
    updatedAt: row.updated_at.toISOString(),
  };
}

function normalizeCalendarIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  );
}
