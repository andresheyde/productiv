import { addDays, differenceInMinutes, startOfDay } from "date-fns";

export const PROPOSAL_PREVIEW_TIME_GUTTER_WIDTH = 38;
export const PROPOSAL_PREVIEW_MIN_DAY_WIDTH = 118;
export const PROPOSAL_PREVIEW_MAX_SINGLE_DAY_WIDTH = 560;
export const PROPOSAL_PREVIEW_MAX_DAY_WIDTH = 280;
export const PROPOSAL_PREVIEW_HORIZONTAL_PADDING = 14;
export const PROPOSAL_PREVIEW_DAY_COLUMN_GAP = 8;
export const PROPOSAL_PREVIEW_DEFAULT_START_HOUR = 6;
export const PROPOSAL_PREVIEW_DEFAULT_END_HOUR = 22;
export const PROPOSAL_PREVIEW_MIN_VISIBLE_HOURS = 5;
export const PROPOSAL_PREVIEW_MAX_MOBILE_TIMED_HEIGHT = 360;
export const PROPOSAL_PREVIEW_MAX_MULTI_DAY_TIMED_HEIGHT = 330;

export type ProposalPreviewTimeWindow = {
  startHour: number;
  endHour: number;
};

type ProposalPreviewRangeEvent = {
  startTime: Date;
  endTime: Date;
  allDay?: boolean;
};

export type ProposalPreviewTimedEventLayout<Event> = {
  event: Event;
  top: number;
  height: number;
  visibleMinutes: number;
  laneIndex: number;
  laneCount: number;
};

const RESPONSIVE_DAY_COUNTS = [7, 5, 3] as const;

export function getProposalPreviewDayCount(availableWidth: number) {
  for (const dayCount of RESPONSIVE_DAY_COUNTS) {
    if (availableWidth >= getProposalPreviewRequiredWidth(dayCount)) {
      return dayCount;
    }
  }

  return 1;
}

export function getProposalPreviewDayWidth(
  availableWidth: number,
  visibleDayCount: number,
) {
  const dayGapTotal =
    PROPOSAL_PREVIEW_DAY_COLUMN_GAP * Math.max(1, visibleDayCount);
  const contentWidth = Math.max(
    0,
    availableWidth -
      PROPOSAL_PREVIEW_HORIZONTAL_PADDING * 2 -
      PROPOSAL_PREVIEW_TIME_GUTTER_WIDTH -
      dayGapTotal,
  );
  const targetWidth = Math.floor(
    contentWidth / Math.max(1, visibleDayCount),
  );
  const maxDayWidth =
    visibleDayCount === 1
      ? PROPOSAL_PREVIEW_MAX_SINGLE_DAY_WIDTH
      : PROPOSAL_PREVIEW_MAX_DAY_WIDTH;

  return Math.min(
    maxDayWidth,
    Math.max(PROPOSAL_PREVIEW_MIN_DAY_WIDTH, targetWidth),
  );
}

export function getProposalPreviewGridWidth(
  dayWidth: number,
  visibleDayCount: number,
) {
  const normalizedDayCount = Math.max(1, visibleDayCount);

  return (
    PROPOSAL_PREVIEW_HORIZONTAL_PADDING * 2 +
    PROPOSAL_PREVIEW_TIME_GUTTER_WIDTH +
    normalizedDayCount * dayWidth +
    normalizedDayCount * PROPOSAL_PREVIEW_DAY_COLUMN_GAP
  );
}

export function getProposalPreviewTimedViewportHeight(
  timedHeight: number,
  visibleDayCount: number,
) {
  const maxHeight =
    visibleDayCount === 1
      ? PROPOSAL_PREVIEW_MAX_MOBILE_TIMED_HEIGHT
      : PROPOSAL_PREVIEW_MAX_MULTI_DAY_TIMED_HEIGHT;

  return Math.min(Math.max(0, timedHeight), maxHeight);
}

export function canScrollProposalPreviewTimedGrid(
  timedHeight: number,
  visibleDayCount: number,
) {
  return (
    timedHeight >
    getProposalPreviewTimedViewportHeight(timedHeight, visibleDayCount) + 1
  );
}

export function getProposalPreviewEventsInRange<
  Event extends ProposalPreviewRangeEvent,
>(events: Event[], startDate: Date, dayCount: number): Event[] {
  const rangeStart = startOfDay(startDate);
  const rangeEnd = addDays(rangeStart, Math.max(1, dayCount));

  return events.filter((event) =>
    isEventInRange(event, rangeStart, rangeEnd),
  );
}

export function isProposalPreviewEventInDay(
  event: ProposalPreviewRangeEvent,
  day: Date,
) {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);

  return isEventInRange(event, dayStart, dayEnd);
}

