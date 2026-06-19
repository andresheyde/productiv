import { Router } from "express";

import {
  addMetricEntry,
  getGoals,
  getMetrics,
  getTasks,
  getWorkLogs,
  updateGoal,
  updateMetric,
  updateTask,
} from "./workspace.controller.ts";

export const workspaceRouter = Router();

workspaceRouter.get("/goals", getGoals);
workspaceRouter.patch("/goals/:goalId", updateGoal);
workspaceRouter.get("/tasks", getTasks);
workspaceRouter.patch("/tasks/:taskId", updateTask);
workspaceRouter.get("/metrics", getMetrics);
workspaceRouter.patch("/metrics/:metricId", updateMetric);
workspaceRouter.post("/metrics/:metricId/entries", addMetricEntry);
workspaceRouter.get("/work-logs", getWorkLogs);
