export type CalendarEventSource = "productiv" | "google" | "device";

export type CalendarEvent = {
  id: string;
  startTime: Date;
  endTime: Date;
  title?: string;
  description?: string;
  instanceId?: string;
  allDay?: boolean;
  source: CalendarEventSource;
  googleCalendarEventId?: string;
  sourceCalendarId?: string;
  sourceCalendarName?: string;
};

export function calendarEventToString(event: CalendarEvent) {
  return `{id: ${event.id}, title: ${event.title}, startTime: ${event.startTime}, endTime: ${event.endTime}}`;
}
