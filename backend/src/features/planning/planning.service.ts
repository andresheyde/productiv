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
  getMissingPlanRequirements,
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

  const draftPlanningState = hydrateDraftPlanningStateFromTranscript(
    normalizeDraftPlanningState(
      extractionResult.draftPlanningState,
      currentDraftPlanningState,
    ),
    input.chatHistory,
  );
  const shouldUseLoopBreaker =
    extractionResult.status !== "plan_ready" &&
    shouldBreakPlanningClarificationLoop(
      input.chatHistory,
      extractionResult.assistantMessage,
      draftPlanningState,
    );
  const shouldGeneratePlan =
    canGeneratePlan(draftPlanningState) &&
    (extractionResult.status === "plan_ready" || shouldUseLoopBreaker);

  if (!shouldGeneratePlan) {
    const assistantMessage =
      extractionResult.status === "plan_ready"
        ? buildMissingPlanRequirementsMessage(
            getMissingPlanRequirements(draftPlanningState),
          )
        : extractionResult.assistantMessage;

    return {
      assistantMessage,
      draftPlanningState,
      generatedPlan: null,
      schedulingPreferenceCandidates:
        extractionResult.schedulingPreferenceCandidates,
      status: "needs_clarification",
    };
  }

  const assistantMessage =
    extractionResult.status === "plan_ready"
      ? extractionResult.assistantMessage
      : "I have enough to create a first trackable goal from that.";

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
    assistantMessage,
    draftPlanningState,
    generatedPlan,
    schedulingPreferenceCandidates: extractionResult.schedulingPreferenceCandidates,
    status: "plan_ready",
  };
}

function shouldBreakPlanningClarificationLoop(
  chatHistory: PlanningChatMessage[],
  assistantMessage: string,
  draft: DraftPlanningState,
) {
  if (!canGeneratePlan(draft)) {
    return false;
  }

  const recentAssistantMessages = chatHistory
    .filter((message) => message.role === "assistant")
    .map((message) => normalizeComparableText(message.content));
  const latestUserMessage = chatHistory
    .filter((message) => message.role === "user")
    .at(-1)?.content ?? "";
  const normalizedAssistantMessage = normalizeComparableText(assistantMessage);

  return (
    isUserFrustrationMessage(latestUserMessage) ||
    recentAssistantMessages.includes(normalizedAssistantMessage) ||
    asksForAlreadyProvidedActivities(assistantMessage, draft) ||
    asksForAlreadyProvidedOutcome(assistantMessage, draft)
  );
}

function asksForAlreadyProvidedActivities(
  assistantMessage: string,
  draft: DraftPlanningState,
) {
  return (
    draft.direction.length > 0 &&
    /\b(?:what|which)\b.*\b(?:activities|habits|things|actions)\b/iu.test(
      assistantMessage,
    )
  );
}

function asksForAlreadyProvidedOutcome(
  assistantMessage: string,
  draft: DraftPlanningState,
) {
  return (
    draft.mediumTermGoal !== null &&
    /\bwhat\b.*\b(?:mean|outcome|goal)\b|\bgetting\b.*\bbetter\b.*\bshape\b.*\bmean\b/iu.test(
      assistantMessage,
    )
  );
}

function hydrateDraftPlanningStateFromTranscript(
  draft: DraftPlanningState,
  chatHistory: PlanningChatMessage[],
): DraftPlanningState {
  const userMessages = chatHistory
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter((message) => message.length > 0);
  const transcriptDirection = extractGoalSupportingActivities(userMessages);
  let direction = mergeUniqueStrings(
    draft.direction,
    transcriptDirection,
  );
  const inferredMediumTermGoal = inferMediumTermGoal(userMessages);
  const mediumTermGoal =
    draft.mediumTermGoal && !isVagueMediumTermGoal(draft.mediumTermGoal)
      ? draft.mediumTermGoal
      : inferredMediumTermGoal ?? draft.mediumTermGoal;
  const starterDirection =
    direction.length === 0 && mediumTermGoal
      ? inferStarterGoalSupportingActivities(mediumTermGoal)
      : [];
  const addedStarterDirection = starterDirection.length > 0;

  if (addedStarterDirection) {
    direction = mergeUniqueStrings(direction, starterDirection);
  }

  if (
    direction.length === draft.direction.length &&
    mediumTermGoal === draft.mediumTermGoal
  ) {
    return draft;
  }

  return {
    ...draft,
    direction,
    mediumTermGoal,
    confidenceFlags: {
      ...draft.confidenceFlags,
      direction:
        direction.length > draft.direction.length
          ? addedStarterDirection
            ? "low"
            : draft.confidenceFlags.direction ?? "medium"
          : draft.confidenceFlags.direction,
      mediumTermGoal:
        mediumTermGoal !== draft.mediumTermGoal
          ? draft.confidenceFlags.mediumTermGoal ?? "medium"
          : draft.confidenceFlags.mediumTermGoal,
    },
    missingFields: getMissingPlanRequirements({
      ...draft,
      direction,
      mediumTermGoal,
    }),
    nextBestQuestion:
      mediumTermGoal && direction.length > 0 ? null : draft.nextBestQuestion,
  };
}

