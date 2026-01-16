import * as Calendar from 'expo-calendar';

export async function requestDeviceCalendarPermissions() {
    return await Calendar.requestCalendarPermissionsAsync();
}

export async function getDeviceCalendarPermissions() {
    return await Calendar.getCalendarPermissionsAsync();
}