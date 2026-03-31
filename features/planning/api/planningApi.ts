import { apiBaseUrl } from "@/features/shared/api/config";
import type {
  DraftPlanningState,
  PlanningChatMessage,
  PlanningTurnResponse,
} from "@/features/planning/types";

interface PlanningTurnRequest {
  chatHistory: PlanningChatMessage[];
  currentDraftPlanningState: DraftPlanningState;
}

export async function sendPlanningTurn(input: PlanningTurnRequest) {
  const response = await fetch(`${apiBaseUrl}/planning/turn`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chatHistory: input.chatHistory.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      currentDraftPlanningState: input.currentDraftPlanningState,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | (PlanningTurnResponse & { error?: string })
    | null;

  if (!response.ok || !payload) {
    throw new Error(payload?.error ?? "Failed to process planning turn.");
  }

  return payload;
}
