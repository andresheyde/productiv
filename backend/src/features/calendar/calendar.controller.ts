import { differenceInCalendarDays, isBefore, isValid, startOfDay } from "date-fns";
import type { Request, Response } from "express";

import { getSessionCredentialsFromRequest } from "../../shared/auth/session.ts";
import { maxScheduleRangeDays } from "../../shared/config/app-config.ts";
import { resolveAuthenticatedRequest } from "../auth/auth-session.ts";
import {
  getIncludedCalendarIdsForUser,
  getUserCalendarPreferencesOrDefault,
  patchUserCalendarPreferences,
} from "./calendar-preferences.repository.ts";
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  getMergedCalendarEvents,
  listGoogleCalendars,
  updateGoogleCalendarEvent,
} from "./calendar.service.ts";

interface CalendarEventsQuery {
  startDate?: string;
  endDate?: string;
}

interface CreateCalendarEventBody {
  title?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
}

interface UpdateCalendarEventParams {
  eventId?: string;
}

interface UpdateCalendarEventBody extends CreateCalendarEventBody {
  sourceCalendarId?: string;
}

interface DeleteCalendarEventParams {
  eventId?: string;
}

interface DeleteCalendarEventQuery {
  sourceCalendarId?: string;
}

interface PatchCalendarSourcesBody {
  includedCalendarIds?: unknown;
}

export async function getCalendarEvents(
  req: Request<{}, {}, {}, CalendarEventsQuery>,
  res: Response,
) {
  const { startDate, endDate } = req.query;

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

  if (
    differenceInCalendarDays(parsedEndDate, parsedStartDate) >=
    maxScheduleRangeDays
  ) {
    return res
      .status(400)
      .json({ error: "Date range must be within 7 days" });
  }

  const session = await resolveAuthenticatedRequest(req);

  if (!session) {
    return res
      .status(401)
      .json({ error: "Missing, invalid, or expired Google session" });
  }

  try {
    const includedCalendarIds = await getIncludedCalendarIdsForUser(
      session.user.id,
    );
    const mergedEvents = await getMergedCalendarEvents(
      session.tokens,
      parsedStartDate,
      parsedEndDate,
      includedCalendarIds,
    );
    return res.json(mergedEvents);
  } catch (error) {
    if (isGoogleSessionError(error)) {
      return res
        .status(401)
        .json({ error: "Google session expired. Connect Google again." });
    }

    console.error("[Events] Failed to fetch calendar events", error);
    return res.status(500).json({ error: "Failed to fetch calendar events" });
  }
}

export async function getCalendarSources(req: Request, res: Response) {
  const session = await resolveAuthenticatedRequest(req);

  if (!session) {
    return res
      .status(401)
      .json({ error: "Missing, invalid, or expired Google session" });
  }

  try {
    const [calendars, preferences] = await Promise.all([
      listGoogleCalendars(session.tokens),
      getUserCalendarPreferencesOrDefault(session.user.id),
    ]);
    const includedIds = preferences.includedCalendarIds
      ? new Set(preferences.includedCalendarIds)
      : null;

    return res.json({
      calendars: calendars.map((calendar) => ({
        ...calendar,
        included: includedIds ? includedIds.has(calendar.id) : true,
      })),
      preferences,
    });
  } catch (error) {
    if (isGoogleSessionError(error)) {
      return res
        .status(401)
        .json({ error: "Google session expired. Connect Google again." });
    }

    console.error("[Calendars] Failed to fetch calendar sources", error);
    return res.status(500).json({ error: "Failed to fetch calendar sources" });
  }
}

export async function patchCalendarSources(
  req: Request<{}, {}, PatchCalendarSourcesBody>,
  res: Response,
) {
  const session = await resolveAuthenticatedRequest(req);

  if (!session) {
    return res
      .status(401)
      .json({ error: "Missing, invalid, or expired Google session" });
  }

  if (!("includedCalendarIds" in req.body)) {
    return res.status(400).json({ error: "Missing includedCalendarIds" });
  }

  try {
    const includedCalendarIds = getOptionalCalendarIds(
      req.body.includedCalendarIds,
    );
    const preferences = await patchUserCalendarPreferences({
      userId: session.user.id,
      includedCalendarIds,
    });
    const calendars = await listGoogleCalendars(session.tokens);
    const includedIds = preferences.includedCalendarIds
      ? new Set(preferences.includedCalendarIds)
      : null;

    return res.json({
      calendars: calendars.map((calendar) => ({
        ...calendar,
        included: includedIds ? includedIds.has(calendar.id) : true,
      })),
      preferences,
    });
  } catch (error) {
    if (isGoogleSessionError(error)) {
      return res
        .status(401)
        .json({ error: "Google session expired. Connect Google again." });
    }

    console.error("[Calendars] Failed to update calendar sources", error);
    return res.status(500).json({ error: "Failed to update calendar sources" });
  }
}

