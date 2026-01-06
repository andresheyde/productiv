
export const DEFAULT_HOUR_HEIGHT = 100;
export const DEFAULT_GRID_HEIGHT = DEFAULT_HOUR_HEIGHT * 24;
export const STICKY_HEADER_HEIGHT = 75;
export const TIME_GUTTER_WIDTH = 40;
export const TIME_GUTTER_HEIGHT = 25;

export const HOURS = 24;

export function timeToY(hour: number, minute: number = 0, hourHeight = DEFAULT_HOUR_HEIGHT) {
    return hour * hourHeight + (minute/60) * hourHeight
}