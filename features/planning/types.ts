export type PlanningFieldConfidence = "low" | "medium" | "high";

export type PlanningConfidenceFlags = {
  direction: PlanningFieldConfidence | null;
  mediumTermGoal: PlanningFieldConfidence | null;
  thirtyDayPerformanceGoals: PlanningFieldConfidence | null;
  fourteenDayPerformanceGoals: PlanningFieldConfidence | null;
  timeAvailability: PlanningFieldConfidence | null;
  timeProtectionPlan: PlanningFieldConfidence | null;
  limitingHabits: PlanningFieldConfidence | null;
  scriptedActions: PlanningFieldConfidence | null;
  environmentalOptimizations: PlanningFieldConfidence | null;
  constraints: PlanningFieldConfidence | null;
};

export type PlanningChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export type DraftPlanningState = {
  direction: string[];
  mediumTermGoal: string | null;
  thirtyDayPerformanceGoals: string[];
  fourteenDayPerformanceGoals: string[];
  timeAvailability: string | null;
  timeProtectionPlan: string[];
  limitingHabits: string[];
  scriptedActions: string[];
  environmentalOptimizations: string[];
  constraints: string[];
  confidenceFlags: PlanningConfidenceFlags;
  missingFields: string[];
  nextBestQuestion: string | null;
};

export type GeneratedPlan = {
  direction: string;
  mediumTermGoal: string;
  thirtyDayPerformanceGoals: string[];
  fourteenDayPerformanceGoals: string[];
  timeAvailability: string;
  timeProtectionPlan: string[];
  limitingHabits: string[];
  scriptedActions: string[];
  environmentalOptimizations: string[];
  constraints: string[];
  summary: string;
};

export type PlanningTurnStatus =
  | "idle"
  | "collecting_input"
  | "waiting_for_response"
  | "draft_ready"
  | "error";

export type PlanningTurnResponse = {
  assistantMessage: string;
  draftPlanningState: DraftPlanningState;
  generatedPlan: GeneratedPlan | null;
  status: "needs_clarification" | "plan_ready" | "error";
};

export function createEmptyDraftPlanningState(): DraftPlanningState {
  return {
    direction: [],
    mediumTermGoal: null,
    thirtyDayPerformanceGoals: [],
    fourteenDayPerformanceGoals: [],
    timeAvailability: null,
    timeProtectionPlan: [],
    limitingHabits: [],
    scriptedActions: [],
    environmentalOptimizations: [],
    constraints: [],
    confidenceFlags: {
      direction: null,
      mediumTermGoal: null,
      thirtyDayPerformanceGoals: null,
      fourteenDayPerformanceGoals: null,
      timeAvailability: null,
      timeProtectionPlan: null,
      limitingHabits: null,
      scriptedActions: null,
      environmentalOptimizations: null,
      constraints: null,
    },
    missingFields: [],
    nextBestQuestion: null,
  };
}
