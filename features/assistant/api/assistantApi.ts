import { apiRequest } from "@/features/shared/api/request";
import type {
  AssistantThreadResponse,
  AssistantTurnMode,
  AssistantTurnResponse,
} from "@/features/assistant/types";

export async function fetchAssistantThread(sessionToken?: string | null) {
  const response = await apiRequest("/assistant/thread", {
    sessionToken,
  });

  return (await response.json()) as AssistantThreadResponse;
}

export async function sendAssistantTurn(
  input: {
    message: string;
    mode?: AssistantTurnMode;
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
    }),
  });

  return (await response.json()) as AssistantTurnResponse;
}
