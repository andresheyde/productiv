import { addDays, differenceInMinutes, startOfDay } from "date-fns";

export const DEFAULT_HOUR_HEIGHT = 100;
export const DEFAULT_GRID_HEIGHT = DEFAULT_HOUR_HEIGHT * 24;
export const STICKY_HEADER_HEIGHT = 75;
export const HEADER_BUTTON_BAR_HEIGHT = 28;
export const TIME_GUTTER_WIDTH = 40;
export const TIME_GUTTER_HEIGHT = 25;
export const EVENT_EDITOR_POPUP_HEIGHT = 100;

export const HOURS = 24;
export const MINUTES = 60;

export function timeToY(
  hour: number,
  minute: number = 0,
  hourHeight = DEFAULT_HOUR_HEIGHT,
) {
  return hour * hourHeight + (minute / MINUTES) * hourHeight;
}

export function minutesToY(minutes: number, hourHeight = DEFAULT_HOUR_HEIGHT) {
  return (minutes * hourHeight) / 60;
}

export function dateToY(date: Date, hourHeight = DEFAULT_HOUR_HEIGHT) {
  return minutesToY(differenceInMinutes(date, startOfDay(date)));
}

export function yToMinutes(y: number, hourHeight = DEFAULT_HOUR_HEIGHT) {
  if (hourHeight <= 0) {
    throw new Error(`Invalid hourHeight: ${hourHeight}`);
  }
  const clampedY = Math.min(Math.max(y, 0), DEFAULT_GRID_HEIGHT);
  return Math.floor((clampedY / hourHeight) * MINUTES);
}

export function xToDayIndex(x: number, numDays: number, columnWidth: number) {
  if (columnWidth === 0) {
    throw new Error(`Invalid columnSize: ${columnWidth}`);
  }
  const roundedX = Math.min(Math.max(x, 0), columnWidth * (numDays - 1));
  return Math.floor(roundedX / columnWidth);
}

export function xAndYToDate(
  x: number,
  y: number,
  numDays: number,
  columnWidth: number,
  leftDate: Date,
) {
  const startMinute = Math.floor(yToMinutes(y) / 5) * 5;
  const hour = startMinute / 60;
  const minute = startMinute % 60;
  const dayIndex = xToDayIndex(x, numDays, columnWidth);
  const date = addDays(leftDate, dayIndex);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hour,
    minute,
  );
}
