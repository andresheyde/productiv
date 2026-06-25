import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";

import {
  buildCompiledSchedulingContext,
  createDerivedSchedulingSuggestionsFromCandidates,
  dismissDerivedSchedulingSuggestion,
  getOrCreateUserSchedulingContext,
} from "./scheduling-context.repository.ts";
import type { SchedulingPreferenceCandidate } from "./scheduling-context.types.ts";

class FakeSchedulingDb {
  contextRow: QueryResultRow = {
    user_id: "user-1",
    work_hours: [],
    no_schedule_windows: [],
    sleep_window: null,
    max_work_end_time: null,
    preferred_focus_block_minutes: null,
    preferred_work_periods: [],
    recovery_days: [],
    additional_notes: "",
    updated_at: new Date("2026-06-20T12:00:00.000Z"),
  };
  insertedRows: QueryResultRow[] = [];
  existingRows: QueryResultRow[] = [];
  memoryUpsertCount = 0;

  async query<T extends QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    if (/from scheduling_preference_suggestions/u.test(text)) {
      return queryResult(this.getSchedulingSuggestionRows(text, params) as T[]);
    }

    if (/insert into scheduling_preference_suggestions/u.test(text)) {
      const contextPatch = parseJsonObject(params?.[6]);
      const metadata = parseJsonObject(params?.[7]);
      const row = {
        id: `suggestion-${this.insertedRows.length + 1}`,
        user_id: params?.[0],
        kind: params?.[1],
        title: params?.[2],
        detail: params?.[3],
        source: "derived",
        strength: params?.[4],
        status: "suggested",
        confidence: params?.[5],
        context_patch: contextPatch,
        metadata,
        created_at: new Date("2026-06-20T12:00:00.000Z"),
        updated_at: new Date("2026-06-20T12:00:00.000Z"),
      };

      this.insertedRows.push(row);
      return queryResult([row] as unknown as T[]);
    }

    if (/update scheduling_preference_suggestions/u.test(text)) {
      const suggestionId = params?.[0];
      const userId = params?.[1];

      this.existingRows = this.existingRows.map((row) =>
        row.id === suggestionId && row.user_id === userId
          ? {
              ...row,
              status: "dismissed",
              updated_at: new Date("2026-06-20T13:00:00.000Z"),
            }
          : row,
      );

      return queryResult([] as T[]);
    }

    if (/insert into user_scheduling_contexts/u.test(text)) {
      return queryResult([] as T[]);
    }

    if (/from user_scheduling_contexts/u.test(text)) {
      return queryResult([this.contextRow] as T[]);
    }

    if (/insert into user_context_memory/u.test(text)) {
      this.memoryUpsertCount += 1;
      return queryResult([] as T[]);
    }

    throw new Error(`Unexpected query: ${text}`);
  }

  private getSchedulingSuggestionRows(text: string, params?: unknown[]) {
    if (/where id = \$1 and user_id = \$2/u.test(text)) {
      const suggestionId = params?.[0];
      const userId = params?.[1];

      return this.existingRows.filter(
        (row) => row.id === suggestionId && row.user_id === userId,
      );
    }

    if (/status = any\(\$2::text\[\]\)/u.test(text)) {
      const userId = params?.[0];
      const statuses = Array.isArray(params?.[1]) ? params[1] : [];

      return this.existingRows.filter(
        (row) => row.user_id === userId && statuses.includes(row.status),
      );
    }

    return this.existingRows;
  }
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