export async function createCalendarEvent(
  req: Request<{}, {}, CreateCalendarEventBody>,
  res: Response,
) {
  const { title, description, startTime, endTime } = req.body;

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

  const tokens = getSessionCredentialsFromRequest(req);

  if (!tokens) {
    return res
      .status(401)
      .json({ error: "Missing, invalid, or expired Google session" });
  }

  try {
    const createdEvent = await createGoogleCalendarEvent(tokens, {
      title:
        typeof title === "string" && title.trim().length > 0
          ? title.trim()
          : "Untitled event",
      startTime: parsedStartTime,
      endTime: parsedEndTime,
      ...(typeof description === "string" && description.trim().length > 0
        ? { description: description.trim() }
        : {}),
    });

    return res.status(201).json(createdEvent);
  } catch (error) {
    if (isGoogleSessionError(error)) {
      return res
        .status(401)
        .json({ error: "Google session expired. Connect Google again." });
    }

    console.error("[Events] Failed to create calendar event", error);
    return res.status(500).json({ error: "Failed to create calendar event" });
  }
}

export async function updateCalendarEvent(
  req: Request<UpdateCalendarEventParams, {}, UpdateCalendarEventBody>,
  res: Response,
) {
  const { eventId } = req.params;
  const { title, description, sourceCalendarId, startTime, endTime } = req.body;

  if (typeof eventId !== "string" || eventId.length === 0) {
    return res.status(400).json({ error: "Missing eventId" });
  }

  if (typeof sourceCalendarId !== "string" || sourceCalendarId.length === 0) {
    return res.status(400).json({ error: "Missing sourceCalendarId" });
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

  const tokens = getSessionCredentialsFromRequest(req);

  if (!tokens) {
    return res
      .status(401)
      .json({ error: "Missing, invalid, or expired Google session" });
  }

  try {
    const updatedEvent = await updateGoogleCalendarEvent(tokens, {
      eventId,
      calendarId: sourceCalendarId,
      title:
        typeof title === "string" && title.trim().length > 0
          ? title.trim()
          : "Untitled event",
      startTime: parsedStartTime,
      endTime: parsedEndTime,
      ...(typeof description === "string" && description.trim().length > 0
        ? { description: description.trim() }
        : {}),
    });

    return res.json(updatedEvent);
  } catch (error) {
    if (isGoogleSessionError(error)) {
      return res
        .status(401)
        .json({ error: "Google session expired. Connect Google again." });
    }

    console.error("[Events] Failed to update calendar event", error);
    return res.status(500).json({ error: "Failed to update calendar event" });
  }
}

export async function deleteCalendarEvent(
  req: Request<DeleteCalendarEventParams, {}, {}, DeleteCalendarEventQuery>,
  res: Response,
) {
  const { eventId } = req.params;
  const { sourceCalendarId } = req.query;

  if (typeof eventId !== "string" || eventId.length === 0) {
    return res.status(400).json({ error: "Missing eventId" });
  }

  if (typeof sourceCalendarId !== "string" || sourceCalendarId.length === 0) {
    return res.status(400).json({ error: "Missing sourceCalendarId" });
  }

  const tokens = getSessionCredentialsFromRequest(req);

  if (!tokens) {
    return res
      .status(401)
      .json({ error: "Missing, invalid, or expired Google session" });
  }

  try {
    await deleteGoogleCalendarEvent(tokens, {
      eventId,
      calendarId: sourceCalendarId,
    });

    return res.status(204).send();
  } catch (error) {
    const status = getRemoteErrorStatus(error);

    if (status === 404 || status === 410) {
      return res.status(204).send();
    }

    if (isGoogleSessionError(error)) {
      return res
        .status(401)
        .json({ error: "Google session expired. Connect Google again." });
    }

    console.error("[Events] Failed to delete calendar event", error);
    return res.status(500).json({ error: "Failed to delete calendar event" });
  }
}

function isGoogleSessionError(error: unknown) {
  const status = getRemoteErrorStatus(error);
  return status === 401 || status === 403;
}

function getRemoteErrorStatus(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof error.response === "object" &&
    error.response !== null &&
    "status" in error.response &&
    typeof error.response.status === "number"
  ) {
    return error.response.status;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "number"
  ) {
    return error.code;
  }

  return undefined;
}

function getOptionalCalendarIds(value: unknown): string[] | null {
  if (value === null) {
    return null;
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  );
}
