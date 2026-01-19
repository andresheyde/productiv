import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { TIME_GUTTER_WIDTH, minutesToY } from "../../layout/calendarLayout";
import { CalendarEvent } from "../../types";
import EventBlock from "./EventBlock";

type EventsLayerProps = {
  events: CalendarEvent[];
  numDays: number;
  columnWidth: number;
  selectedEvent: CalendarEvent | null;
  onEventBlockPress: (arg0: CalendarEvent) => void;
  onEventsLayerEmptyPress: () => void;
  onEventsLayerLongPress: (arg0: number, arg1: number) => void;
};

export default function EventsLayer({
  events,
  numDays,
  columnWidth,
  selectedEvent,
  onEventBlockPress,
  onEventsLayerEmptyPress,
  onEventsLayerLongPress,
}: EventsLayerProps) {
  const gesture = Gesture.Race(
    Gesture.Tap().runOnJS(true).onEnd(onEventsLayerEmptyPress),
    Gesture.LongPress()
      .runOnJS(true)
      .onEnd((press) => {
        onEventsLayerLongPress(press.x, press.y);
      }),
  );

  return (
    <View
      style={{
        position: "absolute",
        left: TIME_GUTTER_WIDTH,
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
          return (
            event.dayIndex >= 0 &&
            event.dayIndex < numDays &&
            event.startMinute >= 0 &&
            event.startMinute < event.endMinute &&
            event.endMinute <= 1440
          );
        })
        .map((event) => {
          const eventLengthMinutes = event.endMinute - event.startMinute;

          return (
            <View
              key={event.id}
              style={{
                position: "absolute",
                left: event.dayIndex * columnWidth,
                width: columnWidth,
                top: minutesToY(event.startMinute),
                height: minutesToY(eventLengthMinutes),
              }}
            >
              <EventBlock
                event={event}
                selectedEvent={selectedEvent}
                onEventBlockPress={onEventBlockPress}
              />
            </View>
          );
        })}
    </View>
  );
}
