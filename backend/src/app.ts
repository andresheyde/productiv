import express from "express";

import { authRouter } from "./features/auth/auth.routes.ts";
import { calendarRouter } from "./features/calendar/calendar.routes.ts";

export const app = express();

app.get("/", (_req, res) => {
  res.redirect("/auth/google");
});

app.use(authRouter);
app.use(calendarRouter);
