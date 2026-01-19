import { addDays, subDays } from "date-fns";
import * as Crypto from "expo-crypto";
import { useState } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import {
  Gesture,
  GestureDetector,
  MouseButton,
} from "react-native-gesture-handler";
import EventEditorPopup from "./components/events/EventEditorPopup";
import GridCanvas from "./components/grid/GridCanvas";
import StickyHeader from "./components/header/StickyHeader";
import useDeviceCalendars from "./components/hooks/useDeviceCalendars";
import {
  TIME_GUTTER_WIDTH,
  xToDayIndex,
  yToMinutes,
} from "./layout/calendarLayout";
import { CalendarEvent } from "./types";

export default function CalendarScreen() {
  const numDays = 7;
  const columnWidth =
    (useWindowDimensions().width - TIME_GUTTER_WIDTH) / numDays;
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null,
  );
  const [events, setEvents] = useState(testEvents);
  const today = new Date();
  const [leftDate, setLeftDate] = useState(today);
  const { calendars, loading, error, blocked, refresh } = useDeviceCalendars();
  const gesture = Gesture.Exclusive(
    Gesture.Fling()
      .direction(MouseButton.LEFT)
      .onEnd(() => onFling(MouseButton.LEFT)),
    Gesture.Fling()
      .direction(MouseButton.RIGHT)
      .onEnd(() => onFling(MouseButton.RIGHT)),
  );

  return (
    <>
      <GestureDetector gesture={gesture}>
        <View style={{ flex: 1 }}>
          <StickyHeader
            today={today}
            startDate={leftDate}
            numDays={numDays}
            columnWidth={columnWidth}
          />
          <ScrollView style={{ flex: 1 }}>
            <GridCanvas
              numDays={numDays}
              columnWidth={columnWidth}
              events={events}
              selectedEvent={selectedEvent}
              onEventBlockPress={onEventBlockPress}
              onEventsLayerEmptyPress={onEventsLayerEmptyPress}
              onEventsLayerLongPress={onEventsLayerLongPress}
            />
          </ScrollView>
        </View>
      </GestureDetector>
      {selectedEvent && <EventEditorPopup selectedEvent={selectedEvent} />}
    </>
  );

  function onEventBlockPress(event: CalendarEvent) {
    setSelectedEvent(event);
  }

  function onEventsLayerEmptyPress() {
    setSelectedEvent(null);
  }

  function onFling(direction: MouseButton) {
    if (direction === MouseButton.LEFT) {
      setLeftDate(subDays(leftDate, numDays));
      return;
    }
    if (direction === MouseButton.RIGHT) {
      setLeftDate(addDays(leftDate, numDays));
      return;
    }
    throw new Error(`Unrecognized fling direction: ${direction}`);
  }

  function onEventsLayerLongPress(x: number, y: number) {
    const startMinute = Math.floor(yToMinutes(y) / 5) * 5;
    const dayIndex = xToDayIndex(x, numDays, columnWidth);
    const newEvent: CalendarEvent = {
      id: Crypto.randomUUID(),
      dayIndex: dayIndex,
      startMinute: startMinute,
      endMinute: startMinute + 60,
      title: "New Event",
    };
    setEvents((prev) => [...prev, newEvent]);
  }
}

const testEvents: CalendarEvent[] = [
  {
    id: "1",
    dayIndex: 0,
    startMinute: 0,
    endMinute: 60,
    title: "First event",
  },
  {
    id: "2",
    dayIndex: 1,
    startMinute: 0,
    endMinute: 60,
    title: "second event",
  },
  {
    id: "3",
    dayIndex: 3,
    startMinute: 75,
    endMinute: 1200,
    title: "third event",
  },
  {
    id: "4",
    dayIndex: 6,
    startMinute: 1380,
    endMinute: 1440,
    title: "fourth event",
  },
];
