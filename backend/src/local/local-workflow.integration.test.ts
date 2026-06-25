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
  const { getScheduleProposalById } = await import(
    "../features/assistant/schedule-proposals.repository.ts"
  );

  after(async () => {
    await closeDatabasePools();
  });

  test("local auth, assistant, database, and calendar workflows run without external calls", async (t) => {
    const { baseUrl, server } = await listenOnRandomPort();
    t.after(() => closeServer(server));

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
    assert.equal(
      sessionBody.user?.email,
      process.env.LOCAL_GOOGLE_EMAIL ?? "local@productiv.test",
    );
    assert.equal(
      sessionBody.user?.fullName,
      process.env.LOCAL_GOOGLE_FULL_NAME ?? "Productiv Local User",
    );
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

  test("messy intake proposes, revises, learns from feedback, and applies a schedule", async (t) => {
    const { baseUrl, server } = await listenOnRandomPort();
    t.after(() => closeServer(server));

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
      user?: {
        id?: string;
      } | null;
    };
    const userId = sessionBody.user?.id;

    if (!userId) {
      throw new Error("Expected authenticated local user id.");
    }

    const firstRoutineTurn = await postJson(baseUrl, "/assistant/turn", cookie, {
      message: "Add a daily 15 minute stretching habit.",
    });
    assert.equal(firstRoutineTurn.status, 200);
    const firstRoutineTurnBody =
      await firstRoutineTurn.json() as LocalAssistantTurnResponse;
    assert.equal(firstRoutineTurnBody.sideEffects.goals.length, 1);
    assert.equal(
      firstRoutineTurnBody.sideEffects.goals[0]?.title,
      "Personal routines",
    );
    assert.deepEqual(
      getGoalFocusAreaTitles(firstRoutineTurnBody.sideEffects.goals[0] ?? {}),
      ["Stretch"],
    );

    const secondRoutineTurn = await postJson(baseUrl, "/assistant/turn", cookie, {
      message: "Add a weekly 45 minute meal prep routine.",
    });
    assert.equal(secondRoutineTurn.status, 200);
    const secondRoutineTurnBody =
      await secondRoutineTurn.json() as LocalAssistantTurnResponse;
    assert.equal(secondRoutineTurnBody.sideEffects.goals.length, 1);
    assert.equal(
      secondRoutineTurnBody.sideEffects.goals[0]?.id,
      firstRoutineTurnBody.sideEffects.goals[0]?.id,
    );
    assert.deepEqual(
      getGoalFocusAreaTitles(secondRoutineTurnBody.sideEffects.goals[0] ?? {}),
      ["Stretch", "Meal prep"],
    );

    const messyTurn = await postJson(baseUrl, "/assistant/turn", cookie, {
      message:
        "Create a goal to prepare for product launch; make a daily focus routine to draft the launch narrative for 60 minutes; add a task to review the investor notes tomorrow for 45 minutes; add a task to email Maya tomorrow for 20 minutes; I prefer launch narrative in the afternoon; schedule my week.",
    });
    assert.equal(messyTurn.status, 200);
    const messyTurnBody = await messyTurn.json() as LocalAssistantTurnResponse;
    assert.equal(messyTurnBody.sideEffects.goals.length, 1);
    assert.equal(messyTurnBody.sideEffects.tasks.length, 2);
    assert.ok(
      messyTurnBody.sideEffects.tasks.every(
        (task) => task.goalId === messyTurnBody.sideEffects.goals[0]?.id,
      ),
    );
    assert.equal(messyTurnBody.sideEffects.scheduleProposals.length, 1);
    const originalProposal = messyTurnBody.sideEffects.scheduleProposals[0];

    assert.equal(originalProposal?.status, "draft");
    assert.ok(
      originalProposal?.operations.some(
        (operation) => operation.type === "schedule_goal_focus",
      ),
    );
    assert.ok(
      originalProposal?.operations.some(
        (operation) => operation.type === "schedule_task",
      ),
    );
    const launchNarrativeFocusId = getGoalFocusAreaIdContaining(
      messyTurnBody.sideEffects.goals[0] ?? {},
      "launch narrative",
    );
    const launchNarrativeOperation = originalProposal?.operations.find(
      (operation) =>
        operation.type === "schedule_goal_focus" &&
        operation.focusId === launchNarrativeFocusId,
    );
    const launchNarrativeSuggestion = messyTurnBody.sideEffects.schedulingSuggestions.find(
      (suggestion) => suggestion.title === "Launch Narrative afternoon preference",
    );

    assert.ok(launchNarrativeFocusId);
    assert.ok(launchNarrativeOperation);
    assert.equal(new Date(launchNarrativeOperation.startTime).getHours() >= 12, true);
    assert.ok(launchNarrativeSuggestion);
    assert.equal(launchNarrativeSuggestion.kind, "preferred_work_period");
    assert.equal(
      launchNarrativeSuggestion.metadata.activityTitle,
      "Launch Narrative",
    );
    assert.equal(
      launchNarrativeSuggestion.metadata.temporalScope,
      "afternoon",
    );

    const revisionTurn = await postJson(baseUrl, "/assistant/turn", cookie, {
      message:
        "This is too crowded. I usually need more buffer and less crowded days. I can't do mornings anymore.",
    });
    assert.equal(revisionTurn.status, 200);
    const revisionTurnBody = await revisionTurn.json() as LocalAssistantTurnResponse;
    assert.ok(revisionTurnBody.sideEffects.schedulingSuggestions.length >= 1);
    assert.ok(
      revisionTurnBody.sideEffects.scheduleProposals.some(
        (proposal) =>
          proposal.id === originalProposal.id && proposal.status === "superseded",
      ),
    );
    const revisedProposal = revisionTurnBody.sideEffects.scheduleProposals.find(
      (proposal) =>
        proposal.id !== originalProposal.id && proposal.status === "draft",
    );

    assert.ok(revisedProposal);
    assert.notEqual(revisedProposal?.id, originalProposal?.id);
    assert.equal(
      revisedProposal?.operations.some(
        (operation) => new Date(operation.startTime).getHours() < 12,
      ),
      false,
    );

    const storedOriginalProposal = await getScheduleProposalById(
      userId,
      originalProposal.id,
    );
    assert.equal(storedOriginalProposal?.status, "superseded");
    const storedFeedbackEntry = storedOriginalProposal?.feedbackHistory.at(-1);

    assert.ok(storedFeedbackEntry);
    assert.equal(typeof storedFeedbackEntry.at, "string");
    assert.deepEqual(storedFeedbackEntry, {
      type: "revision_requested",
      at: storedFeedbackEntry.at,
      feedback:
        "This is too crowded. I usually need more buffer and less crowded days. I can't do mornings anymore.",
      replacementProposalId: revisedProposal?.id,
    });

    const learnedContextResponse = await fetch(
      `${baseUrl}/user-scheduling-context`,
      { headers: { Cookie: cookie } },
    );
    assert.equal(learnedContextResponse.status, 200);
    const learnedContext =
      await learnedContextResponse.json() as LocalSchedulingContextResponse;
    assert.ok(
      learnedContext.tentativeRules.some(
        (rule) => rule.title === "Prefer lighter schedule drafts",
      ),
    );
    assert.ok(
      learnedContext.tentativeRules.some(
        (rule) => rule.title === "Avoid scheduling mornings",
      ),
    );
    assert.ok(
      learnedContext.tentativeRules.some(
        (rule) =>
          rule.title === "Launch Narrative afternoon preference" &&
          rule.metadata.activityTitle === "Launch Narrative" &&
          rule.metadata.temporalScope === "afternoon",
      ),
    );

    const confirmTurn = await postJson(baseUrl, "/assistant/turn", cookie, {
      message: `Confirm schedule proposal ${revisedProposal.id}.`,
    });
    assert.equal(confirmTurn.status, 200);
    const confirmTurnBody = await confirmTurn.json() as LocalAssistantTurnResponse;
    assert.ok(
      confirmTurnBody.sideEffects.scheduleProposals.some(
        (proposal) =>
          proposal.id === revisedProposal.id && proposal.status === "applied",
      ),
    );
    assert.ok(confirmTurnBody.sideEffects.tasks.length >= 1);
    assert.ok(
      confirmTurnBody.sideEffects.tasks.some(
        (task) =>
          task.status === "scheduled" &&
          /^productiv-local-calendar::local-event-/u.test(
            task.linkedCalendarEventId ?? "",
          ),
      ),
    );
    const appliedFocusOperations = revisedProposal.operations.filter(
      (operation) => operation.type === "schedule_goal_focus",
    );
    assert.ok(
      confirmTurnBody.sideEffects.goals.some((goal) =>
        hasScheduledFocusBlocksForOperations(goal, appliedFocusOperations),
      ),
    );

    const storedRevisedProposal = await getScheduleProposalById(
      userId,
      revisedProposal.id,
    );
    assert.equal(storedRevisedProposal?.status, "applied");

    const appliedStartDates = revisedProposal.operations.map((operation) =>
      operation.startTime.slice(0, 10),
    );
    const appliedEndDates = revisedProposal.operations.map((operation) =>
      operation.endTime.slice(0, 10),
    );
    const eventStartDate = appliedStartDates.sort()[0] ?? toDateOnly(new Date());
    const eventEndDate = toDateOnly(
      addDays(new Date(appliedEndDates.sort().at(-1) ?? eventStartDate), 1),
    );
    const appliedEventsResponse = await fetch(
      `${baseUrl}/calendar/events?${new URLSearchParams({
        startDate: eventStartDate,
        endDate: eventEndDate,
      })}`,
      { headers: { Cookie: cookie } },
    );
    assert.equal(appliedEventsResponse.status, 200);
    const appliedEvents = await appliedEventsResponse.json() as Array<{
      id?: string;
      title?: string;
    }>;

    assert.ok(
      appliedEvents.filter((event) => event.id?.startsWith("local-event-"))
        .length >= revisedProposal.operations.length,
    );

    const persistedGoalsResponse = await fetch(`${baseUrl}/goals`, {
      headers: { Cookie: cookie },
    });
    assert.equal(persistedGoalsResponse.status, 200);
    const persistedGoalsBody = await persistedGoalsResponse.json() as {
      goals: Array<Record<string, unknown>>;
    };
    const persistedPersonalRoutineGoals = persistedGoalsBody.goals.filter(
      isPersonalRoutinesGoal,
    );
    assert.equal(persistedPersonalRoutineGoals.length, 1);
    assert.deepEqual(
      getGoalFocusAreaTitles(persistedPersonalRoutineGoals[0] ?? {}),
      ["Stretch", "Meal prep"],
    );
    assert.ok(
      persistedGoalsBody.goals.some((goal) =>
        hasScheduledFocusBlocksForOperations(goal, appliedFocusOperations),
      ),
    );
  });

  function listenOnRandomPort() {
    return new Promise<{
      baseUrl: string;
      server: ReturnType<typeof app.listen>;
    }>((resolve, reject) => {
      const server = app.listen(0, "127.0.0.1", () => {
        const address = server.address() as AddressInfo | null;

        if (!address) {
          reject(new Error("Expected local test server to have an address."));
          return;
        }

        resolve({
          baseUrl: `http://127.0.0.1:${address.port}`,
          server,
        });
      });

      server.once("error", reject);
    });
  }

  function closeServer(server: ReturnType<typeof app.listen>) {
    return new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

type LocalAssistantTurnResponse = {
  sideEffects: {
    goals: Array<Record<string, unknown>>;
    metricEntries: Array<Record<string, unknown>>;
    metrics: Array<Record<string, unknown>>;
    scheduleProposals: Array<{
      id: string;
      operations: Array<{
        endTime: string;
        focusId?: string | null;
        startTime: string;
        type: "schedule_goal_focus" | "schedule_task";
      }>;
      status: string;
    }>;
    schedulingSuggestions: Array<{
      kind?: string;
      metadata: {
        activityTitle?: string | null;
        temporalScope?: string | null;
      };
      title?: string;
    }>;
    tasks: Array<{
      goalId?: string | null;
      linkedCalendarEventId?: string | null;
      status?: string;
    }>;
    workLogs: Array<Record<string, unknown>>;
  };
};

type LocalScheduleProposalOperation =
  LocalAssistantTurnResponse["sideEffects"]["scheduleProposals"][number]["operations"][number];

type LocalSchedulingContextResponse = {
  tentativeRules: Array<{
    metadata: {
      activityTitle?: string | null;
      temporalScope?: string | null;
    };
    title: string;
  }>;
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

function hasScheduledFocusBlocksForOperations(
  goal: Record<string, unknown>,
  operations: LocalScheduleProposalOperation[],
) {
  const scheduledBlocks = getScheduledFocusBlocks(goal);

  return operations.every((operation) =>
    scheduledBlocks.some(
      (block) =>
        block.focusId === (operation.focusId ?? null) &&
        block.startTime === operation.startTime &&
        block.endTime === operation.endTime,
    ),
  );
}

function isPersonalRoutinesGoal(goal: Record<string, unknown>) {
  return goal.title === "Personal routines";
}

function getGoalFocusAreaTitles(goal: Record<string, unknown>) {
  const focusAreas = goal.focusAreas;

  if (!Array.isArray(focusAreas)) {
    return [];
  }

  return focusAreas.flatMap((focusArea) => {
    if (!focusArea || typeof focusArea !== "object" || Array.isArray(focusArea)) {
      return [];
    }

    const title = (focusArea as Record<string, unknown>).title;

    return typeof title === "string" ? [title] : [];
  });
}

function getGoalFocusAreaIdContaining(
  goal: Record<string, unknown>,
  titleFragment: string,
) {
  const focusAreas = goal.focusAreas;

  if (!Array.isArray(focusAreas)) {
    return null;
  }

  const normalizedTitleFragment = titleFragment.toLowerCase();

  for (const focusArea of focusAreas) {
    if (!focusArea || typeof focusArea !== "object" || Array.isArray(focusArea)) {
      continue;
    }

    const record = focusArea as Record<string, unknown>;
    const id = record.id;
    const title = record.title;

    if (
      typeof id === "string" &&
      typeof title === "string" &&
      title.toLowerCase().includes(normalizedTitleFragment)
    ) {
      return id;
    }
  }

  return null;
}

function getScheduledFocusBlocks(goal: Record<string, unknown>) {
  const guidance = goal.scheduleGuidance;

  if (!guidance || typeof guidance !== "object" || Array.isArray(guidance)) {
    return [];
  }

  const blocks = (guidance as Record<string, unknown>).scheduledFocusBlocks;

  if (!Array.isArray(blocks)) {
    return [];
  }

  return blocks.flatMap((block) => {
    if (!block || typeof block !== "object" || Array.isArray(block)) {
      return [];
    }

    const record = block as Record<string, unknown>;

    return typeof record.startTime === "string" &&
      typeof record.endTime === "string"
      ? [
          {
            focusId:
              typeof record.focusId === "string" ? record.focusId : null,
            startTime: record.startTime,
            endTime: record.endTime,
          },
        ]
      : [];
  });
}
