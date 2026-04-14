import {
  createEmptyDraftPlanningState,
  type DraftPlanningState,
  type GeneratedPlan,
  type PlanningChatMessage,
} from "@/features/planning/types";

export const samplePlanningConversationMessages: PlanningChatMessage[] = [
  {
    id: "sample-user-1",
    role: "user",
    content:
      "okay so my current goal is this currently I work and am trying to make my schedule better so that I can start to study more and be more productive I'd like to set aside some time each day for things called learning events and then for working out, but also I would like at least 1.5 hours of time to be able to spend with my friends",
  },
  {
    id: "sample-assistant-1",
    role: "assistant",
    content:
      "Quick question: what are your typical weekday work hours and how long is your commute (start/end times and commute duration)?",
  },
  {
    id: "sample-user-2",
    role: "user",
    content: "I work from 9-5 and my commute is 45 mins",
  },
  {
    id: "sample-assistant-2",
    role: "assistant",
    content:
      "Quick question: on weekdays, do you prefer to schedule learning events in the morning before work, during your lunch break, or in the evening after work?",
  },
  {
    id: "sample-user-3",
    role: "user",
    content:
      "what do you think is better this is something Im not consitent at right now but want to work towards making it a long term habit",
  },
  {
    id: "sample-assistant-3",
    role: "assistant",
    content:
      "Quick take: for building a consistent long-term habit, mornings usually work best (fewer decision points and less evening fatigue). Lunch slots are convenient if you already have a reliably long break, and evenings can work but are highest-risk for skipping. Which would you prefer to try for the next two weeks: morning before your commute, during your lunch break, or evening after work?",
  },
  {
    id: "sample-user-4",
    role: "user",
    content: "lets test out the morning slot",
  },
  {
    id: "sample-assistant-4",
    role: "assistant",
    content:
      "How many minutes would you like each weekday morning learning event to be? (e.g., 20, 30, 45, 60+)",
  },
  {
    id: "sample-user-5",
    role: "user",
    content: "currently I do zero but would like to get to at least 60 mins",
  },
  {
    id: "sample-assistant-5",
    role: "assistant",
    content:
      "Got it — 60 minutes for weekday morning learning events is noted. Quick question: how many minutes would you like to allocate to daily workouts on weekdays?",
  },
  {
    id: "sample-user-6",
    role: "user",
    content: "at least 45 mins",
  },
  {
    id: "sample-assistant-6",
    role: "assistant",
    content:
      "On weekdays, when would you prefer to schedule your daily 45-minute workouts: morning, during lunch, or evening after work?",
  },
  {
    id: "sample-user-7",
    role: "user",
    content:
      "well I'm pretty tired during lunch and after work but I do like to make sure i get some time to eat in",
  },
  {
    id: "sample-assistant-7",
    role: "assistant",
    content:
      "Are you willing to do your 45-minute weekday workouts in the morning?",
  },
  {
    id: "sample-user-8",
    role: "user",
    content:
      "I'd be willing to but it might be hard because I get up right now about 30 mins before I leave for work and just shower and leave",
  },
  {
    id: "sample-assistant-8",
    role: "assistant",
    content:
      "Are you willing to wake earlier on weekdays to fit both a 60-minute learning session and a 45-minute workout before your commute? If yes, how many minutes earlier could you realistically wake (e.g., 15, 30, 60)?",
  },
  {
    id: "sample-user-9",
    role: "user",
    content:
      "what do you think should I try to do both or just 1 to start I think the learning session is more important",
  },
  {
    id: "sample-assistant-9",
    role: "assistant",
    content:
      "Quick choice: for the next two weeks, would you prefer (A) to start by committing only to the 60-minute morning learning session (keep your current wake time and postpone daily workouts), or (B) try to fit both learning (60 min) and a 45-min workout in the morning by waking earlier? If you pick B, how many minutes earlier could you realistically wake on weekdays (e.g., 15, 30, 45, 60)?",
  },
  {
    id: "sample-user-10",
    role: "user",
    content: "A and then I guess try to do some workouts in the evneing or add it later",
  },
  {
    id: "sample-assistant-10",
    role: "assistant",
    content:
      "Quick question: to fit a 60-minute morning learning session before your commute, how many minutes earlier could you realistically wake on weekdays? Pick one: 15, 30, 45, or 60.",
  },
  {
    id: "sample-user-11",
    role: "user",
    content: "whenever is needed",
  },
  {
    id: "sample-assistant-11",
    role: "assistant",
    content:
      "Thanks — since you said “whenever is needed,” which of these can you realistically commit to on weekdays: 15, 30, 45, or 60 minutes earlier wake time? Please pick one.",
  },
  {
    id: "sample-user-12",
    role: "user",
    content: "30 mins",
  },
  {
    id: "sample-assistant-12",
    role: "assistant",
    content:
      "Thanks — I’ve recorded a 30-minute earlier wake time (wake ~07:15) which gives ~60 minutes before your 08:15 departure. Quick focused question: to make a full 60-minute morning learning session work, would you prefer A) do the full 60-minute learning immediately after waking and move your shower/personal prep to after work/evening, or B) keep your current ~30-minute morning shower and shorten the learning session (e.g., to ~30 minutes)? Reply with A or B (or a different single preference).",
  },
  {
    id: "sample-user-13",
    role: "user",
    content: "I need to still shower in the morning and lets shorten the learning session",
  },
  {
    id: "sample-assistant-13",
    role: "assistant",
    content:
      "With a 07:15 wake and keeping your ~30‑minute morning shower, that leaves about 30 minutes before you need to leave. Do you want to commit to a 30‑minute weekday morning learning session (Mon–Fri) for the next two weeks? Reply Yes to commit, or if you prefer a different single duration, reply with that number of minutes (e.g., 20).",
  },
  {
    id: "sample-user-14",
    role: "user",
    content: "yes",
  },
  {
    id: "sample-assistant-14",
    role: "assistant",
    content:
      "Is the 1.5+ hours you mentioned for spending time with friends something you need every day, or only on certain days? If it’s specific days, which days and roughly what time window works best (e.g., weeknights after 18:30, Saturday afternoon, Sunday evening)?",
  },
  {
    id: "sample-user-15",
    role: "user",
    content:
      "I need at least 4 days during the week or at least an hour of personal time everyday to recover where I'm not working or doing anything or just filling the time with video games",
  },
  {
    id: "sample-assistant-15",
    role: "assistant",
    content:
      "You said you need either at least 4 days during the week with friends (presumably ~1.5+ hours each) OR at least 1 hour of personal recovery time every weekday. Which of these do you want to prioritize for the next two weeks? Reply A or B.\n\nA) Four friend sessions per week — if A, which weekdays (pick up to 4) and what evening time window works (e.g., weeknights 19:00–21:00)?\nB) One hour personal downtime every weekday — if B, what time window works best for that daily hour (e.g., directly after work 17:30–18:30, later evening 21:00–22:00)?",
  },
  {
    id: "sample-user-16",
    role: "user",
    content:
      "B ill make this freind time if needed and later in the evening since we hang out online",
  },
  {
    id: "sample-assistant-16",
    role: "assistant",
    content:
      "Thanks — you picked B: one hour personal downtime each weekday, later in the evening. What exact 1-hour time window should I block each weekday for this downtime? Please reply with a single time window (for example: 21:00–22:00).",
  },
  {
    id: "sample-user-17",
    role: "user",
    content: "well I want to be in bed by 22",
  },
  {
    id: "sample-assistant-17",
    role: "assistant",
    content:
      "Quick question: which exact 1-hour weekday time window should I block for your personal downtime, given you want to be in bed by 22:00? Please pick one of these or give a different single window that ends by 22:00: 20:00–21:00 or 21:00–22:00.",
  },
  {
    id: "sample-user-18",
    role: "user",
    content: "20-21",
  },
  {
    id: "sample-assistant-18",
    role: "assistant",
    content:
      "First draft plan ready. I recorded your choice to start with a 30-minute weekday morning learning session (07:45–08:15 Mon–Fri) for a 14-day trial and to protect a 1-hour evening personal downtime slot 20:00–21:00 on weekdays. Below is the saved plan summary, scripted actions, and next steps to run the trial.",
  },
];

