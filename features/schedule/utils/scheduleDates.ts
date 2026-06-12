import { addDays, differenceInCalendarDays, isBefore, startOfDay } from "date-fns";

const MAX_RANGE_IN_DAYS = 7;

export function getDefaultScheduleStartDate() {
  return startOfDay(new Date());
}

export function getDefaultScheduleEndDate(today: Date) {
  return addDays(today, 2);
}

export function getValidationMessage(startDate: Date, endDate: Date, today: Date) {
  if (isBefore(startDate, today)) {
    return "Start date must be today or later.";
  }

  if (isBefore(endDate, startDate)) {
    return "End date must be on or after the start date.";
  }

  if (differenceInCalendarDays(endDate, startDate) >= MAX_RANGE_IN_DAYS) {
    return "Date range must stay within 7 days.";
  }

  return null;
}

export function getAvailableDates(today: Date, numberOfDays: number) {
  return Array.from({ length: numberOfDays }, (_, index) =>
    addDays(today, index),
  );
}

export function normalizeScheduleDate(date: Date) {
  return startOfDay(date);
}
