import { apiRequest } from "@/features/shared/api/request";

export type AuthSessionResponse = {
  isAuthenticated: boolean;
};

export async function fetchAuthSession(sessionToken?: string | null) {
  const response = await apiRequest("/auth/session", { sessionToken });
  return (await response.json()) as AuthSessionResponse;
}

export async function logoutAuthSession() {
  await apiRequest("/auth/logout", { method: "POST" });
}
