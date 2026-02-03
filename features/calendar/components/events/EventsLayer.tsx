import {
  addDays,
  areIntervalsOverlapping,
  differenceInCalendarDays,
  differenceInMinutes,
  isAfter,
  isBefore,
  isEqual,
  startOfDay,
} from "date-fns";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { dateToY, minutesToY } from "../../layout/calendarLayout";
import { CalendarEvent } from "../../types";
import EventBlock from "./EventBlock";

type EventsLayerProps = {
  events: CalendarEvent[];
  leftDate: Date;
  numDays: number;
  columnWidth: number;
  selectedEvent: CalendarEvent | null;
  onEventBlockPress: (arg0: CalendarEvent) => void;
  onEventsLayerEmptyPress: (arg0: number, arg1: number) => void;
};

export default function EventsLayer({
  events,
  leftDate,
  numDays,
  columnWidth,
  selectedEvent,
  onEventBlockPress,
  onEventsLayerEmptyPress,
}: EventsLayerProps) {
  const rightDate = addDays(leftDate, numDays);
  const gesture = Gesture.Tap()
    .runOnJS(true)
    .onEnd((press) => {
      onEventsLayerEmptyPress(press.x, press.y);
    });

  function addEventBlock(
    event: CalendarEvent,
    blockStartTime: Date,
    blockEndTime: Date,
    blockIndex: number,
  ) {
    if (
      isBefore(blockStartTime, leftDate) ||
      isAfter(blockStartTime, rightDate) ||
      isEqual(blockStartTime, blockEndTime)
    ) {
      return;
    }
    return (
      <View
        key={`${event.id}-${blockIndex}`}
        style={{
          position: "absolute",
          left:
            differenceInCalendarDays(blockStartTime, leftDate) * columnWidth,
          width: columnWidth,
          top: dateToY(blockStartTime),
          height: minutesToY(differenceInMinutes(blockEndTime, blockStartTime)),
        }}
      >
        <EventBlock
          event={event}
          selectedEvent={selectedEvent}
          onEventBlockPress={onEventBlockPress}
        />
      </View>
    );
  }

  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
      }}
    >
      <GestureDetector gesture={gesture}>
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
          }}
        />
      </GestureDetector>
      {events
        .filter((event) => {
          return areIntervalsOverlapping(
            {
              start: event.startTime,
              end: event.endTime,
            },
            {
              start: leftDate,
              end: rightDate,
            },
          );
        })
        .map((event) => {
          const numEventDays =
            differenceInCalendarDays(event.endTime, event.startTime) + 1;
          if (numEventDays === 1) {
            return addEventBlock(event, event.startTime, event.endTime, 0);
          }
          return Array.from(
            {
              length: numEventDays,
            },
            (_, i) => {
              const startOfDate = startOfDay(
                new Date(addDays(event.startTime, i)),
              );
              const endOfDate = startOfDay(
                new Date(addDays(event.startTime, i + 1)),
              );
              if (i === 0) {
                return addEventBlock(event, event.startTime, endOfDate, i);
              } else if (i === numEventDays - 1) {
                return addEventBlock(event, startOfDate, event.endTime, i);
              } else {
                return addEventBlock(event, startOfDate, endOfDate, i);
              }
            },
          );
        })}
    </View>
  );
}
