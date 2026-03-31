import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchScheduleEvents,
  type BackendScheduleEvent,
} from "@/features/schedule/api/scheduleApi";

import type { CalendarEvent } from "../../../types";

const GOOGLE_EVENTS_REFRESH_INTERVAL_MS = 30000;

export default function useGoogleEvents(
  authId: string | null,
  leftDate: Date,
  rightDate: Date,
) {
  const isMounted = useRef(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!authId) {
      setEvents([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await fetchScheduleEvents(authId, leftDate, rightDate);

      if (isMounted.current) {
        setEvents(result.map(mapBackendScheduleEventToCalendarEvent));
        setLoading(false);
      }
    } catch (reason) {
      if (isMounted.current) {
        setLoading(false);
        setError(reason instanceof Error ? reason : new Error(String(reason)));
      }
    }
  }, [authId, leftDate.toISOString(), rightDate.toISOString()]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!authId) {
      return;
    }

    const intervalId = setInterval(() => {
      refresh();
    }, GOOGLE_EVENTS_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [authId, refresh]);

  return {
    googleEvents: events,
    googleEventsLoading: loading,
    googleEventsError: error,
    googleEventsRefresh: refresh,
  };
}

function mapBackendScheduleEventToCalendarEvent(
  event: BackendScheduleEvent,
): CalendarEvent {
  return {
    id: `google:${event.id}`,
    googleCalendarEventId: event.id,
    title: event.title,
    description: event.description,
    startTime: event.startTime,
    endTime: event.endTime,
    allDay: event.allDay,
    source: "google",
    sourceCalendarId: event.sourceCalendarId,
    sourceCalendarName: event.sourceCalendarName,
  };
}
