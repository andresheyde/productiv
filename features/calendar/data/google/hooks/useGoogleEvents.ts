import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/features/auth/AuthProvider";
import {
  fetchScheduleEvents,
  type BackendScheduleEvent,
} from "@/features/schedule/api/scheduleApi";
import { ApiError } from "@/features/shared/api/request";

import type { CalendarEvent } from "../../../types";

const GOOGLE_EVENTS_REFRESH_INTERVAL_MS = 30000;

export default function useGoogleEvents(leftDate: Date, rightDate: Date) {
  const isMounted = useRef(true);
  const { clearSession, isAuthenticated, sessionToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setEvents([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await fetchScheduleEvents(leftDate, rightDate, sessionToken);

      if (isMounted.current) {
        setEvents(result.map(mapBackendScheduleEventToCalendarEvent));
        setLoading(false);
      }
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) {
        await clearSession();

        if (isMounted.current) {
          setEvents([]);
          setLoading(false);
          setError(new Error("Your Google session expired. Connect Google again."));
        }

        return;
      }

      if (isMounted.current) {
        setLoading(false);
        setError(reason instanceof Error ? reason : new Error(String(reason)));
      }
    }
  }, [
    clearSession,
    isAuthenticated,
    leftDate.toISOString(),
    rightDate.toISOString(),
    sessionToken,
  ]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const intervalId = setInterval(() => {
      refresh();
    }, GOOGLE_EVENTS_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [isAuthenticated, refresh]);

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
