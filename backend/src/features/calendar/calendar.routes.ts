import { Router } from "express";

import {
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvents,
  updateCalendarEvent,
} from "./calendar.controller.ts";

export const calendarRouter = Router();

calendarRouter.post("/calendar/events", createCalendarEvent);
calendarRouter.patch("/calendar/events/:eventId", updateCalendarEvent);
calendarRouter.delete("/calendar/events/:eventId", deleteCalendarEvent);
calendarRouter.get("/calendar/events", getCalendarEvents);
