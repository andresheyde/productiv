import { apiRequest } from "@/features/shared/api/request";
import type {
  AssistantThreadResponse,
  AssistantThreadsResponse,
  AssistantTurnMode,
  AssistantTurnResponse,
} from "@/features/assistant/types";

export async function fetchAssistantThreads(sessionToken?: string | null) {
  const response = await apiRequest("/assistant/threads", {
    sessionToken,
  });

  return (await response.json()) as AssistantThreadsResponse;
}

export async function createAssistantThread(sessionToken?: string | null) {
  const response = await apiRequest("/assistant/threads", {
    method: "POST",
    sessionToken,
  });

  return (await response.json()) as AssistantThreadResponse;
}

export async function fetchAssistantThread(
  input?: {
    threadId?: string | null;
    sessionToken?: string | null;
  } | string | null,
) {
  const threadId = typeof input === "string" ? input : input?.threadId;
  const sessionToken = typeof input === "string" ? undefined : input?.sessionToken;
  const response = await apiRequest(
    threadId ? `/assistant/threads/${threadId}` : "/assistant/thread",
    {
      sessionToken,
    },
  );

  return (await response.json()) as AssistantThreadResponse;
}

export async function deleteAssistantThread(
  input: {
    threadId: string;
    sessionToken?: string | null;
  },
) {
  await apiRequest(`/assistant/threads/${input.threadId}`, {
    method: "DELETE",
    sessionToken: input.sessionToken,
  });
}

export async function sendAssistantTurn(
  input: {
    message: string;
    mode?: AssistantTurnMode;
    threadId?: string | null;
    sessionToken?: string | null;
  },
) {
  const response = await apiRequest("/assistant/turn", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    sessionToken: input.sessionToken,
    body: JSON.stringify({
      message: input.message,
      mode: input.mode,
      threadId: input.threadId,
    }),
  });

  return (await response.json()) as AssistantTurnResponse;
}
