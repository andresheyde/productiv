import { getStructuredAiProvider } from "../../shared/ai/provider-factory.ts";
import type { StructuredAiProvider } from "../../shared/ai/ai-provider.ts";
import {
  buildPlanSynthesisInput,
  buildPlanningTurnInput,
  createPlanSynthesisInstructions,
  createPlanningTurnInstructions,
  GENERATED_PLAN_SCHEMA,
  PLANNING_TURN_RESPONSE_SCHEMA,
} from "./planning.prompts.ts";
import {
  canGeneratePlan,
  normalizeDraftPlanningState,
  normalizeGeneratedPlan,
  normalizePlanningTurnExtraction,
} from "./planning.validation.ts";
import {
  createEmptyDraftPlanningState,
  type DraftPlanningState,
  type PlanningChatMessage,
  type PlanningTurnResponse,
} from "./planning.types.ts";

interface RunPlanningTurnInput {
  aiProvider?: StructuredAiProvider;
  chatHistory: PlanningChatMessage[];
  currentDraftPlanningState?: DraftPlanningState;
  schedulingContext?: unknown;
}

export async function runPlanningTurn(
  input: RunPlanningTurnInput,
): Promise<PlanningTurnResponse> {
  const aiProvider = input.aiProvider ?? getStructuredAiProvider();
  const currentDraftPlanningState = normalizeDraftPlanningState(
    input.currentDraftPlanningState,
    createEmptyDraftPlanningState(),
  );

  const extractionResult = normalizePlanningTurnExtraction(
    await aiProvider.generateJson<unknown>({
      instructions: createPlanningTurnInstructions(),
      input: buildPlanningTurnInput(
        input.chatHistory,
        currentDraftPlanningState,
        input.schedulingContext ?? null,
      ),
      schemaName: "planning_turn_response",
      schema: PLANNING_TURN_RESPONSE_SCHEMA,
    }),
    currentDraftPlanningState,
  );

  const draftPlanningState = normalizeDraftPlanningState(
    extractionResult.draftPlanningState,
    currentDraftPlanningState,
  );
  const shouldGeneratePlan =
    extractionResult.status === "plan_ready" && canGeneratePlan(draftPlanningState);

  if (!shouldGeneratePlan) {
    return {
      assistantMessage: extractionResult.assistantMessage,
      draftPlanningState,
      generatedPlan: null,
      status: "needs_clarification",
    };
  }

  const generatedPlan = normalizeGeneratedPlan(
    await aiProvider.generateJson<unknown>({
      instructions: createPlanSynthesisInstructions(),
      input: buildPlanSynthesisInput(
        input.chatHistory,
        draftPlanningState,
        input.schedulingContext ?? null,
      ),
      schemaName: "generated_plan",
      schema: GENERATED_PLAN_SCHEMA,
    }),
  );

  return {
    assistantMessage: extractionResult.assistantMessage,
    draftPlanningState,
    generatedPlan,
    status: "plan_ready",
  };
}
