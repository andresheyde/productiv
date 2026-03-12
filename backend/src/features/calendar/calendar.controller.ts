import type { Request, Response } from "express";

import { getAuthTokens } from "../../shared/stores/auth-store.ts";
import { getMergedCalendarEvents } from "./calendar.service.ts";

interface CalendarEventsQuery {
  authId?: string;
}

export async function getCalendarEvents(
  req: Request<{}, {}, {}, CalendarEventsQuery>,
  res: Response,
) {
  const { authId } = req.query;

  if (typeof authId !== "string" || authId.length === 0) {
    return res.status(400).json({ error: "Missing authId parameter" });
  }

  const tokens = getAuthTokens(authId);

  if (!tokens) {
    return res.status(401).json({ error: "Invalid or expired authId" });
  }

  try {
    const mergedEvents = await getMergedCalendarEvents(tokens);
    return res.json(mergedEvents);
  } catch (error) {
    console.error("[Events] Failed to fetch calendar events", error);
    return res.status(500).json({ error: "Failed to fetch calendar events" });
  }
}
