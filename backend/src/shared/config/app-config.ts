export const port = 3000;
export const isProduction = process.env.NODE_ENV === "production";
export const aiProvider = process.env.AI_PROVIDER ?? "openai";
export const openAiApiKey = process.env.OPENAI_API_KEY;
export const openAiModel = process.env.OPENAI_MODEL;
export const openAiApiBaseUrl =
  process.env.OPENAI_API_BASE_URL ?? "https://api.openai.com/v1";
export const ollamaBaseUrl =
  process.env.OLLAMA_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:11434";
export const ollamaModel = process.env.OLLAMA_MODEL ?? "qwen3:4b";
export const googleIntegrationProvider =
  process.env.GOOGLE_INTEGRATION_PROVIDER ?? "google";
export const localGoogleSubject =
  process.env.LOCAL_GOOGLE_SUBJECT ?? "productiv-local-user";
export const localGoogleEmail =
  process.env.LOCAL_GOOGLE_EMAIL ?? "local@productiv.test";
export const localGoogleFullName =
  process.env.LOCAL_GOOGLE_FULL_NAME ?? "Productiv Local User";
export const localGoogleAvatarUrl =
  process.env.LOCAL_GOOGLE_AVATAR_URL?.trim() || null;

const configuredDatabaseUrl =
  process.env.DATABASE_URL?.trim() ?? process.env.SUPABASE_DB_URL?.trim();
const configuredDirectDatabaseUrl =
  process.env.DIRECT_DATABASE_URL?.trim() ??
  process.env.SUPABASE_DB_DIRECT_URL?.trim() ??
  configuredDatabaseUrl;
const configuredDatabaseSslMode = process.env.DATABASE_SSL_MODE?.trim();

export const databaseUrl = configuredDatabaseUrl ?? null;
export const directDatabaseUrl = configuredDirectDatabaseUrl ?? null;
export const databaseSslMode =
  configuredDatabaseSslMode === "disable" ? "disable" : "require";
export const supabaseProjectUrl =
  process.env.SUPABASE_PROJECT_URL?.trim() ?? null;
export const supabaseAnonKey = process.env.SUPABASE_ANON_KEY?.trim() ?? null;
export const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? null;

export const googleScopes = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar",
];

export const maxScheduleRangeDays = 7;

const defaultDevelopmentSessionSecret =
  "productiv-local-session-secret-change-me";
const defaultWebAppUrl = "http://localhost:8081";
const developmentNativeSchemes = ["productiv", "exp", "exps"] as const;

const configuredSessionSecret = process.env.SESSION_SECRET?.trim();
if (isProduction && !configuredSessionSecret) {
  throw new Error("SESSION_SECRET is required in production");
}

const configuredWebAppUrl = process.env.WEB_APP_URL?.trim();
if (isProduction && !configuredWebAppUrl) {
  throw new Error("WEB_APP_URL is required in production");
}

if (isProduction && !configuredDatabaseUrl) {
  throw new Error("DATABASE_URL is required in production");
}

if (
  isProduction &&
  (aiProvider === "ollama" || aiProvider === "deterministic")
) {
  throw new Error(`AI_PROVIDER=${aiProvider} is not allowed in production`);
}

if (isProduction && googleIntegrationProvider === "local") {
  throw new Error(
    "GOOGLE_INTEGRATION_PROVIDER=local is not allowed in production",
  );
}

export const sessionSecret =
  configuredSessionSecret ?? defaultDevelopmentSessionSecret;
export const webAppUrl = configuredWebAppUrl ?? defaultWebAppUrl;
export const webAppOrigin = new URL(webAppUrl).origin;
export const sessionCookieName = "productiv_session";
export const sessionCookieMaxAgeSeconds = 60 * 60 * 24 * 30;
export const nativeAppScheme = "productiv";
export const nativeDevelopmentSchemes = developmentNativeSchemes;
