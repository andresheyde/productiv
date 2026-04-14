import { addDays, startOfDay } from "date-fns";

import type { CalendarEvent } from "@/features/calendar/types";

import type { ProposedScheduleBlock } from "./types";

export function proposalBlocksToCalendarEvents(
  proposalBlocks: ProposedScheduleBlock[],
  weekStartDate: Date,
): CalendarEvent[] {
  return proposalBlocks.map((block) => {
    const dayDate = addDays(startOfDay(weekStartDate), block.dayOfWeek);
    const startTime = applyTime(dayDate, block.startTime);
    const endTime = applyTime(dayDate, block.endTime);

    return {
      id: `proposal:${block.id}`,
      proposalBlockId: block.id,
      title: block.title,
      description: block.reason,
      startTime,
      endTime,
      allDay: false,
      source: "proposal",
    };
  });
}

function applyTime(baseDate: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);

  return new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    hours,
    minutes,
    0,
    0,
  );
}
