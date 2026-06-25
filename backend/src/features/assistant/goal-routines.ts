import type { GoalFocusArea, GoalRecord } from "../workspace/workspace.types.ts";

export function findReusablePersonalRoutinesGoal(input: {
  title: string;
  goalsById: Map<string, GoalRecord>;
}) {
  if (!shouldReusePersonalRoutinesGoalTitle(input.title)) {
    return null;
  }

  return (
    Array.from(input.goalsById.values())
      .filter(
        (goal) =>
          shouldReusePersonalRoutinesGoalTitle(goal.title) &&
          (goal.status === "active" || goal.status === "paused"),
      )
      .sort((left, right) => {
        if (left.status !== right.status) {
          return left.status === "active" ? -1 : 1;
        }

        return left.createdAt.localeCompare(right.createdAt);
      })[0] ?? null
  );
}

export function shouldReusePersonalRoutinesGoalTitle(title: string | null) {
  const normalizedTitle = normalizeComparableTitle(title ?? "");

  return (
    normalizedTitle === "personal routines" ||
    normalizedTitle === "personal routine"
  );
}

export function mergeGoalFocusAreas(
  existingFocusAreas: GoalFocusArea[],
  incomingFocusAreas: GoalFocusArea[],
) {
  const mergedFocusAreas = existingFocusAreas.map((focusArea) =>
    normalizeGoalFocusAreaForMerge(focusArea),
  );
  const indexById = new Map<string, number>();
  const indexByTitle = new Map<string, number>();

  mergedFocusAreas.forEach((focusArea, index) => {
    const idKey = normalizeGoalFocusIdKey(focusArea.id);
    const titleKey = normalizeComparableTitle(focusArea.title);

    if (idKey) {
      indexById.set(idKey, index);
    }

    if (titleKey) {
      indexByTitle.set(titleKey, index);
    }
  });

  for (const incomingFocusArea of incomingFocusAreas) {
    const normalizedIncoming =
      normalizeGoalFocusAreaForMerge(incomingFocusArea);
    const titleKey = normalizeComparableTitle(normalizedIncoming.title);

    if (!titleKey) {
      continue;
    }

    const idKey = normalizeGoalFocusIdKey(normalizedIncoming.id);
    const existingIndex =
      (idKey ? indexById.get(idKey) : undefined) ?? indexByTitle.get(titleKey);

    if (existingIndex === undefined) {
      const nextIndex = mergedFocusAreas.length;
      mergedFocusAreas.push(normalizedIncoming);

      if (idKey) {
        indexById.set(idKey, nextIndex);
      }

      indexByTitle.set(titleKey, nextIndex);
      continue;
    }

    const existingFocusArea = mergedFocusAreas[existingIndex];

    if (!existingFocusArea) {
      continue;
    }

    const updatedFocusArea = mergeGoalFocusAreaDetails(
      existingFocusArea,
      normalizedIncoming,
    );
    mergedFocusAreas[existingIndex] = updatedFocusArea;

    const updatedIdKey = normalizeGoalFocusIdKey(updatedFocusArea.id);
    const updatedTitleKey = normalizeComparableTitle(updatedFocusArea.title);

    if (updatedIdKey) {
      indexById.set(updatedIdKey, existingIndex);
    }

    if (updatedTitleKey) {
      indexByTitle.set(updatedTitleKey, existingIndex);
    }
  }

  return mergedFocusAreas;
}

export function mergeUniqueTextList(existing: string[], incoming: string[]) {
  const seen = new Set(existing.map((item) => normalizeComparableTitle(item)));
  const merged = [...existing];

  for (const item of incoming) {
    const normalizedItem = item.trim();
    const key = normalizeComparableTitle(normalizedItem);

    if (!normalizedItem || !key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(normalizedItem);
  }

  return merged;
}

export function mergeGoalScheduleGuidance(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown> | null,
) {
  if (!incoming || Object.keys(incoming).length === 0) {
    return undefined;
  }

  return {
    ...incoming,
    ...existing,
  };
}

export function inferGoalFocusSchedulingDefaults(value: string): Pick<
  GoalFocusArea,
  "defaultDurationMinutes" | "cadence"
> {
  return {
    defaultDurationMinutes: inferFocusDurationMinutes(value),
    cadence: inferFocusCadence(value),
  };
}

export function normalizeComparableTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function createStableFocusId(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function normalizeGoalFocusAreaForMerge(
  focusArea: GoalFocusArea,
): GoalFocusArea {
  const title = focusArea.title.trim();

  return {
    id: focusArea.id.trim() || createStableFocusId(title),
    title,
    description: focusArea.description.trim(),
    status: focusArea.status,
    defaultDurationMinutes: focusArea.defaultDurationMinutes ?? null,
    cadence: focusArea.cadence?.trim() || null,
  };
}

function mergeGoalFocusAreaDetails(
  existing: GoalFocusArea,
  incoming: GoalFocusArea,
): GoalFocusArea {
  const title = existing.title.trim() || incoming.title.trim();

  return {
    id:
      existing.id.trim() ||
      incoming.id.trim() ||
      createStableFocusId(title),
    title,
    description: existing.description.trim() || incoming.description.trim(),
    status: existing.status,
    defaultDurationMinutes:
      existing.defaultDurationMinutes ?? incoming.defaultDurationMinutes,
    cadence: existing.cadence ?? incoming.cadence,
  };
}

function normalizeGoalFocusIdKey(value: string) {
  return value.trim().toLowerCase();
}

function inferFocusDurationMinutes(value: string) {
  const normalized = value.toLowerCase();
  const minuteMatch = normalized.match(
    /\b(\d{1,3})[-\s]*(?:minute|minutes|min)\b/u,
  );

  if (minuteMatch?.[1]) {
    return Number(minuteMatch[1]);
  }

  const hourMatch = normalized.match(
    /\b(\d{1,2})[-\s]*(?:hour|hours|hr|hrs)\b/u,
  );

  if (hourMatch?.[1]) {
    return Number(hourMatch[1]) * 60;
  }

  if (/\bone[-\s]?hour\b/u.test(normalized)) {
    return 60;
  }

  if (/\bhalf[-\s]?hour\b/u.test(normalized)) {
    return 30;
  }

  return null;
}

function inferFocusCadence(value: string) {
  const normalized = value.toLowerCase();
  const weeklyCountMatch = normalized.match(
    /\b(\d{1,2})\s*(?:x|times?)\s*(?:a|per)?\s*week\b/u,
  );

  if (weeklyCountMatch?.[1]) {
    return `${Number(weeklyCountMatch[1])}x/week`;
  }

  if (
    /\b(?:weekday|weekdays|monday through friday|mon[-\s]?fri)\b/u.test(
      normalized,
    )
  ) {
    return "weekdays";
  }

  if (
    /\b(?:daily|every day|each day)\b/u.test(normalized) ||
    /\b(?:every|each)\s+(?:morning|afternoon|evening|night)\b/u.test(
      normalized,
    )
  ) {
    return "daily";
  }

  if (/\b(?:weekly|each week|every week)\b/u.test(normalized)) {
    return "weekly";
  }

  return null;
}
