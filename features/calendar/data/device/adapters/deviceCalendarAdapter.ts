import * as Calendar from "expo-calendar";

export async function getDeviceCalendars() {
  return await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
}

export async function getDefaultDeviceCalendar() {
  return await Calendar.getDefaultCalendarAsync();
}

export async function getEventsAsync(
  calendarIds: string[],
  startDate: Date,
  endDate: Date,
) {
  return await Calendar.getEventsAsync(calendarIds, startDate, endDate);
}
