import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";

import { createDerivedSchedulingSuggestionsFromCandidates } from "./scheduling-context.repository.ts";
import type { SchedulingPreferenceCandidate } from "./scheduling-context.types.ts";

class FakeSchedulingDb {
  insertedRows: QueryResultRow[] = [];
  existingRows: QueryResultRow[] = [];

  async query<T extends QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    if (/from scheduling_preference_suggestions/u.test(text)) {
      return queryResult(this.existingRows as T[]);
    }

    if (/insert into scheduling_preference_suggestions/u.test(text)) {
      const metadata = parseJsonObject(params?.[6]);
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
        context_patch: {},
        metadata,
        created_at: new Date("2026-06-20T12:00:00.000Z"),
        updated_at: new Date("2026-06-20T12:00:00.000Z"),
      };

      this.insertedRows.push(row);
      return queryResult([row] as unknown as T[]);
    }

    throw new Error(`Unexpected query: ${text}`);
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

function parseJsonObject(value: unknown) {
  if (typeof value !== "string") {
    return {};
  }

  const parsed = JSON.parse(value) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}
