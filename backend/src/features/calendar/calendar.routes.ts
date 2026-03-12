import { Router } from "express";

import { getCalendarEvents } from "./calendar.controller.ts";

export const calendarRouter = Router();

calendarRouter.get("/calendar/events", getCalendarEvents);
