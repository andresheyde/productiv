import type { DraftPlanningState, PlanningChatMessage } from "./planning.types.ts";

export const PLANNING_TURN_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["assistantMessage", "draftPlanningState", "status"],
  properties: {
    assistantMessage: {
      type: "string",
    },
    draftPlanningState: draftPlanningStateSchema(),
    status: {
      type: "string",
      enum: ["needs_clarification", "plan_ready"],
    },
  },
} as const;

export const GENERATED_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "direction",
    "mediumTermGoal",
    "thirtyDayPerformanceGoals",
    "fourteenDayPerformanceGoals",
    "timeAvailability",
    "timeProtectionPlan",
    "limitingHabits",
    "scriptedActions",
    "environmentalOptimizations",
    "constraints",
    "summary",
  ],
  properties: {
    direction: { type: "string" },
    mediumTermGoal: { type: "string" },
    thirtyDayPerformanceGoals: stringArraySchema(),
    fourteenDayPerformanceGoals: stringArraySchema(),
    timeAvailability: { type: "string" },
    timeProtectionPlan: stringArraySchema(),
    limitingHabits: stringArraySchema(),
    scriptedActions: stringArraySchema(),
    environmentalOptimizations: stringArraySchema(),
    constraints: stringArraySchema(),
    summary: { type: "string" },
  },
} as const;

export function createPlanningTurnInstructions(): string {
  return [
    "You are the planning engine for Productive.",
    "Productive is a chat-first planning system, not a generic calendar app or life-coach chatbot.",
    "Your visible job is to act like a guided interviewer in one conversational thread.",
    "Your hidden job is to continuously fill a structured planning schema from the conversation.",
    "You must always move toward one of two outcomes: ask the next best clarifying question or declare that a first draft plan is ready.",
    "Use ICS-aligned planning logic: move from vague intention to specific direction, medium-term goal, shorter performance goals, realistic time availability, barrier analysis, limiting habits, scripted actions, environmental optimization, and constraints.",
    "Prioritization comes before scheduling.",
    "Do not create motivational fluff or overambitious plans.",
    "Assume humans underestimate time, transitions, and friction.",
    "Plans are incomplete without barrier analysis.",
    "Scripted actions must be specific and low-friction.",
    "Environmental optimizations must change the physical or digital setup, not say 'try harder'.",
    "Ask one focused question at a time. Do not ask multi-question dumps.",
    "If enough information exists for a useful first draft, stop asking questions and set status to plan_ready.",
    "If information is uncertain, infer cautiously and mark low confidence in confidenceFlags.",
    "Always return valid JSON that matches the provided schema.",
  ].join(" ");
}

export function createPlanSynthesisInstructions(): string {
  return [
    "You are generating the first structured planning draft for Productive.",
    "Convert the provided structured planning state into a concise, behaviorally realistic first plan draft.",
    "The plan must optimize for adherence and long-term compounding, not intensity.",
    "Keep the medium-term goal concrete and measurable.",
    "Keep 30-day and 14-day performance goals process-oriented and realistic.",
    "Time protection, limiting habits, scripted actions, and environmental optimizations must be specific enough to execute.",
    "Do not mention missing information. Do not ask questions. Generate the best cautious draft from the available structure.",
    "Always return valid JSON that matches the provided schema.",
  ].join(" ");
}

export function buildPlanningTurnInput(
  chatHistory: PlanningChatMessage[],
  draftPlanningState: DraftPlanningState,
): string {
  return [
    "Conversation transcript:",
    formatChatHistory(chatHistory),
    "",
    "Current draft planning state:",
    JSON.stringify(draftPlanningState, null, 2),
    "",
    "Return the next assistant message, updated draft planning state, and status.",
  ].join("\n");
}

export function buildPlanSynthesisInput(
  chatHistory: PlanningChatMessage[],
  draftPlanningState: DraftPlanningState,
): string {
  return [
    "Conversation transcript:",
    formatChatHistory(chatHistory),
    "",
    "Structured draft planning state:",
    JSON.stringify(draftPlanningState, null, 2),
    "",
    "Generate the first plan draft from this state.",
  ].join("\n");
}

function formatChatHistory(chatHistory: PlanningChatMessage[]): string {
  return chatHistory
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");
}

function draftPlanningStateSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "direction",
      "mediumTermGoal",
      "thirtyDayPerformanceGoals",
      "fourteenDayPerformanceGoals",
      "timeAvailability",
      "timeProtectionPlan",
      "limitingHabits",
      "scriptedActions",
      "environmentalOptimizations",
      "constraints",
      "confidenceFlags",
      "missingFields",
      "nextBestQuestion",
    ],
    properties: {
      direction: stringArraySchema(),
      mediumTermGoal: nullableStringSchema(),
      thirtyDayPerformanceGoals: stringArraySchema(),
      fourteenDayPerformanceGoals: stringArraySchema(),
      timeAvailability: nullableStringSchema(),
      timeProtectionPlan: stringArraySchema(),
      limitingHabits: stringArraySchema(),
      scriptedActions: stringArraySchema(),
      environmentalOptimizations: stringArraySchema(),
      constraints: stringArraySchema(),
      confidenceFlags: {
        type: "object",
        additionalProperties: false,
        required: [
          "direction",
          "mediumTermGoal",
          "thirtyDayPerformanceGoals",
          "fourteenDayPerformanceGoals",
          "timeAvailability",
          "timeProtectionPlan",
          "limitingHabits",
          "scriptedActions",
          "environmentalOptimizations",
          "constraints",
        ],
        properties: {
          direction: nullableConfidenceSchema(),
          mediumTermGoal: nullableConfidenceSchema(),
          thirtyDayPerformanceGoals: nullableConfidenceSchema(),
          fourteenDayPerformanceGoals: nullableConfidenceSchema(),
          timeAvailability: nullableConfidenceSchema(),
          timeProtectionPlan: nullableConfidenceSchema(),
          limitingHabits: nullableConfidenceSchema(),
          scriptedActions: nullableConfidenceSchema(),
          environmentalOptimizations: nullableConfidenceSchema(),
          constraints: nullableConfidenceSchema(),
        },
      },
      missingFields: stringArraySchema(),
      nextBestQuestion: nullableStringSchema(),
    },
  };
}

function stringArraySchema() {
  return {
    type: "array",
    items: {
      type: "string",
    },
  };
}

function nullableStringSchema() {
  return {
    type: ["string", "null"],
  };
}

function nullableConfidenceSchema() {
  return {
    type: ["string", "null"],
    enum: ["low", "medium", "high", null],
  };
}
