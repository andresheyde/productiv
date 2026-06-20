import { addDays, startOfDay } from "date-fns";
import type { Credentials } from "google-auth-library";
import { google, type calendar_v3 } from "googleapis";

import { createGoogleOAuthClient } from "../clients/google-oauth-client.ts";
import { googleScopes } from "../config/app-config.ts";
import type {
  CreateCalendarEventInput,
  DeleteCalendarEventInput,
  GoogleIntegrationProvider,
  GoogleCalendarSource,
  GoogleUserProfile,
  MergedCalendarEvent,
  UpdateCalendarEventInput,
} from "./google-integration-provider.ts";

const PRODUCTIV_CALENDAR_SUMMARY = "Productiv";
const PRODUCTIV_CALENDAR_DESCRIPTION =
  "Managed by Productiv for scheduled events.";

export class RealGoogleIntegrationProvider implements GoogleIntegrationProvider {
  getAuthUrl(input: { redirectTo?: string; state?: string }): string {
    const oauth2Client = createGoogleOAuthClient();

    return oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: googleScopes,
      ...(input.state ? { state: input.state } : {}),
    });
  }

  async exchangeCodeForTokens(code: string): Promise<Credentials> {
    console.log("[Auth] Exchanging authorization code for tokens...");

    const oauth2Client = createGoogleOAuthClient();
    const tokenResponse = await oauth2Client.getToken(code);

    console.log("[Auth] Successfully obtained credentials");
    return tokenResponse.tokens;
  }

  async fetchProfileFromTokens(tokens: Credentials): Promise<GoogleUserProfile> {
    const oauth2Client = createGoogleOAuthClient();
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({
      version: "v2",
      auth: oauth2Client,
    });
    const response = await oauth2.userinfo.get();
    const data = response.data;

    if (!data.id) {
      throw new Error("Google user profile response did not include an id.");
    }

    return {
      googleSubject: data.id,
      email: data.email ?? null,
      fullName: data.name ?? null,
      avatarUrl: data.picture ?? null,
    };
  }

  async getMergedCalendarEvents(
    tokens: Credentials,
    startDate: Date,
    endDate: Date,
    calendarIds?: string[] | null,
  ): Promise<MergedCalendarEvent[]> {
    const calendar = createCalendarClient(tokens);
    const includedCalendarIds = calendarIds ? new Set(calendarIds) : null;

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
        .filter(
          (calendarItem) =>
            !includedCalendarIds || includedCalendarIds.has(calendarItem.id),
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

    mergedEvents.sort(compareCalendarEvents);

    console.log("[Response] Sending merged and sorted events to client");
    return mergedEvents;
  }

  async listCalendars(tokens: Credentials): Promise<GoogleCalendarSource[]> {
    const calendar = createCalendarClient(tokens);
    const calendarListResponse = await calendar.calendarList.list();

    return (calendarListResponse.data.items ?? []).flatMap((calendarItem) => {
      if (typeof calendarItem.id !== "string" || calendarItem.id.length === 0) {
        return [];
      }

      return [
        {
          id: calendarItem.id,
          summary:
            calendarItem.summaryOverride ??
            calendarItem.summary ??
            "Unnamed Calendar",
          primary: calendarItem.primary === true,
          accessRole: calendarItem.accessRole ?? null,
          backgroundColor: calendarItem.backgroundColor ?? null,
        },
      ];
    });
  }

  async createCalendarEvent(
    tokens: Credentials,
    input: CreateCalendarEventInput,
  ) {
    const calendar = createCalendarClient(tokens);
    const productivCalendar = await getOrCreateProductivCalendar(calendar);

    console.log(`[Events] Creating Google Calendar event: ${input.title}`);

    const response = await calendar.events.insert({
      calendarId: productivCalendar.id,
      requestBody: buildEventRequestBody(input),
    });

    return {
      ...response.data,
      sourceCalendarId: productivCalendar.id,
      sourceCalendarName: productivCalendar.summary,
    };
  }

  async updateCalendarEvent(
    tokens: Credentials,
    input: UpdateCalendarEventInput,
  ) {
    const calendar = createCalendarClient(tokens);

    console.log(`[Events] Updating Google Calendar event: ${input.eventId}`);

    const response = await calendar.events.update({
      calendarId: input.calendarId,
      eventId: input.eventId,
      requestBody: buildEventRequestBody(input),
    });

    return response.data;
  }

  async deleteCalendarEvent(
    tokens: Credentials,
    input: DeleteCalendarEventInput,
  ) {
    const calendar = createCalendarClient(tokens);

    console.log(`[Events] Deleting Google Calendar event: ${input.eventId}`);

    await calendar.events.delete({
      calendarId: input.calendarId,
      eventId: input.eventId,
    });
  }
}

function createCalendarClient(tokens: Credentials) {
  const oauth2Client = createGoogleOAuthClient();
  oauth2Client.setCredentials(tokens);

  return google.calendar({ version: "v3", auth: oauth2Client });
}

function buildEventRequestBody(
  input: CreateCalendarEventInput,
): calendar_v3.Schema$Event {
  return {
    summary: input.title,
    start: {
      dateTime: input.startTime.toISOString(),
    },
    end: {
      dateTime: input.endTime.toISOString(),
    },
    ...(input.description ? { description: input.description } : {}),
  };
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

function compareCalendarEvents(a: calendar_v3.Schema$Event, b: calendar_v3.Schema$Event) {
  const aStart = a.start?.dateTime ?? a.start?.date ?? "";
  const bStart = b.start?.dateTime ?? b.start?.date ?? "";
  return aStart.localeCompare(bStart);
}
