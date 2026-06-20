import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";

import {
  createAssistantThread,
  deleteAssistantThread,
  getAssistantThreadById,
  listAssistantThreads,
  updateAssistantThreadState,
} from "./workspace.repository.ts";

class FakeAssistantThreadDb {
  calls: Array<{ text: string; params?: unknown[] }> = [];
  rows: QueryResultRow[] = [];

  async query<T extends QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    const call: { text: string; params?: unknown[] } = { text };

    if (params !== undefined) {
      call.params = params;
    }

    this.calls.push(call);

    if (/insert into assistant_threads/u.test(text)) {
      return queryResult([
        assistantThreadRow({
          id: "thread-created",
          title: String(params?.[1]),
        }),
      ] as T[]);
    }

    if (/delete from assistant_threads/u.test(text)) {
      return queryResult(
        (this.rows.length > 0
          ? [{ id: this.rows[0]?.id }]
          : []) as unknown as T[],
      );
    }

    if (/update assistant_threads/u.test(text)) {
      return queryResult([] as T[]);
    }

    return queryResult(this.rows as T[]);
  }
}

test("listAssistantThreads returns assistant threads ordered by the repository query", async () => {
  const db = new FakeAssistantThreadDb();
  db.rows = [
    assistantThreadRow({
      id: "thread-newer",
      title: "Newer chat",
      updatedAt: "2026-06-20T12:30:00.000Z",
    }),
    assistantThreadRow({
      id: "thread-older",
      title: "Older chat",
      updatedAt: "2026-06-20T12:00:00.000Z",
    }),
  ];

  const threads = await listAssistantThreads("user-1", db);

  assert.deepEqual(
    threads.map((thread) => thread.id),
    ["thread-newer", "thread-older"],
  );
  assert.equal(db.calls[0]?.params?.[0], "user-1");
  assert.match(db.calls[0]?.text ?? "", /order by updated_at desc/u);
});

test("createAssistantThread creates a new chat with the default title", async () => {
  const db = new FakeAssistantThreadDb();

  const thread = await createAssistantThread({ userId: "user-1" }, db);

  assert.equal(thread.id, "thread-created");
  assert.equal(thread.title, "New chat");
  assert.deepEqual(db.calls[0]?.params, ["user-1", "New chat"]);
});

test("getAssistantThreadById scopes the lookup by user and thread", async () => {
  const db = new FakeAssistantThreadDb();
  db.rows = [
    assistantThreadRow({
      id: "thread-1",
      title: "Focused chat",
    }),
  ];

  const thread = await getAssistantThreadById("user-1", "thread-1", db);

  assert.equal(thread?.id, "thread-1");
  assert.equal(thread?.title, "Focused chat");
  assert.deepEqual(db.calls[0]?.params, ["user-1", "thread-1"]);
});

test("deleteAssistantThread returns whether a thread was removed", async () => {
  const db = new FakeAssistantThreadDb();
  db.rows = [assistantThreadRow({ id: "thread-1" })];

  assert.equal(await deleteAssistantThread("user-1", "thread-1", db), true);
  assert.deepEqual(db.calls[0]?.params, ["user-1", "thread-1"]);

  db.rows = [];
  assert.equal(await deleteAssistantThread("user-1", "missing-thread", db), false);
});

test("updateAssistantThreadState can update only the deterministic thread title", async () => {
  const db = new FakeAssistantThreadDb();

  await updateAssistantThreadState(
    {
      threadId: "thread-1",
      title: "I need a better schedule",
    },
    db,
  );

  assert.match(db.calls[0]?.text ?? "", /title = \$1/u);
  assert.deepEqual(db.calls[0]?.params, [
    "I need a better schedule",
    "thread-1",
  ]);
});

function assistantThreadRow(input: {
  id: string;
  title?: string;
  updatedAt?: string;
}): QueryResultRow {
  return {
    id: input.id,
    title: input.title ?? "New chat",
    current_intent: "workspace_assistant",
    latest_context_summary: "",
    latest_artifact: {},
    created_at: new Date("2026-06-20T12:00:00.000Z"),
    updated_at: new Date(input.updatedAt ?? "2026-06-20T12:00:00.000Z"),
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
