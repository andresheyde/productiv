export const port = 3000;

export const googleScopes = [
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.app.created",
  "https://www.googleapis.com/auth/calendar.events.readonly",
];

export const maxScheduleRangeDays = 7;

const defaultDevelopmentSessionSecret =
  "productiv-local-session-secret-change-me";
const defaultWebAppUrl = "http://localhost:8081";
const developmentNativeSchemes = ["productiv", "exp", "exps"] as const;

export const isProduction = process.env.NODE_ENV === "production";

const configuredSessionSecret = process.env.SESSION_SECRET?.trim();
if (isProduction && !configuredSessionSecret) {
  throw new Error("SESSION_SECRET is required in production");
}

const configuredWebAppUrl = process.env.WEB_APP_URL?.trim();
if (isProduction && !configuredWebAppUrl) {
  throw new Error("WEB_APP_URL is required in production");
}

export const sessionSecret =
  configuredSessionSecret ?? defaultDevelopmentSessionSecret;
export const webAppUrl = configuredWebAppUrl ?? defaultWebAppUrl;
export const webAppOrigin = new URL(webAppUrl).origin;
export const sessionCookieName = "productiv_session";
export const sessionCookieMaxAgeSeconds = 60 * 60 * 24 * 30;
export const nativeAppScheme = "productiv";
export const nativeDevelopmentSchemes = developmentNativeSchemes;
