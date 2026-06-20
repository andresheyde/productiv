import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";

const shouldRun = process.env.RUN_LOCAL_INTEGRATION_TESTS === "1";

if (!shouldRun) {
  test("local workflow integration", { skip: "Set RUN_LOCAL_INTEGRATION_TESTS=1" }, () => {});
} else {
  process.env.AI_PROVIDER = "deterministic";
  process.env.GOOGLE_INTEGRATION_PROVIDER = "local";
  process.env.DATABASE_SSL_MODE = "disable";

  const { app } = await import("../app.ts");
  const { closeDatabasePools } = await import("../shared/db/postgres.ts");

  after(async () => {
    await closeDatabasePools();
  });

  test("local auth, assistant, database, and calendar workflows run without external calls", async (t) => {
    const server = app.listen(0);
    t.after(
      () =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        }),
    );

    const address = server.address() as AddressInfo | null;

    if (!address) {
      throw new Error("Expected local test server to have an address.");
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authResponse = await fetch(`${baseUrl}/auth/google/callback?code=local`);
    assert.equal(authResponse.status, 200);

    const cookieHeader = authResponse.headers.get("set-cookie");
    const cookie = cookieHeader?.split(";")[0];

    if (!cookie) {
      throw new Error("Expected local auth response to set a session cookie.");
    }

    const sessionResponse = await fetch(`${baseUrl}/auth/session`, {
      headers: { Cookie: cookie },
    });
    assert.equal(sessionResponse.status, 200);
    const sessionBody = await sessionResponse.json() as {
      isAuthenticated?: boolean;
      user?: {
        avatarUrl?: string | null;
        email?: string | null;
        fullName?: string | null;
        id?: string;
      } | null;
    };
    assert.equal(sessionBody.isAuthenticated, true);
    assert.match(sessionBody.user?.id ?? "", /.+/u);
    assert.equal(sessionBody.user?.email, "local@productiv.test");
    assert.equal(sessionBody.user?.fullName, "Productiv Local User");
    assert.equal(sessionBody.user?.avatarUrl, null);

    const goalTurn = await postJson(baseUrl, "/assistant/turn", cookie, {
      message: "Create a goal to ship local testing",
    });
    assert.equal(goalTurn.status, 200);
    const goalTurnBody = await goalTurn.json() as LocalAssistantTurnResponse;
    assert.equal(goalTurnBody.sideEffects.goals.length, 1);

    const taskTurn = await postJson(baseUrl, "/assistant/turn", cookie, {
      message: "Add a task to review the local workflow tomorrow",
    });
    assert.equal(taskTurn.status, 200);
    const taskTurnBody = await taskTurn.json() as LocalAssistantTurnResponse;
    assert.equal(taskTurnBody.sideEffects.tasks.length, 1);

    const metricTurn = await postJson(baseUrl, "/assistant/turn", cookie, {
      message: "Create a metric to track 10 hours",
    });
    assert.equal(metricTurn.status, 200);
    const metricTurnBody = await metricTurn.json() as LocalAssistantTurnResponse;
    assert.equal(metricTurnBody.sideEffects.metrics.length, 1);

    const workLogTurn = await postJson(baseUrl, "/assistant/turn", cookie, {
      message: "I worked 2 hours on local testing",
    });
    assert.equal(workLogTurn.status, 200);
    const workLogTurnBody = await workLogTurn.json() as LocalAssistantTurnResponse;
    assert.equal(workLogTurnBody.sideEffects.workLogs.length, 1);
    assert.equal(workLogTurnBody.sideEffects.metricEntries.length, 1);

    const scheduleTurn = await postJson(baseUrl, "/assistant/turn", cookie, {
      message: "Schedule the first task tomorrow at 9am",
    });
    assert.equal(scheduleTurn.status, 200);
    const scheduleTurnBody = await scheduleTurn.json() as LocalAssistantTurnResponse;
    assert.equal(scheduleTurnBody.sideEffects.tasks.length, 1);
    assert.equal(scheduleTurnBody.sideEffects.tasks[0]?.status, "scheduled");
    assert.match(
      scheduleTurnBody.sideEffects.tasks[0]?.linkedCalendarEventId ?? "",
      /^productiv-local-calendar::local-event-/u,
    );

    const eventsResponse = await fetch(
      `${baseUrl}/calendar/events?${new URLSearchParams({
        startDate: toDateOnly(new Date()),
        endDate: toDateOnly(addDays(new Date(), 2)),
      })}`,
      { headers: { Cookie: cookie } },
    );
    assert.equal(eventsResponse.status, 200);
    const events = await eventsResponse.json() as Array<{ id?: string }>;
    assert.ok(events.some((event) => event.id?.startsWith("local-event-")));
  });
}

type LocalAssistantTurnResponse = {
  sideEffects: {
    goals: Array<Record<string, unknown>>;
    metricEntries: Array<Record<string, unknown>>;
    metrics: Array<Record<string, unknown>>;
    tasks: Array<{
      linkedCalendarEventId?: string | null;
      status?: string;
    }>;
    workLogs: Array<Record<string, unknown>>;
  };
};

function postJson(
  baseUrl: string,
  path: string,
  cookie: string,
  body: Record<string, unknown>,
) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify(body),
  });
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}
