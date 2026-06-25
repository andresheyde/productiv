import type { Request, Response } from "express";

import { resolveAuthenticatedRequest } from "../auth/auth-session.ts";
import {
  acceptDerivedSchedulingSuggestion,
  dismissDerivedSchedulingSuggestion,
  getOrCreateUserSchedulingContext,
  listDerivedSchedulingSuggestions,
  patchUserSchedulingContext,
} from "./scheduling-context.repository.ts";
import type {
  SchedulingDayOfWeek,
  SchedulingTimeWindow,
  SleepWindow,
  WorkHoursRule,
  WorkPeriod,
} from "./scheduling-context.types.ts";

type PatchSchedulingContextBody = {
  workHours?: unknown;
  noScheduleWindows?: unknown;
  sleepWindow?: unknown;
  maxWorkEndTime?: unknown;
  preferredFocusBlockMinutes?: unknown;
  preferredWorkPeriods?: unknown;
  recoveryDays?: unknown;
  additionalNotes?: unknown;
};

type SuggestionParams = {
  suggestionId?: string;
};

export async function getUserSchedulingContext(req: Request, res: Response) {
  try {
    const session = await resolveAuthenticatedRequest(req);

    if (!session) {
      return res.status(401).json({ error: "Authentication required" });
    }

    return res.json(await getOrCreateUserSchedulingContext(session.user.id));
  } catch (error) {
    return handleSchedulingContextError(res, "load scheduling context", error);
  }
}

export async function patchSchedulingContext(
  req: Request<{}, {}, PatchSchedulingContextBody>,
  res: Response,
) {
  try {
    const session = await resolveAuthenticatedRequest(req);

    if (!session) {
      return res.status(401).json({ error: "Authentication required" });
    }

    return res.json(
      await patchUserSchedulingContext({
        userId: session.user.id,
        workHours: getOptionalWorkHours(req.body.workHours),
        noScheduleWindows: getOptionalNoScheduleWindows(req.body.noScheduleWindows),
        sleepWindow: getOptionalSleepWindow(req.body.sleepWindow),
        maxWorkEndTime: getOptionalNullableTime(req.body.maxWorkEndTime),
        preferredFocusBlockMinutes: getOptionalNullablePositiveNumber(
          req.body.preferredFocusBlockMinutes,
        ),
        preferredWorkPeriods: getOptionalWorkPeriods(req.body.preferredWorkPeriods),
        recoveryDays: getOptionalRecoveryDays(req.body.recoveryDays),
        additionalNotes:
          typeof req.body.additionalNotes === "string"
            ? req.body.additionalNotes
            : undefined,
      }),
    );
  } catch (error) {
    return handleSchedulingContextError(res, "update scheduling context", error);
  }
}

export async function getSchedulingSuggestions(req: Request, res: Response) {
  try {
    const session = await resolveAuthenticatedRequest(req);

    if (!session) {
      return res.status(401).json({ error: "Authentication required" });
    }

    return res.json({
      suggestions: await listDerivedSchedulingSuggestions(session.user.id),
    });
  } catch (error) {
    return handleSchedulingContextError(res, "load scheduling suggestions", error);
  }
}

export async function acceptSchedulingSuggestion(
  req: Request<SuggestionParams>,
  res: Response,
) {
  try {
    const session = await resolveAuthenticatedRequest(req);

    if (!session) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!req.params.suggestionId) {
      return res.status(400).json({ error: "Missing suggestionId" });
    }

    const result = await acceptDerivedSchedulingSuggestion(
      session.user.id,
      req.params.suggestionId,
    );

    if (!result.suggestion) {
      return res.status(404).json({ error: "Suggestion not found" });
    }

    return res.json(result);
  } catch (error) {
    return handleSchedulingContextError(res, "accept scheduling suggestion", error);
  }
}

export async function dismissSchedulingSuggestion(
  req: Request<SuggestionParams>,
  res: Response,
) {
  try {
    const session = await resolveAuthenticatedRequest(req);

    if (!session) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!req.params.suggestionId) {
      return res.status(400).json({ error: "Missing suggestionId" });
    }

    const result = await dismissDerivedSchedulingSuggestion(
      session.user.id,
      req.params.suggestionId,
    );

    if (!result.suggestion) {
      return res.status(404).json({ error: "Suggestion not found" });
    }

    return res.json(result);
  } catch (error) {
    return handleSchedulingContextError(res, "dismiss scheduling suggestion", error);
  }
}

function getOptionalWorkHours(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }

    const dayOfWeek = getDayOfWeek((entry as { dayOfWeek?: unknown }).dayOfWeek);
    const startTime = getTime((entry as { startTime?: unknown }).startTime);
    const endTime = getTime((entry as { endTime?: unknown }).endTime);

    if (dayOfWeek === null || !startTime || !endTime) {
      return [];
    }

    return [
      {
        dayOfWeek,
        enabled: Boolean((entry as { enabled?: unknown }).enabled),
        startTime,
        endTime,
      } satisfies WorkHoursRule,
    ];
  });
}

function getOptionalNoScheduleWindows(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }

    const dayOfWeek = getDayOfWeek((entry as { dayOfWeek?: unknown }).dayOfWeek);
    const startTime = getTime((entry as { startTime?: unknown }).startTime);
    const endTime = getTime((entry as { endTime?: unknown }).endTime);

    if (dayOfWeek === null || !startTime || !endTime) {
      return [];
    }

    return [
      {
        id:
          typeof (entry as { id?: unknown }).id === "string" &&
          (entry as { id?: string }).id?.trim()
            ? (entry as { id?: string }).id!.trim()
            : `window-${index}`,
        dayOfWeek,
        startTime,
        endTime,
        label:
          typeof (entry as { label?: unknown }).label === "string"
            ? (entry as { label?: string }).label?.trim() ?? ""
            : "",
      } satisfies SchedulingTimeWindow,
    ];
  });
}

function getOptionalSleepWindow(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const startTime = getTime((value as { startTime?: unknown }).startTime);
  const endTime = getTime((value as { endTime?: unknown }).endTime);

  if (!startTime || !endTime) {
    return null;
  }

  return {
    startTime,
    endTime,
  } satisfies SleepWindow;
}

function getOptionalNullableTime(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return getTime(value);
}

function getOptionalNullablePositiveNumber(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : null;
}

function getOptionalWorkPeriods(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value.filter((entry): entry is WorkPeriod =>
        entry === "morning" || entry === "afternoon" || entry === "evening",
      ),
    ),
  );
}

function getOptionalRecoveryDays(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value.flatMap((entry) => {
        const dayOfWeek = getDayOfWeek(entry);
        return dayOfWeek === null ? [] : [dayOfWeek];
      }),
    ),
  ).sort();
}

function getDayOfWeek(value: unknown): SchedulingDayOfWeek | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6
    ? (value as SchedulingDayOfWeek)
    : null;
}

function getTime(value: unknown) {
  return typeof value === "string" && /^\d{2}:\d{2}$/u.test(value) ? value : null;
}

function handleSchedulingContextError(
  res: Response,
  action: string,
  error: unknown,
) {
  console.error(`[Scheduling Context] Failed to ${action}`, error);
  return res.status(500).json({
    error:
      error instanceof Error
        ? error.message
        : `Failed to ${action}.`,
  });
}
