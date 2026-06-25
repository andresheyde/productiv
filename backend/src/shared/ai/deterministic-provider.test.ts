import assert from "node:assert/strict";
import test from "node:test";

import { DeterministicAiProvider } from "./deterministic-provider.ts";

test("deterministic provider returns assistant actions for local task messages", async () => {
  const provider = new DeterministicAiProvider();
  const response = await provider.generateJson<{
    actions: Array<{ title: string | null; type: string }>;
    navigationHint: string | null;
  }>({
    instructions: "Return assistant JSON.",
    input: [
      "Latest user message:",
      "Add a task to review the local workflow tomorrow",
      "",
      "Recent conversation:",
      "[]",
      "",
      "Current goals:",
      "[]",
      "",
      "Current tasks:",
      "[]",
      "",
      "Current metrics:",
      "[]",
      "",
      "Recent work logs:",
      "[]",
      "",
      "Saved personal scheduling context:",
      "{}",
      "",
      "Pending schedule proposals that still need user confirmation:",
      "[]",
    ].join("\n"),
    schemaName: "assistant_turn",
    schema: {},
  });

  assert.equal(response.navigationHint, "tasks");
  assert.equal(response.actions[0]?.type, "create_task");
  assert.match(response.actions[0]?.title ?? "", /review local workflow/i);
});

test("deterministic provider extracts week-boundary scheduling preferences", async () => {
  const provider = new DeterministicAiProvider();
  const response = await provider.generateJson<{
    schedulingPreferenceCandidates: Array<{
      applicabilityScope: string;
      kind: string;
      title: string;
    }>;
  }>({
    instructions: "Return assistant JSON.",
    input: [
      "Latest user message:",
      "My scheduling week runs from Monday through Sunday.",
      "",
      "Recent conversation:",
      "[]",
      "",
      "Current goals:",
      "[]",
      "",
      "Current tasks:",
      "[]",
      "",
      "Current metrics:",
      "[]",
      "",
      "Recent work logs:",
      "[]",
      "",
      "Saved personal scheduling context:",
      "{}",
      "",
      "Pending schedule proposals that still need user confirmation:",
      "[]",
    ].join("\n"),
    schemaName: "assistant_turn",
    schema: {},
  });

  assert.equal(response.schedulingPreferenceCandidates[0]?.kind, "custom");
  assert.equal(
    response.schedulingPreferenceCandidates[0]?.title,
    "Preferred scheduling week boundary",
  );
  assert.equal(
    response.schedulingPreferenceCandidates[0]?.applicabilityScope,
    "global",
  );
});

test("deterministic provider extracts work-log metric progress", async () => {
  const provider = new DeterministicAiProvider();
  const response = await provider.generateJson<{
    progressUpdates: Array<{ deltaValue: number; metricId: string }>;
  }>({
    instructions: "Return work log JSON.",
    input: [
      "Work log message:",
      "I worked 2 hours on local testing",
      "",
      "Goals:",
      "[]",
      "",
      "Tasks:",
      "[]",
      "",
      "Metrics:",
      JSON.stringify([{ id: "metric-1" }]),
    ].join("\n"),
    schemaName: "work_log_turn",
    schema: {},
  });

  assert.deepEqual(response.progressUpdates, [
    {
      metricId: "metric-1",
      deltaValue: 2,
      note: "Extracted by deterministic local AI.",
    },
  ]);
});
