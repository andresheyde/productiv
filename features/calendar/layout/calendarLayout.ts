
export const DEFAULT_HOUR_HEIGHT = 100;
export const DEFAULT_GRID_HEIGHT = DEFAULT_HOUR_HEIGHT * 24;
export const STICKY_HEADER_HEIGHT = 75;
export const TIME_GUTTER_WIDTH = 40;
export const TIME_GUTTER_HEIGHT = 25;

export const HOURS = 24;
export const MINUTES = 60;

export type Time = {
    hour: number,
    minute: number
}

export function timeToY(hour: number, minute: number = 0, hourHeight = DEFAULT_HOUR_HEIGHT) {
    return hour * hourHeight + (minute/MINUTES) * hourHeight
}

export function yToTime(y: number, hourHeight = DEFAULT_HOUR_HEIGHT): Time {
    if (hourHeight <= 0) {
        throw new Error(`Invalid hourHeight: ${hourHeight}`)
    }
    const clampedY = Math.min(Math.max(y, 0), DEFAULT_GRID_HEIGHT)
    return {
        hour: Math.floor(clampedY/hourHeight),
        minute: Math.floor((clampedY%hourHeight)*MINUTES/hourHeight),
    }
}