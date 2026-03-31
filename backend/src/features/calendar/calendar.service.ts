import { addDays, startOfDay } from "date-fns";
import type { Credentials } from "google-auth-library";
import { google, type calendar_v3 } from "googleapis";

import { createGoogleOAuthClient } from "../../shared/clients/google-oauth-client.ts";

export interface MergedCalendarEvent extends calendar_v3.Schema$Event {
  sourceCalendarId: string;
  sourceCalendarName: string;
}

interface CreateCalendarEventInput {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
}

interface UpdateCalendarEventInput extends CreateCalendarEventInput {
  eventId: string;
  calendarId: string;
}

interface DeleteCalendarEventInput {
  eventId: string;
  calendarId: string;
}

const PRODUCTIV_CALENDAR_SUMMARY = "Productiv";
const PRODUCTIV_CALENDAR_DESCRIPTION =
  "Managed by Productiv for scheduled events.";

export async function getMergedCalendarEvents(
  tokens: Credentials,
  startDate: Date,
  endDate: Date,
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
          timeMin: startOfDay(startDate).toISOString(),
          timeMax: addDays(startOfDay(endDate), 1).toISOString(),
          maxResults: 250,
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

export async function createGoogleCalendarEvent(
  tokens: Credentials,
  input: CreateCalendarEventInput,
) {
  const oauth2Client = createGoogleOAuthClient();
  oauth2Client.setCredentials(tokens);

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  const productivCalendar = await getOrCreateProductivCalendar(calendar);

  console.log(`[Events] Creating Google Calendar event: ${input.title}`);

  const requestBody: calendar_v3.Schema$Event = {
    summary: input.title,
    start: {
      dateTime: input.startTime.toISOString(),
    },
    end: {
      dateTime: input.endTime.toISOString(),
    },
    ...(input.description ? { description: input.description } : {}),
  };

  const response = await calendar.events.insert({
    calendarId: productivCalendar.id,
    requestBody,
  });

  return {
    ...response.data,
    sourceCalendarId: productivCalendar.id,
    sourceCalendarName: productivCalendar.summary,
  };
}

export async function updateGoogleCalendarEvent(
  tokens: Credentials,
  input: UpdateCalendarEventInput,
) {
  const oauth2Client = createGoogleOAuthClient();
  oauth2Client.setCredentials(tokens);

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  console.log(`[Events] Updating Google Calendar event: ${input.eventId}`);

  const requestBody: calendar_v3.Schema$Event = {
    summary: input.title,
    start: {
      dateTime: input.startTime.toISOString(),
    },
    end: {
      dateTime: input.endTime.toISOString(),
    },
    ...(input.description ? { description: input.description } : {}),
  };

  const response = await calendar.events.update({
    calendarId: input.calendarId,
    eventId: input.eventId,
    requestBody,
  });

  return response.data;
}

export async function deleteGoogleCalendarEvent(
  tokens: Credentials,
  input: DeleteCalendarEventInput,
) {
  const oauth2Client = createGoogleOAuthClient();
  oauth2Client.setCredentials(tokens);

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  console.log(`[Events] Deleting Google Calendar event: ${input.eventId}`);

  await calendar.events.delete({
    calendarId: input.calendarId,
    eventId: input.eventId,
  });
}

async function getOrCreateProductivCalendar(
  calendar: calendar_v3.Calendar,
): Promise<{ id: string; summary: string }> {
  const calendarListResponse = await calendar.calendarList.list();
  const existingCalendar = (calendarListResponse.data.items ?? []).find(
    (
      item,
    ): item is calendar_v3.Schema$CalendarListEntry & {
      id: string;
      summary: string;
    } =>
      typeof item.id === "string" &&
      item.id.length > 0 &&
      typeof item.summary === "string" &&
      item.summary === PRODUCTIV_CALENDAR_SUMMARY,
  );

  if (existingCalendar) {
    return {
      id: existingCalendar.id,
      summary: existingCalendar.summary,
    };
  }

  console.log("[Calendars] Creating Productiv calendar...");
  const insertResponse = await calendar.calendars.insert({
    requestBody: {
      summary: PRODUCTIV_CALENDAR_SUMMARY,
      description: PRODUCTIV_CALENDAR_DESCRIPTION,
    },
  });

  return {
    id: insertResponse.data.id ?? PRODUCTIV_CALENDAR_SUMMARY,
    summary: insertResponse.data.summary ?? PRODUCTIV_CALENDAR_SUMMARY,
  };
}
