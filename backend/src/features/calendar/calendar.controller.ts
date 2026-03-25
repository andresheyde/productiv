import {
  differenceInCalendarDays,
  isBefore,
  isValid,
  startOfDay,
} from "date-fns";
import type { Request, Response } from "express";

import { maxScheduleRangeDays } from "../../shared/config/app-config.ts";
import { getAuthTokens } from "../../shared/stores/auth-store.ts";
import {
  createGoogleCalendarEvent,
  getMergedCalendarEvents,
} from "./calendar.service.ts";

interface CalendarEventsQuery {
  authId?: string;
  startDate?: string;
  endDate?: string;
}

interface CreateCalendarEventBody {
  authId?: string;
  title?: string;
  startTime?: string;
  endTime?: string;
}

export async function getCalendarEvents(
  req: Request<{}, {}, {}, CalendarEventsQuery>,
  res: Response,
) {
  const { authId, startDate, endDate } = req.query;

  if (typeof authId !== "string" || authId.length === 0) {
    return res.status(400).json({ error: "Missing authId parameter" });
  }

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

  const tokens = getAuthTokens(authId);

  if (!tokens) {
    return res.status(401).json({ error: "Invalid or expired authId" });
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

export async function createCalendarEvent(
  req: Request<{}, {}, CreateCalendarEventBody>,
  res: Response,
) {
  const { authId, title, startTime, endTime } = req.body;

  if (typeof authId !== "string" || authId.length === 0) {
    return res.status(400).json({ error: "Missing authId" });
  }

  if (typeof startTime !== "string" || typeof endTime !== "string") {
    return res.status(400).json({ error: "Missing startTime or endTime" });
  }

  const parsedStartTime = new Date(startTime);
  const parsedEndTime = new Date(endTime);

  if (!isValid(parsedStartTime) || !isValid(parsedEndTime)) {
    return res.status(400).json({ error: "Invalid startTime or endTime" });
  }

  if (!isBefore(parsedStartTime, parsedEndTime)) {
    return res.status(400).json({ error: "endTime must be after startTime" });
  }

  const tokens = getAuthTokens(authId);

  if (!tokens) {
    return res.status(401).json({ error: "Invalid or expired authId" });
  }

  try {
    const createdEvent = await createGoogleCalendarEvent(tokens, {
      title:
        typeof title === "string" && title.trim().length > 0
          ? title.trim()
          : "Untitled event",
      startTime: parsedStartTime,
      endTime: parsedEndTime,
    });

    return res.status(201).json(createdEvent);
  } catch (error) {
    console.error("[Events] Failed to create calendar event", error);
    return res.status(500).json({ error: "Failed to create calendar event" });
  }
}
