import assert from "node:assert/strict";
import test from "node:test";

import { deriveGoalMetricSpecs } from "./goal-metric-defaults.ts";

const baseGoal = {
  title: "Secure a software developer job offer within 3 months",
  definition: "",
  successCriteria: [],
  scheduleGuidance: {},
  notes: null,
};

test("deriveGoalMetricSpecs adds a default hours metric for every goal", () => {
  const specs = deriveGoalMetricSpecs(baseGoal);

  assert.deepEqual(specs, [
    {
      name: "Hours spent working on goal",
      unitLabel: "hours",
      targetValue: 10,
    },
  ]);
});

test("deriveGoalMetricSpecs creates measurable metrics from numeric success criteria", () => {
  const specs = deriveGoalMetricSpecs({
    ...baseGoal,
    successCriteria: [
      "Submit at least 250 software developer job applications",
      "Complete 40 interview questions",
      "Feel more confident in interviews",
    ],
  });

  assert.deepEqual(specs, [
    {
      name: "Hours spent working on goal",
      unitLabel: "hours",
      targetValue: 10,
    },
    {
      name: "Submit software developer job applications",
      unitLabel: "applications",
      targetValue: 250,
    },
    {
      name: "Complete interview questions",
      unitLabel: "questions",
      targetValue: 40,
    },
  ]);
});

test("deriveGoalMetricSpecs infers a useful hours target from schedule guidance", () => {
  const specs = deriveGoalMetricSpecs({
    ...baseGoal,
    definition:
      "Apply to jobs during 30-minute focused sessions on weekdays over the next 30 days.",
    scheduleGuidance: {
      timeProtectionPlan: [
        "Reserve 30 minutes each weekday between 9AM and 5PM.",
      ],
    },
  });

  assert.equal(specs[0]?.targetValue, 11);
});