test("createDerivedSchedulingSuggestionsFromCandidates preserves applicability scope metadata", async () => {
  const db = new FakeSchedulingDb();
  const candidates: SchedulingPreferenceCandidate[] = [
    {
      kind: "custom",
      title: "Avoid strength and plyo together",
      detail: "Keep heavy lifting and plyometrics on separate days.",
      strength: "hard_constraint",
      confidence: "high",
      applicabilityScope: "goal",
      domain: "fitness",
      goalTitle: "Dunk training",
      activityTitle: "plyometrics",
      temporalScope: null,
      evidence: "I don't want strength and plyo on the same day.",
    },
    {
      kind: "preferred_work_period",
      title: "Prefer morning focus",
      detail: "Morning blocks fit my energy best.",
      strength: "soft_preference",
      confidence: "medium",
      applicabilityScope: "global",
      domain: null,
      goalTitle: null,
      activityTitle: null,
      temporalScope: null,
      evidence: "I focus best in the morning.",
    },
  ];

  const suggestions = await createDerivedSchedulingSuggestionsFromCandidates(
    {
      userId: "user-1",
      candidates,
      origin: "planning_intake",
      threadId: "thread-1",
      messageId: "message-1",
      turnMode: "planning_intake",
      goalId: "goal-1",
      goalTitle: "Dunk training",
    },
    db,
  );

  assert.equal(suggestions.length, 2);
  assert.equal(suggestions[0]?.metadata.applicabilityScope, "goal");
  assert.equal(suggestions[0]?.metadata.goalId, "goal-1");
  assert.equal(suggestions[0]?.metadata.goalTitle, "Dunk training");
  assert.equal(suggestions[1]?.metadata.applicabilityScope, "global");
  assert.equal(suggestions[1]?.metadata.goalId, null);
  assert.equal(db.insertedRows.length, 2);
});

test("createDerivedSchedulingSuggestionsFromCandidates stores context patches for concrete availability", async () => {
  const db = new FakeSchedulingDb();
  const suggestions = await createDerivedSchedulingSuggestionsFromCandidates(
    {
      userId: "user-1",
      candidates: [
        {
          kind: "work_hours",
          title: "Protect weekday work hours",
          detail: "I work weekdays 9am-5pm.",
          strength: "hard_constraint",
          confidence: "high",
          applicabilityScope: "global",
          domain: null,
          goalTitle: null,
          activityTitle: null,
          temporalScope: "weekdays",
          evidence: "I work weekdays 9am-5pm.",
        },
        {
          kind: "sleep_window",
          title: "Protect sleep",
          detail: "I sleep nightly from 11pm-7am.",
          strength: "hard_constraint",
          confidence: "high",
          applicabilityScope: "global",
          domain: null,
          goalTitle: null,
          activityTitle: null,
          temporalScope: "nightly",
          evidence: "I sleep 11pm-7am.",
        },
        {
          kind: "no_schedule_window",
          title: "Protect Tuesday class",
          detail: "I have class every Tuesday 8am-11am.",
          strength: "hard_constraint",
          confidence: "high",
          applicabilityScope: "global",
          domain: null,
          goalTitle: null,
          activityTitle: null,
          temporalScope: "Tuesday",
          evidence: "I have class Tuesday 8am-11am.",
        },
      ],
      origin: "assistant_turn",
    },
    db,
  );
  const workHoursPatch = suggestions[0]?.contextPatch.workHours as
    | Array<{ dayOfWeek: number; enabled: boolean; startTime: string; endTime: string }>
    | undefined;

  assert.equal(suggestions.length, 3);
  assert.deepEqual(
    workHoursPatch
      ?.filter((rule) => rule.enabled)
      .map((rule) => [rule.dayOfWeek, rule.startTime, rule.endTime]),
    [
      [1, "09:00", "17:00"],
      [2, "09:00", "17:00"],
      [3, "09:00", "17:00"],
      [4, "09:00", "17:00"],
      [5, "09:00", "17:00"],
    ],
  );
  assert.deepEqual(suggestions[1]?.contextPatch.sleepWindow, {
    startTime: "23:00",
    endTime: "07:00",
  });
  assert.deepEqual(suggestions[2]?.contextPatch.noScheduleWindows, [
    {
      id: "derived-2-0800-1100",
      dayOfWeek: 2,
      startTime: "08:00",
      endTime: "11:00",
      label: "Class",
    },
  ]);
});

