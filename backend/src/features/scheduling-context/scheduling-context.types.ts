export type SchedulingDayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type WorkPeriod = "morning" | "afternoon" | "evening";

export type SchedulingPreferenceRuleKind =
  | "work_hours"
  | "no_schedule_window"
  | "sleep_window"
  | "latest_work_end"
  | "preferred_focus_block"
  | "preferred_work_period"
  | "recovery_day"
  | "custom";

export type SchedulingPreferenceRuleStrength =
  | "hard_constraint"
  | "soft_preference";

export type SchedulingPreferenceRuleStatus =
  | "active"
  | "suggested"
  | "dismissed";

export type SchedulingPreferenceRuleSource = "user" | "derived";

export type RuleConfidence = "low" | "medium" | "high";

export type SchedulingPreferenceApplicabilityScope =
  | "global"
  | "domain"
  | "goal"
  | "activity"
  | "temporary";

export type SchedulingPreferenceCandidate = {
  kind: SchedulingPreferenceRuleKind;
  title: string;
  detail: string;
  strength: SchedulingPreferenceRuleStrength;
  confidence: RuleConfidence;
  applicabilityScope: SchedulingPreferenceApplicabilityScope;
  domain: string | null;
  goalTitle: string | null;
  activityTitle: string | null;
  temporalScope: string | null;
  evidence: string | null;
};

export type WorkHoursRule = {
  dayOfWeek: SchedulingDayOfWeek;
  enabled: boolean;
  startTime: string;
  endTime: string;
};

export type SchedulingTimeWindow = {
  id: string;
  dayOfWeek: SchedulingDayOfWeek;
  startTime: string;
  endTime: string;
  label: string;
};

export type SleepWindow = {
  startTime: string;
  endTime: string;
};

export type SchedulingPreferenceRuleRecord = {
  id: string;
  kind: SchedulingPreferenceRuleKind;
  title: string;
  detail: string;
  source: SchedulingPreferenceRuleSource;
  strength: SchedulingPreferenceRuleStrength;
  status: SchedulingPreferenceRuleStatus;
  confidence: RuleConfidence | null;
  contextPatch: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type UserSchedulingContextRecord = {
  workHours: WorkHoursRule[];
  noScheduleWindows: SchedulingTimeWindow[];
  sleepWindow: SleepWindow | null;
  maxWorkEndTime: string | null;
  preferredFocusBlockMinutes: number | null;
  preferredWorkPeriods: WorkPeriod[];
  recoveryDays: SchedulingDayOfWeek[];
  additionalNotes: string;
  activeRules: SchedulingPreferenceRuleRecord[];
  compiledSummary: string;
  updatedAt: string;
};

export type DerivedSchedulingSuggestionRecord = SchedulingPreferenceRuleRecord & {
  source: "derived";
  status: "suggested";
};

export type ScheduleReflectionStrategySuggestion = {
  title: string;
  detail: string;
  strength: SchedulingPreferenceRuleStrength;
  confidence: RuleConfidence;
  obstacle?: string | null;
};

export type ScheduleReflectionRecord = {
  id: string;
  timeframeStart: string;
  timeframeEnd: string;
  userNarrative: string;
  extractedBlockers: string[];
  effectiveConditions: string[];
  recurringPreferences: string[];
  recommendedMemoryUpdates: ScheduleReflectionStrategySuggestion[];
  createdAt: string;
};

export type CompiledSchedulingContext = {
  workHours: WorkHoursRule[];
  noScheduleWindows: SchedulingTimeWindow[];
  sleepWindow: SleepWindow | null;
  maxWorkEndTime: string | null;
  preferredFocusBlockMinutes: number | null;
  preferredWorkPeriods: WorkPeriod[];
  recoveryDays: SchedulingDayOfWeek[];
  additionalNotes: string;
  hardConstraints: string[];
  softPreferences: string[];
  acceptedDerivedHabits: string[];
  promptSummary: string;
};

export type SchedulingConflict = {
  type:
    | "work_hours"
    | "no_schedule_window"
    | "sleep_window"
    | "latest_work_end"
    | "recovery_day";
  title: string;
  detail: string;
  strength: SchedulingPreferenceRuleStrength;
};
