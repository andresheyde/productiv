import assert from "node:assert/strict";
import test from "node:test";

import { formatScheduleBlockTitleForCalendar } from "./assistant.service.ts";

test("formatScheduleBlockTitleForCalendar keeps calendar event names short", () => {
  assert.equal(
    formatScheduleBlockTitleForCalendar(
      "Perform physical activity every weekday for at least 45 minutes.",
    ),
    "Workout",
  );
  assert.equal(
    formatScheduleBlockTitleForCalendar(
      "Complete at least 6 workout sessions combining strength and cardio exercises",
    ),
    "Workout",
  );
  assert.equal(
    formatScheduleBlockTitleForCalendar(
      "Schedule apartment cleaning for Sunday night around 8 PM",
    ),
    "Apartment cleaning",
  );
  assert.equal(
    formatScheduleBlockTitleForCalendar(
      "Practice problems later in the week after study blocks",
    ),
    "Practice problems",
  );
});
