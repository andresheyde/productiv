import {
    addDays,
    addMinutes,
    isAfter,
    isBefore,
    startOfDay,
    startOfWeek,
    subDays,
} from "date-fns";
import * as Crypto from "expo-crypto";
import { useMemo, useState } from "react";
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
import useDeviceEvents from "./components/hooks/useDeviceEvents";
import { TIME_GUTTER_WIDTH, xAndYToDate } from "./layout/calendarLayout";
import { CalendarEvent } from "./types";

export default function CalendarScreen() {
  const weekStartDay = 0;
  const numDays = 7;
  const today = new Date();
  const columnWidth =
    (useWindowDimensions().width - TIME_GUTTER_WIDTH) / numDays;

  const [leftDate, setLeftDate] = useState(getDefaultLeftDate());
  const rightDate = addDays(leftDate, numDays);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null,
  );

  const {
    deviceCalendars,
    calendarsLoading,
    calendarsError,
    calendarsBlocked,
    calendarsRefresh,
  } = useDeviceCalendars();
  const {
    deviceEvents,
    eventsLoading,
    eventsError,
    eventsBlocked,
    eventsRefresh,
  } = useDeviceEvents(
    deviceCalendars
      .map((calendar) => calendar.id)
      .slice()
      .sort(),
    leftDate,
    rightDate,
  );
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const mergedEvents = useMemo(() => {
    return [...events, ...deviceEvents];
  }, [events, deviceEvents]);

  const timedEvents = useMemo(() => {
    return mergedEvents.filter((event) => !event.allDay);
  }, [mergedEvents]);

  const gesture = Gesture.Exclusive(
    Gesture.Fling()
      .runOnJS(true)
      .direction(MouseButton.LEFT)
      .onEnd(() => onFling(MouseButton.LEFT)),
    Gesture.Fling()
      .runOnJS(true)
      .direction(MouseButton.RIGHT)
      .onEnd(() => onFling(MouseButton.RIGHT)),
  );

  function getDefaultLeftDate() {
    return startOfDay(
      numDays % 7 === 0
        ? startOfWeek(today, { weekStartsOn: weekStartDay })
        : today,
    );
  }

  return (
    <>
      <GestureDetector gesture={gesture}>
        <View style={{ flex: 1 }}>
          <StickyHeader
            today={today}
            startDate={leftDate}
            numDays={numDays}
            columnWidth={columnWidth}
            events={mergedEvents}
            onTodayPress={() => setLeftDate(getDefaultLeftDate())}
            onPrevPress={() => setLeftDate((prev) => subDays(prev, numDays))}
            onNextPress={() => setLeftDate((prev) => addDays(prev, numDays))}
          />
          <ScrollView style={{ flex: 1 }}>
            <GridCanvas
              numDays={numDays}
              leftDate={leftDate}
              rightDate={rightDate}
              today={today}
              columnWidth={columnWidth}
              events={timedEvents}
              selectedEvent={selectedEvent}
              onEventBlockPress={onEventBlockPress}
              onEventsLayerEmptyPress={onEventsLayerEmptyPress}
              onEventsLayerLongPressBegin={onEventsLayerLongPressBegin}
              onEventsLayerLongPressEnd={onEventsLayerLongPressEnd}
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

  function onEventsLayerEmptyPress(x: number, y: number) {
    if (selectedEvent) {
      setSelectedEvent(null);
      return;
    }
    const startTime = xAndYToDate(x, y, numDays, columnWidth, leftDate);
    const newEvent: CalendarEvent = {
      id: Crypto.randomUUID(),
      startTime: startTime,
      endTime: addMinutes(startTime, 60),
      title: "New Event",
    };
    setEvents((prev) => [...prev, newEvent]);
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

  function onEventsLayerLongPressBegin(x: number, y: number) {
    const startTime = xAndYToDate(x, y, numDays, columnWidth, leftDate);
    const newEvent: CalendarEvent = {
      id: Crypto.randomUUID(),
      startTime: startTime,
      endTime: addMinutes(startTime, 5),
      title: "New Event",
    };
    setSelectedEvent(newEvent);
    setEvents((prev) => [...prev, newEvent]);
  }

  function onEventsLayerLongPressEnd(x: number, y: number) {
    const endTime = xAndYToDate(x, y, numDays, columnWidth, leftDate);
    const newEvent: CalendarEvent = {
      id: selectedEvent!.id,
      startTime: isBefore(selectedEvent!.startTime, endTime)
        ? selectedEvent!.startTime
        : endTime,
      endTime: isAfter(endTime, selectedEvent!.startTime)
        ? endTime
        : selectedEvent!.startTime,
      title: "New Event",
    };
    setEvents((prev) => [
      ...prev.filter((event) => event !== selectedEvent),
      newEvent,
    ]);
  }
}

const testEvents: CalendarEvent[] = [
  {
    id: "1",
    startTime: new Date(2026, 0, 18, 12, 30),
    endTime: new Date(2026, 0, 19, 12, 45),
    title: "First event",
  },
  {
    id: "2",
    startTime: new Date(2026, 0, 20, 2, 0),
    endTime: new Date(2026, 0, 20, 8, 45),
    title: "second event",
  },
  {
    id: "3",
    startTime: new Date(2026, 0, 21, 21, 0),
    endTime: new Date(2026, 0, 21, 23, 0),
    title: "third event",
  },
  {
    id: "4",
    startTime: new Date(2026, 0, 24, 0, 0),
    endTime: new Date(2026, 0, 25, 0, 0),
    title: "fourth event",
  },
];