test("createDerivedSchedulingSuggestionsFromCandidates dedupes matching scoped candidates", async () => {
  const db = new FakeSchedulingDb();
  const candidate: SchedulingPreferenceCandidate = {
    kind: "custom",
    title: "Prefer recovery after basketball",
    detail: "Leave recovery space after basketball games.",
    strength: "soft_preference",
    confidence: "medium",
    applicabilityScope: "activity",
    domain: "fitness",
    goalTitle: null,
    activityTitle: "basketball",
    temporalScope: null,
    evidence: "I need recovery after basketball.",
  };

  const suggestions = await createDerivedSchedulingSuggestionsFromCandidates(
    {
      userId: "user-1",
      candidates: [candidate, candidate],
      origin: "assistant_turn",
    },
    db,
  );

  assert.equal(suggestions.length, 1);
  assert.equal(db.insertedRows.length, 1);
});

test("createDerivedSchedulingSuggestionsFromCandidates ignores one-off schedule placements", async () => {
  const db = new FakeSchedulingDb();
  const suggestions = await createDerivedSchedulingSuggestionsFromCandidates(
    {
      userId: "user-1",
      candidates: [
        {
          kind: "custom",
          title: "Apartment cleaning scheduled Sunday night",
          detail:
            "Schedule apartment cleaning for Sunday night around 8 PM based on expected arrival time.",
          strength: "soft_preference",
          confidence: "medium",
          applicabilityScope: "activity",
          domain: "home",
          goalTitle: null,
          activityTitle: "Apartment cleaning",
          temporalScope: "Sunday night",
          evidence: "Can you schedule apartment cleaning Sunday night?",
        },
        {
          kind: "preferred_work_period",
          title: "Workout sessions earlier in the day",
          detail:
            "Schedule weekday workout sessions at least one hour after waking and before lunch.",
          strength: "soft_preference",
          confidence: "medium",
          applicabilityScope: "goal",
          domain: "fitness",
          goalTitle: "Reduce body fat and increase strength",
          activityTitle: "Workout",
          temporalScope: "weekday mornings",
          evidence:
            "I want weekday workouts at least one hour after waking and before lunch.",
        },
      ],
      origin: "assistant_turn",
      goalId: "goal-1",
      goalTitle: "Reduce body fat and increase strength",
    },
    db,
  );

  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0]?.title, "Workout sessions earlier in the day");
  assert.equal(db.insertedRows.length, 1);
});

test("createDerivedSchedulingSuggestionsFromCandidates ignores temporary or low-confidence candidates", async () => {
  const db = new FakeSchedulingDb();
  const suggestions = await createDerivedSchedulingSuggestionsFromCandidates(
    {
      userId: "user-1",
      candidates: [
        {
          kind: "custom",
          title: "Use Tuesday afternoon this week",
          detail: "This week, Tuesday afternoon is open for studying.",
          strength: "soft_preference",
          confidence: "medium",
          applicabilityScope: "temporary",
          domain: "study",
          goalTitle: null,
          activityTitle: "Studying",
          temporalScope: "this week",
          evidence: "This week Tuesday afternoon is open.",
        },
        {
          kind: "preferred_work_period",
          title: "Maybe late evenings work",
          detail: "The user may prefer late evenings.",
          strength: "soft_preference",
          confidence: "low",
          applicabilityScope: "global",
          domain: null,
          goalTitle: null,
          activityTitle: null,
          temporalScope: null,
          evidence: "Ambiguous mention of evenings.",
        },
      ],
      origin: "assistant_turn",
    },
    db,
  );

  assert.equal(suggestions.length, 0);
  assert.equal(db.insertedRows.length, 0);
});

