import { apiRequest } from "@/features/shared/api/request";

export type AuthSessionResponse = {
  isAuthenticated: boolean;
  user: {
    id: string;
    email: string | null;
    fullName: string | null;
    avatarUrl: string | null;
  } | null;
};

export async function fetchAuthSession(sessionToken?: string | null) {
  const response = await apiRequest("/auth/session", { sessionToken });
  return (await response.json()) as AuthSessionResponse;
}

export async function logoutAuthSession() {
  await apiRequest("/auth/logout", { method: "POST" });
}
