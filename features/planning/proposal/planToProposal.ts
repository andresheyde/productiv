import type { GeneratedPlan } from "@/features/planning/types";

import type {
  ProposedScheduleBlock,
  ProposalBlockType,
  ProposalLinkedPlanField,
} from "./types";

const DAY_NAME_TO_INDEX: Record<string, ProposedScheduleBlock["dayOfWeek"]> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

type ParsedRecurringWindow = {
  days: ProposedScheduleBlock["dayOfWeek"][];
  startTime: string;
  endTime: string;
  title: string;
  blockType: ProposalBlockType;
  isFlexible: boolean;
  isProtected: boolean;
  reason: string;
  linkedPlanField: ProposalLinkedPlanField;
};

export function generateProposalBlocksFromPlan(
  generatedPlan: GeneratedPlan,
): ProposedScheduleBlock[] {
  const directBlocks = generatedPlan.timeProtectionPlan.flatMap((entry, index) =>
    parseRecurringWindow(entry, "timeProtectionPlan").flatMap(
      (window, windowIndex) =>
        createBlockFromWindow(window, `tp-${index}-${windowIndex}`),
    ),
  );

  if (directBlocks.length > 0) {
    return dedupeBlocks(sortBlocks(directBlocks));
  }

  return dedupeBlocks(sortBlocks(buildFallbackBlocks(generatedPlan)));
}

function buildFallbackBlocks(generatedPlan: GeneratedPlan): ProposedScheduleBlock[] {
  const blocks: ProposedScheduleBlock[] = [];
  const protectedDays = inferProtectedDays(generatedPlan.timeAvailability);
  const firstGoal =
    generatedPlan.thirtyDayPerformanceGoals[0] ??
    generatedPlan.fourteenDayPerformanceGoals[0] ??
    generatedPlan.mediumTermGoal;

  if (firstGoal) {
    const fallbackDays: ProposedScheduleBlock["dayOfWeek"][] =
      protectedDays.length > 0 ? protectedDays : [2, 4, 6];

    fallbackDays.slice(0, 3).forEach((dayOfWeek, index) => {
      const [startTime, endTime] =
        dayOfWeek === 6 ? ["10:00", "12:00"] : ["19:00", "21:00"];

      blocks.push({
        id: `fallback-focus-${dayOfWeek}-${index}`,
        title: summarizeGoalToTitle(firstGoal),
        dayOfWeek,
        startTime,
        endTime,
        durationMinutes: differenceInMinutes(startTime, endTime),
        source: "generated_plan",
        blockType: inferBlockType(firstGoal),
        isRecurring: true,
        isFlexible: false,
        isProtected: true,
        reason: `Fallback protected block derived from plan goals: ${firstGoal}`,
        linkedPlanField: "thirtyDayPerformanceGoals",
      });
    });
  }

  if (!containsNoWorkSunday(generatedPlan.constraints)) {
    blocks.push({
      id: "fallback-review-sunday",
      title: "Weekly planning review",
      dayOfWeek: 0,
      startTime: "17:30",
      endTime: "18:30",
      durationMinutes: 60,
      source: "generated_plan",
      blockType: "protected",
      isRecurring: true,
      isFlexible: false,
      isProtected: true,
      reason:
        "Fallback weekly review block generated to preserve planning continuity.",
      linkedPlanField: "fourteenDayPerformanceGoals",
    });
  }

  return blocks;
}

function parseRecurringWindow(
  entry: string,
  linkedPlanField: ProposalLinkedPlanField,
): ParsedRecurringWindow[] {
  const normalizedEntry = entry.trim();
  const days = extractDays(normalizedEntry);
  const range = extractTimeRange(normalizedEntry) ?? inferTimeRange(normalizedEntry);

  if (days.length === 0 || !range) {
    return [];
  }

  const title = inferTitle(normalizedEntry);
  const blockType = inferBlockType(normalizedEntry);
  const isFlexible = /flexible|move|shift|adjust/i.test(normalizedEntry);

  return [
    {
      days,
      startTime: range.startTime,
      endTime: range.endTime,
      title,
      blockType,
      isFlexible,
      isProtected: blockType !== "flex",
      reason: normalizedEntry,
      linkedPlanField,
    },
  ];
}

function createBlockFromWindow(
  window: ParsedRecurringWindow,
  idPrefix: string,
): ProposedScheduleBlock[] {
  return window.days.map((dayOfWeek, index) => ({
    id: `${idPrefix}-${dayOfWeek}-${index}`,
    title: window.title,
    dayOfWeek,
    startTime: window.startTime,
    endTime: window.endTime,
    durationMinutes: differenceInMinutes(window.startTime, window.endTime),
    source: "generated_plan",
    blockType: window.blockType,
    isRecurring: true,
    isFlexible: window.isFlexible,
    isProtected: window.isProtected,
    reason: window.reason,
    linkedPlanField: window.linkedPlanField,
  }));
}