function inferStarterGoalSupportingActivities(goal: string) {
  const normalized = goal.toLowerCase();

  if (
    /\b(?:lose|losing|fat|weight|abs?|stamina|fitness|fit|strength|strong|muscle|workout|exercise|train|training|sports?|sprint|dunk)\b/u.test(
      normalized,
    )
  ) {
    return ["Strength training", "Cardio"];
  }

  if (
    /\b(?:grade|grades|school|class|course|exam|finals?|calculus|study|learn)\b/u.test(
      normalized,
    )
  ) {
    return ["Study", "Practice problems"];
  }

  if (
    /\b(?:job|career|interview|software developer|backend|frontend|role|roles|offer)\b/u.test(
      normalized,
    )
  ) {
    return ["Apply to roles", "Interview practice"];
  }

  if (
    /\b(?:launch|ship|project|product|proposal|write|writing|draft|build)\b/u.test(
      normalized,
    )
  ) {
    return ["Deep work", "Review notes"];
  }

  return [];
}

function inferMediumTermGoal(userMessages: string[]) {
  const outcomeMessage = userMessages.filter(isOutcomeMessage).at(-1);

  if (!outcomeMessage) {
    return null;
  }

  return normalizeGoalText(outcomeMessage);
}

function isOutcomeMessage(message: string) {
  if (isUserFrustrationMessage(message)) {
    return false;
  }

  return /\b(i want|i'd like|i would like|goal|better shape|stamina|dunk|sprint|lose|six pack|software developer job|job offer)\b/iu.test(
    message,
  );
}

function isVagueMediumTermGoal(value: string) {
  return /\b(get|getting|be|being)\s+(in\s+)?(better|good|great)?\s*shape\b|\bimprove fitness\b|\bbetter fitness\b/iu.test(
    value,
  );
}

function extractGoalSupportingActivities(userMessages: string[]) {
  return userMessages.flatMap((message) => {
    if (isUserFrustrationMessage(message)) {
      return [];
    }

    return message
      .split(/\n|;/u)
      .map(normalizeActivityLine)
      .filter((line) => line !== null);
  });
}

function normalizeActivityLine(line: string) {
  const normalized = line
    .replace(/^[\s\-*]+/u, "")
    .replace(
      /^(i\s+)?(need|should|want|have)\s+to\s+(spend\s+time\s+)?(doing|do)?\s*/iu,
      "",
    )
    .replace(/^(some|consistent|regular)\s+/iu, "")
    .trim();

  if (
    normalized.length < 4 ||
    isUserFrustrationMessage(normalized) ||
    isOutcomeMessage(normalized) ||
    !isActivityMessage(normalized)
  ) {
    return null;
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function isActivityMessage(message: string) {
  return /\b(strength|training|workout|cardio|running|biking|bike|jump rope|jump roping|plyo|plyometrics|sprints?|jumping|rehab|practice|applications?|apply|interviews?|study|questions?|sessions?)\b/iu.test(
    message,
  );
}

function isUserFrustrationMessage(message: string) {
  return /\b(i just (said|told) (you|those)|already told you|last message)\b/iu.test(
    message,
  );
}

function normalizeComparableText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
}

function normalizeGoalText(message: string) {
  return message
    .replace(/\s+/gu, " ")
    .replace(/^(i want to|i want|i'd like to|i would like to)\s+/iu, "")
    .trim();
}

function mergeUniqueStrings(left: string[], right: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of [...left, ...right]) {
    const normalized = value.trim();
    const key = normalized.toLowerCase();

    if (!normalized || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function buildMissingPlanRequirementsMessage(missingRequirements: string[]) {
  if (
    missingRequirements.length === 1 &&
    missingRequirements[0] ===
      "at least one activity, task, or focus area you want to include"
  ) {
    return "I need one activity, constraint, or clue before I can create this goal. Share anything you know, or say \"choose for me\" and Productiv will draft a starter focus set.";
  }

  return `I need one more concrete detail before I can create this goal: ${missingRequirements.join(
    " and ",
  )}.`;
}
