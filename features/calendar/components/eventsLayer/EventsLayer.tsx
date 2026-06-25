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
import {
  CalendarTimeWindow,
  dateToY,
  minutesToY,
} from "../../layout/calendarLayout";
import { CalendarEvent } from "../../types";
import EventBlock from "./EventBlock";

type EventsLayerProps = {
  events: CalendarEvent[];
  leftDate: Date;
  numDays: number;
  columnWidth: number;
  timeWindow: CalendarTimeWindow;
  selectedEvent: CalendarEvent | null;
  onEventBlockPress: (arg0: CalendarEvent) => void;
  onEventsLayerEmptyPress: (arg0: number, arg1: number) => void;
  onEventsLayerLongPressBegin: (arg0: number, arg1: number) => void;
  onEventsLayerLongPressEnd: (arg0: number, arg1: number) => void;
};

export default function EventsLayer({
  events,
  leftDate,
  numDays,
  columnWidth,
  timeWindow,
  selectedEvent,
  onEventBlockPress,
  onEventsLayerEmptyPress,
  onEventsLayerLongPressBegin,
  onEventsLayerLongPressEnd,
}: EventsLayerProps) {
  const rightDate = addDays(leftDate, numDays);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onStart((press) => {
      onEventsLayerLongPressBegin(press.x, press.y);
    })
    .onEnd((press) => {
      onEventsLayerLongPressEnd(press.x, press.y);
    })
    .activateAfterLongPress(500);
  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((press) => {
      onEventsLayerEmptyPress(press.x, press.y);
    });

  const gesture = Gesture.Simultaneous(tap, pan);

  function addEventBlock(
    event: CalendarEvent,
    blockStartTime: Date,
    blockEndTime: Date,
  ) {
    const visibleStartTime = getVisibleDayTime(blockStartTime, timeWindow.startHour);
    const visibleEndTime = getVisibleDayTime(blockStartTime, timeWindow.endHour);
    const clippedStartTime = isBefore(blockStartTime, visibleStartTime)
      ? visibleStartTime
      : blockStartTime;
    const clippedEndTime = isAfter(blockEndTime, visibleEndTime)
      ? visibleEndTime
      : blockEndTime;

    if (
      isBefore(clippedStartTime, leftDate) ||
      isAfter(clippedStartTime, rightDate) ||
      !isBefore(clippedStartTime, clippedEndTime) ||
      isEqual(clippedStartTime, clippedEndTime)
    ) {
      return;
    }

    return (
      <View
        key={`${event.id}:${clippedStartTime.toISOString()}`}
        style={{
          position: "absolute",
          left:
            differenceInCalendarDays(clippedStartTime, leftDate) * columnWidth,
          width: columnWidth,
          top: dateToY(clippedStartTime, undefined, timeWindow.startHour),
          height: minutesToY(differenceInMinutes(clippedEndTime, clippedStartTime)),
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
            return addEventBlock(event, event.startTime, event.endTime);
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
                return addEventBlock(event, event.startTime, endOfDate);
              } else if (i === numEventDays - 1) {
                return addEventBlock(event, startOfDate, event.endTime);
              } else {
                return addEventBlock(event, startOfDate, endOfDate);
              }
            },
          );
        })}
    </View>
  );
}

function getVisibleDayTime(date: Date, hour: number) {
  const dayTime = startOfDay(date);
  dayTime.setHours(hour, 0, 0, 0);
  return dayTime;
}
