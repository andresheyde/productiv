import { Router } from "express";

import {
  getAssistantThread,
  postAssistantTurn,
} from "./assistant.controller.ts";

export const assistantRouter = Router();

assistantRouter.get("/assistant/thread", getAssistantThread);
assistantRouter.post("/assistant/turn", postAssistantTurn);
