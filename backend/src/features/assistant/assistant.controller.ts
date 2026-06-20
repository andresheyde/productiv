import type { Request, Response } from "express";

import { resolveAuthenticatedRequest } from "../auth/auth-session.ts";
import {
  AssistantThreadNotFoundError,
  createAssistantThreadForUser,
  deleteAssistantThreadForUser,
  getAssistantThreadForUser,
  listAssistantThreadsForUser,
  runAssistantTurn,
} from "./assistant.service.ts";
import type { AssistantTurnMode } from "./assistant.types.ts";

type AssistantThreadParams = {
  threadId?: string;
};

type AssistantTurnBody = {
  message?: string;
  mode?: AssistantTurnMode;
  threadId?: string | null;
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

export async function getAssistantThreads(req: Request, res: Response) {
  try {
    const session = await resolveAuthenticatedRequest(req);

    if (!session) {
      return res.status(401).json({ error: "Authentication required" });
    }

    return res.json({ threads: await listAssistantThreadsForUser(session.user.id) });
  } catch (error) {
    return handleAssistantError(res, "load assistant threads", error);
  }
}

export async function createAssistantThread(req: Request, res: Response) {
  try {
    const session = await resolveAuthenticatedRequest(req);

    if (!session) {
      return res.status(401).json({ error: "Authentication required" });
    }

    return res.status(201).json(await createAssistantThreadForUser(session.user.id));
  } catch (error) {
    return handleAssistantError(res, "create assistant thread", error);
  }
}

export async function getAssistantThreadById(
  req: Request<AssistantThreadParams>,
  res: Response,
) {
  try {
    const session = await resolveAuthenticatedRequest(req);

    if (!session) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!req.params.threadId) {
      return res.status(400).json({ error: "Missing threadId" });
    }

    return res.json(
      await getAssistantThreadForUser(session.user.id, req.params.threadId),
    );
  } catch (error) {
    return handleAssistantError(res, "load assistant thread", error);
  }
}

export async function deleteAssistantThread(
  req: Request<AssistantThreadParams>,
  res: Response,
) {
  try {
    const session = await resolveAuthenticatedRequest(req);

    if (!session) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!req.params.threadId) {
      return res.status(400).json({ error: "Missing threadId" });
    }

    const didDelete = await deleteAssistantThreadForUser(
      session.user.id,
      req.params.threadId,
    );

    if (!didDelete) {
      return res.status(404).json({ error: "Assistant thread not found" });
    }

    return res.status(204).send();
  } catch (error) {
    return handleAssistantError(res, "delete assistant thread", error);
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
      req.body.mode === "chat" ||
      req.body.mode === "work_log" ||
      req.body.mode === "schedule_reflection"
        ? req.body.mode
        : undefined;

    return res.json(
      await runAssistantTurn({
        user: session.user,
        tokens: session.tokens,
        message: req.body.message,
        threadId:
          typeof req.body.threadId === "string" &&
          req.body.threadId.trim().length > 0
            ? req.body.threadId.trim()
            : null,
        ...(mode ? { mode } : {}),
      }),
    );
  } catch (error) {
    return handleAssistantError(res, "process assistant turn", error);
  }
}

function handleAssistantError(res: Response, action: string, error: unknown) {
  console.error(`[Assistant] Failed to ${action}`, error);

  if (error instanceof AssistantThreadNotFoundError) {
    return res.status(404).json({ error: error.message });
  }

  return res.status(500).json({
    error:
      error instanceof Error
        ? error.message
        : `Failed to ${action}`,
  });
}
