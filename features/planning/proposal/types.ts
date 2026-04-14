export type ProposalBlockType =
  | "protected"
  | "focus"
  | "personal"
  | "workout"
  | "flex"
  | "recovery"
  | "project";

export type ProposalLinkedPlanField =
  | "direction"
  | "mediumTermGoal"
  | "thirtyDayPerformanceGoals"
  | "fourteenDayPerformanceGoals"
  | "timeAvailability"
  | "timeProtectionPlan"
  | "limitingHabits"
  | "scriptedActions"
  | "environmentalOptimizations"
  | "constraints"
  | "summary";

export type ProposedScheduleBlock = {
  id: string;
  title: string;
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  source: "generated_plan";
  blockType: ProposalBlockType;
  isRecurring: true;
  isFlexible: boolean;
  isProtected: boolean;
  reason: string;
  linkedPlanField: ProposalLinkedPlanField;
};
