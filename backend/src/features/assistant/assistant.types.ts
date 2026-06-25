import type {
  AssistantMessageRecord,
  GoalFocusArea,
  AssistantThreadRecord,
  GoalMetricRecord,
  GoalRecord,
  MetricProgressEntryRecord,
  TaskRecord,
  WorkLogRecord,
} from "../workspace/workspace.types.ts";
import type {
  DerivedSchedulingSuggestionRecord,
  ScheduleReflectionRecord,
  SchedulingPreferenceCandidate,
} from "../scheduling-context/scheduling-context.types.ts";
import type { ScheduleProposalRecord } from "./schedule-proposals.repository.ts";

export type AssistantTurnMode = "chat" | "work_log" | "schedule_reflection";

export type AssistantNavigationHint =
  | "chat"
  | "goals"
  | "tasks"
  | "metrics"
  | "calendar"
  | null;

export type AssistantActionType =
  | "create_goal"
  | "update_goal"
  | "create_task"
  | "update_task"
  | "create_metric"
  | "update_metric"
  | "schedule_task"
  | "propose_schedule_task"
  | "schedule_goal_focus"
  | "propose_schedule_goal_focus"
  | "confirm_schedule_proposal"
  | "dismiss_schedule_proposal";

export type AssistantAction = {
  type: AssistantActionType;
  proposalId: string | null;
  goalId: string | null;
  focusId: string | null;
  taskId: string | null;
  metricId: string | null;
  title: string | null;
  definition: string | null;
  successCriteria: string[];
  focusAreas: GoalFocusArea[];
  scheduleGuidance: Record<string, unknown> | null;
  constraints: string[];
  notes: string | null;
  description: string | null;
  unitLabel: string | null;
  targetValue: number | null;
  currentValue: number | null;
  dueAt: string | null;
  estimatedMinutes: number | null;
  priorityRank: number | null;
  status: string | null;
  scheduleIntent: string | null;
  startTime: string | null;
  endTime: string | null;
  isActive: boolean | null;
};

export type AssistantModelResponse = {
  assistantMessage: string;
  contextSummary: string;
  navigationHint: AssistantNavigationHint;
  actions: AssistantAction[];
  schedulingPreferenceCandidates: SchedulingPreferenceCandidate[];
};

export type WorkLogProgressUpdate = {
  metricId: string;
  deltaValue: number;
  note: string | null;
};

export type WorkLogModelResponse = {
  assistantMessage: string;
  summary: string;
  contextSummary: string;
  navigationHint: AssistantNavigationHint;
  goalId: string | null;
  taskId: string | null;
  progressUpdates: WorkLogProgressUpdate[];
  schedulingPreferenceCandidates: SchedulingPreferenceCandidate[];
};

export type ScheduleReflectionStrategySuggestion = {
  title: string;
  detail: string;
  strength: "hard_constraint" | "soft_preference";
  confidence: "low" | "medium" | "high";
  obstacle: string | null;
};

export type ScheduleReflectionModelResponse = {
  assistantMessage: string;
  shouldSaveReflection: boolean;
  summary: string;
  contextSummary: string;
  navigationHint: AssistantNavigationHint;
  timeframeStart: string | null;
  timeframeEnd: string | null;
  liked: string[];
  disliked: string[];
  obstacles: string[];
  strategySuggestions: ScheduleReflectionStrategySuggestion[];
};

export type AssistantSideEffects = {
  goals: GoalRecord[];
  scheduleProposals: ScheduleProposalRecord[];
  scheduleReflections: ScheduleReflectionRecord[];
  schedulingSuggestions: DerivedSchedulingSuggestionRecord[];
  tasks: TaskRecord[];
  metrics: GoalMetricRecord[];
  workLogs: WorkLogRecord[];
  metricEntries: MetricProgressEntryRecord[];
};

export type AssistantThreadResponse = {
  thread: AssistantThreadRecord;
  messages: AssistantMessageRecord[];
};

export type AssistantTurnResponse = AssistantThreadResponse & {
  assistantMessage: string;
  navigationHint: AssistantNavigationHint;
  sideEffects: AssistantSideEffects;
};
