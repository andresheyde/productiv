import express from "express";
import type { Request, Response, NextFunction } from "express";

import { assistantRouter } from "./features/assistant/assistant.routes.ts";
import { authRouter } from "./features/auth/auth.routes.ts";
import { calendarRouter } from "./features/calendar/calendar.routes.ts";
import { planningRouter } from "./features/planning/planning.routes.ts";
import { schedulingContextRouter } from "./features/scheduling-context/scheduling-context.routes.ts";
import { workspaceRouter } from "./features/workspace/workspace.routes.ts";
import { isProduction, webAppOrigin } from "./shared/config/app-config.ts";

export const app = express();

app.use(express.json());

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.header("origin");
  const isAllowedOrigin = origin ? isAllowedCorsOrigin(origin) : true;

  if (origin) {
    res.header("Vary", "Origin");
  }

  if (origin && isAllowedOrigin) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Authorization,Content-Type");
  }

  if (req.method === "OPTIONS") {
    if (!isAllowedOrigin) {
      return res.status(403).json({ error: "Origin not allowed" });
    }

    return res.sendStatus(204);
  }

  if (origin && !isAllowedOrigin) {
    return res.status(403).json({ error: "Origin not allowed" });
  }

  next();
});

app.get("/", (_req, res) => {
  res.redirect("/auth/google");
});

app.use(authRouter);
app.use(assistantRouter);
app.use(calendarRouter);
app.use(planningRouter);
app.use(schedulingContextRouter);
app.use(workspaceRouter);

export default app;

function isAllowedCorsOrigin(origin: string) {
  if (origin === webAppOrigin) {
    return true;
  }

  return !isProduction && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/u.test(origin);
}
