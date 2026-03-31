import type { Request, Response } from "express";

import { runPlanningTurn } from "./planning.service.ts";
import {
  createEmptyDraftPlanningState,
  type DraftPlanningState,
  type PlanningChatMessage,
} from "./planning.types.ts";
import { normalizeDraftPlanningState } from "./planning.validation.ts";

interface PlanningTurnBody {
  chatHistory?: PlanningChatMessage[];
  currentDraftPlanningState?: DraftPlanningState;
}

export async function postPlanningTurn(
  req: Request<{}, {}, PlanningTurnBody>,
  res: Response,
) {
  const chatHistory = normalizeChatHistory(req.body.chatHistory);

  if (chatHistory.length === 0) {
    return res
      .status(400)
      .json({ error: "chatHistory must include at least one message." });
  }

  if (!chatHistory.some((message) => message.role === "user")) {
    return res
      .status(400)
      .json({ error: "chatHistory must include at least one user message." });
  }

  try {
    const result = await runPlanningTurn({
      chatHistory,
      currentDraftPlanningState: normalizeDraftPlanningState(
        req.body.currentDraftPlanningState,
        createEmptyDraftPlanningState(),
      ),
    });

    return res.json(result);
  } catch (error) {
    console.error("[Planning] Failed to process planning turn", error);

    return res.status(500).json({
      assistantMessage:
        "I hit a problem while processing that planning turn. Try again after checking the AI backend configuration.",
      draftPlanningState: createEmptyDraftPlanningState(),
      generatedPlan: null,
      status: "error",
      error:
        error instanceof Error
          ? error.message
          : "Unexpected planning orchestration error.",
    });
  }
}

function normalizeChatHistory(value: unknown): PlanningChatMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const role = "role" in item ? item.role : undefined;
    const content = "content" in item ? item.content : undefined;

    if (
      (role !== "user" && role !== "assistant") ||
      typeof content !== "string" ||
      content.trim().length === 0
    ) {
      return [];
    }

    return [
      {
        role,
        content: content.trim(),
      },
    ];
  });
}
