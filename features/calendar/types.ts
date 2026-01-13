

export type CalendarEvent = {
    id: string,
    dayIndex: number,
    startMinute: number,
    endMinute: number,
    title?: string,
    selected?: boolean,
}