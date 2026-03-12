import { apiBaseUrl } from "@/features/shared/api/config";

export type BackendScheduleEvent = {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
};

type GoogleCalendarApiEvent = {
  id?: string | null;
  summary?: string | null;
  start?: {
    date?: string | null;
    dateTime?: string | null;
  } | null;
  end?: {
    date?: string | null;
    dateTime?: string | null;
  } | null;
};

export async function fetchScheduleEvents(
  authId: string,
  startDate: Date,
  endDate: Date,
) {
  const params = new URLSearchParams({
    authId,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  });

  const response = await fetch(`${apiBaseUrl}/calendar/events?${params}`);

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;

    throw new Error(errorBody?.error ?? "Failed to fetch schedule events");
  }

  const payload = (await response.json()) as GoogleCalendarApiEvent[];
  return payload
    .map(mapGoogleEventToScheduleEvent)
    .filter(
      (event): event is BackendScheduleEvent =>
        event !== null &&
        !Number.isNaN(event.startTime.getTime()) &&
        !Number.isNaN(event.endTime.getTime()),
    );
}

function mapGoogleEventToScheduleEvent(
  event: GoogleCalendarApiEvent,
): BackendScheduleEvent | null {
  const startSource = event.start?.dateTime ?? event.start?.date;
  const endSource = event.end?.dateTime ?? event.end?.date;

  if (!event.id || !startSource || !endSource) {
    return null;
  }

  return {
    id: event.id,
    title: event.summary?.trim() || "Untitled event",
    startTime: new Date(startSource),
    endTime: new Date(endSource),
  };
}