test("buildCompiledSchedulingContext exposes suggested derived rules as tentative preferences", () => {
  const compiled = buildCompiledSchedulingContext({
    workHours: [],
    noScheduleWindows: [],
    sleepWindow: null,
    maxWorkEndTime: null,
    preferredFocusBlockMinutes: null,
    preferredWorkPeriods: [],
    recoveryDays: [],
    additionalNotes: "",
    activeRules: [
      {
        id: "rule-active",
        kind: "custom",
        title: "Prefer recovery after basketball",
        detail: "Leave recovery space after basketball games.",
        source: "derived",
        strength: "soft_preference",
        status: "active",
        confidence: "medium",
        contextPatch: {},
        metadata: {},
        createdAt: "2026-06-20T12:00:00.000Z",
        updatedAt: "2026-06-20T12:00:00.000Z",
      },
    ],
    tentativeRules: [
      {
        id: "rule-suggested",
        kind: "custom",
        title: "Prefer lighter schedule drafts",
        detail: "Use more breathing room and buffers.",
        source: "derived",
        strength: "soft_preference",
        status: "suggested",
        confidence: "medium",
        contextPatch: {},
        metadata: {},
        createdAt: "2026-06-20T12:00:00.000Z",
        updatedAt: "2026-06-20T12:00:00.000Z",
      },
    ],
    compiledSummary: "",
    updatedAt: "2026-06-20T12:00:00.000Z",
  });

  assert.deepEqual(compiled.acceptedDerivedHabits, [
    "Prefer recovery after basketball: Leave recovery space after basketball games.",
  ]);
  assert.deepEqual(compiled.tentativeDerivedPreferences, [
    "Prefer lighter schedule drafts: Use more breathing room and buffers.",
  ]);
});

test("getOrCreateUserSchedulingContext keeps concrete suggested availability tentative", async () => {
  const db = new FakeSchedulingDb();
  db.existingRows = [
    {
      id: "suggestion-1",
      user_id: "user-1",
      kind: "work_hours",
      title: "Protect weekday work hours",
      detail: "I work weekdays 9am-5pm.",
      source: "derived",
      strength: "hard_constraint",
      status: "suggested",
      confidence: "high",
      context_patch: {
        workHours: [
          {
            dayOfWeek: 1,
            enabled: true,
            startTime: "09:00",
            endTime: "17:00",
          },
        ],
      },
      metadata: {},
      created_at: new Date("2026-06-20T12:00:00.000Z"),
      updated_at: new Date("2026-06-20T12:00:00.000Z"),
    },
  ];

  const context = await getOrCreateUserSchedulingContext("user-1", db);
  const compiled = buildCompiledSchedulingContext(context);

  assert.deepEqual(context.activeRules.map((rule) => rule.id), []);
  assert.deepEqual(
    context.tentativeRules.map((rule) => [rule.kind, rule.title]),
    [["work_hours", "Protect weekday work hours"]],
  );
  assert.deepEqual(compiled.tentativeDerivedPreferences, [
    "Protect weekday work hours: I work weekdays 9am-5pm.",
  ]);
});

test("dismissDerivedSchedulingSuggestion returns refreshed context without tentative rule", async () => {
  const db = new FakeSchedulingDb();
  db.existingRows = [
    {
      id: "suggestion-1",
      user_id: "user-1",
      kind: "custom",
      title: "Prefer lighter schedule drafts",
      detail: "Use more breathing room and buffers.",
      source: "derived",
      strength: "soft_preference",
      status: "suggested",
      confidence: "medium",
      context_patch: {},
      metadata: {},
      created_at: new Date("2026-06-20T12:00:00.000Z"),
      updated_at: new Date("2026-06-20T12:00:00.000Z"),
    },
  ];

  const result = await dismissDerivedSchedulingSuggestion(
    "user-1",
    "suggestion-1",
    db,
  );

  assert.equal(result.suggestion?.status, "dismissed");
  assert.deepEqual(result.context.tentativeRules, []);
  assert.equal(db.existingRows[0]?.status, "dismissed");
  assert.equal(db.memoryUpsertCount, 1);
});

function parseJsonObject(value: unknown) {
  if (typeof value !== "string") {
    return {};
  }

  const parsed = JSON.parse(value) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}
