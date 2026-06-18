import { apiRequest } from "@/features/shared/api/request";

type CreateGoogleCalendarEventInput = {
  title?: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  sessionToken?: string | null;
};

type GoogleCalendarEventResponse = {
  id?: string | null;
  sourceCalendarId?: string | null;
  sourceCalendarName?: string | null;
};

export async function createGoogleCalendarEvent(
  input: CreateGoogleCalendarEventInput,
) {
  const response = await apiRequest("/calendar/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    sessionToken: input.sessionToken,
    body: JSON.stringify({
      title: input.title,
      description: input.description,
      startTime: input.startTime.toISOString(),
      endTime: input.endTime.toISOString(),
    }),
  });

  return (await response.json()) as GoogleCalendarEventResponse;
}

type UpdateGoogleCalendarEventInput = CreateGoogleCalendarEventInput & {
  eventId: string;
  sourceCalendarId: string;
};

export async function updateGoogleCalendarEvent(
  input: UpdateGoogleCalendarEventInput,
) {
  const response = await apiRequest(`/calendar/events/${input.eventId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    sessionToken: input.sessionToken,
    body: JSON.stringify({
      title: input.title,
      description: input.description,
      sourceCalendarId: input.sourceCalendarId,
      startTime: input.startTime.toISOString(),
      endTime: input.endTime.toISOString(),
    }),
  });

  return (await response.json()) as GoogleCalendarEventResponse;
}

type DeleteGoogleCalendarEventInput = {
  eventId: string;
  sourceCalendarId: string;
  sessionToken?: string | null;
};

export async function deleteGoogleCalendarEvent(
  input: DeleteGoogleCalendarEventInput,
) {
  const params = new URLSearchParams({
    sourceCalendarId: input.sourceCalendarId,
  });

  await apiRequest(`/calendar/events/${input.eventId}?${params}`, {
    method: "DELETE",
    sessionToken: input.sessionToken,
  });
}
