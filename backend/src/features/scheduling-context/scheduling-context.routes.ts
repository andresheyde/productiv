import { Router } from "express";

import {
  acceptSchedulingSuggestion,
  dismissSchedulingSuggestion,
  getSchedulingSuggestions,
  getUserSchedulingContext,
  patchSchedulingContext,
} from "./scheduling-context.controller.ts";

export const schedulingContextRouter = Router();

schedulingContextRouter.get("/user-scheduling-context", getUserSchedulingContext);
schedulingContextRouter.patch("/user-scheduling-context", patchSchedulingContext);
schedulingContextRouter.get(
  "/user-scheduling-context/suggestions",
  getSchedulingSuggestions,
);
schedulingContextRouter.post(
  "/user-scheduling-context/suggestions/:suggestionId/accept",
  acceptSchedulingSuggestion,
);
schedulingContextRouter.post(
  "/user-scheduling-context/suggestions/:suggestionId/dismiss",
  dismissSchedulingSuggestion,
);
