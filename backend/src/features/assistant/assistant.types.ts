import type {
  AssistantMessageRecord,
  AssistantThreadRecord,
  GoalMetricRecord,
  GoalRecord,
  MetricProgressEntryRecord,
  TaskRecord,
  WorkLogRecord,
} from "../workspace/workspace.types.ts";

export type AssistantTurnMode = "chat" | "work_log";

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
  | "confirm_schedule_proposal"
  | "dismiss_schedule_proposal";

export type AssistantAction = {
  type: AssistantActionType;
  proposalId: string | null;
  goalId: string | null;
  taskId: string | null;
  metricId: string | null;
  title: string | null;
  definition: string | null;
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
};

export type AssistantSideEffects = {
  goals: GoalRecord[];
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
