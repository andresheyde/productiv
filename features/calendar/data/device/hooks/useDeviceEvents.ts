import { Event } from "expo-calendar";
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarEvent } from "../../../types";
import { getEventsAsync } from "../adapters/deviceCalendarAdapter";
import useDeviceCalendarPermissions from "./useDeviceCalendarPermissions";

export default function useDeviceEvents(
  calendarIds: string[],
  leftDate: Date,
  rightDate: Date,
) {
  const isMounted = useRef(true);
  const { permissions } = useDeviceCalendarPermissions();
  const blocked = !permissions.granted;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    if (blocked) {
      return;
    }
    setLoading(true);
    setError(null);
    getEventsAsync(calendarIds, leftDate, rightDate)
      .then((result) => {
        if (isMounted.current) {
          setLoading(false);
          setEvents(
            result.map((event) => {
              return transformDeviceEvent(event);
            }),
          );
        }
      })
      .catch((reason) => {
        if (isMounted.current) {
          setLoading(false);
          setError(
            reason instanceof Error ? reason : new Error(String(reason)),
          );
        }
      });
  }, [
    blocked,
    calendarIds.join("|"),
    leftDate.toString(),
    rightDate.toString(),
  ]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    deviceEvents: events,
    eventsLoading: loading,
    eventsError: error,
    eventsBlocked: blocked,
    eventsRefresh: refresh,
  };
}

function transformDeviceEvent(event: Event): CalendarEvent {
  return {
    title: event.title,
    id: event.id,
    startTime: new Date(event.startDate),
    endTime: new Date(event.endDate),
    description: event.notes ?? "",
    instanceId: event.instanceId,
    allDay: event.allDay ?? false,
    source: "device",
    sourceCalendarId: event.calendarId,
  };
}
