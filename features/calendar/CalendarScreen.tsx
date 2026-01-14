import * as Crypto from 'expo-crypto';
import { useState } from "react";
import { ScrollView, useWindowDimensions } from "react-native";
import EventEditorPopup from "./components/events/EventEditorPopup";
import GridCanvas from "./components/grid/GridCanvas";
import StickyHeader from "./components/header/StickyHeader";
import { DEFAULT_GRID_HEIGHT, TIME_GUTTER_WIDTH, xToDayIndex, yToMinutes } from "./layout/calendarLayout";
import { CalendarEvent } from "./types";

export default function CalendarScreen() {
    const numDays = 7;
    const columnWidth = (useWindowDimensions().width - TIME_GUTTER_WIDTH)/numDays;
    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
    const [events, setEvents] = useState(testEvents)

  return (<>
    <StickyHeader startDate={new Date()} numDays={numDays} columnWidth={columnWidth}/>
    <ScrollView style={{ flex: 1 }}>
        <GridCanvas numDays={numDays} columnWidth={columnWidth} events={events} selectedEvent={selectedEvent}
          onEventBlockPress={onEventBlockPress} onEventsLayerEmptyPress={onEventsLayerEmptyPress} onEventsLayerLongPress={onEventsLayerLongPress}
        />
    </ScrollView>
    {selectedEvent && <EventEditorPopup selectedEvent={selectedEvent} />}
  </>);

  function onEventBlockPress(event: CalendarEvent) {
    console.log(`EventBlockPress logged: event.id=${event.id}`);
    setSelectedEvent(event);
  }

  function onEventsLayerEmptyPress() {
    console.log(`EventsLayerEmptyPress logged`);
    setSelectedEvent(null);
  }

  function onEventsLayerLongPress(x: number, y: number) {
    console.log(`EventsLayerLongPress logged: (${x}, ${y})`)
    const clampedY = Math.max(Math.min(y, DEFAULT_GRID_HEIGHT), 0);
    const startMinute = Math.floor(yToMinutes(clampedY)/5)*5;
    const dayIndex = xToDayIndex(x, numDays, columnWidth);
    const newEvent: CalendarEvent = {
      id: Crypto.randomUUID(),
      dayIndex: dayIndex,
      startMinute: startMinute,
      endMinute: startMinute + 60,
      title: 'New Event'
    }
    setEvents([...events, newEvent])
  }
}

const testEvents: CalendarEvent[] = [
  {
    id: '1',
    dayIndex: 0,
    startMinute: 0,
    endMinute: 60,
    title: 'First event'
  },
  {
    id: '2',
    dayIndex: 1,
    startMinute: 0,
    endMinute: 60,
    title: 'second event'
  },
  {
    id: '3',
    dayIndex: 3,
    startMinute: 75,
    endMinute: 1200,
    title: 'third event'
  },
  { id: '4',
    dayIndex: 6,
    startMinute: 1380,
    endMinute: 1440,
    title: 'fourth event'
  }
]