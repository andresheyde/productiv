import { apiBaseUrl } from "@/features/shared/api/config";

type CreateGoogleCalendarEventInput = {
  authId: string;
  title?: string;
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
