import { apiBaseUrl } from "@/features/shared/api/config";

type CreateGoogleCalendarEventInput = {
  authId: string;
  title?: string;
  description?: string;
  startTime: Date;
  endTime: Date;
};

type GoogleCalendarEventResponse = {
  id?: string | null;
};

export async function createGoogleCalendarEvent(
  input: CreateGoogleCalendarEventInput,
) {
  const response = await fetch(`${apiBaseUrl}/calendar/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      authId: input.authId,
      title: input.title,
      description: input.description,
      startTime: input.startTime.toISOString(),
      endTime: input.endTime.toISOString(),
    }),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;

    throw new Error(errorBody?.error ?? "Failed to create Google Calendar event");
  }

  return (await response.json()) as GoogleCalendarEventResponse;
}

type UpdateGoogleCalendarEventInput = CreateGoogleCalendarEventInput & {
  eventId: string;
  sourceCalendarId: string;
};

export async function updateGoogleCalendarEvent(
  input: UpdateGoogleCalendarEventInput,
) {
  const response = await fetch(`${apiBaseUrl}/calendar/events/${input.eventId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      authId: input.authId,
      title: input.title,
      description: input.description,
      sourceCalendarId: input.sourceCalendarId,
      startTime: input.startTime.toISOString(),
      endTime: input.endTime.toISOString(),
    }),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;

    throw new Error(errorBody?.error ?? "Failed to update Google Calendar event");
  }

  return (await response.json()) as GoogleCalendarEventResponse;
}

type DeleteGoogleCalendarEventInput = {
  authId: string;
  eventId: string;
  sourceCalendarId: string;
};

export async function deleteGoogleCalendarEvent(
  input: DeleteGoogleCalendarEventInput,
) {
  const params = new URLSearchParams({
    authId: input.authId,
    sourceCalendarId: input.sourceCalendarId,
  });

  const response = await fetch(
    `${apiBaseUrl}/calendar/events/${input.eventId}?${params}`,
    {
      method: "DELETE",
    },
  );

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;

    throw new Error(errorBody?.error ?? "Failed to delete Google Calendar event");
  }
}
