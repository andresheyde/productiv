export type CalendarEvent = {
  id: string;
  startTime: Date;
  endTime: Date;
  title?: string;
  instanceId?: string;
};

export function calendarEventToString(event: CalendarEvent) {
  return `{id: ${event.id}, title: ${event.title}, startTime: ${event.startTime}, endTime: ${event.endTime}}`;
}
