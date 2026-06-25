import assert from "node:assert/strict";
import test from "node:test";

import {
  canScrollProposalPreviewTimedGrid,
  getProposalPreviewDayCount,
  getProposalPreviewDayWidth,
  getProposalPreviewEventsInRange,
  getProposalPreviewGridWidth,
  getProposalPreviewTimedViewportHeight,
  getProposalPreviewTimeWindow,
  getProposalPreviewTimedEventLayouts,
  isProposalPreviewEventInDay,
} from "./proposalPreviewLayout.ts";

test("getProposalPreviewDayCount keeps narrow proposal cards to one readable day", () => {
  assert.equal(getProposalPreviewDayCount(390), 1);
  assert.equal(getProposalPreviewDayCount(443), 1);
});

test("getProposalPreviewDayCount expands only when the card can fit readable columns", () => {
  assert.equal(getProposalPreviewDayCount(444), 3);
  assert.equal(getProposalPreviewDayCount(695), 3);
  assert.equal(getProposalPreviewDayCount(696), 5);
  assert.equal(getProposalPreviewDayCount(947), 5);
  assert.equal(getProposalPreviewDayCount(948), 7);
});

test("getProposalPreviewDayWidth respects minimum and maximum readable widths", () => {
  assert.equal(getProposalPreviewDayWidth(0, 3), 118);
  assert.equal(getProposalPreviewDayWidth(444, 3), 118);
  assert.equal(getProposalPreviewDayWidth(1000, 3), 280);
});

test("getProposalPreviewDayWidth lets one-day mobile previews fill the card", () => {
  const dayWidth = getProposalPreviewDayWidth(390, 1);

  assert.equal(dayWidth, 316);
  assert.equal(getProposalPreviewGridWidth(dayWidth, 1), 390);
});

test("getProposalPreviewDayWidth caps one-day desktop previews", () => {
  const dayWidth = getProposalPreviewDayWidth(1280, 1);

  assert.equal(dayWidth, 560);
  assert.equal(getProposalPreviewGridWidth(dayWidth, 1), 634);
});

test("getProposalPreviewGridWidth identifies true ultra-narrow overflow", () => {
  const dayWidth = getProposalPreviewDayWidth(180, 1);

  assert.equal(dayWidth, 118);
  assert.equal(getProposalPreviewGridWidth(dayWidth, 1), 192);
});

test("getProposalPreviewTimedViewportHeight caps tall previews in the card", () => {
  assert.equal(getProposalPreviewTimedViewportHeight(230, 1), 230);
  assert.equal(getProposalPreviewTimedViewportHeight(600, 1), 360);
  assert.equal(getProposalPreviewTimedViewportHeight(600, 3), 330);
  assert.equal(canScrollProposalPreviewTimedGrid(600, 1), true);
  assert.equal(canScrollProposalPreviewTimedGrid(230, 1), false);
});

test("getProposalPreviewEventsInRange keeps the visible proposal page focused", () => {
  const events = [
    {
      id: "previous",
      startTime: new Date(2026, 5, 23, 9),
      endTime: new Date(2026, 5, 23, 10),
    },
    {
      id: "visible",
      startTime: new Date(2026, 5, 24, 13),
      endTime: new Date(2026, 5, 24, 14),
    },
    {
      id: "spanning",
      startTime: new Date(2026, 5, 25, 23),
      endTime: new Date(2026, 5, 26, 1),
    },
    {
      id: "future",
      startTime: new Date(2026, 5, 27, 9),
      endTime: new Date(2026, 5, 27, 10),
    },
  ];

  assert.deepEqual(
    getProposalPreviewEventsInRange(events, new Date(2026, 5, 24), 3).map(
      (event) => event.id,
    ),
    ["visible", "spanning"],
  );
});

test("isProposalPreviewEventInDay includes timed events that cross midnight", () => {
  const event = {
    startTime: new Date(2026, 5, 24, 22),
    endTime: new Date(2026, 5, 25, 1),
  };

  assert.equal(isProposalPreviewEventInDay(event, new Date(2026, 5, 24)), true);
  assert.equal(isProposalPreviewEventInDay(event, new Date(2026, 5, 25)), true);
  assert.equal(isProposalPreviewEventInDay(event, new Date(2026, 5, 26)), false);
});

test("getProposalPreviewTimeWindow zooms to the provided visible events", () => {
  assert.deepEqual(
    getProposalPreviewTimeWindow([
      {
        startTime: new Date(2026, 5, 24, 13, 15),
        endTime: new Date(2026, 5, 24, 14),
      },
    ]),
    {
      startHour: 11,
      endHour: 16,
    },
  );
});

test("getProposalPreviewTimeWindow keeps cross-midnight events visible", () => {
  assert.deepEqual(
    getProposalPreviewTimeWindow([
      {
        startTime: new Date(2026, 5, 24, 22),
        endTime: new Date(2026, 5, 25, 1),
      },
    ]),
    {
      startHour: 0,
      endHour: 24,
    },
  );
});

test("getProposalPreviewTimedEventLayouts separates overlapping events into lanes", () => {
  const day = new Date(2026, 5, 24);
  const layouts = getProposalPreviewTimedEventLayouts(
    [
      {
        id: "calendar",
        startTime: new Date(2026, 5, 24, 9),
        endTime: new Date(2026, 5, 24, 10),
      },
      {
        id: "proposal",
        startTime: new Date(2026, 5, 24, 9, 30),
        endTime: new Date(2026, 5, 24, 10, 30),
      },
      {
        id: "later",
        startTime: new Date(2026, 5, 24, 11),
        endTime: new Date(2026, 5, 24, 12),
      },
    ],
    day,
    { startHour: 8, endHour: 13 },
    60,
  );

  assert.deepEqual(
    layouts.map((layout) => ({
      id: layout.event.id,
      top: layout.top,
      height: layout.height,
      laneIndex: layout.laneIndex,
      laneCount: layout.laneCount,
    })),
    [
      { id: "calendar", top: 60, height: 60, laneIndex: 0, laneCount: 2 },
      { id: "proposal", top: 90, height: 60, laneIndex: 1, laneCount: 2 },
      { id: "later", top: 180, height: 60, laneIndex: 0, laneCount: 1 },
    ],
  );
});

test("getProposalPreviewTimedEventLayouts keeps transitive overlap clusters together", () => {
  const day = new Date(2026, 5, 24);
  const layouts = getProposalPreviewTimedEventLayouts(
    [
      {
        id: "first",
        startTime: new Date(2026, 5, 24, 9),
        endTime: new Date(2026, 5, 24, 10),
      },
      {
        id: "second",
        startTime: new Date(2026, 5, 24, 9, 45),
        endTime: new Date(2026, 5, 24, 10, 30),
      },
      {
        id: "third",
        startTime: new Date(2026, 5, 24, 10, 15),
        endTime: new Date(2026, 5, 24, 11),
      },
    ],
    day,
    { startHour: 8, endHour: 12 },
    60,
  );

  assert.deepEqual(
    layouts.map((layout) => ({
      id: layout.event.id,
      laneIndex: layout.laneIndex,
      laneCount: layout.laneCount,
    })),
    [
      { id: "first", laneIndex: 0, laneCount: 2 },
      { id: "second", laneIndex: 1, laneCount: 2 },
      { id: "third", laneIndex: 0, laneCount: 2 },
    ],
  );
});
