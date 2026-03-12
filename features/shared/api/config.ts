import Constants from "expo-constants";

const configuredApiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  Constants.expoConfig?.extra?.apiBaseUrl ??
  "http://localhost:3000";

export const apiBaseUrl = configuredApiBaseUrl.replace(/\/$/, "");