function extractDays(entry: string): ProposedScheduleBlock["dayOfWeek"][] {
  const normalized = entry.toLowerCase();

  if (/every day|daily/.test(normalized)) {
    return [0, 1, 2, 3, 4, 5, 6];
  }

  if (/weekdays/.test(normalized)) {
    return [1, 2, 3, 4, 5];
  }

  if (/weekends/.test(normalized)) {
    return [0, 6];
  }

  const rangeMatch = normalized.match(
    /(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*(?:through|to|-)\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/,
  );

  if (rangeMatch) {
    const startIndex = DAY_NAME_TO_INDEX[rangeMatch[1]];
    const endIndex = DAY_NAME_TO_INDEX[rangeMatch[2]];

    if (startIndex !== undefined && endIndex !== undefined) {
      return buildDayRange(startIndex, endIndex);
    }
  }

  const foundDays = Array.from(
    new Set(
      Object.entries(DAY_NAME_TO_INDEX)
        .filter(([dayName]) => normalized.includes(dayName))
        .map(([, dayIndex]) => dayIndex),
    ),
  );

  return foundDays as ProposedScheduleBlock["dayOfWeek"][];
}

function extractTimeRange(entry: string) {
  const match = entry.match(
    /(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*(?:-|–|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i,
  );

  if (!match) {
    return null;
  }

  return {
    startTime: toTwentyFourHourTime(match[1], match[2], match[3]),
    endTime: toTwentyFourHourTime(match[4], match[5], match[6]),
  };
}

function inferTimeRange(entry: string) {
  if (/morning/i.test(entry)) {
    return { startTime: "07:00", endTime: "09:00" };
  }

  if (/afternoon/i.test(entry)) {
    return { startTime: "13:00", endTime: "15:00" };
  }

  if (/evening/i.test(entry)) {
    return { startTime: "19:00", endTime: "21:00" };
  }

  if (/night/i.test(entry)) {
    return { startTime: "20:00", endTime: "21:30" };
  }

  return null;
}

function inferProtectedDays(timeAvailability: string): ProposedScheduleBlock["dayOfWeek"][] {
  if (/weekday evenings/i.test(timeAvailability)) {
    return [2, 4];
  }

  if (/weekends?/i.test(timeAvailability)) {
    return [6];
  }

  return [];
}

function inferTitle(entry: string) {
  if (/weekly planning|review/i.test(entry)) {
    return "Weekly planning review";
  }

  if (/workout|gym|run|lift/i.test(entry)) {
    return "Workout block";
  }

  if (/personal project|project/i.test(entry)) {
    return "Project block";
  }

  if (/personal|family/i.test(entry)) {
    return "Protected personal time";
  }

  if (/recovery|rest/i.test(entry)) {
    return "Recovery block";
  }

  if (/study|learn|coding|software/i.test(entry)) {
    return "Focused skill block";
  }

  return "Protected focus block";
}

function inferBlockType(entry: string): ProposalBlockType {
  if (/workout|gym|run|lift/i.test(entry)) {
    return "workout";
  }

  if (/personal project|project/i.test(entry)) {
    return "project";
  }

  if (/personal|family/i.test(entry)) {
    return "personal";
  }

  if (/recovery|rest/i.test(entry)) {
    return "recovery";
  }

  if (/flexible|shift|move/i.test(entry)) {
    return "flex";
  }

  if (/protected/i.test(entry)) {
    return "protected";
  }

  return "focus";
}

function summarizeGoalToTitle(goal: string) {
  if (/software|coding|engineer/i.test(goal)) {
    return "Software-building block";
  }

  if (/fitness|workout|gym/i.test(goal)) {
    return "Workout block";
  }

  return "Priority progress block";
}

function containsNoWorkSunday(constraints: string[]) {
  return constraints.some((constraint) =>
    /sunday/i.test(constraint) && /off|no deep work|no work|rest/i.test(constraint),
  );
}

function buildDayRange(
  startIndex: ProposedScheduleBlock["dayOfWeek"],
  endIndex: ProposedScheduleBlock["dayOfWeek"],
) {
  if (startIndex <= endIndex) {
    return Array.from(
      { length: endIndex - startIndex + 1 },
      (_, index) => (startIndex + index) as ProposedScheduleBlock["dayOfWeek"],
    );
  }

  return [
    ...Array.from({ length: 7 - startIndex }, (_, index) =>
      (startIndex + index) as ProposedScheduleBlock["dayOfWeek"],
    ),
    ...Array.from({ length: endIndex + 1 }, (_, index) =>
      index as ProposedScheduleBlock["dayOfWeek"],
    ),
  ];
}

function differenceInMinutes(startTime: string, endTime: string) {
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);

  return (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
}

function toTwentyFourHourTime(
  hourValue: string,
  minuteValue: string | undefined,
  meridiem: string,
) {
  const hour = Number(hourValue);
  const minute = Number(minuteValue ?? "0");
  const isPm = meridiem.toLowerCase() === "pm";
  const normalizedHour =
    hour === 12 ? (isPm ? 12 : 0) : isPm ? hour + 12 : hour;

  return `${String(normalizedHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function sortBlocks(blocks: ProposedScheduleBlock[]) {
  return [...blocks].sort((left, right) => {
    if (left.dayOfWeek !== right.dayOfWeek) {
      return left.dayOfWeek - right.dayOfWeek;
    }

    return left.startTime.localeCompare(right.startTime);
  });
}

function dedupeBlocks(blocks: ProposedScheduleBlock[]) {
  const seen = new Set<string>();

  return blocks.filter((block) => {
    const key = `${block.dayOfWeek}-${block.startTime}-${block.endTime}-${block.title}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
