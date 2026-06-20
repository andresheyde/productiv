import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";

import {
  defaultUserCalendarPreferences,
  getIncludedCalendarIdsForUser,
  getOrCreateUserCalendarPreferences,
  getUserCalendarPreferencesOrDefault,
  isCalendarPreferencesStorageUnavailable,
  patchUserCalendarPreferences,
} from "./calendar-preferences.repository.ts";

class FakeCalendarPreferencesDb {
  calls: Array<{ text: string; params?: unknown[] }> = [];
  row: QueryResultRow | null = null;

  async query<T extends QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    const call: { text: string; params?: unknown[] } = { text };

    if (params !== undefined) {
      call.params = params;
    }

    this.calls.push(call);

    if (/select\s+included_calendar_ids/u.test(text)) {
      return queryResult((this.row ? [this.row] : []) as T[]);
    }

    if (/update user_calendar_preferences/u.test(text)) {
      return queryResult((this.row ? [this.row] : []) as T[]);
    }

    return queryResult([] as T[]);
  }
}

class MissingCalendarPreferencesTableDb {
  async query<T extends QueryResultRow>(): Promise<QueryResult<T>> {
    throw Object.assign(
      new Error('relation "user_calendar_preferences" does not exist'),
      { code: "42P01" },
    );
  }
}

test("getOrCreateUserCalendarPreferences normalizes stored calendar ids", async () => {
  const db = new FakeCalendarPreferencesDb();
  db.row = calendarPreferencesRow({
    includedCalendarIds: ["calendar-1", " calendar-2 ", "", "calendar-1", 42],
  });

  const preferences = await getOrCreateUserCalendarPreferences("user-1", db);

  assert.deepEqual(preferences.includedCalendarIds, [
    "calendar-1",
    "calendar-2",
  ]);
  assert.equal(preferences.updatedAt, "2026-06-20T12:00:00.000Z");
  assert.match(db.calls[0]?.text ?? "", /insert into user_calendar_preferences/u);
  assert.deepEqual(db.calls[0]?.params, ["user-1"]);
});

test("calendar preference reads fall back to all calendars when the optional table is missing", async () => {
  const db = new MissingCalendarPreferencesTableDb();

  assert.equal(
    isCalendarPreferencesStorageUnavailable(
      Object.assign(new Error("missing"), { code: "42P01" }),
    ),
    true,
  );
  assert.deepEqual(
    await getUserCalendarPreferencesOrDefault("user-1", db),
    defaultUserCalendarPreferences,
  );
  assert.equal(await getIncludedCalendarIdsForUser("user-1", db), null);
});

test("calendar preference updates still fail when storage is unavailable", async () => {
  const db = new MissingCalendarPreferencesTableDb();

  await assert.rejects(
    () =>
      patchUserCalendarPreferences(
        {
          userId: "user-1",
          includedCalendarIds: ["calendar-1"],
        },
        db,
      ),
    /user_calendar_preferences/u,
  );
});

function calendarPreferencesRow(input: {
  includedCalendarIds: unknown;
}): QueryResultRow {
  return {
    included_calendar_ids: input.includedCalendarIds,
    updated_at: new Date("2026-06-20T12:00:00.000Z"),
  };
}

function queryResult<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return {
    command: "SELECT",
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows,
  };
}
