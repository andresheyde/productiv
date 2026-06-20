import type { Credentials } from "google-auth-library";
import type { calendar_v3 } from "googleapis";

export type GoogleUserProfile = {
  googleSubject: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
};

export interface MergedCalendarEvent extends calendar_v3.Schema$Event {
  sourceCalendarId: string;
  sourceCalendarName: string;
}

export type GoogleCalendarSource = {
  id: string;
  summary: string;
  primary: boolean;
  accessRole: string | null;
  backgroundColor: string | null;
};

export interface CreateCalendarEventInput {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
}

export interface UpdateCalendarEventInput extends CreateCalendarEventInput {
  eventId: string;
  calendarId: string;
}

export interface DeleteCalendarEventInput {
  eventId: string;
  calendarId: string;
}

export interface GoogleIntegrationProvider {
  createCalendarEvent(
    tokens: Credentials,
    input: CreateCalendarEventInput,
  ): Promise<calendar_v3.Schema$Event & {
    sourceCalendarId?: string;
    sourceCalendarName?: string;
  }>;
  deleteCalendarEvent(
    tokens: Credentials,
    input: DeleteCalendarEventInput,
  ): Promise<void>;
  exchangeCodeForTokens(code: string): Promise<Credentials>;
  fetchProfileFromTokens(tokens: Credentials): Promise<GoogleUserProfile>;
  getAuthUrl(input: { redirectTo?: string; state?: string }): string;
  listCalendars(tokens: Credentials): Promise<GoogleCalendarSource[]>;
  getMergedCalendarEvents(
    tokens: Credentials,
    startDate: Date,
    endDate: Date,
    calendarIds?: string[] | null,
  ): Promise<MergedCalendarEvent[]>;
  updateCalendarEvent(
    tokens: Credentials,
    input: UpdateCalendarEventInput,
  ): Promise<calendar_v3.Schema$Event & {
    sourceCalendarId?: string;
    sourceCalendarName?: string;
  }>;
}
