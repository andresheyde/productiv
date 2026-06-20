import type { Credentials } from "google-auth-library";

import { getGoogleIntegrationProvider } from "../../shared/google/google-integration-factory.ts";
import type {
  CreateCalendarEventInput,
  DeleteCalendarEventInput,
  GoogleCalendarSource,
  MergedCalendarEvent,
  UpdateCalendarEventInput,
} from "../../shared/google/google-integration-provider.ts";

export type { MergedCalendarEvent };

export async function getMergedCalendarEvents(
  tokens: Credentials,
  startDate: Date,
  endDate: Date,
  calendarIds?: string[] | null,
): Promise<MergedCalendarEvent[]> {
  return getGoogleIntegrationProvider().getMergedCalendarEvents(
    tokens,
    startDate,
    endDate,
    calendarIds,
  );
}

export async function listGoogleCalendars(
  tokens: Credentials,
): Promise<GoogleCalendarSource[]> {
  return getGoogleIntegrationProvider().listCalendars(tokens);
}

export async function createGoogleCalendarEvent(
  tokens: Credentials,
  input: CreateCalendarEventInput,
) {
  return getGoogleIntegrationProvider().createCalendarEvent(tokens, input);
}

export async function updateGoogleCalendarEvent(
  tokens: Credentials,
  input: UpdateCalendarEventInput,
) {
  return getGoogleIntegrationProvider().updateCalendarEvent(tokens, input);
}

export async function deleteGoogleCalendarEvent(
  tokens: Credentials,
  input: DeleteCalendarEventInput,
) {
  return getGoogleIntegrationProvider().deleteCalendarEvent(tokens, input);
}
