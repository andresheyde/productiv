import type {
  Goal,
  GoalMetric,
  MetricProgressEntry,
  Task,
  WorkLog,
} from "@/features/workspace/types";

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

export type AssistantTurnMode = "chat" | "work_log";
export type AssistantNavigationHint =
  | "chat"
  | "goals"
  | "tasks"
  | "metrics"
  | "calendar"
  | null;

export type AssistantSideEffect = {
  goals: Goal[];
  tasks: Task[];
  metrics: GoalMetric[];
  workLogs: WorkLog[];
  metricEntries: MetricProgressEntry[];
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
