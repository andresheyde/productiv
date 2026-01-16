import * as Calendar from 'expo-calendar';

export async function getDeviceCalendars() {
    return await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
}

export async function getDefaultDeviceCalendar() {
    return await Calendar.getDefaultCalendarAsync();
}