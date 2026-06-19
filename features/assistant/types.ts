import type {
  Goal,
  GoalMetric,
  MetricProgressEntry,
  Task,
  WorkLog,
} from "@/features/workspace/types";
import type {
  DerivedSchedulingSuggestion,
  ScheduleReflection,
  SchedulingConflict,
} from "@/features/scheduling-context/types";

export type AssistantThread = {
  id: string;
  title: string;
  currentIntent: string | null;
  latestContextSummary: string;
  latestArtifact: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AssistantMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  intent: string | null;
  content: string;
  structuredPayload: Record<string, unknown>;
  createdAt: string;
};

export type AssistantTurnMode = "chat" | "work_log" | "schedule_reflection";
export type AssistantNavigationHint =
  | "chat"
  | "goals"
  | "tasks"
  | "metrics"
  | "calendar"
  | null;

export type AssistantSideEffect = {
  goals: Goal[];
  scheduleProposals: ScheduleProposal[];
  scheduleReflections: ScheduleReflection[];
  schedulingSuggestions: DerivedSchedulingSuggestion[];
  tasks: Task[];
  metrics: GoalMetric[];
  workLogs: WorkLog[];
  metricEntries: MetricProgressEntry[];
};

export type ScheduleProposalOperation = {
  type: "schedule_task";
  taskId: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
};

export type ScheduleProposal = {
  id: string;
  threadId: string | null;
  title: string;
  status: "draft" | "confirmed" | "applied" | "superseded" | "canceled";
  intent: string | null;
  summary: string;
  operations: ScheduleProposalOperation[];
  conflictAnnotations: SchedulingConflict[];
  feedbackHistory: Record<string, unknown>[];
  appliedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AssistantThreadResponse = {
  thread: AssistantThread;
  messages: AssistantMessage[];
};

export type AssistantTurnResponse = AssistantThreadResponse & {
  assistantMessage: string;
  navigationHint: AssistantNavigationHint;
  sideEffects: AssistantSideEffect;
};
