import {
  differenceInCalendarDays,
  isBefore,
  isValid,
  startOfDay,
} from "date-fns";
import type { Request, Response } from "express";

import { getSessionCredentialsFromRequest } from "../../shared/auth/session.ts";
import { maxScheduleRangeDays } from "../../shared/config/app-config.ts";
import { getMergedCalendarEvents } from "./calendar.service.ts";

interface CalendarEventsQuery {
  startDate?: string;
  endDate?: string;
}

export async function getCalendarEvents(req: Request, res: Response) {
  const { startDate, endDate } = req.query as CalendarEventsQuery;

  if (typeof startDate !== "string" || typeof endDate !== "string") {
    return res
      .status(400)
      .json({ error: "Missing startDate or endDate parameter" });
  }

  const parsedStartDate = startOfDay(new Date(startDate));
  const parsedEndDate = startOfDay(new Date(endDate));

  if (!isValid(parsedStartDate) || !isValid(parsedEndDate)) {
    return res.status(400).json({ error: "Invalid startDate or endDate" });
  }

  if (isBefore(parsedEndDate, parsedStartDate)) {
    return res
      .status(400)
      .json({ error: "endDate must be on or after startDate" });
  }

  const today = startOfDay(new Date());
  if (isBefore(parsedStartDate, today)) {
    return res.status(400).json({ error: "startDate must not be in the past" });
  }

  if (
    differenceInCalendarDays(parsedEndDate, parsedStartDate) >=
    maxScheduleRangeDays
  ) {
    return res
      .status(400)
      .json({ error: "Date range must be within 7 days" });
  }

  const tokens = getSessionCredentialsFromRequest(req);

  if (!tokens) {
    return res
      .status(401)
      .json({ error: "Missing, invalid, or expired Google session" });
  }

  try {
    const mergedEvents = await getMergedCalendarEvents(
      tokens,
      parsedStartDate,
      parsedEndDate,
    );
    return res.json(mergedEvents);
  } catch (error) {
    console.error("[Events] Failed to fetch calendar events", error);
    return res.status(500).json({ error: "Failed to fetch calendar events" });
  }
}
