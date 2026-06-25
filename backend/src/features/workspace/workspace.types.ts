export type GoalStatus = "active" | "paused" | "completed" | "archived";
export type TaskStatus = "inbox" | "planned" | "scheduled" | "done" | "canceled";
export type ScheduleIntent = "unscheduled" | "schedule_now" | "someday";
export type MetricProgressSource = "assistant_extract" | "manual";
export type GoalFocusAreaStatus = "active" | "paused" | "completed";
export type TaskRecurrenceFrequency = "daily" | "weekly" | "monthly" | "custom";

export type TaskRecurrence = {
  frequency: TaskRecurrenceFrequency;
  interval: number;
  daysOfWeek: number[];
  endsAt: string | null;
  sourceText: string | null;
  scheduledOccurrences: TaskScheduledOccurrence[];
};

export type TaskScheduledOccurrence = {
  dateKey: string;
  startTime: string;
  endTime: string;
  calendarEventId: string | null;
  sourceProposalId: string | null;
};

export type GoalFocusArea = {
  id: string;
  title: string;
  description: string;
  status: GoalFocusAreaStatus;
  defaultDurationMinutes: number | null;
  cadence: string | null;
};

export type GoalRecord = {
  id: string;
  title: string;
  definition: string;
  successCriteria: string[];
  focusAreas: GoalFocusArea[];
  scheduleGuidance: Record<string, unknown>;
  constraints: string[];
  notes: string | null;
  priorityRank: number;
  status: GoalStatus;
  createdAt: string;
  updatedAt: string;
};

export type TaskRecord = {
  id: string;
  goalId: string | null;
  title: string;
  description: string;
  priorityRank: number;
  status: TaskStatus;
  estimatedMinutes: number | null;
  dueAt: string | null;
  recurrence: TaskRecurrence | null;
  linkedCalendarEventId: string | null;
  scheduleIntent: ScheduleIntent;
  createdAt: string;
  updatedAt: string;
};

export type GoalMetricRecord = {
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

export type MetricProgressEntryRecord = {
  id: string;
  metricId: string;
  workLogId: string | null;
  deltaValue: number;
  source: MetricProgressSource;
  note: string | null;
  createdAt: string;
};

export type WorkLogRecord = {
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

export type AssistantThreadRecord = {
  id: string;
  title: string;
  currentIntent: string | null;
  latestContextSummary: string;
  latestArtifact: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AssistantMessageRecord = {
  id: string;
  role: "user" | "assistant" | "system";
  intent: string | null;
  content: string;
  structuredPayload: Record<string, unknown>;
  createdAt: string;
};
