import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

import { apiBaseUrl } from "@/features/shared/api/config";

export async function connectGoogleCalendar(returnToPath: string = "/") {
  const normalizedReturnPath =
    returnToPath.startsWith("/") ? returnToPath : `/${returnToPath}`;
  const redirectTo = Linking.createURL(
    `/auth/callback?returnTo=${encodeURIComponent(normalizedReturnPath)}`,
  );
  const authUrl = `${apiBaseUrl}/auth/google?redirectTo=${encodeURIComponent(
    redirectTo,
  )}`;

  return WebBrowser.openAuthSessionAsync(authUrl, redirectTo);
}
