import { Router } from "express";

import { createCalendarEvent, getCalendarEvents } from "./calendar.controller.ts";

export const calendarRouter = Router();

calendarRouter.post("/calendar/events", createCalendarEvent);
calendarRouter.get("/calendar/events", getCalendarEvents);
