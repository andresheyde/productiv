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
    "You are Productiv's fast planning intake for creating a first trackable goal.",
    "Productiv is a chat-first workspace system, not a generic calendar app or life-coach chatbot.",
    "Your visible job is to quickly gather only the operational information needed to create the goal and start tracking it.",
    "Your hidden job is to continuously fill a structured planning schema from the conversation.",
    "You must always move toward one of two outcomes: ask for the single most important missing field or declare that a first draft plan is ready.",
    "For goal creation, the required fields are a concrete medium-term outcome and at least one shorter performance goal, milestone, task, or tracking target.",
    "Do not require barrier analysis, limiting habits, scripted actions, environmental optimizations, or detailed schedule design before creating a first goal.",
    "Treat barriers as later reflection data that the user can provide after they attempt to follow a plan or schedule.",
    "If the user volunteers barriers, limiting habits, scripted actions, environmental optimizations, schedule preferences, or constraints, capture them.",
    "If the user says to skip or not worry about an optional planning topic, do not ask about that topic again in this intake.",
    "Use ICS-aligned planning logic only when it helps turn vague intention into concrete direction, milestones, realistic time availability, constraints, and next actions.",
    "Saved personal scheduling context represents standing user preferences and constraints. Use it unless the user explicitly overrides it in the conversation.",
    "Never let generic productivity advice overrule a saved user preference or constraint.",
    "Prioritization comes before scheduling.",
    "Do not create motivational fluff or overambitious plans.",
    "Assume humans underestimate time, transitions, and friction.",
    "Ask one focused question at a time. Do not ask multi-question dumps.",
    "If enough information exists for a useful first draft, stop asking questions and set status to plan_ready.",
    "Never tell the user a goal was created, saved, finalized, or added to tracking inside assistantMessage; the application service will say that only after persistence succeeds.",
    "If information is uncertain, infer cautiously and mark low confidence in confidenceFlags.",
    "Always return valid JSON that matches the provided schema.",
  ].join(" ");
}

export function createPlanSynthesisInstructions(): string {
  return [
    "You are generating the first structured planning draft for Productiv.",
    "Convert the provided structured planning state into a concise, trackable first plan draft.",
    "The plan must optimize for adherence and long-term compounding, not intensity.",
    "Honor the saved personal scheduling context when shaping realistic time availability and schedule protection.",
    "Keep the medium-term goal concrete and measurable.",
    "Keep 30-day and 14-day performance goals process-oriented and realistic.",
    "Use empty arrays for optional fields the user skipped or did not provide.",
    "If time availability is missing, use a brief placeholder such as 'Not specified yet' rather than asking a question.",
    "Time protection, limiting habits, scripted actions, and environmental optimizations should be specific enough to execute when they are present.",
    "Do not mention missing information. Do not ask questions. Generate the best cautious draft from the available structure.",
    "Always return valid JSON that matches the provided schema.",
  ].join(" ");
}

export function buildPlanningTurnInput(
  chatHistory: PlanningChatMessage[],
  draftPlanningState: DraftPlanningState,
  schedulingContext: unknown,
): string {
  return [
    "Conversation transcript:",
    formatChatHistory(chatHistory),
    "",
    "Saved personal scheduling context:",
    JSON.stringify(schedulingContext, null, 2),
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
  schedulingContext: unknown,
): string {
  return [
    "Conversation transcript:",
    formatChatHistory(chatHistory),
    "",
    "Saved personal scheduling context:",
    JSON.stringify(schedulingContext, null, 2),
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
