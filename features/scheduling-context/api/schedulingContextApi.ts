import { apiRequest } from "@/features/shared/api/request";
import type {
  DerivedSchedulingSuggestion,
  UserSchedulingContext,
  UserSchedulingContextUpdate,
} from "@/features/scheduling-context/types";

export async function fetchUserSchedulingContext(sessionToken?: string | null) {
  const response = await apiRequest("/user-scheduling-context", {
    sessionToken,
  });

  return (await response.json()) as UserSchedulingContext;
}

export async function updateUserSchedulingContext(
  input: UserSchedulingContextUpdate & {
    sessionToken?: string | null;
  },
) {
  const response = await apiRequest("/user-scheduling-context", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    sessionToken: input.sessionToken,
    body: JSON.stringify({
      ...(input.workHours !== undefined ? { workHours: input.workHours } : {}),
      ...(input.noScheduleWindows !== undefined
        ? { noScheduleWindows: input.noScheduleWindows }
        : {}),
      ...(input.sleepWindow !== undefined ? { sleepWindow: input.sleepWindow } : {}),
      ...(input.maxWorkEndTime !== undefined
        ? { maxWorkEndTime: input.maxWorkEndTime }
        : {}),
      ...(input.preferredFocusBlockMinutes !== undefined
        ? { preferredFocusBlockMinutes: input.preferredFocusBlockMinutes }
        : {}),
      ...(input.preferredWorkPeriods !== undefined
        ? { preferredWorkPeriods: input.preferredWorkPeriods }
        : {}),
      ...(input.recoveryDays !== undefined
        ? { recoveryDays: input.recoveryDays }
        : {}),
      ...(input.additionalNotes !== undefined
        ? { additionalNotes: input.additionalNotes }
        : {}),
    }),
  });

  return (await response.json()) as UserSchedulingContext;
}

export async function fetchSchedulingSuggestions(sessionToken?: string | null) {
  const response = await apiRequest("/user-scheduling-context/suggestions", {
    sessionToken,
  });

  return ((await response.json()) as { suggestions: DerivedSchedulingSuggestion[] })
    .suggestions;
}

export async function acceptSchedulingSuggestion(
  input: {
    suggestionId: string;
    sessionToken?: string | null;
  },
) {
  const response = await apiRequest(
    `/user-scheduling-context/suggestions/${input.suggestionId}/accept`,
    {
      method: "POST",
      sessionToken: input.sessionToken,
    },
  );

  return (await response.json()) as {
    context: UserSchedulingContext;
    suggestion: DerivedSchedulingSuggestion | null;
  };
}

export async function dismissSchedulingSuggestion(
  input: {
    suggestionId: string;
    sessionToken?: string | null;
  },
) {
  const response = await apiRequest(
    `/user-scheduling-context/suggestions/${input.suggestionId}/dismiss`,
    {
      method: "POST",
      sessionToken: input.sessionToken,
    },
  );

  return (await response.json()) as {
    suggestion: DerivedSchedulingSuggestion;
  };
}
