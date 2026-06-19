export type GoalStatus = "active" | "paused" | "completed" | "archived";
export type TaskStatus = "inbox" | "planned" | "scheduled" | "done" | "canceled";
export type ScheduleIntent = "unscheduled" | "schedule_now" | "someday";
export type MetricProgressSource = "assistant_extract" | "manual";

export type Goal = {
  id: string;
  title: string;
  definition: string;
  notes: string | null;
  priorityRank: number;
  status: GoalStatus;
  createdAt: string;
  updatedAt: string;
};

export type Task = {
  id: string;
  goalId: string | null;
  title: string;
  description: string;
  priorityRank: number;
  status: TaskStatus;
  estimatedMinutes: number | null;
  dueAt: string | null;
  linkedCalendarEventId: string | null;
  scheduleIntent: ScheduleIntent;
  createdAt: string;
  updatedAt: string;
};

export type GoalMetric = {
  id: string;
  goalId: string;
  name: string;
  unitLabel: string;
  targetValue: number;
  currentValue: number;
  isActive: boolean;
  lastDeltaValue: number | null;
  lastEntryAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MetricProgressEntry = {
  id: string;
  metricId: string;
  workLogId: string | null;
  deltaValue: number;
  source: MetricProgressSource;
  note: string | null;
  createdAt: string;
};

export type WorkLog = {
  id: string;
  threadId: string | null;
  goalId: string | null;
  taskId: string | null;
  rawText: string;
  summary: string;
  recordedAt: string;
  createdAt: string;
  updatedAt: string;
};