export const samplePlanningConversationDraftState: DraftPlanningState = {
  ...createEmptyDraftPlanningState(),
  direction: [
    "Build a more sustainable weekday schedule that supports learning, health, and recovery.",
  ],
  mediumTermGoal:
    "Establish a realistic routine that consistently includes weekday learning sessions and regular workouts without burning out.",
  thirtyDayPerformanceGoals: [
    "Protect a weekday morning learning habit before work.",
    "Add workouts gradually without destabilizing the learning habit.",
    "Maintain weekday recovery time so the routine stays sustainable.",
  ],
  fourteenDayPerformanceGoals: [
    "Run a two-week trial of 30-minute weekday morning learning sessions.",
    "Protect one hour of weekday evening downtime from 20:00 to 21:00.",
  ],
  timeAvailability:
    "Weekdays: wake 30 minutes earlier, maintain morning shower, leave at 08:15 for a 45-minute commute, work 09:00-17:00.",
  timeProtectionPlan: [
    "Monday through Friday 07:45 to 08:15 morning learning session for a two-week trial.",
    "Monday through Friday 20:00 to 21:00 protected personal downtime block for recovery.",
  ],
  limitingHabits: [
    "Current inconsistency with study habits.",
    "Trying to add too many new habits at once.",
    "Filling recovery time with low-value video games instead of actual rest.",
  ],
  scriptedActions: [
    "Start with learning only before adding weekday workouts.",
    "Keep the morning shower and commit only to the shorter 30-minute learning block.",
  ],
  environmentalOptimizations: [
    "Prepare for the morning block the night before so 07:45 can start cleanly.",
    "Protect 20:00-21:00 from work or extra obligation creep.",
  ],
  constraints: [
    "Work runs 09:00-17:00 with a 45-minute commute.",
    "Needs a morning shower.",
    "Wants to be in bed by 22:00.",
    "Learning is currently more important than adding workouts immediately.",
  ],
  confidenceFlags: {
    direction: "high",
    mediumTermGoal: "medium",
    thirtyDayPerformanceGoals: "medium",
    fourteenDayPerformanceGoals: "high",
    timeAvailability: "high",
    timeProtectionPlan: "high",
    limitingHabits: "medium",
    scriptedActions: "medium",
    environmentalOptimizations: "medium",
    constraints: "high",
  },
  missingFields: [],
  nextBestQuestion: null,
};

