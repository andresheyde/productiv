import { Router } from "express";

import {
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarSources,
  getCalendarEvents,
  patchCalendarSources,
  updateCalendarEvent,
} from "./calendar.controller.ts";

export const calendarRouter = Router();

calendarRouter.get("/calendar/sources", getCalendarSources);
calendarRouter.patch("/calendar/sources", patchCalendarSources);
calendarRouter.post("/calendar/events", createCalendarEvent);
calendarRouter.patch("/calendar/events/:eventId", updateCalendarEvent);
calendarRouter.delete("/calendar/events/:eventId", deleteCalendarEvent);
calendarRouter.get("/calendar/events", getCalendarEvents);
