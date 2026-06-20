import { apiRequest } from "@/features/shared/api/request";
import { parseDateForDisplay } from "@/features/shared/utils/dateTime";

export type BackendScheduleEvent = {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  allDay: boolean;
  description: string;
  sourceCalendarId: string;
  sourceCalendarName: string;
};

type GoogleCalendarApiEvent = {
  id?: string | null;
  summary?: string | null;
  description?: string | null;
  start?: {
    date?: string | null;
    dateTime?: string | null;
  } | null;
  end?: {
    date?: string | null;
    dateTime?: string | null;
  } | null;
  sourceCalendarId?: string | null;
  sourceCalendarName?: string | null;
};

export async function fetchScheduleEvents(
  startDate: Date,
  endDate: Date,
  sessionToken?: string | null,
) {
  const params = new URLSearchParams({
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  });

  const response = await apiRequest(`/calendar/events?${params}`, {
    sessionToken,
  });

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

  const startTime = parseDateForDisplay(startSource);
  const endTime = parseDateForDisplay(endSource);

  if (!startTime || !endTime) {
    return null;
  }

  return {
    id: event.id,
    title: event.summary?.trim() || "Untitled event",
    startTime,
    endTime,
    allDay: !event.start?.dateTime || !event.end?.dateTime,
    description: event.description?.trim() || "",
    sourceCalendarId: event.sourceCalendarId ?? "primary",
    sourceCalendarName: event.sourceCalendarName ?? "Primary",
  };
}
