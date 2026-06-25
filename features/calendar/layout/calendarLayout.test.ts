import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_VISIBLE_END_HOUR,
  DEFAULT_VISIBLE_START_HOUR,
  dateToY,
  getCalendarGridHeight,
  getCalendarTimeWindowFromEvents,
  timeToY,
  xAndYToDate,
  yToMinutes,
} from "./calendarLayout.ts";

test("getCalendarTimeWindowFromEvents defaults to the active day window", () => {
  assert.deepEqual(getCalendarTimeWindowFromEvents([]), {
    startHour: DEFAULT_VISIBLE_START_HOUR,
    endHour: DEFAULT_VISIBLE_END_HOUR,
  });
});

test("getCalendarTimeWindowFromEvents expands for early and late events", () => {
  assert.deepEqual(
    getCalendarTimeWindowFromEvents([
      {
        startTime: new Date(2026, 5, 24, 5, 30),
        endTime: new Date(2026, 5, 24, 6, 15),
      },
      {
        startTime: new Date(2026, 5, 24, 22, 15),
        endTime: new Date(2026, 5, 24, 23, 45),
      },
    ]),
    {
      startHour: 5,
      endHour: 24,
    },
  );
});

test("getCalendarTimeWindowFromEvents expands overnight events to a full day", () => {
  assert.deepEqual(
    getCalendarTimeWindowFromEvents([
      {
        startTime: new Date(2026, 5, 24, 21, 30),
        endTime: new Date(2026, 5, 25, 1, 15),
      },
    ]),
    {
      startHour: 0,
      endHour: 24,
    },
  );
});

test("calendar y-coordinate math honors visible time windows", () => {
  const timeWindow = {
    startHour: 6,
    endHour: 22,
  };

  assert.equal(getCalendarGridHeight(timeWindow), 1600);
  assert.equal(timeToY(8, 30, undefined, timeWindow.startHour), 250);
  assert.equal(dateToY(new Date(2026, 5, 24, 8, 30), undefined, 6), 250);
  assert.equal(yToMinutes(250, undefined, timeWindow), 8 * 60 + 30);
});

test("xAndYToDate creates events relative to the visible time window", () => {
  const date = xAndYToDate(
    125,
    250,
    3,
    100,
    new Date(2026, 5, 24),
    {
      startHour: 6,
      endHour: 22,
    },
  );

  assert.equal(date.toISOString(), new Date(2026, 5, 25, 8, 30).toISOString());
});
