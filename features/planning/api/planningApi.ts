import { apiRequest } from "@/features/shared/api/request";
import type {
  DraftPlanningState,
  PlanningChatMessage,
  PlanningTurnResponse,
} from "@/features/planning/types";

interface PlanningTurnRequest {
  chatHistory: PlanningChatMessage[];
  currentDraftPlanningState: DraftPlanningState;
  sessionToken?: string | null;
}

export async function sendPlanningTurn(input: PlanningTurnRequest) {
  const response = await apiRequest("/planning/turn", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    sessionToken: input.sessionToken,
    body: JSON.stringify({
      chatHistory: input.chatHistory.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      currentDraftPlanningState: input.currentDraftPlanningState,
    }),
  });

  return (await response.json()) as PlanningTurnResponse;
}
