import { addDays, startOfDay } from "date-fns";
import type { Credentials } from "google-auth-library";
import type { calendar_v3 } from "googleapis";

import {
  localGoogleAvatarUrl,
  localGoogleEmail,
  localGoogleFullName,
  localGoogleSubject,
} from "../config/app-config.ts";
import type {
  CreateCalendarEventInput,
  DeleteCalendarEventInput,
  GoogleCalendarSource,
  GoogleIntegrationProvider,
  GoogleUserProfile,
  MergedCalendarEvent,
  UpdateCalendarEventInput,
} from "./google-integration-provider.ts";

type LocalCalendar = {
  id: string;
  summary: string;
  events: Map<string, calendar_v3.Schema$Event>;
};

const localCode = "productiv-local-google-code";
const localCalendarId = "productiv-local-calendar";
const localCalendarSummary = "Productiv";

export class LocalGoogleIntegrationProvider implements GoogleIntegrationProvider {
  private readonly calendars = new Map<string, LocalCalendar>();
  private eventCounter = 1;

  getAuthUrl(input: { state?: string }): string {
    const params = new URLSearchParams({ code: localCode });

    if (input.state) {
      params.set("state", input.state);
    }

    return `/auth/google/callback?${params}`;
  }

  async exchangeCodeForTokens(_code: string): Promise<Credentials> {
    return {
      access_token: "productiv-local-access-token",
      expiry_date: Date.now() + 60 * 60 * 1000,
      refresh_token: "productiv-local-refresh-token",
      scope: "openid email profile https://www.googleapis.com/auth/calendar",
      token_type: "Bearer",
    };
  }

  async fetchProfileFromTokens(_tokens: Credentials): Promise<GoogleUserProfile> {
    return {
      googleSubject: localGoogleSubject,
      email: localGoogleEmail,
      fullName: localGoogleFullName,
      avatarUrl: localGoogleAvatarUrl,
    };
  }

  async getMergedCalendarEvents(
    _tokens: Credentials,
    startDate: Date,
    endDate: Date,
    calendarIds?: string[] | null,
  ): Promise<MergedCalendarEvent[]> {
    const minTime = startOfDay(startDate).getTime();
    const maxTime = addDays(startOfDay(endDate), 1).getTime();
    const includedCalendarIds = calendarIds ? new Set(calendarIds) : null;

    return Array.from(this.calendars.values())
      .filter((calendar) => !includedCalendarIds || includedCalendarIds.has(calendar.id))
      .flatMap((calendar) =>
        Array.from(calendar.events.values()).flatMap((event) => {
          const eventStart = new Date(
            event.start?.dateTime ?? event.start?.date ?? "",
          ).getTime();

          if (
            Number.isNaN(eventStart) ||
            eventStart < minTime ||
            eventStart >= maxTime
          ) {
            return [];
          }

          return [
            {
              ...event,
              sourceCalendarId: calendar.id,
              sourceCalendarName: calendar.summary,
            },
          ];
        }),
      )
      .sort(compareLocalCalendarEvents);
  }

  async listCalendars(_tokens: Credentials): Promise<GoogleCalendarSource[]> {
    const calendar = this.getOrCreateProductivCalendar();

    return [
      {
        id: calendar.id,
        summary: calendar.summary,
        primary: true,
        accessRole: "owner",
        backgroundColor: null,
      },
    ];
  }

  async createCalendarEvent(
    _tokens: Credentials,
    input: CreateCalendarEventInput,
  ) {
    const calendar = this.getOrCreateProductivCalendar();
    const id = `local-event-${this.eventCounter}`;
    this.eventCounter += 1;

    const event = {
      ...buildEvent(input),
      id,
    };

    calendar.events.set(id, event);

    return {
      ...event,
      sourceCalendarId: calendar.id,
      sourceCalendarName: calendar.summary,
    };
  }

  async updateCalendarEvent(
    _tokens: Credentials,
    input: UpdateCalendarEventInput,
  ) {
    const calendar = this.calendars.get(input.calendarId);
    const existingEvent = calendar?.events.get(input.eventId);

    if (!calendar || !existingEvent) {
      throw notFoundError("Local calendar event was not found.");
    }

    const event = {
      ...existingEvent,
      ...buildEvent(input),
      id: input.eventId,
    };
    calendar.events.set(input.eventId, event);

    return {
      ...event,
      sourceCalendarId: calendar.id,
      sourceCalendarName: calendar.summary,
    };
  }

  async deleteCalendarEvent(
    _tokens: Credentials,
    input: DeleteCalendarEventInput,
  ) {
    const calendar = this.calendars.get(input.calendarId);

    if (!calendar || !calendar.events.delete(input.eventId)) {
      throw notFoundError("Local calendar event was not found.");
    }
  }

  private getOrCreateProductivCalendar() {
    const existingCalendar = this.calendars.get(localCalendarId);

    if (existingCalendar) {
      return existingCalendar;
    }

    const calendar = {
      id: localCalendarId,
      summary: localCalendarSummary,
      events: new Map<string, calendar_v3.Schema$Event>(),
    };
    this.calendars.set(localCalendarId, calendar);
    return calendar;
  }
}

function buildEvent(input: CreateCalendarEventInput): calendar_v3.Schema$Event {
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

function compareLocalCalendarEvents(a: MergedCalendarEvent, b: MergedCalendarEvent) {
  const aStart = a.start?.dateTime ?? a.start?.date ?? "";
  const bStart = b.start?.dateTime ?? b.start?.date ?? "";
  return aStart.localeCompare(bStart);
}

function notFoundError(message: string) {
  return Object.assign(new Error(message), { code: 404 });
}
