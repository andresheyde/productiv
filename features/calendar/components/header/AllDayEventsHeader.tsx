import { addDays, startOfDay } from "date-fns";
import { Text, View } from "react-native";
import {
    ALL_DAY_EVENTS_HEADER_HEIGHT,
    STICKY_HEADER_HEIGHT,
    TIME_GUTTER_WIDTH
} from "../../layout/calendarLayout";
import { CalendarEvent } from "../../types";

type AllDayEventsHeaderProps = {
  events: CalendarEvent[];
  startDate: Date;
  numDays: number;
  columnWidth: number;
};

export default function AllDayEventsHeader({
  events,
  startDate,
  numDays,
  columnWidth,
}: AllDayEventsHeaderProps) {
  const allDayEvents = events.filter((e) => e.allDay);

  if (allDayEvents.length === 0) {
    return (
      <View
        style={{
          position: "absolute",
          top: STICKY_HEADER_HEIGHT,
          left: 0,
          right: 0,
          height: ALL_DAY_EVENTS_HEADER_HEIGHT,
          borderBottomWidth: 1,
          borderBottomColor: "lightgray",
        }}
      />
    );
  }

  const startOfRange = startOfDay(startDate);
  const endOfRange = addDays(startOfRange, numDays - 1);

  // For each column, figure out which all-day events span that day
  const eventsByDay: Map<number, CalendarEvent[]> = new Map();

  for (let i = 0; i < numDays; i++) {
    const currentDay = addDays(startOfRange, i);
    const spanningEvents = allDayEvents.filter((event) => {
      const eventStart = startOfDay(event.startTime);
      const eventEnd = startOfDay(event.endTime);
      return currentDay >= eventStart && currentDay <= eventEnd;
    });
    if (spanningEvents.length > 0) {
      eventsByDay.set(i, spanningEvents);
    }
  }

  // Collect unique event groups across days
  const eventRowMap: Map<
    string,
    { event: CalendarEvent; startDayIndex: number; endDayIndex: number }
  > = new Map();

  allDayEvents.forEach((event) => {
    const eventStart = startOfDay(event.startTime);
    const eventEnd = startOfDay(event.endTime);

    let startIdx = -1;
    let endIdx = -1;

    // Check if event intersects the visible range at all
    if (eventEnd > startOfRange && eventStart <= endOfRange) {
      for (let i = 0; i < numDays; i++) {
        const dayDate = addDays(startOfRange, i);
        const nextDayDate = addDays(dayDate, 1);

        // Event spans this day if: event starts on or before this day AND event ends after this day starts
        if (eventStart <= dayDate && eventEnd > dayDate) {
          if (startIdx === -1) startIdx = i;
          endIdx = i;
        }
      }
    }

    // Only add to map if event intersects the visible range
    if (startIdx !== -1 && endIdx !== -1) {
      eventRowMap.set(event.id, {
        event,
        startDayIndex: startIdx,
        endDayIndex: endIdx,
      });
    }
  });

  // Sort events by start day, then by title
  const sortedEvents = Array.from(eventRowMap.values()).sort(
    (a, b) =>
      a.startDayIndex - b.startDayIndex ||
      (a.event.title || "").localeCompare(b.event.title || ""),
  );

  // Show up to 2 events, rest as "+X more"
  const displayedEvents = sortedEvents.slice(0, 2);
  const moreCount = Math.max(0, sortedEvents.length - 2);

  return (
    <View
      style={{
        position: "absolute",
        top: STICKY_HEADER_HEIGHT,
        left: 0,
        right: 0,
        height: ALL_DAY_EVENTS_HEADER_HEIGHT,
        borderBottomWidth: 1,
        borderBottomColor: "lightgray",
        paddingHorizontal: 4,
        paddingVertical: 4,
      }}
    >
      {displayedEvents.map((item, rowIdx) => {
        const { event, startDayIndex, endDayIndex } = item;
        const eventWidth = columnWidth * (endDayIndex - startDayIndex + 1) - 4;
        const eventLeft = TIME_GUTTER_WIDTH + columnWidth * startDayIndex + 2;

        return (
          <View
            key={event.id}
            style={{
              position: "absolute",
              top: rowIdx * 20 + 4,
              left: eventLeft,
              width: eventWidth,
              height: 16,
              backgroundColor: "lightblue",
              borderRadius: 4,
              paddingHorizontal: 4,
              overflow: "hidden",
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                fontSize: 11,
                fontWeight: "500",
                color: "black",
              }}
            >
              {event.title || "Event"}
            </Text>
          </View>
        );
      })}

      {moreCount > 0 && (
        <Text
          style={{
            position: "absolute",
            bottom: 4,
            left: TIME_GUTTER_WIDTH + 4,
            fontSize: 11,
            fontWeight: "600",
            color: "gray",
          }}
        >
          +{moreCount} more
        </Text>
      )}
    </View>
  );
}
