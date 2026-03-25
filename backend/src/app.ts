import express from "express";
import type { Request, Response, NextFunction } from "express";

import { authRouter } from "./features/auth/auth.routes.ts";
import { calendarRouter } from "./features/calendar/calendar.routes.ts";

export const app = express();

app.use(express.json());

app.use((_req: Request, res: Response, next: NextFunction) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");

  if (_req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.get("/", (_req, res) => {
  res.redirect("/auth/google");
});

app.use(authRouter);
app.use(calendarRouter);
