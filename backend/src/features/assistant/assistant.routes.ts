import { Router } from "express";

import {
  createAssistantThread,
  deleteAssistantThread,
  getAssistantThreadById,
  getAssistantThread,
  getAssistantThreads,
  postAssistantTurn,
} from "./assistant.controller.ts";

export const assistantRouter = Router();

assistantRouter.get("/assistant/thread", getAssistantThread);
assistantRouter.get("/assistant/threads", getAssistantThreads);
assistantRouter.post("/assistant/threads", createAssistantThread);
assistantRouter.get("/assistant/threads/:threadId", getAssistantThreadById);
assistantRouter.delete("/assistant/threads/:threadId", deleteAssistantThread);
assistantRouter.post("/assistant/turn", postAssistantTurn);
