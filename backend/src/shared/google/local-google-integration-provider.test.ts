import assert from "node:assert/strict";
import test from "node:test";

import { LocalGoogleIntegrationProvider } from "./local-google-integration-provider.ts";

test("local Google provider creates sessions and keeps calendar events locally", async () => {
  const provider = new LocalGoogleIntegrationProvider();
  const tokens = await provider.exchangeCodeForTokens("local");
  const profile = await provider.fetchProfileFromTokens(tokens);

  assert.equal(profile.googleSubject, "productiv-local-user");
  assert.equal(profile.email, "local@productiv.test");

  const startTime = new Date("2026-06-21T09:00:00.000Z");
  const endTime = new Date("2026-06-21T10:00:00.000Z");
  const createdEvent = await provider.createCalendarEvent(tokens, {
    title: "Local event",
    startTime,
    endTime,
  });

  assert.equal(createdEvent.sourceCalendarId, "productiv-local-calendar");
  assert.match(createdEvent.id ?? "", /^local-event-/u);

  const listedEvents = await provider.getMergedCalendarEvents(
    tokens,
    new Date("2026-06-21T12:00:00.000Z"),
    new Date("2026-06-21T12:00:00.000Z"),
  );
  assert.equal(listedEvents.length, 1);
  assert.equal(listedEvents[0]?.summary, "Local event");

  await provider.updateCalendarEvent(tokens, {
    calendarId: "productiv-local-calendar",
    eventId: createdEvent.id ?? "",
    title: "Updated local event",
    startTime,
    endTime,
  });

  const updatedEvents = await provider.getMergedCalendarEvents(
    tokens,
    new Date("2026-06-21T12:00:00.000Z"),
    new Date("2026-06-21T12:00:00.000Z"),
  );
  assert.equal(updatedEvents[0]?.summary, "Updated local event");

  await provider.deleteCalendarEvent(tokens, {
    calendarId: "productiv-local-calendar",
    eventId: createdEvent.id ?? "",
  });

  const remainingEvents = await provider.getMergedCalendarEvents(
    tokens,
    new Date("2026-06-21T12:00:00.000Z"),
    new Date("2026-06-21T12:00:00.000Z"),
  );
  assert.equal(remainingEvents.length, 0);
});
