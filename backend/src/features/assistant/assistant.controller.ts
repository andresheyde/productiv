import type { Request, Response } from "express";

import { resolveAuthenticatedRequest } from "../auth/auth-session.ts";
import { getAssistantThreadForUser, runAssistantTurn } from "./assistant.service.ts";
import type { AssistantTurnMode } from "./assistant.types.ts";

type AssistantTurnBody = {
  message?: string;
  mode?: AssistantTurnMode;
};

export async function getAssistantThread(req: Request, res: Response) {
  try {
    const session = await resolveAuthenticatedRequest(req);

    if (!session) {
      return res.status(401).json({ error: "Authentication required" });
    }

    return res.json(await getAssistantThreadForUser(session.user.id));
  } catch (error) {
    console.error("[Assistant] Failed to load assistant thread", error);
    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to load assistant thread",
    });
  }
}

export async function postAssistantTurn(
  req: Request<{}, {}, AssistantTurnBody>,
  res: Response,
) {
  const session = await resolveAuthenticatedRequest(req);

  if (!session) {
    return res.status(401).json({ error: "Authentication required" });
  }

  if (typeof req.body.message !== "string" || req.body.message.trim().length === 0) {
    return res.status(400).json({ error: "message must be a non-empty string" });
  }

  try {
    const mode =
      req.body.mode === "chat" || req.body.mode === "work_log"
        ? req.body.mode
        : undefined;

    return res.json(
      await runAssistantTurn({
        user: session.user,
        tokens: session.tokens,
        message: req.body.message,
        ...(mode ? { mode } : {}),
      }),
    );
  } catch (error) {
    console.error("[Assistant] Failed to process assistant turn", error);
    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to process assistant turn",
    });
  }
}