export function getProposalPreviewTimeWindow(
  events: ProposalPreviewRangeEvent[],
): ProposalPreviewTimeWindow {
  const timedEvents = events.filter(
    (event) =>
      !event.allDay &&
      Number.isFinite(event.startTime.getTime()) &&
      Number.isFinite(event.endTime.getTime()) &&
      event.endTime > event.startTime,
  );

  if (timedEvents.length === 0) {
    return {
      startHour: PROPOSAL_PREVIEW_DEFAULT_START_HOUR,
      endHour: PROPOSAL_PREVIEW_DEFAULT_END_HOUR,
    };
  }

  if (
    timedEvents.some(
      (event) =>
        startOfDay(event.startTime).getTime() !==
        startOfDay(event.endTime).getTime(),
    )
  ) {
    return {
      startHour: 0,
      endHour: 24,
    };
  }

  const earliestHour = Math.min(
    ...timedEvents.map((event) => event.startTime.getHours()),
  );
  const latestHour = Math.max(
    ...timedEvents.map((event) =>
      event.endTime.getMinutes() > 0
        ? event.endTime.getHours() + 1
        : event.endTime.getHours(),
    ),
  );
  const midpoint = (earliestHour + latestHour) / 2;
  let startHour = Math.max(0, Math.floor(earliestHour) - 1);
  let endHour = Math.min(24, Math.ceil(latestHour) + 1);

  if (endHour - startHour < PROPOSAL_PREVIEW_MIN_VISIBLE_HOURS) {
    startHour = Math.max(
      0,
      Math.floor(midpoint - PROPOSAL_PREVIEW_MIN_VISIBLE_HOURS / 2),
    );
    endHour = Math.min(
      24,
      startHour + PROPOSAL_PREVIEW_MIN_VISIBLE_HOURS,
    );
    startHour = Math.max(0, endHour - PROPOSAL_PREVIEW_MIN_VISIBLE_HOURS);
  }

  return {
    startHour,
    endHour,
  };
}

export function getProposalPreviewTimedEventLayouts<
  Event extends ProposalPreviewRangeEvent,
>(
  events: Event[],
  day: Date,
  timeWindow: ProposalPreviewTimeWindow,
  hourHeight: number,
): Array<ProposalPreviewTimedEventLayout<Event>> {
  const dayStart = startOfDay(day);
  const previewStart = new Date(dayStart);
  previewStart.setHours(timeWindow.startHour, 0, 0, 0);
  const previewEnd = new Date(dayStart);
  previewEnd.setHours(timeWindow.endHour, 0, 0, 0);
  const visibleEvents = events
    .flatMap((event, originalIndex) => {
      const visibleStart = new Date(
        Math.max(event.startTime.getTime(), previewStart.getTime()),
      );
      const visibleEnd = new Date(
        Math.min(event.endTime.getTime(), previewEnd.getTime()),
      );

      if (
        event.allDay ||
        !Number.isFinite(event.startTime.getTime()) ||
        !Number.isFinite(event.endTime.getTime()) ||
        visibleEnd <= visibleStart
      ) {
        return [];
      }

      const startOffsetMinutes = differenceInMinutes(
        visibleStart,
        previewStart,
      );
      const visibleMinutes = differenceInMinutes(visibleEnd, visibleStart);

      return [
        {
          event,
          originalIndex,
          startOffsetMinutes,
          endOffsetMinutes: startOffsetMinutes + visibleMinutes,
          top: startOffsetMinutes * (hourHeight / 60),
          height: Math.max(28, visibleMinutes * (hourHeight / 60)),
          visibleMinutes,
        },
      ];
    })
    .sort((left, right) => {
      if (left.startOffsetMinutes !== right.startOffsetMinutes) {
        return left.startOffsetMinutes - right.startOffsetMinutes;
      }

      if (left.endOffsetMinutes !== right.endOffsetMinutes) {
        return left.endOffsetMinutes - right.endOffsetMinutes;
      }

      return left.originalIndex - right.originalIndex;
    });
  const layouts: Array<ProposalPreviewTimedEventLayout<Event>> = [];

  for (const cluster of getOverlappingEventClusters(visibleEvents)) {
    const laneEndOffsets: number[] = [];
    const assignedCluster = cluster.map((event) => {
      let laneIndex = laneEndOffsets.findIndex(
        (endOffset) => endOffset <= event.startOffsetMinutes,
      );

      if (laneIndex === -1) {
        laneIndex = laneEndOffsets.length;
      }

      laneEndOffsets[laneIndex] = event.endOffsetMinutes;

      return {
        ...event,
        laneIndex,
      };
    });
    const laneCount = Math.max(1, laneEndOffsets.length);

    layouts.push(
      ...assignedCluster.map((event) => ({
        event: event.event,
        top: event.top,
        height: event.height,
        visibleMinutes: event.visibleMinutes,
        laneIndex: event.laneIndex,
        laneCount,
      })),
    );
  }

  return layouts.sort((left, right) => {
    if (left.top !== right.top) {
      return left.top - right.top;
    }

    return left.laneIndex - right.laneIndex;
  });
}

function getOverlappingEventClusters<Event>(
  events: Array<{
    event: Event;
    originalIndex: number;
    startOffsetMinutes: number;
    endOffsetMinutes: number;
    top: number;
    height: number;
    visibleMinutes: number;
  }>,
) {
  const clusters: typeof events[] = [];
  let currentCluster: typeof events = [];
  let currentClusterEndOffset = Number.NEGATIVE_INFINITY;

  for (const event of events) {
    if (
      currentCluster.length === 0 ||
      event.startOffsetMinutes < currentClusterEndOffset
    ) {
      currentCluster.push(event);
      currentClusterEndOffset = Math.max(
        currentClusterEndOffset,
        event.endOffsetMinutes,
      );
      continue;
    }

    clusters.push(currentCluster);
    currentCluster = [event];
    currentClusterEndOffset = event.endOffsetMinutes;
  }

  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  return clusters;
}

function getProposalPreviewRequiredWidth(dayCount: number) {
  return (
    PROPOSAL_PREVIEW_HORIZONTAL_PADDING * 2 +
    PROPOSAL_PREVIEW_TIME_GUTTER_WIDTH +
    PROPOSAL_PREVIEW_DAY_COLUMN_GAP * dayCount +
    PROPOSAL_PREVIEW_MIN_DAY_WIDTH * dayCount
  );
}

function isEventInRange(
  event: ProposalPreviewRangeEvent,
  rangeStart: Date,
  rangeEnd: Date,
) {
  return event.startTime < rangeEnd && event.endTime > rangeStart;
}
