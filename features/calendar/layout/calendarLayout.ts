import { addDays, differenceInMinutes, startOfDay } from "date-fns";

export const DEFAULT_HOUR_HEIGHT = 100;
export const DEFAULT_GRID_HEIGHT = DEFAULT_HOUR_HEIGHT * 24;
export const DEFAULT_VISIBLE_START_HOUR = 6;
export const DEFAULT_VISIBLE_END_HOUR = 22;
export const STICKY_HEADER_HEIGHT = 75;
export const HEADER_BUTTON_BAR_HEIGHT = 28;
export const ALL_DAY_EVENTS_HEADER_HEIGHT = 50;
export const ALL_DAY_EVENT_HEIGHT = 20;
export const TIME_GUTTER_WIDTH = 40;
export const TIME_GUTTER_HEIGHT = 25;
export const EVENT_EDITOR_POPUP_HEIGHT = 360;
export const MIN_READABLE_DAY_COLUMN_WIDTH = 118;

export const HOURS = 24;
export const MINUTES = 60;

export type CalendarTimeWindow = {
  startHour: number;
  endHour: number;
};

export function getResponsiveCalendarDayCount(availableWidth: number) {
  const contentWidth = Math.max(0, availableWidth - TIME_GUTTER_WIDTH);

  if (contentWidth >= MIN_READABLE_DAY_COLUMN_WIDTH * 7) {
    return 7;
  }

  if (contentWidth >= MIN_READABLE_DAY_COLUMN_WIDTH * 5) {
    return 5;
  }

  if (contentWidth >= MIN_READABLE_DAY_COLUMN_WIDTH * 3) {
    return 3;
  }

  return 1;
}

export function getCalendarColumnWidth(
  availableWidth: number,
  numDays: number,
) {
  if (numDays <= 0) {
    throw new Error(`Invalid numDays: ${numDays}`);
  }

  return Math.max(
    0,
    (Math.max(availableWidth, TIME_GUTTER_WIDTH) - TIME_GUTTER_WIDTH) / numDays,
  );
}

export function timeToY(
  hour: number,
  minute: number = 0,
  hourHeight = DEFAULT_HOUR_HEIGHT,
  startHour = 0,
) {
  return (hour - startHour) * hourHeight + (minute / MINUTES) * hourHeight;
}

export function minutesToY(minutes: number, hourHeight = DEFAULT_HOUR_HEIGHT) {
  return (minutes * hourHeight) / 60;
}

export function dateToY(
  date: Date,
  hourHeight = DEFAULT_HOUR_HEIGHT,
  startHour = 0,
) {
  return minutesToY(
    differenceInMinutes(date, startOfDay(date)) - startHour * MINUTES,
    hourHeight,
  );
}

export function yToMinutes(
  y: number,
  hourHeight = DEFAULT_HOUR_HEIGHT,
  timeWindow: CalendarTimeWindow = {
    startHour: 0,
    endHour: HOURS,
  },
) {
  if (hourHeight <= 0) {
    throw new Error(`Invalid hourHeight: ${hourHeight}`);
  }
  const gridHeight = getCalendarGridHeight(timeWindow, hourHeight);
  const clampedY = Math.min(Math.max(y, 0), gridHeight);
  return Math.floor((clampedY / hourHeight) * MINUTES) +
    timeWindow.startHour * MINUTES;
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
  timeWindow?: CalendarTimeWindow,
) {
  const startMinute = Math.floor(yToMinutes(y, DEFAULT_HOUR_HEIGHT, timeWindow) / 5) * 5;
  const hour = Math.floor(startMinute / 60);
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

export function getDefaultCalendarTimeWindow(): CalendarTimeWindow {
  return {
    startHour: DEFAULT_VISIBLE_START_HOUR,
    endHour: DEFAULT_VISIBLE_END_HOUR,
  };
}

export function getCalendarGridHeight(
  timeWindow: CalendarTimeWindow,
  hourHeight = DEFAULT_HOUR_HEIGHT,
) {
  return Math.max(1, timeWindow.endHour - timeWindow.startHour) * hourHeight;
}

export function getCalendarTimeWindowFromEvents(
  events: Array<{ startTime: Date; endTime: Date }>,
): CalendarTimeWindow {
  let startHour = DEFAULT_VISIBLE_START_HOUR;
  let endHour = DEFAULT_VISIBLE_END_HOUR;

  for (const event of events) {
    if (
      !Number.isFinite(event.startTime.getTime()) ||
      !Number.isFinite(event.endTime.getTime())
    ) {
      continue;
    }

    if (
      startOfDay(event.startTime).getTime() !==
      startOfDay(event.endTime).getTime()
    ) {
      startHour = 0;
      endHour = HOURS;
      continue;
    }

    startHour = Math.min(startHour, event.startTime.getHours());
    endHour = Math.max(endHour, getEventEndHour(event.endTime));
  }

  return normalizeCalendarTimeWindow({
    startHour,
    endHour,
  });
}

function getEventEndHour(endTime: Date) {
  const endHour = endTime.getHours() + (endTime.getMinutes() > 0 ? 1 : 0);

  return endHour === 0 ? HOURS : endHour;
}

export function normalizeCalendarTimeWindow(
  timeWindow: CalendarTimeWindow,
): CalendarTimeWindow {
  const startHour = Math.min(
    Math.max(Math.floor(timeWindow.startHour), 0),
    HOURS - 1,
  );
  const endHour = Math.min(
    Math.max(Math.ceil(timeWindow.endHour), startHour + 1),
    HOURS,
  );

  return {
    startHour,
    endHour,
  };
}
