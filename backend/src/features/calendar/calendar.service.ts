import { addDays } from "date-fns";
import type { Credentials } from "google-auth-library";
import { google, type calendar_v3 } from "googleapis";

import { createGoogleOAuthClient } from "../../shared/clients/google-oauth-client.ts";
import {
  eventsWindowLengthDays,
  eventsWindowStart,
} from "../../shared/config/app-config.ts";

export interface MergedCalendarEvent extends calendar_v3.Schema$Event {
  sourceCalendarId: string;
  sourceCalendarName: string;
}

export async function getMergedCalendarEvents(
  tokens: Credentials,
): Promise<MergedCalendarEvent[]> {
  const oauth2Client = createGoogleOAuthClient();
  oauth2Client.setCredentials(tokens);

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  console.log("[Calendars] Fetching user's calendar list...");
  const calendarListResponse = await calendar.calendarList.list();
  const calendars = calendarListResponse.data.items ?? [];
  console.log(`[Calendars] Found ${calendars.length} calendar(s)`);

  const eventArrays = await Promise.all(
    calendars
      .filter(
        (
          calendarItem,
        ): calendarItem is calendar_v3.Schema$CalendarListEntry & {
          id: string;
        } => typeof calendarItem.id === "string" && calendarItem.id.length > 0,
      )
      .map(async (calendarItem) => {
        console.log(
          `[Events] Fetching events for calendar: ${calendarItem.summary ?? calendarItem.id}`,
        );

        const eventsListResponse = await calendar.events.list({
          calendarId: calendarItem.id,
          timeMin: eventsWindowStart.toISOString(),
          timeMax: addDays(
            eventsWindowStart,
            eventsWindowLengthDays,
          ).toISOString(),
          maxResults: 50,
          singleEvents: true,
          orderBy: "startTime",
        });

        const events = eventsListResponse.data.items ?? [];
        console.log(
          `[Events] Found ${events.length} event(s) in calendar: ${calendarItem.summary ?? calendarItem.id}`,
        );

        return events.map((event) => ({
          ...event,
          sourceCalendarId: calendarItem.id,
          sourceCalendarName: calendarItem.summary ?? "Unnamed Calendar",
        }));
      }),
  );

  const mergedEvents = eventArrays.flat();
  console.log(
    `[Events] Total of ${mergedEvents.length} event(s) across all calendars`,
  );

  mergedEvents.sort((a, b) => {
    const aStart = a.start?.dateTime ?? a.start?.date ?? "";
    const bStart = b.start?.dateTime ?? b.start?.date ?? "";
    return aStart.localeCompare(bStart);
  });

  console.log("[Response] Sending merged and sorted events to client");
  return mergedEvents;
}
