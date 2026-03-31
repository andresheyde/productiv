export const port = 3000;
export const aiProvider = process.env.AI_PROVIDER ?? "openai";
export const openAiApiKey = process.env.OPENAI_API_KEY;
export const openAiModel = process.env.OPENAI_MODEL;
export const openAiApiBaseUrl =
  process.env.OPENAI_API_BASE_URL ?? "https://api.openai.com/v1";

export const googleScopes = [
  "https://www.googleapis.com/auth/calendar",
];

export const maxScheduleRangeDays = 7;