export const samplePlanningConversationGeneratedPlan: GeneratedPlan = {
  direction:
    "Build a more sustainable weekday schedule that supports learning, health, and recovery.",
  mediumTermGoal:
    "Establish a realistic routine that consistently includes weekday learning sessions and regular workouts without burning out.",
  thirtyDayPerformanceGoals: [
    "Protect a weekday morning learning habit before work.",
    "Add workouts gradually without destabilizing the learning habit.",
    "Maintain weekday recovery time so the routine stays sustainable.",
  ],
  fourteenDayPerformanceGoals: [
    "Run a two-week trial of 30-minute weekday morning learning sessions.",
    "Protect one hour of weekday evening downtime from 20:00 to 21:00.",
  ],
  timeAvailability:
    "Weekdays: wake at 07:15, shower in the morning, leave at 08:15 for a 45-minute commute, work 09:00-17:00, and aim to be in bed by 22:00.",
  timeProtectionPlan: [
    "Monday through Friday 07:45 AM to 08:15 AM protected learning block for the next two weeks.",
    "Monday through Friday 08:00 PM to 09:00 PM protected personal downtime block for recovery.",
  ],
  limitingHabits: [
    "Inconsistent study habits.",
    "Trying to add too much at once.",
    "Letting recovery time collapse into filler gaming instead of real rest.",
  ],
  scriptedActions: [
    "Treat the next two weeks as a learning-only trial and postpone adding weekday workouts.",
    "Prepare the learning materials the night before so the 07:45 start has minimal friction.",
  ],
  environmentalOptimizations: [
    "Set out whatever is needed for the morning learning session the night before.",
    "Keep the 20:00-21:00 block free from extra obligations so recovery is real.",
  ],
  constraints: [
    "Work 09:00-17:00.",
    "Commute 45 minutes.",
    "Needs a morning shower.",
    "Wants to be in bed by 22:00.",
    "Learning is more important than workouts for the first trial window.",
  ],
  summary:
    "This draft starts smaller instead of trying to force both learning and workouts into the same weekday morning. The first trial protects a 30-minute morning learning block before work and a one-hour evening recovery block each weekday, which should make the habit more sustainable before layering workouts back in.",
};
