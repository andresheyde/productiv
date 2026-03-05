import { addDays, areIntervalsOverlapping } from "date-fns";
import { View } from "react-native";
import {
  STICKY_HEADER_HEIGHT,
  TIME_GUTTER_WIDTH,
} from "../../layout/calendarLayout";
import { CalendarEvent } from "../../types";
import AllDayEventBlock from "./AllDayEventBlock";

type EventPosition = {
  event: CalendarEvent;
  startDayIndex: number;
  endDayIndex: number;
};

const BLOCK_HEIGHT = 16; // Event block height
const ROW_HEIGHT = 20; // Spacing between rows
const HEADER_PADDING = 4; // Top and bottom padding (4px each)
const DEFAULT_HEIGHT = 24; // Default height for empty or single event

export function calculateAllDayHeaderHeight(rowCount: number): number {
  return Math.max(DEFAULT_HEIGHT, rowCount * ROW_HEIGHT + HEADER_PADDING);
}

export function computeAllDayRows(
  events: CalendarEvent[],
  startDate: Date,
  numDays: number,
): EventPosition[][] {
  const items: EventPosition[] = [];
  events
    .filter((e) => e.allDay)
    .filter((event) =>
      areIntervalsOverlapping(
        {
          start: event.startTime,
          end: event.endTime,
        },
        {
          start: startDate,
          end: addDays(startDate, numDays),
        },
      ),
    )
    .sort(
      (a, b) =>
        a.startTime.getTime() - b.startTime.getTime() ||
        b.endTime.getTime() - a.endTime.getTime(),
    )
    .map((event) => {
      let startIdx = -1;
      let endIdx = -1;
      for (let i = 0; i < numDays; i++) {
        const dayDate = addDays(startDate, i);
        if (event.startTime <= dayDate && event.endTime > dayDate) {
          if (startIdx === -1) startIdx = i;
          endIdx = i;
        }
      }
      if (startIdx !== -1 && endIdx !== -1)
        items.push({ event, startDayIndex: startIdx, endDayIndex: endIdx });
    });

  const rows: EventPosition[][] = [];
  for (const item of items) {
    let placed = false;
    for (const row of rows) {
      const last = row[row.length - 1];
      if (item.startDayIndex > last.endDayIndex) {
        row.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) rows.push([item]);
  }
  return rows;
}

type AllDayEventsHeaderProps = {
  rows: EventPosition[][];
  startDate: Date;
  numDays: number;
  columnWidth: number;
};

export default function AllDayEventsHeader({
  rows,
  startDate,
  numDays,
  columnWidth,
}: AllDayEventsHeaderProps) {
  const rowHeight = ROW_HEIGHT;
  const padding = HEADER_PADDING;
  const headerHeight = calculateAllDayHeaderHeight(rows.length);

  return (
    <View
      style={{
        position: "absolute",
        top: STICKY_HEADER_HEIGHT,
        left: 0,
        right: 0,
        height: headerHeight,
        borderBottomWidth: 1,
        backgroundColor: "gray",
        borderBottomColor: "lightgray",
        paddingHorizontal: 4,
        paddingVertical: padding,
      }}
    >
      {rows.map((row, rowIdx) => (
        <View
          key={rowIdx}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: padding + rowIdx * rowHeight,
          }}
        >
          {row.map((item) => {
            const { event, startDayIndex, endDayIndex } = item;
            const eventLeft =
              TIME_GUTTER_WIDTH + columnWidth * startDayIndex + 2;
            const eventWidth = Math.max(
              24,
              columnWidth * (endDayIndex - startDayIndex + 1) - 6,
            );
            return (
              <AllDayEventBlock
                key={event.id}
                event={event}
                eventLeft={eventLeft}
                eventWidth={eventWidth}
                rowHeight={rowHeight}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}
